export type MarketExchange = 'HOSE' | 'HNX' | 'UPCOM';

export type StockTrend = 'UPTREND' | 'DOWNTREND' | 'SIDEWAY';

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
  ceilingPrice: number;
  floorPrice: number;
  marketCap: number; // in billion VND
  pe: number;
  pb: number;
  roe: number;
  rsi: number;
  trend: StockTrend;
  aiScore: number; // 0 - 100
  fairValue: number;
  sparkline: number[];
  isDemo: true;
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
  isDemo: true;
}

export interface SectorHeatmapItem {
  id: string;
  name: string;
  changePercent: number;
  marketCap: number; // tỷ VND
  leaderSymbol: string;
  stocksCount: number;
  volume: number;
  isDemo: true;
}
