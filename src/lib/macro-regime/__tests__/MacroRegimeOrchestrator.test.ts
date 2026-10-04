import { describe, it, expect } from 'vitest';
import { MacroRegimeOrchestrator } from '../MacroRegimeOrchestrator.ts';
import type { MacroObservation } from '../types.ts';

describe('Phase 27 — MacroRegimeOrchestrator', () => {
  const mockObservations: MacroObservation[] = [
    {
      metricCode: 'VN_GDP_GROWTH',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 6.82,
      unit: '% YoY',
      source: 'GSO',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'QUARTERLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    {
      metricCode: 'VN_CPI',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 3.45,
      unit: '% YoY',
      source: 'GSO',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'MONTHLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    {
      metricCode: 'VN_PMI',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 52.4,
      unit: 'Points',
      source: 'S&P Global',
      sourceTier: 'TIER_2_EXCHANGE',
      revisionVersion: 0,
      frequency: 'MONTHLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    {
      metricCode: 'SBV_REFINANCING_RATE',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 4.5,
      unit: '%',
      source: 'SBV',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'EVENT_DRIVEN',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    {
      metricCode: 'US_DXY',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 101.5,
      unit: 'Points',
      source: 'ICE',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'DAILY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
    {
      metricCode: 'US_10Y_YIELD',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 3.85,
      unit: '%',
      source: 'US Treasury',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 0,
      frequency: 'DAILY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    },
  ];

  it('orchestrates complete deterministic snapshot from canonical observations', () => {
    const snapshot = MacroRegimeOrchestrator.buildSnapshot({
      observations: mockObservations,
      asOfDate: '2026-07-20',
    });

    expect(snapshot.asOfDate).toBe('2026-07-20');
    expect(snapshot.lookaheadRejected).toBe(false);
    expect(snapshot.lookaheadViolations).toHaveLength(0);
    expect(snapshot.growthState).toBe('EXPANDING');
    expect(snapshot.inflationState).toBe('STABLE');
    expect(snapshot.macroRegime).toBe('EXPANSION');
    expect(snapshot.dataFreshness).toBe('CURRENT');
  });

  it('flags lookahead violations when observations have future publication dates', () => {
    const futureObs: MacroObservation[] = [
      ...mockObservations,
      {
        metricCode: 'VN_GDP_GROWTH_Q3',
        observationDate: '2026-09-30',
        publicationDate: '2026-10-05',
        retrievalDate: '2026-10-05',
        value: 7.5,
        unit: '% YoY',
        source: 'GSO',
        sourceTier: 'TIER_1_STATUTORY',
        revisionVersion: 0,
        frequency: 'QUARTERLY',
        validationStatus: 'VALID',
        freshnessStatus: 'CURRENT',
      },
    ];

    const snapshot = MacroRegimeOrchestrator.buildSnapshot({
      observations: futureObs,
      asOfDate: '2026-07-20',
    });

    expect(snapshot.lookaheadRejected).toBe(true);
    expect(snapshot.lookaheadViolations).toHaveLength(1);
    expect(snapshot.lookaheadViolations[0]).toContain('publicationDate (2026-10-05) > asOfDate (2026-07-20)');
  });
});
