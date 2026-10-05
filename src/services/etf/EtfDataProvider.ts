/**
 * PHASE 22 — ETF DATA PROVIDER
 * ==============================
 * Real market data ingestion and normalization for Vietnamese ETFs.
 * Sources:
 * - Realtime market quotes: VPS Securities API (`/getliststockdata/{SYMBOL}`)
 * - Historical daily bars: KBS Securities API (`/stocks/{SYMBOL}/data_day`)
 *
 * Invariants:
 * - Direct unit normalization (kVND -> VND) consistent with exchange standards
 * - Fail-closed error handling (no synthetic defaults, no fake prices)
 * - Returns explicit PR-01 freshness states (CURRENT, STALE, UNAVAILABLE, INVALID)
 */

import type { EtfMarketQuote } from '../../lib/etf/types.ts';
import type { CandlePoint } from '../../lib/indicators/types.ts';
import type { VpsRawQuote } from '../market/providers/vps/types.ts';
import {
  normalizeVpsLotVolume,
  normalizeVpsPercent,
  normalizeVpsPrice,
  normalizeVpsReferencePrice,
  normalizeVpsValueThousands,
  parseVpsNumeric,
} from '../market/providers/vps/normalize.ts';
import { KbsHistoricalProvider } from '../market/providers/kbs/KbsHistoricalProvider.ts';
import { resolveDataFreshness } from '../market/freshness/dataFreshness.ts';
import { QUOTE_FRESHNESS_TTL_MS } from '../market/providers/VPSMarketDataProvider.ts';

const VPS_QUOTE_URL = 'https://bgapidatafeed.vps.com.vn/getliststockdata';
const DEFAULT_TIMEOUT_MS = 15_000;

export class EtfDataProvider {
  /**
   * Normalizes a raw VPS quote payload into an authoritative EtfMarketQuote domain model.
   * If raw is null/empty or prices are non-positive, fails closed to UNAVAILABLE.
   */
  public static normalizeQuote(
    symbol: string,
    raw: VpsRawQuote | null | undefined,
    fetchedAt: string = new Date().toISOString()
  ): EtfMarketQuote {
    // P0-02: the observation instant is the moment the provider answered; freshness
    // is computed from it, never asserted.
    const observationMs = new Date(fetchedAt).getTime();
    const sym = (symbol || '').trim().toUpperCase();

    if (!raw || typeof raw !== 'object') {
      return {
        symbol: sym,
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
        foreignBuyVolume: null,
        foreignSellVolume: null,
        foreignRoom: null,
        source: 'VPS_ETF',
        sourceTimestamp: null,
        fetchedAt,
        dataFreshness: 'UNAVAILABLE',
      };
    }

    const lastPrice = normalizeVpsPrice(raw.lastPrice);
    const openPrice = normalizeVpsPrice(raw.openPrice);
    const highPrice = normalizeVpsPrice(raw.highPrice);
    const lowPrice = normalizeVpsPrice(raw.lowPrice);
    const refFromClose = normalizeVpsReferencePrice(raw.closePrice);
    const refFromR = normalizeVpsPrice(raw.r);
    const referencePrice = refFromClose ?? refFromR;
    const ceilingPrice = normalizeVpsPrice(raw.c);
    const floorPrice = normalizeVpsPrice(raw.f);

    if (lastPrice === null || lastPrice <= 0) {
      return {
        symbol: sym,
        price: null,
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        close: null,
        referencePrice,
        ceilingPrice,
        floorPrice,
        change: null,
        changePercent: null,
        volume: normalizeVpsLotVolume(raw.lot),
        tradingValue: null,
        foreignBuyVolume: normalizeVpsLotVolume(raw.fBVol),
        foreignSellVolume: normalizeVpsLotVolume(raw.fSVolume),
        foreignRoom: parseVpsNumeric(raw.fRoom),
        source: 'VPS_ETF',
        sourceTimestamp: null,
        fetchedAt,
        dataFreshness: 'UNAVAILABLE',
      };
    }

    const change = referencePrice !== null ? Math.round(lastPrice - referencePrice) : null;
    const changePercent = normalizeVpsPercent(raw.changePc);
    const volume = normalizeVpsLotVolume(raw.lot);

    // Approximate trading value from foreign buy/sell or avePrice * lot
    const avePrice = normalizeVpsPrice(raw.avePrice);
    const tradingValue =
      avePrice !== null && volume !== null ? Math.round(avePrice * volume) : null;

    return {
      symbol: typeof raw.sym === 'string' && raw.sym.trim() ? raw.sym.trim().toUpperCase() : sym,
      price: lastPrice,
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      close: lastPrice,
      referencePrice,
      ceilingPrice,
      floorPrice,
      change,
      changePercent,
      volume,
      tradingValue,
      foreignBuyVolume: normalizeVpsLotVolume(raw.fBVol),
      foreignSellVolume: normalizeVpsLotVolume(raw.fSVolume),
      foreignRoom: parseVpsNumeric(raw.fRoom),
      source: 'VPS_ETF',
      // P0-02: computed from the real observation timestamp, never asserted.
      sourceTimestamp: observationMs,
      fetchedAt,
      dataFreshness: resolveDataFreshness({
        sourceTimestamp: observationMs,
        ttlMs: QUOTE_FRESHNESS_TTL_MS,
      }).status,
    };
  }

  /**
   * Fetches real-time ETF quote from VPS.
   */
  public static async fetchRealtimeQuote(
    symbol: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<EtfMarketQuote> {
    const sym = (symbol || '').trim().toUpperCase();
    const fetchedAt = new Date().toISOString();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(`${VPS_QUOTE_URL}/${encodeURIComponent(sym)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        return this.normalizeQuote(sym, null, fetchedAt);
      }

      const data = (await resp.json()) as VpsRawQuote[];
      if (!Array.isArray(data) || data.length === 0) {
        return this.normalizeQuote(sym, null, fetchedAt);
      }

      return this.normalizeQuote(sym, data[0], fetchedAt);
    } catch {
      return this.normalizeQuote(sym, null, fetchedAt);
    }
  }

  /**
   * Fetches historical daily OHLCV bars from KBS.
   */
  public static async fetchHistoricalBars(
    symbol: string,
    startDate: string,
    endDate: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<CandlePoint[]> {
    try {
      const bars = await KbsHistoricalProvider.getDailyHistory(symbol, startDate, endDate, {
        timeoutMs,
      });
      return bars.map((b) => ({
        time: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
    } catch {
      return [];
    }
  }
}
