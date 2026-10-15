import type { CandlePoint } from '../../lib/indicators/types.ts';
import type { TimeframeOption } from '../../types/stockDetail.ts';
import type { NormalizedDailyBar } from './providers/kbs/types.ts';
import type { VpsNormalizedFundamentals, VpsNormalizedQuote } from './providers/vps/types.ts';
import { KbsHistoricalProvider } from './providers/kbs/index.ts';
import { VpsProvider } from './providers/vps/index.ts';
import { cacheGet, cacheSet } from './marketDataCache.ts';
import { coalesceInFlight } from './requestCoalescer.ts';
import { withProviderGuard } from './providers/providerGuard.ts';
import {
  DataUnavailableError,
  resolveChain,
  runWithFallback,
  type MarketDataCapability,
} from './providers/providerMatrix.ts';
import {
  validateRealtimeQuote,
  type QuoteCrossCheck,
  type QuoteDataStatus,
  type QuoteValidationResult,
} from './quoteValidation.ts';
import { VIETNAM_STOCKS_UNIVERSE } from './stockUniverse.ts';
import { asVnExchange } from '../../lib/data/vnPriceLimits.ts';

/**
 * Real market data service — the ONLY market-data path for stock analysis.
 *
 *   Historical OHLCV : KBS  (kbbuddywts.kbsec.com.vn data_day)
 *   Realtime quote   : VPS  (getliststockdata)  + KBS cross-check
 *   Fundamentals     : VPS  (getliststockbaseinfo)
 *   Index level      : UNAVAILABLE — no reachable source (see PROVIDER_MATRIX)
 *
 * STRICT RULES enforced here:
 *   - NO synthetic/mock fallback: every failure throws MarketDataUnavailableError
 *     so callers return an explicit DATA_UNAVAILABLE state.
 *   - Errors are NEVER cached; only successful provider results are.
 *   - Unsupported timeframes (intraday) are refused instead of fake-generated.
 *   - Every provider call goes through the P27 guard (timeout + bounded retry +
 *     circuit breaker) and the P27 capability matrix, so the order, the source
 *     that actually answered and the failure history are all auditable.
 *   - Concurrent identical requests are coalesced into one provider call.
 */

export type MarketDataSourceId = 'KBS' | 'VPS';

export class MarketDataUnavailableError extends Error {
  constructor(
    public readonly source: MarketDataSourceId,
    public readonly reason: string
  ) {
    super(`DATA_UNAVAILABLE (${source}): ${reason}`);
    this.name = 'MarketDataUnavailableError';
  }
}

const HISTORY_TIMEOUT_MS = 20_000;
const QUOTE_TIMEOUT_MS = 10_000;
const FUNDAMENTALS_TIMEOUT_MS = 20_000;

/** TTLs — deliberately short so the cache can never serve long-stale data. */
const HISTORY_TTL_MS = 60_000;
const QUOTE_TTL_MS = 15_000;
const FUNDAMENTALS_TTL_MS = 300_000;

/**
 * Calendar-day window per UI timeframe, including warmup margin so MA200 /
 * RSI / MACD / Bollinger have enough prior bars.
 * ('1D' is intentionally 0: KBS data_day has no intraday bars and synthetic
 * intraday candles are forbidden.)
 */
const HISTORY_WINDOW_DAYS: Record<TimeframeOption, number> = {
  '1D': 0,
  '1W': 45,
  '1M': 75,
  '3M': 140,
  '6M': 260,
  '1Y': 500,
  '3Y': 1300,
};

/**
 * KBS only serves ~1 year of lookback (verified live: windows beyond ~365 days
 * are rejected with errorCode 4000014). Cap every window to this so '1Y'/'3Y'
 * return the most recent real bars KBS can serve instead of an empty response.
 */
const KBS_MAX_LOOKBACK_DAYS = 355;

export interface HistoricalStockData {
  symbol: string;
  timeframe: TimeframeOption;
  source: 'KBS';
  /** Candles in the shape consumed by StockAnalysisEngine / charts. */
  candles: CandlePoint[];
  /** Full normalized bars, including KBS trading value (0 when source omits it). */
  bars: NormalizedDailyBar[];
  from: string;
  to: string;
  count: number;
  retrievedAt: string;
}

