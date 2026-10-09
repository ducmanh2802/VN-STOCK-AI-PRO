/**
 * PHASE 21 — DERIVATIVES DATA PROVIDER & NORMALIZATION
 * =====================================================
 * Fetches and normalizes real derivatives quotes and spot index values from VPS.
 *
 * CRITICAL UNIT SEMANTICS FOR DERIVATIVES:
 * - Equities on VPS use kVND (requiring x1000).
 * - Index Futures on VPS are quoted directly in INDEX POINTS (e.g. 1320.5 pts)
 *   and MUST NOT be multiplied by 1000.
 * - Lot volume represents contract lots (1 lot = 1 contract).
 * - Fails closed: Never fabricates synthetic futures prices or dummy open interest.
 */

import type {
  UnderlyingIndex,
  DerivativesQuote,
  SpotIndexQuote,
  DataFreshnessStatus,
} from '../../lib/derivatives/types.ts';
import { VietnamDerivativesRegistry } from '../../lib/derivatives/VietnamDerivativesRegistry.ts';
import { parseVpsNumeric } from '../market/providers/vps/normalize.ts';
import type { VpsRawQuote } from '../market/providers/vps/types.ts';
import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import { resolveDataFreshness } from '../market/freshness/dataFreshness.ts';
import { QUOTE_FRESHNESS_TTL_MS } from '../market/providers/VPSMarketDataProvider.ts';

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata';
const DEFAULT_TIMEOUT_MS = 10_000;
const QUOTE_TTL_MS = 15_000; // 15s TTL matching Phase 20

