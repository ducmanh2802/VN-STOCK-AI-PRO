/**
 * PHASE 17.6 — BACKTEST ENGINE INTEGRATION & DETERMINISM TESTS
 * ==============================================================
 * Verifies full end-to-end backtest execution, fee accounting, board lots,
 * and 100% deterministic reproducibility.
 */

import { describe, it, expect } from 'vitest';
import { BacktestEngine } from '../BacktestEngine.ts';
import { TrendFollowingBacktestStrategy } from '../strategies/TrendFollowingBacktest.ts';
import { HistoricalSignalVerifier } from '../HistoricalSignalVerifier.ts';
import type { HistoricalCandle, BacktestConfig } from '../types.ts';

describe('Phase 17.6 — BacktestEngine & Verifier', () => {
  // Build a 100-bar deterministic test price series with an uptrend and a reversal
  const testCandles: HistoricalCandle[] = [];
  let currentPrice = 50000;

  for (let i = 0; i < 100; i++) {
    const month = String(Math.floor(i / 28) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    const timestamp = `2026-${month}-${day}`;

    // Bars 0-60: Steady bull trend
    // Bars 60-80: Consolidation & pull-back
    // Bars 80-100: Bearish breakdown
    if (i < 60) {
      currentPrice += 300;
    } else if (i < 80) {
      currentPrice -= 100;
    } else {
      currentPrice -= 500;
    }

    testCandles.push({
      symbol: 'HPG',
      timestamp,
      open: currentPrice - 100,
      high: currentPrice + 400,
      low: currentPrice - 300,
      close: currentPrice,
      volume: 150000 + (i % 5) * 10000,
    });
  }

  const config: BacktestConfig = {
    symbol: 'HPG',
    initialCapital: 100000000, // 100M VND
    commissionRate: 0.0015,    // 0.15%
    slippageRate: 0.0010,      // 0.10%
    sellTaxRate: 0.0010,        // 0.10%
    positionSizePct: 1.0,      // 100% allocation
    boardLot: 100,             // 100 shares
  };

  it('executes deterministic backtest with realistic entry timing (T+1 Open)', () => {
    const strategy = new TrendFollowingBacktestStrategy();
    const result = BacktestEngine.run(strategy, testCandles, config);

    expect(result.symbol).toBe('HPG');
    expect(result.totalBars).toBe(100);
    expect(result.validation.lookAheadBiasDetected).toBe(false);
    expect(result.validation.invalidDataDetected).toBe(false);
    expect(result.validation.deterministic).toBe(true);

    expect(result.trades.length).toBeGreaterThan(0);
    for (const trade of result.trades) {
      // Must be standard VN board lot (multiple of 100)
      expect(trade.quantity % 100).toBe(0);
      expect(trade.quantity).toBeGreaterThan(0);
      // Entry and exit commission + tax must be non-negative
      expect(trade.entryCommission).toBeGreaterThan(0);
      expect(trade.exitCommission).toBeGreaterThan(0);
      expect(trade.exitTax).toBeGreaterThan(0);
      expect(trade.holdingDays).toBeGreaterThanOrEqual(1);
    }

    expect(result.metrics.finalCapital).toBeGreaterThan(0);
    expect(result.metrics.totalCommissionPaid).toBeGreaterThan(0);
    expect(result.metrics.totalTaxPaid).toBeGreaterThan(0);
  });

  it('guarantees 100% deterministic reproducibility across repeated runs', () => {
    const strategy = new TrendFollowingBacktestStrategy();

    const run1 = BacktestEngine.run(strategy, testCandles, config);
    const run2 = BacktestEngine.run(strategy, testCandles, config);

    expect(run1).toEqual(run2);
    expect(run1.metrics).toEqual(run2.metrics);
    expect(run1.trades).toEqual(run2.trades);
    expect(run1.equityCurve).toEqual(run2.equityCurve);
  });

  it('HistoricalSignalVerifier ranks and evaluates multiple strategies', () => {
    const verifier = new HistoricalSignalVerifier();
    const summary = verifier.verifyAllStrategies(testCandles, config);

    expect(summary.symbol).toBe('HPG');
    expect(summary.results.length).toBe(3); // TrendFollowing, Breakout, MeanReversion
    expect(summary.dateRange.totalBars).toBe(100);

    for (const res of summary.results) {
      expect(res.validation.deterministic).toBe(true);
      expect(res.validation.invalidDataDetected).toBe(false);
    }
  });
});
