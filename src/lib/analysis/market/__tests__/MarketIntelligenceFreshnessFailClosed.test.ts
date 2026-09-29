import { describe, it, expect } from 'vitest';
import { MarketIntelligenceSnapshotBuilder } from '../MarketIntelligenceSnapshotBuilder.ts';
import type { CandlePoint } from '../../../indicators/types.ts';
import type { ConstituentCandleData } from '../types.ts';

function createMockCandles(count: number, startPrice = 100, volume = 50000): CandlePoint[] {
  return Array.from({ length: count }, (_, idx) => {
    const d = new Date(Date.UTC(2026, 0, idx + 1));
    const timeStr = d.toISOString().slice(0, 10);
    const p = startPrice + idx * 0.5;
    return {
      time: timeStr,
      open: p,
      high: p * 1.02,
      low: p * 0.98,
      close: p,
      volume,
    };
  });
}

describe('Phase 20 — Market Intelligence Freshness & Fail-Closed Integrity', () => {
  it('propagates CURRENT freshness when valid constituent and index data exist', () => {
    const indexCandles = createMockCandles(60, 1200);
    const constituents: ConstituentCandleData[] = [
      { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(60, 25) },
      { symbol: 'FPT', sectorId: 'technology', candles: createMockCandles(60, 110) },
      { symbol: 'VCB', sectorId: 'banking', candles: createMockCandles(60, 90) },
    ];

    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      asOf: '2026-03-25T15:00:00.000Z',
      fetchedAt: '2026-03-25T15:00:00.000Z',
    });

    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.fetchedAt).toBe('2026-03-25T15:00:00.000Z');
    expect(typeof snapshot.sourceTimestamp).toBe('number');
    expect(snapshot.sourceTimestamp).toBeGreaterThan(0);
    expect(snapshot.dataQuality.isFailClosed).toBe(false);
    expect(snapshot.dataQuality.coveragePercent).toBe(100);
  });

  it('sets dataFreshness to UNAVAILABLE when constituents are empty (fail closed)', () => {
    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles: [],
      constituents: [],
      asOf: '2026-03-25T15:00:00.000Z',
    });

    expect(snapshot.dataFreshness).toBe('UNAVAILABLE');
    expect(snapshot.dataQuality.validSymbols).toBe(0);
    expect(snapshot.dataQuality.isFailClosed).toBe(true);
    expect(snapshot.regime.regime).toBe('UNKNOWN');
    expect(snapshot.supportResistance?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.breakdownRisk?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.recoveryStrength?.status).toBe('DATA_UNAVAILABLE');
  });

  it('sets dataFreshness to STALE when market coverage is degraded below 50%', () => {
    const constituents: ConstituentCandleData[] = [
      { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(60, 25) },
    ];

    // Force degraded condition by specifying custom universe where only 1 of 5 symbols returned
    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles: createMockCandles(60, 1200),
      constituents: [
        { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(60, 25) },
        // Invalid constituents with insufficient candles
        { symbol: 'FPT', sectorId: 'technology', candles: [] },
        { symbol: 'VCB', sectorId: 'banking', candles: [] },
        { symbol: 'MWG', sectorId: 'retail', candles: [] },
      ],
      asOf: '2026-03-25T15:00:00.000Z',
    });

    // 1 valid out of 4 total symbols = 25% coverage (< 50% threshold)
    expect(snapshot.dataQuality.coveragePercent).toBe(25);
    expect(snapshot.dataQuality.isFailClosed).toBe(true);
    expect(snapshot.dataFreshness).toBe('STALE');
    expect(snapshot.warnings.some((w) => w.includes('DATA_QUALITY_ALERT'))).toBe(true);
  });

  it('respects explicitly provided PR-01 freshness status (e.g. STALE or INVALID)', () => {
    const indexCandles = createMockCandles(60, 1200);
    const constituents: ConstituentCandleData[] = [
      { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(60, 25) },
    ];

    const staleSnapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      dataFreshness: 'STALE',
      asOf: '2026-03-25T15:00:00.000Z',
    });
    expect(staleSnapshot.dataFreshness).toBe('STALE');

    const invalidSnapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      dataFreshness: 'INVALID',
      asOf: '2026-03-25T15:00:00.000Z',
    });
    expect(invalidSnapshot.dataFreshness).toBe('INVALID');
  });

  it('never synthesizes fake index prices when indexCandles is empty (fail-closed benchmark)', () => {
    const constituents: ConstituentCandleData[] = [
      { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(60, 25) },
      { symbol: 'FPT', sectorId: 'technology', candles: createMockCandles(60, 110) },
      { symbol: 'VCB', sectorId: 'banking', candles: createMockCandles(60, 90) },
    ];

    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles: [], // index candle feed unavailable
      constituents,
      asOf: '2026-03-25T15:00:00.000Z',
    });

    // Breadth still evaluates on valid constituent candles
    expect(snapshot.breadth.validConstituents).toBe(3);
    expect(snapshot.breadth.advanceCount + snapshot.breadth.declineCount + snapshot.breadth.unchangedCount).toBe(3);

    // But index-dependent analytics fail closed without generating synthetic values
    expect(snapshot.regime.regime).toBe('UNKNOWN');
    expect(snapshot.regime.confidence).toBe(0);
    expect(snapshot.regime.scores.trendScore).toBeNull();
    expect(snapshot.supportResistance?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.supportResistance?.currentPrice).toBeNull();
    expect(snapshot.breakdownRisk?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.recoveryStrength?.status).toBe('DATA_UNAVAILABLE');
  });

  it('guarantees deterministic output (identical inputs produce identical snapshots)', () => {
    const indexCandles = createMockCandles(55, 1250);
    const constituents: ConstituentCandleData[] = [
      { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(55, 27) },
      { symbol: 'MWG', sectorId: 'retail', candles: createMockCandles(55, 45) },
    ];

    const run1 = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      asOf: '2026-03-25T10:00:00.000Z',
      fetchedAt: '2026-03-25T10:00:00.000Z',
      sourceTimestamp: 1774432800000,
    });

    const run2 = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      asOf: '2026-03-25T10:00:00.000Z',
      fetchedAt: '2026-03-25T10:00:00.000Z',
      sourceTimestamp: 1774432800000,
    });

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });
});
