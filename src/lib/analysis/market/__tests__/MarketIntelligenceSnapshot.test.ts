import { describe, it, expect } from 'vitest';
import { MarketIntelligenceSnapshotBuilder } from '../MarketIntelligenceSnapshotBuilder.ts';
import type { CandlePoint } from '../../../indicators/types.ts';

function createMockCandles(prices: number[], volumes?: number[]): CandlePoint[] {
  return prices.map((p, idx) => ({
    time: `2025-01-${String(idx + 1).padStart(2, '0')}`,
    open: p,
    high: p * 1.01,
    low: p * 0.99,
    close: p,
    volume: volumes ? volumes[idx] : 10000,
  }));
}

describe('MarketIntelligenceSnapshotBuilder', () => {
  it('builds an integrated, deterministic MarketIntelligenceSnapshot', () => {
    const indexPrices = Array.from({ length: 60 }, (_, i) => 1200 + i * 5);
    const indexCandles = createMockCandles(indexPrices);

    const constituents = [
      { symbol: 'HPG', sectorId: 'materials', candles: createMockCandles(Array.from({ length: 60 }, (_, i) => 20 + i * 0.2)) },
      { symbol: 'FPT', sectorId: 'technology', candles: createMockCandles(Array.from({ length: 60 }, (_, i) => 80 + i * 1.0)) },
      { symbol: 'VCB', sectorId: 'banking', candles: createMockCandles(Array.from({ length: 60 }, (_, i) => 90 - i * 0.1)) },
    ];

    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      asOf: '2025-02-01T00:00:00.000Z',
    });

    expect(snapshot.timestamp).toBe('2025-02-01T00:00:00.000Z');
    expect(snapshot.market).toBe('VIETNAM_EQUITIES');
    expect(snapshot.regime).toBeDefined();
    expect(snapshot.breadth).toBeDefined();
    expect(snapshot.sectors.length).toBeGreaterThan(0);
    expect(snapshot.topRelativeStrength.stocksVsVnIndex.length).toBeGreaterThan(0);
    expect(snapshot.dataQuality.totalUniverseSymbols).toBe(3);
    expect(snapshot.dataQuality.validSymbols).toBe(3);
    expect(snapshot.dataQuality.coveragePercent).toBe(100);
    expect(snapshot.dataQuality.isFailClosed).toBe(false);

    // Step 1: Verify Support / Resistance
    expect(snapshot.supportResistance).toBeDefined();
    expect(snapshot.supportResistance?.status).toBe('LIVE');
    expect(snapshot.supportResistance?.currentPrice).toBe(indexPrices[indexPrices.length - 1]);
    expect(snapshot.supportResistance?.nearestSupport).toBeDefined();

    // Step 1: Verify Breakdown Risk
    expect(snapshot.breakdownRisk).toBeDefined();
    expect(snapshot.breakdownRisk?.status).toBe('LIVE');
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(snapshot.breakdownRisk?.riskLevel);
    expect(snapshot.breakdownRisk?.why.length).toBeGreaterThan(0);
    expect(snapshot.breakdownRisk?.confirmationConditions.length).toBeGreaterThan(0);
    expect(snapshot.breakdownRisk?.invalidationConditions.length).toBeGreaterThan(0);

    // Step 1: Verify Recovery Strength
    expect(snapshot.recoveryStrength).toBeDefined();
    expect(snapshot.recoveryStrength?.status).toBe('LIVE');
    expect(['WEAK', 'DEVELOPING', 'CONFIRMED']).toContain(snapshot.recoveryStrength?.recoveryState);
    expect(snapshot.recoveryStrength?.why.length).toBeGreaterThan(0);
    expect(snapshot.recoveryStrength?.confirmationConditions.length).toBeGreaterThan(0);
    expect(snapshot.recoveryStrength?.invalidationConditions.length).toBeGreaterThan(0);

    // Verify determinism: re-building produces identical JSON representation
    const snapshot2 = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents,
      asOf: '2025-02-01T00:00:00.000Z',
    });
    expect(JSON.stringify(snapshot)).toBe(JSON.stringify(snapshot2));
  });

  it('handles missing/insufficient index candles gracefully with DATA_UNAVAILABLE status and zero null-to-zero conversion', () => {
    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles: [],
      constituents: [],
      asOf: '2025-02-01T00:00:00.000Z',
    });

    expect(snapshot.supportResistance?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.supportResistance?.currentPrice).toBeNull();
    expect(snapshot.supportResistance?.nearestSupport).toBeNull();
    expect(snapshot.supportResistance?.distanceToSupportPct).toBeNull();

    expect(snapshot.breakdownRisk?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.breakdownRisk?.riskLevel).toBe('DATA_UNAVAILABLE');
    expect(snapshot.breakdownRisk?.nearestSupportPrice).toBeNull();
    expect(snapshot.breakdownRisk?.distanceToSupportPct).toBeNull();

    expect(snapshot.recoveryStrength?.status).toBe('DATA_UNAVAILABLE');
    expect(snapshot.recoveryStrength?.recoveryState).toBe('DATA_UNAVAILABLE');
    expect(snapshot.recoveryStrength?.supportHoldStatus).toBeNull();
    expect(snapshot.recoveryStrength?.resistanceReclaimStatus).toBeNull();
  });
});