function normalizeSymbol(symbol: string): string {
  const sym = symbol.toUpperCase().trim();
  if (!sym) {
    throw new MarketDataUnavailableError('KBS', 'EMPTY_SYMBOL');
  }
  return sym;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function toIsoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function toCandle(b: NormalizedDailyBar): CandlePoint {
  return {
    time: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  };
}

/**
 * P27 §6/§7/§8/§19 — one place where every provider call is made:
 *   1. the capability matrix decides whether this capability has any source at
 *      all (a capability declared UNAVAILABLE fails immediately, without a
 *      pointless network round trip);
 *   2. the ordered fallback engine records which provider actually answered and
 *      retains every failed attempt;
 *   3. the guard applies timeout + bounded retry + circuit breaker and updates
 *      the shared provider-health registry.
 */
async function callProvider<T>(
  capability: MarketDataCapability,
  provider: MarketDataSourceId,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const route = resolveChain(capability);
  if (!route.providers.includes(provider)) {
    // The matrix says this capability is not served by this provider (or at all).
    throw new MarketDataUnavailableError(
      provider,
      route.providers.length === 0
        ? `NO_PROVIDER_REGISTERED: ${capability} — ${route.note}`
        : `WRONG_PROVIDER: ${capability} is served by ${route.providers.join(', ')}`
    );
  }

  try {
    const outcome = await runWithFallback<T>(capability, [
      {
        provider,
        run: () =>
          withProviderGuard(
            // The provider aborts its own socket at `timeoutMs`; the guard gives it
            // a little slack before it forcibly cancels the attempt.
            { provider, timeoutMs: timeoutMs + 1_000 },
            () => fn()
          ),
      },
    ]);
    return outcome.value;
  } catch (err) {
    if (err instanceof DataUnavailableError) {
      const attempt = err.attempts[0];
      const reason = attempt ? `${attempt.errorCode} — ${attempt.message}` : err.message;
      throw new MarketDataUnavailableError(provider, reason);
    }
    throw err;
  }
}

/**
 * Cache read → (miss) single-flight fetch → cache write.
 * Failures are never cached and never memoized in the in-flight map.
 */
async function cached<T>(cacheKey: string, ttlMs: number, forceRefresh: boolean, load: () => Promise<T>): Promise<T> {
  if (!forceRefresh) {
    const hit = cacheGet<T>(cacheKey);
    if (hit !== undefined && hit !== null) return hit;
  }
  const value = await coalesceInFlight(cacheKey, load);
  cacheSet(cacheKey, value, ttlMs);
  return value;
}

/**
 * STEP 6 — real historical data entry point.
 * Daily timeframes load REAL KBS OHLCV; anything else is an explicit
 * DATA_UNAVAILABLE (never a generated series).
 */
export async function getHistoricalStockData(
  symbol: string,
  timeframe: TimeframeOption,
  options?: { timeoutMs?: number; forceRefresh?: boolean }
): Promise<HistoricalStockData> {
  const sym = normalizeSymbol(symbol);
  // Cap at KBS's supported lookback so multi-year timeframes serve the most
  // recent real bars (KBS rejects ranges beyond ~1 year with errorCode 4000014).
  const windowDays = Math.min(HISTORY_WINDOW_DAYS[timeframe] ?? 0, KBS_MAX_LOOKBACK_DAYS);
  if (timeframe === '1D' || windowDays === 0) {
    throw new MarketDataUnavailableError(
      'KBS',
      `TIMEFRAME_NOT_SUPPORTED: KBS data_day provides daily bars only; "${timeframe}" cannot be served without generating synthetic candles, which is disabled.`
    );
  }

  const cacheKey = `history:${sym}:${timeframe}`;
  const endDate = toIsoDateToday();
  const startDate = isoDaysAgo(windowDays);

  const result = await cached<HistoricalStockData>(
    cacheKey,
    HISTORY_TTL_MS,
    options?.forceRefresh === true,
    async () => {
      let bars: NormalizedDailyBar[];
      try {
        bars = await callProvider('history', 'KBS', options?.timeoutMs ?? HISTORY_TIMEOUT_MS, () =>
          KbsHistoricalProvider.getDailyHistory(sym, startDate, endDate, {
            timeoutMs: options?.timeoutMs ?? HISTORY_TIMEOUT_MS,
          })
        );
      } catch (err) {
        if (err instanceof MarketDataUnavailableError) throw err;
        const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        throw new MarketDataUnavailableError('KBS', `KBS_REQUEST_FAILED — ${reason}`);
      }

      if (bars.length === 0) {
        throw new MarketDataUnavailableError(
          'KBS',
          `KBS_EMPTY_HISTORY: no daily bars returned for ${sym} between ${startDate} and ${endDate}`
        );
      }

      return {
        symbol: sym,
        timeframe,
        source: 'KBS' as const,
        candles: bars.map(toCandle),
        bars,
        from: bars[0].date,
        to: bars[bars.length - 1].date,
        count: bars.length,
        retrievedAt: new Date().toISOString(),
      };
    }
  );

  return result;
}

export type { QuoteCrossCheck, QuoteDataStatus } from './quoteValidation.ts';

export interface RealtimeQuote {
  symbol: string;
  source: 'VPS';
  /**
   * OK only when the quote is within its exchange price limits AND agrees with the
   * independent KBS close. Any other status means the values are diagnostics, not a
   * usable price: consumers must not trade or display them as current.
   */
  dataStatus: QuoteDataStatus;
  /** Raw normalized VPS values, kept even when not OK so the conflict is inspectable. */
  quote: VpsNormalizedQuote;
  crossCheck: QuoteCrossCheck;
  validation: Pick<QuoteValidationResult, 'reasonCode' | 'detail' | 'sessionDate' | 'calendarCovered' | 'priceLimits'>;
  /** Human-readable reason, present whenever dataStatus is not OK. */
  error?: string;
  retrievedAt: string;
}

/**
 * STEP 5/8 — realtime quote with explicit unit normalization, validated against the
 * session's exchange price limits and cross-checked against the KBS close before it
 * can be marked OK. The quote values are always real VPS data; nothing is repaired.
 */
export async function getRealtimeQuote(
  symbol: string,
  options?: { timeoutMs?: number; forceRefresh?: boolean }
): Promise<RealtimeQuote> {
  const sym = normalizeSymbol(symbol);

  const cacheKey = `quote:${sym}`;

  return cached<RealtimeQuote>(cacheKey, QUOTE_TTL_MS, options?.forceRefresh === true, async () => {
    let quote: VpsNormalizedQuote;
    try {
      quote = await callProvider('quote', 'VPS', options?.timeoutMs ?? QUOTE_TIMEOUT_MS, () =>
        VpsProvider.getQuote(sym, { timeoutMs: options?.timeoutMs ?? QUOTE_TIMEOUT_MS })
      );
    } catch (err) {
      if (err instanceof MarketDataUnavailableError) throw err;
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw new MarketDataUnavailableError('VPS', `VPS_QUOTE_FAILED — ${reason}`);
    }

    // --- Independent benchmark: the latest KBS daily closes ---
    let benchmark: { bars: { date: string; close: number }[] } | { error: string };
    try {
      const bench = await KbsHistoricalProvider.getDailyHistory(sym, isoDaysAgo(45), toIsoDateToday(), {
        timeoutMs: QUOTE_TIMEOUT_MS,
      });
      benchmark = { bars: bench.map((b) => ({ date: b.date, close: b.close })) };
    } catch (err) {
      benchmark = { error: err instanceof Error ? err.message : String(err) };
    }

    const exchange = asVnExchange(VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === sym)?.exchange);
    const validation = validateRealtimeQuote({ quote, exchange, benchmark, now: new Date() });

    return {
      symbol: sym,
      source: 'VPS' as const,
      dataStatus: validation.dataStatus,
      quote,
      crossCheck: validation.crossCheck,
      validation: {
        reasonCode: validation.reasonCode,
        detail: validation.detail,
        sessionDate: validation.sessionDate,
        calendarCovered: validation.calendarCovered,
        priceLimits: validation.priceLimits,
      },
      ...(validation.dataStatus === 'OK' ? {} : { error: `${validation.reasonCode}: ${validation.detail}` }),
      retrievedAt: new Date().toISOString(),
    };
  });
}

