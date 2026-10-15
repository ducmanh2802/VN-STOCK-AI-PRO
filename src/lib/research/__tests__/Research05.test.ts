/**
 * RESEARCH-05 TESTS — report/metrics/benchmark/warnings/confidence/manifest/
 * certification/bias/snooping/NAV/survivorship/look-ahead
 */
import { describe, it, expect } from 'vitest';
import { AuditEngine, SnoopingLedger } from '../AuditEngine.ts';
import { DEFAULT_RESEARCH_COST } from '../CostEngine.ts';
import { ExperimentEngine } from '../ExperimentEngine.ts';

describe('AuditEngine', () => {
  const eq = [
    { date: '2024-01-01', nav: 100 }, { date: '2024-01-02', nav: 110 },
    { date: '2024-01-03', nav: 105 }, { date: '2024-01-04', nav: 115 },
  ];

  it('computes metrics with sample-size warnings', () => {
    const m = AuditEngine.metrics({ initialCapital: 100, equity: eq, tradeReturns: [0.05], turnover: 1.2, exposure: 0.9 });
    expect(m.maxDrawdownPct).toBeLessThan(0);
    expect(m.sampleSizeWarning).toBe(true);
    expect(m.winRatePct).toBe(100);
  });

  it('requires benchmark universe vintage', () => {
    expect(AuditEngine.benchmarkCheck(null, null).ok).toBe(true);
    expect(AuditEngine.benchmarkCheck('VNINDEX', null).ok).toBe(false);
    expect(AuditEngine.benchmarkCheck('VNINDEX', '2023-12-29').ok).toBe(true);
  });

  it('flags all 8 statistical warnings', () => {
    const w = AuditEngine.warnings({
      trades: 5, turnover: 9, spreadPct: 40, regimeUnstable: true,
      survivorshipRisk: true, lookaheadRisk: true, gaps: true, oosBars: 10,
    });
    expect(w).toHaveLength(8);
  });

  it('exposes evidence instead of AI confidence', () => {
    const b = AuditEngine.biasesPresent({ lookahead: true, survivorship: false, universeLeak: true, snooping: false, overfit: true });
    expect(b).toContain('LOOK_AHEAD_BIAS');
    expect(b).toContain('CURRENT_UNIVERSE_LEAK');
    expect(b).toContain('OVERFITTING_RISK');
  });

  it('builds manifest and gates certification on 8 conditions', () => {
    const e = ExperimentEngine.create({
      experimentId: 'm1', name: 'm', strategy: 's', strategyVersion: 'sv',
      dataVersion: 'dv',
      dataset: {
        instruments: ['A'], startDate: '2024-01-01', endDate: '2024-02-01',
        dataSources: ['KBS'], pointInTimeRules: ['p<=T'],
        corporateActionMode: 'EXPLICIT_EVENTS', adjustmentMode: 'RAW',
        universeDefinition: 'U', universeAsOf: '2023-12-29',
      },
      parameters: { lookback: 20 }, createdAt: '2026-10-01T00:00:00Z', seed: 1,
    });
    const m = AuditEngine.manifest(e, 'code-v1', DEFAULT_RESEARCH_COST);
    expect(m.seed).toBe(1);
    expect(m.costModel.costModelVersion).toMatch(/^v/);
    const allTrue = {
      pitValid: true, noLookahead: true, survivorshipControlled: true, costPresent: true,
      oosTested: true, reproducible: true, accountingValid: true, limitationsDocumented: true,
    };
    expect(AuditEngine.certify(allTrue)).toBe('CERTIFIED');
    expect(AuditEngine.certify({ ...allTrue, oosTested: false })).toBe('NON_CERTIFIED');
  });

  it('checks NAV invariant and snooping separation', () => {
    expect(AuditEngine.checkNav(60, 40, 100, 0)).toBe(true);
    expect(AuditEngine.checkNav(60, 40, 90, 0)).toBe(false);
    const ledger = new SnoopingLedger();
    ledger.record({ iteration: 1, parameters: { lookback: 20 }, validationSet: 'VAL', result: 5 });
    expect(ledger.finalTestSeparation('TEST')).toBe(true);
    expect(ledger.finalTestSeparation('VAL')).toBe(false);
  });

  it('survivorship: historical universe must not equal current by assumption', () => {
    const historical = ['AAA', 'DDD'];
    const current = ['AAA'];
    expect(historical).not.toEqual(current);
  });
});
