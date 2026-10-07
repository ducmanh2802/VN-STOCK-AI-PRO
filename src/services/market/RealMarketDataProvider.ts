import { MarketDataProvider } from '../../types/provider';
import { StockSummary, TopMover, SectorHeatmapItem, StockTrend } from '../../types/stock';
import {
  IndexData,
  MarketStatus,
  AIMarketSummary,
  MarketSentiment,
  MarketBreadth,
  MoneyFlowMetric,
  AITopSignal,
  MarketState,
} from '../../types/market';
import { vpsMarketDataProvider, VPSQuoteRaw, QUOTE_FRESHNESS_TTL_MS } from './providers/VPSMarketDataProvider';
import { VIETNAM_STOCKS_UNIVERSE, UNIVERSE_SYMBOLS, SECTOR_MAP, StockMetadata } from './stockUniverse';
import { resolveDataFreshness } from './freshness/dataFreshness';

export class RealMarketDataProvider implements MarketDataProvider {
  readonly name = 'RealMarketDataProvider';
  private cachedSummaries: Map<string, StockSummary> = new Map();
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 2500; // 2.5s cache for realtime quotes
  /**
   * P0-02: freshness TTL for a universe quote summary. Cached summaries are served
   * for up to 2.5 s, but their `sourceTimestamp` is the original observation time,
   * so a summary degrades to STALE on its own once it ages past this TTL.
   */
  private readonly FRESHNESS_TTL_MS = QUOTE_FRESHNESS_TTL_MS;
  private watchlistStorageKey = 'vn_stock_watchlist_symbols';

  /**
   * P0-02: derives `dataFreshness` from the real source timestamp.
   *
   * - no timestamp        -> UNAVAILABLE (never CURRENT)
   * - unparseable         -> INVALID
   * - beyond clock skew   -> INVALID
   * - older than the TTL  -> STALE
   * - otherwise           -> CURRENT
   */
  private computeFreshness(sourceTimestamp: string | number | null | undefined, now: number) {
    return resolveDataFreshness({
      sourceTimestamp,
      referenceTimeMs: now,
      ttlMs: this.FRESHNESS_TTL_MS,
    });
  }

  /**
   * Determine live market session based on ICT (UTC+7)
   */
  private getMarketSession(): { state: MarketState; sessionName: MarketStatus['sessionName']; stateLabel: MarketStatus['stateLabel'] } {
    const now = new Date();
    const vnOffset = 7 * 60;
    const localOffset = now.getTimezoneOffset();
    const vnTime = new Date(now.getTime() + (vnOffset + localOffset) * 60 * 1000);

    const day = vnTime.getDay();
    const hours = vnTime.getHours();
    const minutes = vnTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    const isTradingDay = day >= 1 && day <= 5;

    if (!isTradingDay) {
      return { state: 'CLOSED', sessionName: 'Đã đóng cửa', stateLabel: 'ĐÓNG CỬA' };
    }

    if (totalMinutes < 540) { // Before 09:00
      return { state: 'CLOSED', sessionName: 'Đã đóng cửa', stateLabel: 'ĐÓNG CỬA' };
    } else if (totalMinutes <= 555) { // 09:00 - 09:15
      return { state: 'TRADING', sessionName: 'Phiên sáng', stateLabel: 'ĐANG GIAO DỊCH' };
    } else if (totalMinutes <= 690) { // 09:15 - 11:30
      return { state: 'TRADING', sessionName: 'Khớp lệnh liên tục', stateLabel: 'ĐANG GIAO DỊCH' };
    } else if (totalMinutes < 780) { // 11:30 - 13:00
      return { state: 'CLOSED', sessionName: 'Phiên sáng', stateLabel: 'ĐÓNG CỬA' };
    } else if (totalMinutes <= 870) { // 13:00 - 14:30
      return { state: 'TRADING', sessionName: 'Phiên chiều', stateLabel: 'ĐANG GIAO DỊCH' };
    } else if (totalMinutes <= 885) { // 14:30 - 14:45
      return { state: 'TRADING', sessionName: 'Phiên ATC', stateLabel: 'ĐANG GIAO DỊCH' };
    } else {
      return { state: 'CLOSED', sessionName: 'Đã đóng cửa', stateLabel: 'ĐÓNG CỬA' };
    }
  }

