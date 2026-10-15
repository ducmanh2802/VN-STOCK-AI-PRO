import { StockSummary, TopMover, SectorHeatmapItem } from './stock';
import {
  IndexData,
  MarketStatus,
  AIMarketSummary,
  MarketSentiment,
  MarketBreadth,
  AITopSignal,
} from './market';

export interface MarketDataProvider {
  /**
   * Retrieves main indices overview (VN-INDEX, VN30, HNX, UPCOM)
   */
  getMarketIndices(): Promise<IndexData[]>;

  /**
   * Retrieves current market trading status (ĐANG GIAO DỊCH / ĐÓNG CỬA)
   */
  getMarketStatus(): Promise<MarketStatus>;

  /**
   * Retrieves market sentiment index, flow distribution, and momentum
   */
  getMarketSentiment(): Promise<MarketSentiment>;

  /**
   * Retrieves market breadth (advances, declines, volume breadth)
   */
  getMarketBreadth(): Promise<MarketBreadth>;

  /**
   * Retrieves quantitative AI top trading signals
   */
  getAITopSignals(): Promise<AITopSignal[]>;

  /**
   * Retrieves sector performance heatmap
   */
  getSectorHeatmap(): Promise<SectorHeatmapItem[]>;

  /**
   * Retrieves top gainers, losers, and highest liquidity movers
   */
  getTopMovers(): Promise<{
    gainers: TopMover[];
    losers: TopMover[];
    active: TopMover[];
  }>;

  /**
   * Retrieves user's watchlist stocks
   */
  getWatchlist(symbols?: string[]): Promise<StockSummary[]>;

  /**
   * Retrieves all stock summaries available in the market
   */
  getAllStocks(): Promise<StockSummary[]>;

  /**
   * Adds a ticker to the user's watchlist
   */
  addToWatchlist(symbol: string): Promise<boolean>;

  /**
   * Removes a ticker from the user's watchlist
   */
  removeFromWatchlist(symbol: string): Promise<boolean>;

  /**
   * Searches stocks by ticker or company name
   */
  searchStocks(query: string): Promise<StockSummary[]>;

  /**
   * Gets details for a single ticker
   */
  getStockDetail(symbol: string): Promise<StockSummary | null>;

  /**
   * Gets AI Market Analyst summary
   */
  getAIMarketSummary(): Promise<AIMarketSummary>;
}
