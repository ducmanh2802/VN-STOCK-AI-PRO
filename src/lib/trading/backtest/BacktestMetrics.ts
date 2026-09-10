/**
 * PHASE 18.2 — BACKTEST METRICS CALCULATOR
 * =========================================
 * Production-grade performance analytics, drawdown tracking,
 * Sharpe, Sortino, and trade statistics.
 *
 * Enforces:
 *   - Zero divide-by-zero crashes
 *   - Return null for undefined/insufficient sample metrics (no fake 0s)
 *   - Exact mathematical formulations per specification
 */

import type {
  BacktestTrade,
  EquityPoint,
  DrawdownPoint,
  BacktestResult,
} from './BacktestTypes.ts';

export interface MetricCalculationInput {
  symbol: string;
  initialCapital: number;
  finalEquity: number;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  totalFees: number;
  totalTax: number;
  totalSlippageCost: number;
  riskFreeRate?: number; // annual (default 0.04 = 4%)
}

export class BacktestMetrics {
  /**
   * Computes comprehensive backtest performance metrics.
   */
  static compute(input: MetricCalculationInput): BacktestResult {
    const {
      symbol,
      initialCapital,
      finalEquity,
      trades,
      equityCurve,
      totalFees,
      totalTax,
      totalSlippageCost,
      riskFreeRate = 0.04,
    } = input;

    // 1. Return Metrics
    const totalReturn = initialCapital > 0 ? (finalEquity / initialCapital) - 1 : 0;
    const netProfit = finalEquity - initialCapital;

    // 2. Annualized Return (CAGR)
    let annualizedReturn: number | null = null;
    if (equityCurve.length >= 2 && initialCapital > 0 && finalEquity > 0) {
      const firstTs = this.toEpochMs(equityCurve[0].timestamp);
      const lastTs = this.toEpochMs(equityCurve[equityCurve.length - 1].timestamp);
      const diffMs = lastTs - firstTs;
      const years = diffMs / (365.25 * 24 * 60 * 60 * 1000);

      if (years > 0.05) { // at least ~18 calendar days to estimate CAGR
        annualizedReturn = Math.pow(finalEquity / initialCapital, 1 / years) - 1;
      }
    }

    // 3. Trade Classification (only closed sell trades)
    const closedTrades = trades.filter((t) => t.side === 'SELL');
    const totalTrades = closedTrades.length;

    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalHoldingDays = 0;

    for (const trade of closedTrades) {
      if (trade.realizedPnL > 0) {
        winningTrades++;
        grossProfit += trade.realizedPnL;
      } else if (trade.realizedPnL < 0) {
        losingTrades++;
        grossLoss += Math.abs(trade.realizedPnL);
      }

      // Calculate holding period
      const sigTs = this.toEpochMs(trade.signalTimestamp);
      const exeTs = this.toEpochMs(trade.executionTimestamp);
      const days = Math.max(0, (exeTs - sigTs) / (24 * 60 * 60 * 1000));
      totalHoldingDays += days;
    }

    const winRate = totalTrades > 0 ? winningTrades / totalTrades : null;

    // Profit Factor: grossProfit / grossLoss. Null if grossLoss is 0 or no trades.
    let profitFactor: number | null = null;
    if (totalTrades > 0) {
      if (grossLoss > 0) {
        profitFactor = grossProfit / grossLoss;
      } else if (grossProfit > 0) {
        // All trades won, no loss
        profitFactor = null; // Spec: return null if undefined rather than Infinity or fake 0
      }
    }

    const averageWin = winningTrades > 0 ? grossProfit / winningTrades : null;
    const averageLoss = losingTrades > 0 ? grossLoss / losingTrades : null;
    const averageHoldingPeriod = totalTrades > 0 ? totalHoldingDays / totalTrades : null;

    // 4. Drawdown Analysis
    let peakEquity = initialCapital;
    let maxDrawdown = 0; // negative or 0
    const drawdownCurve: DrawdownPoint[] = [];

    for (const pt of equityCurve) {
      if (pt.equity > peakEquity) {
        peakEquity = pt.equity;
      }
      const dd = peakEquity > 0 ? (pt.equity - peakEquity) / peakEquity : 0;
      if (dd < maxDrawdown) {
        maxDrawdown = dd;
      }
      drawdownCurve.push({
        timestamp: pt.timestamp,
        drawdown: dd,
      });
    }

    // 5. Periodic Returns, Sharpe, and Sortino Ratios
    let sharpeRatio: number | null = null;
    let sortinoRatio: number | null = null;

    if (equityCurve.length >= 5) {
      const periodicReturns: number[] = [];
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEq = equityCurve[i - 1].equity;
        const currEq = equityCurve[i].equity;
        if (prevEq > 0) {
          periodicReturns.push((currEq - prevEq) / prevEq);
        }
      }

      if (periodicReturns.length >= 4) {
        const dailyRf = riskFreeRate / 252;
        const meanReturn =
          periodicReturns.reduce((acc, r) => acc + r, 0) / periodicReturns.length;

        // Sample Variance & Std Dev
        const variance =
          periodicReturns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) /
          (periodicReturns.length - 1);
        const stdDev = Math.sqrt(variance);

        if (stdDev > 0) {
          sharpeRatio = ((meanReturn - dailyRf) / stdDev) * Math.sqrt(252);
        }

        // Downside Deviation for Sortino
        const downsideDiffs = periodicReturns.map((r) => Math.min(0, r - dailyRf));
        const downsideVariance =
          downsideDiffs.reduce((acc, d) => acc + Math.pow(d, 2), 0) /
          periodicReturns.length;
        const downsideStdDev = Math.sqrt(downsideVariance);

        if (downsideStdDev > 0) {
          sortinoRatio = ((meanReturn - dailyRf) / downsideStdDev) * Math.sqrt(252);
        }
      }
    }

    return {
      symbol,
      initialCapital,
      finalEquity,
      totalReturn,
      annualizedReturn,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      grossProfit,
      grossLoss,
      netProfit,
      maxDrawdown,
      profitFactor,
      averageWin,
      averageLoss,
      averageHoldingPeriod,
      fees: totalFees,
      tax: totalTax,
      slippageCost: totalSlippageCost,
      sharpeRatio,
      sortinoRatio,
      tradeHistory: trades,
      equityCurve,
      drawdownCurve,
    };
  }

  private static toEpochMs(ts: string | number): number {
    if (typeof ts === 'number') return ts;
    const parsed = new Date(ts).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
