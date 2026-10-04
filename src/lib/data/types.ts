/**
 * DATA FOUNDATION — CANONICAL TYPES (DATA-01 → DATA-05)
 * =====================================================
 * Single source of truth for Data Foundation vocabulary.
 * Pure types only — no I/O, no clock, no global state.
 *
 * Time model (never collapse into one generic `date`):
 * - observationTime: when the underlying event/data occurred.
 * - publicationTime: when information became available to market/system.
 * - effectiveTime:   when an action/change became effective.
 * - ingestionTime:   when our system received the data.
 *
 * Raw vs derived (never overwrite raw):
 * - RAW | DERIVED | ADJUSTED | AGGREGATED | NORMALIZED | SIMULATED(test-only)
 */

export type DataAssetClass =
  | 'EQUITY'
  | 'ETF'
  | 'INDEX'
  | 'FUTURE'
  | 'CASH';

export type SupportedLiveAssetClass = DataAssetClass;

export type ExtendedAssetClass = DataAssetClass | 'BOND' | 'FX' | 'COMMODITY' | 'CRYPTO';

export type InstrumentStatus = 'ACTIVE' | 'SUSPENDED' | 'DELISTED';

export type ExchangeCode = 'HOSE' | 'HNX' | 'UPCOM';

export interface InstrumentIdentity {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: ExchangeCode;
  readonly assetClass: DataAssetClass;
  readonly currency: 'VND';
  readonly country: 'VN';
  readonly sector?: string | null;
  readonly industry?: string | null;
  readonly status: InstrumentStatus;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly isin?: string | null;
  readonly previousSymbols?: readonly string[];
}

export type BarGranularity = 'DAILY' | 'INTRADAY' | 'WEEKLY' | 'MONTHLY';

export interface CanonicalBar {
  readonly instrumentId: string;
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly value: number;
  readonly source: 'KBS' | 'VPS' | 'DB';
  readonly quality: BarQuality;
}

export type BarQuality = 'VALID' | 'WARNING' | 'STALE' | 'INVALID' | 'UNAVAILABLE';

export type FreshnessState = 'CURRENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID';

export type DataQualityState = 'VALID' | 'WARNING' | 'STALE' | 'INVALID' | 'UNAVAILABLE';

export interface CoverageReport {
  readonly instrumentId: string;
  readonly firstObservation: string | null;
  readonly lastObservation: string | null;
  readonly barCount: number;
  readonly missingPeriods: readonly string[];
  readonly duplicatePeriods: readonly string[];
  readonly gapCount: number;
  readonly invalidOhlcCount: number;
  readonly zeroOrNegativePriceCount: number;
  readonly volumeAnomalyCount: number;
}

export type CorporateActionKind =
  | 'DIVIDEND'
  | 'CASH_DIVIDEND'
  | 'STOCK_DIVIDEND'
  | 'STOCK_SPLIT'
  | 'REVERSE_SPLIT'
  | 'RIGHTS_ISSUE'
  | 'BONUS'
  | 'MERGER'
  | 'DEMERGER'
  | 'SYMBOL_CHANGE';

export interface CorporateActionRecord {
  readonly eventId: string;
  readonly instrumentId: string;
  readonly kind: CorporateActionKind;
  readonly status: 'ANNOUNCED' | 'CONFIRMED' | 'EX_DATE_PASSED' | 'COMPLETED' | 'CANCELLED' | 'AMENDED';
  readonly announcementDate: string | null;
  readonly recordDate: string | null;
  readonly exDate: string | null;
  readonly paymentDate: string | null;
  readonly effectiveDate: string | null;
  readonly ratioOld: number | null;
  readonly ratioNew: number | null;
  readonly cashAmountVnd: number | null;
  readonly issuePriceVnd: number | null;
  readonly symbolChangeFrom: string | null;
  readonly symbolChangeTo: string | null;
  readonly source: 'VSDC' | 'HOSE' | 'HNX' | 'ISSUER';
  readonly sourceTier: 'TIER_1_STATUTORY' | 'TIER_2_EXCHANGE' | 'TIER_3_SECONDARY' | 'TIER_4_UNVERIFIED';
  readonly dataVersion: string;
}

export type AdjustmentMode = 'RAW' | 'ADJUSTED';

export interface Provenance {
  readonly source: string;
  readonly provider: string;
  readonly endpointOrQuery?: string | null;
  readonly retrievalTime: string;
  readonly observationTime: string;
  readonly publicationTime: string;
  readonly ingestionTime: string;
  readonly dataVersion: string;
  readonly schemaVersion?: string | null;
  readonly adjustmentVersion?: string | null;
  readonly calculationVersion?: string | null;
  readonly transformation: string;
  readonly adjustment: AdjustmentMode;
  readonly quality: DataQualityState;
}

export interface LineageNode {
  readonly kind: string;
  readonly ref: string;
  readonly provenance: Provenance;
}

export type DataKind = 'RAW' | 'DERIVED' | 'ADJUSTED' | 'AGGREGATED' | 'NORMALIZED' | 'SIMULATED';

export type BiasCode =
  | 'LOOKAHEAD_DETECTED'
  | 'SURVIVORSHIP_RISK'
  | 'CURRENT_CONSTITUENT_LEAK'
  | 'FUTURE_PUBLICATION'
  | 'FUTURE_METADATA';

export interface BiasDiagnostic {
  readonly code: BiasCode;
  readonly detail: string;
  readonly offendingRef?: string | null;
}

export type DataFailureCode =
  | 'DATA_UNAVAILABLE'
  | 'DATA_INVALID'
  | 'POINT_IN_TIME_UNAVAILABLE';

export const DATA_FOUNDATION_VERSION = 'v1.0.0-data-foundation';
export const DATA_CALCULATION_VERSION = 'v1.0.0-data-foundation';
