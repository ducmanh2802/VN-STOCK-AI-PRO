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
      spotQuote: {
        symbol: 'VN30',
        price: 1310.0,
        referencePrice: 1308.0,
        change: 2.0,
        changePercent: 0.15,
        source: 'VPS',
        sourceTimestamp: 1790866800000,
        fetchedAt: '2026-10-01T15:00:00.000Z',
        dataFreshness: 'CURRENT',
      },
      basis: {
        futuresPrice: 1320.5,
        spotPrice: 1310.0,
        basis: 10.5, // F (1320.5) - S (1310.0) = +10.5 pts
        basisPct: 0.80,
        annualizedBasis: 18.0,
        daysToExpiry: 14,
        fairBasis: 2.0,
        fairPrice: 1312.0,
        mispricing: 8.5,
        status: 'LIVE',
        warnings: [],
        dataLineage: {
          futuresSource: 'VPS',
          spotSource: 'VPS',
          timestamp: '2026-10-01T15:00:00.000Z',
        },
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
      quote: {
        symbol: 'VN30F2610',
        contractCode: 'VN30F2610',
        underlying: 'VN30',
        price: 1320.0,
        open: 1325.0,
        high: 1328.0,
        low: 1318.0,
        close: 1320.0,
        referencePrice: 1325.0,
        ceilingPrice: 1410.0,
        floorPrice: 1240.0,
        change: -5.0,
        changePercent: -0.38,
        volume: 200000,
        tradingValue: 26000000000000,
        openInterest: 55000,
        source: 'VPS',
        sourceTimestamp: 1790866800000,
        fetchedAt: '2026-10-01T15:00:00.000Z',
        dataFreshness: 'CURRENT',
      },
      spotQuote: {
        symbol: 'VN30',
        price: 1330.0,
        referencePrice: 1325.0,
        change: 5.0,
        changePercent: 0.38,
        source: 'VPS',
        sourceTimestamp: 1790866800000,
        fetchedAt: '2026-10-01T15:00:00.000Z',
        dataFreshness: 'CURRENT',
      },
      basis: {
        futuresPrice: 1320.0,
        spotPrice: 1330.0,
        basis: -10.0, // F (1320.0) - S (1330.0) = -10.0 pts
        basisPct: -0.75,
        annualizedBasis: -17.0,
        daysToExpiry: 14,
        fairBasis: 2.0,
        fairPrice: 1332.0,
        mispricing: -12.0,
        status: 'LIVE',
        warnings: [],
        dataLineage: {
          futuresSource: 'VPS',
          spotSource: 'VPS',
          timestamp: '2026-10-01T15:00:00.000Z',
        },
      },
      openInterest: {
        symbol: 'VN30F2610',
        openInterest: 55000,
        previousOpenInterest: 52000,
        openInterestChange: 3000,
        openInterestChangePct: 5.77,
        volume: 200000,
        volumeToOIRatio: 3.63,
        positioning: 'LONG_ACCUMULATION',
        status: 'COMPUTED',
        warnings: [],
        dataLineage: {
          source: 'VPS',
          timestamp: '2026-10-01T15:00:00.000Z',
        },
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
      spotQuote: {
        symbol: 'VN30',
        price: null,
        referencePrice: null,
        change: null,
        changePercent: null,
        source: 'VPS',
        sourceTimestamp: null,
        fetchedAt: '2026-10-01T15:00:00.000Z',
        dataFreshness: 'UNAVAILABLE',
      },
      basis: {
        futuresPrice: 1320.0,
        spotPrice: null,
        basis: null,
        basisPct: null,
        annualizedBasis: null,
        daysToExpiry: 14,
        fairBasis: null,
        fairPrice: null,
        mispricing: null,
        status: 'DATA_UNAVAILABLE',
        warnings: [],
        dataLineage: {
          futuresSource: 'VPS',
          spotSource: 'VPS',
          timestamp: '2026-10-01T15:00:00.000Z',
        },
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
