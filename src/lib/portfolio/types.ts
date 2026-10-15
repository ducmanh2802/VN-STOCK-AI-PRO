/**
 * PHASE 28 — PORTFOLIO INTELLIGENCE: DOMAIN CONTRACTS
 * ====================================================
 * Canonical, deterministic, fail-closed contracts for portfolio analytics.
 *
 * Invariants:
 * - `null` ALWAYS means unavailable/insufficient — NEVER 0, NEVER a guess.
 * - Pure engines accept explicit `asOfDate` and never read the system clock.
 * - Freshness adopts PR-01: CURRENT | STALE | UNAVAILABLE | INVALID.
 * - Empty equity exposure => genuine zero risk (consistent with PortfolioRiskMetrics).
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';

export type { DataFreshnessStatus };

export type PortfolioAssetClass = 'EQUITY' | 'ETF' | 'DERIVATIVE' | 'CASH';

export type PortfolioDataStatus =
  | 'OK'
  | 'STALE'
  | 'DATA_UNAVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'INVALID';

export interface PortfolioPositionInput {
  readonly symbol: string;
  /** Quantity held (shares for equity/ETF; contracts for derivatives; VND units for cash). */
  readonly quantity: number;
  /** Mark price in VND per share (equity/ETF). Null when unavailable. */
  readonly markPrice: number | null;
  /** Average cost in VND per share (for diagnostics reference). */
  readonly averageCost?: number | null;
  /** ICB-aligned sector id (e.g. 'banking'). Null/undefined when unknown. */
  readonly sectorId?: string | null;
  readonly assetClass: PortfolioAssetClass;
}

export interface PortfolioPolicy {
  readonly maxPositionPercent?: number;
  readonly maxSectorPercent?: number;
  readonly maxAssetClassPercent?: Record<PortfolioAssetClass, number>;
  readonly topN?: number;
}

export interface MetricProvenance {
  readonly formula: string;
  readonly source: string;
  readonly asOfDate: string;
  readonly evaluatedAt: string;
  readonly window?: string;
  readonly units: string;
  readonly confidence?: string;
}

export interface PortfolioMetric<T> {
  readonly value: T | null;
  readonly status: PortfolioDataStatus;
  readonly provenance: MetricProvenance;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly warnings?: readonly string[];
}

export interface ExposureBreakdown {
  readonly totalMarketValue: number | null;
  readonly cashValue: number | null;
  readonly weights: Readonly<Record<string, number>>;
  readonly sectorExposure: Readonly<Record<string, number>>;
  readonly assetClassExposure: Readonly<Record<PortfolioAssetClass, number>>;
  readonly unmappedWeight: number;
}

export interface ConcentrationReport {
  readonly maxPositionPercent: number | null;
  readonly maxPositionSymbol: string | null;
  readonly topNPercent: number | null;
  readonly topNSymbols: readonly string[];
  readonly maxSectorPercent: number | null;
  readonly maxSectorId: string | null;
  readonly maxAssetClassPercent: number | null;
  readonly maxAssetClass: PortfolioAssetClass | null;
  /** Herfindahl-Hirschman Index on 0..10000 scale. */
  readonly hhi: number | null;
  readonly breaches: readonly string[];
  readonly withinLimits: boolean | null;
}

export type FactorKey = 'value' | 'quality' | 'momentum' | 'growth' | 'size' | 'lowVol';

export type FactorVector = Readonly<Record<FactorKey, number | null>>;

export interface FactorExposureReport {
  readonly exposure: Readonly<Record<FactorKey, number | null>>;
  /** Fraction of portfolio weight covered by factor data (0..1). */
  readonly coverage: number | null;
  readonly uncoveredSymbols: readonly string[];
}

export interface CovarianceReport {
  readonly symbols: readonly string[];
  /** Aligned observation count used (min pairwise-complete length). */
  readonly observationCount: number;
  readonly covariance: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly correlation: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly volatilities: Readonly<Record<string, number | null>>;
  readonly annualizedPortfolioVolatility: number | null;
  readonly diversificationRatio: number | null;
}

export interface BetaReport {
  readonly beta: number | null;
  readonly correlationToBenchmark: number | null;
  readonly trackingErrorAnnualized: number | null;
  readonly overlapCount: number;
}

export type AllocationMethod =
  | 'EQUAL_WEIGHT'
  | 'INVERSE_VOLATILITY'
  | 'MIN_VARIANCE'
  | 'BLACK_LITTERMAN_LITE';

export interface AllocationResult {
  readonly method: AllocationMethod;
  readonly weights: Readonly<Record<string, number>>;
  readonly fallbackUsed: boolean;
  readonly notes: readonly string[];
}

export interface ScenarioShockResult {
  readonly scenarios: Readonly<Record<string, number | null>>;
  readonly worstScenario: string | null;
  readonly worstLoss: number | null;
}

export interface BenchmarkComparison {
  readonly portfolioReturn: number | null;
  readonly benchmarkReturn: number | null;
  readonly activeReturn: number | null;
  readonly benchmarkSymbol: string;
}

export interface PortfolioDiagnostics {
  readonly verdict: 'HEALTHY' | 'WATCH' | 'CONCENTRATED' | 'DATA_LIMITED' | 'EMPTY';
  readonly reasons: readonly string[];
}

export interface PortfolioIntelligenceSnapshot {
  readonly snapshotId: string;
  readonly asOfDate: string;
  readonly evaluatedAt: string;
  readonly symbols: readonly string[];
  readonly dataFreshness: DataFreshnessStatus;
  readonly exposure: PortfolioMetric<ExposureBreakdown>;
  readonly concentration: PortfolioMetric<ConcentrationReport>;
  readonly covariance: PortfolioMetric<CovarianceReport>;
  readonly beta: PortfolioMetric<BetaReport>;
  readonly factorExposure: PortfolioMetric<FactorExposureReport>;
  readonly allocation: PortfolioMetric<Readonly<Record<AllocationMethod, AllocationResult>>>;
  readonly benchmark: PortfolioMetric<BenchmarkComparison>;
  readonly scenarios: PortfolioMetric<ScenarioShockResult>;
  readonly diagnostics: PortfolioDiagnostics;
  readonly dataLineage: {
    readonly sources: readonly string[];
    readonly engine: string;
    readonly calculationVersion: string;
  };
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
}

export const PORTFOLIO_CALCULATION_VERSION = 'v1.0.0-phase28';

export const DEFAULT_PORTFOLIO_POLICY: Required<
  Pick<PortfolioPolicy, 'maxPositionPercent' | 'maxSectorPercent' | 'topN'>
> = {
  maxPositionPercent: 20,
  maxSectorPercent: 30,
  topN: 3,
};

export const PORTFOLIO_LIMITATIONS: readonly string[] = [
  'Symbol universe is a static snapshot (VIETNAM_STOCKS_UNIVERSE); historical constituents unavailable — survivorship bias possible.',
  'KBS historical lookback may be range-limited by vendor; provider failure surfaces as UNAVAILABLE, never empty.',
  'ETF/derivatives historical availability depends on provider wiring; missing series fail closed.',
  'Factor inputs are caller-supplied; uncovered symbols reduce coverage and never get imputed.',
] as const;
