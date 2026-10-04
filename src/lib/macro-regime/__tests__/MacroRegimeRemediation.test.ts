/**
 * PHASE 27 — REMEDIATION REGRESSION TESTS (P27-D1..D9)
 * ===================================================
 * Explicit evidence for every behavior change introduced during macro-regime
 * certification remediation.
 */

import { describe, it, expect } from 'vitest';
import { MacroNormalizer } from '../MacroNormalizer.ts';
import { MacroRegimeClassifier } from '../MacroRegimeClassifier.ts';
import { MacroRegimeOrchestrator } from '../MacroRegimeOrchestrator.ts';
import type { MacroObservation } from '../types.ts';
import { getFixtureMacroObservations } from '../../../services/macro-regime/__tests__/macroFixtures.ts';

function obs(overrides: Partial<MacroObservation> = {}): MacroObservation {
  return {
    metricCode: 'VN_CPI',
    observationDate: '2026-09-30',
    publicationDate: '2026-09-29',
    retrievalDate: '2026-09-30',
    value: 3.45,
    unit: '% YoY',
    source: 'GSO',
    sourceTier: 'TIER_1_STATUTORY',
    revisionVersion: 0,
    frequency: 'MONTHLY',
    periodId: '2026-09',
    validationStatus: 'VALID',
    freshnessStatus: 'CURRENT',
    ...overrides,
  };
}

describe('Phase 27 remediation — P27-D1 source-integrity gate', () => {
  it('excludes TIER_4_UNVERIFIED observations from deterministic models', () => {
    const res = MacroNormalizer.filterAndNormalize(
      [obs({ metricCode: 'VN_CPI', sourceTier: 'TIER_4_UNVERIFIED' })],
      { asOfDate: '2026-09-30' }
    );
    expect(res.normalizedList).toHaveLength(0);
    expect(res.rejectedIntegrityCount).toBe(1);
    expect(res.integrityViolations[0]).toContain('TIER_4_UNVERIFIED');
  });

  it('excludes SUSPECT and INVALID observations from deterministic models', () => {
    const res = MacroNormalizer.filterAndNormalize(
      [
        obs({ metricCode: 'VN_CPI', validationStatus: 'SUSPECT' }),
        obs({ metricCode: 'VN_GDP_GROWTH', validationStatus: 'INVALID' }),
      ],
      { asOfDate: '2026-09-30' }
    );
    expect(res.normalizedList).toHaveLength(0);
    expect(res.rejectedIntegrityCount).toBe(2);
  });

  it('admits VALID and PROVISIONAL observations unchanged', () => {
    const res = MacroNormalizer.filterAndNormalize(
      [
        obs({ metricCode: 'VN_CPI', validationStatus: 'VALID' }),
        obs({ metricCode: 'VN_GDP_GROWTH', validationStatus: 'PROVISIONAL' }),
      ],
      { asOfDate: '2026-09-30' }
    );
    expect(res.normalizedList).toHaveLength(2);
    expect(res.rejectedIntegrityCount).toBe(0);
  });
});

describe('Phase 27 remediation — P27-D6 coverage contract alignment', () => {
  it('defines the required registry of 9 reportable metric codes', () => {
    expect(MacroRegimeClassifier.REQUIRED_METRIC_CODES).toHaveLength(9);
    expect(MacroRegimeClassifier.REQUIRED_METRIC_CODES).toContain('VN_GDP_GROWTH');
    expect(MacroRegimeClassifier.REQUIRED_METRIC_CODES).toContain('VN_CPI');
  });

  it('matches documented thresholds: FULL=100%, SUFFICIENT>=75%, PARTIAL 50-74%', () => {
    expect(MacroRegimeClassifier.evaluateCoverage([])).toBe('FULL');
    // 8/9 = 88.9% -> SUFFICIENT (previously misreported FULL at 0.85).
    expect(MacroRegimeClassifier.evaluateCoverage(['VN_PMI'])).toBe('SUFFICIENT');
    // 5/9 = 55.6% -> PARTIAL.
    expect(
      MacroRegimeClassifier.evaluateCoverage(['VN_PMI', 'US_DXY', 'USD_VND', 'GLOBAL_VIX'])
    ).toBe('PARTIAL');
    // 4/9 = 44.4% -> INSUFFICIENT.
    expect(
      MacroRegimeClassifier.evaluateCoverage(['VN_PMI', 'US_DXY', 'USD_VND', 'GLOBAL_VIX', 'US_10Y_YIELD'])
    ).toBe('INSUFFICIENT');
  });

  it('retains the GDP+CPI joint gate (core metrics missing => INSUFFICIENT)', () => {
    expect(MacroRegimeClassifier.evaluateCoverage(['VN_GDP_GROWTH', 'VN_CPI'])).toBe('INSUFFICIENT');
  });
});

describe('Phase 27 remediation — orchestrator & end-to-end coherence', () => {
  it('P27-D9: first-seen snapshot reports persistence 1 (not 2)', () => {
    const snapshot = MacroRegimeOrchestrator.buildSnapshot({
      observations: getFixtureMacroObservations(),
      asOfDate: '2026-09-30',
    });
    expect(snapshot.transition.persistencePeriods).toBe(1);
    expect(snapshot.lookaheadRejected).toBe(false);
    expect(snapshot.macroRegime).not.toBe('UNKNOWN');
  });

  it('empty observation set fails closed to UNKNOWN / UNAVAILABLE', () => {
    const snapshot = MacroRegimeOrchestrator.buildSnapshot({ observations: [], asOfDate: '2026-09-30' });
    expect(snapshot.macroRegime).toBe('UNKNOWN');
    expect(snapshot.dataFreshness).toBe('UNAVAILABLE');
  });
});
