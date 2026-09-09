/**
 * Legacy market provider types (kept for compatibility with the VPS provider
 * used by `vpsAndHistoryBundle.test.ts`). The active pipeline lives in
 * `realMarketDataService.ts` (KBS/VPS) — these types are NOT used there.
 */

export type MarketDataStatus = 'LIVE' | 'DELAYED' | 'HISTORICAL' | 'UNAVAILABLE';

export interface MarketQuote {
  symbol: string;
  price: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number;
  value?: number;
  totalValue?: number;
  ceilingPrice?: number;
  floorPrice?: number;
  refPrice: number;
  source: string;
  status: MarketDataStatus;
  dataStatus: MarketDataStatus;
  fetchedAt: string;
  freshnessMs: number;
  marketTimestamp: string | null;
  timestamp: number;
}