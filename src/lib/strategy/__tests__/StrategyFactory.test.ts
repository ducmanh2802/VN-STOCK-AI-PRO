import { describe, it, expect } from 'vitest';
import { StrategyFactory } from '../StrategyFactory.ts';
import { makeEarningsSnapshot, makeMarketSnapshot } from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — StrategyFactory', () => {
  it('discovers all registered canonical strategies and aliases', () => {
    const strategies = StrategyFactory.getAllStrategies();
    expect(strategies.length).toBeGreaterThanOrEqual(5);

    expect(StrategyFactory.getStrategy('STRATEGY_EQUITY_EARNINGS_MOMENTUM')).toBeDefined();
    expect(StrategyFactory.getStrategy('EARNINGS_MOMENTUM_QUALITY')).toBeDefined();
    expect(StrategyFactory.getStrategy('STRATEGY_DERIVATIVES_BASIS_ARBITRAGE')).toBeDefined();
    expect(StrategyFactory.getStrategy('FUTURES_BASIS_ARBITRAGE')).toBeDefined();
    expect(StrategyFactory.getStrategy('STRATEGY_ETF_NAV_ARBITRAGE')).toBeDefined();
    expect(StrategyFactory.getStrategy('ETF_NAV_ARBITRAGE')).toBeDefined();
    expect(StrategyFactory.getStrategy('STRATEGY_CROSS_ASSET_REGIME_ADAPTIVE')).toBeDefined();
    expect(StrategyFactory.getStrategy('REGIME_ADAPTIVE')).toBeDefined();
    expect(StrategyFactory.getStrategy('STRATEGY_EQUITY_DIVIDEND_CAPTURE')).toBeDefined();
    expect(StrategyFactory.getStrategy('DIVIDEND_CAPTURE')).toBeDefined();
  });

  it('fails closed when an unknown strategy ID is evaluated', () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
    };

    const signal = StrategyFactory.evaluate('NON_EXISTENT_STRATEGY', context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('INVALID_STRATEGY_ID');
    expect(signal.notes![0]).toContain("Strategy 'NON_EXISTENT_STRATEGY' is not registered");
  });

  it('fails closed when parameter validation fails', () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
    };

    const signal = StrategyFactory.evaluate(
      'STRATEGY_EQUITY_EARNINGS_MOMENTUM',
      context,
      { minCfoToNetIncomeRatio: -5.0 } // invalid negative ratio
    );

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('INVALID_PARAMETERS');
    expect(signal.notes![0]).toContain('minCfoToNetIncomeRatio must be a non-negative finite number');
  });

  it('successfully executes and normalizes an evaluation', () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      earningsSnapshot: makeEarningsSnapshot(),
      marketSnapshot: makeMarketSnapshot(),
    };

    const signal = StrategyFactory.evaluate(
      'EARNINGS_MOMENTUM_QUALITY',
      context
    );

    expect(signal.direction).toBe('LONG');
    expect(signal.conviction).toBeGreaterThanOrEqual(70);
    expect(signal.strength).toBe('STRONG');
    expect(signal.targetPrice).toBe(32200);
  });
});
