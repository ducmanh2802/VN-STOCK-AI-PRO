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
import { MockMarketDataProvider } from './MockMarketDataProvider';
import { marketDataService } from './MarketDataService';

export class RealMarketDataProvider implements MarketDataProvider {
  private fallbackProvider = new MockMarketDataProvider();

  async getMarketIndices(): Promise<IndexData[]> {
    try {
      const quotes = await marketDataService.getIndices();
      if (quotes && quotes.length > 0) {
        return quotes.map((q) => {
          let symbol: IndexData['symbol'] = 'VN-INDEX';
          if (q.symbol.includes('30')) symbol = 'VN30';
          else if (q.symbol.includes('HNX')) symbol = 'HNX-INDEX';
          else if (q.symbol.includes('UPCOM')) symbol = 'UPCOM-INDEX';

          return {
            symbol,
            displayName: q.symbol,
            value: q.price,
            change: q.change ?? 0,
            changePercent: q.changePercent ?? 0,
            totalVolume: q.volume ?? 0,
            totalValue: q.value ?? 0,
            advances: 0,
            declines: 0,
            unchanged: 0,
            ceilings: 0,
            floors: 0,
            status: 'TRADING',
            sparkline: [q.price],
          };
        });
      }
    } catch {
      // Fallback
    }
    return this.fallbackProvider.getMarketIndices();
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return this.fallbackProvider.getMarketStatus();
  }

  async getMarketSentiment(): Promise<MarketSentiment> {
    return this.fallbackProvider.getMarketSentiment();
  }

  async getMarketBreadth(): Promise<MarketBreadth> {
    return this.fallbackProvider.getMarketBreadth();
  }

  async getAITopSignals(): Promise<AITopSignal[]> {
    return this.fallbackProvider.getAITopSignals();
  }

  async getSectorHeatmap(): Promise<SectorHeatmapItem[]> {
    return this.fallbackProvider.getSectorHeatmap();
  }

  async getTopMovers(): Promise<{
    gainers: TopMover[];
    losers: TopMover[];
    active: TopMover[];
  }> {
    return this.fallbackProvider.getTopMovers();
  }

  async getWatchlist(symbols?: string[]): Promise<StockSummary[]> {
    return this.fallbackProvider.getWatchlist(symbols);
  }

  async getAllStocks(): Promise<StockSummary[]> {
    return this.fallbackProvider.getAllStocks();
  }

  async addToWatchlist(symbol: string): Promise<boolean> {
    return this.fallbackProvider.addToWatchlist(symbol);
  }

  async removeFromWatchlist(symbol: string): Promise<boolean> {
    return this.fallbackProvider.removeFromWatchlist(symbol);
  }

  async searchStocks(query: string): Promise<StockSummary[]> {
    return this.fallbackProvider.searchStocks(query);
  }

  async getStockDetail(symbol: string): Promise<StockSummary | null> {
    try {
      const quote = await marketDataService.getQuote(symbol);
      if (quote && quote.price > 0) {
        const fallback = await this.fallbackProvider.getStockDetail(symbol);
        if (fallback) {
          return {
            ...fallback,
            price: quote.price,
            change: quote.change ?? fallback.change,
            changePercent: quote.changePercent ?? fallback.changePercent,
            volume: quote.volume ?? fallback.volume,
          };
        }
      }
    } catch {
      // Fallback
    }
    return this.fallbackProvider.getStockDetail(symbol);
  }

  async getAIMarketSummary(): Promise<AIMarketSummary> {
    return this.fallbackProvider.getAIMarketSummary();
  }
}
