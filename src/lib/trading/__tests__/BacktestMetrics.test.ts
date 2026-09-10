import { describe, it, expect } from 'vitest';
import { BacktestMetrics } from '../backtest/BacktestMetrics.ts';
import type { BacktestTrade, EquityPoint } from '../backtest/BacktestTypes.ts';

describe('BacktestMetrics', () => {
  it('handles empty trades gracefully without crashing or dividing by zero', () => {
    const equityCurve: EquityPoint[] = [
      { timestamp: '2026-01-01', cash: 100_000_000, positionValue: 0, equity: 100_000_000, drawdown: 0 },
      { timestamp: '2026-01-02', cash: 100_000_000, positionValue: 0, equity: 100_000_000, drawdown: 0 },
    ];

    const result = BacktestMetrics.compute({
      symbol: 'HPG',
      initialCapital: 100_000_000,
      finalEquity: 100_000_000,
      trades: [],
      equityCurve,
      totalFees: 0,
      totalTax: 0,
      totalSlippageCost: 0,
    });

    expect(result.totalTrades).toBe(0);
    expect(result.winningTrades).toBe(0);
    expect(result.losingTrades).toBe(0);
    expect(result.winRate).toBeNull();
    expect(result.profitFactor).toBeNull();
    expect(result.averageWin).toBeNull();
    expect(result.averageLoss).toBeNull();
    expect(result.averageHoldingPeriod).toBeNull();
    expect(result.totalReturn).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.maxDrawdown).toBe(0);
  });

  it('correctly calculates win rate, profit factor, gross profit, and gross loss', () => {
    const trades: BacktestTrade[] = [
      {
        tradeId: 'T-1',
        symbol: 'HPG',
        side: 'BUY',
        signalTimestamp: '2026-01-05',
        executionTimestamp: '2026-01-06',
        signalPrice: 25_000,
        executionPrice: 25_025,
        quantity: 1000,
        stopLoss: 23_500,
        targetPrice: 28_000,
        grossValue: 25_025_000,
        fees: 37_537.5,
        tax: 0,
        slippage: 25_000,
        realizedPnL: 0,
        returnPercent: 0,
      },
      {
        tradeId: 'T-2',
        symbol: 'HPG',
        side: 'SELL',
        signalTimestamp: '2026-01-06',
        executionTimestamp: '2026-01-15',
        signalPrice: 28_000,
        executionPrice: 27_972,
        quantity: 1000,
        stopLoss: 23_500,
        targetPrice: 28_000,
        grossValue: 27_972_000,
        fees: 41_958,
        tax: 27_972,
        slippage: 28_000,
        realizedPnL: 2_864_532.5, // Win
        returnPercent: 11.45,
        exitReason: 'TARGET',
      },
      {
        tradeId: 'T-3',
        symbol: 'HPG',
        side: 'BUY',
        signalTimestamp: '2026-01-20',
        executionTimestamp: '2026-01-21',
        signalPrice: 26_000,
        executionPrice: 26_026,
        quantity: 1000,
        stopLoss: 24_500,
        targetPrice: 29_000,
        grossValue: 26_026_000,
        fees: 39_039,
        tax: 0,
        slippage: 26_000,
        realizedPnL: 0,
        returnPercent: 0,
      },
      {
        tradeId: 'T-4',
        symbol: 'HPG',
        side: 'SELL',
        signalTimestamp: '2026-01-21',
        executionTimestamp: '2026-01-28',
        signalPrice: 24_500,
        executionPrice: 24_475.5,
        quantity: 1000,
        stopLoss: 24_500,
        targetPrice: 29_000,
        grossValue: 24_475_500,
        fees: 36_713.25,
        tax: 24_475.5,
        slippage: 24_500,
        realizedPnL: -1_650_727.75, // Loss
        returnPercent: -6.34,
        exitReason: 'STOP_LOSS',
      },
    ];

    const equityCurve: EquityPoint[] = [
      { timestamp: '2026-01-01', cash: 100_000_000, positionValue: 0, equity: 100_000_000, drawdown: 0 },
      { timestamp: '2026-01-15', cash: 102_864_532.5, positionValue: 0, equity: 102_864_532.5, drawdown: 0 },
      { timestamp: '2026-01-28', cash: 101_213_804.75, positionValue: 0, equity: 101_213_804.75, drawdown: -0.016 },
    ];

    const result = BacktestMetrics.compute({
      symbol: 'HPG',
      initialCapital: 100_000_000,
      finalEquity: 101_213_804.75,
      trades,
      equityCurve,
      totalFees: 155_247.75,
      totalTax: 52_447.5,
      totalSlippageCost: 103_500,
    });

    expect(result.totalTrades).toBe(2); // 2 closed SELL trades
    expect(result.winningTrades).toBe(1);
    expect(result.losingTrades).toBe(1);
    expect(result.winRate).toBe(0.5); // 50%
    expect(result.grossProfit).toBeCloseTo(2_864_532.5, 1);
    expect(result.grossLoss).toBeCloseTo(1_650_727.75, 1);
    expect(result.profitFactor).toBeCloseTo(2_864_532.5 / 1_650_727.75, 2);
    expect(result.averageWin).toBeCloseTo(2_864_532.5, 1);
    expect(result.averageLoss).toBeCloseTo(1_650_727.75, 1);
    expect(result.averageHoldingPeriod).toBeGreaterThan(0);
    expect(result.fees).toBe(155_247.75);
    expect(result.tax).toBe(52_447.5);
    expect(result.slippageCost).toBe(103_500);
  });

  it('calculates drawdown correctly tracking peaks', () => {
    const equityCurve: EquityPoint[] = [
      { timestamp: '2026-01-01', cash: 100, positionValue: 0, equity: 100, drawdown: 0 },
      { timestamp: '2026-01-02', cash: 120, positionValue: 0, equity: 120, drawdown: 0 },
      { timestamp: '2026-01-03', cash: 90, positionValue: 0, equity: 90, drawdown: 0 }, // -25% from peak 120
      { timestamp: '2026-01-04', cash: 110, positionValue: 0, equity: 110, drawdown: 0 },
    ];

    const result = BacktestMetrics.compute({
      symbol: 'HPG',
      initialCapital: 100,
      finalEquity: 110,
      trades: [],
      equityCurve,
      totalFees: 0,
      totalTax: 0,
      totalSlippageCost: 0,
    });

    expect(result.maxDrawdown).toBeCloseTo(-0.25, 4); // (90 - 120) / 120 = -0.25
    expect(result.drawdownCurve[2].drawdown).toBeCloseTo(-0.25, 4);
    expect(result.drawdownCurve[1].drawdown).toBe(0);
  });

  it('returns null for profitFactor when there are only winning trades (no losses)', () => {
    const trades: BacktestTrade[] = [
      {
        tradeId: 'T-1',
        symbol: 'HPG',
        side: 'SELL',
        signalTimestamp: '2026-01-01',
        executionTimestamp: '2026-01-05',
        signalPrice: 30_000,
        executionPrice: 30_000,
        quantity: 100,
        stopLoss: 25_000,
        targetPrice: 30_000,
        grossValue: 3_000_000,
        fees: 4500,
        tax: 3000,
        slippage: 0,
        realizedPnL: 500_000, // Win
        returnPercent: 20,
        exitReason: 'TARGET',
      },
    ];

    const result = BacktestMetrics.compute({
      symbol: 'HPG',
      initialCapital: 10_000_000,
      finalEquity: 10_500_000,
      trades,
      equityCurve: [
        { timestamp: '2026-01-01', cash: 10_000_000, positionValue: 0, equity: 10_000_000, drawdown: 0 },
        { timestamp: '2026-01-05', cash: 10_500_000, positionValue: 0, equity: 10_500_000, drawdown: 0 },
      ],
      totalFees: 4500,
      totalTax: 3000,
      totalSlippageCost: 0,
    });

    expect(result.winningTrades).toBe(1);
    expect(result.losingTrades).toBe(0);
    expect(result.grossLoss).toBe(0);
    expect(result.profitFactor).toBeNull(); // Strictly null when grossLoss is 0
  });

  it('calculates Sharpe and Sortino ratios on multi-period equity curve', () => {
    const equityCurve: EquityPoint[] = [
      { timestamp: '2026-01-01', cash: 100, positionValue: 0, equity: 100, drawdown: 0 },
      { timestamp: '2026-01-02', cash: 102, positionValue: 0, equity: 102, drawdown: 0 },
      { timestamp: '2026-01-03', cash: 101, positionValue: 0, equity: 101, drawdown: -0.0098 },
      { timestamp: '2026-01-04', cash: 104, positionValue: 0, equity: 104, drawdown: 0 },
      { timestamp: '2026-01-05', cash: 103, positionValue: 0, equity: 103, drawdown: -0.0096 },
      { timestamp: '2026-01-06', cash: 106, positionValue: 0, equity: 106, drawdown: 0 },
    ];

    const result = BacktestMetrics.compute({
      symbol: 'HPG',
      initialCapital: 100,
      finalEquity: 106,
      trades: [],
      equityCurve,
      totalFees: 0,
      totalTax: 0,
      totalSlippageCost: 0,
      riskFreeRate: 0.04,
    });

    expect(result.sharpeRatio).not.toBeNull();
    expect(typeof result.sharpeRatio).toBe('number');
    expect(result.sortinoRatio).not.toBeNull();
    expect(typeof result.sortinoRatio).toBe('number');
  });
});
