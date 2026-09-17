/**
 * PHASE 20.2 — CANONICAL MARKET BREADTH ENGINE
 * =============================================
 * Aggregates constituent-level advance/decline, moving average participation,
 * new highs/lows, and volume breadth with strict fail-closed data coverage.
 *
 * QUANTITATIVE INVARIANTS:
 *   1. advanceCount + declineCount + unchangedCount <= validConstituents
 *   2. 0 <= percentAboveMA20, percentAboveMA50, percentAboveMA200 <= 1.0 (or null if insufficient history)
 *   3. No NaN, Infinity, or division-by-zero
 *   4. Deterministic: Identical input data yields identical breadth output
 *   5. Zero look-ahead bias: Evaluates strictly up to the latest candle in each constituent series
 */

import { calculateSMA } from '../../indicators/sma.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type { ConstituentCandleData, MarketBreadthResult } from './types.ts';

export interface MarketBreadthOptions {
  universe?: string;
  asOf?: string;
  newHighLookbackDays?: number; // default 20
}

export class MarketBreadthEngine {
  public static readonly VERSION = 'v1.0.0-phase20';
  public static readonly MIN_COVERAGE_RATIO = 0.5; // Warning threshold for constituent availability

  /**
   * Evaluates market breadth from constituent candlestick series.
   */
  public static evaluate(
    constituents: readonly ConstituentCandleData[],
    options?: MarketBreadthOptions
  ): MarketBreadthResult {
    const universe = options?.universe || 'VIETNAM_ALL';
    const asOf = options?.asOf || new Date().toISOString();
    const newHighLookback = options?.newHighLookbackDays || 20;
    const warnings: string[] = [];

    const totalConstituents = constituents.length;
    if (totalConstituents === 0) {
      warnings.push('EMPTY_UNIVERSE: No constituent data supplied to MarketBreadthEngine.');
      return {
        asOf,
        universe,
        totalConstituents: 0,
        validConstituents: 0,
        coverageRatio: 0,
        advanceCount: 0,
        declineCount: 0,
        unchangedCount: 0,
        advanceDeclineRatio: null,
        percentAboveMA20: null,
        percentAboveMA50: null,
        percentAboveMA200: null,
        newHighCount: 0,
        newLowCount: 0,
        upVolume: 0,
        downVolume: 0,
        upDownVolumeRatio: null,
        breadthThrust: null,
        marketParticipation: null,
        warnings,
        dataLineage: {
          source: 'MarketBreadthEngine',
          timestamp: asOf,
          calculationVersion: MarketBreadthEngine.VERSION,
        },
        calculationVersion: MarketBreadthEngine.VERSION,
      };
    }

    let validConstituents = 0;
    let advanceCount = 0;
    let declineCount = 0;
    let unchangedCount = 0;

    let upVolume = 0;
    let downVolume = 0;

    let ma20EligibleCount = 0;
    let ma20AboveCount = 0;

    let ma50EligibleCount = 0;
    let ma50AboveCount = 0;

    let ma200EligibleCount = 0;
    let ma200AboveCount = 0;

    let newHighCount = 0;
    let newLowCount = 0;

    for (const item of constituents) {
      const { candles } = item;
      if (!candles || candles.length === 0) {
        continue;
      }

      // Filter out invalid trailing candles
      const latestBar = candles[candles.length - 1];
      if (
        typeof latestBar.close !== 'number' ||
        isNaN(latestBar.close) ||
        latestBar.close <= 0 ||
        typeof latestBar.volume !== 'number' ||
        isNaN(latestBar.volume) ||
        latestBar.volume < 0
      ) {
        continue;
      }

      validConstituents++;

      // Advance / Decline Determination
      let priceChange = 0;
      if (candles.length >= 2) {
        const prevBar = candles[candles.length - 2];
        if (typeof prevBar.close === 'number' && !isNaN(prevBar.close) && prevBar.close > 0) {
          priceChange = latestBar.close - prevBar.close;
        } else {
          priceChange = latestBar.close - latestBar.open;
        }
      } else {
        priceChange = latestBar.close - latestBar.open;
      }

      if (priceChange > 0) {
        advanceCount++;
        upVolume += latestBar.volume;
      } else if (priceChange < 0) {
        declineCount++;
        downVolume += latestBar.volume;
      } else {
        unchangedCount++;
      }

      // Moving Average Participation
      // SMA 20
      if (candles.length >= 20) {
        const sma20 = calculateSMA(candles as CandlePoint[], 20);
        if (sma20.length > 0) {
          ma20EligibleCount++;
          const lastSMA20 = sma20[sma20.length - 1].value;
          if (latestBar.close > lastSMA20) {
            ma20AboveCount++;
          }
        }
      }

      // SMA 50
      if (candles.length >= 50) {
        const sma50 = calculateSMA(candles as CandlePoint[], 50);
        if (sma50.length > 0) {
          ma50EligibleCount++;
          const lastSMA50 = sma50[sma50.length - 1].value;
          if (latestBar.close > lastSMA50) {
            ma50AboveCount++;
          }
        }
      }

      // SMA 200
      if (candles.length >= 200) {
        const sma200 = calculateSMA(candles as CandlePoint[], 200);
        if (sma200.length > 0) {
          ma200EligibleCount++;
          const lastSMA200 = sma200[sma200.length - 1].value;
          if (latestBar.close > lastSMA200) {
            ma200AboveCount++;
          }
        }
      }

      // New Highs / New Lows over lookback window
      const lookbackWindow = candles.slice(-newHighLookback);
      if (lookbackWindow.length >= 5) {
        const highestHigh = Math.max(...lookbackWindow.map((c) => c.high));
        const lowestLow = Math.min(...lookbackWindow.map((c) => c.low));

        if (latestBar.high >= highestHigh) {
          newHighCount++;
        }
        if (latestBar.low <= lowestLow) {
          newLowCount++;
        }
      }
    }

    const coverageRatio = validConstituents / totalConstituents;
    if (coverageRatio < MarketBreadthEngine.MIN_COVERAGE_RATIO) {
      warnings.push(
        `LOW_COVERAGE: Valid constituents (${validConstituents}/${totalConstituents} = ${(
          coverageRatio * 100
        ).toFixed(1)}%) is below the minimum confidence threshold.`
      );
    }

    // Advance / Decline Ratio
    const advanceDeclineRatio =
      declineCount > 0 ? Number((advanceCount / declineCount).toFixed(4)) : null;

    // Moving Average Participation Percentages (relative to eligible constituents with sufficient history)
    const percentAboveMA20 =
      ma20EligibleCount > 0
        ? Number((ma20AboveCount / ma20EligibleCount).toFixed(4))
        : null;

    const percentAboveMA50 =
      ma50EligibleCount > 0
        ? Number((ma50AboveCount / ma50EligibleCount).toFixed(4))
        : null;

    const percentAboveMA200 =
      ma20EligibleCount > 0
        ? ma200EligibleCount > 0
          ? Number((ma200AboveCount / ma200EligibleCount).toFixed(4))
          : null
        : null;

    if (ma200EligibleCount < validConstituents * 0.5) {
      warnings.push(
        `LIMITED_MA200_HISTORY: Only ${ma200EligibleCount}/${validConstituents} constituents have >= 200 trading bars.`
      );
    }

    // Up / Down Volume Ratio
    const upDownVolumeRatio =
      downVolume > 0 ? Number((upVolume / downVolume).toFixed(4)) : null;

    // Breadth Thrust: Advance ratio among decisive issues (Advances / (Advances + Declines))
    const totalDecisiveIssues = advanceCount + declineCount;
    const breadthThrust =
      totalDecisiveIssues > 0
        ? Number((advanceCount / totalDecisiveIssues).toFixed(4))
        : null;

    // Market Participation: Up volume ratio among decisive volume
    const totalDecisiveVolume = upVolume + downVolume;
    const marketParticipation =
      totalDecisiveVolume > 0
        ? Number((upVolume / totalDecisiveVolume).toFixed(4))
        : null;

    return {
      asOf,
      universe,
      totalConstituents,
      validConstituents,
      coverageRatio: Number(coverageRatio.toFixed(4)),
      advanceCount,
      declineCount,
      unchangedCount,
      advanceDeclineRatio,
      percentAboveMA20,
      percentAboveMA50,
      percentAboveMA200,
      newHighCount,
      newLowCount,
      upVolume,
      downVolume,
      upDownVolumeRatio,
      breadthThrust,
      marketParticipation,
      warnings,
      dataLineage: {
        source: 'MarketBreadthEngine',
        timestamp: asOf,
        calculationVersion: MarketBreadthEngine.VERSION,
      },
      calculationVersion: MarketBreadthEngine.VERSION,
    };
  }
}
