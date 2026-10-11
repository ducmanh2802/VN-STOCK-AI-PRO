import { describe, expect, it } from 'vitest';
import { ConstraintEngine, RebalancingConstraints } from '../index';
import { RebalancingDecisionStatus } from '../index';

describe('ConstraintEngine — validateConstraints', () => {
  it('returns empty violations for no constraints', () => {
    const result = ConstraintEngine.validateConstraints(undefined, ['A', 'B']);
    expect(result.length).toBe(0);
  });

  it('rejects per-asset min > max', () => {
    const result = ConstraintEngine.validateConstraints(
      { assetBands: { A: { min: 0.8, max: 0.3 } } },
      ['A', 'B']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('ASSET_MIN_WEIGHT');
  });

  it('rejects NaN bounds', () => {
    const result = ConstraintEngine.validateConstraints(
      { assetBands: { A: { min: NaN, max: 0.5 } } },
      ['A']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('ASSET_MIN_WEIGHT');
  });

  it('rejects cashFloor out of [0,1]', () => {
    const result = ConstraintEngine.validateConstraints(
      { cashFloor: 1.5 },
      ['A']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('CASH_FLOOR');
  });

  it('rejects leverageCap <= 0', () => {
    const result = ConstraintEngine.validateConstraints(
      { leverageCap: 0 },
      ['A']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('LEVERAGE_CAP');
  });

  it('rejects turnoverCap outside [0,1]', () => {
    const result = ConstraintEngine.validateConstraints(
      { turnoverCap: 1.2 },
      ['A']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('TURNOVER_CAP');
  });

  it('detects sum-min > 1 contradiction', () => {
    const result = ConstraintEngine.validateConstraints(
      { assetBands: { A: { min: 0.7 }, B: { min: 0.6 } } },
      ['A', 'B']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('ASSET_MIN_WEIGHT');
    expect(result[0].detail).toContain('minima exceeds 1');
  });

  it('detects sum-max < 1 contradiction', () => {
    const result = ConstraintEngine.validateConstraints(
      { assetBands: { A: { max: 0.3 }, B: { max: 0.3 } } },
      ['A', 'B']
    );
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('ASSET_MAX_WEIGHT');
    expect(result[0].detail).toContain('below 1');
  });

  it('marks UNEVALUATED-style via evaluateConstraints', () => {
    // evaluateConstraints handles sector/class/factor when maps/missing provided
    const violations = ConstraintEngine.evaluateConstraints(
      {
        currentWeights: { A: 0.5, B: 0.5 },
        sectorBands: {},
        assetClassBands: {},
        factorBands: {},
        leverageCap: undefined,
        cashFloor: undefined,
        derivativeNotionalCap: undefined,
        turnoverCap: undefined,
        costBudgetVnd: undefined,
        benchmarkMaxDeviation: undefined,
        marginCoverageFloor: undefined,
        derivativeNotional: undefined,
        sectorMap: undefined,
        assetClassMap: undefined,
        factorScores: undefined,
        marginCoverage: undefined,
        derivativeNotional: undefined,
      } as any,
      { A: 0.5, B: 0.5 },
      { assetBands: {} }
    );
    expect(violations.length).toBe(0);
  });

  it('supplies per-asset bands and detects violations against weights', () => {
    const violations = ConstraintEngine.evaluateConstraints(
      {
        currentWeights: { A: 0.8, B: 0.2, CASH: 0 },
        sectorBands: {},
        assetClassBands: {},
        factorBands: {},
        leverageCap: undefined,
        cashFloor: undefined,
        derivativeNotionalCap: undefined,
        turnoverCap: undefined,
        costBudgetVnd: undefined,
        benchmarkMaxDeviation: undefined,
        sectorMap: undefined,
        assetClassMap: undefined,
        factorScores: undefined,
        marginCoverage: undefined,
        derivativeNotional: undefined,
      } as any,
      { A: 0.9, B: 0.1, CASH: 0 },
      { assetBands: { A: { max: 0.7 } } }
    );
    // A weight 0.9 > max 0.7 → violation
    expect(violations.length).toBe(1);
    expect(violations[0].kind).toBe('ASSET_MAX_WEIGHT');
  });

  it('handles cash floor constraint without CASH in symbols', () => {
    const violations = ConstraintEngine.validateConstraints(
      { cashFloor: 0.4 },
      ['A']
    );
    // cashFloor sets lo on CASH pseudo-symbol, A symbol has lo 0 → sumMin 0.4 > 1? Actually sumMin 0.4 < 1, so fine
    expect(violations.length).toBe(0);
  });
});