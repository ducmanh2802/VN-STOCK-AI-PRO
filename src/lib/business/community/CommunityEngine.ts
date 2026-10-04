/**
 * BUSINESS-02 — COMMUNITY ENGINE
 * ==============================
 * Pure domain rules for the research/learning community. No I/O, no clock, no database.
 *
 * Enforces the roadmap's non-negotiables:
 *  §02.2 provenance is retained on every shared artifact
 *  §02.4 privacy is enforced server-side (via ./visibility.ts)
 *  §02.5 moderation is a closed, auditable state machine
 *  §02.6 content may not be presented as guaranteed financial advice
 *  §02.7 reputation is event-derived and never a truth signal
 */

import {
  MODERATION_TRANSITIONS,
  absent,
  type CommunityComment,
  type CommunityPost,
  type ContentLabel,
  type ModerationAction,
  type ModerationRecord,
  type ModerationState,
  type ProvenanceRef,
  type ReputationEvent,
  type ReputationEventKind,
  type ReportReason,
  type ViewerContext,
  type Visibility,
} from './types.ts';
import { canEdit, canView } from './visibility.ts';

export const COMMUNITY_VERSION = 'v1.0.0-business-02';

// ============================================================================
// PROHIBITED FINANCIAL CLAIMS (roadmap §05, §02.6)
// ============================================================================

/**
 * Phrases that would constitute an unsupported performance or advice claim.
 *
 * This is a conservative blocklist, and it is deliberately NOT presented as a complete
 * solution: a blocklist cannot decide whether prose is investment advice. Its purpose is to
 * stop the unambiguous cases ("guaranteed", "risk-free", "100% win rate") from ever being
 * published, while the mandatory `ContentLabel` carries the real burden of disclosure.
 * CommunityService also records that limitation.
 */
export const PROHIBITED_CLAIM_PATTERNS: readonly RegExp[] = Object.freeze([
  /guarantee[ds]?\s+(profit|return|gain|outcome)/i,
  /risk[-\s]?free/i,
  /100\s*%\s*(win|profit|success)/i,
  /cannot\s+lose/i,
  /assured\s+(profit|return|gain)/i,
  /sure\s+thing/i,
  /lợi\s+nhuận\s+chắc\s+chắn/i,
  /không\s+rủi\s+ro/i,
  /chắc\s+chắn\s+thắng/i,
  /kiếm\s+tiền\s+chắc\s+chắn/i,
]);

export type ClaimScan = {
  readonly ok: boolean;
  readonly violations: readonly string[];
};

/** Scan body + title for prohibited claims. Fail closed: any hit is a rejection. */
export function scanForProhibitedClaims(text: string): ClaimScan {
  const violations: string[] = [];
  for (const pattern of PROHIBITED_CLAIM_PATTERNS) {
    if (pattern.test(text)) violations.push(pattern.source);
  }
  return { ok: violations.length === 0, violations };
}

// ============================================================================
// VALIDATION
// ============================================================================

const MAX_TITLE = 200;
const MAX_BODY = 20_000;
const MAX_LABELS = 4;

/** Labels that adequately disclose an investment-relevant statement. */
const DISCLOSING_LABELS: ReadonlySet<ContentLabel> = new Set<ContentLabel>([
  'EDUCATIONAL',
  'RESEARCH',
  'PAPER_ONLY',
  'HYPOTHESIS',
  'PERSONAL_VIEW',
]);

export interface CreatePostInput {
  readonly postId: string;
  readonly authorUserId: string;
  readonly authorDisplayName: string;
  readonly authorOrganizationId: string | null;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly ContentLabel[];
  readonly visibility: Visibility;
  readonly workspaceId: string | null;
  readonly organizationId: string | null;
  readonly provenance: readonly ProvenanceRef[];
  readonly createdAt: string;
}

export class CommunityEngine {
  // ------------------------------------------------------------------ create

