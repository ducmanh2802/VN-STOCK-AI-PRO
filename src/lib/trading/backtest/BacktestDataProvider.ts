/**
 * PHASE 18.2 — BACKTEST DATA PROVIDER
 * ====================================
 * Fetches and validates REAL historical market data from KBS Securities.
 * Strict fail-closed policy: malformed, out-of-order, or synthetic candles
 * result in immediate rejection with DATA_UNAVAILABLE.
 */

import { KbsHistoricalProvider } from '../../../services/market/providers/kbs/KbsHistoricalProvider.ts';
import type { NormalizedDailyBar } from '../../../services/market/providers/kbs/types.ts';
import { BacktestCandle, BacktestDataError } from './BacktestTypes.ts';

export class BacktestDataProvider {
  /**
   * Fetches real historical daily OHLCV bars from KBS Securities and validates them.
   *
   * @param symbol Ticker symbol (e.g. 'HPG', 'VNM')
   * @param startDate ISO date string ('YYYY-MM-DD')
   * @param endDate ISO date string ('YYYY-MM-DD')
   * @returns Validated chronological array of BacktestCandle
   */
  static async getHistoricalData(
    symbol: string,
    startDate: string,
    endDate: string
  ): Promise<BacktestCandle[]> {
    const cleanSymbol = symbol.toUpperCase().trim();
    if (!/^[A-Z0-9_.]{1,20}$/.test(cleanSymbol)) {
      throw new BacktestDataError(
        `Invalid symbol format for backtest: "${symbol}"`,
        'DATA_UNAVAILABLE'
      );
    }

    let bars: NormalizedDailyBar[];
    try {
      bars = await KbsHistoricalProvider.getDailyHistory(cleanSymbol, startDate, endDate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BacktestDataError(
        `Failed to fetch real historical data from KBS: ${msg}`,
        'DATA_UNAVAILABLE'
      );
    }

    if (!bars || bars.length === 0) {
      throw new BacktestDataError(
        `DATA_UNAVAILABLE: No historical bars returned for ${cleanSymbol} between ${startDate} and ${endDate}`,
        'DATA_UNAVAILABLE'
      );
    }

    const candles: BacktestCandle[] = bars.map((b) => ({
      timestamp: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      value: b.value,
      // Default daily reference, ceiling and floor (approx 7% for HOSE if not explicitly given)
      referencePrice: b.open,
      ceilingPrice: Math.round(b.open * 1.07),
      floorPrice: Math.round(b.open * 0.93),
    }));

    return this.validateCandles(candles);
  }

  /**
   * Performs strict validation on a sequence of historical candles.
   * Rejects immediately on:
   *   - Non-positive or infinite prices
   *   - Inconsistent OHLC relationships (high < max(open, close), low > min(open, close))
   *   - Negative volume
   *   - Non-monotonic or duplicate timestamps
   *
   * @throws BacktestDataError with code 'DATA_UNAVAILABLE' or 'INVALID_PRICE'
   */
  static validateCandles(candles: BacktestCandle[]): BacktestCandle[] {
    if (!candles || !Array.isArray(candles) || candles.length === 0) {
      throw new BacktestDataError(
        'DATA_UNAVAILABLE: Candlestick array is empty or null',
        'DATA_UNAVAILABLE'
      );
    }

    let lastTimestampMs = -Infinity;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const indexStr = `Bar #${i} (${c?.timestamp ?? 'unknown'})`;

      if (!c || typeof c !== 'object') {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} is not a valid object`,
          'DATA_UNAVAILABLE'
        );
      }

      // Timestamp validation
      if (c.timestamp === undefined || c.timestamp === null || c.timestamp === '') {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} missing timestamp`,
          'DATA_UNAVAILABLE'
        );
      }

      const tsMs = typeof c.timestamp === 'number'
        ? c.timestamp
        : new Date(c.timestamp).getTime();

      if (!Number.isFinite(tsMs) || Number.isNaN(tsMs)) {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} has invalid timestamp: "${c.timestamp}"`,
          'DATA_UNAVAILABLE'
        );
      }

      if (tsMs <= lastTimestampMs) {
        if (tsMs === lastTimestampMs) {
          throw new BacktestDataError(
            `DATA_UNAVAILABLE: Duplicate timestamp detected at ${indexStr}: ${c.timestamp}`,
            'DATA_UNAVAILABLE'
          );
        } else {
          throw new BacktestDataError(
            `DATA_UNAVAILABLE: Non-monotonic timestamp detected at ${indexStr}: current ${c.timestamp} <= previous`,
            'DATA_UNAVAILABLE'
          );
        }
      }
      lastTimestampMs = tsMs;

      // Price positivity and finite check
      const prices = [c.open, c.high, c.low, c.close];
      for (const p of prices) {
        if (typeof p !== 'number' || !Number.isFinite(p) || Number.isNaN(p) || p <= 0) {
          throw new BacktestDataError(
            `DATA_UNAVAILABLE: ${indexStr} contains zero, negative, or non-finite price: ${p}`,
            'DATA_UNAVAILABLE'
          );
        }
      }

      // Volume check
      if (typeof c.volume !== 'number' || !Number.isFinite(c.volume) || c.volume < 0) {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} contains invalid negative volume: ${c.volume}`,
          'DATA_UNAVAILABLE'
        );
      }

      // High / Low consistency
      const maxOC = Math.max(c.open, c.close);
      const minOC = Math.min(c.open, c.close);

      if (c.high < maxOC) {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} high (${c.high}) is lower than max(open, close) (${maxOC})`,
          'DATA_UNAVAILABLE'
        );
      }

      if (c.low > minOC) {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} low (${c.low}) is higher than min(open, close) (${minOC})`,
          'DATA_UNAVAILABLE'
        );
      }

      if (c.high < c.low) {
        throw new BacktestDataError(
          `DATA_UNAVAILABLE: ${indexStr} high (${c.high}) is lower than low (${c.low})`,
          'DATA_UNAVAILABLE'
        );
      }
    }

    return candles;
  }
}
