/**
 * PHASE 24 — EARNINGS & FINANCIAL STATEMENTS INTELLIGENCE: DOMAIN CONTRACTS
 * ========================================================================
 * Canonical, deterministic, fail-closed contracts for Vietnamese equity earnings
 * and financial-statement intelligence.
 *
 * Constitutional invariants (inherited from .clinerules and PR-01):
 * 1. `null` ALWAYS means "unavailable / not reported" — NEVER `0`, NEVER a guess.
 * 2. Every derived metric is a pure deterministic function of source facts.
 * 3. Provenance + freshness + lineage are mandatory on every canonical fact.
 * 4. The PR-01 freshness lifecycle is adopted verbatim (no competing enum).
 * 5. The existing authoritative document validation contracts are reused
 *    (MetricValidationStatus / DataUnavailableReasonCode) — not re-invented.
 */

// Re-export the canonical PR-01 + Phase 19.6 contracts so consumers depend on a
// single earnings-domain barrel without forking the enums.
export type { DataFreshnessStatus } from '../../types/stock.ts';
export type {
  AuditStatus,
  MetricValidationStatus,
  DataUnavailableReasonCode,
} from '../../services/financialDocuments/types.ts';

import type { DataFreshnessStatus } from '../../types/stock.ts';
import type {
  AuditStatus,
  MetricValidationStatus,
  DataUnavailableReasonCode,
} from '../../services/financialDocuments/types.ts';

// ---------------------------------------------------------------------------
// 1. Canonical financial periods
// ---------------------------------------------------------------------------

/**
 * Canonical period types. Cumulative periods (H1, 9M, FY) are DISTINCT from the
 * discrete quarters (Q1..Q4) even when their end dates coincide. This type set
 * exists specifically to make `Q2 !== H1`, `Q4 !== FY` etc. impossible to
 * confuse by construction.
 */
export type FinancialPeriodType =
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'H1'
  | '9M'
  | 'FY'
  | 'TTM'
  | 'YTD';

/** Whether a period's magnitude is a discrete window or a year-to-date sum. */
export type PeriodAccumulation = 'DISCRETE' | 'CUMULATIVE';

/**
 * A fully-specified canonical fiscal period. Opaque strings are never the
 * identity of a period.
 */
export interface FinancialPeriod {
  /** Canonical identity, e.g. `Q1-2024`, `H1-2024`, `9M-2024`, `FY2024`, `TTM-2024-Q4`. */
  readonly id: string;
  readonly type: FinancialPeriodType;
  /** Fiscal year the period belongs to (year of its `periodEnd` under a calendar FY). */
  readonly fiscalYear: number;
  /**
   * Representative quarter 1..4 for discrete quarters Q1..Q4, and for
   * cumulative windows the quarter in which the window ENDS
   * (H1 -> 2, 9M -> 3, FY -> 4, YTD -> quarter of upToMonth); null only when
   * the engine cannot determine a representative quarter (P24-D15).
   * Comparability is decided by FinancialPeriodEngine.isComparable
   * (type + accumulation + duration), never by this field alone.
   */
  readonly quarter: 1 | 2 | 3 | 4 | null;
  /** Inclusive ISO date (YYYY-MM-DD). */
  readonly periodStart: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  readonly periodEnd: string;
  /** Inclusive day count derived from start/end. */
  readonly durationDays: number;
  readonly accumulation: PeriodAccumulation;
}

/** Describes a fiscal calendar. Default = Vietnamese standard calendar year. */
export interface FiscalCalendarConfig {
  /** 1..12 — calendar month in which the fiscal year ends (default 12). */
  readonly fiscalYearEndMonth: number;
}

/** Deterministic validation report for a period. */
export interface PeriodValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// 2. Statement / reporting metadata
// ---------------------------------------------------------------------------

export type EarningsStatementType =
  | 'INCOME_STATEMENT'
  | 'BALANCE_SHEET'
  | 'CASH_FLOW';

/** Consolidated vs standalone — carried through every canonical fact (P1). */
export type EarningsReportType = 'CONSOLIDATED' | 'SEPARATE';

/** Explicit restatement lifecycle status. */
export type RestatementStatus = 'ORIGINAL' | 'AMENDED' | 'RESTATED';

/** Authoritative source hierarchy tiers. */
export type SourceTier =
  | 'TIER_1_PRIMARY'
  | 'TIER_2_EXCHANGE'
  | 'TIER_3_ISSUER'
  | 'TIER_4_BROKER_CROSS_CHECK';

// ---------------------------------------------------------------------------
// 3. Canonical fact + lineage
// ---------------------------------------------------------------------------

/**
 * Phase-24 lineage model. Superset of the Phase 23 `{sources, engine,
 * calculationVersion}` shape, extended with statement-level audit metadata.
 */
