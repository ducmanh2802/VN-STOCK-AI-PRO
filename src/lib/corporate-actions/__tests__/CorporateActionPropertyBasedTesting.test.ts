import { describe, it, expect } from 'vitest';
import { CorporateActionEntitlementEngine } from '../CorporateActionEntitlementEngine.ts';
import { CorporateActionAdjustmentEngine } from '../CorporateActionAdjustmentEngine.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type { CorporateActionAdjustmentFactor } from '../types.ts';

// Deterministic Pseudo-Random Generator (LCG)
class SimpleRng {
  private state: number;
  constructor(seed: number = 20261001) {
    this.state = seed;
  }
  public nextFloat(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }
  public nextInt(min: number, max: number): number {
    return Math.floor(min + this.nextFloat() * (max - min + 1));
  }
}

describe('Phase 23 — Corporate Action Property-Based Testing (PBT)', () => {
  const rng = new SimpleRng(20261001);

  describe('Invariant 1: Entitlement Truncation and Non-Negativity', () => {
    it('always satisfies 0 <= wholeShares <= theoreticalEntitlement across 100 random positions', () => {
      for (let i = 0; i < 100; i++) {
        const holdingShares = rng.nextInt(10, 1_000_000);
        const oldShares = rng.nextInt(1, 100);
        const newShares = rng.nextInt(1, 50);

        const ratio = CorporateActionEntitlementEngine.parseRatio(`${oldShares}:${newShares}`);
        const result = CorporateActionEntitlementEngine.calculateEntitlement({
          holdingShares,
          ratio,
          policy: 'FLOOR',
        });

        expect(result.wholeShares).toBeGreaterThanOrEqual(0);
        expect(result.wholeShares).toBeLessThanOrEqual(result.theoreticalEntitlement);
        expect(result.fractionalShares).toBeGreaterThanOrEqual(0);
        expect(result.fractionalShares).toBeLessThan(1.0);
        expect(result.wholeShares + result.fractionalShares).toBeCloseTo(result.theoreticalEntitlement, 4);
      }
    });
  });

  describe('Invariant 2: Reference Price Adjustment Factor Boundaries', () => {
    it('always guarantees 0 < k_t <= 1.0 for cash & stock dividends across 100 random market scenarios', () => {
      for (let i = 0; i < 100; i++) {
        const prevClose = rng.nextInt(10_000, 200_000);
        const maxCash = Math.floor(prevClose * 0.5); // Cash dividend up to 50% of price
        const cashAmount = rng.nextInt(0, maxCash);
        const stockRatio = rng.nextFloat() * 0.5; // Stock dividend up to 50%
        const bonusRatio = rng.nextFloat() * 0.5;

        const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
          prevClose,
          cashAmountVnd: cashAmount,
          stockDividendRatio: stockRatio,
          bonusRatio,
        });

        expect(res.factor).toBeGreaterThan(0);
        expect(res.factor).toBeLessThanOrEqual(1.0);
        expect(res.exReferencePrice).toBeGreaterThan(0);
        expect(res.exReferencePrice).toBeLessThanOrEqual(prevClose);
      }
    });
  });

  describe('Invariant 3: Conservation of Traded Value', () => {
    it('preserves P_adj * V_adj ≈ P_raw * V_raw across 100 random historical bars', () => {
      for (let i = 0; i < 100; i++) {
        const rawClose = rng.nextInt(15_000, 150_000);
        const rawVolume = rng.nextInt(10_000, 5_000_000);
        const factorValue = 0.5 + rng.nextFloat() * 0.49; // factor between 0.5 and 0.99

        const bar: CandlePoint = {
          time: '2024-05-01',
          open: rawClose,
          high: rawClose * 1.02,
          low: rawClose * 0.98,
          close: rawClose,
          volume: rawVolume,
        };

        const factor: CorporateActionAdjustmentFactor = {
          exDate: '2024-05-15',
          actionId: 'PBT_FACTOR',
          actionType: 'STOCK_DIVIDEND',
          factor: factorValue,
          inverseFactor: 1 / factorValue,
          prevClosePrice: rawClose,
          exReferencePrice: rawClose * factorValue,
          formulaApplied: 'TEST',
        };

        const adjusted = CorporateActionAdjustmentEngine.adjustPriceSeries([bar], [factor]);
        const adjBar = adjusted[0];

        const rawTotalValue = rawClose * rawVolume;
        const adjTotalValue = adjBar.close * adjBar.volume;

        // Discrepancy is bounded by integer volume rounding (< 0.1% error)
        const relDiff = Math.abs(adjTotalValue - rawTotalValue) / rawTotalValue;
        expect(relDiff).toBeLessThan(0.001);
      }
    });
  });

  describe('Invariant 4: OTM Rights Invariance', () => {
    it('always preserves factor = 1.0 when issuePrice >= prevClose across 100 random rights scenarios', () => {
      for (let i = 0; i < 100; i++) {
        const prevClose = rng.nextInt(10_000, 100_000);
        const issuePrice = prevClose + rng.nextInt(0, 50_000); // At-the-money or out-of-the-money
        const rightsRatio = rng.nextFloat() * 0.5;

        const res = CorporateActionAdjustmentEngine.calculateExReferencePrice({
          prevClose,
          rightsRatio,
          issuePriceVnd: issuePrice,
        });

        expect(res.isOtmRightsSuppressed).toBe(true);
        expect(res.factor).toBe(1.0);
        expect(res.exReferencePrice).toBe(prevClose);
      }
    });
  });
});
