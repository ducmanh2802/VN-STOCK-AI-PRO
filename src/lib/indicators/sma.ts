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
  let windowSum = 0;

  for (let i = 0; i < validData.length; i++) {
    windowSum += validData[i].close;

    if (i >= period) {
      windowSum -= validData[i - period].close;
    }

    if (i >= period - 1) {
      const average = windowSum / period;
      result.push({
        time: validData[i].time,
        value: Number(average.toFixed(2)),
      });
    }
  }

  return result;
}
