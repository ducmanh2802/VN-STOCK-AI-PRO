import { CandleInput, isValidNumber } from '../common/types.ts';

export interface IndicatorPoint {
  time?: string | number;
  value: number;
}

export interface MACDPoint {
  time?: string | number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerPoint {
  time?: string | number;
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

export interface ADXPoint {
  time?: string | number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

/**
 * Filter and validate candles, eliminating non-finite or invalid price entries.
 */
export function validateCandles(candles: CandleInput[]): CandleInput[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  return candles.filter(
    (c) =>
      c &&
      isValidNumber(c.close) &&
      isValidNumber(c.open) &&
      isValidNumber(c.high) &&
      isValidNumber(c.low) &&
      isValidNumber(c.volume) &&
      c.volume >= 0 &&
      c.high >= c.low
  );
}

/**
 * 1. Simple Moving Average (SMA)
 */
export function calculateSMA(
  candles: CandleInput[],
  period: number,
  source: 'close' | 'volume' = 'close'
): IndicatorPoint[] {
  const valid = validateCandles(candles);
  if (period <= 0 || !Number.isInteger(period) || valid.length < period) {
    return [];
  }

  const results: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < period; i++) {
    sum += valid[i][source];
  }
  results.push({
    time: valid[period - 1].time,
    value: Number((sum / period).toFixed(4)),
  });

  for (let i = period; i < valid.length; i++) {
    sum += valid[i][source] - valid[i - period][source];
    results.push({
      time: valid[i].time,
      value: Number((sum / period).toFixed(4)),
    });
  }

  return results;
}

/**
 * 2. Exponential Moving Average (EMA)
 */
export function calculateEMA(
  candles: CandleInput[],
  period: number,
  source: 'close' | 'volume' = 'close'
): IndicatorPoint[] {
  const valid = validateCandles(candles);
  if (period <= 0 || !Number.isInteger(period) || valid.length < period) {
    return [];
  }

  const results: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);

  // Initial SMA as the seed for EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += valid[i][source];
  }
  let prevEma = sum / period;

  results.push({
    time: valid[period - 1].time,
    value: Number(prevEma.toFixed(4)),
  });

  for (let i = period; i < valid.length; i++) {
    const currentVal = valid[i][source];
    const currentEma = (currentVal - prevEma) * multiplier + prevEma;
    results.push({
      time: valid[i].time,
      value: Number(currentEma.toFixed(4)),
    });
    prevEma = currentEma;
  }

  return results;
}

/**
 * 3. Relative Strength Index (RSI - Wilder's Smoothing)
 */
