import { describe, expect, it } from 'vitest';
import { ScenarioEngine } from '../ScenarioEngine.ts';
import type { PortfolioPositionInput } from '../../../portfolio/types.ts';

const D = '2026-10-03';
const base: readonly PortfolioPositionInput[] = [
  { symbol: 'HPG', quantity: 1000, markPrice: 25000, assetClass: 'EQUITY', sectorId: 'steel' },
  { symbol: 'FPT', quantity: 500, markPrice: 100000, assetClass: 'EQUITY', sectorId: 'tech' },
];
// baseline total = 25M + 50M = 75M

describe('scenario determinism + provenance', () => {
  const run = () =>
    ScenarioEngine.run({
      baseline: base,
      asOfDate: D,
      assumptions: [{ kind: 'PRICE_SHOCK', target: 'HPG', value: -0.2, label: 'HPG -20%' }],
    });
  it('computes shocked values with labeled provenance', () => {
    const r = run();
    expect(r.baseline.totalMarketValue).toBe(75000000);
    expect(r.shocked.totalMarketValue).toBe(70000000);
    expect(r.diff.absoluteImpact).toBe(-5000000);
    expect(r.diff.percentageImpact).toBeCloseTo(-5000000 / 75000000);
    expect(r.provenance['price:HPG']).toBe('USER_ASSUMPTION');
    expect(r.provenance['baseline.total']).toBe('CALCULATED');
    expect(r.diff.worstShockLoss).toBe(15000000); // 20% of 75M via certified shock table
  });
  it('same input → same output', () => {
    expect(run()).toEqual(run());
  });
  it('real portfolio input is never mutated', () => {
    const before = JSON.stringify(base);
    run();
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('fail-closed + honesty rules', () => {
  it('missing mark price skips shock without imputation (NOT_AVAILABLE)', () => {
    const noPx: readonly PortfolioPositionInput[] = [{ symbol: 'HPG', quantity: 1000, markPrice: null, assetClass: 'EQUITY' }];
    const r = ScenarioEngine.run({ baseline: noPx, asOfDate: D, assumptions: [{ kind: 'PRICE_SHOCK', target: 'HPG', value: -0.2, label: 'x' }] });
    expect(r.provenance['price:HPG']).toBe('NOT_AVAILABLE');
    expect(r.shocked.totalMarketValue).toBeNull();
    expect(r.diff.absoluteImpact).toBeNull();
  });
  it('allocation deltas require integer quantities; negative totals rejected', () => {
    expect(() =>
      ScenarioEngine.run({ baseline: base, asOfDate: D, assumptions: [{ kind: 'ALLOCATION_DELTA', target: 'HPG', value: 10.5, label: 'x' }] }),
    ).toThrow('SCENARIO_QTY_MUST_BE_INTEGER');
    expect(() =>
      ScenarioEngine.run({ baseline: base, asOfDate: D, assumptions: [{ kind: 'ALLOCATION_DELTA', target: 'HPG', value: -2000, label: 'x' }] }),
    ).toThrow('SCENARIO_NEGATIVE_QTY');
  });
  it('lot-size violations warn (never silently reshape)', () => {
    const r = ScenarioEngine.run({ baseline: base, asOfDate: D, assumptions: [{ kind: 'ALLOCATION_DELTA', target: 'HPG', value: 50, label: '+50' }] });
    expect(r.warnings.some((w) => w.includes('Lot-size'))).toBe(true);
    expect(r.shocked.positions.find((p) => p.symbol === 'HPG')?.quantity).toBe(1050);
  });
  it('macro notes are recorded with zero causal mapping', () => {
    const r = ScenarioEngine.run({ baseline: base, asOfDate: D, assumptions: [{ kind: 'MACRO_NOTE', target: 'rates', value: NaN, label: 'rates +100bps' }] });
    expect(r.provenance['macro:rates']).toBe('USER_ASSUMPTION');
    expect(r.shocked.totalMarketValue).toBe(75000000); // untouched
    expect(r.warnings.some((w) => w.includes('no invented transmission'))).toBe(true);
  });
  it('unknown symbols are ignored loudly, not silently', () => {
    const r = ScenarioEngine.run({ baseline: base, asOfDate: D, assumptions: [{ kind: 'PRICE_SHOCK', target: 'XYZ', value: -0.5, label: 'x' }] });
    expect(r.warnings.some((w) => w.includes('unknown symbol'))).toBe(true);
  });
});
