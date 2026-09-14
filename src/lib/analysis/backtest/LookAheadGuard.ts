/**
 * PHASE 17.6 — LOOK-AHEAD BIAS GUARD
 * ====================================
 * Strict architectural safeguard preventing strategy algorithms and indicators
 * from accessing future candlestick data (index > T).
 * 
 * QUANTITATIVE INVARIANTS:
 *   - At step T, only candles[0...T] are accessible.
 *   - Current candle T is the latest available bar; its close is known at T.
 *   - Resistance/support lookbacks must strictly exclude candle T when computing prior breakout boundaries.
 *   - Entry and exit executions occur at T+1 Open, never at T Close.
 */

import type { HistoricalCandle, HistoricalContext } from './types.ts';

export class LookAheadGuardError extends Error {
  constructor(message: string) {
    super(`LOOK_AHEAD_VIOLATION: ${message}`);
    this.name = 'LookAheadGuardError';
  }
}

export class LookAheadGuard {
  /**
   * Creates a strictly isolated HistoricalContext for candle at `currentIndex`.
   * The returned context exposes ONLY candles up to `currentIndex`.
   * Future candles are omitted from memory passed to the strategy.
   *
   * @param candles Full array of chronological candles
   * @param currentIndex Current bar index being evaluated (0 <= currentIndex < candles.length)
   * @returns Isolated, read-only HistoricalContext
   */
  public static createContext(
    candles: readonly HistoricalCandle[],
    currentIndex: number
  ): HistoricalContext {
    if (!candles || candles.length === 0) {
      throw new LookAheadGuardError('Cannot create historical context for empty candle series');
    }

    if (currentIndex < 0 || currentIndex >= candles.length) {
      throw new LookAheadGuardError(
        `Invalid currentIndex ${currentIndex}: must be within [0, ${candles.length - 1}]`
      );
    }

    // Slice history strictly up to currentIndex (inclusive)
    const candlesToDate = Object.freeze(candles.slice(0, currentIndex + 1));
    const currentCandle = candles[currentIndex];

    return {
      symbol: currentCandle.symbol,
      currentIndex,
      currentCandle,
      candlesToDate,
      totalCandles: candles.length,
    };
  }

  /**
   * Asserts that a lookback window calculation does not attempt to query future candles.
   */
  public static validateLookbackSlice(
    context: HistoricalContext,
    lookbackBars: number,
    excludeCurrentBar: boolean = false
  ): readonly HistoricalCandle[] {
    const maxIndex = excludeCurrentBar ? context.currentIndex - 1 : context.currentIndex;
    if (maxIndex < 0) {
      return [];
    }

    const startIndex = Math.max(0, maxIndex - lookbackBars + 1);
    return context.candlesToDate.slice(startIndex, maxIndex + 1);
  }

  /**
   * Checks if an array of candles provided to an indicator contains future timestamps
   * beyond the target evaluation candle.
   */
  public static verifyNoFutureLeakage(
    evaluatedCandles: readonly HistoricalCandle[],
    targetTimestamp: string
  ): boolean {
    const targetDate = new Date(targetTimestamp).getTime();
    for (const candle of evaluatedCandles) {
      const candleDate = new Date(candle.timestamp).getTime();
      if (candleDate > targetDate) {
        return false;
      }
    }
    return true;
  }
}
