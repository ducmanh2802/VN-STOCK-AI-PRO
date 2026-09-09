/**
 * PHASE 17.2 — AI INVESTMENT RECOMMENDATION ENGINE
 * ================================================
 * Domain types and contracts for the recommendation engine.
 * These are pure TypeScript contracts — no logic, no calculations.
 *
 * STRICT RULES:
 *   - Every financial value is `number | null`. `null` ALWAYS means
 *     "data unavailable" — NEVER zero, NEVER a guess, NEVER an average.
 *   - No runtime calculations in this file.
 *   - Reuse existing project conventions (ConfidenceLevel, EvidenceConfidence, etc.).
 */

import { ConfidenceLevel, EvidenceConfidence } from './enterpriseIntelligence';

/**
 * A. Strategy / Investment Horizon
 * Defines the time horizon for the recommendation.
 */
export type InvestmentHorizon = 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';

/**
 * Human-readable labels for horizons (for UI display).
 */
export const HORIZON_LABELS: Record<InvestmentHorizon, string> = {
  SHORT_TERM: 'Ngắn hạn (1-4 tuần)',
  MEDIUM_TERM: 'Trung hạn (1-6 tháng)',
  LONG_TERM: 'Dài hạn (6-24 tháng)',
};

/**
 * Typical holding period ranges (in trading days) per horizon.
 * Used for validation/display only — not for calculation.
 */
export const HORIZON_HOLDING_DAYS: Record<InvestmentHorizon, { min: number; max: number }> = {
  SHORT_TERM: { min: 5, max: 20 },
  MEDIUM_TERM: { min: 20, max: 120 },
  LONG_TERM: { min: 120, max: 480 },
};

/**
 * B. Signal
 * Final actionable signal for the recommendation.
 * Simplified to 3 core actions (BUY/HOLD/SELL) per Phase 17.1 architecture.
 */
export type RecommendationSignal = 'BUY' | 'HOLD' | 'SELL';

/**
 * Human-readable labels for signals.
 */
export const SIGNAL_LABELS: Record<RecommendationSignal, string> = {
  BUY: 'MUA',
  HOLD: 'GIỮ',
  SELL: 'BÁN',
};

/**
 * Signal strength qualifier (optional, for nuance).
 */
export type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK';

/**
 * C. Score Breakdown
 * Component scores that feed into the overall recommendation score.
 * Each score is 0-100 or null (unavailable).
 */
export interface RecommendationScoreBreakdown {
  /** Technical analysis score (trend, momentum, indicators) */
  technical: number | null;
  /** Fundamental analysis score (growth, profitability, health, valuation) */
  fundamental: number | null;
  /** Price momentum score (relative strength, trend persistence) */
  momentum: number | null;
  /** Money flow score (foreign/institutional/retail flow, accumulation) */
  moneyFlow: number | null;
  /** Valuation attractiveness score (upside to fair value, margin of safety) */
  valuation: number | null;
  /** Risk score (volatility, drawdown, liquidity, catalysts) — higher = riskier */
  risk: number | null;
}

/**
 * Weight configuration for score aggregation (for reference/display).
 * Actual weighting logic lives in the scoring engine (Phase 17.3+).
 */
export interface ScoreWeights {
  technical: number;
  fundamental: number;
  momentum: number;
  moneyFlow: number;
  valuation: number;
  risk: number;
}

/**
 * Default weight configuration per horizon (reference only).
 */
export const DEFAULT_WEIGHTS_BY_HORIZON: Record<InvestmentHorizon, ScoreWeights> = {
  SHORT_TERM: {
    technical: 0.35,
    fundamental: 0.10,
    momentum: 0.25,
    moneyFlow: 0.20,
    valuation: 0.05,
    risk: 0.05,
  },
  MEDIUM_TERM: {
    technical: 0.25,
    fundamental: 0.30,
    momentum: 0.15,
    moneyFlow: 0.15,
    valuation: 0.10,
    risk: 0.05,
  },
  LONG_TERM: {
    technical: 0.10,
    fundamental: 0.40,
    momentum: 0.05,
    moneyFlow: 0.10,
    valuation: 0.25,
    risk: 0.10,
  },
};

/**
 * D. InvestmentRecommendation
 * The core recommendation contract produced by the engine.
 */
export interface InvestmentRecommendation {
  /** Stock symbol (e.g., 'VCB', 'FPT') */
  symbol: string;

