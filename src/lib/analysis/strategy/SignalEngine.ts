/**
 * PHASE 17.4 — INVESTMENT SIGNAL ENGINE
 * ======================================
 * Converts StrategyScore (0-100) into actionable BUY/HOLD/SELL signals.
 *
 * STRICT RULES:
 *   - Pure functions, stateless, deterministic.
 *   - No mock data, no provider changes, no DB access.
 *   - No AI/LLM, no external API calls.
 *   - Does NOT recalculate scores — only maps score to signal.
 *   - Invalid scores (NaN, Infinity, null, out-of-range) are handled safely.
 *   - Centralized threshold configuration — no magic numbers.
 */

import type {
  InvestmentHorizon,
  RecommendationSignal,
} from '../../../types/recommendation.ts';
import type { StrategyScoreResult } from './StrategyScorer.ts';

// ---------------------------------------------------------------------------
// Threshold Configuration
// ---------------------------------------------------------------------------

/**
 * Signal threshold configuration for a single strategy.
 * All thresholds are inclusive on the lower bound.
 *
 * @example
 * ```ts
 * { buyMin: 70, holdMin: 40 }
 * // score >= 70  => BUY
 * // score >= 40  => HOLD
 * // score <  40  => SELL
 * ```
 */
export interface SignalThresholds {
  /** Minimum score for BUY signal (inclusive) */
  buyMin: number;
  /** Minimum score for HOLD signal (inclusive). Scores below this are SELL. */
  holdMin: number;
}

/**
 * Default signal thresholds per investment horizon.
 * These can be overridden by passing custom config to SignalEngine.
 *
 * Design rationale:
 * - SHORT_TERM: Higher buy threshold (momentum-driven, needs stronger conviction)
 * - MEDIUM_TERM: Balanced thresholds
 * - LONG_TERM: Lower buy threshold (fundamental-driven, more patient)
 */
export const DEFAULT_THRESHOLDS_BY_HORIZON: Record<InvestmentHorizon, SignalThresholds> = {
  SHORT_TERM: {
    buyMin: 65,
    holdMin: 40,
  },
  MEDIUM_TERM: {
    buyMin: 60,
    holdMin: 35,
  },
  LONG_TERM: {
    buyMin: 55,
    holdMin: 30,
  },
};

/**
 * Validates that thresholds are logically consistent.
 */
function validateThresholds(thresholds: SignalThresholds): void {
  if (thresholds.buyMin < 0 || thresholds.buyMin > 100) {
    throw new Error(`buyMin must be in [0, 100], got ${thresholds.buyMin}`);
  }
  if (thresholds.holdMin < 0 || thresholds.holdMin > 100) {
    throw new Error(`holdMin must be in [0, 100], got ${thresholds.holdMin}`);
  }
  if (thresholds.buyMin <= thresholds.holdMin) {
    throw new Error(`buyMin (${thresholds.buyMin}) must be greater than holdMin (${thresholds.holdMin})`);
  }
}

// ---------------------------------------------------------------------------
// Input / Output Contracts
// ---------------------------------------------------------------------------

/**
 * Input for signal generation.
 * Can be constructed from StrategyScoreResult or provided directly.
 */
export interface SignalEngineInput {
  /** Strategy / investment horizon */
  strategy: InvestmentHorizon;
  /** Composite strategy score (0-100), or null if unavailable */
  score: number | null;
  /** Optional: override default thresholds for this strategy */
  customThresholds?: SignalThresholds;
}

/**
 * Complete signal generation result.
 * Provides full transparency: score, thresholds used, and deterministic reason.
 */
export interface SignalEngineResult {
  /** Strategy / investment horizon */
  strategy: InvestmentHorizon;
  /** Input score (may be null) */
  score: number | null;
  /** Generated signal: BUY, HOLD, or SELL */
  signal: RecommendationSignal;
  /** Thresholds that were applied */
  thresholds: SignalThresholds;
  /** Human-readable, deterministic explanation */
  reason: string;
  /** Whether the score was valid for signal generation */
  isValid: boolean;
}

/**
 * Type guard for valid finite score.
 */
function isValidScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

// ---------------------------------------------------------------------------
// Signal Engine
// ---------------------------------------------------------------------------

