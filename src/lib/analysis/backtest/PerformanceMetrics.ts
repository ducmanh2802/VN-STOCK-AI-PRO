/**
 * PHASE 17.6 — BACKTEST PERFORMANCE METRICS
 * ===========================================
 * Pure, deterministic calculation of statistical trading performance.
 * 
 * STRICT RULES:
 *   - No NaN or Infinity in outputs. If indeterminate, return explicit `null`.
 *   - Mathematically exact peak-to-trough drawdown calculation.
 *   - Stable floating-point precision (rounded cleanly).
 */

import type { BacktestPerformanceMetrics, BacktestTrade, EquityPoint } from './types.ts';

export class PerformanceMetricsCalculator {
  /**
   * Calculates comprehensive performance metrics from executed trades and equity curve.
   */
  public static calculate(
    initialCapital: number,
    finalCapital: number,
    trades: readonly BacktestTrade[],
    equityCurve: readonly EquityPoint[],
    tradingDaysPerYear: number = 252
  ): BacktestPerformanceMetrics {
    const totalTrades = trades.length;
    const netProfit = Number((finalCapital - initialCapital).toFixed(2));
    const totalReturnPct = initialCapital > 0
      ? Number((((finalCapital - initialCapital) / initialCapital) * 100).toFixed(2))
      : 0;

    let totalCommissionPaid = 0;
    let totalTaxPaid = 0;

    let winningTrades = 0;
    let losingTrades = 0;
    let breakEvenTrades = 0;

    let grossProfit = 0;
    let grossLoss = 0;

    let sumTradeReturnPct = 0;
    let sumWinReturnPct = 0;
    let sumLossReturnPct = 0;
    let totalHoldingDays = 0;

    const tradeReturns: number[] = [];

    for (const trade of trades) {
      totalCommissionPaid += trade.entryCommission + trade.exitCommission;
      totalTaxPaid += trade.exitTax;
      totalHoldingDays += trade.holdingDays;
      sumTradeReturnPct += trade.returnPct;
      tradeReturns.push(trade.returnPct);

      if (trade.netPnL > 0) {
        winningTrades++;
        grossProfit += trade.netPnL;
        sumWinReturnPct += trade.returnPct;
      } else if (trade.netPnL < 0) {
        losingTrades++;
        grossLoss += Math.abs(trade.netPnL);
        sumLossReturnPct += trade.returnPct;
      } else {
        breakEvenTrades++;
      }
    }

    // Win Rate
    const winRatePct = totalTrades > 0
      ? Number(((winningTrades / totalTrades) * 100).toFixed(2))
      : 0;

    // Profit Factor (null if no loss or no trades)
    let profitFactor: number | null = null;
    if (grossLoss > 0) {
      profitFactor = Number((grossProfit / grossLoss).toFixed(2));
    } else if (grossProfit > 0 && losingTrades === 0) {
      profitFactor = null; // Infinite / undefined loss
    }

    // Average Returns
    const averageTradeReturnPct = totalTrades > 0
      ? Number((sumTradeReturnPct / totalTrades).toFixed(2))
      : 0;

    const averageWinReturnPct = winningTrades > 0
      ? Number((sumWinReturnPct / winningTrades).toFixed(2))
      : 0;

    const averageLossReturnPct = losingTrades > 0
      ? Number((sumLossReturnPct / losingTrades).toFixed(2))
      : 0;

    let winLossRatio: number | null = null;
    if (Math.abs(averageLossReturnPct) > 0 && averageWinReturnPct > 0) {
      winLossRatio = Number((averageWinReturnPct / Math.abs(averageLossReturnPct)).toFixed(2));
    }

    const averageHoldingDays = totalTrades > 0
      ? Number((totalHoldingDays / totalTrades).toFixed(1))
      : 0;

    // Max Drawdown Calculation from Equity Curve
    let maxPeak = initialCapital;
    let maxDrawdownAmount = 0;
    let maxDrawdownPct = 0;

    for (const point of equityCurve) {
      if (point.totalEquity > maxPeak) {
        maxPeak = point.totalEquity;
      }
      const currentDrawdownAmount = maxPeak - point.totalEquity;
      const currentDrawdownPct = maxPeak > 0 ? (currentDrawdownAmount / maxPeak) * 100 : 0;

      if (currentDrawdownAmount > maxDrawdownAmount) {
        maxDrawdownAmount = currentDrawdownAmount;
      }
      if (currentDrawdownPct > maxDrawdownPct) {
        maxDrawdownPct = currentDrawdownPct;
      }
    }

    // Sharpe and Sortino Ratios (from trade returns)
    let sharpeRatio: number | null = null;
    let sortinoRatio: number | null = null;

    if (totalTrades >= 2) {
      const meanReturn = sumTradeReturnPct / totalTrades;
      
      // Standard Deviation
      let varianceSum = 0;
      let downsideVarianceSum = 0;

      for (const r of tradeReturns) {
        varianceSum += Math.pow(r - meanReturn, 2);
        if (r < 0) {
          downsideVarianceSum += Math.pow(r, 2);
        }
      }

      const stdDev = Math.sqrt(varianceSum / (totalTrades - 1));
      const downsideStdDev = Math.sqrt(downsideVarianceSum / totalTrades);

      if (stdDev > 0.0001) {
        // Annualized Sharpe assuming ~20 trades/year or normalized
        const annualizationFactor = Math.sqrt(Math.min(252, totalTrades));
        sharpeRatio = Number(((meanReturn / stdDev) * annualizationFactor).toFixed(2));
      }

      if (downsideStdDev > 0.0001) {
        const annualizationFactor = Math.sqrt(Math.min(252, totalTrades));
        sortinoRatio = Number(((meanReturn / downsideStdDev) * annualizationFactor).toFixed(2));
      }
    }

    // Compound Annual Growth Rate (CAGR)
    let cagrPct: number | null = null;
    if (equityCurve.length >= 20 && initialCapital > 0 && finalCapital > 0) {
      const totalDays = equityCurve.length; // Approximate trading sessions
      const years = totalDays / tradingDaysPerYear;
      if (years >= 0.1) {
        const cagr = (Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100;
        if (Number.isFinite(cagr)) {
          cagrPct = Number(cagr.toFixed(2));
        }
      }
    }

    return {
      initialCapital: Number(initialCapital.toFixed(2)),
      finalCapital: Number(finalCapital.toFixed(2)),
      netProfit,
      totalReturnPct,

      totalTrades,
      winningTrades,
      losingTrades,
      breakEvenTrades,
      winRatePct,

      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      profitFactor,

      averageTradeReturnPct,
      averageWinReturnPct,
      averageLossReturnPct,
      winLossRatio,

      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      maxDrawdownAmount: Number(maxDrawdownAmount.toFixed(2)),
      averageHoldingDays,

      sharpeRatio,
      sortinoRatio,
      cagrPct,

      totalCommissionPaid: Number(totalCommissionPaid.toFixed(2)),
      totalTaxPaid: Number(totalTaxPaid.toFixed(2)),
    };
  }
}
