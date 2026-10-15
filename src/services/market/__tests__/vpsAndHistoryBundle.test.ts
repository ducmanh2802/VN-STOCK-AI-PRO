import { describe, it, expect } from 'vitest';
import { VPSMarketDataProvider } from '../providers/VPSMarketDataProvider';
import { buildChartDataBundleFromCandles } from '../stockHistory';
import { CandlePoint } from '../../../lib/indicators/types';

describe('Phase 8.5 VPS Provider and Real Candle History Processing', () => {
  it('instantiates VPSMarketDataProvider with correct provider name', () => {
    const vps = new VPSMarketDataProvider();
    expect(vps.name).toBe('VPS');
    expect(typeof vps.getQuote).toBe('function');
    expect(typeof vps.getQuotes).toBe('function');
    expect(typeof vps.getFundamentals).toBe('function');
  });

  it('builds a deterministic chart data bundle from real candles without synthetic fallback', () => {
    const mockRealCandles: CandlePoint[] = [];
    const baseDate = new Date('2025-01-01T09:00:00Z');

    for (let i = 0; i < 40; i++) {
      const dayDate = new Date(baseDate.getTime() + i * 86400 * 1000);
      const close = 25000 + i * 150 + Math.sin(i) * 200;
      mockRealCandles.push({
        time: Math.floor(dayDate.getTime() / 1000),
        open: close - 50,
        high: close + 100,
        low: close - 80,
        close: close,
        volume: 1000000 + i * 10000,
      });
    }

    const bundle = buildChartDataBundleFromCandles(mockRealCandles, {
      from: '2025-01-01',
      to: '2025-02-09',
      latestValueVnd: mockRealCandles[39].close * 1000,
    });

    expect(bundle).not.toBeNull();
    expect(bundle.dataSource).toBe('KBS');
    expect(bundle.from).toBe('2025-01-01');
    expect(bundle.to).toBe('2025-02-09');
    expect(bundle.candles.length).toBe(40);
    expect(bundle.candles[0].close).toBe(mockRealCandles[0].close);
    expect(bundle.candles[bundle.candles.length - 1].close).toBe(mockRealCandles[39].close);
    expect(bundle.snapshot).toBeDefined();
    expect(bundle.snapshot?.rsi.value).toBeGreaterThan(0);
    expect(bundle.snapshot?.rsi.value).toBeLessThan(100);
    expect(bundle.snapshot?.sma20.value).toBeGreaterThan(0);
    expect(bundle.snapshot?.sma50.value).toBeGreaterThan(0);
    expect(bundle.snapshot?.macd).toBeDefined();
    expect(bundle.snapshot?.bollinger).toBeDefined();
  });

  it('preserves empty/insufficient candle data without synthesizing a fallback', () => {
    // The real pipeline must never fabricate candles when input is empty.
    const bundle = buildChartDataBundleFromCandles([]);
    expect(bundle.candles.length).toBe(0);
    expect(bundle.snapshot).toBeDefined();
  });
});
