import { describe, it, expect } from 'vitest';
import { MacroRegimeClassifier } from '../MacroRegimeClassifier.ts';

describe('Phase 27 — MacroRegimeClassifier', () => {
  it('classifies EXPANSION when Growth is Accelerating/Expanding and Inflation is Stable/Disinflation', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'EXPANDING',
      inflationState: 'STABLE',
      monetaryState: 'NEUTRAL',
      externalState: 'NEUTRAL',
      financialConditionsState: 'BALANCED',
      growthScore: 75,
      inflationScore: 80,
      monetaryScore: 55,
      externalScore: 60,
      financialConditionsScore: 60,
      missingMetrics: [],
      allObservationsVi: [],
    });
    expect(result.macroRegime).toBe('EXPANSION');
    expect(result.dataCoverage).toBe('FULL');
    expect(result.confidencePercent).toBeGreaterThanOrEqual(80);
  });

  it('classifies INFLATIONARY_EXPANSION when Growth is Expanding and Inflation is High/Rising', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'EXPANDING',
      inflationState: 'HIGH_INFLATION',
      monetaryState: 'TIGHTENING',
      externalState: 'PRESSURE',
      financialConditionsState: 'TIGHT',
      growthScore: 70,
      inflationScore: 40,
      monetaryScore: 40,
      externalScore: 45,
      financialConditionsScore: 45,
      missingMetrics: [],
      allObservationsVi: [],
    });
    expect(result.macroRegime).toBe('INFLATIONARY_EXPANSION');
  });

  it('classifies STAGFLATION_RISK when Growth is Slowing/Contracting and Inflation is High/Rising', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'SLOWING',
      inflationState: 'HIGH_INFLATION',
      monetaryState: 'RESTRICTIVE',
      externalState: 'CRITICAL',
      financialConditionsState: 'STRESSED',
      growthScore: 35,
      inflationScore: 30,
      monetaryScore: 30,
      externalScore: 30,
      financialConditionsScore: 30,
      missingMetrics: [],
      allObservationsVi: [],
    });
    expect(result.macroRegime).toBe('STAGFLATION_RISK');
  });

  it('classifies RECESSION when Growth is Contracting and Inflation is Deflationary/Low', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'CONTRACTING',
      inflationState: 'DEFLATION_RISK',
      monetaryState: 'EASING',
      externalState: 'NEUTRAL',
      financialConditionsState: 'STRESSED',
      growthScore: 20,
      inflationScore: 30,
      monetaryScore: 70,
      externalScore: 50,
      financialConditionsScore: 35,
      missingMetrics: [],
      allObservationsVi: [],
    });
    expect(result.macroRegime).toBe('RECESSION');
  });

  it('classifies RECOVERY when Growth is Accelerating from low base with Easing monetary policy', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'ACCELERATING',
      inflationState: 'DISINFLATION',
      monetaryState: 'EASING',
      externalState: 'FAVORABLE',
      financialConditionsState: 'LOOSE',
      growthScore: 80,
      inflationScore: 85,
      monetaryScore: 85,
      externalScore: 80,
      financialConditionsScore: 80,
      missingMetrics: [],
      allObservationsVi: [],
    });
    expect(['EXPANSION', 'RECOVERY']).toContain(result.macroRegime);
  });

  it('classifies SLOWDOWN when Growth is Slowing and Inflation is Stable', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'SLOWING',
      inflationState: 'STABLE',
      monetaryState: 'NEUTRAL',
      externalState: 'NEUTRAL',
      financialConditionsState: 'BALANCED',
      growthScore: 45,
      inflationScore: 75,
      monetaryScore: 50,
      externalScore: 50,
      financialConditionsScore: 50,
      missingMetrics: [],
      allObservationsVi: [],
    });
    expect(result.macroRegime).toBe('SLOWDOWN');
  });

  it('fails closed to UNKNOWN when coverage is insufficient or key states are UNKNOWN', () => {
    const result = MacroRegimeClassifier.classify({
      growthState: 'UNKNOWN',
      inflationState: 'UNKNOWN',
      monetaryState: 'UNKNOWN',
      externalState: 'UNKNOWN',
      financialConditionsState: 'UNKNOWN',
      growthScore: null,
      inflationScore: null,
      monetaryScore: null,
      externalScore: null,
      financialConditionsScore: null,
      missingMetrics: ['VN_GDP_GROWTH', 'VN_CPI'],
      allObservationsVi: [],
    });
    expect(result.macroRegime).toBe('UNKNOWN');
    expect(result.dataCoverage).toBe('INSUFFICIENT');
    expect(result.confidencePercent).toBe(0);
  });
});
