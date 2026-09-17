import { describe, it, expect } from 'vitest';
import { RelativeStrengthEngine } from '../RelativeStrengthEngine.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function createMockCandles(prices: number[]): CandlePoint[] {
  return prices.map((p, idx) => ({
    time: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    open: p,
    high: p * 1.01,
    low: p * 0.99,
    close: p,
    volume: 10000,
  }));
}

describe('RelativeStrengthEngine', () => {
  it('computes excess return and RS scores correctly across available timeframes', () => {
    // 30 bars: Stock outperforming benchmark
    const assetPrices = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5); // +145%
    const bmkPrices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.2); // +6%

    const result = RelativeStrengthEngine.evaluate({
      symbol: 'TCB',
      assetCandles: createMockCandles(assetPrices),
      benchmarkCandles: createMockCandles(bmkPrices),
      benchmarkName: 'VN-INDEX',
    });

    expect(result.symbol).toBe('TCB');
    expect(result.benchmark).toBe('VN-INDEX');
    expect(result.periods['1W'].excessReturn).toBeGreaterThan(0);
    expect(result.periods['1M'].excessReturn).toBeGreaterThan(0);
    expect(result.overallRS).toBeGreaterThan(50);
    expect(result.warnings.some((w) => w.includes('CORPORATE_ACTION_NOTE'))).toBe(true);
  });

  it('fails closed when candles are insufficient', () => {
    const result = RelativeStrengthEngine.evaluate({
      symbol: 'VNM',
      assetCandles: createMockCandles([10, 11]),
      benchmarkCandles: createMockCandles([100, 101]),
    });

    expect(result.overallRS).toBeNull();
    expect(result.warnings.some((w) => w.includes('INSUFFICIENT_ASSET_DATA'))).toBe(true);
  });
});
