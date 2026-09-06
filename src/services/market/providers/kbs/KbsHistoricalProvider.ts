import type {
  KbsDataDayResponse,
  KbsRawDailyBar,
  NormalizedDailyBar,
} from './types.ts';

const KBS_BASE_URL = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks';
const DEFAULT_TIMEOUT_MS = 15_000;
const REQUIRED_USER_AGENT = 'Mozilla/5.0';

export interface KbsFetchOptions {
  /** Timeout for the HTTP request in milliseconds. */
  timeoutMs?: number;
}

export class KbsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'KbsApiError';
  }
}

/** Converts 'YYYY-MM-DD' → 'DD-MM-YYYY' (KBS query format). */
export function toKbsDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) {
    throw new KbsApiError(`Invalid ISO date for KBS query: "${isoDate}"`);
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Extracts the 'YYYY-MM-DD' trading date from KBS 't' field ("2026-08-28 07:00"). */
export function parseKbsTimestamp(t: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t.trim());
  return m ? m[1] : null;
}

/**
 * Type-safe structural validation of a raw KBS bar.
 * Returns null for bars that are malformed rather than throwing,
 * so a single bad row does not abort a full history import.
 */
function validateRawBar(bar: unknown): KbsRawDailyBar | null {
  if (typeof bar !== 'object' || bar === null) return null;
  const b = bar as Record<string, unknown>;
  if (typeof b.t !== 'string' || b.t.trim() === '') return null;
  const o = Number(b.o);
  const h = Number(b.h);
  const l = Number(b.l);
  const c = Number(b.c);
  const v = Number(b.v);
  // `va` (trading value) is optional: the vendor omits it on the live-session bar.
  const va = Number(b.va);
  if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) return null;
  if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return null;
  if (!Number.isFinite(v) || v < 0) return null;
  if (h < Math.max(o, c) || l > Math.min(o, c)) return null;
  return { t: b.t, o, h, l, c, v, va: Number.isFinite(va) && va >= 0 ? va : 0 };
}

/** Normalizes a validated raw bar into the application OHLCV structure. */
function normalizeBar(bar: KbsRawDailyBar): NormalizedDailyBar | null {
  const date = parseKbsTimestamp(bar.t);
  if (!date) return null;
  return {
    date,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
    value: bar.va,
  };
}

/**
 * KBS Securities historical daily OHLCV provider.
 *
 * Uses native fetch (no axios / no SDK dependency).
 * No fake fallback: any failure surfaces as KbsApiError.
 */
export class KbsHistoricalProvider {
  /**
   * Fetches and normalizes daily OHLCV bars for a symbol.
   *
   * @param symbol    Stock ticker (e.g. 'HPG'). Case-insensitive, trimmed.
   * @param startDate ISO start date ('YYYY-MM-DD', inclusive).
   * @param endDate   ISO end date ('YYYY-MM-DD', inclusive).
   * @returns Chronological array of normalized bars (may be empty if the
   *          vendor returns no data for the range — NOT an error).
   */
  static async getDailyHistory(
    symbol: string,
    startDate: string,
    endDate: string,
    options?: KbsFetchOptions
  ): Promise<NormalizedDailyBar[]> {
    const sym = symbol.toUpperCase().trim();
    if (!/^[A-Z0-9_.]{1,20}$/.test(sym)) {
      throw new KbsApiError(`Invalid KBS symbol format: "${symbol}"`);
    }

    const sdate = toKbsDate(startDate);
    const edate = toKbsDate(endDate);

    const url = `${KBS_BASE_URL}/${encodeURIComponent(sym)}/data_day?sdate=${encodeURIComponent(sdate)}&edate=${encodeURIComponent(edate)}`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': REQUIRED_USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new KbsApiError(`KBS request timed out after ${options?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms for ${sym}`);
      }
      throw new KbsApiError(
        `KBS network error for ${sym}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      throw new KbsApiError(
        `KBS HTTP ${response.status} ${response.statusText} for ${sym}`,
        response.status
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new KbsApiError(`KBS returned non-JSON payload for ${sym}`, response.status);
    }

    if (typeof payload !== 'object' || payload === null) {
      throw new KbsApiError(`KBS payload is not an object for ${sym}`, response.status);
    }

    const envelope = payload as KbsDataDayResponse;
    // Vendor may return null/undefined data_day for symbols with no history in range.
    const rawBars = Array.isArray(envelope.data_day) ? envelope.data_day : [];

    const normalized: NormalizedDailyBar[] = [];
    const seen = new Set<string>();
    for (const raw of rawBars) {
      const bar = validateRawBar(raw);
      if (!bar) continue;
      const row = normalizeBar(bar);
      if (!row) continue;
      // Deduplicate on date (keep first occurrence) to protect the unique index.
      if (seen.has(row.date)) continue;
      seen.add(row.date);
      normalized.push(row);
    }

    // Enforce strict chronological ordering regardless of vendor order.
    normalized.sort((a, b) => a.date.localeCompare(b.date));

    return normalized;
  }
}
