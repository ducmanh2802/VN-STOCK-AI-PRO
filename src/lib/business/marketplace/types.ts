/**
 * BUSINESS-03 — MARKETPLACE DOMAIN TYPES
 * =======================================
 * A marketplace for strategies and research that does NOT fake a performance marketplace
 * (roadmap §03 objective).
 *
 * CENTRAL RULE (roadmap §03.2, §03.4, §15)
 *
 *   A performance figure may be displayed ONLY when all six provenance fields resolve.
 *   Otherwise the figure is `NOT_AVAILABLE`. There is no "partial" rendering.
 *
 * The six fields: dataset, period, strategy version, cost model, execution model, validation
 * state. Each is a separate column on `PerformanceEvidence`, not a blob, precisely so that a
 * missing one cannot be overlooked inside an opaque manifest.
 *
 * STATE SEPARATION (roadmap §15) — these are distinct and are never collapsed:
 *   AUTHORED  the author wrote it
 *   PUBLISHED the author submitted it to the marketplace
 *   VERIFIED  an automated re-check reproduced the recorded evidence
 *   BACKTESTED a backtest exists
 *   OUT_OF_SAMPLE_TESTED  out-of-sample evidence exists
 *   PAPER_TESTED  paper replay evidence exists
 *   CERTIFIED  the research lane produced a CERTIFIED verdict
 */

import type { MarketplaceModel } from '../types.ts';

// ============================================================================
// EVIDENCE LADDER (roadmap §15) — independent flags, not a single status
// ============================================================================

export type EvidenceFlag =
  | 'AUTHORED'
  | 'PUBLISHED'
  | 'VERIFIED'
  | 'BACKTESTED'
  | 'OUT_OF_SAMPLE_TESTED'
  | 'PAPER_TESTED'
  | 'CERTIFIED';

export const EVIDENCE_LADDER_ORDER: readonly EvidenceFlag[] = [
  'AUTHORED',
  'PUBLISHED',
  'VERIFIED',
  'BACKTESTED',
  'OUT_OF_SAMPLE_TESTED',
  'PAPER_TESTED',
  'CERTIFIED',
];

/**
 * STRICT ordering: nothing implies anything above it except AUTHORED/PUBLISHED which are
 * author actions. VERIFIED does not imply BACKTESTED, BACKTESTED does not imply
 * OUT_OF_SAMPLE_TESTED. The ladder is a set of independent facts.
 */
export const EVIDENCE_LADDER_RANK: Readonly<Record<EvidenceFlag, number>> = Object.freeze({
  AUTHORED: 0,
  PUBLISHED: 1,
  BACKTESTED: 2,
  VERIFIED: 2,
  OUT_OF_SAMPLE_TESTED: 3,
  PAPER_TESTED: 4,
  CERTIFIED: 5,
});

// ============================================================================
// PERFORMANCE EVIDENCE — the anti-fabrication structure
// ============================================================================

/**
 * One provenance field. `NOT_AVAILABLE` is a first-class state, not `null`.
 */
export type EvidenceField<T> =
  | { readonly state: 'PRESENT'; readonly value: T }
  | { readonly state: 'NOT_AVAILABLE'; readonly marker: 'NOT_AVAILABLE'; readonly because: string };

export function evidence<T>(value: T): EvidenceField<T> {
  return { state: 'PRESENT', value };
}

export function noEvidence<T>(because: string): EvidenceField<T> {
  return { state: 'NOT_AVAILABLE', marker: 'NOT_AVAILABLE', because };
}

/** The six mandatory provenance fields for any displayed performance figure. */
export interface PerformanceEvidence {
  readonly dataset: EvidenceField<string>;
  readonly period: EvidenceField<{ readonly start: string; readonly end: string }>;
  readonly strategyVersion: EvidenceField<string>;
  readonly costModel: EvidenceField<string>;
  readonly executionModel: EvidenceField<string>;
  readonly validationState: EvidenceField<string>;
}

export type PerformanceMetric =
  | 'CAGR_PCT'
  | 'SHARPE'
  | 'SORTINO'
  | 'MAX_DRAWDOWN_PCT'
  | 'WIN_RATE_PCT'
  | 'TURNOVER';

export interface PerformanceMetricValue {
  readonly metric: PerformanceMetric;
  readonly value: number;
}

/**
 * A metric that may be DISPLAYED. Only constructible when every provenance field resolves.
 * The constructor is the enforcement point; the type itself carries no guarantee, so the
 * only way to obtain a `DisplayableMetric` is through `PerformanceGate`.
 */
export interface DisplayableMetric {
  readonly metric: PerformanceMetric;
  readonly value: number;
  readonly provenance: ResolvedProvenance;
}

