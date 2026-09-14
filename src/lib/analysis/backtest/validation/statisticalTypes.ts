/**
 * PHASE 17.8 — STATISTICAL SIGNIFICANCE, MONTE CARLO & REALITY CHECK TYPES
 * =========================================================================
 * Mathematical contracts for deterministic Monte Carlo simulation, bootstrap
 * confidence intervals, edge consistency tests, benchmark comparisons, and
 * reality check validation.
 * 
 * STRICT GOVERNANCE:
 *   - No Math.random() — all simulations require explicit seed.
 *   - Preserves all transaction friction (commissions, 0.1% tax, slippage).
 *   - Research infrastructure only — no live execution or order mutation.
 *   - Fail-closed evaluation.
 */

import type { BacktestPerformanceMetrics, BacktestTrade, HistoricalCandle } from '../types.ts';
import type { StrategyRobustnessReport } from './types.ts';

/**
 * Statistical sample-size power tier
 */
export type StatisticalPowerTier =
  | 'INSUFFICIENT_DATA'          // < 30 trades
  | 'LOW_STATISTICAL_POWER'      // 30-49 trades
  | 'MODERATE_STATISTICAL_POWER' // 50-99 trades
  | 'ADEQUATE_STATISTICAL_POWER'; // 100+ trades

export interface SamplePowerAssessment {
  readonly sampleSize: number;
  readonly tier: StatisticalPowerTier;
  readonly description: string;
  readonly isSufficientForInference: boolean;
}

/**
 * Percentile summary for a numerical distribution
 */
export interface DistributionPercentiles {
  readonly mean: number;
  readonly median: number;
  readonly p5: number;
  readonly p25: number;
  readonly p75: number;
  readonly p95: number;
  readonly min: number;
  readonly max: number;
}

/**
 * Monte Carlo Trade Ordering & Resampling Distribution Results
 */
export interface MonteCarloSimulationResult {
  readonly iterations: number;
  readonly seed: number;
  readonly initialCapital: number;

  /**
   * Return distribution across simulations (%)
   */
  readonly returnDistribution: {
    readonly median: number;
    readonly mean: number;
    readonly p5: number;
    readonly p25: number;
    readonly p75: number;
    readonly p95: number;
  };

  /**
   * Maximum Drawdown distribution across simulations (%)
   */
  readonly drawdownDistribution: {
    readonly median: number;
    readonly p75: number;
    readonly p95: number;
    readonly worst: number;
  };

  /**
   * Ending Equity distribution across simulations (VND)
   */
  readonly endingEquityDistribution: {
    readonly median: number;
    readonly p5: number;
    readonly p95: number;
  };

  /**
   * Consecutive Loss Streak distribution
   */
  readonly consecutiveLossDistribution: {
    readonly median: number;
    readonly p95: number;
    readonly worst: number;
  };

  /**
   * Probability / Frequency diagnostics
   */
  readonly negativeReturnFrequencyPct: number; // P(simulated final return < 0) * 100
  readonly severeDrawdownFrequencies: {
    readonly pMddExceeds10Pct: number; // P(MDD > 10%) * 100
    readonly pMddExceeds20Pct: number; // P(MDD > 20%) * 100
    readonly pMddExceeds30Pct: number; // P(MDD > 30%) * 100
  };

  /**
   * Trade-Order Permutation sensitivity (pure sequencing effects without resampling)
   */
  readonly orderPermutationSensitivity: {
    readonly baselineMddPct: number;
    readonly medianPermutedMddPct: number;
    readonly p95PermutedMddPct: number;
    readonly worstPermutedMddPct: number;
    readonly mddSpreadPct: number; // worstPermutedMddPct - baselineMddPct
    readonly sequenceInstabilityFlag: boolean; // true if permuted MDD exceeds baseline by > 15%
  };
}

/**
 * Single confidence interval
 */
export interface MetricConfidenceInterval {
  readonly metricName: string;
  readonly pointEstimate: number;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly confidenceLevelPct: number; // e.g. 95
  readonly spansZero: boolean; // true if lower <= 0 and upper >= 0
}

/**
 * Bootstrap Confidence Interval Analysis
 */
