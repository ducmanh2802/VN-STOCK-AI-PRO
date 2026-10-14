import type { HistoricalCandle } from '../../types/stock.ts';
import { PriceRepository, StockRepository } from '../../lib/db/index.ts';

export interface DailyPricesResult {
  readonly status: 'OK' | 'UNSUPPORTED_SYMBOL' | 'DATABASE_UNAVAILABLE' | 'INVALID_QUERY';
  readonly bars?: any[];
  readonly detail?: string;
  readonly databaseState?: string;
}

export async function getDailyPrices(
  symbol: string,
  options: { limit: number; now?: Date }
): Promise<DailyPricesResult> {
  const cleanSymbol = (symbol || '').toUpperCase().trim();
  if (!cleanSymbol || !/^[A-Z0-9_.]{1,20}$/.test(cleanSymbol)) {
    return { status: 'UNSUPPORTED_SYMBOL' };
  }

  try {
    const stock = await StockRepository.getBySymbol(cleanSymbol);
    if (!stock) {
      return { status: 'UNSUPPORTED_SYMBOL' };
    }
    const bars = await PriceRepository.getDailyHistory(stock.id, { limit: options.limit || 100 });
    return { status: 'OK', bars: bars || [] };
  } catch (err: any) {
    return {
      status: 'DATABASE_UNAVAILABLE',
      databaseState: 'UNAVAILABLE',
      detail: err?.message,
    };
  }
}

export function toCandles(bars: any[]): HistoricalCandle[] {
  if (!Array.isArray(bars)) return [];
  return bars.map((b) => ({
    time: String(b.tradingDate || b.date || b.time || ''),
    open: Number(b.open ?? 0),
    high: Number(b.high ?? 0),
    low: Number(b.low ?? 0),
    close: Number(b.close ?? 0),
    volume: Number(b.volume ?? 0),
  }));
}
