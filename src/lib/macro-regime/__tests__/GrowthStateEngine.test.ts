import { describe, it, expect } from 'vitest';
import { GrowthStateEngine } from '../GrowthStateEngine.ts';
import type { NormalizedMacroObservation } from '../types.ts';

describe('Phase 27 — GrowthStateEngine', () => {
  const createNormObs = (metricCode: string, value: number | null): NormalizedMacroObservation => ({
    metricCode,
    observation: {
      metricCode,
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value,
      unit: '%',
      source: 'GSO',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'QUARTERLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    normalizedValue: value,
    momentum: null,
    trend: 'STABLE',
    isValid: value !== null,
  });

  it('classifies ACCELERATING when GDP >= 7.0% and PMI >= 52', () => {
    const obs = [
      createNormObs('VN_GDP_GROWTH', 7.4),
      createNormObs('VN_PMI', 53.5),
      createNormObs('VN_IIP_GROWTH', 8.5),
      createNormObs('VN_EXPORT_GROWTH', 14.0),
    ];
    const result = GrowthStateEngine.evaluate(obs);
    expect(result.state).toBe('ACCELERATING');
    expect(result.growthScore).toBeGreaterThanOrEqual(80);
  });

  it('classifies EXPANDING when GDP >= 6.0% and PMI > 50', () => {
    const obs = [
      createNormObs('VN_GDP_GROWTH', 6.5),
      createNormObs('VN_PMI', 51.2),
      createNormObs('VN_IIP_GROWTH', 6.0),
    ];
    const result = GrowthStateEngine.evaluate(obs);
    expect(result.state).toBe('EXPANDING');
    expect(result.growthScore).toBeGreaterThanOrEqual(65);
  });

  it('classifies SLOWING when GDP is slowing and PMI is below 50', () => {
    const obs = [
      createNormObs('VN_GDP_GROWTH', 4.8),
      createNormObs('VN_PMI', 50.0),
    ];
    const result = GrowthStateEngine.evaluate(obs);
    expect(result.state).toBe('SLOWING');
    expect(result.growthScore).toBeLessThanOrEqual(45);
  });

  it('classifies CONTRACTING when GDP < 3.0%', () => {
    const obs = [
      createNormObs('VN_GDP_GROWTH', 2.1),
      createNormObs('VN_PMI', 46.0),
    ];
    const result = GrowthStateEngine.evaluate(obs);
    expect(result.state).toBe('CONTRACTING');
    expect(result.growthScore).toBeLessThanOrEqual(30);
  });

  it('fails closed to UNKNOWN when both GDP and PMI are missing', () => {
    const obs = [createNormObs('VN_IIP_GROWTH', 5.0)];
    const result = GrowthStateEngine.evaluate(obs);
    expect(result.state).toBe('UNKNOWN');
    expect(result.growthScore).toBeNull();
    expect(result.missingMetrics).toContain('VN_GDP_GROWTH');
    expect(result.missingMetrics).toContain('VN_PMI');
  });
});
