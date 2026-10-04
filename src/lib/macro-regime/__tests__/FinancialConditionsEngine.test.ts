import { describe, it, expect } from 'vitest';
import { FinancialConditionsEngine } from '../FinancialConditionsEngine.ts';
import type { NormalizedMacroObservation } from '../types.ts';

describe('Phase 27 — FinancialConditionsEngine', () => {
  const createNormObs = (
    metricCode: string,
    value: number | null
  ): NormalizedMacroObservation => ({
    metricCode,
    observation: {
      metricCode,
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value,
      unit: '%',
      source: 'US Treasury/CBOE',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'DAILY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    normalizedValue: value,
    momentum: null,
    trend: 'STABLE',
    isValid: value !== null,
  });

  it('classifies LOOSE when yields are low, curve is steep, and VIX is low', () => {
    const obs = [
      createNormObs('US_10Y_YIELD', 3.75),
      createNormObs('US_2Y_YIELD', 3.40), // Spread = +35 bps
      createNormObs('GLOBAL_VIX', 13.5),
    ];
    const result = FinancialConditionsEngine.evaluate(obs);
    expect(result.state).toBe('LOOSE');
    expect(result.yieldCurveSpreadBps).toBe(35);
  });

  it('classifies STRESSED when yield curve is inverted or VIX spikes above 30', () => {
    const obs = [
      createNormObs('US_10Y_YIELD', 4.10),
      createNormObs('US_2Y_YIELD', 4.50), // Spread = -40 bps (Inverted)
      createNormObs('GLOBAL_VIX', 32.0),
    ];
    const result = FinancialConditionsEngine.evaluate(obs);
    expect(result.state).toBe('STRESSED');
    expect(result.yieldCurveSpreadBps).toBe(-40);
  });

  it('fails closed to UNKNOWN when both yields and volatility are missing', () => {
    const result = FinancialConditionsEngine.evaluate([]);
    expect(result.state).toBe('UNKNOWN');
    expect(result.financialConditionsScore).toBeNull();
  });
});
