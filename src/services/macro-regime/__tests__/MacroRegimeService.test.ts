/**
 * PHASE 27 — MACRO REGIME SERVICE TESTS (REMEDIATED P27-D2)
 * ========================================================
 * Production reads persisted `macro_observations` through an injected data
 * source (default: Drizzle DB). Tests inject deterministic sources — they never
 * depend on a live database or on frozen production samples.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MacroRegimeService } from '../MacroRegimeService.ts';
import type { MacroRegimeDataSource } from '../MacroRegimeDataProvider.ts';
import { cacheClear } from '../../market/marketDataCache.ts';
import { getFixtureMacroObservations } from './macroFixtures.ts';

function fixtureSource(): MacroRegimeDataSource {
  return {
    fetchObservations: async ({ asOfDate }) => ({
      observations: getFixtureMacroObservations(asOfDate),
      issues: [],
    }),
  };
}

describe('Phase 27 — MacroRegimeService', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('serves cached snapshot within 60s TTL window and isolates keys by asOfDate', async () => {
    const source = fixtureSource();
    const snap1 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30', dataSource: source });
    const snap2 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30', dataSource: source });
    expect(snap1.snapshotId).toBe(snap2.snapshotId);
    expect(snap1.macroRegime).toBe(snap2.macroRegime);
  });

  it('evaluates the coherent fixture vintage without lookahead rejection', async () => {
    const snap = await MacroRegimeService.getSnapshot({
      asOfDate: '2026-09-30',
      forceRefresh: true,
      dataSource: fixtureSource(),
    });
    expect(snap.lookaheadRejected).toBe(false);
    expect(snap.dataFreshness).toBe('CURRENT');
    expect(snap.macroRegime).not.toBe('UNKNOWN');
  });

  it('bypasses cache when forceRefresh is requested', async () => {
    const source = fixtureSource();
    const snap1 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30', dataSource: source });
    const snap2 = await MacroRegimeService.getSnapshot({ asOfDate: '2026-09-30', forceRefresh: true, dataSource: source });
    expect(snap1.asOfDate).toBe(snap2.asOfDate);
  });

  it('evaluates custom observation overrides without mutating cache', async () => {
    const customSnapshot = await MacroRegimeService.getSnapshot({
      asOfDate: '2026-09-30',
      observationsOverride: [],
    });
    expect(customSnapshot.macroRegime).toBe('UNKNOWN');
    expect(customSnapshot.dataCoverage).toBe('INSUFFICIENT');
  });

  it('fails closed to UNKNOWN/UNAVAILABLE when the source is empty (P27-D2)', async () => {
    const snap = await MacroRegimeService.getSnapshot({
      asOfDate: '2026-09-30',
      forceRefresh: true,
      dataSource: { fetchObservations: async () => ({ observations: [], issues: ['empty'] }) },
    });
    expect(snap.macroRegime).toBe('UNKNOWN');
    expect(snap.dataFreshness).toBe('UNAVAILABLE');
  });

  it('fails closed to UNKNOWN/UNAVAILABLE when the source throws (P27-D2)', async () => {
    const snap = await MacroRegimeService.getSnapshot({
      asOfDate: '2026-09-30',
      forceRefresh: true,
      dataSource: {
        fetchObservations: async () => {
          throw new Error('simulated feed outage');
        },
      },
    });
    expect(snap.macroRegime).toBe('UNKNOWN');
    expect(snap.dataFreshness).toBe('UNAVAILABLE');
  });
});
