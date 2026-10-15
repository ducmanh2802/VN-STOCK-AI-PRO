/**
 * PHASE 25+ LEGACY MACRO — REMEDIATION REGRESSION TESTS
 * ====================================================
 * Evidence for legacy-stack remediation: DB-backed values with fail-closed
 * UNKNOWN on empty feeds, derived freshness, and deterministic alert IDs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MacroRegimeEngine } from '../../../lib/analysis/macro/MacroRegimeEngine.ts';
import { MacroAlertEngine } from '../../../lib/analysis/macro/MacroAlertEngine.ts';
import {
  MacroIntelligenceService,
  mapObservationsToRecords,
} from '../MacroIntelligenceService.ts';
import { cacheClear } from '../../market/marketDataCache.ts';
import { getFixtureLegacyMetrics } from './macroLegacyFixtures.ts';
import { getFixtureMacroObservations } from '../../macro-regime/__tests__/macroFixtures.ts';

describe('Legacy macro remediation — fail-closed engine', () => {
  it('returns UNKNOWN with zero confidence on an empty feed (no neutral masquerade)', () => {
    const result = MacroRegimeEngine.calculateRegime([], '2026-09-30');
    expect(result.regime).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(result.freshness).toBe('UNAVAILABLE');
  });

  it('returns UNKNOWN when every metric value is null', () => {
    const nulled = getFixtureLegacyMetrics().map((m) => ({ ...m, value: null }));
    const result = MacroRegimeEngine.calculateRegime(nulled, '2026-09-30');
    expect(result.regime).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
  });

  it('evaluates a full vintage to a concrete regime with CURRENT freshness', () => {
    const result = MacroRegimeEngine.calculateRegime(getFixtureLegacyMetrics(), '2026-09-30');
    expect(result.regime).not.toBe('UNKNOWN');
    expect(result.freshness).toBe('CURRENT');
  });

  it('derives STALE freshness on mixed inputs (never masks STALE with CURRENT)', () => {
    const mixed = getFixtureLegacyMetrics().map((m, i) => (i === 0 ? { ...m, freshness: 'STALE' as const } : m));
    const result = MacroRegimeEngine.calculateRegime(mixed, '2026-09-30');
    expect(result.freshness).toBe('STALE');
  });
});

describe('Legacy macro remediation — deterministic alerts', () => {
  const brentSpike = getFixtureLegacyMetrics().map((m) =>
    m.code === 'BRENT_OIL' ? { ...m, changePercent: 5.0 } : m
  );

  it('produces byte-identical alert IDs for identical inputs', () => {
    const first = MacroAlertEngine.evaluateAlerts(brentSpike, { asOfDate: '2026-09-30' });
    const second = MacroAlertEngine.evaluateAlerts(brentSpike, { asOfDate: '2026-09-30' });
    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first[0].id).toBe(`ALERT_BRENT_OIL_2026-09-30`);
  });
});

describe('Legacy macro remediation — DB-backed service', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('maps persisted observations to records with feed-driven values only', () => {
    const records = mapObservationsToRecords(getFixtureMacroObservations(), '2026-09-30');
    const gdp = records.find((r) => r.code === 'VN_GDP_GROWTH');
    expect(gdp?.value).toBe(6.82);
    expect(gdp?.source).toContain('GSO');
    expect(gdp?.freshness).toBe('CURRENT');
    // Codes with descriptors but no rows are omitted (never fabricated).
    expect(records.find((r) => r.code === 'SBV_OMO_RATE')).toBeUndefined();
    expect(records.find((r) => r.code === 'HOSE_FOREIGN_FLOW')).toBeUndefined();
  });

  it('fails closed to UNKNOWN/UNAVAILABLE on an empty feed', async () => {
    const snapshot = await MacroIntelligenceService.getSnapshot({
      asOfDate: '2026-09-30',
      forceRefresh: true,
      metricsOverride: [],
    });
    expect(snapshot.regime.regime).toBe('UNKNOWN');
    expect(snapshot.dataFreshness).toBe('UNAVAILABLE');
  });

  it('serves a coherent vintage from metricsOverride without touching cache incorrectly', async () => {
    const snapshot = await MacroIntelligenceService.getSnapshot({
      asOfDate: '2026-09-30',
      forceRefresh: true,
      metricsOverride: getFixtureLegacyMetrics(),
    });
    expect(snapshot.regime.regime).not.toBe('UNKNOWN');
    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.activeAlerts).toEqual(
      MacroAlertEngine.evaluateAlerts(getFixtureLegacyMetrics(), {
        asOfDate: '2026-09-30',
        evaluatedAt: snapshot.evaluatedAt,
      })
    );
  });
});
