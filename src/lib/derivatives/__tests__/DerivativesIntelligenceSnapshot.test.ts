import { describe, it, expect } from 'vitest';
import { DerivativesIntelligenceSnapshotBuilder } from '../DerivativesIntelligenceSnapshotBuilder.ts';
import { VietnamDerivativesRegistry } from '../VietnamDerivativesRegistry.ts';
import type { DerivativesQuote, SpotIndexQuote } from '../types.ts';

function createValidFuturesQuote(): DerivativesQuote {
  return {
    symbol: 'VN30F1M',
    contractCode: 'VN30F2604',
    underlying: 'VN30',
    price: 1320.0,
    open: 1315.0,
    high: 1325.0,
    low: 1312.0,
    close: 1320.0,
    referencePrice: 1315.0,
    ceilingPrice: 1407.0,
    floorPrice: 1223.0,
    change: 5.0,
    changePercent: 0.38,
    volume: 150_000,
    tradingValue: null,
    openInterest: 42_000,
    source: 'VPS_DERIVATIVES',
    sourceTimestamp: 1776000000000,
    fetchedAt: '2026-04-10T14:00:00.000Z',
    dataFreshness: 'CURRENT',
  };
}

function createValidSpotQuote(): SpotIndexQuote {
  return {
    symbol: 'VN30',
    price: 1312.5,
    referencePrice: 1310.0,
    change: 2.5,
    changePercent: 0.19,
    source: 'VPS_INDEX',
    sourceTimestamp: 1776000000000,
    fetchedAt: '2026-04-10T14:00:00.000Z',
    dataFreshness: 'CURRENT',
  };
}

describe('Phase 21.6 — Derivatives Intelligence Snapshot Builder', () => {
  it('builds a complete deterministic snapshot with LIVE status when data is fresh', () => {
    const activeContract = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 4, '2026-04-10');
    const quote = createValidFuturesQuote();
    const spotQuote = createValidSpotQuote();

    const snapshot = DerivativesIntelligenceSnapshotBuilder.build({
      underlying: 'VN30',
      activeContract,
      quote,
      spotQuote,
      previousOI: 40_000,
      fetchedAt: '2026-04-10T14:00:00.000Z',
    });

    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.sourceTimestamp).toBe(1776000000000);
    expect(snapshot.basis.basis).toBe(7.5); // 1320 - 1312.5
    expect(snapshot.basis.status).toBe('LIVE');
    expect(snapshot.openInterest.openInterestChange).toBe(2000); // 42000 - 40000
    expect(snapshot.openInterest.positioning).toBe('LONG_ACCUMULATION'); // Price up + OI up
    expect(snapshot.regime.regime).toBe('MILD_CONTANGO'); // basisPct = 7.5/1312.5*100 = 0.57%
    expect(snapshot.dataLineage.engine).toBe('DerivativesIntelligenceEngine');
    expect(snapshot.dataLineage.calculationVersion).toBe('21.0.0-PROD');
  });

  describe('Freshness & Fail-Closed Hierarchy', () => {
    it('sets aggregate freshness to INVALID when either feed is INVALID', () => {
      const activeContract = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 4, '2026-04-10');
      const quote = createValidFuturesQuote();
      const spotQuote = createValidSpotQuote();
      quote.dataFreshness = 'INVALID';

      const snapshot = DerivativesIntelligenceSnapshotBuilder.build({
        underlying: 'VN30',
        activeContract,
        quote,
        spotQuote,
      });

      expect(snapshot.dataFreshness).toBe('INVALID');
    });

    it('sets aggregate freshness to UNAVAILABLE when futures price is null', () => {
      const activeContract = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 4, '2026-04-10');
      const quote = createValidFuturesQuote();
      quote.price = null;
      quote.dataFreshness = 'UNAVAILABLE';
      const spotQuote = createValidSpotQuote();

      const snapshot = DerivativesIntelligenceSnapshotBuilder.build({
        underlying: 'VN30',
        activeContract,
        quote,
        spotQuote,
      });

      expect(snapshot.dataFreshness).toBe('UNAVAILABLE');
      expect(snapshot.basis.basis).toBeNull();
      expect(snapshot.basis.status).toBe('DATA_UNAVAILABLE');
      expect(snapshot.regime.regime).toBe('UNKNOWN');
    });

    it('sets aggregate freshness to STALE when either feed is STALE', () => {
      const activeContract = VietnamDerivativesRegistry.createSpecification('VN30', '1M', 2026, 4, '2026-04-10');
      const quote = createValidFuturesQuote();
      const spotQuote = createValidSpotQuote();
      spotQuote.dataFreshness = 'STALE';

      const snapshot = DerivativesIntelligenceSnapshotBuilder.build({
        underlying: 'VN30',
        activeContract,
        quote,
        spotQuote,
      });

      expect(snapshot.dataFreshness).toBe('STALE');
    });
  });
});
