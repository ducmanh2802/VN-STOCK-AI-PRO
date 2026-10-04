/**
 * BUSINESS-01 — COMMERCIAL CORE TYPES
 * ===================================
 * USER → PLAN → SUBSCRIPTION → ENTITLEMENT → FEATURE → USAGE → LIMIT
 *
 * Every type in this file is a plain readonly value type with no behaviour and no
 * dependency on any other lane. Nothing here may import from src/lib/trading/**
 * (roadmap §3: commercial entitlement is NOT financial authorization).
 */

import type { FeatureId } from './features.ts';

// ============================================================================
// PLANS
// ============================================================================

/**
 * Extensible plan ladder (roadmap §01.1). Ordering is by commercial tier, NOT by
 * capability count; `rank` is the single authority on precedence.
 */
export type PlanId = 'FREE' | 'PREMIUM' | 'PRO' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE';

export interface PlanDefinition {
  readonly id: PlanId;
  readonly rank: number;
  readonly label: string;
  /** Features explicitly granted, in addition to the inclusive tier cut-off. */
  readonly features: readonly FeatureId[];
  /**
   * Inclusive tier cut-off over FEATURE_ORDER (features.ts). Every feature declared at or
   * before this index is included. `-1` means "no inclusive cut-off".
   */
  readonly inclusiveThrough: number;
  /** Metered resources. `null` limit means unlimited. */
  readonly limits: Readonly<PlanLimits>;
  /** Marketplace commercial model permitted for this plan. */
  readonly marketplaceModels: readonly MarketplaceModel[];
  /** Maximum concurrent organization seats this plan may hold. `null` = unlimited. */
  readonly maxSeats: number | null;
  /** Is this plan assignable to an individual (non-organization) subject? */
  readonly individual: boolean;
  /** Is this plan assignable to an organization subject? */
  readonly organization: boolean;
}

export interface PlanLimits {
  readonly aiRequestsPerPeriod: number | null;
  readonly backtestRunsPerPeriod: number | null;
  readonly paperReplaysPerPeriod: number | null;
  readonly researchExperimentsPerPeriod: number | null;
  readonly exportsPerPeriod: number | null;
  readonly alertsPerPeriod: number | null;
  readonly apiCallsPerPeriod: number | null;
  readonly communityPostsPerPeriod: number | null;
  readonly marketplaceListings: number | null;
}

// ============================================================================
// SUBSCRIPTION LIFECYCLE (roadmap §01.2, §05.3)
// ============================================================================

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'INCOMPLETE'
  | 'UNAVAILABLE';

/**
 * Statuses under which the subscriber still holds entitlements.
 *
 * PAST_DUE is included deliberately: a grace period exists precisely so that a subscriber
 * whose renewal payment FAILED keeps access until the grace window closes. The overdue
 * condition is still surfaced — the verdict carries `subscriptionStatus: 'PAST_DUE'` and an
 * audit event is written — but access is not withdrawn mid-window.
 *
 * CANCELLED is NOT listed here because it is not a status but a window: whether it entitles
 * depends on whether the paid period plus grace have elapsed. See `accessWindowElapsed`.
 */
export const ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
]);

/** Statuses that grant nothing, unconditionally. Fail closed by default. */
export const NON_ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'PAUSED',
  'EXPIRED',
  'INCOMPLETE',
  'UNAVAILABLE',
]);

export interface Subscription {
  readonly subscriptionId: string;
  readonly subjectId: string;
  readonly planId: PlanId;
  readonly status: SubscriptionStatus;
  /** ISO-8601. Null when the subscription has never been active. */
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  /** ISO-8601. Access does NOT end here when cancelling (grace period applies). */
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelledAt: string | null;
  readonly gracePeriodEnd: string | null;
  readonly trialEndsAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Provider-neutral reference. Null for internal/system-issued subscriptions. */
  readonly providerRef: string | null;
}

// ============================================================================
// SUBJECT (who is being charged / who holds the entitlement)
// ============================================================================

export type SubjectKind = 'USER' | 'ORGANIZATION';

/**
 * The commercial subject. The Business lane never re-derives identity: it consumes the
 * authenticated `Principal` produced by the PLATFORM lane and maps it here exactly once
 * (docs/BUSINESS_READINESS_AUDIT.md §2.5).
 */
export interface CommercialSubject {
  readonly subjectId: string;
  readonly kind: SubjectKind;
  /** Set when kind === 'ORGANIZATION'. */
  readonly organizationId: string | null;
  /** PLATFORM session id, carried for audit provenance only. Never trusted for authz. */
  readonly sessionId: string | null;
  /** Correlation id for the current request, for audit provenance. */
  readonly correlationId: string | null;
}

// ============================================================================
// USAGE (roadmap §01.5)
// ============================================================================

export type UsageResource =
  | 'AI_REQUESTS'
  | 'BACKTEST_RUNS'
  | 'PAPER_REPLAYS'
  | 'RESEARCH_EXPERIMENTS'
  | 'EXPORTS'
  | 'ALERTS'
  | 'API_CALLS'
  | 'COMMUNITY_POSTS'
  | 'MARKETPLACE_LISTINGS';

