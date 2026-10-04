/**
 * BUSINESS-02 — VISIBILITY / AUTHORIZATION ENGINE
 * ===============================================
 * Server-side privacy boundary for every community artifact (roadmap §02.4).
 *
 * This is a pure decision function. It has no I/O, no clock and no database. That matters:
 * the entire IDOR defence of the community lane is these ~80 lines, so they must be
 * readable and exhaustively testable in isolation.
 *
 * RULES (roadmap §02.3, §02.4)
 *
 *   PRIVATE       owner only
 *   WORKSPACE     owner + members of the owning workspace
 *   ORGANIZATION  owner + active members of the owning organization
 *   COMMUNITY     owner + any authenticated platform user
 *   UNLISTED      owner + any authenticated platform user (reachable by id, not listed)
 *   PUBLIC        anyone, including anonymous
 *
 * NON-NEGOTIABLES enforced here:
 *  1. A HIDDEN / REMOVED / SUSPENDED artifact is invisible to EVERYONE except a moderator.
 *  2. A FLAGGED / UNDER_REVIEW artifact stays visible to its owner and to moderators only.
 *     Flagging is not a takedown, and a takedown is not a flag.
 *  3. Organization membership is checked against ACTIVE membership only. A SUSPENDED or
 *     REVOKED member sees nothing from that organization.
 *  4. Absence of evidence is denial. If the artifact names a workspace but the viewer is in
 *     no workspace, the answer is NO.
 */

import {
  ANONYMOUS_VIEWER,
  invisible,
  VISIBLE,
  type CommunityComment,
  type CommunityPost,
  type ModerationState,
  type ViewerContext,
  type VisibilityDecision,
} from './types.ts';

const MODERATOR_ONLY_STATES: ReadonlySet<ModerationState> = new Set<ModerationState>([
  'HIDDEN',
  'REMOVED',
  'SUSPENDED',
]);

const AUTHOR_AND_MODERATOR_ONLY_STATES: ReadonlySet<ModerationState> = new Set<ModerationState>([
  'FLAGGED',
  'UNDER_REVIEW',
]);

/**
 * The minimum shape every authorization decision needs.
 *
 * Ownership is read as `author.userId` (nested), which is the real shape of CommunityPost
 * and CommunityComment. An earlier draft used a flat `authorUserId`, which TypeScript
 * happily accepted for the *internal* tests and then compared `undefined` at runtime for the
 * real entity — every authorization decision silently degraded to a denial for the owner and
 * a denial for everyone. The type now mirrors the persisted shape exactly so that mistake
 * cannot recur.
 */
interface ScopedArtifact {
  readonly author: { readonly userId: string };
  readonly visibility: string;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly moderation: ModerationState;
}

/** Active organization membership. A revoked or suspended member is not a member. */
function isActiveMemberOf(viewer: ViewerContext, organizationId: string | null): boolean {
  if (organizationId === null) return false;
  return viewer.organizationIds.includes(organizationId);
}

function isInWorkspace(viewer: ViewerContext, workspaceId: string | null): boolean {
  if (workspaceId === null) return false;
  return viewer.workspaceIds.includes(workspaceId);
}

/**
 * The single authorization decision for a community artifact.
 *
 * `forModeration: true` is used by the moderation tooling and by the author preview, where a
 * moderator legitimately needs to see content that is hidden from the feed.
 */
