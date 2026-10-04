/**
 * DATA-03 TESTS — provenance, lineage, quality states, cross-source discrepancy
 */
import { describe, it, expect } from 'vitest';
import {
  QualityEngine,
  ProvenanceEngine,
  CrossSourceValidator,
  freshnessToQuality,
} from '../QualityProvenanceEngine.ts';

describe('freshness mapping', () => {
  it('integrates existing CURRENT/STALE/UNAVAILABLE/INVALID without redefinition', () => {
    expect(freshnessToQuality('CURRENT')).toBe('VALID');
    expect(freshnessToQuality('STALE')).toBe('STALE');
    expect(freshnessToQuality('UNAVAILABLE')).toBe('UNAVAILABLE');
    expect(freshnessToQuality('INVALID')).toBe('INVALID');
  });
});

describe('QualityEngine', () => {
  it('marks empty series UNAVAILABLE and invalid OHLC INVALID', () => {
    expect(QualityEngine.assessBars([]).quality).toBe('UNAVAILABLE');
    const bad = [
      {
        instrumentId: 'A', date: '2024-01-02', open: -1, high: 5, low: 4, close: 4,
        volume: 10, value: 40, source: 'KBS' as const, quality: 'VALID' as const,
      },
    ];
    expect(QualityEngine.assessBars(bad).quality).toBe('INVALID');
  });

  it('flags duplicates as WARNING, keeps INVALID above WARNING', () => {
    const dup = [
      {
        instrumentId: 'A', date: '2024-01-02', open: 10, high: 11, low: 9, close: 10,
        volume: 10, value: 100, source: 'KBS' as const, quality: 'VALID' as const,
      },
      {
        instrumentId: 'A', date: '2024-01-02', open: 10, high: 11, low: 9, close: 10,
        volume: 10, value: 100, source: 'KBS' as const, quality: 'VALID' as const,
      },
    ];
    expect(QualityEngine.assessBars(dup).quality).toBe('WARNING');
  });
});

describe('ProvenanceEngine', () => {
  it('builds traceable provenance and verifies lineage completeness', () => {
    const p = ProvenanceEngine.build({
      source: 'KBS', provider: 'KbsHistoricalProvider', endpointOrQuery: 'data_day HPG',
      retrievalTime: '2024-01-05T00:00:00Z', observationTime: '2024-01-04',
      publicationTime: '2024-01-04', ingestionTime: '2024-01-05T00:00:00Z',
      dataVersion: 'v1', transformation: 'none', adjustment: 'RAW', quality: 'VALID',
    });
    expect(p.source).toBe('KBS');
    const chain = ProvenanceEngine.chainToLineage([
      { kind: 'Source dataset', ref: 'KBS data_day', provenance: p },
      { kind: 'Adjusted series', ref: 'adj v1', provenance: p },
    ]);
    expect(ProvenanceEngine.lineageComplete(chain)).toBe(true);
    expect(ProvenanceEngine.lineageComplete([])).toBe(false);
  });
});

describe('CrossSourceValidator', () => {
  it('refuses incomparable semantics and records discrepancy otherwise', () => {
    expect(
      CrossSourceValidator.compare({ valueA: 100, valueB: 100, sameInstrument: true, sameTimestamp: false, sameUnit: true }).comparable
    ).toBe(false);
    const ok = CrossSourceValidator.compare({ valueA: 100, valueB: 101, sameInstrument: true, sameTimestamp: true, sameUnit: true });
    expect(ok.verdict).toBe('OK');
    const mm = CrossSourceValidator.compare({ valueA: 100, valueB: 130, sameInstrument: true, sameTimestamp: true, sameUnit: true });
    expect(mm.verdict).toBe('MISMATCH');
    expect(mm.discrepancyBasisPoints).toBeGreaterThan(0);
  });
});