  /** Investment horizon this recommendation applies to */
  strategy: InvestmentHorizon;

  /** Actionable signal: BUY, HOLD, or SELL */
  signal: RecommendationSignal;

  /** Optional signal strength qualifier */
  signalStrength?: SignalStrength;

  /** Overall composite score (0-100), null if insufficient data */
  score: number | null;

  /** Overall confidence in this recommendation */
  confidence: ConfidenceLevel;

  /** Current market price at generation time (VND) */
  entryPrice: number | null;

  /** Target price for the horizon (VND) */
  targetPrice: number | null;

  /** Stop-loss price (VND) */
  stopLoss: number | null;

  /** Risk:Reward ratio (e.g., 2.5 means 1:2.5) */
  riskReward: number | null;

  /** Potential upside percentage relative to entry (e.g., 20 for +20%) */
  potentialUpside?: number | null;

  /** Potential downside percentage relative to entry (e.g., 10 for -10% magnitude) */
  potentialDownside?: number | null;

  /** Risk amount per share in VND (entry - stopLoss) */
  riskAmount?: number | null;

  /** Reward amount per share in VND (target - entry) */
  rewardAmount?: number | null;

  /** Expected return percentage (e.g., 15.5 for +15.5%) */
  expectedReturn: number | null;

  /** Expected holding period in trading days */
  holdingPeriod: number | null;

  /** Key reasons supporting the recommendation */
  reasons: string[];

  /** Warnings, caveats, or risk factors */
  warnings: string[];

  /** Detailed score breakdown by component */
  scoreBreakdown: RecommendationScoreBreakdown;

  /** Evidence items supporting key conclusions (for "WHY?" traceability) */
  evidence: AnalysisEvidence[];

  /** ISO timestamp when recommendation was generated */
  generatedAt: string;

  /** Data as-of date (latest data point used) */
  asOfDate: string | null;

  /** Currency (always VND for VN market) */
  currency: 'VND';
}

/**
 * Evidence item for recommendation traceability.
 * Reuses the pattern from enterpriseIntelligence.ts
 */
export interface AnalysisEvidence {
  /** Metric or factor name */
  metric: string;
  /** Current value */
  value: number | string | null;
  /** Period/date of the value */
  period: string | null;
  /** Data source */
  source: string;
  /** How the value was derived */
  calculation: string | null;
  /** Confidence in this evidence item */
  confidence: EvidenceConfidence;
}

/**
 * E. RecommendationRanking
 * Ranking entry for a universe of stocks under a specific strategy.
 */
export interface RecommendationRanking {
  /** Investment horizon/strategy this ranking applies to */
  strategy: InvestmentHorizon;

  /** Rank position (1 = best) */
  rank: number;

  /** Stock symbol */
  symbol: string;

  /** Overall composite score (0-100) */
  score: number | null;

  /** Signal for this stock under this strategy */
  signal: RecommendationSignal;

  /** Confidence level */
  confidence: ConfidenceLevel;

  /** Optional: expected return for quick sorting */
  expectedReturn: number | null;

  /** Optional: risk:reward for quick sorting */
  riskReward: number | null;
}

/**
 * Ranking request parameters (for engine input).
 */
export interface RankingRequest {
  /** Universe of symbols to rank */
  symbols: string[];

  /** Strategy/horizon to rank for */
  strategy: InvestmentHorizon;

  /** Optional: minimum score threshold */
  minScore?: number;

  /** Optional: minimum confidence */
  minConfidence?: ConfidenceLevel;

  /** Optional: signal filter */
  signalFilter?: RecommendationSignal[];
}

/**
 * Ranking result container.
 */
export interface RankingResult {
  strategy: InvestmentHorizon;
  generatedAt: string;
  rankings: RecommendationRanking[];
  universeSize: number;
  filteredCount: number;
}

/**
 * Type guard to check if a value is a valid InvestmentHorizon.
 */
export function isInvestmentHorizon(value: unknown): value is InvestmentHorizon {
  return value === 'SHORT_TERM' || value === 'MEDIUM_TERM' || value === 'LONG_TERM';
}

/**
 * Type guard to check if a value is a valid RecommendationSignal.
 */
export function isRecommendationSignal(value: unknown): value is RecommendationSignal {
  return value === 'BUY' || value === 'HOLD' || value === 'SELL';
}

/**
 * Type guard to check if a value is a valid ConfidenceLevel.
 * Reuses the type from enterpriseIntelligence.
 */
export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}