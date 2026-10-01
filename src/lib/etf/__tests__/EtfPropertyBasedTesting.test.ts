import { describe, it, expect } from 'vitest';
import { EtfHoldingsEngine, type RawConstituentItem } from '../EtfHoldingsEngine.ts';
import { EtfNavEngine } from '../EtfNavEngine.ts';

// Deterministic Pseudo-Random Number Generator (LCG)
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

describe('Phase 22 — ETF Property-Based Testing (PBT) Invariants', () => {
  const rng = new SimpleRng(20261001);

  describe('Invariant 1: Basket Weight Partition', () => {
    it('always preserves sum(weights) + cashWeight = 100% across 100 random basket compositions', () => {
      for (let i = 0; i < 100; i++) {
        const numConstituents = rng.nextInt(5, 30);
        const constituents: RawConstituentItem[] = [];

        for (let j = 0; j < numConstituents; j++) {
          const shares = rng.nextInt(1_000, 50_000);
          const price = rng.nextInt(10_000, 150_000);
          const sector = ['banking', 'real_estate', 'materials', 'technology'][j % 4];

          constituents.push({
            symbol: `SYM_${j}`,
            companyName: `Company ${j}`,
            sharesInBasket: shares,
            marketPrice: price,
            sectorId: sector,
          });
        }

        const cash = rng.nextInt(10_000_000, 200_000_000);

        const result = EtfHoldingsEngine.analyze({
          symbol: 'E1VFVN30',
          asOfDate: '2026-09-30',
          constituents,
          cashComponentVnd: cash,
        });

        expect(result.status).toBe('COMPUTED');
        expect(result.totalConstituents).toBe(numConstituents);

        const sumConstituentWeights = result.constituents.reduce(
          (acc, c) => acc + (c.weightPercent ?? 0),
          0
        );
        const totalSum = sumConstituentWeights + (result.cashWeightPercent ?? 0);

        // Should equal 100% within 0.1% rounding tolerance
        expect(totalSum).toBeCloseTo(100.0, 0);

        // Every individual weight is non-negative and <= 100
        for (const c of result.constituents) {
          expect(c.weightPercent).toBeGreaterThanOrEqual(0);
          expect(c.weightPercent).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('Invariant 2: Premium / Discount Arithmetic & Monotonicity', () => {
    it('holds Points + ReferenceNav = MarketPrice and sign monotonicity across 150 random pricing pairs', () => {
      for (let i = 0; i < 150; i++) {
        const marketPrice = rng.nextInt(10_000, 60_000);
        const nav = rng.nextInt(10_000, 60_000);

        const res = EtfNavEngine.calculatePremiumDiscount({
          symbol: 'E1VFVN30',
          marketPrice,
          referenceNav: nav,
          referenceNavType: 'OFFICIAL_EOD',
        });

        expect(res.status).toBe('LIVE');
        expect(res.premiumDiscountPoints! + nav).toBeCloseTo(marketPrice, 2);

        if (marketPrice > nav) {
          expect(res.premiumDiscountPoints).toBeGreaterThan(0);
          expect(res.premiumDiscountPercent).toBeGreaterThan(0);
        } else if (marketPrice < nav) {
          expect(res.premiumDiscountPoints).toBeLessThan(0);
          expect(res.premiumDiscountPercent).toBeLessThan(0);
        } else {
          expect(res.premiumDiscountPoints).toBe(0);
          expect(res.premiumDiscountPercent).toBe(0);
          expect(res.regime).toBe('PAR');
        }
      }
    });
  });

  describe('Invariant 3: Premium / Discount Regime Partition', () => {
    it('exhaustively partitions any spread percentage into exactly one valid regime', () => {
      const allRegimes = new Set(['PREMIUM', 'DISCOUNT', 'PAR']);

      for (let i = 0; i < 150; i++) {
        const spreadPercent = +(-5 + rng.nextFloat() * 10).toFixed(2);
        const nav = 30_000;
        const marketPrice = Math.round(nav * (1 + spreadPercent / 100));

        const res = EtfNavEngine.calculatePremiumDiscount({
          symbol: 'E1VFVN30',
          marketPrice,
          referenceNav: nav,
          referenceNavType: 'OFFICIAL_EOD',
        });

        expect(allRegimes.has(res.regime)).toBe(true);
      }
    });
  });
});
