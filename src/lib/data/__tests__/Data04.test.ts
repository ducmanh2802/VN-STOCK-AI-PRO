/**
 * DATA-04 TESTS — point-in-time, future publication, look-ahead, survivorship,
 * delisted assets, historical universe, reproducibility
 */
import { describe, it, expect } from 'vitest';
import { PointInTimeGuard } from '../PointInTimeGuard.ts';
import { InstrumentIdentityEngine } from '../InstrumentIdentityEngine.ts';

describe('PointInTimeGuard', () => {
  it('only publicationTime <= T is knowable', () => {
    const records = [
      { publicationDate: '2024-01-01', v: 1 },
      { publicationDate: '2024-03-01', v: 2 },
    ];
    const { knowable, rejected } = PointInTimeGuard.filterKnowable(records, '2024-02-01');
    expect(knowable.map((r) => r.v)).toEqual([1]);
    expect(rejected.map((r) => r.v)).toEqual([2]);
  });

  it('flags future earnings/fundamentals/CA/macro inputs as LOOKAHEAD', () => {
    const d = PointInTimeGuard.assertNoFutureInput({ kind: 'future earnings', publicationDate: '2024-05-01', asOf: '2024-04-01' });
    expect(d?.code).toBe('LOOKAHEAD_DETECTED');
    expect(PointInTimeGuard.assertNoFutureInput({ kind: 'macro', publicationDate: '2024-01-01', asOf: '2024-04-01' })).toBeNull();
  });

  it('flags missing publicationDate as FUTURE_PUBLICATION (cannot prove PIT)', () => {
    const d = PointInTimeGuard.assertNoFutureInput({ kind: 'fundamentals', publicationDate: null, asOf: '2024-04-01' });
    expect(d?.code).toBe('FUTURE_PUBLICATION');
  });

  it('supports historical universes and warns on active-only survivorship risk', () => {
    const a = InstrumentIdentityEngine.register({
      instrumentId: 'A', symbol: 'AAA', exchange: 'HOSE', assetClass: 'EQUITY', validFrom: '2020-01-01',
    });
    const d = InstrumentIdentityEngine.register({
      instrumentId: 'D', symbol: 'DDD', exchange: 'HOSE', assetClass: 'EQUITY',
      status: 'DELISTED', validFrom: '2020-01-01', validTo: '2023-06-01',
    });
    const activeOnly = PointInTimeGuard.getUniverseAsOf([a, d], '2022-01-01');
    expect(activeOnly.universe.map((x) => x.symbol)).toEqual(['AAA']);
    expect(activeOnly.diagnostics.map((x) => x.code)).toContain('SURVIVORSHIP_RISK');
    const full = PointInTimeGuard.getUniverseAsOf([a, d], '2022-01-01', { includeDelisted: true });
    expect(full.universe.length).toBe(2);
    const afterDelist = PointInTimeGuard.getUniverseAsOf([a, d], '2024-01-01', { includeDelisted: true });
    expect(afterDelist.universe.map((x) => x.symbol)).toEqual(['AAA']);
  });

  it('detects current-constituent leakage', () => {
    expect(
      PointInTimeGuard.detectCurrentConstituentLeak({ usedUniverseDate: null, researchAsOf: '2020-01-01' })?.code
    ).toBe('CURRENT_CONSTITUENT_LEAK');
    expect(
      PointInTimeGuard.detectCurrentConstituentLeak({ usedUniverseDate: '2024-01-01', researchAsOf: '2020-01-01' })?.code
    ).toBe('CURRENT_CONSTITUENT_LEAK');
    expect(
      PointInTimeGuard.detectCurrentConstituentLeak({ usedUniverseDate: '2019-01-01', researchAsOf: '2020-01-01' })
    ).toBeNull();
  });

  it('delisted instruments remain queryable at their valid time', () => {
    const d = InstrumentIdentityEngine.register({
      instrumentId: 'D', symbol: 'DDD', exchange: 'HOSE', assetClass: 'EQUITY',
      status: 'DELISTED', validFrom: '2020-01-01', validTo: '2023-06-01',
    });
    expect(PointInTimeGuard.getInstrumentAsOf([d], 'D', '2022-01-01')?.symbol).toBe('DDD');
    expect(PointInTimeGuard.getInstrumentAsOf([d], 'D', '2024-01-01')).toBeNull();
  });
});
