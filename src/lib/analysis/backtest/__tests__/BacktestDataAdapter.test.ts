/**
 * PHASE 17.6 — DATA ADAPTER & VALIDATION TESTS
 * =============================================
 * Verifies fail-closed validation of historical candles.
 */

import { describe, it, expect } from 'vitest';
import { BacktestDataAdapter } from '../BacktestDataAdapter.ts';

describe('Phase 17.6 — BacktestDataAdapter', () => {
  const validCandles = [
    { time: '2026-01-01', open: 50000, high: 52000, low: 49500, close: 51500, volume: 100000 },
    { time: '2026-01-02', open: 51500, high: 53000, low: 51000, close: 52500, volume: 120000 },
    { time: '2026-01-03', open: 52500, high: 54000, low: 52000, close: 53500, volume: 110000 },
  ];

  it('successfully validates and normalizes clean OHLCV candles', () => {
    const res = BacktestDataAdapter.validateAndNormalize(validCandles, 'FPT');
    expect(res.valid).toBe(true);
    expect(res.candles.length).toBe(3);
    expect(res.errors.length).toBe(0);
    expect(res.candles[0].symbol).toBe('FPT');
    expect(res.candles[0].open).toBe(50000);
  });

  it('rejects empty or non-array candle inputs', () => {
    expect(BacktestDataAdapter.validateAndNormalize([], 'FPT').valid).toBe(false);
    expect(BacktestDataAdapter.validateAndNormalize(null as any, 'FPT').valid).toBe(false);
  });

  it('rejects negative and zero prices', () => {
    const invalidPrice = [
      { time: '2026-01-01', open: -50000, high: 52000, low: 49500, close: 51500, volume: 100000 },
    ];
    const res = BacktestDataAdapter.validateAndNormalize(invalidPrice, 'FPT');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Invalid open price'))).toBe(true);

    const zeroPrice = [
      { time: '2026-01-01', open: 50000, high: 52000, low: 0, close: 51500, volume: 100000 },
    ];
    expect(BacktestDataAdapter.validateAndNormalize(zeroPrice, 'FPT').valid).toBe(false);
  });

  it('rejects negative volume', () => {
    const negVolume = [
      { time: '2026-01-01', open: 50000, high: 52000, low: 49500, close: 51500, volume: -500 },
    ];
    const res = BacktestDataAdapter.validateAndNormalize(negVolume, 'FPT');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Invalid volume'))).toBe(true);
  });

  it('rejects invalid OHLC geometric relationships (high < low, high < close, low > open)', () => {
    const highLessThanLow = [
      { time: '2026-01-01', open: 50000, high: 48000, low: 49500, close: 49000, volume: 100000 },
    ];
    expect(BacktestDataAdapter.validateAndNormalize(highLessThanLow, 'FPT').valid).toBe(false);

    const highLessThanClose = [
      { time: '2026-01-01', open: 50000, high: 51000, low: 49000, close: 52000, volume: 100000 },
    ];
    expect(BacktestDataAdapter.validateAndNormalize(highLessThanClose, 'FPT').valid).toBe(false);
  });

  it('rejects duplicate timestamps and unsorted dates (fail closed)', () => {
    const duplicates = [
      { time: '2026-01-01', open: 50000, high: 52000, low: 49500, close: 51500, volume: 100000 },
      { time: '2026-01-01', open: 51000, high: 52500, low: 50000, close: 52000, volume: 100000 },
    ];
    const dupRes = BacktestDataAdapter.validateAndNormalize(duplicates, 'FPT');
    expect(dupRes.valid).toBe(false);
    expect(dupRes.errors.some((e) => e.includes('Duplicate timestamp'))).toBe(true);

    const unsorted = [
      { time: '2026-01-05', open: 50000, high: 52000, low: 49500, close: 51500, volume: 100000 },
      { time: '2026-01-02', open: 51000, high: 52500, low: 50000, close: 52000, volume: 100000 },
    ];
    const unsortedRes = BacktestDataAdapter.validateAndNormalize(unsorted, 'FPT');
    expect(unsortedRes.valid).toBe(false);
    expect(unsortedRes.errors.some((e) => e.includes('Unsorted timestamp'))).toBe(true);
  });

  it('rejects NaN and Infinity price values', () => {
    const nanPrice = [
      { time: '2026-01-01', open: NaN, high: 52000, low: 49500, close: 51500, volume: 100000 },
    ];
    expect(BacktestDataAdapter.validateAndNormalize(nanPrice, 'FPT').valid).toBe(false);

    const infPrice = [
      { time: '2026-01-01', open: 50000, high: Infinity, low: 49500, close: 51500, volume: 100000 },
    ];
    expect(BacktestDataAdapter.validateAndNormalize(infPrice, 'FPT').valid).toBe(false);
  });
});
