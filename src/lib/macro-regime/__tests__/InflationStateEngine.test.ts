import { describe, it, expect } from 'vitest';
import { InflationStateEngine } from '../InflationStateEngine.ts';
import type { NormalizedMacroObservation } from '../types.ts';

describe('Phase 27 — InflationStateEngine', () => {
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
      unit: '% YoY',
      source: 'GSO',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'MONTHLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    normalizedValue: value,
    momentum,
    trend: momentum && momentum > 0 ? 'RISING' : momentum && momentum < 0 ? 'FALLING' : 'STABLE',
    isValid: value !== null,
  });

  it('classifies STABLE when CPI is within normal target band (2.5% - 3.8%)', () => {
    const obs = [
      createNormObs('VN_CPI', 3.2, 0.05),
      createNormObs('VN_CORE_CPI', 2.8),
    ];
    const result = InflationStateEngine.evaluate(obs);
    expect(result.state).toBe('STABLE');
    expect(result.inflationScore).toBeGreaterThanOrEqual(70);
  });

  it('classifies HIGH_INFLATION when CPI >= 4.5%', () => {
    const obs = [
      createNormObs('VN_CPI', 4.8, 0.3),
      createNormObs('VN_CORE_CPI', 4.1),
    ];
    const result = InflationStateEngine.evaluate(obs);
    expect(result.state).toBe('HIGH_INFLATION');
    expect(result.inflationScore).toBeLessThanOrEqual(50);
  });

  it('classifies DISINFLATION when inflation momentum is negative and CPI cooling', () => {
    const obs = [
      createNormObs('VN_CPI', 2.9, -0.4),
      createNormObs('VN_CORE_CPI', 2.5),
    ];
    const result = InflationStateEngine.evaluate(obs);
    expect(result.state).toBe('DISINFLATION');
  });

  it('classifies DEFLATION_RISK when CPI is negative', () => {
    const obs = [
      createNormObs('VN_CPI', -0.5),
    ];
    const result = InflationStateEngine.evaluate(obs);
    expect(result.state).toBe('DEFLATION_RISK');
  });

  it('fails closed to UNKNOWN when CPI is missing', () => {
    const obs = [createNormObs('VN_CORE_CPI', 2.5)];
    const result = InflationStateEngine.evaluate(obs);
    expect(result.state).toBe('UNKNOWN');
    expect(result.inflationScore).toBeNull();
    expect(result.missingMetrics).toContain('VN_CPI');
  });
});
