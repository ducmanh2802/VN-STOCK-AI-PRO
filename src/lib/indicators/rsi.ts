import { CandlePoint, LinePoint } from './types';

/**
 * Calculates Relative Strength Index (RSI) using standard Wilder's smoothing.
 * Output is deterministic and bounded in [0, 100].
 * @param data Array of candlestick or close price points
 * @param period Lookback window (default 14)
 * @returns Array of LinePoint with RSI values
 */
export function calculateRSI(
  data: (CandlePoint | { time: string | number; close: number })[],
  period: number = 14
): LinePoint[] {
  if (!data || data.length <= period || period <= 0) {
    return [];
  }

  const result: LinePoint[] = [];
  const changes: number[] = [];

  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i - 1].close);
  }

  // Calculate initial average gain and loss over first `period` changes
  let sumGain = 0;
  let sumLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) {
      sumGain += change;
    } else {
      sumLoss += Math.abs(change);
    }
  }

  let avgGain = sumGain / period;
  let avgLoss = sumLoss / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  result.push({
    time: data[period].time,
    value: Number(Math.min(100, Math.max(0, rsi)).toFixed(2)),
  });

  // Calculate smoothed RSI for remaining points
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const currentGain = change > 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    result.push({
      time: data[i + 1].time,
      value: Number(Math.min(100, Math.max(0, rsi)).toFixed(2)),
    });
  }

  return result;
}