/** Provenance with every field resolved. Reachable only via `PerformanceGate`. */
export interface ResolvedProvenance {
  readonly dataset: string;
  readonly period: { readonly start: string; readonly end: string };
  readonly strategyVersion: string;
  readonly costModel: string;
  readonly executionModel: string;
  readonly validationState: string;
}

// ============================================================================
// STRATEGY (roadmap §03.1, §03.5)
// ============================================================================

export type PublicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'PUBLISHED'
  | 'SUSPENDED'
  | 'DEPRECATED'
  | 'ARCHIVED';

export const PUBLICATION_TRANSITIONS: Readonly<Record<PublicationStatus, readonly PublicationStatus[]>> =
  Object.freeze({
    DRAFT: ['SUBMITTED', 'ARCHIVED'],
    SUBMITTED: ['UNDER_REVIEW', 'DRAFT', 'ARCHIVED'],
    UNDER_REVIEW: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
    PUBLISHED: ['SUSPENDED', 'DEPRECATED', 'ARCHIVED'],
    SUSPENDED: ['PUBLISHED', 'DEPRECATED', 'ARCHIVED'],
    DEPRECATED: ['PUBLISHED', 'ARCHIVED'],
    ARCHIVED: [],
  });

export interface StrategyVersion {
  readonly strategyId: string;
  readonly version: number;
  readonly authorUserId: string;
  readonly name: string;
  readonly description: string;
  readonly universe: string;
  readonly assetClass: string;
  readonly rules: Readonly<Record<string, string>>;
  readonly parameters: Readonly<Record<string, string>>;
  readonly riskModel: string;
  readonly executionModel: string;
  readonly costModel: string;
  /** Independent evidence flags for THIS version. */
  readonly evidence: ReadonlySet<EvidenceFlag>;
  readonly performanceEvidence: PerformanceEvidence;
  readonly performance: readonly PerformanceMetricValue[];
  readonly publication: PublicationStatus;
  readonly commercialModel: MarketplaceModel;
  readonly visibility: 'PUBLIC' | 'UNLISTED';
  readonly createdAt: string;
  /** Author id of the parent version, for lineage. Never derived from reputation. */
  readonly previousVersionId: string | null;
}

export function versionRef(v: { strategyId: string; version: number }): string {
  return `${v.strategyId}@v${v.version}`;
}

// ============================================================================
// RANKING (roadmap §03.6, §03.7)
// ============================================================================

export interface RankInput {
  readonly version: StrategyVersion;
  /** Real, available, index-backed counts. */
  readonly sampleSize: number | null;
  /** Paper-replay trade count, when a replay exists. */
  readonly paperTradeCount: number | null;
  /** True when at least one out-of-sample window exists. */
  readonly outOfSample: boolean;
}

export interface RankScore {
  readonly strategyRef: string;
  readonly score: number;
  /** Every component, so the methodology is inspectable (roadmap §03.7). */
  readonly components: Readonly<Record<string, number>>;
  /** Components that could not be computed. Absent components never count as zero. */
  readonly missing: readonly string[];
}

export const RANKING_METHODOLOGY_VERSION = 'v1.0.0-business-03-rank';
export const RANKING_METHODOLOGY: readonly string[] = Object.freeze([
  'risk_adjusted_return (sharpe, capped at 3.0)',
  'drawdown_penalty (max drawdown, capped at 60%)',
  'sample_size_confidence (min(n,300)/300)',
  'validation_bonus (out-of-sample present)',
  'paper_evidence_bonus (paper replay trade count, capped at 100)',
  'all components require resolved performance provenance; unresolved components are listed in `missing`',
  'raw return is NEVER a ranking input',
]);

// ============================================================================
// CREATOR ECONOMICS (roadmap §03.9)
// ============================================================================

/**
 * Money is kept decomposed. There is NO payout balance field, because there is no payment
 * provider in this repository and a fabricated balance is exactly what §2.1 forbids.
 */
export interface CreatorEconomics {
  readonly listingRef: string;
  /** Only ever populated from a settled commercial ledger record (BUSINESS-05). */
  readonly grossRevenueMinor: number | null;
  readonly platformFeeMinor: number | null;
  readonly creatorShareMinor: number | null;
  readonly refundMinor: number | null;
  readonly taxWithheldMinor: number | null;
  readonly payoutStatus: 'NOT_APPLICABLE' | 'PENDING' | 'PAID' | 'FAILED';
}

/** Invariants on the decomposition. Never violated silently. */
export function creatorEconomicsBalanced(e: CreatorEconomics): boolean {
  if (e.grossRevenueMinor === null) return true;
  if (e.platformFeeMinor === null || e.creatorShareMinor === null) return false;
  if (e.platformFeeMinor + e.creatorShareMinor !== e.grossRevenueMinor) return false;
  const refund = e.refundMinor ?? 0;
  const tax = e.taxWithheldMinor ?? 0;
  return e.creatorShareMinor - refund - tax >= 0;
}