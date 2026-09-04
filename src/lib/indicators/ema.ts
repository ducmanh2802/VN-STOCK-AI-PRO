import { CandlePoint, LinePoint } from './types';

/**
 * Calculates Exponential Moving Average (EMA) deterministically.
 * @param data Candlestick or line points
 * @param period Lookback window size
 * @returns Array of LinePoint with calculated EMA values
 */
export function calculateEMA(
  data: (CandlePoint | { time: string | number; close: number })[],
  period: number
): LinePoint[] {
  if (!data || data.length === 0 || period <= 0 || data.length < period) {
    return [];
  }

  const result: LinePoint[] = [];
  const k = 2 / (period + 1);

  // Initial EMA is simple moving average of first `period` items
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += data[i].close;
  }
  let currentEMA = initialSum / period;

  result.push({
    time: data[period - 1].time,
    value: Number(currentEMA.toFixed(2)),
  });

  // Calculate remaining EMAs iteratively
  for (let i = period; i < data.length; i++) {
    currentEMA = data[i].close * k + currentEMA * (1 - k);
    result.push({
      time: data[i].time,
      value: Number(currentEMA.toFixed(2)),
    });
  }

  return result;
}