export interface BootstrapConfidenceIntervals {
  readonly iterations: number;
  readonly seed: number;
  readonly confidenceLevelPct: number;
  readonly meanTradeReturnPct: MetricConfidenceInterval;
  readonly winRatePct: MetricConfidenceInterval;
  readonly expectancyPct: MetricConfidenceInterval;
  readonly profitFactor: MetricConfidenceInterval | null;
}

/**
 * Benchmark Comparison against Buy-and-Hold
 */
export interface BenchmarkComparisonResult {
  readonly benchmarkName: string;
  readonly strategyReturnPct: number;
  readonly benchmarkReturnPct: number;
  readonly excessReturnPct: number; // strategy - benchmark
  readonly strategyMaxDrawdownPct: number;
  readonly benchmarkMaxDrawdownPct: number;
  readonly drawdownAdvantagePct: number; // benchmark MDD - strategy MDD (positive = strategy had less drawdown)
  readonly returnToDrawdownRatio: number | null;
  readonly benchmarkReturnToDrawdownRatio: number | null;
  readonly outperformedBenchmark: boolean;
  readonly notes: string;
}

/**
 * Risk-Adjusted Comparison
 */
export interface RiskAdjustedMetrics {
  readonly sharpeRatio: number | null;
  readonly sortinoRatio: number | null;
  readonly calmarRatio: number | null; // return / maxDrawdown
  readonly annualRiskFreeRatePct: number;
  readonly riskFreeRateAssumptionDocumented: string;
}

/**
 * Metrics measured for an exceptional-trade removal subset
 */
export interface TradeSubsetMetrics {
  readonly subsetName: string;
  readonly tradesRemaining: number;
  readonly totalReturnPct: number;
  readonly netProfit: number;
  readonly expectancyPct: number;
  readonly profitFactor: number | null;
  readonly maxDrawdownPct: number;
  readonly winRatePct: number;
}

/**
 * Edge Consistency Test (Excluding exceptional trades)
 */
export interface EdgeConsistencyResult {
  readonly fullTradeSet: TradeSubsetMetrics;
  readonly excludingBestTrade: TradeSubsetMetrics;
  readonly excludingTop3Trades: TradeSubsetMetrics;
  readonly excludingWorstTrade: TradeSubsetMetrics;
  readonly edgeCollapsesWithoutTopTrades: boolean; // true if excluding top 3 results in net negative return or <= 0 expectancy
  readonly returnReductionExcludingTop3Pct: number; // % drop in return when removing top 3
}

/**
 * Trade Profit Concentration Assessment
 */
export interface ProfitConcentrationResult {
  readonly totalNetProfit: number;
  readonly totalGrossProfit: number;
  readonly top1ProfitSharePct: number;
  readonly top3ProfitSharePct: number;
  readonly top5ProfitSharePct: number;
  readonly concentrationRisk: boolean; // true if top 1 >= 50% or top 3 >= 80%
  readonly diagnosticNote: string;
}

/**
 * Multiple-Testing / Data-Mining Warning
 */
export type MultipleTestingStatus =
  | 'RECORDED'
  | 'MULTIPLE_TESTING_HISTORY_UNAVAILABLE';

export interface MultipleTestingAssessment {
  readonly status: MultipleTestingStatus;
  readonly testedStrategyCount?: number;
  readonly testedParameterConfigurations?: number;
  readonly repeatedValidationAttempts?: number;
  readonly familyName?: string;
  readonly advisoryWarning: string;
}

/**
 * Reality Check Layer (Null Hypothesis Comparison)
 */
export type RealityCheckStatus =
  | 'SIGNIFICANT_EDGE_EVIDENCE'
  | 'BORDERLINE_EVIDENCE'
  | 'INCONCLUSIVE_NOISE'
  | 'STATISTICAL_TEST_NOT_APPLICABLE';

export interface RealityCheckResult {
  readonly status: RealityCheckStatus;
  readonly observedReturnPct: number;
  readonly nullDistributionMedianPct: number;
  readonly empiricalPercentileRank: number; // e.g. 98.2 (observed return was higher than 98.2% of null runs)
  readonly empiricalPValue: number | null;  // (100 - percentileRank) / 100
  readonly statisticalWarningStatus: string;
}

/**
 * Transaction Friction Integrity Verification
 */
