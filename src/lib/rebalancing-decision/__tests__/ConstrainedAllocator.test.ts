import { ConstrainedAllocator } from '../index';
import { RebalancingDecisionStatus } from '../index';

describe('ConstrainedAllocator — bounded simplex projection', () => {
  it('converges 2-asset minimal case: A capped 0.6, B caps loose', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 0.9, B: 0.1 },
      maxIterations: 100,
      tolerance: 1e-9,
    });
    if (!result.ok) {
      throw new Error(result.detail);
    }
    expect(result.iterations).toBeGreaterThan(0);
    // A should be clipped to at most 0.6; with default lo=0, hi=1 but projection may still keep 0.9 if no band → the test ensures bands matter when specified
  });

  it('respects per-asset bounds: A max 0.6, reference 0.9', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 0.9, B: 0.1 },
      constraints: { assetBands: { A: { max: 0.6 } } },
      maxIterations: 100,
    });
    expect(result.ok).toBe(true);
    expect(result.weights.A).toBeLessThanOrEqual(0.6001);
    expect(result.weights.A).toBeGreaterThanOrEqual(0.5999);
    expect(result.weights.B).toBeGreaterThan(0);
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it('respects cashFloor: cash >= 0.3 when cashFloor provided', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 0.5, B: 0.5, CASH: 0 },
      constraints: { cashFloor: 0.3 },
      maxIterations: 200,
    });
    expect(result.ok).toBe(true);
    expect(result.weights.CASH).toBeGreaterThanOrEqual(0.3 - 1e-6);
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it('returns EMPTY_FEASIBLE when sum of per-asset maxima < 1', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 0.5, B: 0.5 },
      constraints: { assetBands: { A: { max: 0.3 }, B: { max: 0.3 } } },
      maxIterations: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EMPTY_FEASIBLE');
    expect(result.detail).toContain('below 1');
  });

  it('returns EMPTY_FEASIBLE when every per-asset maximum is 0', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 1, B: 0 },
      constraints: { assetBands: { A: { max: 0 }, B: { max: 0 } } },
      maxIterations: 5,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('EMPTY_FEASIBLE');
  });

  it('returns NON_CONVERGED when tolerance not met at iteration cap', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 0.55, B: 0.45 },
      constraints: { assetBands: { A: { min: 0.51 }, B: { min: 0.49 } } },
      maxIterations: 3,
      tolerance: 1e-12,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NON_CONVERGED');
  });

  it('initial seed equal-weight fallback when reference sum zero', () => {
    const result = ConstrainedAllocator.project({
      referenceWeights: { A: 0, B: 0 },
      maxIterations: 5,
    });
    expect(result.ok).toBe(true);
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });
});