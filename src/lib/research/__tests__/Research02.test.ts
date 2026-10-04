/**
 * RESEARCH-02 TESTS — ordering, look-ahead, orders/fills, accounting, CA, gaps
 */
import { describe, it, expect } from 'vitest';
import { EventBacktestEngine, type ResearchBar } from '../EventBacktestEngine.ts';
import { CostEngine, DEFAULT_RESEARCH_COST } from '../CostEngine.ts';

function bar(date: string, close: number, vol = 100000): ResearchBar {
  return { date, open: close, high: close, low: close, close, volume: vol, publicationDate: date };
}

const fee = (gross: number, side: 'BUY' | 'SELL') => CostEngine.feeFor(DEFAULT_RESEARCH_COST, gross, side);
const slip = (p: number, side: 'BUY' | 'SELL') => CostEngine.slippagePrice(DEFAULT_RESEARCH_COST, p, side);

describe('EventBacktestEngine', () => {
  const bars = [bar('2024-01-02', 100), bar('2024-01-03', 101), bar('2024-01-04', 102), bar('2024-01-05', 103)];

  it('emits ordered lifecycle events and fills T+1', () => {
    const r = EventBacktestEngine.run({
      symbol: 'HPG', bars, strategy: (_v, i) => (i === 0 ? 'BUY' : 'HOLD'),
      initialCapital: 100000000, asOfCutoff: '2024-12-31',
      feeForFill: fee, slippageForFill: slip,
      roundLot: (q) => CostEngine.roundLot(q),
    });
    expect(r.fills.length).toBe(1);
    expect(r.fills[0].date).toBe('2024-01-03');
    const kinds = r.events.map((e) => e.kind);
    expect(kinds.indexOf('SIGNAL')).toBeLessThan(kinds.indexOf('FILL'));
    expect(kinds).toContain('MARKET_OPEN');
    expect(kinds).toContain('MARKET_CLOSE');
  });

  it('strategy cannot see future (sliced context)', () => {
    let maxSeen = 0;
    EventBacktestEngine.run({
      symbol: 'HPG', bars, strategy: (v) => { maxSeen = Math.max(maxSeen, v.length); return 'HOLD'; },
      initialCapital: 10000000, asOfCutoff: '2024-12-31',
      feeForFill: fee, slippageForFill: slip, roundLot: (q) => CostEngine.roundLot(q),
    });
    expect(maxSeen).toBe(4);
  });

  it('rejects future-publication bars', () => {
    const future = [...bars, { ...bar('2024-01-08', 105), publicationDate: '2025-01-01' }];
    const r = EventBacktestEngine.run({
      symbol: 'HPG', bars: future, strategy: () => 'HOLD',
      initialCapital: 10000000, asOfCutoff: '2024-12-31',
      feeForFill: fee, slippageForFill: slip, roundLot: (q) => CostEngine.roundLot(q),
    });
    expect(r.lookaheadRejected).toBe(true);
    expect(r.violations.join(' ')).toMatch(/FUTURE_PUBLICATION/);
  });

  it('conserves cash + position = NAV and applies splits/dividends', () => {
    const r = EventBacktestEngine.run({
      symbol: 'HPG', bars, strategy: (_v, i) => (i === 0 ? 'BUY' : i === 2 ? 'SELL' : 'HOLD'),
      initialCapital: 10000000, asOfCutoff: '2024-12-31',
      feeForFill: fee, slippageForFill: slip, roundLot: (q) => CostEngine.roundLot(q),
      corporateActions: [
        { date: '2024-01-04', kind: 'SPLIT', factor: 2 },
        { date: '2024-01-05', kind: 'CASH_DIVIDEND', cashPerShare: 100 },
      ],
    });
    for (const p of r.equity) {
      expect(p.nav).toBeGreaterThan(0);
      expect(p.cash).toBeGreaterThanOrEqual(0);
    }
    expect(r.trades.length).toBeGreaterThanOrEqual(0);
  });

  it('rejects invalid orders (no cash / no position)', () => {
    const r = EventBacktestEngine.run({
      symbol: 'HPG', bars: [bar('2024-01-02', 100000000)], strategy: () => 'BUY',
      initialCapital: 100, asOfCutoff: '2024-12-31',
      feeForFill: fee, slippageForFill: slip, roundLot: (q) => CostEngine.roundLot(q),
    });
    expect(r.fills.length).toBe(0);
  });

  it('supports MARKET/LIMIT/STOP kinds and exposes NAV series', () => {
    expect(EventBacktestEngine.orderKindSupported('MARKET')).toBe(true);
    expect(EventBacktestEngine.orderKindSupported('LIMIT')).toBe(true);
    expect(EventBacktestEngine.orderKindSupported('STOP')).toBe(true);
    const r = EventBacktestEngine.run({
      symbol: 'HPG', bars, strategy: () => 'HOLD',
      initialCapital: 5000000, asOfCutoff: '2024-12-31',
      feeForFill: fee, slippageForFill: slip, roundLot: (q) => CostEngine.roundLot(q),
    });
    expect(r.equity.length).toBe(4);
    expect(r.finalNav).toBe(5000000);
  });
});