export interface FrictionIntegrityReport {
  readonly grossProfit: number;
  readonly netProfit: number;
  readonly totalCommissionPaid: number;
  readonly totalSellTaxPaid: number;
  readonly estimatedSlippageCost: number;
  readonly totalFrictionPaid: number;
  readonly frictionDragPct: number; // (grossProfit - netProfit) / grossProfit * 100 (or absolute drag)
  readonly isNetProfitable: boolean;
  readonly commissionRateUsedPct: number;
  readonly sellTaxRateUsedPct: number;
  readonly slippageRateUsedPct: number;
}

/**
 * Final Statistical Significance Classification
 */
export type FinalStatisticalClassification =
  | 'STATISTICALLY_SUPPORTED'
  | 'CONDITIONALLY_SUPPORTED'
  | 'WEAK_EVIDENCE'
  | 'FRAGILE_EDGE'
  | 'INSUFFICIENT_DATA'
  | 'FAILED'
  | 'BLOCKED';

/**
 * Comprehensive Statistical Significance Report (Phase 17.8)
 */
export interface StrategyStatisticalReport {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly symbol: string;
  readonly evaluationTimestamp: string;

  /**
   * Sample Size & Power
   */
  readonly samplePower: SamplePowerAssessment;

  /**
   * Observed Core Trading Metrics
   */
  readonly observedMetrics: {
    readonly totalTrades: number;
    readonly totalReturnPct: number;
    readonly netProfit: number;
    readonly meanTradeReturnPct: number;
    readonly medianTradeReturnPct: number;
    readonly standardDeviationPct: number;
    readonly winRatePct: number;
    readonly profitFactor: number | null;
    readonly maxDrawdownPct: number;
    readonly expectancyPct: number;
    readonly bestTradeReturnPct: number;
    readonly worstTradeReturnPct: number;
    readonly maxConsecutiveLosses: number;
    readonly totalCommissionPaid: number;
    readonly totalTaxPaid: number;
  };

  /**
   * Risk-Adjusted Performance
   */
  readonly riskAdjusted: RiskAdjustedMetrics;

  /**
   * Monte Carlo Trade-Order & Resampling Simulation
   */
  readonly monteCarlo: MonteCarloSimulationResult;

  /**
   * Bootstrap Confidence Intervals
   */
  readonly bootstrapCI: BootstrapConfidenceIntervals | null;

  /**
   * Benchmark Comparison
   */
  readonly benchmarkComparison: BenchmarkComparisonResult | null;

  /**
   * Edge Consistency Test (Excluding exceptional trades)
   */
  readonly edgeConsistency: EdgeConsistencyResult;

  /**
   * Profit Concentration
   */
  readonly profitConcentration: ProfitConcentrationResult;

  /**
   * Multiple-Testing / Data-Mining Assessment
   */
  readonly multipleTesting: MultipleTestingAssessment;

  /**
   * Reality Check (Null Hypothesis Permutation)
   */
  readonly realityCheck: RealityCheckResult;

  /**
   * Friction Integrity
   */
  readonly frictionIntegrity: FrictionIntegrityReport;

  /**
   * Final Classification & Verdict
   */
  readonly classification: FinalStatisticalClassification;
  readonly keyFindings: readonly string[];
  readonly limitations: readonly string[];
  readonly governanceAudit: {
    readonly lookAheadFree: boolean;
    readonly transactionFrictionPreserved: boolean;
    readonly seededDeterminismVerified: boolean;
    readonly executionTimingIsolated: boolean;
    readonly noProductionMocks: boolean;
  };
}

/**
 * Options for running statistical validation
 */
export interface StatisticalValidationOptions {
  readonly seed?: number;
  readonly monteCarloIterations?: number;  // default: 1000
  readonly bootstrapIterations?: number;   // default: 1000
  readonly confidenceLevel?: number;        // default: 0.95 (95%)
  readonly annualRiskFreeRate?: number;     // default: 0.045 (4.5% VN deposit rate)
  readonly severeDrawdownThresholds?: readonly number[]; // default: [10, 20, 30]
  readonly experimentationHistory?: {
    readonly testedStrategyCount?: number;
    readonly testedParameterConfigurations?: number;
    readonly repeatedValidationAttempts?: number;
    readonly familyName?: string;
  };
}