export function calculateRSI(
  candles: CandleInput[],
  period: number = 14
): IndicatorPoint[] {
  const valid = validateCandles(candles);
  if (period <= 0 || !Number.isInteger(period) || valid.length <= period) {
    return [];
  }

  const results: IndicatorPoint[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  // Calculate initial average gain and loss over first period
  for (let i = 1; i <= period; i++) {
    const change = valid[i].close - valid[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  const initialRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const initialRSI = avgLoss === 0 ? 100 : 100 - 100 / (1 + initialRS);

  results.push({
    time: valid[period].time,
    value: Number(Math.min(100, Math.max(0, initialRSI)).toFixed(2)),
  });

  // Wilder's smoothed averages
  for (let i = period + 1; i < valid.length; i++) {
    const change = valid[i].close - valid[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    let rsi = 100;
    if (avgLoss !== 0) {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    } else if (avgGain === 0) {
      rsi = 50;
    }

    results.push({
      time: valid[i].time,
      value: Number(Math.min(100, Math.max(0, rsi)).toFixed(2)),
    });
  }

  return results;
}

/**
 * 4. Moving Average Convergence Divergence (MACD)
 */
export function calculateMACD(
  candles: CandleInput[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDPoint[] {
  const valid = validateCandles(candles);
  if (
    fastPeriod <= 0 ||
    slowPeriod <= 0 ||
    signalPeriod <= 0 ||
    fastPeriod >= slowPeriod ||
    valid.length < slowPeriod + signalPeriod
  ) {
    return [];
  }

  const fastEMA = calculateEMA(valid, fastPeriod);
  const slowEMA = calculateEMA(valid, slowPeriod);

  // Align fast and slow by time or index
  const offset = slowPeriod - fastPeriod;
  const macdLineSeries: { time?: string | number; value: number }[] = [];

  for (let i = 0; i < slowEMA.length; i++) {
    const fastVal = fastEMA[i + offset].value;
    const slowVal = slowEMA[i].value;
    macdLineSeries.push({
      time: slowEMA[i].time,
      value: fastVal - slowVal,
    });
  }

  if (macdLineSeries.length < signalPeriod) return [];

  // Calculate signal line (EMA of MACD line)
  const multiplier = 2 / (signalPeriod + 1);
  let sum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    sum += macdLineSeries[i].value;
  }
  let prevSignal = sum / signalPeriod;

  const results: MACDPoint[] = [];
  const firstMacd = macdLineSeries[signalPeriod - 1].value;
  results.push({
    time: macdLineSeries[signalPeriod - 1].time,
    macd: Number(firstMacd.toFixed(4)),
    signal: Number(prevSignal.toFixed(4)),
    histogram: Number((firstMacd - prevSignal).toFixed(4)),
  });

  for (let i = signalPeriod; i < macdLineSeries.length; i++) {
    const currentMacd = macdLineSeries[i].value;
    const currentSignal = (currentMacd - prevSignal) * multiplier + prevSignal;
    results.push({
      time: macdLineSeries[i].time,
      macd: Number(currentMacd.toFixed(4)),
      signal: Number(currentSignal.toFixed(4)),
      histogram: Number((currentMacd - currentSignal).toFixed(4)),
    });
    prevSignal = currentSignal;
  }

  return results;
}

/**
 * 5. Bollinger Bands
 */
export function calculateBollingerBands(
  candles: CandleInput[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerPoint[] {
  const valid = validateCandles(candles);
  if (
    period <= 0 ||
    !Number.isInteger(period) ||
    stdDevMultiplier <= 0 ||
    valid.length < period
  ) {
    return [];
  }

  const results: BollingerPoint[] = [];

  for (let i = period - 1; i < valid.length; i++) {
    const slice = valid.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, c) => acc + c.close, 0) / period;

    const variance =
      slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = mean + stdDevMultiplier * stdDev;
    const lower = mean - stdDevMultiplier * stdDev;
    const bandwidth = mean === 0 ? 0 : (upper - lower) / mean;

    results.push({
      time: valid[i].time,
      upper: Number(upper.toFixed(2)),
      middle: Number(mean.toFixed(2)),
      lower: Number(lower.toFixed(2)),
      bandwidth: Number(bandwidth.toFixed(4)),
    });
  }

  return results;
}

/**
 * 6. Average True Range (ATR)
 */
export function calculateATR(
  candles: CandleInput[],
  period: number = 14
): IndicatorPoint[] {
  const valid = validateCandles(candles);
  if (period <= 0 || !Number.isInteger(period) || valid.length <= period) {
    return [];
  }

  const trueRanges: number[] = [];

  // First TR is simply high - low
  trueRanges.push(valid[0].high - valid[0].low);

  for (let i = 1; i < valid.length; i++) {
    const high = valid[i].high;
    const low = valid[i].low;
    const prevClose = valid[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Initial ATR = average of first 'period' TRs
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  let prevAtr = sum / period;

  const results: IndicatorPoint[] = [
    {
      time: valid[period - 1].time,
      value: Number(prevAtr.toFixed(4)),
    },
  ];

  for (let i = period; i < trueRanges.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
    results.push({
      time: valid[i].time,
      value: Number(currentAtr.toFixed(4)),
    });
    prevAtr = currentAtr;
  }

  return results;
}

/**
 * 7. Average Directional Index (ADX) with +DI, -DI
 */
export function calculateADX(
  candles: CandleInput[],
  period: number = 14
): ADXPoint[] {
  const valid = validateCandles(candles);
  if (period <= 0 || !Number.isInteger(period) || valid.length < period * 2) {
    return [];
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < valid.length; i++) {
    const high = valid[i].high;
    const low = valid[i].low;
    const prevHigh = valid[i - 1].high;
    const prevLow = valid[i - 1].low;
    const prevClose = valid[i - 1].close;

    // True Range
    tr.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      )
    );

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
  }

  // Initial smoothed TR, +DM, -DM
  let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];
  const diPoints: { plusDI: number; minusDI: number; time?: string | number }[] = [];

  for (let i = period - 1; i < tr.length; i++) {
    if (i > period - 1) {
      smoothedTR = smoothedTR - smoothedTR / period + tr[i];
      smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];
    }

    const plusDI = smoothedTR === 0 ? 0 : (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = smoothedTR === 0 ? 0 : (smoothedMinusDM / smoothedTR) * 100;

    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;

    dxValues.push(dx);
    diPoints.push({
      plusDI: Number(plusDI.toFixed(2)),
      minusDI: Number(minusDI.toFixed(2)),
      time: valid[i + 1].time,
    });
  }

  if (dxValues.length < period) return [];

  // Calculate ADX from DX values
  let adxSum = dxValues.slice(0, period).reduce((a, b) => a + b, 0);
  let currentADX = adxSum / period;

  const results: ADXPoint[] = [
    {
      time: diPoints[period - 1].time,
      adx: Number(currentADX.toFixed(2)),
      plusDI: diPoints[period - 1].plusDI,
      minusDI: diPoints[period - 1].minusDI,
    },
  ];

  for (let i = period; i < dxValues.length; i++) {
    currentADX = (currentADX * (period - 1) + dxValues[i]) / period;
    results.push({
      time: diPoints[i].time,
      adx: Number(currentADX.toFixed(2)),
      plusDI: diPoints[i].plusDI,
      minusDI: diPoints[i].minusDI,
    });
  }

  return results;
}

/**
 * 8. On-Balance Volume (OBV)
 */
export function calculateOBV(candles: CandleInput[]): IndicatorPoint[] {
  const valid = validateCandles(candles);
  if (valid.length === 0) return [];

  const results: IndicatorPoint[] = [];
  let currentOBV = valid[0].volume;

  results.push({
    time: valid[0].time,
    value: currentOBV,
  });

  for (let i = 1; i < valid.length; i++) {
    const currentClose = valid[i].close;
    const prevClose = valid[i - 1].close;
    const vol = valid[i].volume;

    if (currentClose > prevClose) {
      currentOBV += vol;
    } else if (currentClose < prevClose) {
      currentOBV -= vol;
    }
    // if equal, OBV remains unchanged

    results.push({
      time: valid[i].time,
      value: currentOBV,
    });
  }

  return results;
}

/**
 * 9. Volume SMA
 */
export function calculateVolumeSMA(
  candles: CandleInput[],
  period: number = 20
): IndicatorPoint[] {
  return calculateSMA(candles, period, 'volume');
}

/**
 * 10. Volume Ratio (Latest Volume / Volume SMA)
 */
export function calculateVolumeRatio(
  candles: CandleInput[],
  period: number = 20
): { currentVolume: number; volumeSMA: number; ratio: number } | null {
  const valid = validateCandles(candles);
  if (period <= 0 || valid.length < period) return null;

  const volSMA = calculateVolumeSMA(valid, period);
  if (volSMA.length === 0) return null;

  const latestCandle = valid[valid.length - 1];
  const latestSMA = volSMA[volSMA.length - 1].value;

  if (latestSMA <= 0) {
    return {
      currentVolume: latestCandle.volume,
      volumeSMA: 0,
      ratio: latestCandle.volume > 0 ? 999 : 1,
    };
  }

  const ratio = Number((latestCandle.volume / latestSMA).toFixed(2));
  return {
    currentVolume: latestCandle.volume,
    volumeSMA: latestSMA,
    ratio,
  };
}
