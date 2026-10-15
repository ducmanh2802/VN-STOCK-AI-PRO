import { buildRebalancingDecision } from '../RebalancingDecisionBuilder.ts';
import { DEFAULT_TRADING_COST_CONFIG } from '../index';

describe('RebalancingDecision — determinism & regression', () => {
  it('byte-identical output across repeated calls with same input', () => {
    const input = {
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.3, B: 0.7, CASH: 0 },
      referenceTargets: { A: 0.5, B: 0.5, CASH: 0 },
      totalValueVnd: 5_000_000,
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    };
    const first = buildRebalancingDecision(input);
    const second = buildRebalancingDecision(input);

    // All top-level scalar and readonly fields match
    expect(first.status).toBe(second.status);
    expect(first.turnover).toBe(second.turnover);
    if (first.cost && second.cost) {
      expect(first.cost.totalVnd).toBe(second.cost.totalVnd);
      expect(first.cost.buyFeesVnd).toBe(second.cost.buyFeesVnd);
      expect(first.cost.sellFeesVnd).toBe(second.cost.sellFeesVnd);
      expect(first.cost.sellTaxVnd).toBe(second.cost.sellTaxVnd);
      expect(first.cost.slippageVnd).toBe(second.cost.slippageVnd);
    }
    if (first.weights && second.weights) {
      const w1 = Object.fromEntries(
        Object.entries(first.weights).map(([k, v]) => [k, Math.round(v * 1e9) / 1e9])
      );
      const w2 = Object.fromEntries(
        Object.entries(second.weights).map(([k, v]) => [k, Math.round(v * 1e9) / 1e9])
      );
      expect(w1).toEqual(w2);
    }
    expect(first.lineage.inputHash).toBe(second.lineage.inputHash);
    expect(first.lineage.evaluatedAt).toBe(second.lineage.evaluatedAt);
    expect(first.caveats).toEqual(second.caveats);
    expect(first.warnings).toEqual(second.warnings);
  });

  it('sum of weights is 1 ±1e-9 across re-runs', () => {
    const input = {
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.7, B: 0.3, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    };
    for (let i = 0; i < 10; i++) {
      const d = buildRebalancingDecision(input);
      expect(d.status).toBe('OK');
      const sum = Object.values(d.weights!).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });

  it('non-negative weights', () => {
    const input = {
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    };
    for (let i = 0; i < 10; i++) {
      const d = buildRebalancingDecision(input);
      if (d.weights) {
        for (const w of Object.values(d.weights)) {
          expect(w).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });

  it('does not mutate the input object', () => {
    const input = {
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    };
    const copy = JSON.parse(JSON.stringify(input));
    buildRebalancingDecision(input);
    expect(input).toEqual(copy);
  });

  it('insufficient data when totalValueVnd null and costConfig absent', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      totalValueVnd: null,
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INSUFFICIENT_DATA');
    expect(decision.weights).toBeNull();
  });

  it('INVALID when all weights negative', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: -0.1, B: -0.2, CASH: 1.3 },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('INVALID');
    expect(decision.weights).toBeNull();
  });

  it('STALE status when quoteFreshness STALE', () => {
    const decision = buildRebalancingDecision({
      asOfDate: '2026-10-01',
      currentWeights: { A: 0.5, B: 0.5, CASH: 0 },
      referenceTargets: { A: 0.6, B: 0.4, CASH: 0 },
      quoteFreshness: { A: 'STALE' as any },
      evaluatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(decision.status).toBe('STALE');
    expect(decision.freshness).toBe('STALE');
    // weights kept OK despite stale flag
    expect(decision.weights).not.toBeNull();
    if (decision.weights) {
      const sum = Object.values(decision.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    }
  });
});