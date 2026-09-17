import { describe, it, expect } from 'vitest';
import { MarketBreadthEngine } from '../MarketBreadthEngine.ts';
import type { ConstituentCandleData } from '../types.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function createMockCandles(prices: number[], volumes?: number[]): CandlePoint[] {
  return prices.map((p, idx) => ({
    time: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    open: p * 0.99,
    high: p * 1.01,
    low: p * 0.98,
    close: p,
    volume: volumes ? volumes[idx] : 10000,
  }));
}

describe('MarketBreadthEngine', () => {
  it('handles empty constituent universe with fail-closed result', () => {
    const result = MarketBreadthEngine.evaluate([]);
    expect(result.totalConstituents).toBe(0);
    expect(result.validConstituents).toBe(0);
    expect(result.coverageRatio).toBe(0);
    expect(result.advanceCount).toBe(0);
    expect(result.declineCount).toBe(0);
    expect(result.unchangedCount).toBe(0);
    expect(result.advanceDeclineRatio).toBeNull();
    expect(result.breadthThrust).toBeNull();
    expect(result.percentAboveMA20).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('correctly calculates advances, declines, and volume metrics', () => {
    const constituents: ConstituentCandleData[] = [
      {
        symbol: 'STOCK_A',
        candles: createMockCandles([10, 12], [5000, 10000]), // Advance, UpVol: 10000
      },
      {
        symbol: 'STOCK_B',
        candles: createMockCandles([20, 18], [5000, 20000]), // Decline, DownVol: 20000
      },
      {
        symbol: 'STOCK_C',
        candles: createMockCandles([15, 15], [5000, 5000]),  // Unchanged
      },
    ];

    const result = MarketBreadthEngine.evaluate(constituents);

    expect(result.totalConstituents).toBe(3);
    expect(result.validConstituents).toBe(3);
    expect(result.coverageRatio).toBe(1.0);
    expect(result.advanceCount).toBe(1);
    expect(result.declineCount).toBe(1);
    expect(result.unchangedCount).toBe(1);
    expect(result.advanceDeclineRatio).toBe(1.0); // 1 / 1
    expect(result.breadthThrust).toBe(0.5); // 1 / (1 + 1)
    expect(result.upVolume).toBe(10000);
    expect(result.downVolume).toBe(20000);
    expect(result.upDownVolumeRatio).toBe(0.5); // 10000 / 20000
    expect(result.marketParticipation).toBe(0.3333); // 10000 / 30000
  });

  it('computes moving average participation across valid bars', () => {
    // Generate 60 bars for Stock A (uptrend, above MA20 & MA50)
    const uptrendPrices = Array.from({ length: 60 }, (_, i) => 10 + i * 0.5);
    // Generate 60 bars for Stock B (downtrend, below MA20 & MA50)
    const downtrendPrices = Array.from({ length: 60 }, (_, i) => 50 - i * 0.5);

    const constituents: ConstituentCandleData[] = [
      { symbol: 'AAA', candles: createMockCandles(uptrendPrices) },
      { symbol: 'BBB', candles: createMockCandles(downtrendPrices) },
    ];

    const result = MarketBreadthEngine.evaluate(constituents);

    expect(result.validConstituents).toBe(2);
    expect(result.percentAboveMA20).toBe(0.5); // 1 out of 2
    expect(result.percentAboveMA50).toBe(0.5); // 1 out of 2
  });

  it('handles corrupted or NaN candle data without crashing', () => {
    const constituents: ConstituentCandleData[] = [
      {
        symbol: 'CORRUPT_1',
        candles: [
          { time: '2025-01-01', open: NaN, high: 10, low: 5, close: NaN, volume: 100 },
        ],
      },
      {
        symbol: 'CORRUPT_2',
        candles: [],
      },
      {
        symbol: 'VALID_1',
        candles: createMockCandles([10, 11]),
      },
    ];

    const result = MarketBreadthEngine.evaluate(constituents);
    expect(result.totalConstituents).toBe(3);
    expect(result.validConstituents).toBe(1);
    expect(result.advanceCount).toBe(1);
    expect(result.coverageRatio).toBeCloseTo(0.3333, 2);
    expect(result.warnings.some((w) => w.includes('LOW_COVERAGE'))).toBe(true);
  });
});
