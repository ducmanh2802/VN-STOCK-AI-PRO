import { describe, it, expect } from 'vitest';
import { FuturesBasisArbitrageStrategy } from '../generators/FuturesBasisArbitrageStrategy.ts';
import { makeDerivativesSnapshot } from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — FuturesBasisArbitrageStrategy', () => {
  const strategy = new FuturesBasisArbitrageStrategy();

  it('validates parameters strictly', () => {
    expect(strategy.validateParameters({ minBasisPoints: 4.5 }).valid).toBe(true);
    expect(strategy.validateParameters({ minBasisPoints: -2 }).valid).toBe(false);
    expect(strategy.validateParameters({ targetProfitPoints: NaN }).valid).toBe(false);
  });

  it('emits SHORT signal on excessive positive basis (Contango extreme)', () => {
    const deriv = makeDerivativesSnapshot({
      spotPrice: 1310.0,
      basis: {
        spotFuturesBasis: 10.5, // F (1320.5) - S (1310.0) = +10.5 pts
        basisPercentage: 0.80,
        annualizedBasisPercent: 18.0,
        costOfCarryFairValue: 1312.0,
        mispricingSpread: 8.5,
        isMispriced: true,
        timestamp: '2026-10-01T15:00:00.000Z',
      },
    });

    const context: StrategyContext = {
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 1320.5,
      derivativesSnapshot: deriv,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('SHORT');
    expect(signal.conviction).toBeGreaterThanOrEqual(70);
    expect(signal.targetPrice).toBe(1314.5); // 1320.5 - 6.0
    expect(signal.stopLoss).toBe(1324.5);    // 1320.5 + 4.0
    expect(signal.timeInForce).toBe('INTRADAY');
  });

  it('emits LONG signal on excessive negative basis (Backwardation extreme)', () => {
    const deriv = makeDerivativesSnapshot({
      spotPrice: 1330.0,
      activeContractQuote: {
        symbol: 'VN30F2610',
        contractCode: 'VN30F2610',
        underlying: 'VN30',
        price: 1320.0,
        open: 1325.0,
        high: 1328.0,
        low: 1318.0,
        close: 1320.0,
        change: -5.0,
        changePercent: -0.38,
        volume: 200000,
        openInterest: 55000,
        basis: -10.0,
        tradingValue: 26000000000000,
        source: 'VPS',
        sourceTimestamp: 1790866800000,
        freshness: 'CURRENT',
      },
      basis: {
        spotFuturesBasis: -10.0, // F (1320.0) - S (1330.0) = -10.0 pts
        basisPercentage: -0.75,
        annualizedBasisPercent: -17.0,
        costOfCarryFairValue: 1332.0,
        mispricingSpread: -12.0,
        isMispriced: true,
        timestamp: '2026-10-01T15:00:00.000Z',
      },
      openInterest: {
        currentOI: 55000,
        previousOI: 52000,
        changeOI: 3000,
        changeOIPercent: 5.77,
        volumeToOIRatio: 3.63,
        interpretation: 'LONG_ACCUMULATION',
      },
    });

    const context: StrategyContext = {
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 1320.0,
      derivativesSnapshot: deriv,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('LONG');
    expect(signal.conviction).toBeGreaterThanOrEqual(75);
    expect(signal.targetPrice).toBe(1326.0); // 1320.0 + 6.0
    expect(signal.stopLoss).toBe(1316.0);    // 1320.0 - 4.0
  });

  it('fails closed to FLAT with SPOT_INDEX_UNAVAILABLE when spotPrice is null', () => {
    const deriv = makeDerivativesSnapshot({
      spotPrice: null,
      basis: {
        spotFuturesBasis: null as any,
        basisPercentage: null as any,
        annualizedBasisPercent: null as any,
        costOfCarryFairValue: null as any,
        mispricingSpread: null as any,
        isMispriced: false,
        timestamp: '2026-10-01T15:00:00.000Z',
      },
    });

    const context: StrategyContext = {
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      derivativesSnapshot: deriv,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('FLAT');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('SPOT_INDEX_UNAVAILABLE');
  });
});
