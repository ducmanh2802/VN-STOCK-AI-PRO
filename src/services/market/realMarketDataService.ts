import type { CandlePoint } from '../../lib/indicators/types.ts';
import type { TimeframeOption } from '../../types/stockDetail.ts';
import type { NormalizedDailyBar } from './providers/kbs/types.ts';
import type { VpsNormalizedFundamentals, VpsNormalizedQuote } from './providers/vps/types.ts';
import { KbsHistoricalProvider } from './providers/kbs/index.ts';
import { VpsProvider } from './providers/vps/index.ts';
import { cacheGet, cacheSet } from './marketDataCache.ts';

/**
 * Real market data service — the ONLY market-data path for stock analysis.
 *
 *   Historical OHLCV : KBS  (kbbuddywts.kbsec.com.vn data_day)
 *   Realtime quote   : VPS  (getliststockdata)  + KBS cross-check
 *   Fundamentals     : VPS  (getliststockbaseinfo)
 *
 * STRICT RULES enforced here:
 *   - NO synthetic/mock fallback: every failure throws MarketDataUnavailableError
 *     so callers return an explicit DATA_UNAVAILABLE state.
 *   - Errors are NEVER cached; only successful provider results are.
 *   - Unsupported timeframes (intraday) are refused instead of fake-generated.
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

/** Deviation (%) between VPS last price and KBS last close tolerated by the sanity cross-check. */
const QUOTE_CROSSCHECK_TOLERANCE_PERCENT = 10;

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
  if (!options?.forceRefresh) {
    const cached = cacheGet<HistoricalStockData>(cacheKey);
    if (cached) return cached;
  }

  const endDate = toIsoDateToday();
  const startDate = isoDaysAgo(windowDays);

  let bars: NormalizedDailyBar[];
  try {
    bars = await KbsHistoricalProvider.getDailyHistory(sym, startDate, endDate, {
      timeoutMs: options?.timeoutMs ?? HISTORY_TIMEOUT_MS,
    });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new MarketDataUnavailableError('KBS', `KBS_REQUEST_FAILED — ${reason}`);
  }

  if (bars.length === 0) {
    throw new MarketDataUnavailableError(
      'KBS',
      `KBS_EMPTY_HISTORY: no daily bars returned for ${sym} between ${startDate} and ${endDate}`
    );
  }

  const result: HistoricalStockData = {
    symbol: sym,
    timeframe,
    source: 'KBS',
    candles: bars.map(toCandle),
    bars,
    from: bars[0].date,
    to: bars[bars.length - 1].date,
    count: bars.length,
    retrievedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, result, HISTORY_TTL_MS);
  return result;
}

export interface QuoteCrossCheck {
  benchmarkSource: 'KBS';
  /** Date of the benchmark KBS bar. */
  kbsDate: string | null;
  /** KBS close in VND for that date. */
  kbsClose: number | null;
  /** (vpsLastPrice - kbsClose) / kbsClose * 100, rounded to 2 decimals. */
  deviationPercent: number | null;
  status: 'OK' | 'MISMATCH' | 'UNVERIFIED';
  detail: string;
}

export interface RealtimeQuote {
  symbol: string;
  source: 'VPS';
  dataStatus: 'OK';
  quote: VpsNormalizedQuote;
  crossCheck: QuoteCrossCheck;
  retrievedAt: string;
}

/**
 * STEP 5/8 — realtime quote with explicit unit normalization verified against
 * KBS before use. The quote itself is always real VPS data; the cross-check is
 * advisory metadata (OK / MISMATCH / UNVERIFIED) and never fabricates anything.
 */
export async function getRealtimeQuote(
  symbol: string,
  options?: { timeoutMs?: number; forceRefresh?: boolean }
): Promise<RealtimeQuote> {
  const sym = normalizeSymbol(symbol);

  const cacheKey = `quote:${sym}`;
  if (!options?.forceRefresh) {
    const cached = cacheGet<RealtimeQuote>(cacheKey);
    if (cached) return cached;
  }

  let quote: VpsNormalizedQuote;
  try {
    quote = await VpsProvider.getQuote(sym, { timeoutMs: options?.timeoutMs ?? QUOTE_TIMEOUT_MS });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new MarketDataUnavailableError('VPS', `VPS_QUOTE_FAILED — ${reason}`);
  }

  // --- Cross-check the kVND->VND normalization against the latest KBS close ---
  let crossCheck: QuoteCrossCheck;
  try {
    const bench = await KbsHistoricalProvider.getDailyHistory(sym, isoDaysAgo(45), toIsoDateToday(), {
      timeoutMs: QUOTE_TIMEOUT_MS,
    });
    const last = bench.length > 0 ? bench[bench.length - 1] : null;
    if (last && last.close > 0) {
      const deviation = +(((quote.lastPrice - last.close) / last.close) * 100).toFixed(2);
      const ok = Math.abs(deviation) <= QUOTE_CROSSCHECK_TOLERANCE_PERCENT;
      crossCheck = {
        benchmarkSource: 'KBS',
        kbsDate: last.date,
        kbsClose: last.close,
        deviationPercent: deviation,
        status: ok ? 'OK' : 'MISMATCH',
        detail: ok
          ? `VPS lastPrice ${quote.lastPrice} within ${QUOTE_CROSSCHECK_TOLERANCE_PERCENT}% of KBS close ${last.close} (${last.date}).`
          : `VPS lastPrice ${quote.lastPrice} deviates ${deviation}% from KBS close ${last.close} (${last.date}). Inspect before use.`,
      };
    } else {
      crossCheck = {
        benchmarkSource: 'KBS',
        kbsDate: null,
        kbsClose: null,
        deviationPercent: null,
        status: 'UNVERIFIED',
        detail: 'KBS returned no benchmark bar in the last 45 days.',
      };
    }
  } catch (err) {
    crossCheck = {
      benchmarkSource: 'KBS',
      kbsDate: null,
      kbsClose: null,
      deviationPercent: null,
      status: 'UNVERIFIED',
      detail: `KBS cross-check unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result: RealtimeQuote = {
    symbol: sym,
    source: 'VPS',
    dataStatus: 'OK',
    quote,
    crossCheck,
    retrievedAt: new Date().toISOString(),
  };
  cacheSet(cacheKey, result, QUOTE_TTL_MS);
  return result;
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
  if (!options?.forceRefresh) {
    const cached = cacheGet<VpsNormalizedFundamentals>(cacheKey);
    if (cached) return cached;
  }

  let fundamentals: VpsNormalizedFundamentals;
  try {
    fundamentals = await VpsProvider.getFundamentals(sym, {
      timeoutMs: options?.timeoutMs ?? FUNDAMENTALS_TIMEOUT_MS,
    });
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new MarketDataUnavailableError('VPS', `VPS_FUNDAMENTALS_FAILED — ${reason}`);
  }

  cacheSet(cacheKey, fundamentals, FUNDAMENTALS_TTL_MS);
  return fundamentals;
}