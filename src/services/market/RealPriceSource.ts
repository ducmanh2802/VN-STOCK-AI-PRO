import { CandlePoint } from '../../lib/indicators/types';
import { StockRepository, PriceRepository } from '../../lib/db/index.ts';
import { TimeframeOption } from '../../types/stockDetail';

export class DataUnavailableError extends Error {
  constructor(symbol: string, reason: string) {
    super(`DATA_UNAVAILABLE for ${symbol}: ${reason}`);
    this.name = 'DataUnavailableError';
  }
}

/**
 * Maps a UI timeframe to how many calendar days of history to keep.
 * Includes warmup margin so MA200 / RSI / MACD have enough prior bars.
 */
const TIMEFRAME_DAYS: Record<TimeframeOption, number> = {
  '1D': 60, // Intraday: not supported by DB daily bars yet — nearest daily window.
  '1W': 90,
  '1M': 120,
  '3M': 180,
  '6M': 365,
  '1Y': 520,
  '3Y': 1200,
};

/** Converts a DB StockDailyRow to the CandlePoint shape used by indicators. */
interface DbDailyRow {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | number;
}

function toCandlePoint(row: DbDailyRow): CandlePoint {
  return {
    time: row.date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

export interface RealPriceSourceResult {
  symbol: string;
  stockId: number;
  candles: CandlePoint[];
  /** ISO date of first returned bar. */
  from: string;
  /** ISO date of last returned bar. */
  to: string;
  /** Total rows available in DB for this symbol (pre-timeframe slice). */
  totalAvailable: number;
}

/**
 * Loads real daily OHLCV candles for a symbol directly from PostgreSQL
 * via PriceRepository. No synthetic fallback: throws DataUnavailableError
 * when the symbol or its history is missing, so the caller can surface
 * an explicit error instead of silently showing fake data.
 */
export async function loadRealDailyCandles(
  symbol: string,
  timeframe: TimeframeOption
): Promise<RealPriceSourceResult> {
  const normalized = symbol.toUpperCase().trim();
  if (!normalized) {
    throw new DataUnavailableError(symbol, 'empty symbol');
  }

  const stock = await StockRepository.getBySymbol(normalized);
  if (!stock) {
    throw new DataUnavailableError(normalized, 'stock not present in stocks table');
  }

  const allRows = await PriceRepository.getDailyHistory(stock.id);
  if (allRows.length === 0) {
    throw new DataUnavailableError(normalized, 'no rows in stock_daily');
  }

  const days = TIMEFRAME_DAYS[timeframe] ?? 520;
  const cutoffMs = Date.now() - days * 86_400_000;
  const cutoffIso = new Date(cutoffMs).toISOString().slice(0, 10);

  const filtered = allRows.filter((r) => r.date >= cutoffIso);
  const rows = filtered.length > 0 ? filtered : allRows.slice(-30);

  if (rows.length === 0) {
    throw new DataUnavailableError(normalized, 'history slice empty after timeframe filter');
  }

  return {
    symbol: normalized,
    stockId: stock.id,
    candles: rows.map(toCandlePoint),
    from: rows[0].date,
    to: rows[rows.length - 1].date,
    totalAvailable: allRows.length,
  };
}
