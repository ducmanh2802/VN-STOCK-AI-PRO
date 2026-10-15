import { describe, it, expect } from 'vitest';
import { EtfNavArbitrageStrategy } from '../generators/EtfNavArbitrageStrategy.ts';
import { makeEtfSnapshot } from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — EtfNavArbitrageStrategy', () => {
  const strategy = new EtfNavArbitrageStrategy();

  it('validates parameters strictly', () => {
    expect(strategy.validateParameters({ discountBuyThresholdPercent: -1.2 }).valid).toBe(true);
    expect(strategy.validateParameters({ maxTrackingErrorPercent: -0.5 }).valid).toBe(false);
  });

  it('emits LONG signal when ETF trades at significant discount to NAV', () => {
    const etf = makeEtfSnapshot({
      nav: {
        symbol: 'E1VFVN30',
        navPerShare: 25000,
        previousNavPerShare: 24850,
        navChange: 150,
        navChangePercent: 0.60,
        totalNavVnd: 11250000000000,
        asOfDate: '2026-09-30',
        source: 'HOSE',
        sourceTimestamp: 1790866800000,
        dataFreshness: 'CURRENT',
      },
      premiumDiscount: {
        symbol: 'E1VFVN30',
        marketPrice: 24500,
        referenceNav: 25000,
        premiumDiscountPoints: -500,
        premiumDiscountPercent: -2.0, // -2% deep discount (<= -1.0%)
        referenceNavType: 'OFFICIAL_EOD',
        regime: 'DISCOUNT',
        asOfDate: '2026-09-30',
        status: 'LIVE',
        warnings: [],
      },
      quote: {
        symbol: 'E1VFVN30',
        price: 24500,
        open: 24400,
        high: 24600,
        low: 24350,
        close: 24500,
        referencePrice: 24450,
        ceilingPrice: 26150,
        floorPrice: 22750,
        change: 50,
        changePercent: 0.20,
        volume: 1250000,
        tradingValue: 30625000000,
        foreignBuyVolume: 250000,
        foreignSellVolume: 100000,
        foreignRoom: 50000000,
        source: 'VPS',
        sourceTimestamp: 1790866800000,
        fetchedAt: '2026-10-01T15:00:00.000Z',
        dataFreshness: 'CURRENT',
      },
    });

    const context: StrategyContext = {
      symbol: 'E1VFVN30',
      assetClass: 'ETF',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 24500,
      etfSnapshot: etf,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('LONG');
    expect(signal.conviction).toBeGreaterThanOrEqual(75);
    expect(signal.targetPrice).toBe(25000); // Fair NAV convergence
    expect(signal.stopLoss).toBe(23887.5);  // 24500 * (1 - 0.025)
  });

  it('fails closed to HOLD with ETF_NAV_UNAVAILABLE if NAV is 0 or negative', () => {
    const etf = makeEtfSnapshot({
      nav: {
        symbol: 'E1VFVN30',
        navPerShare: 0, // Zero NAV invalid
        previousNavPerShare: 0,
        navChange: 0,
        navChangePercent: 0,
        totalNavVnd: 0,
        asOfDate: '2026-09-30',
        source: 'HOSE',
        sourceTimestamp: 1790866800000,
        dataFreshness: 'INVALID',
      },
    });

    const context: StrategyContext = {
      symbol: 'E1VFVN30',
      assetClass: 'ETF',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      etfSnapshot: etf,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('ETF_NAV_UNAVAILABLE');
  });
});
