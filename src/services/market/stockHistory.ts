import { CandlePoint, LinePoint, MACDPoint, BollingerBandsPoint, VolumeBarPoint, IndicatorSnapshot } from '../../lib/indicators/types';
import {
  calculateSMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateVolumeSeries,
  computeIndicatorSnapshot,
} from '../../lib/indicators';
import { TimeframeOption } from '../../types/stockDetail';

export interface StockChartDataBundle {
  candles: CandlePoint[];
  sma20: LinePoint[];
  sma50: LinePoint[];
  sma200: LinePoint[];
  rsi: LinePoint[];
  macd: MACDPoint[];
  bollinger: BollingerBandsPoint[];
  volume: VolumeBarPoint[];
  snapshot: IndicatorSnapshot | null;
}

/**
 * Deterministic pseudo-random number generator (LCG) based on a string seed.
 * Ensures the same (symbol, timeframe) combination always generates the exact same sequence.
 */
function createSeededRandom(seedStr: string) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return function next() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed >>> 0) / 4294967296;
  };
}

/**
 * Generates historical candlestick data deterministically for any symbol and timeframe.
 */
export function generateCandlestickHistory(
  symbol: string,
  currentPrice: number,
  timeframe: TimeframeOption
): CandlePoint[] {
  const rand = createSeededRandom(`${symbol.toUpperCase()}-${timeframe}-v2`);
  const now = new Date('2025-02-28T15:00:00Z'); // Fixed baseline date for determinism

  let barCount = 130;
  let intervalDays = 1;
  const isIntraday = timeframe === '1D';

  switch (timeframe) {
    case '1D':
      barCount = 45; // 5-minute bars during 09:15 - 14:45
      break;
    case '1W':
      barCount = 35; // hourly bars or 7-day view
      intervalDays = 1;
      break;
    case '1M':
      barCount = 30; // 30 days
      intervalDays = 1;
      break;
    case '3M':
      barCount = 65; // ~3 months daily
      intervalDays = 1;
      break;
    case '6M':
      barCount = 130; // ~6 months daily
      intervalDays = 1;
      break;
    case '1Y':
      barCount = 250; // ~1 year daily
      intervalDays = 1;
      break;
    case '3Y':
      barCount = 350; // ~3 years daily/bi-daily
      intervalDays = 3;
      break;
  }

  // To end up at currentPrice at the final bar, generate backwards drift or start at computed base
  const volatility = 0.018; // ~1.8% daily volatility
  const path: { open: number; high: number; low: number; close: number; volume: number }[] = [];

  // Build a reverse random walk from currentPrice
  let tempClose = currentPrice;
  const rawBars: { open: number; high: number; low: number; close: number; volume: number }[] = [];

  for (let i = 0; i < barCount; i++) {
    const deltaPercent = (rand() - 0.49) * volatility;
    const barClose = tempClose;
    const barOpen = Math.round(barClose / (1 + deltaPercent));
    const range = Math.max(Math.abs(barClose - barOpen) * 1.5, barClose * 0.008);
    const barHigh = Math.round(Math.max(barOpen, barClose) + rand() * range);
    const barLow = Math.round(Math.min(barOpen, barClose) - rand() * range);
    const baseVol = 1200000;
    const vol = Math.round(baseVol * (0.6 + rand() * 1.2));

    rawBars.push({
      open: barOpen,
      high: barHigh,
      low: barLow,
      close: barClose,
      volume: vol,
    });

    tempClose = barOpen;
  }

  // Reverse so chronological order is strictly ascending
  rawBars.reverse();

  // Assign valid, monotonically increasing timestamps/dates
  const candles: CandlePoint[] = [];

  if (isIntraday) {
    // 1D Intraday: start at 09:15, 5m steps
    const baseTimestamp = Math.floor(now.getTime() / 1000) - barCount * 300;
    for (let i = 0; i < barCount; i++) {
      candles.push({
        time: (baseTimestamp + i * 300) as number,
        ...rawBars[i],
      });
    }
  } else {
    // Multi-day: strictly ascending 'YYYY-MM-DD'
    for (let i = 0; i < barCount; i++) {
      const daysBack = (barCount - 1 - i) * intervalDays;
      const barDate = new Date(now.getTime() - daysBack * 86400000);
      const yyyy = barDate.getFullYear();
      const mm = String(barDate.getMonth() + 1).padStart(2, '0');
      const dd = String(barDate.getDate()).padStart(2, '0');
      const timeStr = `${yyyy}-${mm}-${dd}`;

      candles.push({
        time: timeStr,
        ...rawBars[i],
      });
    }
  }

  // Ensure the very last bar exactly matches currentPrice
  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    last.close = currentPrice;
    last.high = Math.max(last.high, currentPrice);
    last.low = Math.min(last.low, currentPrice);
  }

  return candles;
}

/**
 * Orchestrates complete deterministic technical indicator pipeline outside of React.
 */
export function buildChartDataBundle(
  symbol: string,
  currentPrice: number,
  timeframe: TimeframeOption
): StockChartDataBundle {
  const candles = generateCandlestickHistory(symbol, currentPrice, timeframe);

  const sma20 = calculateSMA(candles, 20);
  const sma50 = calculateSMA(candles, 50);
  const sma200 = calculateSMA(candles, 200);
  const rsi = calculateRSI(candles, 14);
  const macd = calculateMACD(candles, 12, 26, 9);
  const bollinger = calculateBollingerBands(candles, 20, 2);
  const volume = calculateVolumeSeries(candles, 20);
  const snapshot = computeIndicatorSnapshot(candles);

  return {
    candles,
    sma20,
    sma50,
    sma200,
    rsi,
    macd,
    bollinger,
    volume,
    snapshot,
  };
}