  static createPost(input: CreatePostInput): CommunityPost {
    if (input.postId.trim() === '') throw new Error('INVALID_POST_ID');
    if (input.authorUserId.trim() === '') throw new Error('INVALID_AUTHOR_ID');
    if (input.title.trim() === '') throw new Error('POST_TITLE_REQUIRED');
    if (input.title.length > MAX_TITLE) throw new Error('POST_TITLE_TOO_LONG');
    if (input.body.trim() === '') throw new Error('POST_BODY_REQUIRED');
    if (input.body.length > MAX_BODY) throw new Error('POST_BODY_TOO_LONG');
    if (input.labels.length > MAX_LABELS) throw new Error('TOO_MANY_LABELS');
    if (!Number.isNaN(Date.parse(input.createdAt)) === false) throw new Error('INVALID_CREATED_AT');

    const claim = scanForProhibitedClaims(`${input.title}\n${input.body}`);
    if (!claim.ok) throw new Error(`PROHIBITED_FINANCIAL_CLAIM:${claim.violations.join(',')}`);

    // Scope coherence: an organization/workspace scoped post must actually name one.
    if ((input.visibility === 'ORGANIZATION' || input.visibility === 'WORKSPACE') && input.organizationId === null) {
      throw new Error('ORGANIZATION_SCOPE_REQUIRED');
    }
    if (input.visibility === 'WORKSPACE' && input.workspaceId === null) {
      throw new Error('WORKSPACE_SCOPE_REQUIRED');
    }

    // Disclosure: investment-relevant content must carry at least one disclosing label.
    if (!investmentRelevant(input.body) && !investmentRelevant(input.title)) {
      // not investment content; no label required
    } else if (input.labels.length === 0) {
      throw new Error('CONTENT_LABEL_REQUIRED');
    } else if (!input.labels.some((l) => DISCLOSING_LABELS.has(l))) {
      throw new Error('CONTENT_LABEL_REQUIRED');
    }

    // Provenance: an author may not claim a research artifact they did not reference.
    for (const ref of input.provenance) {
      if (ref.kind === 'present' && ref.refId.trim() === '') throw new Error('INVALID_PROVENANCE_REF');
      if (ref.kind === 'absent' && ref.because.trim() === '') throw new Error('INVALID_PROVENANCE_REASON');
    }

    return {
      postId: input.postId,
      author: {
        userId: input.authorUserId,
        organizationId: input.authorOrganizationId,
        displayName: input.authorDisplayName,
      },
      title: input.title,
      body: input.body,
      labels: [...input.labels],
      visibility: input.visibility,
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      moderation: 'VISIBLE',
      provenance: [...input.provenance],
      version: 1,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }

  // ------------------------------------------------------------------ update

  /**
   * Update a post. §02.2 content versioning: an edit that changes the body, title, labels or
   * provenance creates a NEW VERSION rather than overwriting. The caller is responsible for
   * persisting the prior version; this engine guarantees the version number increments and
   * refuses an edit that would silently drop provenance.
   */
  static updatePost(
    post: CommunityPost,
    viewer: ViewerContext,
    change: { readonly title?: string; readonly body?: string; readonly labels?: readonly ContentLabel[]; readonly provenance?: readonly ProvenanceRef[] },
    at: string,
  ): CommunityPost {
    const decision = canEdit(post, viewer);
    if (decision.visible === false) throw new Error(`FORBIDDEN:${decision.reason}`);
    if (post.moderation !== 'VISIBLE') throw new Error('CONTENT_NOT_EDITABLE');

    const title = change.title ?? post.title;
    const body = change.body ?? post.body;
    if (title.trim() === '' || body.trim() === '') throw new Error('POST_CONTENT_REQUIRED');
    if (title.length > MAX_TITLE || body.length > MAX_BODY) throw new Error('POST_CONTENT_TOO_LONG');

    const claim = scanForProhibitedClaims(`${title}\n${body}`);
    if (!claim.ok) throw new Error(`PROHIBITED_FINANCIAL_CLAIM:${claim.violations.join(',')}`);

    const labels = change.labels ?? post.labels;
    if (labels.length > MAX_LABELS) throw new Error('TOO_MANY_LABELS');
    if (investmentRelevant(body) && labels.length === 0) throw new Error('CONTENT_LABEL_REQUIRED');

    const provenance = change.provenance ?? post.provenance;
    // Provenance may be ADDED to but never silently removed: dropping a research reference
    // is how a verified post turns into an unsourced claim.
    const before = new Set(post.provenance.map(provenanceKey));
    for (const ref of provenance) {
      if (!before.has(provenanceKey(ref))) continue;
      before.delete(provenanceKey(ref));
    }
    if (before.size > 0) throw new Error('PROVENANCE_REMOVAL_FORBIDDEN');

    return {
      ...post,
      title,
      body,
      labels: [...labels],
      provenance: [...provenance],
      version: post.version + 1,
      updatedAt: at,
    };
  }

  // ------------------------------------------------------------------ moderation

  static canModerateTransition(from: ModerationState, to: ModerationState): boolean {
    return MODERATION_TRANSITIONS[from].includes(to);
  }

  /**
   * Apply a moderation action. Illegal transitions throw. Every action produces an
   * immutable ModerationRecord carrying the moderator, so moderation is auditable (§02.5).
   */
  static moderate(
    post: CommunityPost,
    viewer: ViewerContext,
    input: { readonly action: ModerationAction; readonly reason: string; readonly correlationId: string | null; readonly at: string },
  ): { readonly post: CommunityPost; readonly record: ModerationRecord } {
    if (!viewer.canModerate) throw new Error('FORBIDDEN:NOT_A_MODERATOR');
    if (viewer.userId === null) throw new Error('FORBIDDEN:NOT_A_MODERATOR');
    if (input.reason.trim() === '') throw new Error('MODERATION_REASON_REQUIRED');

    const to = targetState(input.action, post.moderation);
    if (!CommunityEngine.canModerateTransition(post.moderation, to)) {
      throw new Error(`INVALID_MODERATION_TRANSITION:${post.moderation}->${to}`);
    }

    const record: ModerationRecord = Object.freeze({
      moderationId: `mod_${post.postId}_${post.version}_${input.at}`,
      targetType: 'POST',
      targetId: post.postId,
      action: input.action,
      from: post.moderation,
      to,
      moderatorUserId: viewer.userId,
      reason: input.reason,
      correlationId: input.correlationId,
      occurredAt: input.at,
    });

    return { post: { ...post, moderation: to, updatedAt: input.at }, record };
  }

  /**
   * Flag content. Any authenticated user may flag; only a moderator may act on the flag.
   * Flagging does NOT hide content — a report is not a takedown, and treating it as one lets
   * any user hide anybody's post by reporting it.
   */
  static flag(
    post: CommunityPost,
    reporterUserId: string,
    reason: ReportReason,
    at: string,
    detail = '',
  ): { readonly post: CommunityPost; readonly record: ModerationRecord } {
    if (reporterUserId.trim() === '') throw new Error('INVALID_REPORTER_ID');
    if (post.moderation !== 'VISIBLE') throw new Error('CONTENT_ALREADY_UNDER_REVIEW');

    const record: ModerationRecord = Object.freeze({
      moderationId: `flag_${post.postId}_${reporterUserId}_${at}`,
      targetType: 'POST',
      targetId: post.postId,
      action: 'FLAG',
      from: 'VISIBLE',
      to: 'FLAGGED',
      moderatorUserId: reporterUserId,
      reason: `${reason}:${detail}`,
      correlationId: null,
      occurredAt: at,
    });

    return { post: { ...post, moderation: 'FLAGGED', updatedAt: at }, record };
  }

  // ------------------------------------------------------------------ provenance

  /**
   * Resolve the provenance chain for display (roadmap §16).
   *
   * Returns one entry per expected link. A missing link is reported as `absent` with a
   * reason. It is never dropped from the array and never filled with a placeholder id —
   * a chain that silently omits its gaps reads as a complete chain.
   */
  static resolveChain(post: CommunityPost): readonly {
    readonly link: string;
    readonly state: 'PRESENT' | 'NOT_AVAILABLE';
    readonly refId: string | null;
    readonly refVersion: string | null;
    readonly because: string | null;
  }[] {
    const expected: readonly { link: string; refType: ProvenanceRef['kind'] extends never ? never : string }[] = [
      { link: 'RESEARCH', refType: 'RESEARCH_EXPERIMENT' },
      { link: 'STRATEGY_VERSION', refType: 'STRATEGY_VERSION' },
      { link: 'DATASET', refType: 'DATASET' },
      { link: 'BACKTEST', refType: 'BACKTEST' },
      { link: 'VALIDATION', refType: 'VALIDATION' },
      { link: 'PAPER_REPLAY', refType: 'PAPER_REPLAY' },
    ];

    return expected.map((e) => {
      const found = post.provenance.find(
        (p) => p.kind === 'present' && p.refType === (e.refType as never),
      );
      if (found && found.kind === 'present') {
        return {
          link: e.link,
          state: 'PRESENT' as const,
          refId: found.refId,
          refVersion: found.refVersion,
          because: null,
        };
      }
      return {
        link: e.link,
        state: 'NOT_AVAILABLE' as const,
        refId: null,
        refVersion: null,
        because: 'NOT_REFERENCED_BY_AUTHOR',
      };
    });
  }

  // ------------------------------------------------------------------ reputation

  /**
   * Reputation is a fold over explicit events. It has no side effect and no path into any
   * authorization or moderation decision (§02.7: "Do NOT use reputation as a substitute for
   * financial truth"). `CommunityService` never passes reputation into `canView`.
   */
  static reputation(events: readonly ReputationEvent[], userId: string): number {
    return events
      .filter((e) => e.userId === userId)
      .reduce((sum, e) => sum + e.delta, 0);
  }

  /** Derive reputation events from explicit, attributable actions only. */
  static reputationEvent(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly kind: ReputationEventKind;
    readonly subjectRef: string;
    readonly occurredAt: string;
  }): ReputationEvent {
    if (input.eventId.trim() === '') throw new Error('INVALID_REPUTATION_EVENT_ID');
    if (input.subjectRef.trim() === '') throw new Error('REPUTATION_EVENT_REQUIRES_SUBJECT');
    return Object.freeze({
      eventId: input.eventId,
      userId: input.userId,
      kind: input.kind,
      delta: REPUTATION_DELTAS[input.kind],
      occurredAt: input.occurredAt,
      subjectRef: input.subjectRef,
    });
  }

