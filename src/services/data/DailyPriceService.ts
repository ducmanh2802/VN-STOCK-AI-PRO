/**
 * DAILY PRICE READ MODEL
 * ======================
 * The single read path for historical daily OHLCV. It reads the authoritative series
 * in `canonical_market_bars` (KBS, canonical daily version, VALID, non-synthetic,
 * visible at `now`) — the table written by the one ingestion path,
 * `CanonicalMarketDataIngestionService.ingestBatch`.
 *
 * `stock_daily` is no longer read or written by the application. It is kept, untouched,
 * until `scripts/reconcile-daily-prices.ts` shows its rows are fully represented in the
 * canonical series; only then may it be retired by a reviewed migration.
 *
 * Missing sessions are reported, never filled: no price is interpolated or carried forward.
 */
import { CanonicalMarketDataRepository, type CanonicalDailyBar } from '../../lib/db/data/CanonicalMarketDataRepository.ts';
import { missingDatabaseConfiguration } from '../../db/databaseHealth.ts';
import { isDatabaseUnavailable } from '../../db/dbFailure.ts';
import { isVnTradingDay, addCalendarDays } from '../../lib/data/vnTradingCalendar.ts';
import type { VnExchange } from '../../lib/data/vnPriceLimits.ts';
import { AUTHORITATIVE_DAILY_SERIES, instrumentIdFor, supportedExchangeOf } from './kbsDailyObservations.ts';

export const DEFAULT_DAILY_LIMIT = 120;
export const MAX_DAILY_LIMIT = 2_000;
const MAX_LISTED_MISSING_SESSIONS = 50;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DailyPriceResult =
  | {
      readonly status: 'OK' | 'EMPTY';
      readonly symbol: string;
      readonly instrumentId: string;
      readonly exchange: VnExchange;
      readonly bars: readonly CanonicalDailyBar[];
      /** Trading sessions inside the returned range with no stored bar (first 50). */
      readonly missingSessions: readonly string[];
      readonly missingSessionCount: number;
    }
  | { readonly status: 'UNSUPPORTED_SYMBOL'; readonly symbol: string }
  | { readonly status: 'INVALID_QUERY'; readonly detail: string }
  | {
      readonly status: 'DATABASE_UNAVAILABLE';
      readonly symbol: string;
      readonly databaseState: 'NOT_CONFIGURED' | 'UNAVAILABLE';
    };

export interface DailyPriceQuery {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly now: Date;
}

function missingSessionsIn(bars: readonly CanonicalDailyBar[]): string[] {
  if (bars.length < 2) return [];
  const have = new Set(bars.map((b) => b.tradingDate));
  const missing: string[] = [];
  const last = bars[bars.length - 1]!.tradingDate;
  for (let d = bars[0]!.tradingDate; d <= last; d = addCalendarDays(d, 1)) {
    if (isVnTradingDay(d) && !have.has(d)) missing.push(d);
  }
  return missing;
}

export async function getDailyPrices(rawSymbol: string, query: DailyPriceQuery): Promise<DailyPriceResult> {
  const symbol = (rawSymbol ?? '').trim().toUpperCase();
  if (query.from !== undefined && !ISO_DATE.test(query.from)) {
    return { status: 'INVALID_QUERY', detail: 'from must be YYYY-MM-DD' };
  }
  if (query.to !== undefined && !ISO_DATE.test(query.to)) {
    return { status: 'INVALID_QUERY', detail: 'to must be YYYY-MM-DD' };
  }
  if (query.from && query.to && query.from > query.to) {
    return { status: 'INVALID_QUERY', detail: 'from must not be after to' };
  }
  const limit = query.limit ?? DEFAULT_DAILY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DAILY_LIMIT) {
    return { status: 'INVALID_QUERY', detail: `limit must be an integer between 1 and ${MAX_DAILY_LIMIT}` };
  }

  const exchange = supportedExchangeOf(symbol);
  if (!exchange) return { status: 'UNSUPPORTED_SYMBOL', symbol };
  if (missingDatabaseConfiguration().length > 0) {
    return { status: 'DATABASE_UNAVAILABLE', symbol, databaseState: 'NOT_CONFIGURED' };
  }

  const instrumentId = instrumentIdFor(symbol, exchange);
  let bars: CanonicalDailyBar[];
  try {
    bars = await CanonicalMarketDataRepository.getDailySeries({
      instrumentId,
      series: AUTHORITATIVE_DAILY_SERIES,
      asOf: query.now,
      from: query.from,
      to: query.to,
      limit,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return { status: 'DATABASE_UNAVAILABLE', symbol, databaseState: 'UNAVAILABLE' };
    throw error;
  }

  const missing = missingSessionsIn(bars);
  return {
    status: bars.length > 0 ? 'OK' : 'EMPTY',
    symbol,
    instrumentId,
    exchange,
    bars,
    missingSessions: missing.slice(0, MAX_LISTED_MISSING_SESSIONS),
    missingSessionCount: missing.length,
  };
}

const price = (v: number | null): string | null => (v === null ? null : v.toFixed(2));

/**
 * Backward-compatible row shape of the former `stock_daily` response (same field names,
 * numeric columns as fixed-2 strings, volume as a number), plus provenance fields.
 * `stockId` was the `stocks` surrogate key, which the canonical model does not use: it
 * is null; `instrumentId` identifies the instrument instead. `change`/`changePercent`
 * were never populated by any writer and stay null.
 */
export function toLegacyDailyRow(bar: CanonicalDailyBar) {
  return {
    id: bar.id,
    stockId: null,
    instrumentId: bar.instrumentId,
    date: bar.tradingDate,
    open: price(bar.open),
    high: price(bar.high),
    low: price(bar.low),
    close: price(bar.close),
    refPrice: price(bar.referencePrice),
    ceilingPrice: price(bar.ceilingPrice),
    floorPrice: price(bar.floorPrice),
    change: null,
    changePercent: null,
    volume: bar.volume,
    value: price(bar.turnoverVnd),
    createdAt: bar.ingestedAt,
    updatedAt: bar.ingestedAt,
    source: bar.source,
    provider: bar.provider,
    dataVersion: bar.dataVersion,
    adjustmentState: bar.adjustmentState,
  };
}

/** Candles for the analysis engines, from the same authoritative series. */
export function toCandles(bars: readonly CanonicalDailyBar[]) {
  return bars
    .filter((b) => b.open !== null && b.high !== null && b.low !== null && b.close !== null && b.volume !== null)
    .map((b) => ({
      time: b.tradingDate,
      open: b.open!,
      high: b.high!,
      low: b.low!,
      close: b.close!,
      volume: b.volume!,
    }));
}
