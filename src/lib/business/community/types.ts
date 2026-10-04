/**
 * BUSINESS-02 — COMMUNITY DOMAIN TYPES
 * ====================================
 * Community is not a social feed. Every artifact in it is a *reference to a research object*
 * that keeps its provenance (roadmap §02.2, §16).
 *
 * The canonical provenance chain this lane must be able to trace or explicitly mark absent:
 *
 *   USER -> POST -> RESEARCH -> STRATEGY VERSION -> DATASET -> BACKTEST -> VALIDATION
 *        -> PAPER REPLAY -> PUBLICATION
 *
 * Where evidence does not exist the field is `NOT_AVAILABLE` (roadmap §16). It is never
 * inferred, defaulted, or filled in from the author's reputation.
 */

import type { NOT_AVAILABLE, Unavailable } from '../types.ts';

// ============================================================================
// CONTENT LABELS (roadmap §02.6, §05)
// ============================================================================

/**
 * What KIND of statement a piece of community content is. Not a trust score.
 * These are author-asserted classifications, always displayed alongside the content.
 */
export type ContentLabel =
  | 'EDUCATIONAL'
  | 'RESEARCH'
  | 'PAPER_ONLY'
  | 'HYPOTHESIS'
  | 'PERSONAL_VIEW';

// ============================================================================
// VISIBILITY (roadmap §02.3, §02.4)
// ============================================================================

export type Visibility = 'PRIVATE' | 'WORKSPACE' | 'ORGANIZATION' | 'COMMUNITY' | 'UNLISTED' | 'PUBLIC';

/** Ordered from most restrictive to least. Used for comparisons and defaulting. */
export const VISIBILITY_ORDER: readonly Visibility[] = [
  'PRIVATE',
  'WORKSPACE',
  'ORGANIZATION',
  'COMMUNITY',
  'UNLISTED',
  'PUBLIC',
];

export function visibilityRank(v: Visibility): number {
  const i = VISIBILITY_ORDER.indexOf(v);
  if (i < 0) throw new Error(`UNKNOWN_VISIBILITY:${v}`);
  return i;
}

// ============================================================================
// MODERATION (roadmap §02.5)
// ============================================================================

export type ModerationState =
  | 'VISIBLE'
  | 'FLAGGED'
  | 'UNDER_REVIEW'
  | 'HIDDEN'
  | 'REMOVED'
  | 'SUSPENDED';

export const MODERATION_TRANSITIONS: Readonly<Record<ModerationState, readonly ModerationState[]>> =
  Object.freeze({
    VISIBLE: ['FLAGGED', 'UNDER_REVIEW', 'HIDDEN'],
    FLAGGED: ['UNDER_REVIEW', 'VISIBLE', 'HIDDEN'],
    UNDER_REVIEW: ['VISIBLE', 'HIDDEN', 'REMOVED'],
    HIDDEN: ['UNDER_REVIEW', 'VISIBLE', 'REMOVED'],
    REMOVED: ['UNDER_REVIEW'],
    SUSPENDED: ['UNDER_REVIEW'],
  });

export type ModerationAction =
  | 'FLAG'
  | 'BEGIN_REVIEW'
  | 'RESTORE'
  | 'HIDE'
  | 'REMOVE'
  | 'SUSPEND_AUTHOR';

// ============================================================================
// REPUTATION (roadmap §02.7)
// ============================================================================

/**
 * Reputation is a derived counter over explicit events. It is NEVER a proxy for
 * correctness and never influences moderation outcome.
 */
export type ReputationEventKind =
  | 'CONTRIBUTION_UPVOTED'
  | 'RESEARCH_VERIFIED'
  | 'LEARNING_COMPLETED'
  | 'QUALITY_FEEDBACK_POSITIVE'
  | 'MODERATION_ACTION_AGAINST'
  | 'MODERATION_CLEARED';

export interface ReputationEvent {
  readonly eventId: string;
  readonly userId: string;
  readonly kind: ReputationEventKind;
  readonly delta: number;
  readonly occurredAt: string;
  /** The artifact that caused the event. Always present: reputation needs provenance. */
  readonly subjectRef: string;
}

// ============================================================================
// PROVENANCE REFERENCE
// ============================================================================

