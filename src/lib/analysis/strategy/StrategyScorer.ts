/**
 * PHASE 17.3 — STRATEGY SCORING ENGINE
 * =====================================
 * Computes a normalized strategy score (0-100) from analysis engine results
 * using horizon-specific weights.
 *
 * STRICT RULES:
 *   - Pure functions, stateless, deterministic.
 *   - No mock data, no provider changes, no DB access.
 *   - Missing data is handled by renormalizing weights of available components.
 *   - Risk score is inverted for the final composite (lower risk = higher score).
 *   - Final score is clamped to [0, 100].
 */

import type {
  InvestmentHorizon,
  ScoreWeights,
  RecommendationScoreBreakdown,
} from '../../../types/recommendation.ts';
import { DEFAULT_WEIGHTS_BY_HORIZON } from '../../../types/recommendation.ts';

// ---------------------------------------------------------------------------
// Input / Output contracts
// ---------------------------------------------------------------------------

/**
 * Raw scores from analysis engines.
 * Every field is `number | null`. `null` means data unavailable.
 */
export interface StrategyScoringInput {
  technicalScore: number | null;
  fundamentalScore: number | null;
  momentumScore: number | null;
  moneyFlowScore: number | null;
  valuationScore: number | null;
  riskScore: number | null;
}

/**
 * Weighted contribution of a single component.
 */
export interface ComponentContribution {
  /** Raw component score (as provided by the engine) */
  score: number | null;
  /** Original strategy weight (before renormalization) */
  weight: number;
  /** Normalized weight after excluding missing components */
  normalizedWeight: number | null;
  /** Weighted contribution to the final score */
  weightedScore: number | null;
}

/**
 * Complete strategy scoring result.
 */
export interface StrategyScoreResult {
  /** Strategy / horizon that was scored */
  strategy: InvestmentHorizon;
  /** Final composite score (0-100), or null if no data available */
  score: number | null;
  /** Raw component scores */
  breakdown: RecommendationScoreBreakdown;
  /** Weights used for this strategy */
  weights: ScoreWeights;
  /** Per-component contributions */
  contributions: Record<keyof ScoreWeights, ComponentContribution>;
  /** Number of components that had data */
  availableComponents: number;
  /** Sum of weights of available components (after renormalization = 1.0) */
  totalWeightUsed: number;
}

// ---------------------------------------------------------------------------
// Strategy Scorer
// ---------------------------------------------------------------------------

export class StrategyScorer {
  /**
   * Scores a stock for a given investment horizon.
   *
   * @param input - Raw component scores from analysis engines.
   * @param strategy - Investment horizon (SHORT_TERM, MEDIUM_TERM, or LONG_TERM).
   * @returns StrategyScoreResult with breakdown, contributions, and final score.
   */
  static score(input: StrategyScoringInput, strategy: InvestmentHorizon): StrategyScoreResult {
    const weights = DEFAULT_WEIGHTS_BY_HORIZON[strategy];

    // Build breakdown directly from input
    const breakdown: RecommendationScoreBreakdown = {
      technical: input.technicalScore,
      fundamental: input.fundamentalScore,
      momentum: input.momentumScore,
      moneyFlow: input.moneyFlowScore,
      valuation: input.valuationScore,
      risk: input.riskScore,
    };

    // Collect components with their weights
    const components: Array<{
      key: keyof ScoreWeights;
      score: number | null;
      weight: number;
    }> = [
      { key: 'technical', score: input.technicalScore, weight: weights.technical },
      { key: 'fundamental', score: input.fundamentalScore, weight: weights.fundamental },
      { key: 'momentum', score: input.momentumScore, weight: weights.momentum },
      { key: 'moneyFlow', score: input.moneyFlowScore, weight: weights.moneyFlow },
      { key: 'valuation', score: input.valuationScore, weight: weights.valuation },
      { key: 'risk', score: input.riskScore, weight: weights.risk },
    ];

    // Separate available vs missing
    const available = components.filter((c) => c.score !== null);
    const availableComponents = available.length;

    // Initialize contributions with nulls
    const contributions: Record<keyof ScoreWeights, ComponentContribution> = {
      technical: { score: null, weight: weights.technical, normalizedWeight: null, weightedScore: null },
      fundamental: { score: null, weight: weights.fundamental, normalizedWeight: null, weightedScore: null },
      momentum: { score: null, weight: weights.momentum, normalizedWeight: null, weightedScore: null },
      moneyFlow: { score: null, weight: weights.moneyFlow, normalizedWeight: null, weightedScore: null },
      valuation: { score: null, weight: weights.valuation, normalizedWeight: null, weightedScore: null },
      risk: { score: null, weight: weights.risk, normalizedWeight: null, weightedScore: null },
    };

    let finalScore: number | null = null;
    let totalWeightUsed = 0;

    if (availableComponents > 0) {
      // Sum of weights for available components
      const totalAvailableWeight = available.reduce((sum, c) => sum + c.weight, 0);
      totalWeightUsed = totalAvailableWeight;

      let weightedSum = 0;

      for (const c of available) {
        const normalizedWeight = c.weight / totalAvailableWeight;
        let contribution: number;

        if (c.key === 'risk') {
          // Invert risk: lower risk score (safer) → higher contribution to final score
          // RiskCatalystEngine: 0 = lowest risk, 100 = highest risk
          contribution = (100 - c.score!) * normalizedWeight;
        } else {
          contribution = c.score! * normalizedWeight;
        }

        weightedSum += contribution;

        contributions[c.key] = {
          score: c.score,
          weight: c.weight,
          normalizedWeight,
          weightedScore: contribution,
        };
      }

      // Clamp final score to [0, 100] and round to integer
      finalScore = Math.round(Math.max(0, Math.min(100, weightedSum)));
    }

    return {
      strategy,
      score: finalScore,
      breakdown,
      weights,
      contributions,
      availableComponents,
      totalWeightUsed,
    };
  }

  /**
   * Validates that a value is a valid InvestmentHorizon.
   */
  static isValidStrategy(value: unknown): value is InvestmentHorizon {
    return value === 'SHORT_TERM' || value === 'MEDIUM_TERM' || value === 'LONG_TERM';
  }
}
