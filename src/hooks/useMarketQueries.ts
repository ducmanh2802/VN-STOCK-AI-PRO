import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketService } from '../services/market';
import { StockSummarySchema, IndexDataSchema, SectorHeatmapItemSchema } from '../schemas/stockSchema';
import { getFullStockDetail } from '../services/market/stockDetailService';
import { buildChartDataBundle, StockChartDataBundle } from '../services/market/stockHistory';
import { TimeframeOption } from '../types/stockDetail';
import type { MoneyFlowResult } from '../lib/analysis/moneyFlow/MoneyFlowEngine';

export const MARKET_KEYS = {
  all: ['market'] as const,
  status: ['market', 'status'] as const,
  indices: ['market', 'indices'] as const,
  sentiment: ['market', 'sentiment'] as const,
  breadth: ['market', 'breadth'] as const,
  aiSignals: ['market', 'aiSignals'] as const,
  sectors: ['market', 'sectors'] as const,
  topMovers: ['market', 'topMovers'] as const,
  stocks: ['market', 'stocks'] as const,
  stockDetail: (symbol: string) => ['market', 'stock', symbol.toUpperCase()] as const,
  fullStockDetail: (symbol: string) => ['market', 'fullStockDetail', symbol.toUpperCase()] as const,
  moneyFlowAnalysis: (symbol: string) => ['market', 'moneyFlowAnalysis', symbol.toUpperCase()] as const,
  chartData: (symbol: string, timeframe: string, price: number) =>
    ['market', 'chartData', symbol.toUpperCase(), timeframe, price] as const,
  watchlist: (symbols: string[]) => ['market', 'watchlist', symbols.sort().join(',')] as const,
  aiSummary: ['market', 'aiSummary'] as const,
};

/**
 * Hook to retrieve live market indices (VN-INDEX, VN30, HNX, UPCOM)
 */
export function useMarketIndices() {
  return useQuery({
    queryKey: MARKET_KEYS.indices,
    queryFn: async () => {
      const data = await marketService.getMarketIndices();
      // Validate schema in development
      if (process.env.NODE_ENV !== 'production' && data.length > 0) {
        IndexDataSchema.parse(data[0]);
      }
      return data;
    },
  });
}

/**
 * Hook to retrieve market operating status
 */
export function useMarketStatus() {
  return useQuery({
    queryKey: MARKET_KEYS.status,
    queryFn: () => marketService.getMarketStatus(),
  });
}

/**
 * Hook to retrieve market sentiment
 */
export function useMarketSentiment() {
  return useQuery({
    queryKey: MARKET_KEYS.sentiment,
    queryFn: () => marketService.getMarketSentiment(),
  });
}

/**
 * Hook to retrieve market breadth
 */
export function useMarketBreadth() {
  return useQuery({
    queryKey: MARKET_KEYS.breadth,
    queryFn: () => marketService.getMarketBreadth(),
  });
}

/**
 * Hook to retrieve quantitative AI top signals
 */
export function useAITopSignals() {
  return useQuery({
    queryKey: MARKET_KEYS.aiSignals,
    queryFn: () => marketService.getAITopSignals(),
  });
}

/**
 * Hook to retrieve sector heatmap items
 */
export function useSectorHeatmap() {
  return useQuery({
    queryKey: MARKET_KEYS.sectors,
    queryFn: async () => {
      const data = await marketService.getSectorHeatmap();
      if (process.env.NODE_ENV !== 'production' && data.length > 0) {
        SectorHeatmapItemSchema.parse(data[0]);
      }
      return data;
    },
  });
}

export const useMarketHeatmap = useSectorHeatmap;


/**
 * Hook to retrieve Top Movers (gainers, losers, volume active)
 */
export function useTopMovers() {
  return useQuery({
    queryKey: MARKET_KEYS.topMovers,
    queryFn: () => marketService.getTopMovers(),
  });
}

/**
 * Hook to retrieve all stocks list
 */
export function useStocksList() {
  return useQuery({
    queryKey: MARKET_KEYS.stocks,
    queryFn: async () => {
      const data = await marketService.getAllStocks();
      if (process.env.NODE_ENV !== 'production' && data.length > 0) {
        StockSummarySchema.parse(data[0]);
      }
      return data;
    },
  });
}

/**
 * Hook to retrieve a single stock's full details
 */
export function useStockDetail(symbol: string | null) {
  return useQuery({
    queryKey: MARKET_KEYS.stockDetail(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      return marketService.getStockDetail(symbol);
    },
    enabled: Boolean(symbol),
  });
}

/**
 * Hook to retrieve rich full stock details including fundamentals, valuation, money flow, and AI synthesis
 */
export function useFullStockDetail(symbol: string | null) {
  return useQuery({
    queryKey: MARKET_KEYS.fullStockDetail(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      return getFullStockDetail(symbol);
    },
    enabled: Boolean(symbol),
  });
}

/**
 * Hook to retrieve deterministic Money Flow Analysis (Foreign flow, Volume ratio, Accumulation/Distribution, etc.)
 */
export function useMoneyFlowAnalysis(symbol: string | null) {
  return useQuery<MoneyFlowResult | null>({
    queryKey: MARKET_KEYS.moneyFlowAnalysis(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/stocks/${symbol}/money-flow-analysis`);
      if (!res.ok) {
        throw new Error('Failed to fetch money flow analysis');
      }
      return res.json();
    },
    enabled: Boolean(symbol),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to retrieve deterministic candlestick history and precomputed technical indicators
 */
export function useStockChartData(
  symbol: string | null,
  timeframe: TimeframeOption,
  currentPrice: number = 0
) {
  return useQuery<StockChartDataBundle | null>({
    queryKey: MARKET_KEYS.chartData(symbol || '', timeframe, currentPrice),
    queryFn: async () => {
      if (!symbol || currentPrice <= 0) return null;
      return buildChartDataBundle(symbol, currentPrice, timeframe);
    },
    enabled: Boolean(symbol) && currentPrice > 0,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to retrieve watchlist stock summaries
 */
export function useWatchlistData(symbols: string[]) {
  return useQuery({
    queryKey: MARKET_KEYS.watchlist(symbols),
    queryFn: () => marketService.getWatchlist(symbols),
    enabled: symbols.length > 0,
  });
}

/**
 * Hook to retrieve AI market summary
 */
export function useAIMarketSummary() {
  return useQuery({
    queryKey: MARKET_KEYS.aiSummary,
    queryFn: () => marketService.getAIMarketSummary(),
  });
}

/**
 * Hook to refetch all market queries simultaneously
 */
export function useRefreshMarket() {
  const queryClient = useQueryClient();
  return () => {
    return queryClient.invalidateQueries({ queryKey: MARKET_KEYS.all });
  };
}
