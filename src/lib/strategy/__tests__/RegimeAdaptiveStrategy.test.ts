import { describe, it, expect } from 'vitest';
import { RegimeAdaptiveStrategy } from '../generators/RegimeAdaptiveStrategy.ts';
import { makeMarketSnapshot } from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — RegimeAdaptiveStrategy', () => {
  const strategy = new RegimeAdaptiveStrategy();

  it('validates parameters strictly', () => {
    expect(strategy.validateParameters({ bullTrendMinConfidence: 60 }).valid).toBe(true);
    expect(strategy.validateParameters({ bullTrendMinConfidence: 150 }).valid).toBe(false);
  });

  it('emits confident LONG signal under BULL_TREND regime', () => {
    const market = makeMarketSnapshot({
      regime: {
        regime: 'BULL_TREND',
        confidence: 84.0,
        scores: {
          trendScore: 88,
          breadthScore: 80,
          volatilityScore: 25,
          liquidityScore: 82,
          momentumScore: 78,
          participationScore: 80,
        },
        timestamp: '2026-10-01T15:00:00.000Z',
        calculationVersion: '20.0.0',
        dataLineage: { source: 'VPS', universe: 'HOSE', barCount: 200, constituentsEvaluated: 30 },
        warnings: [],
      },
    });

    const context: StrategyContext = {
      symbol: 'VN30_PORTFOLIO',
      assetClass: 'CROSS_ASSET',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 1300,
      marketSnapshot: market,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('LONG');
    expect(signal.conviction).toBe(84);
    expect(signal.strength).toBe('STRONG');
    expect(signal.targetPrice).toBe(1430); // 1300 * 1.10
    expect(signal.stopLoss).toBe(1235);    // 1300 * 0.95
  });

  it('emits REBALANCE signal under HIGH_VOLATILITY regime', () => {
    const market = makeMarketSnapshot({
      regime: {
        regime: 'HIGH_VOLATILITY',
        confidence: 70.0,
        scores: {
          trendScore: 45,
          breadthScore: 40,
          volatilityScore: 92,
          liquidityScore: 75,
          momentumScore: 40,
          participationScore: 50,
        },
        timestamp: '2026-10-01T15:00:00.000Z',
        calculationVersion: '20.0.0',
        dataLineage: { source: 'VPS', universe: 'HOSE', barCount: 200, constituentsEvaluated: 30 },
        warnings: [],
      },
    });

    const context: StrategyContext = {
      symbol: 'VN30_PORTFOLIO',
      assetClass: 'CROSS_ASSET',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      marketSnapshot: market,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('REBALANCE');
    expect(signal.conviction).toBe(50);
  });

  it('fails closed to HOLD with MARKET_REGIME_UNAVAILABLE when regime is UNKNOWN', () => {
    const market = makeMarketSnapshot({
      regime: {
        regime: 'UNKNOWN',
        confidence: 0,
        scores: {
          trendScore: null,
          breadthScore: null,
          volatilityScore: null,
          liquidityScore: null,
          momentumScore: null,
          participationScore: null,
        },
        timestamp: '2026-10-01T15:00:00.000Z',
        calculationVersion: '20.0.0',
        dataLineage: { source: 'VPS', universe: 'HOSE', barCount: 0, constituentsEvaluated: 0 },
        warnings: ['Index feed disconnected'],
      },
    });

    const context: StrategyContext = {
      symbol: 'VN30_PORTFOLIO',
      assetClass: 'CROSS_ASSET',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      marketSnapshot: market,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('MARKET_REGIME_UNAVAILABLE');
  });
});
