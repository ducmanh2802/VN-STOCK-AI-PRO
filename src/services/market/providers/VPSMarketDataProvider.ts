import { MarketQuote, MarketDataStatus } from '../types';
import { FundamentalMetrics } from '../../../types/stockDetail';
import { resolveDataFreshness } from '../freshness/dataFreshness';
import { normalizeVpsLotVolume } from './vps/normalize.ts';

/**
 * TTL for a VPS realtime quote observation, in ms. Matches the 120 s staleness
 * guard used by the trading risk layer (`DEFAULT_RISK_CONFIG.maxStaleTimeMs`).
 */
export const QUOTE_FRESHNESS_TTL_MS = 120_000;

export interface VPSQuoteRaw {
  id?: number;
  boardId?: string;
  marketId?: string;
  c?: number; // ceiling (in 1,000 VND)
  f?: number; // floor (in 1,000 VND)
  r?: number; // reference (in 1,000 VND)
  closePrice?: number | string; // reference / previous close, already in VND
  sym?: string;
  lastPrice?: number; // matched price (in 1,000 VND)
  lastVolume?: number;
  lot?: number; // accumulated matched volume in LOTS (1 lot = 10 shares)
  // P27 §9: `ot` and `changePc` are MAGNITUDES — the live feed reports them
  // positive for declining symbols too (verified 2026-10-07: 68/68 rows positive
  // while 38 of the same symbols closed down per KBS candles). They are never
  // used to decide the direction of a move.
  ot?: number | string; // absolute change (in 1,000 VND)
  changePc?: number | string; // absolute change %
  avePrice?: number;
  highPrice?: number;
  lowPrice?: number;
  openPrice?: number;
  fBVol?: number;
  fSVolume?: number;
  fRoom?: number;
}

export interface VPSBaseInfoRaw {
  symbol: string;
  coban?: Record<string, any>;
  ttQuy?: any[];
  ketquaKDQuy?: any[];
  candoiKTQuy?: any[];
  chisoTCQuy?: any[];
  ttNam?: any[];
  ketquaKDNam?: any[];
  candoiKTNam?: any[];
  chisoTCNam?: any[];
}

export interface NormalizedVPSFundamentals {
  symbol: string;
  dataSource: 'VPS';
  dataStatus: 'OK' | 'DATA_UNAVAILABLE';
  fetchedAt: string;
  metrics: FundamentalMetrics;
  raw?: VPSBaseInfoRaw;
}

export class VPSMarketDataProvider {
  readonly name = 'VPS' as const;
  private readonly baseUrl = 'https://bgapidatafeed.vps.com.vn';
  private readonly timeoutMs = 5000;