/**
 * A link from a community artifact into the research graph.
 *
 * Every field is `Unavailable` when the evidence does not exist. There is no "default"
 * variant that could accidentally be treated as real evidence.
 */
export type ProvenanceRef =
  | { readonly kind: 'present'; readonly refType: ProvenanceRefType; readonly refId: string; readonly refVersion: string | null }
  | { readonly kind: 'absent'; readonly marker: typeof NOT_AVAILABLE; readonly because: string };

export type ProvenanceRefType =
  | 'RESEARCH_EXPERIMENT'
  | 'RESEARCH_CERTIFICATION'
  | 'STRATEGY_VERSION'
  | 'DATASET'
  | 'BACKTEST'
  | 'VALIDATION'
  | 'PAPER_REPLAY'
  | 'DECISION_JOURNAL_ENTRY'
  | 'LEARNING_ARTIFACT';

export function present(
  refType: ProvenanceRefType,
  refId: string,
  refVersion: string | null = null,
): ProvenanceRef {
  return { kind: 'present', refType, refId, refVersion };
}

export function absent(because: string): ProvenanceRef {
  return { kind: 'absent', marker: 'NOT_AVAILABLE', because };
}

// ============================================================================
// ENTITIES
// ============================================================================

export interface CommunityAuthor {
  readonly userId: string;
  readonly organizationId: string | null;
  /** Shown on the post. Never used as an authorization input. */
  readonly displayName: string;
}

export interface CommunityPost {
  readonly postId: string;
  readonly author: CommunityAuthor;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly ContentLabel[];
  readonly visibility: Visibility;
  /** Set when visibility is WORKSPACE or ORGANIZATION. */
  readonly workspaceId: string | null;
  readonly organizationId: string | null;
  readonly moderation: ModerationState;
  readonly provenance: readonly ProvenanceRef[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CommunityComment {
  readonly commentId: string;
  readonly postId: string;
  readonly author: CommunityAuthor;
  readonly body: string;
  readonly visibility: Visibility;
  readonly workspaceId: string | null;
  readonly organizationId: string | null;
  readonly moderation: ModerationState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CommunityReport {
  readonly reportId: string;
  readonly targetType: 'POST' | 'COMMENT';
  readonly targetId: string;
  readonly reporterUserId: string;
  readonly reason: ReportReason;
  readonly detail: string;
  readonly createdAt: string;
}

export type ReportReason =
  | 'UNSUPPORTED_RETURN_CLAIM'
  | 'PERSONALIZED_ADVICE'
  | 'SPAM'
  | 'HARASSMENT'
  | 'PRIVATE_DATA'
  | 'COPYRIGHT'
  | 'OTHER';

export interface ModerationRecord {
  readonly moderationId: string;
  readonly targetType: 'POST' | 'COMMENT';
  readonly targetId: string;
  readonly action: ModerationAction;
  readonly from: ModerationState;
  readonly to: ModerationState;
  /** The moderator. Always recorded: moderation must be auditable (roadmap §02.5). */
  readonly moderatorUserId: string;
  readonly reason: string;
  readonly correlationId: string | null;
  readonly occurredAt: string;
}

/**
 * The viewer of a resource. Constructed by the server from an authenticated principal.
 * A caller can never supply this directly from a request body.
 */
export interface ViewerContext {
  readonly userId: string | null;
  /** Organizations the viewer is an ACTIVE member of. */
  readonly organizationIds: readonly string[];
  /** Workspaces the viewer can currently reach. */
  readonly workspaceIds: readonly string[];
  /** Can the viewer moderate? Derived from the PLATFORM/BUSINESS role layer, not a flag. */
  readonly canModerate: boolean;
}

export const ANONYMOUS_VIEWER: ViewerContext = Object.freeze({
  userId: null,
  organizationIds: [],
  workspaceIds: [],
  canModerate: false,
});

export type VisibilityDecision =
  | { readonly visible: true }
  | { readonly visible: false; readonly reason: string };

export const VISIBLE: VisibilityDecision = Object.freeze({ visible: true });

export function invisible(reason: string): VisibilityDecision {
  return { visible: false, reason };
}

export type { Unavailable };