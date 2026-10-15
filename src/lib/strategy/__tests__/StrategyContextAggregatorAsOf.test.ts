import { describe, it, expect, vi, afterEach } from 'vitest';
import { endOfVnTradingDayIso, StrategyContextAggregator } from '../StrategyContextAggregator.ts';
import { makeMarketSnapshot } from './fixtures.ts';

describe('StrategyContextAggregator asOfDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('endOfVnTradingDayIso returns correct ISO instant', () => {
    const result = endOfVnTradingDayIso('2026-10-01');
    expect(result).toBe('2026-10-01T16:59:59.999Z');
  });

  it('endOfVnTradingDayIso throws on invalid date string', () => {
    expect(() => {
      endOfVnTradingDayIso('invalid');
    }).toThrow();
  });

  it('with asOfDate and no evaluatedAt: future snapshot is rejected', async () => {
    const futureMarket = makeMarketSnapshot({ timestamp: '2026-10-15T00:00:00.000Z' });

    const context = await StrategyContextAggregator.buildContext({
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      marketSnapshotOverride: futureMarket,
    });

    expect(context.lookaheadRejected).toBe(true);
    expect(context.evaluatedAt).toBe('2026-10-01T16:59:59.999Z');
  });

  it('with asOfDate and no evaluatedAt: same-day VN trading hour snapshot is NOT rejected', async () => {
    const sameDayMarket = makeMarketSnapshot({ timestamp: '2026-10-01T08:00:00.000Z' });

    const context = await StrategyContextAggregator.buildContext({
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      marketSnapshotOverride: sameDayMarket,
    });

    expect(context.lookaheadRejected).toBe(false);
  });

  it('result does not depend on wall clock when using asOfDate', async () => {
    const futureMarket = makeMarketSnapshot({ timestamp: '2026-10-15T00:00:00.000Z' });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));

    const context = await StrategyContextAggregator.buildContext({
      symbol: 'VN30F1M',
      assetClass: 'DERIVATIVE',
      asOfDate: '2026-10-01',
      marketSnapshotOverride: futureMarket,
    });

    expect(context.lookaheadRejected).toBe(true);
    expect(context.evaluatedAt).toBe('2026-10-01T16:59:59.999Z');

    vi.useRealTimers();
  });
});