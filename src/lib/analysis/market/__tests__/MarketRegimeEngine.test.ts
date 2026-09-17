import { describe, it, expect } from 'vitest';
import { MarketRegimeEngine } from '../MarketRegimeEngine.ts';
import { MarketBreadthEngine } from '../MarketBreadthEngine.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function createMockCandles(prices: number[]): CandlePoint[] {
  return prices.map((p, idx) => ({
    time: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    open: p * 0.99,
    high: p * 1.01,
    low: p * 0.98,
    close: p,
    volume: 100000,
  }));
}

describe('MarketRegimeEngine', () => {
  it('classifies strong continuous uptrend with high breadth as BULL_TREND', () => {
    // 60 bars in solid upward trajectory
    const prices = Array.from({ length: 60 }, (_, i) => 1000 + i * 10);
    const indexCandles = createMockCandles(prices);

    const mockBreadth = MarketBreadthEngine.evaluate([
      { symbol: 'A', candles: createMockCandles([10, 12]) },
      { symbol: 'B', candles: createMockCandles([20, 22]) },
    ]);

    const result = MarketRegimeEngine.evaluate({
      indexCandles,
      breadth: mockBreadth,
    });

    expect(result.regime).toBe('BULL_TREND');
    expect(result.scores.trendScore).toBeGreaterThan(60);
    expect(result.scores.momentumScore).toBeGreaterThan(50);
    expect(result.confidence).toBeGreaterThan(50);
    expect(result.dataLineage.universe).toBe('VN-INDEX');
  });

  it('classifies strong continuous downtrend as BEAR_TREND', () => {
    // 60 bars in steady decline
    const prices = Array.from({ length: 60 }, (_, i) => 1500 - i * 10);
    const indexCandles = createMockCandles(prices);

    const mockBreadth = MarketBreadthEngine.evaluate([
      { symbol: 'A', candles: createMockCandles([12, 10]) },
      { symbol: 'B', candles: createMockCandles([22, 20]) },
    ]);

    const result = MarketRegimeEngine.evaluate({
      indexCandles,
      breadth: mockBreadth,
    });

    expect(result.regime).toBe('BEAR_TREND');
    expect(result.scores.trendScore).toBeLessThan(40);
  });

  it('returns UNKNOWN with 0 confidence when index data is insufficient', () => {
    const result = MarketRegimeEngine.evaluate({
      indexCandles: createMockCandles([1000, 1010]),
    });

    expect(result.regime).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(result.warnings.some((w) => w.includes('INSUFFICIENT_INDEX_DATA'))).toBe(true);
  });
});
