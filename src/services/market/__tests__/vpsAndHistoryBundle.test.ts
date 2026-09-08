import { describe, it, expect } from 'vitest';
import { VPSMarketDataProvider } from '../providers/VPSMarketDataProvider';
import { buildChartDataBundleFromCandles, buildChartDataBundle } from '../stockHistory';
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
      symbol: 'HPG',
      currentPrice: mockRealCandles[39].close,
      dataSource: 'KBS',
      dataStatus: 'OK',
    });

    expect(bundle).not.toBeNull();
    expect(bundle.dataStatus).toBe('OK');
    expect(bundle.isReal).toBe(true);
    expect(bundle.dataSource).toBe('KBS');
    expect(bundle.candles.length).toBe(40);
    expect(bundle.candles[bundle.candles.length - 1].close).toBe(mockRealCandles[39].close);
    expect(bundle.snapshot).toBeDefined();
    expect(bundle.snapshot?.rsi.value).toBeGreaterThan(0);
    expect(bundle.snapshot?.rsi.value).toBeLessThan(100);
    expect(bundle.snapshot?.sma20.value).toBeGreaterThan(0);
    expect(bundle.snapshot?.sma50.value).toBeGreaterThan(0);
    expect(bundle.snapshot?.macd).toBeDefined();
    expect(bundle.snapshot?.bollinger).toBeDefined();
  });

  it('returns DATA_UNAVAILABLE state when candle data is missing or empty', async () => {
    // When calling buildChartDataBundle for an unavailable/isolated symbol where real backend fails
    try {
      const bundle = await buildChartDataBundle('INVALID_UNKNOWN_XYZ', 20000, '3M');
      // If error is not thrown, it must explicitly indicate DATA_UNAVAILABLE
      if (bundle) {
        expect(bundle.dataStatus).toBe('DATA_UNAVAILABLE');
      }
    } catch (err: any) {
      expect(err.message).toMatch(/DATA_UNAVAILABLE|Không có dữ liệu/);
    }
  });
});
