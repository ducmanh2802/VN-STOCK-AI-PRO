import { describe, it, expect } from 'vitest';
import { TermStructureEngine } from '../TermStructureEngine.ts';
import type { DerivativesQuote } from '../types.ts';

function createMockQuote(symbol: string, price: number | null, oi: number = 20_000): DerivativesQuote {
  return {
    symbol,
    contractCode: symbol,
    underlying: 'VN30',
    price,
    open: price,
    high: price,
    low: price,
    close: price,
    referencePrice: price,
    ceilingPrice: price ? price * 1.07 : null,
    floorPrice: price ? price * 0.93 : null,
    change: 0,
    changePercent: 0,
    volume: 50_000,
    tradingValue: null,
    openInterest: oi,
    source: 'TEST',
    sourceTimestamp: Date.now(),
    fetchedAt: new Date().toISOString(),
    dataFreshness: price != null ? 'CURRENT' : 'UNAVAILABLE',
  };
}

describe('Phase 21.5 — Term Structure & Derivatives Regime', () => {
  describe('1. Term Structure Curve Shapes', () => {
    it('detects CONTANGO when curve slopes upward', () => {
      const q1M = createMockQuote('VN30F2604', 1320);
      const q2M = createMockQuote('VN30F2605', 1325);
      const q1Q = createMockQuote('VN30F2606', 1332);
      const q2Q = createMockQuote('VN30F2609', 1340);

      const res = TermStructureEngine.analyze({
        underlying: 'VN30',
        quotes: { '1M': q1M, '2M': q2M, '1Q': q1Q, '2Q': q2Q },
        spotPrice: 1315,
        daysToExpiry: { '1M': 10, '2M': 40, '1Q': 70, '2Q': 160 },
      });

      expect(res.status).toBe('COMPUTED');
      expect(res.curveShape).toBe('CONTANGO');
      expect(res.spread2M1M).toBe(5); // 1325 - 1320
      expect(res.spread1Q1M).toBe(12); // 1332 - 1320
      expect(res.curveSlope).toBeGreaterThan(0);
    });

    it('detects BACKWARDATION when curve slopes downward', () => {
      const q1M = createMockQuote('VN30F2604', 1320);
      const q2M = createMockQuote('VN30F2605', 1312);
      const q1Q = createMockQuote('VN30F2606', 1305);
      const q2Q = createMockQuote('VN30F2609', 1295);

      const res = TermStructureEngine.analyze({
        underlying: 'VN30',
        quotes: { '1M': q1M, '2M': q2M, '1Q': q1Q, '2Q': q2Q },
        spotPrice: 1325,
        daysToExpiry: { '1M': 10, '2M': 40, '1Q': 70, '2Q': 160 },
      });

      expect(res.status).toBe('COMPUTED');
      expect(res.curveShape).toBe('BACKWARDATION');
      expect(res.spread2M1M).toBe(-8);
      expect(res.curveSlope).toBeLessThan(0);
    });

    it('detects FLAT curve when spreads are within 0.2 points', () => {
      const q1M = createMockQuote('VN30F2604', 1320.0);
      const q2M = createMockQuote('VN30F2605', 1320.1);

      const res = TermStructureEngine.analyze({
        underlying: 'VN30',
        quotes: { '1M': q1M, '2M': q2M, '1Q': null, '2Q': null },
        spotPrice: 1320,
        daysToExpiry: { '1M': 10, '2M': 40, '1Q': 70, '2Q': 160 },
      });

      expect(res.curveShape).toBe('FLAT');
    });

    it('fails closed to DATA_UNAVAILABLE when front month is missing', () => {
      const res = TermStructureEngine.analyze({
        underlying: 'VN30',
        quotes: { '1M': null, '2M': createMockQuote('VN30F2605', 1320), '1Q': null, '2Q': null },
        spotPrice: 1315,
        daysToExpiry: { '1M': 10, '2M': 40, '1Q': 70, '2Q': 160 },
      });

      expect(res.status).toBe('DATA_UNAVAILABLE');
      expect(res.curveShape).toBe('DATA_UNAVAILABLE');
    });
  });

  describe('2. Derivatives Regime Classification Thresholds', () => {
    it('classifies STRONG_CONTANGO when basisPct >= +0.8%', () => {
      const regime = TermStructureEngine.classifyRegime(12, 0.95, 'CONTANGO');
      expect(regime.regime).toBe('STRONG_CONTANGO');
      expect(regime.confidence).toBeGreaterThanOrEqual(80);
    });

    it('classifies MILD_CONTANGO when +0.2% <= basisPct < +0.8%', () => {
      const regime = TermStructureEngine.classifyRegime(5, 0.45, 'CONTANGO');
      expect(regime.regime).toBe('MILD_CONTANGO');
    });

    it('classifies FLAT_NEUTRAL when -0.2% <= basisPct < +0.2%', () => {
      const regime = TermStructureEngine.classifyRegime(1, 0.05, 'FLAT');
      expect(regime.regime).toBe('FLAT_NEUTRAL');
    });

    it('classifies MILD_BACKWARDATION when -0.8% < basisPct <= -0.2%', () => {
      const regime = TermStructureEngine.classifyRegime(-6, -0.45, 'BACKWARDATION');
      expect(regime.regime).toBe('MILD_BACKWARDATION');
    });

    it('classifies STRONG_BACKWARDATION when basisPct <= -0.8%', () => {
      const regime = TermStructureEngine.classifyRegime(-15, -1.2, 'BACKWARDATION');
      expect(regime.regime).toBe('STRONG_BACKWARDATION');
    });

    it('classifies UNKNOWN when basisPct is null or missing', () => {
      const regime = TermStructureEngine.classifyRegime(null, null, 'DATA_UNAVAILABLE');
      expect(regime.regime).toBe('UNKNOWN');
      expect(regime.confidence).toBe(0);
    });
  });
});
