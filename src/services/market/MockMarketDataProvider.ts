import { MarketDataProvider } from '../../types/provider';
import { StockSummary, TopMover, SectorHeatmapItem } from '../../types/stock';
import {
  IndexData,
  MarketStatus,
  AIMarketSummary,
  MarketSentiment,
  MarketBreadth,
  AITopSignal,
} from '../../types/market';
import {
  MOCK_INDICES,
  MOCK_MARKET_STATUS,
  MOCK_SECTORS,
  MOCK_STOCKS_DATABASE,
  MOCK_TOP_GAINERS,
  MOCK_TOP_LOSERS,
  MOCK_TOP_ACTIVE,
  DEFAULT_WATCHLIST_SYMBOLS,
  MOCK_AI_MARKET_SUMMARY,
  MOCK_MARKET_SENTIMENT,
  MOCK_MARKET_BREADTH,
  MOCK_AI_TOP_SIGNALS,
} from '../../data/mock/marketData';

const WATCHLIST_STORAGE_KEY = 'vn_stock_ai_watchlist';

export class MockMarketDataProvider implements MarketDataProvider {
  private watchlistSymbols: string[];

  constructor() {
    this.watchlistSymbols = this.loadWatchlistFromStorage();
  }

  private loadWatchlistFromStorage(): string[] {
    try {
      const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors (e.g. sandboxed iframe or private browsing)
    }
    return [...DEFAULT_WATCHLIST_SYMBOLS];
  }

  private saveWatchlistToStorage(): void {
    try {
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(this.watchlistSymbols));
    } catch {
      // Ignore
    }
  }

  async getMarketIndices(): Promise<IndexData[]> {
    // Return mock indices
    return [...MOCK_INDICES];
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return { ...MOCK_MARKET_STATUS };
  }

  async getSectorHeatmap(): Promise<SectorHeatmapItem[]> {
    return [...MOCK_SECTORS];
  }

  async getTopMovers(): Promise<{
    gainers: TopMover[];
    losers: TopMover[];
    active: TopMover[];
  }> {
    return {
      gainers: [...MOCK_TOP_GAINERS],
      losers: [...MOCK_TOP_LOSERS],
      active: [...MOCK_TOP_ACTIVE],
    };
  }

  async getWatchlist(symbols?: string[]): Promise<StockSummary[]> {
    const list: StockSummary[] = [];
    const targetSymbols = symbols && symbols.length > 0 ? symbols : this.watchlistSymbols;
    for (const sym of targetSymbols) {
      if (MOCK_STOCKS_DATABASE[sym]) {
        list.push(MOCK_STOCKS_DATABASE[sym]);
      }
    }
    return list;
  }

  async getAllStocks(): Promise<StockSummary[]> {
    return Object.values(MOCK_STOCKS_DATABASE);
  }

  async addToWatchlist(symbol: string): Promise<boolean> {
    const normalized = symbol.toUpperCase().trim();
    if (!this.watchlistSymbols.includes(normalized)) {
      this.watchlistSymbols.push(normalized);
      this.saveWatchlistToStorage();
      return true;
    }
    return false;
  }

  async removeFromWatchlist(symbol: string): Promise<boolean> {
    const normalized = symbol.toUpperCase().trim();
    const index = this.watchlistSymbols.indexOf(normalized);
    if (index > -1) {
      this.watchlistSymbols.splice(index, 1);
      this.saveWatchlistToStorage();
      return true;
    }
    return false;
  }

  async searchStocks(query: string): Promise<StockSummary[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    
    return Object.values(MOCK_STOCKS_DATABASE).filter(
      (stock) =>
        stock.symbol.toUpperCase().includes(q) ||
        stock.companyName.toUpperCase().includes(q) ||
        stock.sector.toUpperCase().includes(q)
    );
  }

  async getStockDetail(symbol: string): Promise<StockSummary | null> {
    const normalized = symbol.toUpperCase().trim();
    return MOCK_STOCKS_DATABASE[normalized] || null;
  }

  async getAIMarketSummary(): Promise<AIMarketSummary> {
    return { ...MOCK_AI_MARKET_SUMMARY };
  }

  async getMarketSentiment(): Promise<MarketSentiment> {
    return { ...MOCK_MARKET_SENTIMENT };
  }

  async getMarketBreadth(): Promise<MarketBreadth> {
    return { ...MOCK_MARKET_BREADTH };
  }

  async getAITopSignals(): Promise<AITopSignal[]> {
    return [...MOCK_AI_TOP_SIGNALS];
  }
}
