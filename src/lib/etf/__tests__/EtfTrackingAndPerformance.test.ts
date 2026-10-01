import { describe, it, expect } from 'vitest';
import { EtfTrackingEngine } from '../EtfTrackingEngine.ts';
import { EtfPerformanceEngine } from '../EtfPerformanceEngine.ts';
import type { CandlePoint } from '../../indicators/types.ts';

function createMockSeries(
  startDate: string,
  count: number,
  startPrice: number,
  dailyDrift: number
): CandlePoint[] {
  const bars: CandlePoint[] = [];
  let currentPrice = startPrice;
  const start = new Date(startDate);

  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const wave = Math.sin(i * 0.5) * 0.015;
    currentPrice = currentPrice * (1 + dailyDrift + wave);
    bars.push({
      time: dateStr,
      open: currentPrice,
      high: currentPrice * 1.01,
      low: currentPrice * 0.99,
      close: Math.round(currentPrice),
      volume: 100_000,
    });
  }
  return bars;
}

describe('Phase 22.5 — ETF Tracking & Performance Engines', () => {
  describe('EtfTrackingEngine', () => {
    it('computes tracking difference, tracking error, beta, and correlation across aligned series', () => {
      // 30 aligned trading days
      const etfBars = createMockSeries('2026-08-01', 30, 30_000, 0.002);
      const benchmarkBars = createMockSeries('2026-08-01', 30, 1_300, 0.0019);

      const res = EtfTrackingEngine.analyze({
        symbol: 'E1VFVN30',
        benchmarkSymbol: 'VN30',
        etfBars,
        benchmarkBars,
        minObservations: 20,
      });

      expect(res.status).toBe('COMPUTED');
      expect(res.observationCount).toBe(29);
      expect(res.trackingDifference).not.toBeNull();
      expect(res.trackingErrorDaily).not.toBeNull();
      expect(res.trackingErrorAnnualized).toBeGreaterThanOrEqual(0);
      expect(res.beta).not.toBeNull();
      expect(res.correlation).toBeCloseTo(1.0, 1);
    });

    it('fails closed when aligned observations are below minimum threshold (N < 20)', () => {
      // Only 10 days
      const etfBars = createMockSeries('2026-08-01', 10, 30_000, 0.002);
      const benchmarkBars = createMockSeries('2026-08-01', 10, 1_300, 0.002);

      const res = EtfTrackingEngine.analyze({
        symbol: 'E1VFVN30',
        benchmarkSymbol: 'VN30',
        etfBars,
        benchmarkBars,
        minObservations: 20,
      });

      expect(res.status).toBe('DATA_UNAVAILABLE');
      expect(res.trackingErrorDaily).toBeNull();
      expect(res.trackingErrorAnnualized).toBeNull();
      expect(res.warnings.some((w) => w.includes('Insufficient'))).toBe(true);
    });
  });

  describe('EtfPerformanceEngine', () => {
    it('computes multi-period returns, annualized volatility, and maximum drawdown', () => {
      const bars: CandlePoint[] = [
        { time: '2026-01-02', open: 30000, high: 30500, low: 29800, close: 30000, volume: 10000 },
        { time: '2026-01-05', open: 30000, high: 32000, low: 29900, close: 32000, volume: 12000 }, // Peak at 32000
        { time: '2026-01-06', open: 32000, high: 32000, low: 28800, close: 28800, volume: 15000 }, // Drawdown: (32000 - 28800)/32000 = 10%
        { time: '2026-01-07', open: 28800, high: 31000, low: 28800, close: 31000, volume: 11000 },
      ];

      const res = EtfPerformanceEngine.analyze('E1VFVN30', bars);

      expect(res.status).toBe('COMPUTED');
      expect(res.returns.d1).toBeCloseTo(((31000 - 28800) / 28800) * 100, 2);
      expect(res.maxDrawdownPercent).toBe(10.0);
      expect(res.returns.w1).toBeNull(); // Less than 5 bars
    });

    it('fails closed when bar history is insufficient (< 2 bars)', () => {
      const res = EtfPerformanceEngine.analyze('E1VFVN30', [
        { time: '2026-01-02', open: 30000, high: 30000, low: 30000, close: 30000, volume: 1000 },
      ]);
      expect(res.status).toBe('DATA_UNAVAILABLE');
      expect(res.returns.d1).toBeNull();
      expect(res.maxDrawdownPercent).toBeNull();
    });
  });
});
