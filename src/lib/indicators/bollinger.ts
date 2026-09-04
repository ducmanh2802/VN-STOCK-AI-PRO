import { CandlePoint, BollingerBandsPoint } from './types';

/**
 * Calculates Bollinger Bands deterministically.
 * @param data Candlestick or close price array
 * @param period Lookback window size (default 20)
 * @param multiplier Standard deviation multiplier (default 2)
 * @returns Array of BollingerBandsPoint with upper, middle, lower, %b, and bandwidth
 */
export function calculateBollingerBands(
  data: (CandlePoint | { time: string | number; close: number })[],
  period: number = 20,
  multiplier: number = 2
): BollingerBandsPoint[] {
  if (!data || data.length < period || period <= 0) {
    return [];
  }

  const result: BollingerBandsPoint[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const windowSlice = data.slice(i - period + 1, i + 1);
    
    // 1. Calculate Mean (SMA)
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += windowSlice[j].close;
    }
    const middle = sum / period;

    // 2. Calculate Variance & Standard Deviation
    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(windowSlice[j].close - middle, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);

    const upper = middle + multiplier * stdDev;
    const lower = middle - multiplier * stdDev;

    const currentClose = data[i].close;
    const bandDiff = upper - lower;
    const pb = bandDiff > 0 ? (currentClose - lower) / bandDiff : 0.5;
    const bandwidth = middle > 0 ? (bandDiff / middle) * 100 : 0;

    result.push({
      time: data[i].time,
      upper: Number(upper.toFixed(2)),
      middle: Number(middle.toFixed(2)),
      lower: Number(lower.toFixed(2)),
      pb: Number(pb.toFixed(3)),
      bandwidth: Number(bandwidth.toFixed(2)),
    });
  }

  return result;
}
