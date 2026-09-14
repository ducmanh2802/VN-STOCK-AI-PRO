/**
 * PHASE 17.6 — PERFORMANCE METRICS TESTS
 * ========================================
 * Verifies accuracy of quantitative return, drawdown, and risk ratios.
 */

import { describe, it, expect } from 'vitest';
import { PerformanceMetricsCalculator } from '../PerformanceMetrics.ts';
import type { BacktestTrade, EquityPoint } from '../types.ts';

describe('Phase 17.6 — PerformanceMetricsCalculator', () => {
  it('calculates metrics correctly for clean winning and losing trades', () => {
    const trades: BacktestTrade[] = [
      {
        id: 't1',
        symbol: 'VNM',
        side: 'LONG',
        entryDate: '2026-01-01',
        entryPrice: 100,
        entryGrossValue: 10000,
        entryCommission: 15,
        exitDate: '2026-01-10',
        exitPrice: 120,
        exitGrossValue: 12000,
        exitCommission: 18,
        exitTax: 12,
        quantity: 100,
        grossPnL: 2000,
        netPnL: 1955, // 12000 - 18 - 12 - (10000 + 15)
        returnPct: 19.52,
        holdingDays: 9,
        exitReason: 'STRATEGY_SIGNAL',
      },
      {
        id: 't2',
        symbol: 'VNM',
        side: 'LONG',
        entryDate: '2026-01-15',
        entryPrice: 120,
        entryGrossValue: 12000,
        entryCommission: 18,
        exitDate: '2026-01-20',
        exitPrice: 110,
        exitGrossValue: 11000,
        exitCommission: 16.5,
        exitTax: 11,
        quantity: 100,
        grossPnL: -1000,
        netPnL: -1045.5,
        returnPct: -8.7,
        holdingDays: 5,
        exitReason: 'STOP_LOSS',
      },
    ];

    const equityCurve: EquityPoint[] = [
      { date: '2026-01-01', cash: 90000, positionValue: 10000, totalEquity: 100000, drawdownPct: 0 },
      { date: '2026-01-10', cash: 101955, positionValue: 0, totalEquity: 101955, drawdownPct: 0 },
      { date: '2026-01-15', cash: 89955, positionValue: 12000, totalEquity: 101955, drawdownPct: 0 },
      { date: '2026-01-20', cash: 100909.5, positionValue: 0, totalEquity: 100909.5, drawdownPct: 1.03 },
    ];

    const metrics = PerformanceMetricsCalculator.calculate(100000, 100909.5, trades, equityCurve);

    expect(metrics.totalTrades).toBe(2);
    expect(metrics.winningTrades).toBe(1);
    expect(metrics.losingTrades).toBe(1);
    expect(metrics.winRatePct).toBe(50);
    expect(metrics.netProfit).toBe(909.5);
    expect(metrics.totalReturnPct).toBe(0.91);
    expect(metrics.profitFactor).toBeCloseTo(1955 / 1045.5, 1);
    expect(metrics.averageHoldingDays).toBe(7);
    expect(metrics.maxDrawdownAmount).toBe(1045.5);
    expect(metrics.maxDrawdownPct).toBeCloseTo(1.03, 1);
    expect(metrics.totalCommissionPaid).toBe(67.5);
    expect(metrics.totalTaxPaid).toBe(23);
  });

  it('handles zero trades safely without NaN', () => {
    const metrics = PerformanceMetricsCalculator.calculate(100000, 100000, [], []);

    expect(metrics.totalTrades).toBe(0);
    expect(metrics.winRatePct).toBe(0);
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.sharpeRatio).toBeNull();
    expect(metrics.sortinoRatio).toBeNull();
    expect(metrics.maxDrawdownPct).toBe(0);
    expect(metrics.cagrPct).toBeNull();
    expect(isNaN(metrics.netProfit)).toBe(false);
  });

  it('handles 100% win rate or 100% loss rate without division by zero', () => {
    const allWinTrades: BacktestTrade[] = [
      {
        id: 'w1',
        symbol: 'FPT',
        side: 'LONG',
        entryDate: '2026-01-01',
        entryPrice: 50,
        entryGrossValue: 5000,
        entryCommission: 7.5,
        exitDate: '2026-01-05',
        exitPrice: 60,
        exitGrossValue: 6000,
        exitCommission: 9,
        exitTax: 6,
        quantity: 100,
        grossPnL: 1000,
        netPnL: 977.5,
        returnPct: 19.5,
        holdingDays: 4,
        exitReason: 'TAKE_PROFIT',
      },
    ];

    const metrics = PerformanceMetricsCalculator.calculate(100000, 100977.5, allWinTrades, []);
    expect(metrics.winRatePct).toBe(100);
    expect(metrics.profitFactor).toBeNull(); // No loss -> explicit null
    expect(metrics.averageLossReturnPct).toBe(0);
  });
});
