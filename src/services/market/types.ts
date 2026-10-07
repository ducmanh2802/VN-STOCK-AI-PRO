/**
 * Legacy market provider types (kept for compatibility with the VPS provider
 * used by `vpsAndHistoryBundle.test.ts`). The active pipeline lives in
 * `realMarketDataService.ts` (KBS/VPS) — these types are NOT used there.
 */

export type MarketDataStatus = 'LIVE' | 'DELAYED' | 'HISTORICAL' | 'UNAVAILABLE';

/**
 * P27 §9: a field the vendor did not send is `null` — never `0`, never a value
 * copied from a neighbouring field (e.g. high must not become lastPrice).
 * `price === null` means the symbol is not currently quoted; callers must treat
 * the symbol as unavailable rather than as a zero-priced instrument.
 */
export interface MarketQuote {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  value?: number | null;
  totalValue?: number | null;
  ceilingPrice?: number | null;
  floorPrice?: number | null;
  refPrice: number | null;
  source: string;
  status: MarketDataStatus;
  dataStatus: MarketDataStatus;
  fetchedAt: string;
  freshnessMs: number | null;
  marketTimestamp: string | null;
  timestamp: number;
}