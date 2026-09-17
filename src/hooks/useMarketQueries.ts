import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketService } from '../services/market';
import { StockSummarySchema, IndexDataSchema, SectorHeatmapItemSchema } from '../schemas/stockSchema';
import { getFullStockDetail } from '../services/market/stockDetailService';
import { StockChartDataBundle } from '../services/market/stockHistory';
import { TimeframeOption } from '../types/stockDetail';
import type { MoneyFlowResult } from '../lib/analysis/moneyFlow/MoneyFlowEngine';
import type { Order } from '../lib/trading/types/trading';
// PHASE 8.5C — real market data types (type-only imports: no server code bundled into the client)
import type { VpsNormalizedFundamentals, VpsNormalizedQuote } from '../services/market/providers/vps/types';
import type { QuoteCrossCheck } from '../services/market/realMarketDataService';
import type {
  InvestmentHorizon,
  InvestmentRecommendation,
  RankingResult,
} from '../types/recommendation';
import type { MarketIntelligenceSnapshot } from '../lib/analysis/market/types';

export const MARKET_KEYS = {
  all: ['market'] as const,
  intelligence: ['market', 'intelligence'] as const,
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
  recommendations: (symbol: string) => ['market', 'recommendations', symbol.toUpperCase()] as const,
  rankings: (strategy: string) => ['market', 'rankings', strategy] as const,
};

/**
 * Hook to retrieve canonical Phase 20 Market Intelligence Snapshot
 * (Regime, S/R, Breakdown Risk, Recovery Strength, Breadth, Sectors)
 */