  // ------------------------------------------------------------------ comments

  static createComment(input: {
    readonly commentId: string;
    readonly postId: string;
    readonly authorUserId: string;
    readonly authorDisplayName: string;
    readonly authorOrganizationId: string | null;
    readonly body: string;
    readonly createdAt: string;
    post: CommunityPost;
    viewer: ViewerContext;
  }): CommunityComment {
    if (input.commentId.trim() === '') throw new Error('INVALID_COMMENT_ID');
    if (input.body.trim() === '') throw new Error('COMMENT_BODY_REQUIRED');
    if (input.body.length > MAX_BODY) throw new Error('COMMENT_BODY_TOO_LONG');

    // The parent post must be viewable, otherwise the comment id becomes a side channel.
    const decision = canView(input.post, input.viewer);
    if (decision.visible === false) throw new Error(`FORBIDDEN:${decision.reason}`);
    if (input.post.moderation !== 'VISIBLE') throw new Error('PARENT_POST_NOT_OPEN');

    const claim = scanForProhibitedClaims(input.body);
    if (!claim.ok) throw new Error(`PROHIBITED_FINANCIAL_CLAIM:${claim.violations.join(',')}`);

    return {
      commentId: input.commentId,
      postId: input.postId,
      author: {
        userId: input.authorUserId,
        organizationId: input.authorOrganizationId,
        displayName: input.authorDisplayName,
      },
      body: input.body,
      // A comment can never be broader than the post it lives on.
      visibility: input.post.visibility,
      workspaceId: input.post.workspaceId,
      organizationId: input.post.organizationId,
      moderation: 'VISIBLE',
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }
}

const REPUTATION_DELTAS: Readonly<Record<ReputationEventKind, number>> = Object.freeze({
  CONTRIBUTION_UPVOTED: 1,
  RESEARCH_VERIFIED: 3,
  LEARNING_COMPLETED: 1,
  QUALITY_FEEDBACK_POSITIVE: 1,
  MODERATION_ACTION_AGAINST: -5,
  MODERATION_CLEARED: 1,
});

function targetState(action: ModerationAction, from: ModerationState): ModerationState {
  switch (action) {
    case 'FLAG':
      return 'FLAGGED';
    case 'BEGIN_REVIEW':
      return 'UNDER_REVIEW';
    case 'HIDE':
      return 'HIDDEN';
    case 'REMOVE':
      return 'REMOVED';
    case 'RESTORE':
      return 'VISIBLE';
    case 'SUSPEND_AUTHOR':
      return 'SUSPENDED';
    default: {
      const exhaustive: never = action;
      throw new Error(`UNKNOWN_MODERATION_ACTION:${String(exhaustive)}`);
    }
  }
}

function provenanceKey(ref: ProvenanceRef): string {
  return ref.kind === 'present' ? `${ref.refType}:${ref.refId}:${ref.refVersion ?? ''}` : `absent:${ref.because}`;
}

/**
 * Heuristic used only to decide whether a disclosure label is mandatory. It looks for
 * investment vocabulary, not sentiment. A false negative means a label is not demanded —
 * which is why the prohibited-claim scan above is the actual safety control.
 */
function investmentRelevant(text: string): boolean {
  return /\b(stock|equity|share|portfolio|return|profit|loss|drawdown|sharpe|strategy|backtest|replay|valuation|fundamental|technical|earnings|dividend|ticker|index|vn[- ]?index|hold|mua|bán)\b/i.test(
    text,
  );
}

export { absent };