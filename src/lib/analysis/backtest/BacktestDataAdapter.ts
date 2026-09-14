/**
 * PHASE 17.6 — BACKTEST DATA ADAPTER
 * ====================================
 * Normalizes, validates, and cleans historical OHLCV data from real market providers
 * for deterministic backtesting.
 * 
 * STRICT RULES:
 *   - Fail closed: Rejects non-finite numbers, prices <= 0, volume < 0, invalid OHLC relationships.
 *   - Duplicate or out-of-order timestamps trigger validation failure.
 *   - NO synthetic or mock candle generation.
 */

import type { CandlePoint } from '../../indicators/types.ts';
import type { TimeframeOption } from '../../../types/stockDetail.ts';
import { getHistoricalStockData, type HistoricalStockData } from '../../../services/market/realMarketDataService.ts';
import type { HistoricalCandle } from './types.ts';

export interface DataValidationResult {
  readonly valid: boolean;
  readonly candles: readonly HistoricalCandle[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export class BacktestDataAdapter {
  /**
   * Validates and normalizes an array of raw candlestick objects into strictly verified HistoricalCandle[].
   */
  public static validateAndNormalize(
    rawCandles: readonly any[],
    fallbackSymbol: string = 'UNKNOWN'
  ): DataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
      return {
        valid: false,
        candles: [],
        errors: ['Candle series is empty or not an array'],
        warnings: [],
      };
    }

    const normalizedCandles: HistoricalCandle[] = [];
    const seenTimestamps = new Set<string>();
    let prevTimestampMs = -Infinity;

    for (let i = 0; i < rawCandles.length; i++) {
      const raw = rawCandles[i];
      const indexLabel = `Bar[${i}]`;

      if (!raw || typeof raw !== 'object') {
        errors.push(`${indexLabel}: Null or non-object candle`);
        continue;
      }

      const symbol = (raw.symbol || fallbackSymbol).toUpperCase().trim();
      const rawTime = raw.timestamp ?? raw.time;

      if (!rawTime || (typeof rawTime !== 'string' && typeof rawTime !== 'number')) {
        errors.push(`${indexLabel}: Missing or invalid timestamp`);
        continue;
      }

      // Convert time to standardized ISO string YYYY-MM-DD or full ISO
      let isoTimestamp: string;
      let timestampMs: number;
      try {
        const parsedDate = typeof rawTime === 'number'
          ? new Date(rawTime > 1e11 ? rawTime : rawTime * 1000)
          : new Date(rawTime);
        
        if (isNaN(parsedDate.getTime())) {
          errors.push(`${indexLabel}: Invalid date string "${rawTime}"`);
          continue;
        }
        isoTimestamp = parsedDate.toISOString().slice(0, 10);
        timestampMs = parsedDate.getTime();
      } catch (err: any) {
        errors.push(`${indexLabel}: Failed to parse timestamp: ${err?.message}`);
        continue;
      }

      // Duplicate timestamp check
      if (seenTimestamps.has(isoTimestamp)) {
        errors.push(`${indexLabel}: Duplicate timestamp "${isoTimestamp}" detected`);
        continue;
      }
      seenTimestamps.add(isoTimestamp);

      // Chronological ordering check
      if (timestampMs < prevTimestampMs) {
        errors.push(
          `${indexLabel}: Unsorted timestamp "${isoTimestamp}" (previous was later in time)`
        );
      }
      prevTimestampMs = timestampMs;

      // Extract and validate numeric prices
      const open = Number(raw.open);
      const high = Number(raw.high);
      const low = Number(raw.low);
      const close = Number(raw.close);
      const volume = Number(raw.volume);
      const value = raw.value !== undefined && raw.value !== null ? Number(raw.value) : null;

      if (!Number.isFinite(open) || open <= 0) {
        errors.push(`${indexLabel}: Invalid open price ${open} (must be finite and > 0)`);
      }
      if (!Number.isFinite(high) || high <= 0) {
        errors.push(`${indexLabel}: Invalid high price ${high} (must be finite and > 0)`);
      }
      if (!Number.isFinite(low) || low <= 0) {
        errors.push(`${indexLabel}: Invalid low price ${low} (must be finite and > 0)`);
      }
      if (!Number.isFinite(close) || close <= 0) {
        errors.push(`${indexLabel}: Invalid close price ${close} (must be finite and > 0)`);
      }
      if (!Number.isFinite(volume) || volume < 0) {
        errors.push(`${indexLabel}: Invalid volume ${volume} (must be finite and >= 0)`);
      }

      // OHLC geometric relationship checks
      if (high < low) {
        errors.push(`${indexLabel}: High (${high}) is strictly less than Low (${low})`);
      }
      if (high < open) {
        errors.push(`${indexLabel}: High (${high}) is less than Open (${open})`);
      }
      if (high < close) {
        errors.push(`${indexLabel}: High (${high}) is less than Close (${close})`);
      }
      if (low > open) {
        errors.push(`${indexLabel}: Low (${low}) is greater than Open (${open})`);
      }
      if (low > close) {
        errors.push(`${indexLabel}: Low (${low}) is greater than Close (${close})`);
      }

      if (errors.length === 0) {
        normalizedCandles.push({
          symbol,
          timestamp: isoTimestamp,
          open,
          high,
          low,
          close,
          volume,
          value,
        });
      }
    }

    const isValid = errors.length === 0 && normalizedCandles.length > 0;

    return {
      valid: isValid,
      candles: Object.freeze(normalizedCandles),
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
    };
  }

  /**
   * Converts existing HistoricalStockData bundle from realMarketDataService into validated HistoricalCandle[].
   */
  public static fromHistoricalStockData(data: HistoricalStockData): DataValidationResult {
    if (!data || !Array.isArray(data.candles)) {
      return {
        valid: false,
        candles: [],
        errors: ['Invalid HistoricalStockData structure'],
        warnings: [],
      };
    }

    const rawWithSymbol = data.candles.map((c) => ({
      ...c,
      symbol: data.symbol,
    }));

    return this.validateAndNormalize(rawWithSymbol, data.symbol);
  }

  /**
   * Fetches real historical market data for a symbol and prepares validated candles for backtesting.
   */
  public static async fetchRealCandles(
    symbol: string,
    timeframe: TimeframeOption = '1Y'
  ): Promise<DataValidationResult> {
    try {
      const realData = await getHistoricalStockData(symbol, timeframe);
      return this.fromHistoricalStockData(realData);
    } catch (error: any) {
      return {
        valid: false,
        candles: [],
        errors: [error?.message || 'Failed to fetch real market data'],
        warnings: [],
      };
    }
  }

  /**
   * Converts HistoricalCandle array to indicator-compatible CandlePoint[]
   */
  public static toCandlePoints(candles: readonly HistoricalCandle[]): CandlePoint[] {
    return candles.map((c) => ({
      time: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }
}