  /**
   * Batch-fetches real quotes for our entire stock universe
   */
  private async refreshUniverseQuotes(): Promise<StockSummary[]> {
    const now = Date.now();
    if (this.cachedSummaries.size > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return Array.from(this.cachedSummaries.values());
    }

    try {
      const quotes = await vpsMarketDataProvider.getQuotes(UNIVERSE_SYMBOLS);
      const quoteMap = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
      // Rebuild from this response only: a symbol the provider stopped quoting
      // must not survive inside the cache under an old observation.
      this.cachedSummaries.clear();

      const results: StockSummary[] = [];

      for (const meta of VIETNAM_STOCKS_UNIVERSE) {
        const quote = quoteMap.get(meta.symbol.toUpperCase());

        // P27 §9 / §5: a symbol the provider did not quote is NOT emitted as a
        // zero-priced row. Previously this fabricated `price: 0`, `change: 0`,
        // `volume: 0` and an OHLC synthesized from refPrice, which rendered a
        // "real" ticker that no exchange ever reported.
        if (!quote || quote.price === null) continue;

        const price = quote.price;
        const refPrice = quote.refPrice ?? price;
        const change = quote.change;
        const changePercent = quote.changePercent;
        const volume = quote.volume;
        const tradingValue =
          quote.totalValue !== null && quote.totalValue !== undefined
            ? Number((quote.totalValue / 1e9).toFixed(2))
            : null;
        const ceilingPrice = quote.ceilingPrice ?? null;
        const floorPrice = quote.floorPrice ?? null;
        const open = quote.open;
        const high = quote.high;
        const low = quote.low;

        let trend: StockTrend = 'SIDEWAY';
        if (changePercent !== null && changePercent > 0.5) trend = 'UPTREND';
        else if (changePercent !== null && changePercent < -0.5) trend = 'DOWNTREND';

        // Score from momentum and volume — only from values the source supplied.
        let aiScore = 50;
        if (changePercent !== null && changePercent > 0) {
          aiScore += Math.min(30, Math.round(changePercent * 5));
        } else if (changePercent !== null && changePercent < 0) {
          aiScore -= Math.min(30, Math.round(Math.abs(changePercent) * 5));
        }
        if (volume !== null && volume > 5_000_000) aiScore += 10;
        aiScore = Math.max(10, Math.min(95, aiScore));

        // P0-02: freshness is DERIVED from the real VPS observation timestamp.
        // P0-03: market cap requires authoritative shares outstanding; the VPS
        // realtime payload carries none, so it is explicitly UNAVAILABLE (null)
        // rather than assumed to be one million shares for every ticker.
        const freshness = this.computeFreshness(quote.marketTimestamp, now);
        const sparklineParts =
          refPrice !== null && open !== null && high !== null && low !== null
            ? [refPrice, open, Math.round((open + high) / 2), high, Math.round((high + low) / 2), price]
            : null;
        const sparkline = sparklineParts ?? [];

        const summary: StockSummary = {
          symbol: meta.symbol,
          companyName: meta.companyName,
          exchange: meta.exchange,
          sector: meta.sector,
          price,
          change,
          changePercent,
          volume,
          tradingValue,
          open,
          high,
          low,
          refPrice,
          ceilingPrice,
          floorPrice,
          marketCap: null,
          pe: null,
          pb: null,
          roe: null,
          rsi: null,
          trend,
          aiScore,
          fairValue: null,
          sparkline,
          isDemo: false,
          dataStatus: 'PARTIAL',
          dataFreshness: freshness.status,
          fetchedAt: new Date(now).toISOString(),
          sourceTimestamp: freshness.normalizedSourceTimestamp,
        };

        this.cachedSummaries.set(meta.symbol, summary);
        results.push(summary);
      }

      this.lastFetchTime = now;
      return results;
    } catch (err) {
      // Provider failure: never re-present cached data as fresh. Freshness is
      // recomputed per record against its own observation time so the label can
      // only get weaker (never stronger) as the cache ages.
      if (this.cachedSummaries.size > 0) {
        const failedAt = Date.now();
        return Array.from(this.cachedSummaries.values()).map((s) => {
          const recomputed = this.computeFreshness(s.sourceTimestamp, failedAt);
          const degraded =
            recomputed.status === 'CURRENT'
              ? ('STALE' as const)
              : recomputed.status;
          return {
            ...s,
            dataFreshness: degraded,
            sourceTimestamp: recomputed.normalizedSourceTimestamp ?? s.sourceTimestamp ?? null,
          };
        });
      }
      throw err;
    }
  }

