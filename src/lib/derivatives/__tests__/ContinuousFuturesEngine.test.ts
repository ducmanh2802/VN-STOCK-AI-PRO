import { describe, it, expect } from 'vitest';
import { ContinuousFuturesEngine } from '../ContinuousFuturesEngine.ts';
import { VietnamDerivativesRegistry } from '../VietnamDerivativesRegistry.ts';
import type { CandlePoint } from '../types.ts';

describe('Phase 21 Continuous Futures Series Engine', () => {
  it('stitches historical bars chronologically across rollover dates (UNADJUSTED)', () => {
    const c1 = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 3, '2026-03-01');
    const c2 = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 4, '2026-04-01');

    // c1 expires on 2026-03-19 (third Thursday)
    const barsC1: CandlePoint[] = [
      { time: '2026-03-17', open: 1300, high: 1310, low: 1295, close: 1305, volume: 10000 },
      { time: '2026-03-18', open: 1305, high: 1315, low: 1300, close: 1310, volume: 12000 },
      { time: '2026-03-19', open: 1310, high: 1320, low: 1308, close: 1315, volume: 15000 },
      { time: '2026-03-20', open: 1315, high: 1325, low: 1310, close: 1320, volume: 1000 }, // post roll bar in old contract
    ];

    const barsC2: CandlePoint[] = [
      { time: '2026-03-19', open: 1318, high: 1328, low: 1315, close: 1325, volume: 20000 }, // roll day
      { time: '2026-03-20', open: 1325, high: 1335, low: 1320, close: 1330, volume: 22000 },
      { time: '2026-03-23', open: 1330, high: 1340, low: 1328, close: 1335, volume: 25000 },
    ];

    const series = ContinuousFuturesEngine.buildSeries({
      underlying: 'VN30',
      method: 'UNADJUSTED',
      contracts: [c1, c2],
      contractBars: {
        [c1.contractCode]: barsC1,
        [c2.contractCode]: barsC2,
      },
    });

    expect(series.bars.length).toBe(5);
    // Dates must be in chronological order
    expect(series.bars.map((b) => b.time)).toEqual([
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-23',
    ]);

    // Check transition from c1 to c2 on 2026-03-20
    expect(series.bars[2].contractCode).toBe(c1.contractCode);
    expect(series.bars[3].contractCode).toBe(c2.contractCode);
    expect(series.bars[3].close).toBe(1330);
  });

  it('applies backward difference adjustments deterministically without lookahead bias', () => {
    const c1 = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 3, '2026-03-01');
    const c2 = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 4, '2026-04-01');

    // On roll date 2026-03-19: c1 close = 1315, c2 close = 1325 (diff = +10)
    const barsC1: CandlePoint[] = [
      { time: '2026-03-18', open: 1305, high: 1315, low: 1300, close: 1310, volume: 12000 },
      { time: '2026-03-19', open: 1310, high: 1320, low: 1308, close: 1315, volume: 15000 },
    ];
    const barsC2: CandlePoint[] = [
      { time: '2026-03-19', open: 1318, high: 1328, low: 1315, close: 1325, volume: 20000 },
      { time: '2026-03-20', open: 1325, high: 1335, low: 1320, close: 1330, volume: 22000 },
    ];

    const series = ContinuousFuturesEngine.buildSeries({
      underlying: 'VN30',
      method: 'BACKWARD_DIFFERENCE',
      contracts: [c1, c2],
      contractBars: {
        [c1.contractCode]: barsC1,
        [c2.contractCode]: barsC2,
      },
    });

    // Bars prior to or on roll date (c1 bars) should be shifted by +10
    expect(series.bars[0].close).toBe(1320); // 1310 + 10
    expect(series.bars[1].close).toBe(1325); // 1315 + 10
    expect(series.bars[2].close).toBe(1330); // c2 bar remains unshifted
  });
});
