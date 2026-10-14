import {
  getMarketIndices,
  getSectorHeatmap,
  getTopMovers,
  getRealtimeQuote,
} from './realMarketDataService.ts';
import { VIETNAM_STOCKS_UNIVERSE } from './stockUniverse.ts';
import type { StockSummary } from '../../types/stock.ts';

export const marketService = {
  getIndices: getMarketIndices,
  getHeatmap: getSectorHeatmap,
  getTopMovers,
  getQuote: getRealtimeQuote,
  searchStocks: async (query: string): Promise<StockSummary[]> => {
    const q = query.trim().toUpperCase();
    return VIETNAM_STOCKS_UNIVERSE.filter(
      (s) => s.symbol.includes(q) || s.companyName.toUpperCase().includes(q)
    ).map((s) => ({
      symbol: s.symbol,
      companyName: s.companyName,
      exchange: s.exchange,
      sector: s.sector,
      price: 28500,
      change: 350,
      changePercent: 1.24,
      volume: 12500000,
      tradingValue: 356250000000,
      aiScore: 80,
      trend: 'UPTREND',
      signal: 'BUY',
    }));
  },
};
