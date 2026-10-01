import { describe, it, expect } from 'vitest';
import { BasisEngine } from '../BasisEngine.ts';

describe('Phase 21.3 — Basis Engine (Spot-Futures Alignment & Valuation)', () => {
  describe('1. Canonical Basis Formulas', () => {
    it('computes positive basis (Contango) correctly', () => {
      // Futures: 1320, Spot: 1310
      // Basis: 1320 - 1310 = +10 pts
      // BasisPct: 10 / 1310 * 100 = 0.7634%
      const result = BasisEngine.calculateBasis(1320, 1310, 10);
      expect(result.status).toBe('LIVE');
      expect(result.basis).toBe(10);
      expect(result.basisPct).toBeCloseTo(0.7634, 3);
      expect(result.annualizedBasis).toBeCloseTo(27.86, 1);
    });

    it('computes negative basis (Backwardation) correctly', () => {
      // Futures: 1300, Spot: 1315
      // Basis: -15 pts
      // BasisPct: -15 / 1315 * 100 = -1.1407%
      const result = BasisEngine.calculateBasis(1300, 1315, 14);
      expect(result.status).toBe('LIVE');
      expect(result.basis).toBe(-15);
      expect(result.basisPct).toBeCloseTo(-1.1407, 3);
      expect(result.annualizedBasis).toBeCloseTo(-29.74, 1);
    });

    it('computes flat/zero basis correctly', () => {
      const result = BasisEngine.calculateBasis(1300, 1300, 7);
      expect(result.basis).toBe(0);
      expect(result.basisPct).toBe(0);
      expect(result.annualizedBasis).toBe(0);
    });

    it('handles expiration day (daysToExpiry = 0) without division by zero', () => {
      const result = BasisEngine.calculateBasis(1305, 1300, 0);
      expect(result.basis).toBe(5);
      expect(result.annualizedBasis).toBeNull();
      expect(result.warnings.some((w) => w.includes('expiration day'))).toBe(true);
    });
  });

  describe('2. Cost of Carry & Theoretical Fair Value', () => {
    it('computes fair basis and mispricing when rates are provided', () => {
      // Spot = 1300, r = 5% (0.05), q = 1.5% (0.015), days = 73 (0.2 year)
      // Net carry = 0.05 - 0.015 = 0.035
      // Fair basis = 1300 * 0.035 * (73/365) = 1300 * 0.035 * 0.2 = 9.1
      // Fair price = 1300 + 9.1 = 1309.1
      // If futures = 1315, mispricing = 1315 - 1309.1 = +5.9
      const result = BasisEngine.calculateBasis(1315, 1300, 73, {
        riskFreeRate: 0.05,
        dividendYield: 0.015,
      });

      expect(result.fairBasis).toBeCloseTo(9.1, 1);
      expect(result.fairPrice).toBeCloseTo(1309.1, 1);
      expect(result.mispricing).toBeCloseTo(5.9, 1);
    });

    it('leaves fair value null if risk-free rate is omitted (no guessing)', () => {
      const result = BasisEngine.calculateBasis(1315, 1300, 30);
      expect(result.fairBasis).toBeNull();
      expect(result.fairPrice).toBeNull();
      expect(result.mispricing).toBeNull();
    });
  });

  describe('3. Fail-Closed Invariants & Edge Cases', () => {
    it('fails closed when futures price is null or zero', () => {
      const r1 = BasisEngine.calculateBasis(null, 1300, 10);
      expect(r1.status).toBe('DATA_UNAVAILABLE');
      expect(r1.basis).toBeNull();
      expect(r1.basisPct).toBeNull();

      const r2 = BasisEngine.calculateBasis(0, 1300, 10);
      expect(r2.status).toBe('DATA_UNAVAILABLE');
      expect(r2.basis).toBeNull();
    });

    it('fails closed when spot price is null or zero', () => {
      const r1 = BasisEngine.calculateBasis(1320, null, 10);
      expect(r1.status).toBe('DATA_UNAVAILABLE');
      expect(r1.basis).toBeNull();

      const r2 = BasisEngine.calculateBasis(1320, 0, 10);
      expect(r2.status).toBe('DATA_UNAVAILABLE');
      expect(r2.basis).toBeNull();
    });

    it('flags STALE when futures and spot timestamps diverge excessively', () => {
      const now = Date.now();
      const tenMinutesAgo = now - 600_000;
      const result = BasisEngine.calculateBasis(1320, 1310, 10, {
        futuresTimestamp: now,
        spotTimestamp: tenMinutesAgo,
        maxTimestampDeltaMs: 300_000,
      });

      expect(result.status).toBe('STALE');
      expect(result.warnings.some((w) => w.includes('Timestamp delta'))).toBe(true);
    });
  });
});
