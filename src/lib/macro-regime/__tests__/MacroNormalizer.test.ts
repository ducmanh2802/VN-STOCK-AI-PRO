import { describe, it, expect } from 'vitest';
import { MacroNormalizer } from '../MacroNormalizer.ts';
import type { MacroObservation } from '../types.ts';

describe('Phase 27 — MacroNormalizer', () => {
  const baseObs: MacroObservation = {
    metricCode: 'VN_GDP_GROWTH',
    observationDate: '2026-06-30',
    publicationDate: '2026-07-05',
    retrievalDate: '2026-07-05',
    value: 6.8,
    unit: '% YoY',
    source: 'GSO',
    sourceTier: 'TIER_1_STATUTORY',
    revisionVersion: 0,
    frequency: 'QUARTERLY',
    validationStatus: 'VALID',
    freshnessStatus: 'CURRENT',
  };

  it('normalizes valid observations and computes trend/momentum when previous observation exists', () => {
    const currentObs: MacroObservation = { ...baseObs, value: 7.2 };
    const prevObs: MacroObservation = { ...baseObs, observationDate: '2026-03-31', publicationDate: '2026-04-05', value: 6.5 };

    const { normalizedList, rejectedLookaheadCount, lookaheadViolations } = MacroNormalizer.filterAndNormalize(
      [currentObs],
      { asOfDate: '2026-07-10', previousObservations: [prevObs] }
    );

    expect(rejectedLookaheadCount).toBe(0);
    expect(lookaheadViolations).toHaveLength(0);
    expect(normalizedList).toHaveLength(1);
    expect(normalizedList[0].normalizedValue).toBe(7.2);
    expect(normalizedList[0].momentum).toBe(0.7);
    expect(normalizedList[0].trend).toBe('RISING');
  });

  it('strictly rejects lookahead observations where publicationDate > asOfDate', () => {
    const futureObs: MacroObservation = {
      ...baseObs,
      publicationDate: '2026-08-01',
    };

    const { normalizedList, rejectedLookaheadCount, lookaheadViolations } = MacroNormalizer.filterAndNormalize(
      [futureObs],
      { asOfDate: '2026-07-20' }
    );

    expect(rejectedLookaheadCount).toBe(1);
    expect(lookaheadViolations).toHaveLength(1);
    expect(lookaheadViolations[0]).toContain('publicationDate (2026-08-01) > asOfDate (2026-07-20)');
    expect(normalizedList).toHaveLength(0);
  });

  it('accepts observations where publicationDate === asOfDate', () => {
    const exactObs: MacroObservation = {
      ...baseObs,
      publicationDate: '2026-07-20',
    };

    const { normalizedList, rejectedLookaheadCount } = MacroNormalizer.filterAndNormalize(
      [exactObs],
      { asOfDate: '2026-07-20' }
    );

    expect(rejectedLookaheadCount).toBe(0);
    expect(normalizedList).toHaveLength(1);
    expect(normalizedList[0].normalizedValue).toBe(6.8);
  });

  it('handles null values safely without converting null to 0', () => {
    const nullObs: MacroObservation = {
      ...baseObs,
      value: null,
    };

    const { normalizedList } = MacroNormalizer.filterAndNormalize([nullObs], { asOfDate: '2026-07-20' });
    expect(normalizedList).toHaveLength(0);
  });

  it('performs historical vintage replay selecting the highest revision eligible at asOfDate', () => {
    const rev1: MacroObservation = {
      metricCode: 'VN_GDP_GROWTH',
      observationDate: '2026-06-30',
      publicationDate: '2026-07-05',
      retrievalDate: '2026-07-05',
      value: 6.5,
      unit: '% YoY',
      source: 'GSO',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 1,
      frequency: 'QUARTERLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    };

    const rev2: MacroObservation = {
      metricCode: 'VN_GDP_GROWTH',
      observationDate: '2026-06-30',
      publicationDate: '2026-08-10',
      retrievalDate: '2026-08-10',
      value: 6.82,
      unit: '% YoY',
      source: 'GSO',
      sourceTier: 'TIER_1_STATUTORY',
      revisionVersion: 2,
      frequency: 'QUARTERLY',
      validationStatus: 'VALID',
      freshnessStatus: 'CURRENT',
    };

    // At asOfDate = 2026-07-20: rev2 is rejected due to publication date, rev1 is selected
    const resJuly = MacroNormalizer.filterAndNormalize([rev1, rev2], { asOfDate: '2026-07-20' });
    expect(resJuly.normalizedList).toHaveLength(1);
    expect(resJuly.normalizedList[0].observation.revisionVersion).toBe(1);
    expect(resJuly.normalizedList[0].normalizedValue).toBe(6.5);
    expect(resJuly.rejectedLookaheadCount).toBe(1);

    // At asOfDate = 2026-08-20: rev2 is eligible and overrides rev1
    const resAug = MacroNormalizer.filterAndNormalize([rev1, rev2], { asOfDate: '2026-08-20' });
    expect(resAug.normalizedList).toHaveLength(1);
    expect(resAug.normalizedList[0].observation.revisionVersion).toBe(2);
    expect(resAug.normalizedList[0].normalizedValue).toBe(6.82);
    expect(resAug.rejectedLookaheadCount).toBe(0);
  });
});
