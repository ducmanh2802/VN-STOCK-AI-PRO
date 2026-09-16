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
  if (!Array.isArray(data) || data.length === 0 || period <= 0 || !Number.isInteger(period)) {
    return [];
  }

  // Filter valid finite non-negative price observations
  const validData: { time: string | number; close: number }[] = [];
  for (const item of data) {
    if (item && typeof item.close === 'number' && Number.isFinite(item.close) && item.close > 0) {
      validData.push({ time: item.time, close: item.close });
    }
  }

  if (validData.length < period) {
    return [];
  }

  const result: LinePoint[] = [];
  const k = 2 / (period + 1);

  // Initial EMA is simple moving average of first `period` items
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += validData[i].close;
  }
  let currentEMA = initialSum / period;

  result.push({
    time: validData[period - 1].time,
    value: Number(currentEMA.toFixed(2)),
  });

  // Calculate remaining EMAs iteratively
  for (let i = period; i < validData.length; i++) {
    currentEMA = validData[i].close * k + currentEMA * (1 - k);
    result.push({
      time: validData[i].time,
      value: Number(currentEMA.toFixed(2)),
    });
  }

  return result;
}
