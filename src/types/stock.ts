export type MarketExchange = 'HOSE' | 'HNX' | 'UPCOM';

export type StockTrend = 'UPTREND' | 'DOWNTREND' | 'SIDEWAY';

export type StockSummaryDataStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export type DataFreshnessStatus = 'CURRENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID';

export interface StockSummary {
  symbol: string;
  companyName: string;
  exchange: MarketExchange;
  sector: string;
  price: number; // in VND (e.g., 28500)
  change: number; // e.g., +650
  changePercent: number; // e.g., +2.33
  volume: number; // e.g., 24500000
  tradingValue: number; // in billion VND
  open: number;
  high: number;
  low: number;
  refPrice: number;
  ceilingPrice: number | null;
  floorPrice: number | null;
  /**
   * P0-03: in billion VND, or `null` when UNAVAILABLE.
   * A market cap is only reported when it is backed by an authoritative
   * shares-outstanding figure multiplied by an authoritative price (or by an
   * authoritative market-cap source). It is never assumed to be one million
   * shares for every ticker, and never coerced to `0`.
   */
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  rsi: number | null;
  trend: StockTrend;
  aiScore: number; // 0 - 100
  fairValue: number | null;
  sparkline: number[];
  isDemo?: boolean;
  dataStatus?: StockSummaryDataStatus;
  dataFreshness?: DataFreshnessStatus;
  fetchedAt?: string;
  sourceTimestamp?: string | number | null;
}

export interface TopMover {
  symbol: string;
  companyName: string;
  exchange: MarketExchange;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number; // in billion VND
  isDemo?: boolean;
}

export interface SectorHeatmapItem {
  id: string;
  name: string;
  changePercent: number;
  /** P0-03: tỷ VND, or `null` when no constituent has an authoritative market cap. */
  marketCap: number | null;
  leaderSymbol: string;
  stocksCount: number;
  volume: number;
  isDemo?: boolean;
}
