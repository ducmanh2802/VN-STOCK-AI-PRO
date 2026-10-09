import { describe, it, expect } from 'vitest';
import {
  RANGE_PRESETS,
  costRows,
  drawdownCurvePoints,
  equityCurvePoints,
  isoDaysBefore,
  presetDays,
  resolveDateRange,
} from '../metrics';
import type { BacktestResult, EquityPoint } from '../../../lib/trading/backtest/BacktestTypes';

function makeResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    symbol: 'HPG',
    initialCapital: 100_000_000,
    finalEquity: 110_000_000,
    totalReturn: 10,
    annualizedReturn: 5,
    totalTrades: 2,
    winningTrades: 1,
    losingTrades: 1,
    winRate: 50,
    grossProfit: 20_000_000,
    grossLoss: 10_000_000,
    netProfit: 10_000_000,
    maxDrawdown: -8,
    profitFactor: 2,
    averageWin: 20_000_000,
    averageLoss: -10_000_000,
    averageHoldingPeriod: 5,
    fees: 150_000,
    tax: 100_000,
    slippageCost: 100_000,
    sharpeRatio: 1.1,
    sortinoRatio: 1.4,
    tradeHistory: [],
    equityCurve: [],
    drawdownCurve: [],
    ...overrides,
  };
}

function makeCurve(length: number): EquityPoint[] {
  return Array.from({ length }, (_, i) => ({
    timestamp: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    equity: 100_000_000 + i,
    drawdown: i % 5 === 0 ? -1.5 : 0,
  })) as EquityPoint[];
}

describe('backtest/metrics — date range', () => {
  it('exposes exactly the four documented presets', () => {
    expect([...RANGE_PRESETS]).toEqual(['1Y', '2Y', '3Y', '5Y']);
    expect(presetDays('1Y')).toBe(365);
    expect(presetDays('5Y')).toBe(1826);
  });

  it('resolves a preset to a window ending on the injected today', () => {
    expect(resolveDateRange('1Y', '2026-10-08')).toEqual({
      startDate: '2025-10-08',
      endDate: '2026-10-08',
    });
  });

  it('walks back across year boundaries', () => {
    expect(isoDaysBefore('2026-01-01', 365)).toBe('2025-01-01');
  });

  it('returns the input unchanged when it is not a parseable date', () => {
    expect(isoDaysBefore('not-a-date', 30)).toBe('not-a-date');
  });
});

describe('backtest/metrics — curve sampling', () => {
  it('returns [] for an empty or non-array curve instead of throwing', () => {
    expect(equityCurvePoints([])).toEqual([]);
    expect(drawdownCurvePoints(undefined as unknown as EquityPoint[])).toEqual([]);
  });

  it('always includes the final equity point', () => {
    const curve = makeCurve(1_000);
    const sampled = equityCurvePoints(curve, 10);
    expect(sampled.length).toBeGreaterThan(0);
    expect(sampled[sampled.length - 1].value).toBe(curve[curve.length - 1].equity);
  });

  it('samples by drawdown for the drawdown curve and preserves the sign', () => {
    const curve = makeCurve(50);
    const sampled = drawdownCurvePoints(curve, 10);
    expect(sampled.every((p) => p.value <= 0)).toBe(true);
    expect(sampled.length).toBeLessThan(curve.length);
  });

  it('does not downsample a curve already under the cap', () => {
    const curve = makeCurve(5);
    expect(equityCurvePoints(curve, 400)).toHaveLength(5);
  });
});

describe('backtest/metrics — cost composition', () => {
  it('splits the absolute costs and sums to 100%', () => {
    const rows = costRows(makeResult());
    expect(rows.map((r) => r.key)).toEqual(['fees', 'tax', 'slippage', 'total']);
    const [fees, tax, slippage, total] = rows;
    expect(total.valueVnd).toBe(350_000);
    expect(fees.shareOfCosts!).toBeCloseTo((150_000 / 350_000) * 100, 5);
    expect(tax.shareOfCosts!).toBeCloseTo((100_000 / 350_000) * 100, 5);
    expect(slippage.shareOfCosts!).toBeCloseTo((100_000 / 350_000) * 100, 5);
    expect(fees.shareOfCosts! + tax.shareOfCosts! + slippage.shareOfCosts!).toBeCloseTo(100, 5);
  });

  it('reports null share when there are no costs at all (never 0/0)', () => {
    const rows = costRows(makeResult({ fees: 0, tax: 0, slippageCost: 0 }));
    expect(rows.every((r) => r.shareOfCosts === null)).toBe(true);
    expect(rows[3].valueVnd).toBe(0);
  });
});