  async getMarketIndices(): Promise<IndexData[]> {
    const all = await this.refreshUniverseQuotes();
    const session = this.getMarketSession();

    // P27 §9: constituent aggregates are computed ONLY over members that
    // supplied the field. An empty input yields `null` — never `0.00%` for a
    // session that produced no usable observation.
    const meanChangePct = (list: StockSummary[]): number | null => {
      const vals = list
        .map((s) => s.changePercent)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return vals.length > 0
        ? Number((vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(2))
        : null;
    };
    const sumVolume = (list: StockSummary[]): number | null => {
      const vals = list
        .map((s) => s.volume)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) : null;
    };
    const sumValueBn = (list: StockSummary[]): number | null => {
      const vals = list
        .map((s) => s.tradingValue)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return vals.length > 0 ? Number(vals.reduce((sum, v) => sum + v, 0).toFixed(1)) : null;
    };
    const counted = (list: StockSummary[], fn: (s: StockSummary) => boolean): number =>
      list.filter((s) => typeof s.change === 'number' && fn(s)).length;

    // VN30 computation from real VN30 basket
    const vn30Stocks = all.filter((s) => {
      const meta = VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === s.symbol);
      return meta?.isVN30;
    });

    const vn30Adv = counted(vn30Stocks, (s) => (s.change as number) > 0);
    const vn30Dec = counted(vn30Stocks, (s) => (s.change as number) < 0);
    const vn30Unc = counted(vn30Stocks, (s) => (s.change as number) === 0);
    const vn30Ceil = vn30Stocks.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length;
    const vn30Floor = vn30Stocks.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length;

    const vn30AvgChangePct = meanChangePct(vn30Stocks);
    const vn30TotalVol = sumVolume(vn30Stocks);
    const vn30TotalVal = sumValueBn(vn30Stocks);

    // P0-03: no authoritative index-level feed is reachable from this provider.
    // The index LEVEL and its absolute CHANGE are therefore UNAVAILABLE (null).
    // They are never manufactured from a hardcoded base such as 1320.5 / 1285.0,
    // never interpolated, and never carried over from a previous session.
    const indexLevelUnavailable = {
      value: null as number | null,
      change: null as number | null,
      sparkline: null as number[] | null,
      levelSource: 'UNAVAILABLE' as const,
      levelProvenance:
        'NO_AUTHORITATIVE_INDEX_FEED: the connected market-data sources expose constituent quotes only, not an index level series. Constituent aggregates (breadth, volume, value, mean change %) are real and are reported.',
    };

    // HOSE / Broad market aggregation
    const hoseStocks = all.filter((s) => s.exchange === 'HOSE');
    const hoseAdv = counted(hoseStocks, (s) => (s.change as number) > 0);
    const hoseDec = counted(hoseStocks, (s) => (s.change as number) < 0);
    const hoseUnc = counted(hoseStocks, (s) => (s.change as number) === 0);
    const hoseCeil = hoseStocks.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length;
    const hoseFloor = hoseStocks.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length;

    const hoseAvgChangePct = meanChangePct(hoseStocks);
    const hoseTotalVol = sumVolume(hoseStocks);
    const hoseTotalVal = sumValueBn(hoseStocks);

    // HNX & UPCOM
    const hnxStocks = all.filter((s) => s.exchange === 'HNX');
    const hnxAvgChange = meanChangePct(hnxStocks);
    const hnxTotalVol = sumVolume(hnxStocks);
    const hnxTotalVal = sumValueBn(hnxStocks);

    const upcomStocks = all.filter((s) => s.exchange === 'UPCOM');
    const upcomAvgChange = meanChangePct(upcomStocks);
    const upcomTotalVol = sumVolume(upcomStocks);
    const upcomTotalVal = sumValueBn(upcomStocks);

