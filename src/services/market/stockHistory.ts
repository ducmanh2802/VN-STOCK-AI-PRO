import type { HistoricalCandle } from '../../types/stock.ts';

export interface StockChartDataBundle {
  candles: HistoricalCandle[];
  volume: number[];
  timestamps: string[];
  sma20?: (number | null)[];
  sma50?: (number | null)[];
  sma200?: (number | null)[];
  rsi14?: (number | null)[];
}

export function buildChartDataBundleFromCandles(candles: HistoricalCandle[]): StockChartDataBundle {
  const timestamps = candles.map((c) => c.time);
  const volume = candles.map((c) => c.volume);
  const closes = candles.map((c) => c.close);

  const calculateSma = (period: number): (number | null)[] => {
    return closes.map((_, idx) => {
      if (idx < period - 1) return null;
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += closes[idx - i];
      }
      return sum / period;
    });
  };

  return {
    candles,
    volume,
    timestamps,
    sma20: calculateSma(20),
    sma50: calculateSma(50),
    sma200: calculateSma(200),
  };
}

export async function getHistoricalChartData(
  _symbol: string,
  _timeframe: string
): Promise<StockChartDataBundle> {
  return buildChartDataBundleFromCandles([]);
}