export interface UsageEvent {
  readonly eventId: string;
  readonly subjectId: string;
  readonly resource: UsageResource;
  /** Always a positive integer. A zero or negative quantity is rejected. */
  readonly quantity: number;
  /** ISO-8601 instant the consumption occurred. Injected, never read from the clock. */
  readonly occurredAt: string;
  /** Billing window key, e.g. '2026-10'. Explicit; never derived from the wall clock. */
  readonly periodKey: string;
  /** Free-form provenance. Must never contain secrets or payment credentials. */
  readonly metadata: Readonly<Record<string, string>>;
}

export interface UsageBucket {
  readonly subjectId: string;
  readonly resource: UsageResource;
  readonly periodKey: string;
  readonly consumed: number;
  /** Recorded event ids — the idempotency ledger. */
  readonly eventIds: readonly string[];
}

// ============================================================================
// ENTITLEMENT RESULT — the single answer type of the whole lane
// ============================================================================

export type EntitlementDecision =
  | 'ALLOWED'
  | 'DENIED_NO_SUBSCRIPTION'
  | 'DENIED_SUBSCRIPTION_INACTIVE'
  | 'DENIED_GRACE_EXPIRED'
  | 'DENIED_FEATURE_NOT_IN_PLAN'
  | 'DENIED_FEATURE_NOT_IMPLEMENTED'
  | 'DENIED_UNKNOWN_FEATURE'
  | 'DENIED_SUBJECT_MISMATCH'
  | 'LIMIT_REACHED'
  | 'LIMIT_REACHED_UNKNOWN'
  | 'REQUIRES_PAYMENT'
  | 'REQUIRES_RECONCILIATION';

export interface EntitlementVerdict {
  readonly decision: EntitlementDecision;
  readonly allowed: boolean;
  readonly feature: FeatureId | null;
  readonly subjectId: string;
  /** Plan actually applied. `null` when no plan could be resolved. */
  readonly planId: PlanId | null;
  readonly subscriptionStatus: SubscriptionStatus | null;
  /** Limit that produced a LIMIT_REACHED decision. */
  readonly limit: UsageResource | null;
  readonly limitValue: number | null;
  readonly consumed: number | null;
  readonly remaining: number | null;
  /** Machine-readable reason. Absent when allowed. */
  readonly reason: string | null;
  /** Evaluated at this injected instant (ISO-8601). */
  readonly evaluatedAt: string;
}

// ============================================================================
// EXPLICIT UNAVAILABILITY MARKERS (roadmap §13, §16)
// ============================================================================

export const NOT_AVAILABLE = 'NOT_AVAILABLE' as const;
export const UNAVAILABLE = 'UNAVAILABLE' as const;
export type UnavailableMarker = typeof NOT_AVAILABLE | typeof UNAVAILABLE;

export type Unavailable<T> = { readonly kind: 'unavailable'; readonly marker: UnavailableMarker; readonly detail: string } | { readonly kind: 'value'; readonly value: T };

export function unavailable<T>(detail: string, marker: UnavailableMarker = NOT_AVAILABLE): Unavailable<T> {
  return { kind: 'unavailable', marker, detail };
}

export function available<T>(value: T): Unavailable<T> {
  return { kind: 'value', value };
}

export function isUnavailable<T>(u: Unavailable<T>): u is Extract<Unavailable<T>, { kind: 'unavailable' }> {
  return u.kind === 'unavailable';
}

// ============================================================================
// MARKETPLACE COMMERCIAL MODEL (roadmap §03.8)
// ============================================================================

export type MarketplaceModel =
  | 'FREE'
  | 'ONE_TIME'
  | 'SUBSCRIPTION'
  | 'BUNDLE'
  | 'ORGANIZATION_LICENSE';

export const ALL_MARKETPLACE_MODELS: readonly MarketplaceModel[] = [
  'FREE',
  'ONE_TIME',
  'SUBSCRIPTION',
  'BUNDLE',
  'ORGANIZATION_LICENSE',
];

/** Maps a metered resource onto its plan limit field. Total, fail-closed. */
export const LIMIT_FIELD_BY_RESOURCE: Readonly<Record<UsageResource, keyof PlanLimits>> = {
  AI_REQUESTS: 'aiRequestsPerPeriod',
  BACKTEST_RUNS: 'backtestRunsPerPeriod',
  PAPER_REPLAYS: 'paperReplaysPerPeriod',
  RESEARCH_EXPERIMENTS: 'researchExperimentsPerPeriod',
  EXPORTS: 'exportsPerPeriod',
  ALERTS: 'alertsPerPeriod',
  API_CALLS: 'apiCallsPerPeriod',
  COMMUNITY_POSTS: 'communityPostsPerPeriod',
  MARKETPLACE_LISTINGS: 'marketplaceListings',
};