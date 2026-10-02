import { describe, it, expect } from 'vitest';
import { EarningsMomentumStrategy } from '../generators/EarningsMomentumStrategy.ts';
import { makeEarningsSnapshot, makeMarketSnapshot } from './fixtures.ts';
import type { StrategyContext } from '../types.ts';

describe('Phase 25 — EarningsMomentumStrategy', () => {
  const strategy = new EarningsMomentumStrategy();

  it('validates parameters strictly', () => {
    expect(strategy.validateParameters({ minRevenueGrowthYoY: 12 }).valid).toBe(true);
    expect(strategy.validateParameters({ minRevenueGrowthYoY: NaN }).valid).toBe(false);
    expect(strategy.validateParameters({ minCfoToNetIncomeRatio: -1 }).valid).toBe(false);
    expect(strategy.validateParameters({ targetUpsidePercent: 0 }).valid).toBe(false);
  });

  it('emits confident LONG signal when YoY revenue and profit growth and quality criteria are met', () => {
    const earnings = makeEarningsSnapshot();
    const market = makeMarketSnapshot();

    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      earningsSnapshot: earnings,
      marketSnapshot: market,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('LONG');
    expect(signal.conviction).toBeGreaterThanOrEqual(70);
    expect(signal.strength).toBe('STRONG');
    expect(signal.targetPrice).toBe(32200); // 28000 * 1.15
    expect(signal.stopLoss).toBe(26040);    // 28000 * 0.93
    expect(signal.dataFreshness).toBe('CURRENT');
    expect(signal.lineage.strategyId).toBe('STRATEGY_EQUITY_EARNINGS_MOMENTUM');
  });

  it('emits HOLD with caution when growth is high but earnings quality has red flags or poor CFO conversion', () => {
    const poorQualityEarnings = makeEarningsSnapshot({
      quality: {
        accrualsBalanceSheet: 0.25, // High accruals
        accrualsCashFlow: 0.22,
        cfoToNetIncomeRatio: 0.35,  // Weak cash flow conversion
        redFlags: ['CFO_DIVERGENCE_HIGH_ACCRUALS'],
        qualityScore: 35,
        reasons: {},
      },
    });

    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28000,
      earningsSnapshot: poorQualityEarnings,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.reasonCode).toBe('POOR_EARNINGS_QUALITY_DIVERGENCE');
    expect(signal.conviction).toBe(25);
  });

  it('fails closed when Phase 24 earnings snapshot is missing or UNAVAILABLE', () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      earningsSnapshot: null,
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.dataFreshness).toBe('UNAVAILABLE');
    expect(signal.reasonCode).toBe('REQUIRED_EARNINGS_FACTS_UNAVAILABLE');
  });

  it('fails closed when context has lookahead rejection', () => {
    const context: StrategyContext = {
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      lookaheadRejected: true,
      lookaheadDetails: ['Future earnings leaked'],
    };

    const signal = strategy.evaluate(context);

    expect(signal.direction).toBe('HOLD');
    expect(signal.conviction).toBe(0);
    expect(signal.reasonCode).toBe('LOOKAHEAD_DATA_REJECTED');
  });
});
