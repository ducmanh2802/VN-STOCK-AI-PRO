import { describe, it, expect } from 'vitest';
import { EventShockAnalyzer } from '../EventShockAnalyzer.ts';
import type { CandlePoint } from '../../indicators/types.ts';

describe('Phase 26 — EventShockAnalyzer', () => {
  const mockCandles: CandlePoint[] = [
    { time: '2024-04-01', open: 100, high: 102, low: 99, close: 100, volume: 1000000 },
    { time: '2024-04-02', open: 100, high: 101, low: 98, close: 99, volume: 1100000 },
    { time: '2024-04-03', open: 99, high: 100, low: 98, close: 100, volume: 950000 },
    { time: '2024-04-04', open: 100, high: 103, low: 100, close: 102, volume: 1200000 },
    { time: '2024-04-05', open: 102, high: 102, low: 95, close: 96, volume: 2500000 }, // Event date
    { time: '2024-04-08', open: 95, high: 96, low: 90, close: 91, volume: 3000000 }, // T+1
  ];

  it('computes window metrics around event date T0 deterministically', () => {
    const shock = EventShockAnalyzer.analyzeEventShock(
      'EVT_01',
      'ABC',
      'GOVERNANCE_EVENT',
      '2024-04-05',
      mockCandles
    );

    expect(shock.eventId).toBe('EVT_01');
    expect(shock.symbol).toBe('ABC');
    expect(shock.windowMetrics.length).toBeGreaterThan(0);

    const t0Metric = shock.windowMetrics.find((w) => w.window === 'T0');
    expect(t0Metric?.priceReturnPercent).toBe(0); // T0 price relative to T0 is 0%

    const t1Metric = shock.windowMetrics.find((w) => w.window === 'T+1');
    expect(t1Metric?.priceReturnPercent).toBeCloseTo(-5.21, 1); // (91 - 96) / 96 = -5.208%
  });

  it('includes explicit non-causal disclaimer in the observation', () => {
    const shock = EventShockAnalyzer.analyzeEventShock(
      'EVT_01',
      'ABC',
      'GOVERNANCE_EVENT',
      '2024-04-05',
      mockCandles
    );

    expect(shock.disclaimer).toBeDefined();
    expect(shock.disclaimer).toContain('không khẳng định quan hệ nhân quả trực tiếp');
  });

  it('handles empty candles gracefully with UNAVAILABLE status', () => {
    const shock = EventShockAnalyzer.analyzeEventShock(
      'EVT_01',
      'ABC',
      'GOVERNANCE_EVENT',
      '2024-04-05',
      []
    );

    expect(shock.marketDataStatus).toBe('UNAVAILABLE');
    expect(shock.maximumDrawdownPercent).toBeNull();
  });
});
