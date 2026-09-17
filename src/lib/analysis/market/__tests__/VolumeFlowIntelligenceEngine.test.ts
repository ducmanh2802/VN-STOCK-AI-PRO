import { describe, it, expect } from 'vitest';
import { VolumeFlowIntelligenceEngine } from '../VolumeFlowIntelligenceEngine.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function createMockCandles(prices: number[], volumes: number[]): CandlePoint[] {
  return prices.map((p, idx) => ({
    time: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    open: p * 0.99,
    high: p * 1.02,
    low: p * 0.98,
    close: p,
    volume: volumes[idx],
  }));
}

describe('VolumeFlowIntelligenceEngine', () => {
  it('detects volume spikes and bullish breakout confirmation', () => {
    // 25 bars: 24 bars at normal volume 10k, 25th bar surges to 30k (3x) and breaks 20-day high
    const prices = Array.from({ length: 24 }, (_, i) => 20 + i * 0.1);
    prices.push(30); // Big breakout on bar 25

    const volumes = Array.from({ length: 24 }, () => 10000);
    volumes.push(30000); // 3x average volume

    const result = VolumeFlowIntelligenceEngine.evaluate({
      symbol: 'MWG',
      candles: createMockCandles(prices, volumes),
    });

    expect(result.volumeSpike).toBe(true);
    expect(result.volumeDryUp).toBe(false);
    expect(result.relativeVolume).toBeGreaterThan(1.5);
    expect(result.breakoutVolumeConfirmed).toBe(true);
    expect(result.priceVolumePattern).toBe('BULLISH_CONFIRMATION');
  });

  it('fails closed and flags VWAP as UNAVAILABLE when intraday ticks are absent', () => {
    const prices = [10, 11, 12, 13, 14];
    const volumes = [1000, 1000, 1000, 1000, 1000];

    const result = VolumeFlowIntelligenceEngine.evaluate({
      symbol: 'MBB',
      candles: createMockCandles(prices, volumes),
    });

    expect(result.vwap).toBeNull();
    expect(result.vwapStatus).toBe('UNAVAILABLE');
    expect(result.warnings.some((w) => w.includes('VWAP_UNAVAILABLE'))).toBe(true);
  });

  it('computes VWAP accurately when real intraday ticks are provided', () => {
    const candles = createMockCandles([10, 11], [1000, 1000]);
    const ticks = [
      { price: 10.0, volume: 100 },
      { price: 12.0, volume: 100 },
    ]; // VWAP = (1000 + 1200) / 200 = 11.0

    const result = VolumeFlowIntelligenceEngine.evaluate({
      symbol: 'MBB',
      candles,
      intradayTicks: ticks,
    });

    expect(result.vwap).toBe(11.0);
    expect(result.vwapStatus).toBe('COMPUTED');
  });
});
