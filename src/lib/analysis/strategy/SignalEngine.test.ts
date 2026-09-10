/**
 * PHASE 17.4 — SIGNAL ENGINE TESTS
 * =================================
 * Unit tests for SignalEngine covering all required test cases.
 */

import { describe, it, expect } from 'vitest';
import {
  SignalEngine,
  SignalEngineInput,
  SignalEngineResult,
  SignalThresholds,
  DEFAULT_THRESHOLDS_BY_HORIZON,
} from './SignalEngine.ts';
import type { InvestmentHorizon, RecommendationSignal } from '../../../types/recommendation.ts';
import { StrategyScorer, StrategyScoringInput } from './StrategyScorer.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInput(overrides: Partial<SignalEngineInput> = {}): SignalEngineInput {
  return {
    strategy: 'SHORT_TERM',
    score: 70,
    ...overrides,
  };
}

function fullScoringInput(overrides: Partial<StrategyScoringInput> = {}): StrategyScoringInput {
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SignalEngine', () => {
  // -------------------------------------------------------------------------
  // 1. BUY signal tests
  // -------------------------------------------------------------------------
  describe('BUY signal', () => {
    it('returns BUY when score >= buyMin for SHORT_TERM', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 70 });
      expect(result.signal).toBe('BUY');
      expect(result.isValid).toBe(true);
    });

    it('returns BUY when score >= buyMin for MEDIUM_TERM', () => {
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 65 });
      expect(result.signal).toBe('BUY');
      expect(result.isValid).toBe(true);
    });

    it('returns BUY when score >= buyMin for LONG_TERM', () => {
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 60 });
      expect(result.signal).toBe('BUY');
      expect(result.isValid).toBe(true);
    });

    it('returns BUY at exact buyMin boundary (SHORT_TERM)', () => {
      // SHORT_TERM buyMin = 65
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 65 });
      expect(result.signal).toBe('BUY');
      expect(result.reason).toContain('above the BUY threshold (65)');
    });

    it('returns BUY at exact buyMin boundary (MEDIUM_TERM)', () => {
      // MEDIUM_TERM buyMin = 60
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 60 });
      expect(result.signal).toBe('BUY');
    });

    it('returns BUY at exact buyMin boundary (LONG_TERM)', () => {
      // LONG_TERM buyMin = 55
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 55 });
      expect(result.signal).toBe('BUY');
    });
  });

  // -------------------------------------------------------------------------
  // 2. HOLD signal tests
  // -------------------------------------------------------------------------
  describe('HOLD signal', () => {
    it('returns HOLD when score >= holdMin and < buyMin for SHORT_TERM', () => {
      // SHORT_TERM: holdMin=40, buyMin=65
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 50 });
      expect(result.signal).toBe('HOLD');
      expect(result.isValid).toBe(true);
    });

    it('returns HOLD when score >= holdMin and < buyMin for MEDIUM_TERM', () => {
      // MEDIUM_TERM: holdMin=35, buyMin=60
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 45 });
      expect(result.signal).toBe('HOLD');
      expect(result.isValid).toBe(true);
    });

    it('returns HOLD when score >= holdMin and < buyMin for LONG_TERM', () => {
      // LONG_TERM: holdMin=30, buyMin=55
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 40 });
      expect(result.signal).toBe('HOLD');
      expect(result.isValid).toBe(true);
    });

    it('returns HOLD at exact holdMin boundary (SHORT_TERM)', () => {
      // SHORT_TERM holdMin = 40
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 40 });
      expect(result.signal).toBe('HOLD');
      expect(result.reason).toContain('between HOLD threshold (40) and BUY threshold (65)');
    });

    it('returns HOLD at exact holdMin boundary (MEDIUM_TERM)', () => {
      // MEDIUM_TERM holdMin = 35
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 35 });
      expect(result.signal).toBe('HOLD');
    });

    it('returns HOLD at exact holdMin boundary (LONG_TERM)', () => {
      // LONG_TERM holdMin = 30
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 30 });
      expect(result.signal).toBe('HOLD');
    });
  });

  // -------------------------------------------------------------------------
  // 3. SELL signal tests
  // -------------------------------------------------------------------------
  describe('SELL signal', () => {
    it('returns SELL when score < holdMin for SHORT_TERM', () => {
      // SHORT_TERM holdMin = 40
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 35 });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(true);
    });

    it('returns SELL when score < holdMin for MEDIUM_TERM', () => {
      // MEDIUM_TERM holdMin = 35
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 30 });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(true);
    });

    it('returns SELL when score < holdMin for LONG_TERM', () => {
      // LONG_TERM holdMin = 30
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 25 });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(true);
    });

    it('returns SELL at score 0', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 0 });
      expect(result.signal).toBe('SELL');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Boundary tests
  // -------------------------------------------------------------------------
  describe('Boundary conditions', () => {
    it('BUY boundary: score === buyMin returns BUY', () => {
      const strategies: InvestmentHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'];
      for (const strategy of strategies) {
        const thresholds = DEFAULT_THRESHOLDS_BY_HORIZON[strategy];
        const result = SignalEngine.generate({ strategy, score: thresholds.buyMin });
        expect(result.signal).toBe('BUY');
      }
    });

    it('HOLD boundary: score === holdMin returns HOLD', () => {
      const strategies: InvestmentHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'];
      for (const strategy of strategies) {
        const thresholds = DEFAULT_THRESHOLDS_BY_HORIZON[strategy];
        const result = SignalEngine.generate({ strategy, score: thresholds.holdMin });
        expect(result.signal).toBe('HOLD');
      }
    });

    it('SELL boundary: score === holdMin - 1 returns SELL', () => {
      const strategies: InvestmentHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'];
      for (const strategy of strategies) {
        const thresholds = DEFAULT_THRESHOLDS_BY_HORIZON[strategy];
        const result = SignalEngine.generate({ strategy, score: thresholds.holdMin - 1 });
        expect(result.signal).toBe('SELL');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Determinism tests
  // -------------------------------------------------------------------------
  describe('Determinism', () => {
    it('same input produces same result for SHORT_TERM', () => {
      const input = createInput({ strategy: 'SHORT_TERM', score: 72 });
      const r1 = SignalEngine.generate(input);
      const r2 = SignalEngine.generate(input);
      expect(r1).toEqual(r2);
    });

    it('same input produces same result for MEDIUM_TERM', () => {
      const input = createInput({ strategy: 'MEDIUM_TERM', score: 62 });
      const r1 = SignalEngine.generate(input);
      const r2 = SignalEngine.generate(input);
      expect(r1).toEqual(r2);
    });

    it('same input produces same result for LONG_TERM', () => {
      const input = createInput({ strategy: 'LONG_TERM', score: 57 });
      const r1 = SignalEngine.generate(input);
      const r2 = SignalEngine.generate(input);
      expect(r1).toEqual(r2);
    });

    it('multiple calls with same StrategyScoreResult produce same signal', () => {
      const scoringInput = fullScoringInput();
      const scoreResult = StrategyScorer.score(scoringInput, 'SHORT_TERM');

      const r1 = SignalEngine.generateFromScoreResult(scoreResult);
      const r2 = SignalEngine.generateFromScoreResult(scoreResult);
      const r3 = SignalEngine.generateFromScoreResult(scoreResult);

      expect(r1.signal).toBe(r2.signal);
      expect(r2.signal).toBe(r3.signal);
      expect(r1.reason).toBe(r2.reason);
    });
  });

  // -------------------------------------------------------------------------
  // 6. All strategies tests
  // -------------------------------------------------------------------------
  describe('All strategies supported', () => {
    it('generates signal for SHORT_TERM', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 50 });
      expect(result.strategy).toBe('SHORT_TERM');
      expect(['BUY', 'HOLD', 'SELL']).toContain(result.signal);
    });

    it('generates signal for MEDIUM_TERM', () => {
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 50 });
      expect(result.strategy).toBe('MEDIUM_TERM');
      expect(['BUY', 'HOLD', 'SELL']).toContain(result.signal);
    });

    it('generates signal for LONG_TERM', () => {
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 50 });
      expect(result.strategy).toBe('LONG_TERM');
      expect(['BUY', 'HOLD', 'SELL']).toContain(result.signal);
    });

    it('different strategies can produce different signals for same score', () => {
      const score = 50; // Between LONG_TERM buyMin(55) and MEDIUM_TERM holdMin(35)
      const shortResult = SignalEngine.generate({ strategy: 'SHORT_TERM', score });
      const mediumResult = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score });
      const longResult = SignalEngine.generate({ strategy: 'LONG_TERM', score });

      // SHORT_TERM: 50 < 65 (buyMin) and >= 40 (holdMin) => HOLD
      // MEDIUM_TERM: 50 < 60 (buyMin) and >= 35 (holdMin) => HOLD
      // LONG_TERM: 50 < 55 (buyMin) and >= 30 (holdMin) => HOLD
      // All HOLD in this case, but thresholds differ
      expect(shortResult.thresholds).not.toEqual(mediumResult.thresholds);
      expect(mediumResult.thresholds).not.toEqual(longResult.thresholds);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Invalid score handling
  // -------------------------------------------------------------------------
  describe('Invalid score handling', () => {
    it('returns SELL with isValid=false for null score', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: null });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('null');
    });

    it('returns SELL with isValid=false for NaN score', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: NaN });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('NaN');
    });

    it('returns SELL with isValid=false for +Infinity score', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: Infinity });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Infinity');
    });

    it('returns SELL with isValid=false for -Infinity score', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: -Infinity });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('-Infinity');
    });

    it('returns SELL with isValid=false for negative score', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: -10 });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('below valid range');
    });

    it('returns SELL with isValid=false for score > 100', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 150 });
      expect(result.signal).toBe('SELL');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('exceeds valid range');
    });

    it('does not silently convert NaN to BUY', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: NaN });
      expect(result.signal).not.toBe('BUY');
    });

    it('does not silently convert null to 0 then SELL', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: null });
      expect(result.score).toBeNull();
      expect(result.isValid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Custom thresholds
  // -------------------------------------------------------------------------
  describe('Custom thresholds', () => {
    it('uses custom thresholds when provided', () => {
      const customThresholds: SignalThresholds = { buyMin: 80, holdMin: 50 };
      const result = SignalEngine.generate({
        strategy: 'SHORT_TERM',
        score: 75,
        customThresholds,
      });

      expect(result.thresholds).toEqual(customThresholds);
      expect(result.signal).toBe('HOLD'); // 75 >= 50 but < 80
    });

    it('validates custom thresholds (buyMin > holdMin)', () => {
      const customThresholds: SignalThresholds = { buyMin: 40, holdMin: 60 }; // Invalid: buyMin <= holdMin
      expect(() =>
        SignalEngine.generate({
          strategy: 'SHORT_TERM',
          score: 50,
          customThresholds,
        })
      ).toThrow(/buyMin.*must be greater than holdMin/);
    });

    it('validates custom thresholds (buyMin in range)', () => {
      const customThresholds: SignalThresholds = { buyMin: 150, holdMin: 50 };
      expect(() =>
        SignalEngine.generate({
          strategy: 'SHORT_TERM',
          score: 50,
          customThresholds,
        })
      ).toThrow(/buyMin must be in \[0, 100\]/);
    });

    it('validates custom thresholds (holdMin in range)', () => {
      const customThresholds: SignalThresholds = { buyMin: 80, holdMin: -10 };
      expect(() =>
        SignalEngine.generate({
          strategy: 'SHORT_TERM',
          score: 50,
          customThresholds,
        })
      ).toThrow(/holdMin must be in \[0, 100\]/);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Transparency / Output structure
  // -------------------------------------------------------------------------
  describe('Output transparency', () => {
    it('includes strategy in result', () => {
      const result = SignalEngine.generate({ strategy: 'MEDIUM_TERM', score: 60 });
      expect(result.strategy).toBe('MEDIUM_TERM');
    });

    it('includes score in result', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 72 });
      expect(result.score).toBe(72);
    });

    it('includes thresholds used in result', () => {
      const result = SignalEngine.generate({ strategy: 'LONG_TERM', score: 50 });
      expect(result.thresholds).toEqual(DEFAULT_THRESHOLDS_BY_HORIZON.LONG_TERM);
    });

    it('includes deterministic reason in result', () => {
      const result = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 72 });
      expect(result.reason).toContain('72');
      expect(result.reason).toContain('65'); // buyMin
      expect(result.reason).not.toContain('AI');
      expect(result.reason).not.toContain('believes');
    });

    it('includes isValid flag', () => {
      const validResult = SignalEngine.generate({ strategy: 'SHORT_TERM', score: 72 });
      const invalidResult = SignalEngine.generate({ strategy: 'SHORT_TERM', score: NaN });

      expect(validResult.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 10. No accidental scoring logic
  // -------------------------------------------------------------------------
  describe('No scoring logic duplication', () => {
    it('does not import TechnicalScoreEngine', () => {
      // This is a compile-time check - if SignalEngine imported scoring engines,
      // TypeScript would show unused imports or the bundle would include them.
      // We verify by checking the source doesn't contain scoring engine imports.
      const source = SignalEngine.toString();
      expect(source).not.toContain('TechnicalScoreEngine');
      expect(source).not.toContain('FundamentalScoreEngine');
      expect(source).not.toContain('ValuationEngine');
      expect(source).not.toContain('MoneyFlowEngine');
    });

    it('generateFromScoreResult uses only strategy and score from StrategyScoreResult', () => {
      const scoringInput = fullScoringInput();
      const scoreResult = StrategyScorer.score(scoringInput, 'SHORT_TERM');

      // Should work with just strategy and score
      const result = SignalEngine.generateFromScoreResult(scoreResult);
      expect(result.strategy).toBe('SHORT_TERM');
      expect(result.score).toBe(scoreResult.score);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Helper methods
  // -------------------------------------------------------------------------
  describe('Helper methods', () => {
    it('isValidStrategy accepts valid strategies', () => {
      expect(SignalEngine.isValidStrategy('SHORT_TERM')).toBe(true);
      expect(SignalEngine.isValidStrategy('MEDIUM_TERM')).toBe(true);
      expect(SignalEngine.isValidStrategy('LONG_TERM')).toBe(true);
    });

    it('isValidStrategy rejects invalid strategies', () => {
      expect(SignalEngine.isValidStrategy('INVALID')).toBe(false);
      expect(SignalEngine.isValidStrategy('')).toBe(false);
      expect(SignalEngine.isValidStrategy('DAY_TRADING')).toBe(false);
    });

    it('getDefaultThresholds returns copy (not reference)', () => {
      const thresholds1 = SignalEngine.getDefaultThresholds('SHORT_TERM');
      const thresholds2 = SignalEngine.getDefaultThresholds('SHORT_TERM');
      expect(thresholds1).toEqual(thresholds2);
      expect(thresholds1).not.toBe(thresholds2); // Different object references
    });

    it('getAllDefaultThresholds returns all strategies', () => {
      const all = SignalEngine.getAllDefaultThresholds();
      expect(all.SHORT_TERM).toBeDefined();
      expect(all.MEDIUM_TERM).toBeDefined();
      expect(all.LONG_TERM).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 12. Integration with StrategyScorer
  // -------------------------------------------------------------------------
  describe('Integration with StrategyScorer', () => {
    it('works with StrategyScoreResult from StrategyScorer', () => {
      const scoringInput = fullScoringInput();
      const scoreResult = StrategyScorer.score(scoringInput, 'SHORT_TERM');

      expect(scoreResult.score).not.toBeNull();

      const signalResult = SignalEngine.generateFromScoreResult(scoreResult);
      expect(signalResult.strategy).toBe('SHORT_TERM');
      expect(signalResult.score).toBe(scoreResult.score);
      expect(['BUY', 'HOLD', 'SELL']).toContain(signalResult.signal);
    });

    it('handles null score from StrategyScorer (all components missing)', () => {
      const emptyInput: StrategyScoringInput = {
        technicalScore: null,
        fundamentalScore: null,
        momentumScore: null,
        moneyFlowScore: null,
        valuationScore: null,
        riskScore: null,
      };
      const scoreResult = StrategyScorer.score(emptyInput, 'MEDIUM_TERM');
      expect(scoreResult.score).toBeNull();

      const signalResult = SignalEngine.generateFromScoreResult(scoreResult);
      expect(signalResult.signal).toBe('SELL');
      expect(signalResult.isValid).toBe(false);
    });
  });
});