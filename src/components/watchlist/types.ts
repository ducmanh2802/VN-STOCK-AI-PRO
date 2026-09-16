import { StockSummary, MarketExchange, StockTrend } from '../../types/stock';

export type SortColumn =
  | 'symbol'
  | 'price'
  | 'changePercent'
  | 'volume'
  | 'tradingValue'
  | 'rsi'
  | 'pe'
  | 'roe'
  | 'fairValue'
  | 'upside'
  | 'aiScore'
  | 'trend'
  | 'signal';

export type SortDirection = 'asc' | 'desc' | 'none';

export type ViewMode = 'table' | 'grid';

export type CategoryGroupId =
  | 'all'
  | 'vn30'
  | 'banking'
  | 'financial_services'
  | 'real_estate'
  | 'materials'
  | 'energy'
  | 'retail'
  | 'technology'
  | 'other';

export interface CategoryGroupOption {
  id: CategoryGroupId;
  label: string;
  iconName?: string;
  sectorId?: string;
  isVN30Only?: boolean;
}

export type ExchangeFilter = 'ALL' | MarketExchange;

export type SignalFilter = 'ALL' | 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export type TrendFilter = 'ALL' | StockTrend;

export interface WatchlistStats {
  totalCount: number;
  advances: number;
  declines: number;
  unchanged: number;
  ceilings: number;
  floors: number;
  avgChangePercent: number;
  avgAiScore: number;
  avgUpsidePercent: number;
  totalTradingValue: number;
  totalVolume: number;
  topGainer: StockSummary | null;
  topLoser: StockSummary | null;
}