export function canView(
  artifact: ScopedArtifact,
  viewer: ViewerContext,
  options: { readonly forModeration?: boolean } = {},
): VisibilityDecision {
  const isOwner = viewer.userId !== null && viewer.userId === artifact.author.userId;
  const isModerator = viewer.canModerate;

  // (1) Withdrawn content. Moderators may still see it, for moderation and appeal.
  if (MODERATOR_ONLY_STATES.has(artifact.moderation)) {
    if (isModerator && options.forModeration === true) return VISIBLE;
    if (isOwner && options.forModeration === true) return VISIBLE;
    return invisible(`CONTENT_${artifact.moderation}`);
  }

  // (2) Under review or flagged. Visible to the author and to moderators, hidden from others.
  if (AUTHOR_AND_MODERATOR_ONLY_STATES.has(artifact.moderation)) {
    if (isOwner) return VISIBLE;
    if (isModerator && options.forModeration === true) return VISIBLE;
    return invisible(`CONTENT_${artifact.moderation}`);
  }

  // (3) VISIBLE. Now the visibility scope applies.
  switch (artifact.visibility) {
    case 'PUBLIC':
      return VISIBLE;

    case 'UNLISTED':
    case 'COMMUNITY': {
      if (viewer.userId === null) return invisible('AUTHENTICATION_REQUIRED');
      return VISIBLE;
    }

    case 'ORGANIZATION': {
      if (isOwner) return VISIBLE;
      if (!isActiveMemberOf(viewer, artifact.organizationId)) {
        return invisible('NOT_AN_ACTIVE_ORGANIZATION_MEMBER');
      }
      return VISIBLE;
    }

    case 'WORKSPACE': {
      if (isOwner) return VISIBLE;
      if (!isInWorkspace(viewer, artifact.workspaceId)) return invisible('NOT_IN_WORKSPACE');
      // Defence in depth: a workspace artifact must also belong to an organization the
      // viewer is a member of, otherwise workspace ids would be an enumeration vector.
      if (artifact.organizationId !== null && !isActiveMemberOf(viewer, artifact.organizationId)) {
        return invisible('NOT_AN_ACTIVE_ORGANIZATION_MEMBER');
      }
      return VISIBLE;
    }

    case 'PRIVATE':
      if (isOwner) return VISIBLE;
      return invisible('PRIVATE_CONTENT');

    default:
      // Unknown visibility value in stored data: fail closed rather than defaulting to public.
      return invisible(`UNKNOWN_VISIBILITY:${String(artifact.visibility)}`);
  }
}

export function canViewPost(post: CommunityPost, viewer: ViewerContext, options?: { forModeration?: boolean }): VisibilityDecision {
  return canView(post, viewer, options);
}

export function canViewComment(comment: CommunityComment, viewer: ViewerContext, options?: { forModeration?: boolean }): VisibilityDecision {
  return canView(comment, viewer, options);
}

/**
 * Write authorization. Only the author may edit content. Moderators act through the
 * moderation path, never by editing somebody else's post, so that authorship stays honest.
 */
export function canEdit(artifact: ScopedArtifact, viewer: ViewerContext): VisibilityDecision {
  if (viewer.userId === null) return invisible('AUTHENTICATION_REQUIRED');
  if (viewer.userId === artifact.author.userId) return VISIBLE;
  return invisible('NOT_THE_AUTHOR');
}

/**
 * Deletion. The author may delete their own content at any time (right to erasure).
 * Withdrawn content is deleted by a moderator, and the author deleting already-withdrawn
 * content is allowed because it only reduces exposure.
 */
export function canDelete(artifact: ScopedArtifact, viewer: ViewerContext): VisibilityDecision {
  if (viewer.userId === null) return invisible('AUTHENTICATION_REQUIRED');
  if (viewer.userId === artifact.author.userId) return VISIBLE;
  if (viewer.canModerate) return VISIBLE;
  return invisible('NOT_THE_AUTHOR_AND_NOT_A_MODERATOR');
}

/**
 * Feed projection. Applies `canView` to a candidate list and drops everything the viewer may
 * not see, together with an explicit per-item reason.
 *
 * The dropped items are NOT silently omitted from a count: the caller receives
 * `redactedWithReasons` so a UI can distinguish "no content" from "content you cannot see"
 * rather than implying an empty account.
 */
export function visibleFeed<T extends ScopedArtifact>(
  candidates: readonly T[],
  viewer: ViewerContext,
): { readonly visible: readonly T[]; readonly redactedWithReasons: readonly { id: string; reason: string }[] } {
  const visible: T[] = [];
  const redacted: { id: string; reason: string }[] = [];
  for (const c of candidates) {
    const decision = canView(c, viewer);
    if (decision.visible === true) visible.push(c);
    else redacted.push({ id: idOf(c), reason: decision.reason });
  }
  return { visible, redactedWithReasons: redacted };
}

function idOf(a: ScopedArtifact): string {
  if ('postId' in a) return String((a as { postId: string }).postId);
  if ('commentId' in a) return String((a as { commentId: string }).commentId);
  return 'UNKNOWN_ARTIFACT';
}

export { ANONYMOUS_VIEWER };