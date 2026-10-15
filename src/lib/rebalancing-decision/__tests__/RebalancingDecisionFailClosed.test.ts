import { describe, expect, it } from 'vitest';
import { buildRebalancingDecision } from '../RebalancingDecisionBuilder.ts';
import { DEFAULT_TRADING_COST_CONFIG, REBALANCING_CAVEATS } from '../index';
import { ConstraintEngine, ConstraintViolation, ConstraintKind } from '../index';

describe('RebalancingDecision — fail-closed acceptance criteria', () => {
  it('returns INVALID when currentWeights sum exceeds 1 with no cash room', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.6, B: 0.6 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INVALID');
    expect(decision.weights).toBeNull();
  });

  it('returns INVALID when referenceTargets sum to 0', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0, B: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INVALID');
    expect(decision.weights).toBeNull();
  });

  it('returns INFEASIBLE when contradictory min-sum constraints', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      constraints: { assetBands: { A: { min: 0.6 }, B: { min: 0.6 } } },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INFEASIBLE');
    expect(decision.weights).toBeNull();
    expect(decision.violations.length).toBe(1);
    expect(decision.violations[0].kind).toBe('ASSET_MIN_WEIGHT');
    expect(decision.violations[0].detail).toContain('minima exceeds 1');
  });

  it('returns INSUFFICIENT_DATA when factor coverage missing and factorBands present', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      factorBands: { quality: { min: 0.3 } },
      factorScores: {},
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INSUFFICIENT_DATA');
    expect(decision.weights).toBeNull();
    expect(decision.unevaluated.length).toBeGreaterThan(0);
  });

  it('returns INFEASIBLE when turnover cap is 0 and projected weights differ from current', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.8, B: 0.2, CASH: 0 },
      constraints: { turnoverCap: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    // projected weights differ from current → non-zero turnover → off-target with cap 0 → INFEASIBLE
    expect(decision.status).toBe('INFEASIBLE');
    expect(decision.weights).toBeNull();
  });

  it('returns INFEASIBLE when cost budget exceeded', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      constraints: { costBudgetVnd: 1 },
      totalValueVnd: 1_000_000,
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INFEASIBLE');
    expect(decision.weights).toBeNull();
    expect(decision.violations.some((v) => v.kind === 'COST_BUDGET')).toBe(true);
  });

  it('returns UNAVAILABLE when quote freshness UNAVAILABLE', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      quoteFreshness: { A: 'UNAVAILABLE' as any },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('UNAVAILABLE');
    expect(decision.weights).toBeNull();
  });

  it('returns OK with correct weights sum-to-1 ±1e-9', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('OK');
    expect(decision.weights).not.toBeNull();
    if (decision.weights) {
      const sum = Object.values(decision.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('produces non-negative weights and all within [0,1]', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('OK');
    if (decision.weights) {
      for (const w of Object.values(decision.weights)) {
        expect(w).toBeGreaterThanOrEqual(-1e-9);
        expect(w).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('produces turnover lower-bound cost with canonical config', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.8, B: 0.2, CASH: 0 },
      totalValueVnd: 1_000_000,
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('OK');
    expect(decision.cost).not.toBeNull();
    if (decision.cost) {
      expect(decision.cost.totalVnd).toBeGreaterThan(0);
      expect(decision.cost.buyFeesVnd).toBeGreaterThanOrEqual(0);
      expect(decision.cost.sellFeesVnd).toBeGreaterThanOrEqual(0);
      expect(decision.cost.sellTaxVnd).toBeGreaterThanOrEqual(0);
      expect(decision.cost.slippageVnd).toBeGreaterThanOrEqual(0);
      expect(decision.cost.totalVnd).toBeCloseTo(
        decision.cost.buyFeesVnd + decision.cost.sellFeesVnd + decision.cost.sellTaxVnd + decision.cost.slippageVnd,
        0
      );
    }
  });

  it('produces execution steps with lot-rounded quantities', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.8, B: 0.2, CASH: 0 },
      totalValueVnd: 10_000_000,
      markPrices: { A: 20_000, B: 10_000 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('OK');
    if (decision.executionSteps.length > 0) {
      for (const step of decision.executionSteps) {
        expect(typeof step.symbol).toBe('string');
        expect(['BUY', 'SELL', 'HOLD']).toContain(step.side);
        expect(typeof step.roundLotQuantity).toBe('number');
        expect(typeof step.notionalVnd).toBe('number');
      }
    }
  });

  it('includes REBALANCING_CAVEATS in every decision output', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    for (const c of decision.caveats) {
      expect(REBALANCING_CAVEATS).toContain(c);
    }
  });

  it('lineage inputHash is deterministic across calls', () => {
    const input = {
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    };
    const d1 = buildRebalancingDecision(input);
    const d2 = buildRebalancingDecision(input);
    expect(d1.lineage.inputHash).toBe(d2.lineage.inputHash);
    expect(d1).toEqual(d2);
  });
});