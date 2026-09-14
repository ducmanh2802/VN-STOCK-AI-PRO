/**
 * PHASE 17.7 — ADVANCED STRATEGY VALIDATION & ANTI-OVERFITTING TYPES
 * ===================================================================
 * Pure TypeScript contracts for out-of-sample testing, walk-forward analysis,
 * parameter sensitivity perturbation, market regime classification, and
 * robustness assessment.
 * 
 * STRICT GOVERNANCE:
 *   - No look-ahead bias: Temporal order Train < Validation < Test.
 *   - No future regime leakage: Regimes classified using strictly past data up to T.
 *   - 100% deterministic and isolated from live Paper Trading state.
 */

import type {
  BacktestConfig,
  BacktestPerformanceMetrics,
  BacktestTrade,
  HistoricalCandle,
} from '../types.ts';

/**
 * Chronological dataset partitioning configuration
 */
export interface ChronologicalSplitConfig {
  readonly trainRatio: number;      // e.g. 0.60 (60% training)
  readonly validationRatio: number; // e.g. 0.20 (20% validation / calibration)
  readonly testRatio: number;       // e.g. 0.20 (20% out-of-sample test)
  readonly minBarsRequired: number; // Minimum total bars for valid split (default: 60)
}

/**
 * Result of chronological partitioning
 */
export interface ChronologicalSplitResult {
  readonly trainCandles: readonly HistoricalCandle[];
  readonly validationCandles: readonly HistoricalCandle[];
  readonly testCandles: readonly HistoricalCandle[];
  readonly isChronologicallyValid: boolean;
  readonly totalBars: number;
  readonly dateRange: {
    readonly trainStart: string;
    readonly trainEnd: string;
    readonly valStart: string | null;
    readonly valEnd: string | null;
    readonly testStart: string;
    readonly testEnd: string;
  };
}

/**
 * In-Sample vs Out-of-Sample comparison metrics
 */
export interface OOSComparisonResult {
  readonly inSampleMetrics: BacktestPerformanceMetrics;
  readonly outOfSampleMetrics: BacktestPerformanceMetrics;
  readonly returnDegradationPct: number; // IS return - OOS return
  readonly winRateDeltaPct: number;      // OOS win rate - IS win rate
  readonly isOosProfitable: boolean;
  readonly isOosDegraded: boolean;       // true if OOS return < 0 while IS return > 0, or degradation > 50%
  readonly degradationRatio: number | null; // OOS return / IS return (null if IS return <= 0)
}

/**
 * Walk-Forward rolling window configuration
 */
export interface WalkForwardConfig {
  readonly windowCount: number; // e.g. 3 or 4 rolling windows
  readonly trainBars: number;   // Bars per training window (e.g. 60)
  readonly testBars: number;    // Bars per out-of-sample window (e.g. 20)
  readonly stepBars?: number;   // Step forward per window (defaults to testBars)
}

/**
 * Result for a single walk-forward window
 */
export interface WalkForwardWindowResult {
  readonly windowIndex: number;
  readonly trainDateRange: { readonly from: string; readonly to: string };
  readonly testDateRange: { readonly from: string; readonly to: string };
  readonly trainMetrics: BacktestPerformanceMetrics;
  readonly testMetrics: BacktestPerformanceMetrics;
  readonly isTestProfitable: boolean;
  readonly isDegraded: boolean;
}

/**
 * Aggregate walk-forward evaluation summary
 */
export interface WalkForwardSummary {
  readonly windows: readonly WalkForwardWindowResult[];
  readonly aggregateOosReturnPct: number;
  readonly aggregateOosWinRatePct: number;
  readonly profitableWindowRatio: number; // 0.0 to 1.0 (e.g. 0.75 = 3 of 4 windows profitable)
  readonly isWalkForwardStable: boolean;
}

/**
 * Realistic friction stress testing scenarios
 */
export type FrictionScenario = 'BASE' | 'BASE_PLUS_SLIPPAGE' | 'HIGH_SLIPPAGE';

export interface FrictionScenarioResult {
  readonly scenario: FrictionScenario;
  readonly config: BacktestConfig;
  readonly metrics: BacktestPerformanceMetrics;
  readonly grossReturnPct: number;
  readonly netReturnPct: number;
  readonly frictionDragPct: number; // grossReturn - netReturn
  readonly isNetProfitable: boolean;
}

