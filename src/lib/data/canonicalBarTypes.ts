/**
 * P0-04 REMEDIATION — CANONICAL MARKET DATA PERSISTENCE TYPES
 * ===========================================================
 * The persistence-facing contract for canonical historical bars, their
 * provenance and their quality. It extends — and does not replace — the existing
 * Data Foundation vocabulary in `src/lib/data/types.ts`:
 *
 *   instrument   : canonical `instrumentId` (never ticker text as sole identity)
 *   bar time     : `barTime` (timestamp) + `tradingDate` (date)
 *   OHLCV        : open / high / low / close / volume / turnover
 *   adjustment   : `adjustmentState` (RAW | ADJUSTED)
 *   quality      : explicit VALID | STALE | INVALID | UNAVAILABLE
 *   version      : `dataVersion`
 *
 * The four-time model of `src/lib/data/types.ts` is preserved and made
 * mandatory, which is what makes point-in-time reads possible without
 * look-ahead:
 *   observationTime / publicationTime / effectiveTime / ingestionTime
 */

import type { CanonicalQualityState } from '../../db/schema.ts';

/** Re-exported so consumers never need to reach into the schema module. */
export type { CanonicalQualityState, CanonicalAgreementState } from '../../db/schema.ts';

/** Multi-source source-of-truth identifiers preserved from the existing architecture. */
export type CanonicalMarketSource = 'KBS' | 'VPS' | 'VNDIRECT';

export const CANONICAL_MARKET_SOURCES: readonly CanonicalMarketSource[] = ['KBS', 'VPS', 'VNDIRECT'];

export type CanonicalAdjustmentState = 'RAW' | 'ADJUSTED';

export type CanonicalTimeframe = '1D' | '1W' | '1M';

export type SourceTier = 'TIER_1_STATUTORY' | 'TIER_2_EXCHANGE' | 'TIER_3_SECONDARY' | 'TIER_4_UNVERIFIED';

/** Reason codes emitted by the deterministic quality ruleset. */
export type CanonicalQualityReason =
  | 'OK'
  | 'MISSING_REQUIRED_FIELD'
  | 'NON_POSITIVE_PRICE'
  | 'OHLC_INCONSISTENT'
  | 'NEGATIVE_VOLUME'
  | 'INVALID_TIMESTAMP'
  | 'FUTURE_TIMESTAMP'
  | 'DUPLICATE_BAR'
  | 'SOURCE_MISMATCH'
  | 'CROSS_SOURCE_MISMATCH'
  | 'BEYOND_MAX_STALENESS'
  | 'SOURCE_UNAVAILABLE';

/** A bar exactly as the source reported it, before any transformation. */
export interface CanonicalBarInput {
  readonly instrumentId: string;
  /** Denormalised convenience value. Never the identity. */
  readonly symbol: string;
  readonly exchange: string;
  readonly timeframe: CanonicalTimeframe;
  /** ISO timestamp of the bar close as the source states it. */
  readonly barTime: string;
  /** 'YYYY-MM-DD' trading date. */
  readonly tradingDate: string;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly volume: number | null;
  readonly turnoverVnd: number | null;
  readonly referencePrice?: number | null;
  readonly ceilingPrice?: number | null;
  readonly floorPrice?: number | null;
  readonly adjustmentState: CanonicalAdjustmentState;
  readonly adjustmentFactor: number | null;
  readonly source: CanonicalMarketSource;
  readonly sourceTier: SourceTier;
  /** Provider-side identifier of this observation. Required: no bar from nowhere. */
  readonly sourceRecordId: string;
  readonly provider: string;
  readonly providerVersion: string | null;
  readonly observationTime: string;
  readonly publicationTime: string | null;
  /**
   * When the observation became usable for a decision. Defaults to
   * `publicationTime ?? observationTime` when the caller does not supply it.
   * Historical reads MUST filter on this so no look-ahead is possible.
   */
  readonly effectiveTime?: string | null;
  readonly ingestionTime: string;
  readonly dataVersion: string;
  /** Optional explicit provenance extras. */
  readonly sourceUrl?: string | null;
  readonly payloadChecksum?: string | null;
  readonly rawExcerpt?: string | null;
}

/** A bar that passed validation and is ready to persist. */
export interface CanonicalBarRecord extends CanonicalBarInput {
  readonly barKey: string;
  readonly effectiveTime: string;
  readonly qualityState: CanonicalQualityState;
  readonly qualityReason: CanonicalQualityReason;
  readonly qualityDetail: string | null;
  readonly transformVersion: string | null;
  readonly transformNote: string | null;
  readonly isSynthetic: false;
}

export interface CanonicalProvenanceRecord {
  readonly provenanceId: string;
  readonly barKey: string;
  readonly instrumentId: string;
  readonly source: CanonicalMarketSource;
  readonly sourceRecordId: string;
  readonly provider: string;
  readonly providerVersion: string | null;
  readonly sourceUrl: string | null;
  readonly observationTime: string;
  readonly publicationTime: string | null;
  readonly effectiveTime: string;
  readonly ingestionTime: string;
  readonly dataVersion: string;
  readonly payloadChecksum: string | null;
  readonly rawExcerpt: string | null;
}

export interface CanonicalQualityRecord {
  readonly qualityId: string;
  readonly barKey: string;
  readonly instrumentId: string;
  readonly tradingDate: string;
  readonly source: CanonicalMarketSource;
  readonly qualityState: CanonicalQualityState;
  readonly reasonCode: CanonicalQualityReason;
  readonly detail: string | null;
  readonly checkedRuleVersion: string;
  readonly sourceValues: string | null;
  readonly resolvedValues: string | null;
  readonly evaluatedAt: string;
}

export interface CanonicalSourceAgreementRecord {
  readonly instrumentId: string;
  readonly tradingDate: string;
  readonly timeframe: CanonicalTimeframe;
  readonly primarySource: CanonicalMarketSource;
  readonly comparedSource: CanonicalMarketSource;
  readonly primaryClose: number;
  readonly comparedClose: number;
  readonly deviationPercent: number;
  readonly tolerancePercent: number;
  readonly agreementState: 'AGREE' | 'TOLERATED' | 'MISMATCH' | 'INSUFFICIENT_DATA';
  readonly detail: string | null;
  readonly evaluatedAt: string;
}

/** Read model returned by the query path. */
export interface CanonicalBarQueryResult {
  readonly barKey: string;
  readonly instrumentId: string;
  readonly symbol: string;
  readonly tradingDate: string;
  readonly barTime: string;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly volume: number | null;
  readonly turnoverVnd: number | null;
  readonly source: CanonicalMarketSource;
  readonly sourceTier: SourceTier;
  readonly provider: string;
  readonly sourceRecordId: string;
  readonly observationTime: string;
  readonly publicationTime: string | null;
  readonly effectiveTime: string;
  readonly ingestionTime: string;
  readonly dataVersion: string;
  readonly adjustmentState: CanonicalAdjustmentState;
  readonly qualityState: CanonicalQualityState;
  readonly qualityReason: CanonicalQualityReason;
  readonly isSynthetic: boolean;
}

/** Version stamp of the deterministic validation ruleset. Bump on any change. */
export const CANONICAL_BAR_RULE_VERSION = 'v1.0.0-p0-04-canonical-bars';

/** Version stamp of the canonical persistence model. */
export const CANONICAL_PERSISTENCE_VERSION = 'v1.0.0-p0-04';
