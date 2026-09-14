/**
 * PHASE 17.9 — CROSS-ASSET / CROSS-PERIOD / CROSS-REGIME VALIDATION TYPES
 * =========================================================================
 * Mathematical contracts for evaluating whether a strategy edge generalizes
 * across multiple independent assets, chronological periods, and market regimes.
 * 
 * STRICT GOVERNANCE:
 *   - No parameter optimization or per-asset/regime tuning.
 *   - Research infrastructure only — no live execution or order mutation.
 *   - Fail-closed evaluation.
 *   - 100% deterministic (no Math.random()).
 *   - Transaction friction preserved (0.15% comm, 0.10% tax, 0.10% slippage).
 */

import type { BacktestTrade, HistoricalCandle } from '../types.ts';
import type { MarketRegimeType } from './types.ts';
import type { FinalStatisticalClassification, StatisticalPowerTier } from './statisticalTypes.ts';

/**
 * Conservative Generalization Classification
 */
export type GeneralizationClassification =
  | 'GENERALIZES_WELL'
  | 'CONDITIONALLY_GENERALIZES'
  | 'ASSET_DEPENDENT'
  | 'PERIOD_DEPENDENT'
  | 'REGIME_DEPENDENT'
  | 'WEAK_GENERALIZATION'
  | 'INSUFFICIENT_DATA'
  | 'FAILED'
  | 'BLOCKED';

/**
 * Chronological evaluation periods for cross-period analysis
 */
export type GeneralizationEvaluationPeriod =
  | 'EARLY_PERIOD'
  | 'MIDDLE_PERIOD'
  | 'RECENT_PERIOD';

/**
 * Status of regime testing based on statistical adequacy and performance
 */
export type RegimeTestingStatus =
  | 'NOT_TESTED'
  | 'INSUFFICIENT_DATA'
  | 'TESTED_POSITIVE'
  | 'TESTED_NEGATIVE';

/**
 * Dispersion statistics for an array of metrics
 */
export interface MetricDispersion {
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly stdDev: number;
}

/**
 * Input dataset for an individual asset
 */
export interface AssetDatasetInput {
  readonly symbol: string;
  readonly candles: readonly HistoricalCandle[];
  readonly trades?: readonly BacktestTrade[];
}

/**
 * Validation result for an individual asset
 */
export interface AssetValidationResult {
  readonly symbol: string;
  readonly tradeCount: number;
  readonly totalReturnPct: number;
  readonly annualizedReturnPct: number | null;
  readonly winRatePct: number;
  readonly expectancyPct: number;
  readonly profitFactor: number | null;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number | null;
  readonly calmarRatio: number | null;
  readonly netProfit: number;
  readonly frictionAdjustedReturnPct: number;
  readonly statisticalPowerTier: StatisticalPowerTier;
  readonly statisticalClassification?: FinalStatisticalClassification;
  readonly isProfitable: boolean;
}

/**
 * Aggregate summary across tested assets
 */
export interface CrossAssetGeneralizationSummary {
  readonly testedAssets: number;
  readonly successfulAssets: number;
  readonly failedAssets: number;
  readonly positiveReturnAssetRatio: number;
  readonly positiveExpectancyAssetRatio: number;
  readonly profitableAssetRatio: number;
  readonly assetDetails: readonly AssetValidationResult[];
  readonly returnDispersion: MetricDispersion;
  readonly winRateDispersion: MetricDispersion;
  readonly drawdownDispersion: MetricDispersion;
  readonly topAssetContributionPct: number;
  readonly top3AssetContributionPct: number;
  readonly assetConcentrationRisk: boolean;
  readonly dominantAsset: string | null;
}

/**
 * Validation result for a single chronological period
 */
export interface PeriodValidationResult {
  readonly period: GeneralizationEvaluationPeriod;
  readonly fromDate: string;
  readonly toDate: string;
  readonly totalTrades: number;
  readonly totalReturnPct: number;
  readonly winRatePct: number;
  readonly expectancyPct: number;
  readonly profitFactor: number | null;
  readonly maxDrawdownPct: number;
  readonly netProfit: number;
  readonly calmarRatio: number | null;
  readonly statisticalPowerTier: StatisticalPowerTier;
  readonly isProfitable: boolean;
}