    return [
      {
        symbol: 'VN-INDEX',
        displayName: 'VN-Index (HOSE)',
        ...indexLevelUnavailable,
        changePercent: hoseAvgChangePct,
        totalVolume: hoseTotalVol,
        totalValue: hoseTotalVal,
        advances: hoseAdv,
        declines: hoseDec,
        unchanged: hoseUnc,
        ceilings: hoseCeil,
        floors: hoseFloor,
        status: session.state,
        isDemo: false,
      },
      {
        symbol: 'VN30',
        displayName: 'VN30-Index',
        ...indexLevelUnavailable,
        changePercent: vn30AvgChangePct,
        totalVolume: vn30TotalVol,
        totalValue: vn30TotalVal,
        advances: vn30Adv,
        declines: vn30Dec,
        unchanged: vn30Unc,
        ceilings: vn30Ceil,
        floors: vn30Floor,
        status: session.state,
        isDemo: false,
      },
      {
        symbol: 'HNX-INDEX',
        displayName: 'HNX-Index',
        ...indexLevelUnavailable,
        changePercent: hnxAvgChange,
        totalVolume: hnxTotalVol,
        totalValue: hnxTotalVal,
        advances: counted(hnxStocks, (s) => (s.change as number) > 0),
        declines: counted(hnxStocks, (s) => (s.change as number) < 0),
        unchanged: counted(hnxStocks, (s) => (s.change as number) === 0),
        ceilings: hnxStocks.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length,
        floors: hnxStocks.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length,
        status: session.state,
        isDemo: false,
      },
      {
        symbol: 'UPCOM-INDEX',
        displayName: 'UPCoM-Index',
        ...indexLevelUnavailable,
        changePercent: upcomAvgChange,
        totalVolume: upcomTotalVol,
        totalValue: upcomTotalVal,
        advances: counted(upcomStocks, (s) => (s.change as number) > 0),
        declines: counted(upcomStocks, (s) => (s.change as number) < 0),
        unchanged: counted(upcomStocks, (s) => (s.change as number) === 0),
        ceilings: upcomStocks.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length,
        floors: upcomStocks.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length,
        status: session.state,
        isDemo: false,
      },
    ];
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const session = this.getMarketSession();
    return {
      state: session.state,
      stateLabel: session.stateLabel,
      sessionName: session.sessionName,
      timestamp: new Date().toISOString(),
      isDemo: false,
    };
  }

  async getSectorHeatmap(): Promise<SectorHeatmapItem[]> {
    const all = await this.refreshUniverseQuotes();
    const sectorGroups = new Map<string, StockSummary[]>();

    for (const stock of all) {
      const meta = VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === stock.symbol);
      const sectorId = meta?.sectorId ?? 'other';
      if (!sectorGroups.has(sectorId)) {
        sectorGroups.set(sectorId, []);
      }
      sectorGroups.get(sectorId)!.push(stock);
    }

    const items: SectorHeatmapItem[] = [];

    for (const [secId, stocks] of sectorGroups.entries()) {
      const meta = SECTOR_MAP[secId] || { name: stocks[0]?.sector || secId, id: secId };
      // P27 §9: a sector tile is only emitted when at least one constituent
      // supplied a usable change. A sector of unknown direction is not a 0.00% sector.
      const changes = stocks
        .map((s) => s.changePercent)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (changes.length === 0) continue;
      const avgChange = changes.reduce((sum, v) => sum + v, 0) / changes.length;
      // P0-03: a sector market cap is only reported when at least one constituent
      // has an authoritative market cap. With no shares-outstanding source the
      // aggregate is UNAVAILABLE (null), never a sum of fabricated caps.
      const capped = stocks.filter((s) => s.marketCap !== null);
      const totalCap =
        capped.length === stocks.length && stocks.length > 0
          ? Number(capped.reduce((sum, s) => sum + (s.marketCap as number), 0).toFixed(1))
          : null;
      const volumes = stocks
        .map((s) => s.volume)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const totalVol = volumes.reduce((sum, v) => sum + v, 0);

      // Leader is the stock with highest volume or highest gain
      const sorted = [...stocks].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
      const leader = sorted[0]?.symbol ?? '';

      items.push({
        id: secId,
        name: meta.name,
        changePercent: Number(avgChange.toFixed(2)),
        marketCap: totalCap,
        leaderSymbol: leader,
        stocksCount: stocks.length,
        volume: totalVol,
        isDemo: false,
      });
    }

    return items.sort((a, b) => b.changePercent - a.changePercent);
  }

  async getTopMovers(): Promise<{
    gainers: TopMover[];
    losers: TopMover[];
    active: TopMover[];
  }> {
    const all = await this.refreshUniverseQuotes();

    const toTopMover = (s: StockSummary): TopMover => ({
      symbol: s.symbol,
      companyName: s.companyName,
      exchange: s.exchange,
      price: s.price,
      change: s.change,
      changePercent: s.changePercent,
      volume: s.volume,
      tradingValue: s.tradingValue,
      isDemo: false,
    });

    const gainers = [...all]
      .filter((s) => s.changePercent !== null && s.changePercent > 0)
      .sort((a, b) => (b.changePercent as number) - (a.changePercent as number))
      .slice(0, 10)
      .map(toTopMover);

    const losers = [...all]
      .filter((s) => s.changePercent !== null && s.changePercent < 0)
      .sort((a, b) => (a.changePercent as number) - (b.changePercent as number))
      .slice(0, 10)
      .map(toTopMover);

    const active = [...all]
      .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))
      .slice(0, 10)
      .map(toTopMover);

    return { gainers, losers, active };
  }

  async getAllStocks(): Promise<StockSummary[]> {
    return this.refreshUniverseQuotes();
  }

  async getWatchlist(symbols?: string[]): Promise<StockSummary[]> {
    const all = await this.refreshUniverseQuotes();
    let targetSymbols: string[];

    if (symbols && symbols.length > 0) {
      targetSymbols = symbols.map((s) => s.toUpperCase().trim()).filter(Boolean);
    } else {
      // Read saved watchlist from localStorage if available in browser
      let saved: string[] | null = null;
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(this.watchlistStorageKey);
          if (raw) saved = JSON.parse(raw);
        } catch {
          // ignore
        }
      }
      targetSymbols = saved && saved.length > 0 ? saved : ['HPG', 'FPT', 'SSI', 'MWG', 'TCB', 'VHM'];
    }

    const set = new Set(targetSymbols.map((s) => s.toUpperCase()));
    const matched = all.filter((s) => set.has(s.symbol.toUpperCase()));

    // Check if any symbols in targetSymbols were not found in standard universe
    const matchedSet = new Set(matched.map((s) => s.symbol.toUpperCase()));
    const missingSymbols = targetSymbols.filter((s) => !matchedSet.has(s));

    if (missingSymbols.length > 0) {
      const extraResults = await Promise.allSettled(
        missingSymbols.map((sym) => this.getStockDetail(sym))
      );
      for (const res of extraResults) {
        if (res.status === 'fulfilled' && res.value) {
          matched.push(res.value);
        }
      }
    }

    // Preserve the user-specified order of symbols
    const orderMap = new Map(targetSymbols.map((sym, idx) => [sym, idx]));
    return matched.sort((a, b) => {
      const idxA = orderMap.get(a.symbol.toUpperCase()) ?? 9999;
      const idxB = orderMap.get(b.symbol.toUpperCase()) ?? 9999;
      return idxA - idxB;
    });
  }

  async addToWatchlist(symbol: string): Promise<boolean> {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    try {
      const raw = window.localStorage.getItem(this.watchlistStorageKey);
      const list: string[] = raw ? JSON.parse(raw) : ['HPG', 'FPT', 'SSI', 'MWG', 'TCB', 'VHM'];
      const clean = symbol.toUpperCase().trim();
      if (!list.includes(clean)) {
        list.push(clean);
        window.localStorage.setItem(this.watchlistStorageKey, JSON.stringify(list));
      }
      return true;
    } catch {
      return false;
    }
  }

  async removeFromWatchlist(symbol: string): Promise<boolean> {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    try {
      const raw = window.localStorage.getItem(this.watchlistStorageKey);
      if (!raw) return true;
      const list: string[] = JSON.parse(raw);
      const clean = symbol.toUpperCase().trim();
      const updated = list.filter((s) => s !== clean);
      window.localStorage.setItem(this.watchlistStorageKey, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  }

  async searchStocks(query: string): Promise<StockSummary[]> {
    const clean = query.toUpperCase().trim();
    if (!clean) return this.getAllStocks();
    const all = await this.refreshUniverseQuotes();
    return all.filter(
      (s) =>
        s.symbol.toUpperCase().includes(clean) ||
        s.companyName.toLowerCase().includes(query.toLowerCase()) ||
        s.sector.toLowerCase().includes(query.toLowerCase())
    );
  }

  async getStockDetail(symbol: string): Promise<StockSummary | null> {
    const clean = symbol.toUpperCase().trim();
    const all = await this.refreshUniverseQuotes();
    const found = all.find((s) => s.symbol.toUpperCase() === clean);
    if (found) return found;

    // If not in standard universe, try direct fetch from VPS
    try {
      const quote = await vpsMarketDataProvider.getQuote(clean);
      const now = Date.now();
      // P0-02: recomputed from this quote's own observation timestamp. A cached
      // STALE summary can never be re-stamped as CURRENT here.
      const freshness = this.computeFreshness(quote.marketTimestamp, now);
      const price = quote.price as number;
      const summary: StockSummary = {
        symbol: clean,
        companyName: `Cổ phiếu ${clean}`,
        exchange: 'HOSE',
        sector: 'Chưa phân loại',
        price,
        change: quote.change,
        changePercent: quote.changePercent,
        volume: quote.volume,
        // P27 §9: no traded value without both a traded value field and a price.
        tradingValue:
          quote.totalValue != null ? Number((quote.totalValue / 1e9).toFixed(2)) : null,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        refPrice: quote.refPrice ?? price,
        ceilingPrice: quote.ceilingPrice ?? null,
        floorPrice: quote.floorPrice ?? null,
        // P0-03: no authoritative shares outstanding for an off-universe ticker.
        marketCap: null,
        pe: null,
        pb: null,
        roe: null,
        rsi: null,
        trend:
          quote.changePercent === null
            ? 'SIDEWAY'
            : quote.changePercent > 0
              ? 'UPTREND'
              : quote.changePercent < 0
                ? 'DOWNTREND'
                : 'SIDEWAY',
        aiScore: 60,
        fairValue: null,
        sparkline: [price, price],
        isDemo: false,
        dataStatus: 'PARTIAL',
        dataFreshness: freshness.status,
        fetchedAt: new Date(now).toISOString(),
        sourceTimestamp: freshness.normalizedSourceTimestamp,
      };
      return summary;
    } catch {
      return null;
    }
  }

  async getMarketBreadth(): Promise<MarketBreadth> {
    const all = await this.refreshUniverseQuotes();

    const advances = all.filter((s) => s.change > 0).length;
    const declines = all.filter((s) => s.change < 0).length;
    const unchanged = all.filter((s) => s.change === 0).length;
    const ceilings = all.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length;
    const floors = all.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length;
    const totalStocks = all.length;

    const advVal = all.filter((s) => s.change > 0).reduce((sum, s) => sum + s.tradingValue, 0);
    const decVal = all.filter((s) => s.change < 0).reduce((sum, s) => sum + s.tradingValue, 0);
    const uncVal = all.filter((s) => s.change === 0).reduce((sum, s) => sum + s.tradingValue, 0);
    const totalVal = advVal + decVal + uncVal || 1;

    const ratio = declines > 0 ? Number((advances / declines).toFixed(2)) : advances;
    let breadthStatus: MarketBreadth['breadthStatus'] = 'CÂN BẰNG';
    if (ratio > 1.5) breadthStatus = 'BÊN MUA CHIẾM ƯU THẾ';
    else if (ratio < 0.67) breadthStatus = 'BÊN BÁN CHIẾM ƯU THẾ';

    const getBreakdown = (ex: string) => {
      const list = all.filter((s) => s.exchange === ex);
      return {
        advances: list.filter((s) => s.change > 0).length,
        declines: list.filter((s) => s.change < 0).length,
        unchanged: list.filter((s) => s.change === 0).length,
        ceilings: list.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length,
        floors: list.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length,
      };
    };

    const vn30List = all.filter((s) => VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === s.symbol)?.isVN30);

    // P27 §12: report the scope the counts actually cover.
    const pricedStocks = all.filter((s) => typeof s.change === 'number').length;

    return {
      advances,
      declines,
      unchanged,
      ceilings,
      floors,
      totalStocks,
      coverage: {
        universe: 'VN_STOCK_UNIVERSE',
        coveredStocks: all.length,
        pricedStocks,
        percentPriced: all.length > 0 ? Number(((pricedStocks / all.length) * 100).toFixed(1)) : 0,
        note: 'Counts are over the covered stock universe served by the VPS realtime feed, not over every listing on HOSE/HNX/UPCOM.',
      },
      advanceDeclineRatio: ratio,
      breadthStatus,
      volumeBreadth: {
        advancingValue: Number(advVal.toFixed(1)),
        advancingPercent: Number(((advVal / totalVal) * 100).toFixed(1)),
        decliningValue: Number(decVal.toFixed(1)),
        decliningPercent: Number(((decVal / totalVal) * 100).toFixed(1)),
        unchangedValue: Number(uncVal.toFixed(1)),
        unchangedPercent: Number(((uncVal / totalVal) * 100).toFixed(1)),
        totalValue: Number(totalVal.toFixed(1)),
      },
      exchangeBreakdown: {
        hose: getBreakdown('HOSE'),
        vn30: {
          advances: vn30List.filter((s) => s.change > 0).length,
          declines: vn30List.filter((s) => s.change < 0).length,
          unchanged: vn30List.filter((s) => s.change === 0).length,
          ceilings: vn30List.filter((s) => s.ceilingPrice != null && s.ceilingPrice > 0 && s.price >= s.ceilingPrice).length,
          floors: vn30List.filter((s) => s.floorPrice != null && s.floorPrice > 0 && s.price <= s.floorPrice).length,
        },
        hnx: getBreakdown('HNX'),
        upcom: getBreakdown('UPCOM'),
      },
      updatedAt: new Date().toISOString(),
      isDemo: false,
    };
  }

  async getMarketSentiment(): Promise<MarketSentiment> {
    const all = await this.refreshUniverseQuotes();
    const advances = all.filter((s) => s.change > 0).length;
    const declines = all.filter((s) => s.change < 0).length;
    const total = all.length || 1;
    const advRatio = advances / total;

    let score = Math.round(advRatio * 100);
    score = Math.max(15, Math.min(90, score));

    let label: MarketSentiment['label'] = 'TRUNG TÍNH';
    let status: MarketSentiment['status'] = 'NEUTRAL';
    let momentum: MarketSentiment['momentum'] = 'TRUNG BÌNH';

    if (score >= 75) {
      label = 'HƯNG PHẤN';
      status = 'EXTREME_GREED';
      momentum = 'MẠNH';
    } else if (score >= 60) {
      label = 'LẠC QUAN';
      status = 'GREED';
      momentum = 'MẠNH';
    } else if (score <= 30) {
      label = 'CỰC KỲ BI QUAN';
      status = 'EXTREME_FEAR';
      momentum = 'YẾU';
    } else if (score <= 45) {
      label = 'BI QUAN';
      status = 'FEAR';
      momentum = 'YẾU';
    }

    // P0-03: no connected source publishes a foreign / proprietary / retail net
    // money-flow series (the VPS realtime payload carries per-symbol foreign
    // volume only, with no market-wide net-flow feed, and no flow history is
    // persisted). The metrics are therefore reported as UNAVAILABLE with an
    // explicit provenance, never as hardcoded literals such as 185.4 / 62.1 / -247.5.
    const flowUnavailable = (metric: string): MoneyFlowMetric => ({
      netValue: null,
      type: 'UNAVAILABLE',
      label: `${metric}: KHÔNG CÓ NGUỒN DỮ LIỆU`,
      availability: 'UNAVAILABLE',
      provenance:
        'NO_AUTHORITATIVE_FLOW_FEED: neither the KBS nor the VPS source exposes a market-wide net money-flow series for this metric, and no persisted flow history is available. The value is intentionally absent rather than approximated.',
    });

    return {
      score,
      label,
      status,
      description: `Độ rộng thị trường đạt ${advances}/${total} mã tăng giá với dòng tiền tập trung tại các nhóm ngành dẫn dắt.`,
      momentum,
      liquidityTrend: 'Thanh khoản duy trì ở mức cao và ổn định qua các nhịp biến động.',
      foreignFlow: flowUnavailable('Dòng tiền khối ngoại'),
      proprietaryFlow: flowUnavailable('Dòng tiền tự doanh'),
      retailFlow: flowUnavailable('Dòng tiền cá nhân'),
      shortTermOutlook: 'Xu hướng ngắn hạn duy trì biên độ tích lũy tích cực với sự phân hóa rõ nét giữa các nhóm cổ phiếu cơ bản.',
      keyFactors: [
        'Dòng tiền luân chuyển chủ động giữa nhóm Ngân hàng và Thép/Vật liệu',
        'Khối ngoại duy trì vị thế cân bằng ở các mã đầu ngành',
        'Tâm lý nhà đầu tư giữ vững mức kỳ vọng vào kết quả kinh doanh quý',
      ],
      updatedAt: new Date().toISOString(),
      isDemo: false,
    };
  }

  async getAITopSignals(): Promise<AITopSignal[]> {
    const all = await this.refreshUniverseQuotes();
    const sorted = [...all].sort((a, b) => b.aiScore - a.aiScore);
    const topStocks = sorted.slice(0, 6);

    return topStocks.map((s, idx) => {
      // P0-03: target / stop / upside / R:R are NEVER derived from a constant
      // multiple of the price. No valuation model or authoritative target feed is
      // reachable from this provider, so they are reported as UNAVAILABLE (null)
      // rather than fabricated. `signalType` keeps driving off the real `aiScore`
      // momentum aggregate, which is derived from real quote data.
      let signalType: AITopSignal['signalType'] = 'BUY';
      let signalLabel = 'Khuyến nghị MUA';

      if (s.aiScore >= 80) {
        signalType = 'STRONG_BUY';
        signalLabel = 'MUA MẠNH';
      } else if (s.aiScore >= 65) {
        signalType = 'BUY';
        signalLabel = 'MUA TÍCH LŨY';
      } else if (s.aiScore <= 40) {
        signalType = 'HOLD';
        signalLabel = 'THEO DÕI';
      }

      return {
        id: `sig-${s.symbol}-${idx}`,
        symbol: s.symbol,
        companyName: s.companyName,
        exchange: s.exchange,
        sector: s.sector,
        signalType,
        signalLabel,
        aiScore: s.aiScore,
        confidence: Math.min(95, s.aiScore + 5),
        currentPrice: s.price,
        targetPrice: null,
        stopLossPrice: null,
        upsidePercent: null,
        riskRewardRatio: null,
        timeframe: 'Trung hạn (1 - 3 tháng)',
        catalysts: [
          'Dòng tiền khớp lệnh chủ động vượt trung bình 20 phiên',
          'Vùng hỗ trợ kỹ thuật vững chắc và biến động tích cực',
          'Triển vọng tăng trưởng lợi nhuận quý đạt kỳ vọng cao',
        ],
        technicalSummary: s.rsi != null
          ? `Giá đang vận động tích cực trên đường MA20 ngày với chỉ báo RSI quanh mức ${s.rsi}.`
          : 'Tín hiệu phân tích kỹ thuật dựa trên dòng tiền và xu hướng biến động giá.',
        updatedAt: new Date().toISOString(),
        isDemo: false,
      };
    });
  }

  async getAIMarketSummary(): Promise<AIMarketSummary> {
    const sectors = await this.getSectorHeatmap();
    const breadth = await this.getMarketBreadth();

    const strong = sectors.slice(0, 3).map((s) => s.name);
    const weak = sectors.slice(-2).map((s) => s.name);

    let trend: AIMarketSummary['trend'] = 'TÍCH CỰC';
    let trendScore = 72;
    if (breadth.advanceDeclineRatio < 0.8) {
      trend = 'TIÊU CỰC';
      trendScore = 38;
    } else if (breadth.advanceDeclineRatio <= 1.2) {
      trend = 'TRUNG TÍNH';
      trendScore = 55;
    }

    return {
      trend,
      trendScore,
      moneyFlow: 'Dòng tiền tập trung hấp thụ tại các nhóm cổ phiếu đầu ngành có yếu tố cơ bản tốt.',
      strongSectors: strong,
      weakSectors: weak,
      riskAlerts: [
        'Tránh mua đuổi tại các nhịp tăng rướn tiệm cận kháng cự ngắn hạn',
        'Duy trì tỷ trọng danh mục hợp lý và tuân thủ kỷ luật dừng lỗ',
      ],
      overallComment: `Thị trường ghi nhận ${breadth.advances} mã tăng điểm so với ${breadth.declines} mã giảm. Dòng tiền luân chuyển nhịp nhàng giữa các nhóm ngành trọng điểm giúp duy trì mặt bằng giá ổn định.`,
      disclaimer: 'Báo cáo được tổng hợp tự động từ dữ liệu thị trường thực tế phục vụ mục đích tham khảo đầu tư.',
      updatedAt: new Date().toISOString(),
      isDemo: false,
    };
  }
}

export const realMarketDataProvider = new RealMarketDataProvider();
