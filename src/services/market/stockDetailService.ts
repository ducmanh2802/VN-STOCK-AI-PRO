import type { FullStockDetail } from '../../types/stockDetail.ts';
import { VIETNAM_STOCKS_UNIVERSE } from './stockUniverse.ts';

export async function getFullStockDetail(symbol: string): Promise<FullStockDetail> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const stockMeta = VIETNAM_STOCKS_UNIVERSE.find((s) => s.symbol === cleanSymbol);

  return {
    symbol: cleanSymbol,
    summary: {
      symbol: cleanSymbol,
      companyName: stockMeta?.companyName ?? cleanSymbol,
      exchange: stockMeta?.exchange ?? 'HOSE',
      sector: stockMeta?.sector ?? 'Chung',
      price: 28500,
      change: 350,
      changePercent: 1.24,
      volume: 12500000,
      tradingValue: 356250000000,
      aiScore: 82,
      trend: 'UPTREND',
      signal: 'BUY',
    },
    overview: {
      symbol: cleanSymbol,
      companyName: stockMeta?.companyName ?? cleanSymbol,
    },
  };
}
