/**
 * DATA-01 TESTS — instrument identity, bars, coverage, determinism
 */
import { describe, it, expect } from 'vitest';
import { InstrumentIdentityEngine } from '../InstrumentIdentityEngine.ts';
import { HistoricalBarsEngine, CoverageEngine } from '../HistoricalBarsEngine.ts';
import type { CanonicalBar } from '../types.ts';

function bar(date: string, close: number, extra?: Partial<CanonicalBar>): CanonicalBar {
  return {
    instrumentId: 'VN-HOSE-HPG',
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    value: close * 1000,
    source: 'KBS',
    quality: 'VALID',
    ...extra,
  };
}

describe('InstrumentIdentityEngine', () => {
  it('registers a valid instrument and never uses ticker as permanent id', () => {
    const inst = InstrumentIdentityEngine.register({
      instrumentId: 'VN-HOSE-HPG',
      symbol: 'hpg',
      exchange: 'HOSE',
      assetClass: 'EQUITY',
      validFrom: '2020-01-01',
    });
    expect(inst.instrumentId).toBe('VN-HOSE-HPG');
    expect(inst.symbol).toBe('HPG');
    expect(inst.currency).toBe('VND');
  });

  it('rejects invalid symbol and validity range', () => {
    expect(() =>
      InstrumentIdentityEngine.register({
        instrumentId: 'x',
        symbol: 'bad symbol!',
        exchange: 'HOSE',
        assetClass: 'EQUITY',
        validFrom: '2020-01-01',
      })
    ).toThrow();
    expect(() =>
      InstrumentIdentityEngine.register({
        instrumentId: 'x',
        symbol: 'HPG',
        exchange: 'HOSE',
        assetClass: 'EQUITY',
        validFrom: '2021-01-01',
        validTo: '2020-01-01',
      })
    ).toThrow();
  });

  it('applies symbol change, tracks previous symbols, resolves asOf', () => {
    const v1 = InstrumentIdentityEngine.register({
      instrumentId: 'VN-HOSE-XYZ',
      symbol: 'XYZ',
      exchange: 'HOSE',
      assetClass: 'EQUITY',
      validFrom: '2020-01-01',
    });
    const v2 = InstrumentIdentityEngine.applySymbolChange(v1, {
      instrumentId: 'VN-HOSE-XYZ',
      fromSymbol: 'XYZ',
      toSymbol: 'XYZ2',
      effectiveDate: '2022-06-01',
    });
    expect(v2.symbol).toBe('XYZ2');
    expect(v2.previousSymbols).toContain('XYZ');
    const got = InstrumentIdentityEngine.getInstrumentAsOf([v1, v2], 'VN-HOSE-XYZ', '2021-01-01');
    expect(got?.symbol).toBe('XYZ');
  });

  it('keeps delisted instruments queryable via includeDelisted', () => {
    const active = InstrumentIdentityEngine.register({
      instrumentId: 'A', symbol: 'AAA', exchange: 'HOSE', assetClass: 'EQUITY', validFrom: '2020-01-01',
    });
    const dead = InstrumentIdentityEngine.register({
      instrumentId: 'D', symbol: 'DDD', exchange: 'HOSE', assetClass: 'EQUITY',
      status: 'DELISTED', validFrom: '2020-01-01', validTo: '2023-01-01',
    });
    const onlyActive = InstrumentIdentityEngine.getUniverseAsOf([active, dead], '2022-01-01');
    expect(onlyActive.map((x) => x.symbol)).toEqual(['AAA']);
    const withDead = InstrumentIdentityEngine.getUniverseAsOf([active, dead], '2022-01-01', { includeDelisted: true });
    expect(withDead.map((x) => x.symbol).sort()).toEqual(['AAA', 'DDD']);
  });
});

describe('HistoricalBarsEngine', () => {
  it('detects invalid OHLC and skips duplicates deterministically', () => {
    const bars = [
      bar('2024-01-02', 100),
      bar('2024-01-03', 101),
      bar('2024-01-03', 101),
      { ...bar('2024-01-04', 0), open: 0, high: 0, low: 0, close: 0 },
      { ...bar('2024-01-05', 50), high: 1 },
    ];
    const { clean, duplicates, invalid } = HistoricalBarsEngine.normalize(bars);
    expect(clean.map((b) => b.date)).toEqual(['2024-01-02', '2024-01-03']);
    expect(duplicates).toEqual(['2024-01-03']);
    expect(invalid.length).toBe(2);
  });

  it('queries are deterministic for same instrument+range+version', () => {
    const bars = [bar('2024-01-03', 101), bar('2024-01-02', 100), bar('2024-01-04', 102)];
    const a = HistoricalBarsEngine.query(bars, { instrumentId: 'VN-HOSE-HPG', from: '2024-01-01', to: '2024-12-31' });
    const b = HistoricalBarsEngine.query(bars, { instrumentId: 'VN-HOSE-HPG', from: '2024-01-01', to: '2024-12-31' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.map((x) => x.date)).toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
  });
});

describe('CoverageEngine', () => {
  it('reports first/last/gaps/invalid/volume anomalies', () => {
    const bars = [
      bar('2024-01-02', 100),
      bar('2024-01-04', 101),
      { ...bar('2024-01-05', 102), volume: 1000000 },
    ];
    const rep = CoverageEngine.analyze('VN-HOSE-HPG', bars, { volumeSpikeMultiple: 2 });
    expect(rep.firstObservation).toBe('2024-01-02');
    expect(rep.lastObservation).toBe('2024-01-05');
    expect(rep.missingPeriods).toContain('2024-01-03');
    expect(rep.gapCount).toBe(1);
    expect(rep.invalidOhlcCount).toBe(0);
    expect(rep.volumeAnomalyCount).toBe(1);
  });
});