export interface EarningsLineage {
  readonly sources: readonly string[];
  readonly engine: string;
  readonly calculationVersion: string;
  readonly statementId?: string | null;
  readonly reportId?: string | null;
  readonly periodStart?: string | null;
  readonly periodEnd?: string | null;
  readonly publicationDate?: string | null;
  readonly auditStatus?: AuditStatus | null;
  readonly restatementVersion?: number | null;
}

/**
 * A single canonical, versioned financial fact. Raw source documents are never
 * mutated; this is a derived, append-only representation.
 */
export interface CanonicalFinancialFact {
  readonly symbol: string;
  readonly metric: string;
  readonly statementType: EarningsStatementType;
  readonly reportType: EarningsReportType;
  readonly period: FinancialPeriod;
  readonly value: number | null;
  /** ISO currency, e.g. `VND`. */
  readonly currency: string;
  /** Fully-expanded unit, e.g. `VND` (never `TRIEU_DONG` after normalization). */
  readonly unit: string;
  readonly audited: boolean;
  readonly auditStatus: AuditStatus;
  readonly restatementStatus: RestatementStatus;
  /** Monotonic per (symbol, metric, period, reportType): 0 = original. */
  readonly restatementVersion: number;
  readonly reportId: string;
  readonly statementId: string;
  readonly publicationDate: string | null;
  readonly source: string;
  readonly sourceTier: SourceTier;
  readonly freshness: DataFreshnessStatus;
  readonly validationStatus: MetricValidationStatus;
  readonly unavailableReason?: DataUnavailableReasonCode;
  readonly notes?: string;
  readonly lineage: EarningsLineage;
}

// ---------------------------------------------------------------------------
// 4. Normalized statements
// ---------------------------------------------------------------------------

/** Per-field unavailable-reason map for a normalized statement. */
export type StatementReasonMap = Readonly<Record<string, DataUnavailableReasonCode>>;

export interface IncomeStatement {
  readonly revenue: number | null;
  readonly cogs: number | null;
  readonly grossProfit: number | null;
  readonly operatingExpenses: number | null;
  readonly operatingProfit: number | null;
  readonly ebitda: number | null;
  readonly nonOperatingIncome: number | null;
  readonly nonOperatingExpense: number | null;
  readonly pretaxProfit: number | null;
  readonly incomeTax: number | null;
  readonly netProfit: number | null;
  readonly parentNetProfit: number | null;
  readonly eps: number | null;
  readonly reportType: EarningsReportType;
  readonly period: FinancialPeriod;
  readonly reasons: StatementReasonMap;
  readonly lineage: EarningsLineage;
}

export interface BalanceSheet {
  readonly cash: number | null;
  readonly shortTermInvestments: number | null;
  readonly receivables: number | null;
  readonly inventory: number | null;
  readonly otherCurrentAssets: number | null;
  readonly totalCurrentAssets: number | null;
  readonly totalAssets: number | null;
  readonly currentLiabilities: number | null;
  readonly shortTermDebt: number | null;
  readonly otherCurrentLiabilities: number | null;
  readonly totalCurrentLiabilities: number | null;
  readonly longTermDebt: number | null;
  readonly totalLiabilities: number | null;
  readonly totalEquity: number | null;
  readonly reportType: EarningsReportType;
  readonly period: FinancialPeriod;
  readonly reasons: StatementReasonMap;
  readonly lineage: EarningsLineage;
}

export interface CashFlowStatement {
  readonly operatingCashFlow: number | null;
  readonly investingCashFlow: number | null;
  readonly financingCashFlow: number | null;
  /** CAPEX magnitude as a strictly positive number (or null). */
  readonly capex: number | null;
  readonly cashDividendsPaid: number | null;
  /** Canonical FCF = operatingCashFlow - |capex|. */
  readonly freeCashFlow: number | null;
  /** Whether source is direct or indirect presentation, when known. */
  readonly presentation: 'DIRECT' | 'INDIRECT' | 'UNKNOWN';
  readonly reportType: EarningsReportType;
  readonly period: FinancialPeriod;
  readonly reasons: StatementReasonMap;
  readonly lineage: EarningsLineage;
}

// ---------------------------------------------------------------------------
// 5. EPS / shares
// ---------------------------------------------------------------------------

export interface EpsResult {
  readonly symbol: string;
  readonly period: FinancialPeriod;
  readonly reportType: EarningsReportType;
  readonly netProfit: number | null;
  readonly parentNetProfit: number | null;
  readonly weightedShares: number | null;
  /** Split/bonus/rights-adjusted comparable share count when Phase 23 data is supplied. */
  readonly comparableShares: number | null;
  readonly basicEps: number | null;
  readonly dilutedEps: number | null;
  /** Basic EPS on a corporate-action-adjusted share base (historical comparability). */
  readonly adjustedBasicEps: number | null;
  readonly reason?: DataUnavailableReasonCode;
  readonly lineage: EarningsLineage;
}

