import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketService } from '../services/market';
import { StockSummarySchema, IndexDataSchema, SectorHeatmapItemSchema } from '../schemas/stockSchema';
import { getFullStockDetail } from '../services/market/stockDetailService';
import { StockChartDataBundle } from '../services/market/stockHistory';
import { TimeframeOption } from '../types/stockDetail';
import type { MoneyFlowResult } from '../lib/analysis/moneyFlow/MoneyFlowEngine';
// PHASE 8.5C — real market data types (type-only imports: no server code bundled into the client)
import type { VpsNormalizedFundamentals, VpsNormalizedQuote } from '../services/market/providers/vps/types';
import type { QuoteCrossCheck } from '../services/market/realMarketDataService';

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
  chartData: (symbol: string, timeframe: string) =>
    ['market', 'chartData', symbol.toUpperCase(), timeframe] as const,
  watchlist: (symbols: string[]) => ['market', 'watchlist', symbols.sort().join(',')] as const,
  aiSummary: ['market', 'aiSummary'] as const,
  analysis: (symbol: string) => ['market', 'analysis', symbol.toUpperCase()] as const,
  realtimeQuote: (symbol: string) => ['market', 'realtimeQuote', symbol.toUpperCase()] as const,
  realFundamentals: (symbol: string) => ['market', 'realFundamentals', symbol.toUpperCase()] as const,
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
/** Response envelope of GET /api/market-data/history/:symbol */
export interface ChartDataHistoryResponse extends Partial<StockChartDataBundle> {
  symbol: string;
  timeframe: string;
  dataStatus: 'OK' | 'DATA_UNAVAILABLE';
  dataSource?: 'KBS';
  error?: string;
  retrievedAt?: string;
}

/**
 * PHASE 8.5C — REAL candlestick history + indicators from the server
 * (KBS daily OHLCV → StockAnalysisEngine pipeline). No synthetic data.
 * Returns null when the real source is unavailable so the UI can render
 * an explicit DATA_UNAVAILABLE state.
 */
export function useStockChartData(
  symbol: string | null,
  timeframe: TimeframeOption
) {
  return useQuery<ChartDataHistoryResponse | null>({
    queryKey: MARKET_KEYS.chartData(symbol || '', timeframe),
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/market-data/history/${symbol.toUpperCase()}?timeframe=${timeframe}`);
      if (!res.ok) throw new Error('Failed to fetch real chart history');
      const json = (await res.json()) as ChartDataHistoryResponse;
      if (json.dataStatus !== 'OK') return json;
      return json;
    },
    enabled: Boolean(symbol),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/** Response envelope of GET /api/market-data/quote/:symbol */
export interface RealtimeQuoteResponse {
  symbol: string;
  source: 'VPS';
  dataStatus: 'OK' | 'DATA_UNAVAILABLE';
  quote?: VpsNormalizedQuote;
  crossCheck?: QuoteCrossCheck;
  error?: string;
  retrievedAt?: string;
}

/**
 * PHASE 8.5C — realtime quote snapshot from VPS (unit-normalized to VND/share,
 * cross-checked against KBS). Null quote == DATA_UNAVAILABLE — never a mock price.
 */
export function useRealtimeQuote(symbol: string | null) {
  return useQuery<RealtimeQuoteResponse | null>({
    queryKey: MARKET_KEYS.realtimeQuote(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/market-data/quote/${symbol.toUpperCase()}`);
      if (!res.ok) throw new Error('Failed to fetch realtime quote');
      return res.json();
    },
    enabled: Boolean(symbol),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
  });
}

/** Response envelope of GET /api/market-data/fundamentals/:symbol */
export type RealFundamentalsResponse =
  | ({ dataStatus: 'OK' } & VpsNormalizedFundamentals)
  | { dataStatus: 'DATA_UNAVAILABLE'; source: 'VPS'; symbol: string; error: string };

/**
 * PHASE 8.5C — real fundamentals from VPS. Period metadata is exposed as the
 * source provides it (mappingStatus AMBIGUOUS) — the UI must not present any
 * slot as the current period.
 */
export function useRealFundamentals(symbol: string | null) {
  return useQuery<RealFundamentalsResponse | null>({
    queryKey: MARKET_KEYS.realFundamentals(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/market-data/fundamentals/${symbol.toUpperCase()}`);
      if (!res.ok) throw new Error('Failed to fetch real fundamentals');
      return res.json();
    },
    enabled: Boolean(symbol),
    staleTime: 5 * 60 * 1000,
    retry: 1,
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


/**
 * Hook to retrieve comprehensive technical analysis (score, signal, confidence, indicators)
 */
export function useStockAnalysis(symbol: string | null) {
  return useQuery<Record<string, unknown> | null>({
    queryKey: MARKET_KEYS.analysis(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/analysis/${symbol}`);
      if (!res.ok) throw new Error('Failed to fetch analysis');
      return res.json();
    },
    enabled: Boolean(symbol),
    staleTime: 60 * 1000,
  });
}
export function useRefreshMarket() {
  const queryClient = useQueryClient();
  return () => {
    return queryClient.invalidateQueries({ queryKey: MARKET_KEYS.all });
  };
}
