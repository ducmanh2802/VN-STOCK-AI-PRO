import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateADX,
  calculateOBV,
  calculateVolumeSMA,
  calculateVolumeRatio,
  validateCandles,
} from '../indicators.ts';
import { TechnicalScoreEngine } from '../TechnicalScoreEngine.ts';
import { CandleInput } from '../../common/types.ts';

function generateSampleCandles(count: number, basePrice: number = 100, trend: number = 0.5): CandleInput[] {
  const candles: CandleInput[] = [];
  let current = basePrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.sin(i / 3) + trend) * 2;
    const open = current;
    const close = open + change;
    const high = Math.max(open, close) + 1.5;
    const low = Math.min(open, close) - 1.2;
    const volume = 100000 + Math.floor(Math.abs(Math.sin(i)) * 50000);

    candles.push({
      time: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    current = close;
  }

  return candles;
}

describe('Technical Indicators Suite', () => {
  const sampleCandles = generateSampleCandles(60, 50, 0.8);

  describe('Edge Cases & Data Sanitization', () => {
    it('handles empty candles array', () => {
      expect(calculateSMA([], 14)).toEqual([]);
      expect(calculateEMA([], 14)).toEqual([]);
      expect(calculateRSI([], 14)).toEqual([]);
      expect(calculateMACD([], 12, 26, 9)).toEqual([]);
      expect(calculateBollingerBands([], 20)).toEqual([]);
      expect(calculateATR([], 14)).toEqual([]);
      expect(calculateADX([], 14)).toEqual([]);
      expect(calculateOBV([])).toEqual([]);
      expect(calculateVolumeRatio([], 20)).toBeNull();
    });

    it('handles insufficient candles', () => {
      const few = sampleCandles.slice(0, 5);
      expect(calculateSMA(few, 20)).toEqual([]);
      expect(calculateEMA(few, 20)).toEqual([]);
      expect(calculateRSI(few, 14)).toEqual([]);
      expect(calculateMACD(few, 12, 26, 9)).toEqual([]);
      expect(calculateBollingerBands(few, 20)).toEqual([]);
      expect(calculateATR(few, 14)).toEqual([]);
      expect(calculateADX(few, 14)).toEqual([]);
    });

    it('filters out candles with NaN, Infinity, or high < low', () => {
      const corruptCandles: any[] = [
        { open: 10, high: 12, low: 9, close: 11, volume: 1000 },
        { open: NaN, high: 12, low: 9, close: 11, volume: 1000 },
        { open: 10, high: Infinity, low: 9, close: 11, volume: 1000 },
        { open: 10, high: 8, low: 9, close: 7, volume: 1000 }, // invalid high < low
        { open: 10, high: 12, low: 9, close: 11, volume: -500 }, // negative volume
        { open: 11, high: 13, low: 10, close: 12, volume: 1500 },
      ];
      const valid = validateCandles(corruptCandles);
      expect(valid.length).toBe(2);
      expect(valid[0].close).toBe(11);
      expect(valid[1].close).toBe(12);
    });

    it('handles invalid period (period <= 0, float, or period > data length)', () => {
      expect(calculateSMA(sampleCandles, 0)).toEqual([]);
      expect(calculateSMA(sampleCandles, -5)).toEqual([]);
      expect(calculateSMA(sampleCandles, 2.5)).toEqual([]);
      expect(calculateSMA(sampleCandles, 500)).toEqual([]);

      expect(calculateEMA(sampleCandles, -1)).toEqual([]);
      expect(calculateRSI(sampleCandles, 0)).toEqual([]);
      expect(calculateBollingerBands(sampleCandles, -10)).toEqual([]);
      expect(calculateATR(sampleCandles, -14)).toEqual([]);
    });

    it('handles zero volume safely', () => {
      const zeroVolCandles: CandleInput[] = sampleCandles.slice(0, 25).map((c) => ({
        ...c,
        volume: 0,
      }));
      const ratio = calculateVolumeRatio(zeroVolCandles, 20);
      expect(ratio).not.toBeNull();
      expect(ratio?.currentVolume).toBe(0);
      expect(ratio?.volumeSMA).toBe(0);
    });
  });

  describe('SMA & EMA', () => {
    it('calculates SMA accurately', () => {
      const fixedCandles: CandleInput[] = [
        { open: 10, high: 12, low: 9, close: 10, volume: 100 },
        { open: 10, high: 12, low: 9, close: 20, volume: 100 },
        { open: 10, high: 12, low: 9, close: 30, volume: 100 },
      ];
      const sma = calculateSMA(fixedCandles, 3);
      expect(sma.length).toBe(1);
      expect(sma[0].value).toBe(20);
    });

    it('calculates EMA and updates with smoothing', () => {
      const ema = calculateEMA(sampleCandles, 12);
      expect(ema.length).toBe(sampleCandles.length - 12 + 1);
      expect(ema[0].value).toBeGreaterThan(0);
    });
  });

  describe('RSI', () => {
    it('calculates RSI bounded strictly between 0 and 100', () => {
      const rsi = calculateRSI(sampleCandles, 14);
      expect(rsi.length).toBeGreaterThan(0);
      for (const pt of rsi) {
        expect(pt.value).toBeGreaterThanOrEqual(0);
        expect(pt.value).toBeLessThanOrEqual(100);
      }
    });

    it('yields high RSI for continuously rising candles', () => {
      const rising: CandleInput[] = [];
      for (let i = 0; i < 25; i++) {
        rising.push({
          open: 10 + i,
          high: 11 + i,
          low: 9.5 + i,
          close: 10.8 + i,
          volume: 1000,
        });
      }
      const rsi = calculateRSI(rising, 14);
      expect(rsi[rsi.length - 1].value).toBeGreaterThan(80);
    });
  });

  describe('MACD', () => {
    it('calculates MACD line, signal line, and histogram', () => {
      const macd = calculateMACD(sampleCandles, 12, 26, 9);
      expect(macd.length).toBeGreaterThan(0);
      const latest = macd[macd.length - 1];
      expect(typeof latest.macd).toBe('number');
      expect(typeof latest.signal).toBe('number');
      expect(typeof latest.histogram).toBe('number');
      expect(Number((latest.macd - latest.signal).toFixed(4))).toBeCloseTo(latest.histogram, 3);
    });
  });

  describe('Bollinger Bands', () => {
    it('calculates upper > middle > lower bands', () => {
      const bb = calculateBollingerBands(sampleCandles, 20, 2);
      expect(bb.length).toBeGreaterThan(0);
      for (const pt of bb) {
        expect(pt.upper).toBeGreaterThanOrEqual(pt.middle);
        expect(pt.middle).toBeGreaterThanOrEqual(pt.lower);
      }
    });
  });

  describe('ATR, ADX & OBV', () => {
    it('calculates non-negative ATR values', () => {
      const atr = calculateATR(sampleCandles, 14);
      expect(atr.length).toBeGreaterThan(0);
      for (const pt of atr) {
        expect(pt.value).toBeGreaterThan(0);
      }
    });

    it('calculates ADX, +DI, and -DI', () => {
      const adx = calculateADX(sampleCandles, 14);
      expect(adx.length).toBeGreaterThan(0);
      const latest = adx[adx.length - 1];
      expect(latest.adx).toBeGreaterThanOrEqual(0);
      expect(latest.adx).toBeLessThanOrEqual(100);
    });

    it('calculates OBV accumulating positive and negative days', () => {
      const obv = calculateOBV(sampleCandles);
      expect(obv.length).toBe(sampleCandles.length);
      expect(typeof obv[obv.length - 1].value).toBe('number');
    });

    it('calculates Volume SMA and Volume Ratio', () => {
      const volSMA = calculateVolumeSMA(sampleCandles, 20);
      expect(volSMA.length).toBeGreaterThan(0);
      const ratio = calculateVolumeRatio(sampleCandles, 20);
      expect(ratio).not.toBeNull();
      expect(ratio?.ratio).toBeGreaterThan(0);
    });
  });

  describe('TechnicalScoreEngine', () => {
    it('calculates score and breakdown according to required weights', () => {
      const result = TechnicalScoreEngine.evaluate(sampleCandles);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);

      // Verify all 7 breakdown pillars exist
      expect(result.breakdown).toHaveProperty('trend');
      expect(result.breakdown).toHaveProperty('momentum');
      expect(result.breakdown).toHaveProperty('volume');
      expect(result.breakdown).toHaveProperty('rsi');
      expect(result.breakdown).toHaveProperty('macd');
      expect(result.breakdown).toHaveProperty('support');
      expect(result.breakdown).toHaveProperty('breakout');

      // Check mathematical formula weight alignment (Trend 20%, Momentum 15%, Volume 15%, RSI 10%, MACD 10%, Support 15%, Breakout 15%)
      const expectedScore = Number(
        (
          result.breakdown.trend * 0.20 +
          result.breakdown.momentum * 0.15 +
          result.breakdown.volume * 0.15 +
          result.breakdown.rsi * 0.10 +
          result.breakdown.macd * 0.10 +
          result.breakdown.support * 0.15 +
          result.breakdown.breakout * 0.15
        ).toFixed(1)
      );
      expect(result.score).toBeCloseTo(expectedScore, 1);

      expect(Array.isArray(result.reasons)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('handles empty candles with 0 score and warnings', () => {
      const result = TechnicalScoreEngine.evaluate([]);
      expect(result.score).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('handles insufficient candles with appropriate warnings', () => {
      const result = TechnicalScoreEngine.evaluate(sampleCandles.slice(0, 10));
      expect(result.warnings.some((w) => w.includes('ít hơn khuyến nghị'))).toBe(true);
    });
  });
});
