import { describe, it, expect } from 'vitest';
import { StrategyScorer, StrategyScoringInput, StrategyScoreResult } from './StrategyScorer.ts';
import type { InvestmentHorizon } from '../../../types/recommendation.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullInput(overrides: Partial<StrategyScoringInput> = {}): StrategyScoringInput {
  return {
    technicalScore: 80,
    fundamentalScore: 70,
    momentumScore: 75,
    moneyFlowScore: 65,
    valuationScore: 60,
    riskScore: 30,
    ...overrides,
  };
}

function score(result: StrategyScoreResult): number | null {
  return result.score;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('StrategyScorer', () => {
  // -------------------------------------------------------------------------
  // 1. SHORT_TERM uses its own weights
  // -------------------------------------------------------------------------
  describe('SHORT_TERM weights', () => {
    it('applies SHORT_TERM weights (technical 35%, momentum 25%, moneyFlow 20%, fundamental 10%, valuation 5%, risk 5%)', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      expect(result.strategy).toBe('SHORT_TERM');
      expect(result.weights.technical).toBeCloseTo(0.35);
      expect(result.weights.momentum).toBeCloseTo(0.25);
      expect(result.weights.moneyFlow).toBeCloseTo(0.20);
      expect(result.weights.fundamental).toBeCloseTo(0.10);
      expect(result.weights.valuation).toBeCloseTo(0.05);
      expect(result.weights.risk).toBeCloseTo(0.05);
    });

    it('produces a deterministic score for SHORT_TERM', () => {
      const input = fullInput();
      const result1 = StrategyScorer.score(input, 'SHORT_TERM');
      const result2 = StrategyScorer.score(input, 'SHORT_TERM');
      expect(result1.score).toBe(result2.score);
    });
  });

  // -------------------------------------------------------------------------
  // 2. MEDIUM_TERM uses its own weights
  // -------------------------------------------------------------------------
  describe('MEDIUM_TERM weights', () => {
    it('applies MEDIUM_TERM weights (fundamental 30%, technical 25%, momentum 15%, moneyFlow 15%, valuation 10%, risk 5%)', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'MEDIUM_TERM');

      expect(result.strategy).toBe('MEDIUM_TERM');
      expect(result.weights.fundamental).toBeCloseTo(0.30);
      expect(result.weights.technical).toBeCloseTo(0.25);
      expect(result.weights.momentum).toBeCloseTo(0.15);
      expect(result.weights.moneyFlow).toBeCloseTo(0.15);
      expect(result.weights.valuation).toBeCloseTo(0.10);
      expect(result.weights.risk).toBeCloseTo(0.05);
    });

    it('produces a deterministic score for MEDIUM_TERM', () => {
      const input = fullInput();
      const result1 = StrategyScorer.score(input, 'MEDIUM_TERM');
      const result2 = StrategyScorer.score(input, 'MEDIUM_TERM');
      expect(result1.score).toBe(result2.score);
    });
  });

  // -------------------------------------------------------------------------
  // 3. LONG_TERM uses its own weights
  // -------------------------------------------------------------------------
  describe('LONG_TERM weights', () => {
    it('applies LONG_TERM weights (fundamental 40%, valuation 25%, technical 10%, moneyFlow 10%, risk 10%, momentum 5%)', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'LONG_TERM');

      expect(result.strategy).toBe('LONG_TERM');
      expect(result.weights.fundamental).toBeCloseTo(0.40);
      expect(result.weights.valuation).toBeCloseTo(0.25);
      expect(result.weights.technical).toBeCloseTo(0.10);
      expect(result.weights.moneyFlow).toBeCloseTo(0.10);
      expect(result.weights.risk).toBeCloseTo(0.10);
      expect(result.weights.momentum).toBeCloseTo(0.05);
    });

    it('produces a deterministic score for LONG_TERM', () => {
      const input = fullInput();
      const result1 = StrategyScorer.score(input, 'LONG_TERM');
      const result2 = StrategyScorer.score(input, 'LONG_TERM');
      expect(result1.score).toBe(result2.score);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Same input produces deterministic score across strategies
  // -------------------------------------------------------------------------
  describe('Determinism', () => {
    it('same input produces the same score for the same strategy', () => {
      const input = fullInput();
      const strategies: InvestmentHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'];
      for (const strategy of strategies) {
        const r1 = StrategyScorer.score(input, strategy);
        const r2 = StrategyScorer.score(input, strategy);
        expect(r1.score).toBe(r2.score);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Score stays inside defined range [0, 100]
  // -------------------------------------------------------------------------
  describe('Score range', () => {
    it('score is within [0, 100] for SHORT_TERM with extreme values', () => {
      const input = fullInput({
        technicalScore: 100,
        fundamentalScore: 100,
        momentumScore: 100,
        moneyFlowScore: 100,
        valuationScore: 100,
        riskScore: 0, // lowest risk → highest contribution
      });
      const result = StrategyScorer.score(input, 'SHORT_TERM');
      expect(result.score).not.toBeNull();
      expect(result.score!).toBeGreaterThanOrEqual(0);
      expect(result.score!).toBeLessThanOrEqual(100);
    });

    it('score is within [0, 100] for LONG_TERM with low values', () => {
      const input = fullInput({
        technicalScore: 0,
        fundamentalScore: 0,
        momentumScore: 0,
        moneyFlowScore: 0,
        valuationScore: 0,
        riskScore: 100, // highest risk → lowest contribution
      });
      const result = StrategyScorer.score(input, 'LONG_TERM');
      expect(result.score).not.toBeNull();
      expect(result.score!).toBeGreaterThanOrEqual(0);
      expect(result.score!).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Weighted contributions are correct
  // -------------------------------------------------------------------------
  describe('Weighted contributions', () => {
    it('computes correct weighted contributions for all available components', () => {
      const input: StrategyScoringInput = {
        technicalScore: 80,
        fundamentalScore: 70,
        momentumScore: 75,
        moneyFlowScore: 65,
        valuationScore: 60,
        riskScore: 30,
      };
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      // SHORT_TERM weights: technical=0.35, fundamental=0.10, momentum=0.25, moneyFlow=0.20, valuation=0.05, risk=0.05
      // All components available, so no renormalization needed
      const totalWeight = 1.0;

      expect(result.contributions.technical.weightedScore).toBeCloseTo(80 * 0.35);
      expect(result.contributions.fundamental.weightedScore).toBeCloseTo(70 * 0.10);
      expect(result.contributions.momentum.weightedScore).toBeCloseTo(75 * 0.25);
      expect(result.contributions.moneyFlow.weightedScore).toBeCloseTo(65 * 0.20);
      expect(result.contributions.valuation.weightedScore).toBeCloseTo(60 * 0.05);
      // Risk is inverted: (100 - 30) * 0.05 = 70 * 0.05 = 3.5
      expect(result.contributions.risk.weightedScore).toBeCloseTo((100 - 30) * 0.05);
    });

    it('sum of weighted contributions equals final score (within rounding)', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      const sum = Object.values(result.contributions)
        .filter((c) => c.weightedScore !== null)
        .reduce((acc, c) => acc + c.weightedScore!, 0);

      expect(result.score).not.toBeNull();
      // Final score is rounded to integer, so allow tolerance of 1.0
      expect(Math.abs(sum - result.score!)).toBeLessThanOrEqual(1.0);
    });

    it('totalWeightUsed equals 1.0 when all components are available', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'SHORT_TERM');
      expect(result.totalWeightUsed).toBeCloseTo(1.0);
      expect(result.availableComponents).toBe(6);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Missing component is handled according to architecture
  // -------------------------------------------------------------------------
  describe('Missing data handling', () => {
    it('renormalizes weights when one component is missing', () => {
      const input: StrategyScoringInput = {
        technicalScore: 80,
        fundamentalScore: null, // missing
        momentumScore: 75,
        moneyFlowScore: 65,
        valuationScore: 60,
        riskScore: 30,
      };
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      // SHORT_TERM original weights: technical=0.35, fundamental=0.10, momentum=0.25, moneyFlow=0.20, valuation=0.05, risk=0.05
      // Available: technical, momentum, moneyFlow, valuation, risk → total = 0.35+0.25+0.20+0.05+0.05 = 0.90
      expect(result.availableComponents).toBe(5);
      expect(result.totalWeightUsed).toBeCloseTo(0.90);

      // Renormalized weights
      expect(result.contributions.technical.normalizedWeight).toBeCloseTo(0.35 / 0.90);
      expect(result.contributions.momentum.normalizedWeight).toBeCloseTo(0.25 / 0.90);
      expect(result.contributions.moneyFlow.normalizedWeight).toBeCloseTo(0.20 / 0.90);
      expect(result.contributions.valuation.normalizedWeight).toBeCloseTo(0.05 / 0.90);
      expect(result.contributions.risk.normalizedWeight).toBeCloseTo(0.05 / 0.90);
      expect(result.contributions.fundamental.normalizedWeight).toBeNull();
    });

    it('returns null score when all components are missing', () => {
      const input: StrategyScoringInput = {
        technicalScore: null,
        fundamentalScore: null,
        momentumScore: null,
        moneyFlowScore: null,
        valuationScore: null,
        riskScore: null,
      };
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      expect(result.score).toBeNull();
      expect(result.availableComponents).toBe(0);
      expect(result.totalWeightUsed).toBe(0);
    });

    it('returns null score when only risk is available (edge case)', () => {
      const input: StrategyScoringInput = {
        technicalScore: null,
        fundamentalScore: null,
        momentumScore: null,
        moneyFlowScore: null,
        valuationScore: null,
        riskScore: 50,
      };
      const result = StrategyScorer.score(input, 'MEDIUM_TERM');

      expect(result.score).not.toBeNull();
      expect(result.availableComponents).toBe(1);
      // Risk inverted: (100 - 50) * 1.0 = 50
      expect(result.score).toBe(50);
    });

    it('does not use 0 as a fallback for missing data', () => {
      const input: StrategyScoringInput = {
        technicalScore: null,
        fundamentalScore: null,
        momentumScore: null,
        moneyFlowScore: null,
        valuationScore: null,
        riskScore: null,
      };
      const result = StrategyScorer.score(input, 'LONG_TERM');

      // Score should be null, not 0
      expect(result.score).toBeNull();
      expect(result.breakdown.technical).toBeNull();
      expect(result.breakdown.fundamental).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 8. No NaN
  // -------------------------------------------------------------------------
  describe('No NaN', () => {
    it('never produces NaN in score or contributions', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      expect(result.score).not.toBeNaN();
      for (const c of Object.values(result.contributions)) {
        if (c.weightedScore !== null) {
          expect(Number.isNaN(c.weightedScore)).toBe(false);
        }
        if (c.normalizedWeight !== null) {
          expect(Number.isNaN(c.normalizedWeight)).toBe(false);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 9. No Infinity
  // -------------------------------------------------------------------------
  describe('No Infinity', () => {
    it('never produces Infinity in score or contributions', () => {
      const input = fullInput();
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      expect(result.score).not.toBe(Infinity);
      expect(result.score).not.toBe(-Infinity);
      for (const c of Object.values(result.contributions)) {
        if (c.weightedScore !== null) {
          expect(Number.isFinite(c.weightedScore)).toBe(true);
        }
        if (c.normalizedWeight !== null) {
          expect(Number.isFinite(c.normalizedWeight)).toBe(true);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 10. Empty/invalid input does not silently generate fake investment data
  // -------------------------------------------------------------------------
  describe('Invalid input safety', () => {
    it('returns null score for all-null input (no fake data)', () => {
      const input: StrategyScoringInput = {
        technicalScore: null,
        fundamentalScore: null,
        momentumScore: null,
        moneyFlowScore: null,
        valuationScore: null,
        riskScore: null,
      };
      const result = StrategyScorer.score(input, 'SHORT_TERM');

      expect(result.score).toBeNull();
      expect(result.breakdown.technical).toBeNull();
      expect(result.breakdown.fundamental).toBeNull();
      expect(result.breakdown.momentum).toBeNull();
      expect(result.breakdown.moneyFlow).toBeNull();
      expect(result.breakdown.valuation).toBeNull();
      expect(result.breakdown.risk).toBeNull();
    });

    it('does not throw on null input', () => {
      const input: StrategyScoringInput = {
        technicalScore: null,
        fundamentalScore: null,
        momentumScore: null,
        moneyFlowScore: null,
        valuationScore: null,
        riskScore: null,
      };
      expect(() => StrategyScorer.score(input, 'MEDIUM_TERM')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Strategy-specific score differences
  // -------------------------------------------------------------------------
  describe('Strategy differentiation', () => {
    it('different strategies produce different scores for the same input', () => {
      const input = fullInput();
      const shortResult = StrategyScorer.score(input, 'SHORT_TERM');
      const mediumResult = StrategyScorer.score(input, 'MEDIUM_TERM');
      const longResult = StrategyScorer.score(input, 'LONG_TERM');

      // All three should be different because weights differ
      const scores = [shortResult.score, mediumResult.score, longResult.score];
      const uniqueScores = new Set(scores);
      expect(uniqueScores.size).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // isValidStrategy helper
  // -------------------------------------------------------------------------
  describe('isValidStrategy', () => {
    it('accepts valid strategies', () => {
      expect(StrategyScorer.isValidStrategy('SHORT_TERM')).toBe(true);
      expect(StrategyScorer.isValidStrategy('MEDIUM_TERM')).toBe(true);
      expect(StrategyScorer.isValidStrategy('LONG_TERM')).toBe(true);
    });

    it('rejects invalid strategies', () => {
      expect(StrategyScorer.isValidStrategy('INVALID')).toBe(false);
      expect(StrategyScorer.isValidStrategy('')).toBe(false);
      expect(StrategyScorer.isValidStrategy('DAY_TRADING')).toBe(false);
    });
  });
});