/**
 * Aggregate summary across chronological periods
 */
export interface CrossPeriodGeneralizationSummary {
  readonly periods: readonly PeriodValidationResult[];
  readonly positivePeriodRatio: number;
  readonly medianPeriodReturnPct: number;
  readonly bestPeriodReturnPct: number;
  readonly worstPeriodReturnPct: number;
  readonly returnDispersionPct: number;
  readonly recentDegradation: boolean;
  readonly historicalEdgeRisk: boolean;
  readonly isTemporallyConsistent: boolean;
}

/**
 * Validation result for a single market regime
 */
export interface RegimeValidationResult {
  readonly regime: MarketRegimeType;
  readonly tradeCount: number;
  readonly totalReturnPct: number;
  readonly winRatePct: number;
  readonly expectancyPct: number;
  readonly profitFactor: number | null;
  readonly maxDrawdownPct: number;
  readonly netProfit: number;
  readonly status: RegimeTestingStatus;
  readonly isProfitable: boolean;
}

/**
 * Aggregate summary across market regimes
 */
export interface CrossRegimeGeneralizationSummary {
  readonly regimes: readonly RegimeValidationResult[];
  readonly testedRegimes: number;
  readonly adequatelySampledRegimes: number;
  readonly positiveRegimeRatio: number;
  readonly regimeDependent: boolean;
  readonly regimeFailure: boolean;
  readonly dominantRegime: MarketRegimeType | null;
}

/**
 * Diagnostic matrix cell for cross-dimensional mapping
 */
export interface CrossDimensionCell {
  readonly status: 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA' | 'NOT_TESTED';
  readonly returnPct: number;
  readonly tradeCount: number;
}

/**
 * Cross-dimensional diagnostic matrix (Dimensions x Assets)
 */
export interface CrossDimensionMatrix {
  readonly rowHeaders: readonly string[]; // ['Early Period', 'Middle Period', 'Recent Period', 'Bull Regime', 'Bear Regime', 'Sideways Volatile', 'Sideways Quiet']
  readonly colHeaders: readonly string[]; // ['VNM', 'HPG', ...]
  readonly grid: Record<string, Record<string, CrossDimensionCell>>;
}

/**
 * Research Generalization Diagnostic Score (0 - 100)
 */
export interface GeneralizationScoreBreakdown {
  readonly totalScore: number;
  readonly assetCoverageScore: number;        // 0 - 30
  readonly periodConsistencyScore: number;    // 0 - 25
  readonly regimeCoverageScore: number;        // 0 - 25
  readonly statisticalPowerScore: number;      // 0 - 20
  readonly penalties: {
    readonly concentrationPenalty: number;      // 0 or -15
    readonly recentDegradationPenalty: number;  // 0 or -15
    readonly regimeFailurePenalty: number;      // 0 or -15
  };
  readonly notice: 'RESEARCH_DIAGNOSTIC_ONLY';
}

/**
 * Complete Phase 17.9 Generalization Validation Report
 */
export interface CrossGeneralizationReport {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly crossAsset: CrossAssetGeneralizationSummary;
  readonly crossPeriod: CrossPeriodGeneralizationSummary;
  readonly crossRegime: CrossRegimeGeneralizationSummary;
  readonly matrix: CrossDimensionMatrix;
  readonly score: GeneralizationScoreBreakdown;
  readonly classification: GeneralizationClassification;
  readonly keyFindings: readonly string[];
  readonly limitations: readonly string[];
  readonly governanceAudit: {
    readonly noLookAhead: boolean;
    readonly noActiveBarLeakage: boolean;
    readonly nextBarOpenExecution: boolean;
    readonly deterministicValidation: boolean;
    readonly frictionPreserved: boolean;
    readonly noProductionMock: boolean;
    readonly noExecutionMutation: boolean;
    readonly noStrategyOptimization: boolean;
  };
}

/**
 * Options for running cross-generalization validation
 */
export interface CrossGeneralizationOptions {
  readonly seed?: number;
  readonly initialCapital?: number; // default: 100,000,000 VND
  readonly commissionRate?: number; // default: 0.0015
  readonly taxRate?: number;        // default: 0.0010
  readonly slippageRate?: number;   // default: 0.0010
  readonly annualRiskFreeRate?: number; // default: 0.045
}
