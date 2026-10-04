import { describe, it, expect } from 'vitest';
import { MonetaryStateEngine } from '../MonetaryStateEngine.ts';
import type { NormalizedMacroObservation } from '../types.ts';

describe('Phase 27 — MonetaryStateEngine', () => {
  const createNormObs = (
    metricCode: string,
    value: number | null,
    momentum: number | null = null
  ): NormalizedMacroObservation => ({
    metricCode,
    observation: {
      metricCode,
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value,
      unit: '%',
      source: 'SBV',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'EVENT_DRIVEN',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    normalizedValue: value,
    momentum,
    trend: 'STABLE',
    isValid: value !== null,
  });

  it('classifies EASING when refinancing rate is low or recent rate cut occurred', () => {
    const obs = [
      createNormObs('SBV_REFINANCING_RATE', 4.5, -0.5),
      createNormObs('VN_DEPOSIT_RATE', 4.8),
    ];
    const result = MonetaryStateEngine.evaluate(obs);
    expect(result.state).toBe('EASING');
    expect(result.monetaryScore).toBeGreaterThanOrEqual(75);
  });

  it('classifies RESTRICTIVE/TIGHTENING when policy rates and deposit rates are elevated', () => {
    const obs = [
      createNormObs('SBV_REFINANCING_RATE', 6.5, 0.5),
      createNormObs('VN_DEPOSIT_RATE', 7.5),
    ];
    const result = MonetaryStateEngine.evaluate(obs);
    expect(['TIGHTENING', 'RESTRICTIVE']).toContain(result.state);
    expect(result.monetaryScore).toBeLessThanOrEqual(45);
  });

  it('fails closed to UNKNOWN when both refinancing and deposit rates are missing', () => {
    const obs = [createNormObs('SBV_OMO_RATE', 4.0)];
    const result = MonetaryStateEngine.evaluate(obs);
    expect(result.state).toBe('UNKNOWN');
    expect(result.monetaryScore).toBeNull();
  });
});