  private readonly defaultHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  };

  /**
   * Calculates market data status based on Vietnam trading hours (09:00 - 15:00 UTC+7)
   */
  private calculateDataStatus(): MarketDataStatus {
    const now = new Date();
    const vnOffset = 7 * 60;
    const localOffset = now.getTimezoneOffset();
    const vnTime = new Date(now.getTime() + (vnOffset + localOffset) * 60 * 1000);

    const day = vnTime.getDay();
    const hours = vnTime.getHours();
    const minutes = vnTime.getMinutes();
    const timeInMins = hours * 60 + minutes;

    const isTradingDay = day >= 1 && day <= 5;
    // Morning: 09:00 - 11:30 (540 - 690), Afternoon: 13:00 - 15:00 (780 - 900)
    const isTradingHours =
      (timeInMins >= 540 && timeInMins <= 690) || (timeInMins >= 780 && timeInMins <= 900);

    if (isTradingDay && isTradingHours) {
      return 'LIVE';
    }
    return 'HISTORICAL';
  }

  /**
   * Health check for VPS service
   */
  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.baseUrl}/getliststockdata/HPG`, {
        headers: this.defaultHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!res.ok) return false;

      const data = await res.json();
      return Array.isArray(data) && data.length > 0 && data[0]?.sym === 'HPG';
    } catch {
      return false;
    }
  }

  /**
   * Normalizes a raw VPS stock quote record.
   * Prices from VPS are in 1,000 VND units (e.g. 21.55 = 21,550 VND).
   */
  normalizeQuote(item: VPSQuoteRaw): MarketQuote {
    const sym = (item.sym || '').toUpperCase().trim();

    // P27 §9: a field the payload did not carry is `null`, never a substitute
    // copied from a neighbouring field. `refPrice -> lastPrice`, `lastPrice ->
    // high/low` and `?? 0` were silent fabrications: they produced a plausible
    // OHLC that no exchange ever reported.
    //
    // Reference / previous close. `r` (kVND) is the exchange reference price and
    // is the only field that is consistent across the whole universe: it is
    // present on 68/68 rows and satisfies |lastPrice - r| == ot for 68/68 rows
    // (verified live 2026-10-07). `closePrice` (VND) agrees for 65/68 rows only —
    // MWG/KDH/GMD carry a stale value there — so it is a fallback, never first.
    const refFromR = item.r != null && item.r > 0 ? Number((item.r * 1000).toFixed(0)) : null;
    const refFromClose = item.closePrice != null ? Number(item.closePrice) : Number.NaN;
    const refPrice =
      refFromR ??
      (Number.isFinite(refFromClose) && refFromClose > 0 ? Math.round(refFromClose) : null);
    const lastPrice =
      item.lastPrice != null && item.lastPrice > 0 ? Number((item.lastPrice * 1000).toFixed(0)) : null;
    const ceilingPrice = item.c != null && item.c > 0 ? Number((item.c * 1000).toFixed(0)) : null;
    const floorPrice = item.f != null && item.f > 0 ? Number((item.f * 1000).toFixed(0)) : null;
    const openPrice = item.openPrice != null && item.openPrice > 0 ? Number((item.openPrice * 1000).toFixed(0)) : null;
    const highPrice = item.highPrice != null && item.highPrice > 0 ? Number((item.highPrice * 1000).toFixed(0)) : null;
    const lowPrice = item.lowPrice != null && item.lowPrice > 0 ? Number((item.lowPrice * 1000).toFixed(0)) : null;

    // P27 §9: DIRECTION IS DERIVED FROM REAL PRICES ONLY.
    // The vendor's `ot` / `changePc` are unsigned magnitudes (verified live on
    // 2026-10-07: every one of the 68 universe rows reported a POSITIVE value,
    // while KBS candles showed 38 of those symbols closing DOWN). Trusting them
    // fabricated an all-green market, flipped `trend`/`aiScore`, and made the
    // index ribbon report 57 advances and 0 declines on a day with real
    // decliners. Without both prices the direction is unknowable, so it is null.
    const change = lastPrice !== null && refPrice !== null ? lastPrice - refPrice : null;
    const changePercent =
      lastPrice !== null && refPrice !== null && refPrice > 0
        ? Number((((lastPrice - refPrice) / refPrice) * 100).toFixed(2))
        : null;

    // VPS publishes `lot` in LOTS (1 lot = 10 shares). Treating it as shares
    // understated every volume by 10x and every turnover by 10x — the index
    // ribbon reported GT 981 tỷ for a session that really matched ~9,810 tỷ,
    // and the aiScore volume gate (>5M shares) never fired. `normalizeVpsLotVolume`
    // is the same verified conversion (lot x10 == KBS share volume) the
    // single-symbol provider already uses.
    const volume = normalizeVpsLotVolume(item.lot);
    // Turnover is DERIVED: VWAP(avePrice, kVND -> VND) x matched shares. This is
    // the same derivation the board provider documents; without both inputs the
    // field stays null and the UI renders `—`, never 0.
    const totalValue =
      item.avePrice != null && item.avePrice > 0 && volume !== null && volume > 0
        ? Math.round(item.avePrice * 1000 * volume)
        : null;

    const status = this.calculateDataStatus();
    const nowIso = new Date().toISOString();
    // P0-02: the VPS realtime payload carries no exchange-side timestamp, so the
    // authoritative observation time for this record is the moment it was received
    // from the source. Freshness is *computed* from it — never hardcoded to zero.
    const observationMs = new Date(nowIso).getTime();
    const freshness = resolveDataFreshness({
      sourceTimestamp: nowIso,
      referenceTimeMs: observationMs,
      ttlMs: QUOTE_FRESHNESS_TTL_MS,
    });

    return {
      symbol: sym,
      price: lastPrice,
      previousClose: refPrice,
      open: openPrice,
      high: highPrice,
      low: lowPrice,
      change,
      changePercent,
      volume,
      value: totalValue,
      totalValue,
      ceilingPrice,
      floorPrice,
      refPrice,
      source: 'VPS',
      status,
      // P27 §9: a payload with no usable price is UNAVAILABLE, not "LIVE".
      dataStatus: lastPrice === null ? 'UNAVAILABLE' : status,
      fetchedAt: nowIso,
      freshnessMs: freshness.ageMs ?? null,
      marketTimestamp: freshness.normalizedSourceTimestamp,
      timestamp: observationMs,
    };
  }

  /**
   * Fetch realtime quote for a single symbol
   */
  async getQuote(symbol: string): Promise<MarketQuote> {
    const clean = symbol.toUpperCase().trim();
    if (!/^[A-Z0-9]{3,10}$/.test(clean)) {
      throw new Error(`INVALID_SYMBOL: Mã cổ phiếu không hợp lệ: ${symbol}`);
    }

    const quotes = await this.getQuotes([clean]);
    if (!quotes.length || quotes[0].price === null || quotes[0].price <= 0) {
      throw new Error(`DATA_UNAVAILABLE: [VPS] Không tìm thấy dữ liệu báo giá cho mã ${clean}`);
    }
    return quotes[0];
  }

  /**
   * Fetch realtime quotes for multiple symbols
   */
  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    if (!symbols.length) return [];

    const cleanSymbols = symbols
      .map((s) => s.toUpperCase().trim())
      .filter((s) => /^[A-Z0-9]{3,10}$/.test(s));

    if (!cleanSymbols.length) return [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const symbolParam = cleanSymbols.join(',');
      const res = await fetch(`${this.baseUrl}/getliststockdata/${symbolParam}`, {
        headers: this.defaultHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`DATA_UNAVAILABLE: [VPS] HTTP ${res.status} khi lấy dữ liệu ${symbolParam}`);
      }

      const rawData: VPSQuoteRaw[] = await res.json();
      if (!Array.isArray(rawData)) {
        return [];
      }

      return rawData
        .filter((item) => item.sym && cleanSymbols.includes(item.sym.toUpperCase()))
        .map((item) => this.normalizeQuote(item));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`DATA_UNAVAILABLE: [VPS] Quá thời gian chờ phản hồi (timeout)`);
      }
      throw err;
    }
  }

  /**
   * Fetch and normalize company fundamental data from VPS
   * Endpoint: /getliststockbaseinfo/{SYMBOL}
   */
  async getFundamentals(symbol: string, currentPrice?: number): Promise<NormalizedVPSFundamentals> {
    const clean = symbol.toUpperCase().trim();
    if (!/^[A-Z0-9]{3,10}$/.test(clean)) {
      throw new Error(`INVALID_SYMBOL: Mã cổ phiếu không hợp lệ: ${symbol}`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.baseUrl}/getliststockbaseinfo/${clean}`, {
        headers: this.defaultHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`DATA_UNAVAILABLE: [VPS] HTTP ${res.status} khi lấy thông tin cơ bản ${clean}`);
      }

      const text = await res.text();
      if (!text || text.trim() === '') {
        throw new Error(`DATA_UNAVAILABLE: [VPS] Không có dữ liệu tài chính cho mã ${clean}`);
      }

      let data: VPSBaseInfoRaw;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`DATA_UNAVAILABLE: [VPS] Dữ liệu tài chính không hợp lệ cho mã ${clean}`);
      }

      if (!data || !data.symbol) {
        throw new Error(`DATA_UNAVAILABLE: [VPS] Không tìm thấy báo cáo tài chính cho ${clean}`);
      }

      const ratiosQuy = Array.isArray(data.chisoTCQuy) ? data.chisoTCQuy : [];
      const balanceQuy = Array.isArray(data.candoiKTQuy) ? data.candoiKTQuy : [];
      const incomeQuy = Array.isArray(data.ketquaKDQuy) ? data.ketquaKDQuy : [];

      // Extract key metrics from quarterly ratios (Value1 is newest quarter).
      // P27 §9: `null` means the ratio is absent from the payload — a missing P/E
      // must never be presented as `0`.
      const findRatioVal = (nameEn: string, fallbackName?: string): number | null => {
        const item = ratiosQuy.find(
          (r: any) =>
            (r.NameEn && r.NameEn.toLowerCase().includes(nameEn.toLowerCase())) ||
            (fallbackName && r.Name && r.Name.toLowerCase().includes(fallbackName.toLowerCase()))
        );
        return item && item.Value1 != null && !isNaN(Number(item.Value1)) ? Number(item.Value1) : null;
      };

      const eps = findRatioVal('Trailing EPS', 'EPS');
      const bookValuePerShare = findRatioVal('Book value per share', 'BVPS');
      let pe = findRatioVal('P/E', 'P/E');
      const roe = findRatioVal('ROEA', 'ROE');
      const roa = findRatioVal('ROAA', 'ROA');
      const ros = findRatioVal('ROS', 'ROS');

      // Calculate PB from two real inputs only; otherwise fall back to the
      // vendor's own P/B, and otherwise stay null.
      let pb: number | null = null;
      if (currentPrice && currentPrice > 0 && bookValuePerShare !== null && bookValuePerShare > 0) {
        pb = Number((currentPrice / bookValuePerShare).toFixed(2));
      } else {
        pb = findRatioVal('P/B', 'P/B');
      }

      // Re-derive PE from currentPrice / EPS if EPS > 0
      if (currentPrice && currentPrice > 0 && eps !== null && eps > 0) {
        pe = Number((currentPrice / eps).toFixed(2));
      }

      // Extract Balance Sheet & Income Statement values
      const findStatementVal = (list: any[], nameEn: string, fallbackName?: string): number | null => {
        const item = list.find(
          (r: any) =>
            (r.NameEn && r.NameEn.toLowerCase().includes(nameEn.toLowerCase())) ||
            (fallbackName && r.Name && r.Name.toLowerCase().includes(fallbackName.toLowerCase()))
        );
        return item && item.Value1 != null && !isNaN(Number(item.Value1)) ? Number(item.Value1) : null;
      };

      const totalAssets = findStatementVal(balanceQuy, 'Total assets', 'Tổng tài sản');
      const liabilities = findStatementVal(balanceQuy, 'Liabilities', 'Nợ phải trả');
      const equity = findStatementVal(balanceQuy, "Owner's equity", 'Vốn chủ sở hữu');
      const netRevenue = findStatementVal(incomeQuy, 'Net revenue', 'Doanh thu thuần');
      const grossProfit = findStatementVal(incomeQuy, 'Gross profit', 'Lợi nhuận gộp');
      const netProfit = findStatementVal(incomeQuy, 'Net profit', 'LNST');

      const debtToEquity =
        equity !== null && equity > 0 && liabilities !== null
          ? Number((liabilities / equity).toFixed(2))
          : null;
      const netMargin =
        netRevenue !== null && netRevenue > 0 && netProfit !== null
          ? Number(((netProfit / netRevenue) * 100).toFixed(2))
          : null;
      const grossMargin =
        netRevenue !== null && netRevenue > 0 && grossProfit !== null
          ? Number(((grossProfit / netRevenue) * 100).toFixed(2))
          : null;

      const metrics: FundamentalMetrics = {
        pe,
        pb,
        eps,
        roe,
        roa,
        // P27 §9: the VPS base-info payload carries no dividend/growth series, so
        // these are UNAVAILABLE (null) instead of a fabricated 0%.
        dividendYield: null,
        debtToEquity,
        revenueGrowthYoY: null,
        profitGrowthYoY: null,
        netMargin: netMargin ?? ros,
        grossMargin,
        // P0-03: the VPS base-info payload exposes no shares-outstanding field and
        // no market-cap field. Reporting `0` here would render a fabricated zero as a
        // financial value, so both are explicitly UNAVAILABLE (null).
        sharesOutstanding: null,
        marketCapBillion: null,
      };

      return {
        symbol: clean,
        dataSource: 'VPS',
        dataStatus: 'OK',
        fetchedAt: new Date().toISOString(),
        metrics,
        raw: data,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`DATA_UNAVAILABLE: [VPS] Quá thời gian chờ phản hồi báo cáo tài chính`);
      }
      throw err;
    }
  }
}

export const vpsMarketDataProvider = new VPSMarketDataProvider();