export interface FrictionStressSummary {
  readonly scenarios: readonly FrictionScenarioResult[];
  readonly survivesBaseFriction: boolean;
  readonly survivesHighSlippage: boolean;
  readonly isFrictionFragile: boolean; // Profitable gross but negative net under baseline friction
  readonly totalFrictionDragPct: number;
}

/**
 * Parameter perturbation analysis
 */
export interface ParameterPerturbationResult {
  readonly parameterName: string;
  readonly baselineValue: number;
  readonly testedValues: readonly number[];
  readonly results: readonly {
    readonly value: number;
    readonly totalReturnPct: number;
    readonly winRatePct: number;
    readonly maxDrawdownPct: number;
    readonly totalTrades: number;
  }[];
  readonly isStable: boolean;
  readonly maxReturnSpreadPct: number; // maxReturn - minReturn across perturbations
}

export interface ParameterSensitivitySummary {
  readonly perturbations: readonly ParameterPerturbationResult[];
  readonly overallParameterStability: boolean;
  readonly overfitRiskFlag: boolean; // Flagged if small perturbation collapses return by > 50%
}

/**
 * Market Regime classification and evaluation
 */
export type MarketRegimeType =
  | 'BULL_TREND'
  | 'BEAR_TREND'
  | 'SIDEWAYS_VOLATILE'
  | 'SIDEWAYS_QUIET';

export interface RegimeAnalysisResult {
  readonly regime: MarketRegimeType;
  readonly totalBars: number;
  readonly tradeCount: number;
  readonly winRatePct: number;
  readonly netReturnPct: number;
  readonly maxDrawdownPct: number;
  readonly profitFactor: number | null;
}

export interface RegimeRobustnessSummary {
  readonly regimes: readonly RegimeAnalysisResult[];
  readonly dominantRegime: MarketRegimeType;
  readonly isProfitableInBull: boolean;
  readonly isProfitableInBear: boolean;
  readonly isProfitableInSideways: boolean;
  readonly isRegimeDependent: boolean; // Profitable in only 1 regime, severely negative in others
}

/**
 * Trade return distribution and concentration analysis
 */
export interface TradeDistributionAnalysis {
  readonly totalTrades: number;
  readonly winningTrades: number;
  readonly losingTrades: number;
  readonly medianReturnPct: number;
  readonly worstTradeReturnPct: number;
  readonly bestTradeReturnPct: number;
  readonly maxConsecutiveLosses: number;
  readonly top3ProfitSharePct: number; // Percentage of total net profit generated by top 3 winning trades
  readonly concentrationRiskFlag: boolean; // true if top 3 trades account for >= 80% of net profits
}

/**
 * Statistical sample-size confidence classification
 */
export type SampleSizeClassification =
  | 'HIGH_CONFIDENCE'     // >= 30 completed trades
  | 'MODERATE_CONFIDENCE' // 15-29 completed trades
  | 'LOW_CONFIDENCE'      // 5-14 completed trades
  | 'INSUFFICIENT_SAMPLE'; // < 5 completed trades

export interface SampleSizeAssessment {
  readonly totalTrades: number;
  readonly classification: SampleSizeClassification;
  readonly description: string;
}

/**
 * Final conservative robustness classification
 */
export type RobustnessClassification =
  | 'ROBUST'
  | 'CONDITIONALLY_ROBUST'
  | 'FRAGILE'
  | 'INSUFFICIENT_DATA'
  | 'FAILED';

/**
 * Comprehensive Research Output Contract (Phase 17.7)
 */
export interface StrategyRobustnessReport {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly symbol: string;
  readonly datasetSummary: {
    readonly totalBars: number;
    readonly fromDate: string;
    readonly toDate: string;
  };
  readonly chronologicalSplit: ChronologicalSplitResult;
  readonly oosComparison: OOSComparisonResult;
  readonly walkForward: WalkForwardSummary;
  readonly frictionStress: FrictionStressSummary;
  readonly parameterSensitivity: ParameterSensitivitySummary;
  readonly regimeRobustness: RegimeRobustnessSummary;
  readonly distributionAnalysis: TradeDistributionAnalysis;
  readonly sampleSize: SampleSizeAssessment;
  readonly verdict: RobustnessClassification;
  readonly warnings: readonly string[];
  readonly recommendations: readonly string[];
  readonly deterministicAudit: {
    readonly evaluatedAtTimestamp: string;
    readonly executionTimingVerified: boolean;
    readonly lookAheadChecked: boolean;
    readonly isolationVerified: boolean;
  };
}
