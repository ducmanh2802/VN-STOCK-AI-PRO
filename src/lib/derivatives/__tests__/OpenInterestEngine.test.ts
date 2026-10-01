import { describe, it, expect } from 'vitest';
import { OpenInterestEngine } from '../OpenInterestEngine.ts';

describe('Phase 21.4 — Open Interest Engine', () => {
  describe('1. OI Changes & Liquidity Ratios', () => {
    it('computes absolute and percentage change when previous OI is available', () => {
      const result = OpenInterestEngine.analyze({
        symbol: 'VN30F1M',
        currentOI: 45_000,
        previousOI: 40_000,
        volume: 180_000,
        priceChange: 5.5,
      });

      expect(result.status).toBe('COMPUTED');
      expect(result.openInterest).toBe(45_000);
      expect(result.openInterestChange).toBe(5_000);
      expect(result.openInterestChangePct).toBe(12.5); // 5000 / 40000 * 100
      expect(result.volumeToOIRatio).toBe(4.0); // 180000 / 45000
    });

    it('computes negative OI change accurately', () => {
      const result = OpenInterestEngine.analyze({
        symbol: 'VN30F1M',
        currentOI: 38_000,
        previousOI: 40_000,
        volume: 120_000,
        priceChange: -3.2,
      });

      expect(result.openInterestChange).toBe(-2_000);
      expect(result.openInterestChangePct).toBe(-5.0);
    });

    it('handles missing previous OI gracefully without crashing', () => {
      const result = OpenInterestEngine.analyze({
        symbol: 'VN30F1M',
        currentOI: 45_000,
        previousOI: null,
        volume: 100_000,
      });

      expect(result.status).toBe('COMPUTED');
      expect(result.openInterestChange).toBeNull();
      expect(result.openInterestChangePct).toBeNull();
      expect(result.volumeToOIRatio).toBeCloseTo(2.222, 2);
    });
  });

  describe('2. Four-Quadrant Positioning Interpretation', () => {
    it('identifies LONG_ACCUMULATION when Price is UP and OI is UP', () => {
      expect(OpenInterestEngine.interpretPositioning(10.5, 3_000)).toBe('LONG_ACCUMULATION');
    });

    it('identifies SHORT_ACCUMULATION when Price is DOWN and OI is UP', () => {
      expect(OpenInterestEngine.interpretPositioning(-8.2, 4_500)).toBe('SHORT_ACCUMULATION');
    });

    it('identifies SHORT_COVERING when Price is UP and OI is DOWN', () => {
      expect(OpenInterestEngine.interpretPositioning(12.0, -2_500)).toBe('SHORT_COVERING');
    });

    it('identifies LONG_LIQUIDATION when Price is DOWN and OI is DOWN', () => {
      expect(OpenInterestEngine.interpretPositioning(-15.4, -6_000)).toBe('LONG_LIQUIDATION');
    });

    it('identifies NEUTRAL when price or OI is unchanged', () => {
      expect(OpenInterestEngine.interpretPositioning(0, 500)).toBe('NEUTRAL');
      expect(OpenInterestEngine.interpretPositioning(5, 0)).toBe('NEUTRAL');
    });

    it('returns DATA_UNAVAILABLE when either input is null or missing', () => {
      expect(OpenInterestEngine.interpretPositioning(null, 1000)).toBe('DATA_UNAVAILABLE');
      expect(OpenInterestEngine.interpretPositioning(5, null)).toBe('DATA_UNAVAILABLE');
    });
  });

  describe('3. Fail-Closed Invariants', () => {
    it('fails closed when current OI is null or negative', () => {
      const r1 = OpenInterestEngine.analyze({
        symbol: 'VN30F1M',
        currentOI: null,
      });
      expect(r1.status).toBe('DATA_UNAVAILABLE');
      expect(r1.openInterest).toBeNull();
      expect(r1.positioning).toBe('DATA_UNAVAILABLE');

      const r2 = OpenInterestEngine.analyze({
        symbol: 'VN30F1M',
        currentOI: -500,
      });
      expect(r2.status).toBe('DATA_UNAVAILABLE');
      expect(r2.openInterest).toBeNull();
    });
  });
});
