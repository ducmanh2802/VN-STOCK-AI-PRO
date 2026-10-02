import { describe, it, expect } from 'vitest';
import { StrategyFactory } from '../StrategyFactory.ts';
import { UniversalSignalNormalizer } from '../UniversalSignalNormalizer.ts';
import {
  makeMarketSnapshot,
  makeDerivativesSnapshot,
  makeEtfSnapshot,
  makeEarningsSnapshot,
} from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

// Deterministic Pseudo-Random Generator (LCG)
class SimpleRng {
  private state: number;
  constructor(seed: number = 20261002) {
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

describe('Phase 25 — Strategy Property-Based Testing (PBT)', () => {
  const rng = new SimpleRng(20261002);

  describe('PBT-1: Conviction Boundedness', () => {
    it('always preserves 0 <= conviction <= 100 and finite across 100+ random inputs', () => {
      for (let i = 0; i < 100; i++) {
        const rawConviction = (rng.nextFloat() - 0.5) * 400; // range [-200, 200]
        const normalized = UniversalSignalNormalizer.normalizeConviction(rawConviction);

        expect(normalized).toBeGreaterThanOrEqual(0);
        expect(normalized).toBeLessThanOrEqual(100);
        expect(Number.isFinite(normalized)).toBe(true);
      }
    });
  });

  describe('PBT-2: Signal Direction Exhaustiveness', () => {
    const validDirections = new Set(['LONG', 'SHORT', 'FLAT', 'HOLD', 'CLOSE', 'REBALANCE']);

    it('always produces a direction in the declared vocabulary across all strategies and random conditions', () => {
      const strategies = [
        'EARNINGS_MOMENTUM_QUALITY',
        'FUTURES_BASIS_ARBITRAGE',
        'ETF_NAV_ARBITRAGE',
        'REGIME_ADAPTIVE',
        'DIVIDEND_CAPTURE',
      ];

      for (let i = 0; i < 100; i++) {
        const strat = strategies[rng.nextInt(0, strategies.length - 1)];
        const price = rng.nextInt(10000, 150000);

        const context: StrategyContext = {
          symbol: 'SYM',
          assetClass: 'EQUITY',
          asOfDate: '2026-10-01',
          evaluatedAt: '2026-10-01T15:00:00.000Z',
          currentPrice: price,
          marketSnapshot: makeMarketSnapshot(),
          derivativesSnapshot: makeDerivativesSnapshot(),
          etfSnapshot: makeEtfSnapshot(),
          earningsSnapshot: makeEarningsSnapshot(),
        };

        const signal = StrategyFactory.evaluate(strat, context);
        expect(validDirections.has(signal.direction)).toBe(true);
        expect(signal.conviction).toBeGreaterThanOrEqual(0);
        expect(signal.conviction).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('PBT-3: Directional Monotonicity', () => {
    it('monotonically increases or maintains SHORT conviction as positive basis widens in FuturesBasisArbitrage', () => {
      let previousConviction = 0;

      // Basis from 5.0 points to 25.0 points
      for (let basisPoints = 5; basisPoints <= 25; basisPoints += 2) {
        const deriv = makeDerivativesSnapshot({
          spotPrice: 1300,
          basis: {
            spotFuturesBasis: basisPoints,
            basisPercentage: (basisPoints / 1300) * 100,
            annualizedBasisPercent: 15.0,
            costOfCarryFairValue: 1302.0,
            mispricingSpread: basisPoints - 2.0,
            isMispriced: true,
            timestamp: '2026-10-01T15:00:00.000Z',
          },
        });

        const context: StrategyContext = {
          symbol: 'VN30F1M',
          assetClass: 'DERIVATIVE',
          asOfDate: '2026-10-01',
          evaluatedAt: '2026-10-01T15:00:00.000Z',
          currentPrice: 1300 + basisPoints,
          derivativesSnapshot: deriv,
        };

        const signal = StrategyFactory.evaluate('FUTURES_BASIS_ARBITRAGE', context);
        expect(signal.direction).toBe('SHORT');
        expect(signal.conviction).toBeGreaterThanOrEqual(previousConviction);
        previousConviction = signal.conviction;
      }
    });
  });

  describe('PBT-4: Fail-Closed Dominance', () => {
    it('always forces direction to neutral (HOLD/FLAT) and conviction to 0 when snapshots are UNAVAILABLE', () => {
      for (let i = 0; i < 50; i++) {
        const context: StrategyContext = {
          symbol: 'TEST',
          assetClass: 'EQUITY',
          asOfDate: '2026-10-01',
          evaluatedAt: '2026-10-01T15:00:00.000Z',
          earningsSnapshot: null, // missing mandatory snapshot
        };

        const signal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', context);
        expect(signal.direction).toBe('HOLD');
        expect(signal.conviction).toBe(0);
        expect(signal.dataFreshness).toBe('UNAVAILABLE');
      }
    });
  });

  describe('PBT-5: Deterministic Execution Invariance', () => {
    it('produces byte-for-byte identical signal results across 50 repeated evaluations of identical context', () => {
      const context: StrategyContext = {
        symbol: 'HPG',
        assetClass: 'EQUITY',
        asOfDate: '2026-10-01',
        evaluatedAt: '2026-10-01T15:00:00.000Z',
        currentPrice: 28000,
        earningsSnapshot: makeEarningsSnapshot(),
        marketSnapshot: makeMarketSnapshot(),
      };

      const baselineSignal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', context);
      const serializedBaseline = JSON.stringify(baselineSignal);

      for (let i = 0; i < 50; i++) {
        const nextSignal = StrategyFactory.evaluate('EARNINGS_MOMENTUM_QUALITY', context);
        expect(JSON.stringify(nextSignal)).toBe(serializedBaseline);
      }
    });
  });
});
