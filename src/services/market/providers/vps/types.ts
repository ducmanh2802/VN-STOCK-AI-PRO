export interface VpsNormalizedQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradingValue: number;
  matchType?: string;
  timestamp: string;
}

export interface VpsNormalizedFundamentals {
  symbol: string;
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  roa?: number | null;
  eps?: number | null;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
  updatedAt?: string;
}
