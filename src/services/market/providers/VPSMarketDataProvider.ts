import { MarketQuote, MarketDataStatus } from '../types';
import { FundamentalMetrics } from '../../../types/stockDetail';

export interface VPSQuoteRaw {
  id?: number;
  boardId?: string;
  marketId?: string;
  c?: number; // ceiling (in 1,000 VND)
  f?: number; // floor (in 1,000 VND)
  r?: number; // reference (in 1,000 VND)
  sym?: string;
  lastPrice?: number; // matched price (in 1,000 VND)
  lastVolume?: number;
  lot?: number; // total volume
  ot?: number; // change (in 1,000 VND)
  changePc?: number; // change %
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
    const refPrice = item.r != null && item.r > 0 ? Number((item.r * 1000).toFixed(0)) : 0;
    const lastPrice =
      item.lastPrice != null && item.lastPrice > 0
        ? Number((item.lastPrice * 1000).toFixed(0))
        : refPrice;
    const ceilingPrice = item.c != null && item.c > 0 ? Number((item.c * 1000).toFixed(0)) : undefined;
    const floorPrice = item.f != null && item.f > 0 ? Number((item.f * 1000).toFixed(0)) : undefined;
    const openPrice = item.openPrice != null && item.openPrice > 0 ? Number((item.openPrice * 1000).toFixed(0)) : refPrice;
    const highPrice = item.highPrice != null && item.highPrice > 0 ? Number((item.highPrice * 1000).toFixed(0)) : lastPrice;
    const lowPrice = item.lowPrice != null && item.lowPrice > 0 ? Number((item.lowPrice * 1000).toFixed(0)) : lastPrice;

    // Change in VND
    const change =
      item.ot != null ? Number((item.ot * 1000).toFixed(0)) : lastPrice - refPrice;
    const changePercent =
      item.changePc != null
        ? Number(item.changePc)
        : refPrice > 0
        ? Number((((lastPrice - refPrice) / refPrice) * 100).toFixed(2))
        : 0;

    const volume = item.lot != null ? Number(item.lot) : 0;
    const totalValue =
      item.avePrice != null && item.avePrice > 0 && volume > 0
        ? Number((item.avePrice * 1000 * volume).toFixed(0))
        : undefined;

    const status = this.calculateDataStatus();
    const nowIso = new Date().toISOString();

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
      dataStatus: status,
      fetchedAt: nowIso,
      freshnessMs: 0,
      marketTimestamp: nowIso,
      timestamp: Date.now(),
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
    if (!quotes.length || quotes[0].price <= 0) {
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

      // Extract key metrics from quarterly ratios (Value1 is newest quarter)
      const findRatioVal = (nameEn: string, fallbackName?: string): number => {
        const item = ratiosQuy.find(
          (r: any) =>
            (r.NameEn && r.NameEn.toLowerCase().includes(nameEn.toLowerCase())) ||
            (fallbackName && r.Name && r.Name.toLowerCase().includes(fallbackName.toLowerCase()))
        );
        return item && item.Value1 != null && !isNaN(Number(item.Value1)) ? Number(item.Value1) : 0;
      };

      const eps = findRatioVal('Trailing EPS', 'EPS');
      const bookValuePerShare = findRatioVal('Book value per share', 'BVPS');
      let pe = findRatioVal('P/E', 'P/E');
      const roe = findRatioVal('ROEA', 'ROE');
      const roa = findRatioVal('ROAA', 'ROA');
      const ros = findRatioVal('ROS', 'ROS');

      // Calculate PB
      let pb = 0;
      if (currentPrice && currentPrice > 0 && bookValuePerShare > 0) {
        pb = Number((currentPrice / bookValuePerShare).toFixed(2));
      } else if (bookValuePerShare > 0) {
        pb = findRatioVal('P/B', 'P/B');
      }

      // Re-derive PE from currentPrice / EPS if EPS > 0
      if (currentPrice && currentPrice > 0 && eps > 0) {
        pe = Number((currentPrice / eps).toFixed(2));
      }

      // Extract Balance Sheet & Income Statement values
      const findStatementVal = (list: any[], nameEn: string, fallbackName?: string): number => {
        const item = list.find(
          (r: any) =>
            (r.NameEn && r.NameEn.toLowerCase().includes(nameEn.toLowerCase())) ||
            (fallbackName && r.Name && r.Name.toLowerCase().includes(fallbackName.toLowerCase()))
        );
        return item && item.Value1 != null && !isNaN(Number(item.Value1)) ? Number(item.Value1) : 0;
      };

      const totalAssets = findStatementVal(balanceQuy, 'Total assets', 'Tổng tài sản');
      const liabilities = findStatementVal(balanceQuy, 'Liabilities', 'Nợ phải trả');
      const equity = findStatementVal(balanceQuy, "Owner's equity", 'Vốn chủ sở hữu');
      const netRevenue = findStatementVal(incomeQuy, 'Net revenue', 'Doanh thu thuần');
      const grossProfit = findStatementVal(incomeQuy, 'Gross profit', 'Lợi nhuận gộp');
      const netProfit = findStatementVal(incomeQuy, 'Net profit', 'LNST');

      const debtToEquity = equity > 0 ? Number((liabilities / equity).toFixed(2)) : 0;
      const netMargin = netRevenue > 0 ? Number(((netProfit / netRevenue) * 100).toFixed(2)) : 0;
      const grossMargin = netRevenue > 0 ? Number(((grossProfit / netRevenue) * 100).toFixed(2)) : 0;

      const metrics: FundamentalMetrics = {
        pe: pe || 0,
        pb: pb || 0,
        eps: eps || 0,
        roe: roe || 0,
        roa: roa || 0,
        dividendYield: 0,
        debtToEquity,
        revenueGrowthYoY: 0,
        profitGrowthYoY: 0,
        netMargin: netMargin || (ros > 0 ? ros : 0),
        grossMargin,
        sharesOutstanding: 0,
        marketCapBillion: 0,
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