export function useMarketIntelligence(options?: { refresh?: boolean; refetchInterval?: number }) {
  return useQuery<MarketIntelligenceSnapshot>({
    queryKey: [...MARKET_KEYS.intelligence, options?.refresh ? 'refresh' : 'default'],
    queryFn: async () => {
      const res = await fetch(`/api/market-intelligence${options?.refresh ? '?refresh=true' : ''}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch market intelligence: HTTP ${res.status}`);
      }
      return res.json();
    },
    refetchInterval: options?.refetchInterval ?? 30 * 1000,
  });
}

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
export function useWatchlistData(
  symbols: string[],
  options?: { refetchInterval?: number | false; staleTime?: number }
) {
  return useQuery({
    queryKey: MARKET_KEYS.watchlist(symbols),
    queryFn: () => marketService.getWatchlist(symbols),
    enabled: symbols.length > 0,
    refetchInterval: options?.refetchInterval !== undefined ? options.refetchInterval : 30000,
    staleTime: options?.staleTime !== undefined ? options.staleTime : 5000,
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

/** Response envelope for Stock Recommendations */
export interface StockRecommendationsResponse {
  symbol: string;
  dataStatus: 'OK' | 'INSUFFICIENT_DATA' | 'DATA_UNAVAILABLE';
  currentPrice: number;
  recommendations?: Record<InvestmentHorizon, InvestmentRecommendation>;
  message?: string;
  retrievedAt?: string;
}

/**
 * PHASE 17 — Hook to retrieve multi-horizon AI recommendations (Short, Medium, Long term)
 */
export function useStockRecommendations(symbol: string | null) {
  return useQuery<StockRecommendationsResponse | null>({
    queryKey: MARKET_KEYS.recommendations(symbol || ''),
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/stocks/${symbol.toUpperCase()}/recommendations`);
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    enabled: Boolean(symbol),
    staleTime: 60 * 1000,
  });
}

/**
 * PHASE 17 — Hook to retrieve Strategy Rankings across universe
 */
export function useRecommendationRankings(strategy: InvestmentHorizon = 'SHORT_TERM') {
  return useQuery<RankingResult | null>({
    queryKey: MARKET_KEYS.rankings(strategy),
    queryFn: async () => {
      const res = await fetch(`/api/recommendations/rankings?strategy=${strategy}`);
      if (!res.ok) throw new Error('Failed to fetch recommendation rankings');
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useRefreshMarket() {
  const queryClient = useQueryClient();
  return () => {
    return queryClient.invalidateQueries({ queryKey: MARKET_KEYS.all });
  };
}

export const TRADING_KEYS = {
  all: ['trading'] as const,
  status: ['trading', 'status'] as const,
  portfolio: ['trading', 'portfolio'] as const,
  positions: ['trading', 'positions'] as const,
  orders: ['trading', 'orders'] as const,
  riskMetrics: ['trading', 'risk-metrics'] as const,
};

export interface TradingAccountData {
  accountId: string;
  currency: string;
  cash: number;
  reservedCash: number;
  availableCash: number;
  marketValue: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: any[];
  openOrders: any[];
  updatedAt: string;
}

export interface TradingStatusData {
  tradingEnabled: boolean;
  emergencyStop: boolean;
  brokerMode: string;
  session: string;
}

export function useTradingStatus() {
  return useQuery<TradingStatusData | null>({
    queryKey: TRADING_KEYS.status,
    queryFn: async () => {
      const res = await fetch('/api/trading/status');
      if (!res.ok) throw new Error('Failed to fetch trading status');
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 10 * 1000,
  });
}

export function useTradingPortfolio() {
  return useQuery<TradingAccountData | null>({
    queryKey: TRADING_KEYS.portfolio,
    queryFn: async () => {
      const res = await fetch('/api/trading/portfolio');
      if (!res.ok) throw new Error('Failed to fetch trading portfolio');
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 10 * 1000,
  });
}

export function useTradingPositions() {
  return useQuery<any[]>({
    queryKey: TRADING_KEYS.positions,
    queryFn: async () => {
      const res = await fetch('/api/trading/positions');
      if (!res.ok) throw new Error('Failed to fetch trading positions');
      const json = await res.json();
      return json.data || [];
    },
    refetchInterval: 10 * 1000,
  });
}

export function useTradingOrders() {
  return useQuery<Order[] | null>({
    queryKey: TRADING_KEYS.orders,
    queryFn: async () => {
      const res = await fetch('/api/trading/orders');
      if (!res.ok) throw new Error('Failed to fetch trading orders');
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 5 * 1000,
  });
}

export interface RiskMetric {
  value: number | null;
  status: 'OK' | 'STALE' | 'DATA_UNAVAILABLE' | 'INSUFFICIENT_DATA';
  formula: string;
  source: string;
  timestamp: string;
  window?: string;
  units: string;
  confidence?: string;
  details?: Record<string, unknown>;
}

export interface TradingRiskMetricsData {
  computedAt: string;
  accountId: string;
  equity: number | null;
  equityStatus: string;
  exposure: RiskMetric;
  concentration: RiskMetric;
  cashUtilization: RiskMetric;
  dailyLoss: RiskMetric;
  drawdown: RiskMetric;
  var: RiskMetric;
  stressLoss: RiskMetric;
  riskApprovedCapital: RiskMetric;
  summary: string;
}

export function useTradingRiskMetrics() {
  return useQuery<TradingRiskMetricsData | null>({
    queryKey: TRADING_KEYS.riskMetrics,
    queryFn: async () => {
      const res = await fetch('/api/trading/risk-metrics');
      if (!res.ok) throw new Error('Failed to fetch trading risk metrics');
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 15 * 1000,
  });
}

export function usePlaceTradingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { symbol: string; side: 'BUY' | 'SELL'; quantity: number; orderType: 'MARKET' | 'LIMIT'; limitPrice?: number }) => {
      const res = await fetch('/api/trading/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.error?.code || 'Order placement failed');
      }
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADING_KEYS.all });
    },
  });
}

export function useCancelTradingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch('/api/trading/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.error?.code || 'Order cancellation failed');
      }
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRADING_KEYS.all });
    },
  });
}