/**
 * STEP 9 — VPS fundamentals. The source's period metadata is ambiguous, so the
 * result carries `periodMetadata.mappingStatus: 'AMBIGUOUS'` and
 * `isCurrentPeriodConfirmed: false`; the UI must present it with those warnings
 * and must not present any slot as "current".
 */
export async function getStockFundamentals(
  symbol: string,
  options?: { timeoutMs?: number; forceRefresh?: boolean }
): Promise<VpsNormalizedFundamentals> {
  const sym = normalizeSymbol(symbol);

  const cacheKey = `fundamentals:${sym}`;

  return cached<VpsNormalizedFundamentals>(
    cacheKey,
    FUNDAMENTALS_TTL_MS,
    options?.forceRefresh === true,
    async () => {
      try {
        return await callProvider('fundamentals', 'VPS', options?.timeoutMs ?? FUNDAMENTALS_TIMEOUT_MS, () =>
          VpsProvider.getFundamentals(sym, {
            timeoutMs: options?.timeoutMs ?? FUNDAMENTALS_TIMEOUT_MS,
          })
        );
      } catch (err) {
        if (err instanceof MarketDataUnavailableError) throw err;
        const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        throw new MarketDataUnavailableError('VPS', `VPS_FUNDAMENTALS_FAILED — ${reason}`);
      }
    }
  );
}