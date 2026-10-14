export type MarketExchange = 'HOSE' | 'HNX' | 'UPCOM';
export type StockTrend = 'UPTREND' | 'DOWNTREND' | 'SIDEWAY';
export type DataFreshnessStatus = 'CURRENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID' | 'RECONCILED';

export interface StockSummary {
  symbol: string;
  companyName: string;
  exchange: MarketExchange;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number;
  high?: number;
  low?: number;
  open?: number;
  close?: number;
  ceiling?: number;
  floor?: number;
  reference?: number;
  rsi?: number | null;
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  eps?: number | null;
  marketCap?: number | null;
  fairValue?: number | null;
  upside?: number | null;
  aiScore: number;
  trend: StockTrend;
  signal: 'BUY' | 'SELL' | 'HOLD';
  isVN30?: boolean;
  sparkline?: number[];
}

export interface TopMover {
  symbol: string;
  companyName: string;
  exchange: MarketExchange;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number;
  aiScore?: number;
}

export interface SectorHeatmapItem {
  id: string;
  name: string;
  code: string;
  changePercent: number;
  totalValue: number;
  stockCount: number;
  advances: number;
  declines: number;
  unchanged: number;
  topStock: string;
  marketCapPercent?: number;
}

export interface HistoricalCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number;
  high: number;
  low: number;
  open: number;
  reference: number;
  ceiling: number;
  floor: number;
  exchange: MarketExchange;
  timestamp: string;
}
