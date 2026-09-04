import { CandlePoint, LinePoint } from './types';

/**
 * Calculates Simple Moving Average (SMA) over close prices deterministically.
 * @param data Array of candlestick points with time and close values
 * @param period Lookback window size (e.g. 20, 50, 200)
 * @returns Array of LinePoint with calculated SMA values
 */
export function calculateSMA(
  data: (CandlePoint | { time: string | number; close: number })[],
  period: number
): LinePoint[] {
  if (!data || data.length === 0 || period <= 0) {
    return [];
  }

  const result: LinePoint[] = [];
  let windowSum = 0;

  for (let i = 0; i < data.length; i++) {
    windowSum += data[i].close;

    if (i >= period) {
      windowSum -= data[i - period].close;
    }

    if (i >= period - 1) {
      const average = windowSum / period;
      result.push({
        time: data[i].time,
        value: Number(average.toFixed(2)),
      });
    }
  }

  return result;
}
