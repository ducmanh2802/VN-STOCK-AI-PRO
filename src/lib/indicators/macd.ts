import { CandlePoint, MACDPoint } from './types';
import { calculateEMA } from './ema';

/**
 * Calculates Moving Average Convergence Divergence (MACD) deterministically.
 * @param data Candlestick or close price array
 * @param fastPeriod Fast EMA period (default 12)
 * @param slowPeriod Slow EMA period (default 26)
 * @param signalPeriod Signal line EMA period (default 9)
 * @returns Array of MACDPoint with macd, signal, and histogram
 */
export function calculateMACD(
  data: (CandlePoint | { time: string | number; close: number })[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDPoint[] {
  if (!data || data.length < slowPeriod + signalPeriod) {
    return [];
  }

  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  // Map fast EMA values by time for fast alignment
  const fastMap = new Map<string | number, number>();
  for (const item of fastEMA) {
    fastMap.set(item.time, item.value);
  }

  // Calculate raw MACD series where both fast and slow EMAs exist
  const rawMACD: { time: string | number; close: number }[] = [];
  for (const slowItem of slowEMA) {
    const fastVal = fastMap.get(slowItem.time);
    if (fastVal !== undefined) {
      rawMACD.push({
        time: slowItem.time,
        close: Number((fastVal - slowItem.value).toFixed(2)),
      });
    }
  }

  // Calculate signal line (EMA of MACD line)
  const signalEMA = calculateEMA(rawMACD, signalPeriod);
  const signalMap = new Map<string | number, number>();
  for (const item of signalEMA) {
    signalMap.set(item.time, item.value);
  }

  // Build final result
  const result: MACDPoint[] = [];
  for (const macdItem of rawMACD) {
    const signalVal = signalMap.get(macdItem.time);
    if (signalVal !== undefined) {
      const macd = macdItem.close;
      const signal = signalVal;
      const histogram = Number((macd - signal).toFixed(2));

      result.push({
        time: macdItem.time,
        macd,
        signal,
        histogram,
      });
    }
  }

  return result;
}
