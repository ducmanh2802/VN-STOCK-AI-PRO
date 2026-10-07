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
  /**
   * P27 §9: nullable. A summary row is only emitted when a real `price` exists,
   * but every *derived* session field is `null` when the vendor omitted it —
   * `volume: 0` for a symbol with no reported volume would read as "no trading"
   * when the truth is "not supplied".
   */
  change: number | null; // e.g., +650
  changePercent: number | null; // e.g., +2.33
  volume: number | null; // e.g., 24500000
  tradingValue: number | null; // in billion VND
  open: number | null;
  high: number | null;
  low: number | null;
  refPrice: number | null;
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
  /** P27 §9: nullable — omitted rather than faked when the vendor did not send it. */
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  tradingValue: number | null; // in billion VND
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
