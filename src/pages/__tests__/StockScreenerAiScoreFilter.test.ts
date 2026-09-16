import { describe, it, expect } from 'vitest';
import { passesAiScoreMinimum } from '../StockScreenerPage';

describe('Stock Screener AI Score Filter Fail-Closed Specification', () => {
  describe('passesAiScoreMinimum predicate', () => {
    describe('When minAiScore filter is inactive (null, undefined, 0, or negative)', () => {
      it('allows all values when minAiScore is 0', () => {
        expect(passesAiScoreMinimum(95, 0)).toBe(true);
        expect(passesAiScoreMinimum(75, 0)).toBe(true);
        expect(passesAiScoreMinimum(74, 0)).toBe(true);
        expect(passesAiScoreMinimum(null, 0)).toBe(true);
        expect(passesAiScoreMinimum(undefined, 0)).toBe(true);
        expect(passesAiScoreMinimum(NaN, 0)).toBe(true);
        expect(passesAiScoreMinimum(Infinity, 0)).toBe(true);
        expect(passesAiScoreMinimum('DATA_UNAVAILABLE', 0)).toBe(true);
      });

      it('allows all values when minAiScore is null or undefined', () => {
        expect(passesAiScoreMinimum(null, null)).toBe(true);
        expect(passesAiScoreMinimum(undefined, undefined)).toBe(true);
        expect(passesAiScoreMinimum(75, null)).toBe(true);
      });

      it('allows all values when minAiScore is negative', () => {
        expect(passesAiScoreMinimum(null, -5)).toBe(true);
        expect(passesAiScoreMinimum(50, -5)).toBe(true);
      });
    });

    describe('When minAiScore filter is active (e.g. minAiScore = 75)', () => {
      const activeMin = 75;

      it('INCLUDES stocks with valid finite numeric AI Score >= 75', () => {
        expect(passesAiScoreMinimum(95, activeMin)).toBe(true);
        expect(passesAiScoreMinimum(80, activeMin)).toBe(true);
        expect(passesAiScoreMinimum(75, activeMin)).toBe(true);
        expect(passesAiScoreMinimum(75.0, activeMin)).toBe(true);
      });

      it('EXCLUDES stocks with valid finite numeric AI Score < 75', () => {
        expect(passesAiScoreMinimum(74.99, activeMin)).toBe(false);
        expect(passesAiScoreMinimum(74, activeMin)).toBe(false);
        expect(passesAiScoreMinimum(60, activeMin)).toBe(false);
        expect(passesAiScoreMinimum(0, activeMin)).toBe(false);
        expect(passesAiScoreMinimum(-10, activeMin)).toBe(false);
      });

      it('EXCLUDES stocks with null AI Score (fail-closed)', () => {
        expect(passesAiScoreMinimum(null, activeMin)).toBe(false);
      });

      it('EXCLUDES stocks with undefined AI Score (fail-closed)', () => {
        expect(passesAiScoreMinimum(undefined, activeMin)).toBe(false);
      });

      it('EXCLUDES stocks with NaN AI Score (fail-closed)', () => {
        expect(passesAiScoreMinimum(NaN, activeMin)).toBe(false);
      });

      it('EXCLUDES stocks with Infinity or -Infinity AI Score (fail-closed)', () => {
        expect(passesAiScoreMinimum(Infinity, activeMin)).toBe(false);
        expect(passesAiScoreMinimum(-Infinity, activeMin)).toBe(false);
      });

      it('EXCLUDES stocks with non-numeric / string AI Score (e.g. "DATA_UNAVAILABLE", "75")', () => {
        expect(passesAiScoreMinimum('DATA_UNAVAILABLE', activeMin)).toBe(false);
        expect(passesAiScoreMinimum('75', activeMin)).toBe(false);
        expect(passesAiScoreMinimum('LOADING', activeMin)).toBe(false);
        expect(passesAiScoreMinimum({}, activeMin)).toBe(false);
        expect(passesAiScoreMinimum([], activeMin)).toBe(false);
        expect(passesAiScoreMinimum(true, activeMin)).toBe(false);
      });
    });

    describe('Explicit Test Matrix Verification (as specified in prompt)', () => {
      const min = 75;

      const testMatrix: Array<{ input: unknown; expected: boolean; label: string }> = [
        { input: 95, expected: true, label: 'Score 95 (>= 75)' },
        { input: 75, expected: true, label: 'Score 75 (boundary >= 75)' },
        { input: 74, expected: false, label: 'Score 74 (< 75)' },
        { input: null, expected: false, label: 'null score' },
        { input: undefined, expected: false, label: 'undefined score' },
        { input: NaN, expected: false, label: 'NaN score' },
        { input: Infinity, expected: false, label: 'Infinity score' },
        { input: -Infinity, expected: false, label: '-Infinity score' },
        { input: 'DATA_UNAVAILABLE', expected: false, label: 'DATA_UNAVAILABLE string' },
      ];

      testMatrix.forEach(({ input, expected, label }) => {
        it(`Test Matrix Case: ${label} -> ${expected ? 'PASS' : 'EXCLUDE'}`, () => {
          expect(passesAiScoreMinimum(input, min)).toBe(expected);
        });
      });
    });
  });

  describe('Multi-Factor Screening Integration (AND logic with fail-closed AI Score)', () => {
    interface MockStock {
      symbol: string;
      exchange: string;
      sector: string;
      price: number;
      aiScore: number | null | undefined;
    }

    const universe: MockStock[] = [
      { symbol: 'FPT', exchange: 'HOSE', sector: 'Công nghệ', price: 120000, aiScore: 88 },
      { symbol: 'VNM', exchange: 'HOSE', sector: 'Tiêu dùng', price: 68000, aiScore: 75 },
      { symbol: 'HPG', exchange: 'HOSE', sector: 'Thép', price: 28000, aiScore: 74 },
      { symbol: 'SSI', exchange: 'HOSE', sector: 'Chứng khoán', price: 32000, aiScore: null },
      { symbol: 'VND', exchange: 'HOSE', sector: 'Chứng khoán', price: 18000, aiScore: undefined },
      { symbol: 'TCB', exchange: 'HOSE', sector: 'Tài chính', price: 24000, aiScore: 92 },
    ];

    it('returns only stocks meeting all criteria including finite aiScore >= 75', () => {
      const minPrice = 20000;
      const maxPrice = 150000;
      const minAiScore = 75;

      const filtered = universe.filter((s) => {
        if (s.price < minPrice || s.price > maxPrice) return false;
        if (!passesAiScoreMinimum(s.aiScore, minAiScore)) return false;
        return true;
      });

      const symbols = filtered.map((s) => s.symbol);
      expect(symbols).toEqual(['FPT', 'VNM', 'TCB']);
      expect(symbols).not.toContain('HPG'); // aiScore 74 < 75
      expect(symbols).not.toContain('SSI'); // aiScore null
      expect(symbols).not.toContain('VND'); // aiScore undefined
    });

    it('returns all stocks when minAiScore is 0 (inactive filter)', () => {
      const minAiScore = 0;
      const filtered = universe.filter((s) => passesAiScoreMinimum(s.aiScore, minAiScore));
      expect(filtered.length).toBe(universe.length);
    });
  });
});
