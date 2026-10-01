/**
 * PHASE 22 — ETF PERFORMANCE ENGINE
 * ===================================
 * Mathematical engine for multi-period ETF returns, benchmark comparison,
 * annualized volatility, and maximum drawdown.
 *
 * Invariants:
 * - Periods: 1D (1 bar), 1W (5 bars), 1M (20 bars), 3M (60 bars), 6M (120 bars), YTD, 1Y (250 bars)
 * - Strict historical data only: Missing periods return null, no synthetic interpolation
 * - Maximum Drawdown (MDD) calculation across the full historical series
 * - Standard 252-day annualization for realized volatility
 */

import type { EtfPerformanceMetrics } from './types.ts';
import type { CandlePoint } from '../indicators/types.ts';

export class EtfPerformanceEngine {
  /**
   * Calculates percentage return between two prices.
   */
  private static calculateReturn(startPrice: number, endPrice: number): number | null {
    if (startPrice <= 0 || !Number.isFinite(startPrice) || !Number.isFinite(endPrice)) {
      return null;
    }
    return Math.round(((endPrice - startPrice) / startPrice) * 10000) / 100;
  }

  /**
   * Extracts the return over N bars lookback from chronological bars.
   */
  private static getPeriodReturn(bars: CandlePoint[], lookbackBars: number): number | null {
    if (bars.length <= lookbackBars) return null;
    const latest = bars[bars.length - 1];
    const base = bars[bars.length - 1 - lookbackBars];
    if (!latest?.close || !base?.close) return null;
    return this.calculateReturn(base.close, latest.close);
  }

  /**
   * Calculates Year-to-Date (YTD) return based on bar time strings (YYYY-MM-DD).
   */
  private static getYtdReturn(bars: CandlePoint[]): number | null {
    if (bars.length < 2) return null;
    const latest = bars[bars.length - 1];
    if (!latest?.time || !latest?.close) return null;

    const currentYear = String(latest.time).slice(0, 4);
    // Find the last bar of the previous year or the first bar of this year
    let firstBarOfYear: CandlePoint | null = null;
    for (let i = bars.length - 2; i >= 0; i--) {
      const b = bars[i];
      if (b.time && String(b.time).slice(0, 4) !== currentYear) {
        // Last bar of prior year is ideal baseline for YTD
        firstBarOfYear = b;
        break;
      }
    }

    if (!firstBarOfYear) {
      firstBarOfYear = bars[0];
    }

    if (!firstBarOfYear?.close) return null;
    return this.calculateReturn(firstBarOfYear.close, latest.close);
  }

  /**
   * Computes annualized realized volatility from daily returns.
   */
  public static calculateVolatility(bars: CandlePoint[]): number | null {
    if (bars.length < 10) return null;

    const dailyReturns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const pPrev = bars[i - 1].close;
      const pCurr = bars[i].close;
      if (pPrev && pCurr && pPrev > 0) {
        dailyReturns.push((pCurr - pPrev) / pPrev);
      }
    }

    const n = dailyReturns.length;
    if (n < 5) return null;

    const mean = dailyReturns.reduce((acc, r) => acc + r, 0) / n;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sumSq += Math.pow(dailyReturns[i] - mean, 2);
    }
    const dailyStdDev = Math.sqrt(sumSq / (n - 1));
    return Math.round(dailyStdDev * Math.sqrt(252) * 10000) / 100;
  }

  /**
   * Computes Maximum Drawdown (MDD) percentage across chronological bars.
   */
  public static calculateMaxDrawdown(bars: CandlePoint[]): number | null {
    if (bars.length < 2) return null;

    let peak = -Infinity;
    let maxDrawdown = 0;

    for (const b of bars) {
      if (b.close && b.close > 0) {
        if (b.close > peak) {
          peak = b.close;
        }
        const drawdown = (peak - b.close) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    return Math.round(maxDrawdown * 10000) / 100;
  }

  /**
   * Analyzes multi-period performance metrics for an ETF and its benchmark.
   */
  public static analyze(
    symbol: string,
    etfBars: CandlePoint[],
    benchmarkBars: CandlePoint[] = []
  ): EtfPerformanceMetrics {
    // Sort chronological
    const sortedEtf = [...etfBars].sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const sortedBench = [...benchmarkBars].sort((a, b) => String(a.time).localeCompare(String(b.time)));

    if (sortedEtf.length < 2) {
      return {
        symbol,
        returns: {
          d1: null,
          w1: null,
          m1: null,
          m3: null,
          m6: null,
          ytd: null,
          y1: null,
        },
        benchmarkReturns: {
          d1: null,
          w1: null,
          m1: null,
          m3: null,
          m6: null,
          ytd: null,
          y1: null,
        },
        annualizedVolatility: null,
        maxDrawdownPercent: null,
        status: 'DATA_UNAVAILABLE',
      };
    }

    const returns = {
      d1: this.getPeriodReturn(sortedEtf, 1),
      w1: this.getPeriodReturn(sortedEtf, 5),
      m1: this.getPeriodReturn(sortedEtf, 20),
      m3: this.getPeriodReturn(sortedEtf, 60),
      m6: this.getPeriodReturn(sortedEtf, 120),
      ytd: this.getYtdReturn(sortedEtf),
      y1: this.getPeriodReturn(sortedEtf, 250),
    };

    const benchmarkReturns = {
      d1: this.getPeriodReturn(sortedBench, 1),
      w1: this.getPeriodReturn(sortedBench, 5),
      m1: this.getPeriodReturn(sortedBench, 20),
      m3: this.getPeriodReturn(sortedBench, 60),
      m6: this.getPeriodReturn(sortedBench, 120),
      ytd: this.getYtdReturn(sortedBench),
      y1: this.getPeriodReturn(sortedBench, 250),
    };

    const annualizedVolatility = this.calculateVolatility(sortedEtf);
    const maxDrawdownPercent = this.calculateMaxDrawdown(sortedEtf);

    return {
      symbol,
      returns,
      benchmarkReturns,
      annualizedVolatility,
      maxDrawdownPercent,
      status: 'COMPUTED',
    };
  }
}
