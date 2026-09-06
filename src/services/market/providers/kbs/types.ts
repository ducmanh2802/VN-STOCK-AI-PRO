/**
 * KBS Securities (KB Securities Vietnam) — Historical Daily OHLCV API types.
 *
 * Endpoint: GET https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/{SYMBOL}/data_day
 * Auth: none (public), requires User-Agent header.
 * Date params: DD-MM-YYYY (e.g. 01-01-2025).
 */

/** Raw KBS per-session bar record (field names are vendor-defined). */
export interface KbsRawDailyBar {
  /** Session timestamp, e.g. "2026-08-28 07:00" (VN time). */
  t: string;
  /** Open price, VND/share. */
  o: number;
  /** High price, VND/share. */
  h: number;
  /** Low price, VND/share. */
  l: number;
  /** Close price, VND/share. */
  c: number;
  /** Volume, shares. */
  v: number;
  /**
   * Trading value, VND. The vendor OMITS this field on the live/current
   * session bar (verified 2026-09-06: 2026-09-04 HPG bar has no `va`),
   * in which case it is normalized to 0 — never fabricated.
   */
  va: number;
}

/** Raw KBS data_day envelope. */
export interface KbsDataDayResponse {
  symbol?: string;
  data_day?: KbsRawDailyBar[];
}

/** Normalized application-side OHLCV bar (matches stock_daily semantics). */
export interface NormalizedDailyBar {
  /** Trading date, 'YYYY-MM-DD'. */
  date: string;
  /** Open price, VND/share. */
  open: number;
  /** High price, VND/share. */
  high: number;
  /** Low price, VND/share. */
  low: number;
  /** Close price, VND/share. */
  close: number;
  /** Volume, shares. */
  volume: number;
  /** Trading value, VND. */
  value: number;
}
