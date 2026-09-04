import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateVolumeSeries,
  computeIndicatorSnapshot,
  CandlePoint,
} from '../index';

describe('Technical Indicators Library (Deterministic calculations)', () => {
  // Mock deterministic sample data: 30 sessions
  const sampleCandles: CandlePoint[] = Array.from({ length: 30 }, (_, i) => {
    const base = 25000 + i * 150 + (i % 3 === 0 ? 200 : -100);
    const dateStr = `2025-01-${String(i + 1).padStart(2, '0')}`;
    return {
      time: dateStr,
      open: base - 50,
      high: base + 250,
      low: base - 150,
      close: base + 50,
      volume: 1000000 + (i % 5) * 200000,
    };
  });

  describe('SMA (Simple Moving Average)', () => {
    it('returns empty array when input data length is less than period', () => {
      const shortData = sampleCandles.slice(0, 5);
      const result = calculateSMA(shortData, 10);
      expect(result).toEqual([]);
    });

    it('calculates mathematically exact SMA for known numbers', () => {
      const testData = [
        { time: '2025-01-01', close: 10 },
        { time: '2025-01-02', close: 20 },
        { time: '2025-01-03', close: 30 },
        { time: '2025-01-04', close: 40 },
        { time: '2025-01-05', close: 50 },
      ];
      const sma3 = calculateSMA(testData, 3);
      expect(sma3).toHaveLength(3);
      expect(sma3[0]).toEqual({ time: '2025-01-03', value: 20 });
      expect(sma3[1]).toEqual({ time: '2025-01-04', value: 30 });
      expect(sma3[2]).toEqual({ time: '2025-01-05', value: 40 });
    });

    it('is completely deterministic across repeated executions', () => {
      const run1 = calculateSMA(sampleCandles, 20);
      const run2 = calculateSMA(sampleCandles, 20);
      expect(run1).toEqual(run2);
    });
  });

  describe('EMA (Exponential Moving Average)', () => {
    it('initializes first EMA value with the simple average of first period', () => {
      const testData = [
        { time: '2025-01-01', close: 10 },
        { time: '2025-01-02', close: 20 },
        { time: '2025-01-03', close: 30 },
        { time: '2025-01-04', close: 40 },
      ];
      const ema3 = calculateEMA(testData, 3);
      expect(ema3[0].value).toBe(20); // (10+20+30)/3 = 20
      // Next: k = 2 / (3 + 1) = 0.5; EMA = 40 * 0.5 + 20 * 0.5 = 30
      expect(ema3[1].value).toBe(30);
    });

    it('is deterministic', () => {
      const run1 = calculateEMA(sampleCandles, 12);
      const run2 = calculateEMA(sampleCandles, 12);
      expect(run1).toEqual(run2);
    });
  });

  describe('RSI (Relative Strength Index)', () => {
    it('produces values strictly bounded between 0 and 100', () => {
      const rsiResult = calculateRSI(sampleCandles, 14);
      expect(rsiResult.length).toBeGreaterThan(0);
      for (const pt of rsiResult) {
        expect(pt.value).toBeGreaterThanOrEqual(0);
        expect(pt.value).toBeLessThanOrEqual(100);
      }
    });

    it('yields high RSI (>70) for consistently rising prices', () => {
      const risingData = Array.from({ length: 25 }, (_, i) => ({
        time: `2025-01-${i + 1}`,
        close: 100 + i * 10,
      }));
      const rsi = calculateRSI(risingData, 14);
      expect(rsi.length).toBeGreaterThan(0);
      expect(rsi[rsi.length - 1].value).toBeGreaterThan(75);
    });

    it('yields low RSI (<30) for consistently declining prices', () => {
      const decliningData = Array.from({ length: 25 }, (_, i) => ({
        time: `2025-01-${i + 1}`,
        close: 500 - i * 15,
      }));
      const rsi = calculateRSI(decliningData, 14);
      expect(rsi.length).toBeGreaterThan(0);
      expect(rsi[rsi.length - 1].value).toBeLessThan(30);
    });

    it('is deterministic', () => {
      const run1 = calculateRSI(sampleCandles, 14);
      const run2 = calculateRSI(sampleCandles, 14);
      expect(run1).toEqual(run2);
    });
  });

  describe('MACD (Moving Average Convergence Divergence)', () => {
    it('correctly calculates macd, signal, and ensures histogram = macd - signal', () => {
      // 30 points is sufficient for slowPeriod 12 + fastPeriod 5 + signal 5 test
      const macdPoints = calculateMACD(sampleCandles, 6, 14, 5);
      expect(macdPoints.length).toBeGreaterThan(0);

      for (const pt of macdPoints) {
        expect(typeof pt.macd).toBe('number');
        expect(typeof pt.signal).toBe('number');
        expect(typeof pt.histogram).toBe('number');
        const expectedHist = Number((pt.macd - pt.signal).toFixed(2));
        expect(Math.abs(pt.histogram - expectedHist)).toBeLessThanOrEqual(0.01);
      }
    });

    it('is deterministic', () => {
      const run1 = calculateMACD(sampleCandles, 6, 14, 5);
      const run2 = calculateMACD(sampleCandles, 6, 14, 5);
      expect(run1).toEqual(run2);
    });
  });

  describe('Bollinger Bands', () => {
    it('maintains upper >= middle >= lower structure', () => {
      const bb = calculateBollingerBands(sampleCandles, 20, 2);
      expect(bb.length).toBe(sampleCandles.length - 20 + 1);

      for (const pt of bb) {
        expect(pt.upper).toBeGreaterThanOrEqual(pt.middle);
        expect(pt.middle).toBeGreaterThanOrEqual(pt.lower);
        expect(typeof pt.pb).toBe('number');
        expect(typeof pt.bandwidth).toBe('number');
      }
    });

    it('calculates middle band identically to SMA', () => {
      const bb = calculateBollingerBands(sampleCandles, 20, 2);
      const sma = calculateSMA(sampleCandles, 20);

      expect(bb.length).toBe(sma.length);
      for (let i = 0; i < bb.length; i++) {
        expect(bb[i].middle).toBe(sma[i].value);
      }
    });

    it('is deterministic', () => {
      const run1 = calculateBollingerBands(sampleCandles, 20, 2);
      const run2 = calculateBollingerBands(sampleCandles, 20, 2);
      expect(run1).toEqual(run2);
    });
  });

  describe('Volume Series', () => {
    it('assigns green #10B981 when close >= open and red #EF4444 when close < open', () => {
      const customCandles: CandlePoint[] = [
        { time: '2025-01-01', open: 100, high: 110, low: 95, close: 105, volume: 5000 },
        { time: '2025-01-02', open: 105, high: 108, low: 98, close: 99, volume: 8000 },
      ];
      const result = calculateVolumeSeries(customCandles, 2);
      expect(result[0].color).toBe('#10B981');
      expect(result[1].color).toBe('#EF4444');
      expect(result[1].volumeMA).toBe(6500); // (5000 + 8000) / 2
    });

    it('is deterministic', () => {
      const run1 = calculateVolumeSeries(sampleCandles, 20);
      const run2 = calculateVolumeSeries(sampleCandles, 20);
      expect(run1).toEqual(run2);
    });
  });

  describe('Indicator Snapshot', () => {
    it('generates a full snapshot with all required properties for valid candle data', () => {
      const snapshot = computeIndicatorSnapshot(sampleCandles);
      expect(snapshot).not.toBeNull();
      if (!snapshot) return;

      expect(snapshot.rsi).toBeDefined();
      expect(snapshot.macd).toBeDefined();
      expect(snapshot.sma20).toBeDefined();
      expect(snapshot.sma50).toBeDefined();
      expect(snapshot.sma200).toBeDefined();
      expect(snapshot.bollinger).toBeDefined();
      expect(snapshot.volume).toBeDefined();

      expect(['OVERSOLD', 'BEARISH', 'NEUTRAL', 'BULLISH', 'OVERBOUGHT']).toContain(snapshot.rsi.status);
      expect(['ABOVE', 'BELOW']).toContain(snapshot.sma20.priceRelation);
      expect(typeof snapshot.bollinger.bandwidth).toBe('number');
      expect(snapshot.volume.ratioToMA).toBeGreaterThan(0);
    });
  });
});