// ---------------------------------------------------------------------------
// 6. Growth / margins / quality
// ---------------------------------------------------------------------------

export type GrowthBasis = 'YOY' | 'QOQ' | 'TTM_YOY' | 'YTD';

export interface GrowthMetric {
  readonly basis: GrowthBasis;
  readonly currentPeriod: FinancialPeriod | null;
  readonly priorPeriod: FinancialPeriod | null;
  readonly current: number | null;
  readonly prior: number | null;
  /** Percentage change; null when undefined (missing or zero/negative denominator). */
  readonly percent: number | null;
  readonly reason?: DataUnavailableReasonCode;
}

export interface GrowthResult {
  readonly symbol: string;
  readonly revenue: GrowthMetric;
  readonly netProfit: GrowthMetric;
  readonly parentNetProfit: GrowthMetric;
  readonly eps: GrowthMetric;
  readonly ttmRevenue: number | null;
  readonly ttmNetProfit: number | null;
  readonly lineage: EarningsLineage;
}

export interface MarginResult {
  readonly grossMargin: number | null;
  readonly operatingMargin: number | null;
  readonly ebitdaMargin: number | null;
  readonly netMargin: number | null;
  readonly fcfMargin: number | null;
  readonly reasons: StatementReasonMap;
  readonly lineage: EarningsLineage;
}

export type EarningsQualityClassification =
  | 'PROFIT_SUPPORTED_BY_CASH'
  | 'PROFIT_PARTIALLY_SUPPORTED'
  | 'LOW_CASH_CONVERSION'
  | 'INDETERMINATE';

export interface EarningsQualityResult {
  readonly cashConversion: number | null;
  readonly accrualRatio: number | null;
  readonly receivablesGrowth: number | null;
  readonly inventoryGrowth: number | null;
  readonly oneOffRatio: number | null;
  readonly nonOperatingIntensity: number | null;
  readonly fcfQuality: number | null;
  readonly classification: EarningsQualityClassification;
  readonly adjustedForRestatement: boolean;
  readonly warnings: readonly string[];
  readonly reasons: StatementReasonMap;
  readonly lineage: EarningsLineage;
}

// ---------------------------------------------------------------------------
// 7. Earnings calendar
// ---------------------------------------------------------------------------

export type EarningsCalendarStatus = 'ANNOUNCED' | 'EXPECTED' | 'UNKNOWN';

export interface EarningsCalendarEntry {
  readonly symbol: string;
  readonly period: FinancialPeriod;
  readonly status: EarningsCalendarStatus;
  /** ISO date YYYY-MM-DD, or null when unknown. NEVER fabricated. */
  readonly reportDate: string | null;
  readonly source: string | null;
  readonly sourceTier: SourceTier | null;
  readonly publicationTimestamp: string | null;
  readonly freshness: DataFreshnessStatus;
  readonly reason?: DataUnavailableReasonCode;
  readonly lineage: EarningsLineage;
}

// ---------------------------------------------------------------------------
// 8. Restatement / version store
// ---------------------------------------------------------------------------

export interface RestatementSelection {
  readonly symbol: string;
  readonly statementType: EarningsStatementType;
  readonly reportType: EarningsReportType;
  readonly periodId: string;
  /** Latest authoritative fact (ORIGINAL < AMENDED < RESTATED, then latest publication). */
  readonly latest: CanonicalFinancialFact | null;
  /** Full ordered version lineage (append-only). */
  readonly versions: readonly CanonicalFinancialFact[];
  readonly status: RestatementStatus | null;
  readonly reason?: DataUnavailableReasonCode;
}

// ---------------------------------------------------------------------------
// 9. Aggregate snapshot
// ---------------------------------------------------------------------------

export interface EarningsSnapshot {
  readonly symbol: string;
  readonly asOfDate: string;
  readonly dataFreshness: DataFreshnessStatus;
  readonly fetchedAt: string;
  readonly sourceTimestamp: number | null;
  readonly reportType: EarningsReportType;
  readonly period: FinancialPeriod | null;
  readonly incomeStatement: IncomeStatement | null;
  readonly balanceSheet: BalanceSheet | null;
  readonly cashFlow: CashFlowStatement | null;
  readonly eps: EpsResult | null;
  readonly growth: GrowthResult | null;
  readonly margins: MarginResult | null;
  readonly earningsQuality: EarningsQualityResult | null;
  readonly restatements: readonly RestatementSelection[];
  readonly calendar: readonly EarningsCalendarEntry[];
  readonly warnings: readonly string[];
  readonly lineage: EarningsLineage;
  /**
   * PR-01 canonical lineage key (P24-D7). Populated by EarningsSnapshotBuilder
   * with the same enriched statement context as `lineage`; `lineage` is
   * retained for backward compatibility. Optional so previously persisted or
   * test-constructed snapshots remain valid.
   */
  readonly dataLineage?: EarningsLineage;
}
