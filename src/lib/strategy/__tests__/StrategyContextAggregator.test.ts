import { describe, it, expect } from 'vitest';
import { StrategyContextAggregator } from '../StrategyContextAggregator.ts';
import {
  makeMarketSnapshot,
  makeDerivativesSnapshot,
  makeEtfSnapshot,
  makeCorporateActionSnapshot,
  makeEarningsSnapshot,
} from './fixtures.ts';

describe('Phase 25 — StrategyContextAggregator', () => {
  it('builds context with direct snapshot overrides', async () => {
    const market = makeMarketSnapshot();
    const earnings = makeEarningsSnapshot();

    const context = await StrategyContextAggregator.buildContext({
      symbol: 'hpg',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      evaluatedAt: '2026-10-01T15:00:00.000Z',
      currentPrice: 28500,
      marketSnapshotOverride: market,
      earningsSnapshotOverride: earnings,
    });

    expect(context.symbol).toBe('HPG');
    expect(context.assetClass).toBe('EQUITY');
    expect(context.asOfDate).toBe('2026-10-01');
    expect(context.currentPrice).toBe(28500);
    expect(context.marketSnapshot).toBe(market);
    expect(context.earningsSnapshot).toBe(earnings);
    expect(context.lookaheadRejected).toBe(false);
  });

  it('detects and flags lookahead bias when snapshot date exceeds evaluation asOfDate', async () => {
    // Snapshot is dated 2026-10-05, but evaluation date is 2026-10-01 (future data leakage)
    const futureEarnings = makeEarningsSnapshot({ asOfDate: '2026-10-05' });

    const context = await StrategyContextAggregator.buildContext({
      symbol: 'HPG',
      assetClass: 'EQUITY',
      asOfDate: '2026-10-01',
      marketSnapshotOverride: makeMarketSnapshot({ timestamp: '2026-10-01T15:00:00.000Z' }),
      earningsSnapshotOverride: futureEarnings,
    });

    expect(context.lookaheadRejected).toBe(true);
    expect(context.lookaheadDetails).toBeDefined();
    expect(context.lookaheadDetails!.some((d) => d.includes('Earnings snapshot date (2026-10-05)'))).toBe(true);
  });

  it('detects lookahead bias on future market snapshot timestamps', async () => {
    const futureMarket = makeMarketSnapshot({ timestamp: '2026-10-15T00:00:00.000Z' });

    const context = await StrategyContextAggregator.buildContext({
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      marketSnapshotOverride: futureMarket,
    });

    expect(context.lookaheadRejected).toBe(true);
  });
});