export class DerivativesDataProvider {
  /**
   * Fetches raw JSON from VPS for a symbol.
   */
  private static async fetchVpsRaw(symbol: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<VpsRawQuote | null> {
    const sym = symbol.trim().toUpperCase();
    const url = `${VPS_QUOTE_URL}/${sym}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!resp.ok) {
        return null;
      }

      const body = (await resp.json()) as unknown;
      if (!Array.isArray(body) || body.length === 0) {
        return null;
      }

      return body[0] as VpsRawQuote;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Normalizes raw VPS payload into canonical DerivativesQuote.
   */
  public static normalizeFuturesQuote(
    symbol: string,
    raw: VpsRawQuote | null,
    underlying: UnderlyingIndex = 'VN30',
    fetchedAt: string = new Date().toISOString()
  ): DerivativesQuote {
    // P0-02: the observation instant is the moment the provider answered; freshness
    // is computed from it, never asserted.
    const observationMs = new Date(fetchedAt).getTime();
    if (!raw) {
      return {
        symbol,
        contractCode: symbol,
        underlying,
        price: null,
        open: null,
        high: null,
        low: null,
        close: null,
        referencePrice: null,
        ceilingPrice: null,
        floorPrice: null,
        change: null,
        changePercent: null,
        volume: null,
        tradingValue: null,
        openInterest: null,
        source: 'VPS_DERIVATIVES',
        sourceTimestamp: null,
        fetchedAt,
        dataFreshness: 'UNAVAILABLE',
      };
    }

    const price = parseVpsNumeric(raw.lastPrice);
    const open = parseVpsNumeric(raw.openPrice);
    const high = parseVpsNumeric(raw.highPrice);
    const low = parseVpsNumeric(raw.lowPrice);
    const ref = parseVpsNumeric(raw.r ?? raw.closePrice);
    const ceiling = parseVpsNumeric(raw.c);
    const floor = parseVpsNumeric(raw.f);
    const volume = parseVpsNumeric(raw.lot);
    // P27 §9 / §24: there is NO total-turnover field in the VPS futures payload.
    // `fBValue` is the FOREIGN BUY value in THOUSANDS of VND (normalize.ts:70) —
    // reporting it as `tradingValue` would publish a foreign-flow number as the
    // contract's turnover, 1000x off in units as well. Turnover stays
    // UNAVAILABLE (null) until the source exposes a real one.
    const tradingValue = null;

    // Extract Open Interest if reported in raw payload
    const openInterest = parseVpsNumeric(
      (raw as Record<string, unknown>).openInterest ??
      (raw as Record<string, unknown>).oi ??
      (raw as Record<string, unknown>).totalOpenInterest
    );

    let change: number | null = null;
    // P27 §9: `changePc` from the VPS feed is an unsigned magnitude — it is
    // reported positive for falling symbols as well (verified 2026-10-07), so it
    // is never trusted for the SIGN of a move. Derived from the real prices.
    let changePercent: number | null = null;

    if (price != null && ref != null) {
      change = +(price - ref).toFixed(2);
      if (ref > 0) {
        changePercent = +((change / ref) * 100).toFixed(2);
      }
    }

    // P0-02: computed from the real observation timestamp, never asserted.
    const dataFreshness: DataFreshnessStatus =
      price != null && price > 0
        ? resolveDataFreshness({
            sourceTimestamp: observationMs,
            ttlMs: QUOTE_FRESHNESS_TTL_MS,
          }).status
        : 'UNAVAILABLE';

    return {
      symbol,
      contractCode: (raw.sym || symbol).toUpperCase(),
      underlying,
      price,
      open,
      high,
      low,
      close: price,
      referencePrice: ref,
      ceilingPrice: ceiling,
      floorPrice: floor,
      change,
      changePercent,
      volume,
      tradingValue,
      openInterest,
      source: 'VPS_DERIVATIVES',
      sourceTimestamp: observationMs,
      fetchedAt,
      dataFreshness,
    };
  }

  /**
   * Normalizes raw VPS payload into canonical SpotIndexQuote.
   */
  public static normalizeSpotQuote(
    underlying: UnderlyingIndex,
    raw: VpsRawQuote | null,
    fetchedAt: string = new Date().toISOString()
  ): SpotIndexQuote {
    // P0-02: the observation instant is the moment the provider answered; freshness
    // is computed from it, never asserted.
    const observationMs = new Date(fetchedAt).getTime();
    if (!raw) {
      return {
        symbol: underlying,
        price: null,
        referencePrice: null,
        change: null,
        changePercent: null,
        source: 'VPS_INDEX',
        sourceTimestamp: null,
        fetchedAt,
        dataFreshness: 'UNAVAILABLE',
      };
    }

    const price = parseVpsNumeric(raw.lastPrice);
    const ref = parseVpsNumeric(raw.r ?? raw.closePrice);
    const change = price != null && ref != null ? +(price - ref).toFixed(2) : null;
    // P27 §9: `changePc` is an unsigned magnitude — direction comes from prices.
    const changePercent =
      price != null && ref != null && ref > 0 ? +(((price - ref) / ref) * 100).toFixed(2) : null;
    // P0-02: computed from the real observation timestamp, never asserted.
    const dataFreshness: DataFreshnessStatus =
      price != null && price > 0
        ? resolveDataFreshness({
            sourceTimestamp: observationMs,
            ttlMs: QUOTE_FRESHNESS_TTL_MS,
          }).status
        : 'UNAVAILABLE';

    return {
      symbol: underlying,
      price,
      referencePrice: ref,
      change,
      changePercent,
      source: 'VPS_INDEX',
      sourceTimestamp: observationMs,
      fetchedAt,
      dataFreshness,
    };
  }

  /**
   * Retrieves live quote for a futures contract.
   */
  public static async getFuturesQuote(
    symbol: string,
    options?: { timeoutMs?: number; forceRefresh?: boolean; underlying?: UnderlyingIndex }
  ): Promise<DerivativesQuote> {
    const sym = symbol.trim().toUpperCase();
    const underlying = options?.underlying || (sym.startsWith('VN100') ? 'VN100' : 'VN30');
    const cacheKey = `derivatives:quote:${sym}`;

    if (!options?.forceRefresh) {
      const cached = cacheGet<DerivativesQuote>(cacheKey);
      if (cached) return cached;
    }

    const fetchedAt = new Date().toISOString();
    const raw = await this.fetchVpsRaw(sym, options?.timeoutMs);
    const quote = this.normalizeFuturesQuote(sym, raw, underlying, fetchedAt);

    if (quote.dataFreshness === 'CURRENT') {
      cacheSet(cacheKey, quote, QUOTE_TTL_MS);
    }

    return quote;
  }

  /**
   * Retrieves live quote for the underlying spot index (e.g. VN30 or VN100).
   */
  public static async getSpotQuote(
    underlying: UnderlyingIndex = 'VN30',
    options?: { timeoutMs?: number; forceRefresh?: boolean }
  ): Promise<SpotIndexQuote> {
    const cacheKey = `derivatives:spot:${underlying}`;

    if (!options?.forceRefresh) {
      const cached = cacheGet<SpotIndexQuote>(cacheKey);
      if (cached) return cached;
    }

    const fetchedAt = new Date().toISOString();
    const raw = await this.fetchVpsRaw(underlying, options?.timeoutMs);
    const quote = this.normalizeSpotQuote(underlying, raw, fetchedAt);

    if (quote.dataFreshness === 'CURRENT') {
      cacheSet(cacheKey, quote, QUOTE_TTL_MS);
    }

    return quote;
  }
}
