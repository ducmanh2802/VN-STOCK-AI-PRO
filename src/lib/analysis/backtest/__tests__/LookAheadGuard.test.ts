/**
 * PHASE 17.6 — LOOK-AHEAD GUARD TESTS
 * ====================================
 * Verifies strict temporal isolation and prevention of future candle leakage.
 */

import { describe, it, expect } from 'vitest';
import { LookAheadGuard, LookAheadGuardError } from '../LookAheadGuard.ts';
import type { HistoricalCandle } from '../types.ts';

describe('Phase 17.6 — LookAheadGuard', () => {
  const sampleCandles: HistoricalCandle[] = [
    { symbol: 'VNM', timestamp: '2026-01-01', open: 70000, high: 71000, low: 69500, close: 70500, volume: 100000 },
    { symbol: 'VNM', timestamp: '2026-01-02', open: 70500, high: 72000, low: 70000, close: 71800, volume: 120000 },
    { symbol: 'VNM', timestamp: '2026-01-03', open: 71800, high: 72500, low: 71200, close: 72200, volume: 90000 },
    { symbol: 'VNM', timestamp: '2026-01-04', open: 72200, high: 73000, low: 71500, close: 71600, volume: 150000 },
    { symbol: 'VNM', timestamp: '2026-01-05', open: 71600, high: 72000, low: 70800, close: 71000, volume: 80000 },
  ];

  it('slices history strictly up to currentIndex and freezes array', () => {
    const context = LookAheadGuard.createContext(sampleCandles, 2);

    expect(context.currentIndex).toBe(2);
    expect(context.currentCandle.timestamp).toBe('2026-01-03');
    expect(context.candlesToDate.length).toBe(3);
    expect(context.candlesToDate[0].timestamp).toBe('2026-01-01');
    expect(context.candlesToDate[2].timestamp).toBe('2026-01-03');

    // Future candles (index 3 and 4) must NOT be in candlesToDate
    const timestamps = context.candlesToDate.map((c) => c.timestamp);
    expect(timestamps).not.toContain('2026-01-04');
    expect(timestamps).not.toContain('2026-01-05');
  });

  it('throws error for invalid currentIndex bounds', () => {
    expect(() => LookAheadGuard.createContext(sampleCandles, -1)).toThrow(LookAheadGuardError);
    expect(() => LookAheadGuard.createContext(sampleCandles, 5)).toThrow(LookAheadGuardError);
    expect(() => LookAheadGuard.createContext([], 0)).toThrow(LookAheadGuardError);
  });

  it('correctly calculates lookback slices excluding current bar for resistance', () => {
    const context = LookAheadGuard.createContext(sampleCandles, 3);

    // Prior 2 bars excluding current bar (index 3: '2026-01-04') -> should return index 1 and 2
    const priorSlice = LookAheadGuard.validateLookbackSlice(context, 2, true);
    expect(priorSlice.length).toBe(2);
    expect(priorSlice[0].timestamp).toBe('2026-01-02');
    expect(priorSlice[1].timestamp).toBe('2026-01-03');
  });

  it('verifies absence of future timestamps in any evaluated slice', () => {
    const context = LookAheadGuard.createContext(sampleCandles, 2);
    expect(LookAheadGuard.verifyNoFutureLeakage(context.candlesToDate, '2026-01-03')).toBe(true);

    // If future candle was injected, verifyNoFutureLeakage returns false
    const contaminated = [...context.candlesToDate, sampleCandles[4]];
    expect(LookAheadGuard.verifyNoFutureLeakage(contaminated, '2026-01-03')).toBe(false);
  });
});
