/**
 * RESEARCH-01 TESTS — experiment/dataset/version/params/determinism/invalid/PIT
 */
import { describe, it, expect } from 'vitest';
import { ExperimentEngine, experimentFingerprint } from '../ExperimentEngine.ts';
import type { ResearchDataset } from '../types.ts';

function ds(over?: Partial<ResearchDataset>): ResearchDataset {
  return {
    instruments: ['VN-HOSE-HPG'], startDate: '2024-01-01', endDate: '2024-12-31',
    dataSources: ['KBS'], pointInTimeRules: ['publicationDate<=asOf'],
    corporateActionMode: 'EXPLICIT_EVENTS', adjustmentMode: 'ADJUSTED',
    universeDefinition: 'VN30 as of 2023-12-29', universeAsOf: '2023-12-29',
    ...over,
  };
}

describe('ExperimentEngine', () => {
  it('creates experiment with captured versions', () => {
    const e = ExperimentEngine.create({
      experimentId: 'x1', name: 't', strategy: 'sma', strategyVersion: 'v1',
      dataVersion: 'd1', dataset: ds(), parameters: { lookback: 20 }, createdAt: '2026-10-01T00:00:00Z', seed: 42,
    });
    expect(e.status).toBe('DRAFT');
    expect(e.seed).toBe(42);
    expect(e.asOfSemantics).toContain('publicationDate');
  });

  it('rejects hidden current-state universe (no vintage)', () => {
    expect(() =>
      ExperimentEngine.create({
        experimentId: 'x', name: 't', strategy: 's', strategyVersion: 'v',
        dataVersion: 'd', dataset: ds({ universeAsOf: null }), parameters: {},
        createdAt: '2026-10-01T00:00:00Z',
      })
    ).toThrow('UNIVERSE_VINTAGE_MISSING');
  });

  it('rejects invalid dataset (empty/inverted/no-sources/no-PIT)', () => {
    for (const bad of [
      ds({ instruments: [] }), ds({ startDate: '2025-01-01', endDate: '2024-01-01' }),
      ds({ dataSources: [] }), ds({ pointInTimeRules: [] }),
    ]) {
      expect(() =>
        ExperimentEngine.create({
          experimentId: 'x', name: 't', strategy: 's', strategyVersion: 'v',
          dataVersion: 'd', dataset: bad, parameters: {}, createdAt: '2026-10-01T00:00:00Z',
        })
      ).toThrow('INVALID_DATASET');
    }
  });

  it('is deterministic: same inputs → same fingerprint', () => {
    const mk = () => ExperimentEngine.create({
      experimentId: 'x', name: 't', strategy: 's', strategyVersion: 'v',
      dataVersion: 'd', dataset: ds(), parameters: { lookback: 20, rebalance: 'M' },
      createdAt: '2026-10-01T00:00:00Z', seed: 7,
    });
    expect(experimentFingerprint(mk())).toBe(experimentFingerprint(mk()));
    expect(ExperimentEngine.reproducibilityKey(mk())).toMatch(/^EXP_/);
  });
});