export class SignalEngine {
  /**
   * Generates an investment signal from a strategy score.
   *
   * @param input - Strategy, score, and optional custom thresholds.
   * @returns SignalEngineResult with signal, thresholds used, and reason.
   *
   * @example
   * ```ts
   * const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 78 });
   * // { strategy: 'SHORT_TERM', score: 78, signal: 'BUY', thresholds: { buyMin: 65, holdMin: 40 }, reason: 'Strategy score 78 is above the BUY threshold (65).', isValid: true }
   * ```
   */
  static generate(input: SignalEngineInput): SignalEngineResult {
    const { strategy, score, customThresholds } = input;

    // Resolve thresholds: custom > default
    const thresholds = customThresholds ?? DEFAULT_THRESHOLDS_BY_HORIZON[strategy];
    validateThresholds(thresholds);

    // Handle invalid/missing score
    if (!isValidScore(score)) {
      const reason = this.buildInvalidScoreReason(score);
      return {
        strategy,
        score,
        signal: 'SELL', // Safe default for invalid score — conservative stance
        thresholds,
        reason,
        isValid: false,
      };
    }

    // Valid score: apply threshold logic
    const { buyMin, holdMin } = thresholds;
    let signal: RecommendationSignal;
    let reason: string;

    if (score >= buyMin) {
      signal = 'BUY';
      reason = `Strategy score ${score} is above the BUY threshold (${buyMin}).`;
    } else if (score >= holdMin) {
      signal = 'HOLD';
      reason = `Strategy score ${score} is between HOLD threshold (${holdMin}) and BUY threshold (${buyMin}).`;
    } else {
      signal = 'SELL';
      reason = `Strategy score ${score} is below the HOLD threshold (${holdMin}).`;
    }

    return {
      strategy,
      score,
      signal,
      thresholds,
      reason,
      isValid: true,
    };
  }

  /**
   * Generates a signal directly from a StrategyScoreResult.
   * Convenience method that extracts strategy and score.
   */
  static generateFromScoreResult(
    scoreResult: StrategyScoreResult,
    customThresholds?: SignalThresholds
  ): SignalEngineResult {
    return this.generate({
      strategy: scoreResult.strategy,
      score: scoreResult.score,
      customThresholds,
    });
  }

  /**
   * Builds a deterministic reason for invalid scores.
   */
  private static buildInvalidScoreReason(score: number | null): string {
    if (score === null) {
      return 'Score is null (insufficient data for strategy). Defaulting to SELL.';
    }
    if (Number.isNaN(score)) {
      return 'Score is NaN (invalid calculation). Defaulting to SELL.';
    }
    if (score === Infinity) {
      return 'Score is +Infinity (invalid). Defaulting to SELL.';
    }
    if (score === -Infinity) {
      return 'Score is -Infinity (invalid). Defaulting to SELL.';
    }
    if (score < 0) {
      return `Score ${score} is below valid range [0, 100]. Defaulting to SELL.`;
    }
    if (score > 100) {
      return `Score ${score} exceeds valid range [0, 100]. Defaulting to SELL.`;
    }
    return `Score ${score} is invalid. Defaulting to SELL.`;
  }

  /**
   * Validates that a value is a valid InvestmentHorizon.
   */
  static isValidStrategy(value: unknown): value is InvestmentHorizon {
    return value === 'SHORT_TERM' || value === 'MEDIUM_TERM' || value === 'LONG_TERM';
  }

  /**
   * Returns the default thresholds for a given strategy (read-only access).
   */
  static getDefaultThresholds(strategy: InvestmentHorizon): SignalThresholds {
    return { ...DEFAULT_THRESHOLDS_BY_HORIZON[strategy] };
  }

  /**
   * Returns all default thresholds (read-only access).
   */
  static getAllDefaultThresholds(): Record<InvestmentHorizon, SignalThresholds> {
    return {
      SHORT_TERM: { ...DEFAULT_THRESHOLDS_BY_HORIZON.SHORT_TERM },
      MEDIUM_TERM: { ...DEFAULT_THRESHOLDS_BY_HORIZON.MEDIUM_TERM },
      LONG_TERM: { ...DEFAULT_THRESHOLDS_BY_HORIZON.LONG_TERM },
    };
  }
}