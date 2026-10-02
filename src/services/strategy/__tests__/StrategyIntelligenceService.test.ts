import { describe, it, expect, beforeEach } from 'vitest';
import {
  StrategyIntelligenceService,
  hashParameters,
} from '../StrategyIntelligenceService.ts';
import { cacheClear } from '../../market/marketDataCache.ts';
import {
  makeEarningsSnapshot,
  makeMarketSnapshot,
  makeDerivativesSnapshot,
} from '../../../lib/strategy/__tests__/fixtures.ts';
import type { StrategyContext } from '../../../lib/strategy/types.ts';

describe('Phase 25 — StrategyIntelligenceService', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('computes deterministic parameter hashes and differentiates parameter variations', () => {
    const hashA = hashParameters({ minRevenueGrowthYoY: 10, minNetProfitGrowthYoY: 15 });
    // Same parameters with different key order must yield the exact same hash
    const hashB = hashParameters({ minNetProfitGrowthYoY: 15, minRevenueGrowthYoY: 10 });
    // Different parameters must yield different hash
    const hashC = hashParameters({ minRevenueGrowthYoY: 20, minNetProfitGrowthYoY: 15 });

    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
    expect(hashParameters(undefined)).toBe('DEFAULT');
  });

  it('orchestrates signal evaluation and caches result for 60s TTL', async () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      earningsSnapshot: makeEarningsSnapshot(),
      marketSnapshot: makeMarketSnapshot(),
    };

    const signal1 = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
      contextOverride: context,
    });

    expect(signal1.direction).toBe('LONG');
    expect(signal1.conviction).toBeGreaterThanOrEqual(70);

    // Call again without forceRefresh — should hit cache
    const signal2 = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
      contextOverride: context,
    });

    expect(signal2).toEqual(signal1);
  });

  it('bypasses cache when forceRefresh is set to true', async () => {
    const context: StrategyContext = {
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 1320.5,
      derivativesSnapshot: makeDerivativesSnapshot(),
    };

    const signal1 = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'FUTURES_BASIS_ARBITRAGE',
      symbol: 'VN30F1M',
      asOfDate: '2026-10-01',
      contextOverride: context,
    });

    expect(signal1.direction).toBe('SHORT');

    const signal2 = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'FUTURES_BASIS_ARBITRAGE',
      symbol: 'VN30F1M',
      asOfDate: '2026-10-01',
      forceRefresh: true,
      contextOverride: context,
    });

    expect(signal2.direction).toBe('SHORT');
  });

  it('isolates cache keys across different parameters', async () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      earningsSnapshot: makeEarningsSnapshot(),
      marketSnapshot: makeMarketSnapshot(),
    };

    const signalStandard = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'EARNINGS_MOMENTUM_QUALITY',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
      parameters: { minRevenueGrowthYoY: 10 },
      contextOverride: context,
    });

    // Extremely high hurdle (50% growth required) -> should return HOLD
    const signalStrict = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'EARNINGS_MOMENTUM_QUALITY',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
      parameters: { minRevenueGrowthYoY: 50 },
      contextOverride: context,
    });

    expect(signalStandard.direction).toBe('LONG');
    expect(signalStrict.direction).toBe('HOLD');
  });

  it('fails closed when an unregistered strategy ID is passed', async () => {
    const signal = await StrategyIntelligenceService.evaluateSignal({
      strategyId: 'UNKNOWN_STRATEGY_XYZ',
      symbol: 'HPG',
      asOfDate: '2026-10-01',
    });

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('INVALID_STRATEGY_ID');
  });
});
