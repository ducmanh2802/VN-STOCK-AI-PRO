import { CandleInput } from '../common/types.ts';

export interface SupportResistanceLevel {
  price: number;
  strength: number;
}

export interface SupportResistanceResult {
  support: SupportResistanceLevel[];
  resistance: SupportResistanceLevel[];
}

const DEFAULT_TOLERANCE = 0.02;
const SWING_LOOKBACK = 5;

function isSwingHigh(candles: CandleInput[], i: number, lookback: number): boolean {
  if (i < lookback || i >= candles.length - lookback) return false;
  const high = candles[i].high;
  for (let j = 1; j <= lookback; j++) {
    if (candles[i - j].high >= high || candles[i + j].high >= high) return false;
  }
  return true;
}

function isSwingLow(candles: CandleInput[], i: number, lookback: number): boolean {
  if (i < lookback || i >= candles.length - lookback) return false;
  const low = candles[i].low;
  for (let j = 1; j <= lookback; j++) {
    if (candles[i - j].low <= low || candles[i + j].low <= low) return false;
  }
  return true;
}

function clusterLevels(prices: number[], tolerance: number): SupportResistanceLevel[] {
  if (prices.length === 0) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const clusterAvg = current.reduce((a, b) => a + b, 0) / current.length;
    if ((sorted[i] - clusterAvg) / clusterAvg <= tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);
  return clusters.map((c) => ({
    price: Math.round((c.reduce((a, b) => a + b, 0) / c.length) * 100) / 100,
    strength: c.length,
  }));
}

export function calculateSupportResistance(
  candles: CandleInput[],
  tolerance: number = DEFAULT_TOLERANCE,
  lookback: number = SWING_LOOKBACK
): SupportResistanceResult {
  if (!candles || candles.length < lookback * 2 + 1) {
    return { support: [], resistance: [] };
  }
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    if (isSwingHigh(candles, i, lookback)) swingHighs.push(candles[i].high);
    if (isSwingLow(candles, i, lookback)) swingLows.push(candles[i].low);
  }
  return {
    support: clusterLevels(swingLows, tolerance),
    resistance: clusterLevels(swingHighs, tolerance),
  };
}
