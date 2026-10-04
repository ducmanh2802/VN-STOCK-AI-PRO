import { describe, it, expect } from 'vitest';
import { ExternalSectorEngine } from '../ExternalSectorEngine.ts';
import type { NormalizedMacroObservation } from '../types.ts';

describe('Phase 27 — ExternalSectorEngine', () => {
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
      unit: 'Points',
      source: 'ICE/SBV',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'DAILY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    normalizedValue: value,
    momentum,
    trend: 'STABLE',
    isValid: value !== null,
  });

  it('classifies FAVORABLE when DXY is softening and USD/VND is stable', () => {
    const obs = [
      createNormObs('US_DXY', 100.5),
      createNormObs('USD_VND', 25300, 10),
    ];
    const result = ExternalSectorEngine.evaluate(obs);
    expect(result.state).toBe('FAVORABLE');
    expect(result.externalScore).toBeGreaterThanOrEqual(75);
  });

  it('classifies PRESSURE / CRITICAL when DXY spikes above 106 and USD/VND surges', () => {
    const obs = [
      createNormObs('US_DXY', 107.2),
      createNormObs('USD_VND', 25650, 150),
    ];
    const result = ExternalSectorEngine.evaluate(obs);
    expect(['PRESSURE', 'CRITICAL']).toContain(result.state);
    expect(result.externalScore).toBeLessThanOrEqual(45);
  });

  it('fails closed to UNKNOWN when both DXY and USD/VND are missing', () => {
    const result = ExternalSectorEngine.evaluate([]);
    expect(result.state).toBe('UNKNOWN');
    expect(result.externalScore).toBeNull();
  });
});
