import { TurnoverCostEngine } from '../index';
import { DEFAULT_TRADING_COST_CONFIG } from '../index';
import { VietnamLotRule } from '../../trading/risk/VietnamLotRule.ts';

describe('TurnoverCostEngine', () => {
  it('computes one-sided turnover', () => {
    const cur = { A: 0.5, B: 0.5 };
    const nxt = { A: 0.6, B: 0.4 };
    const t = TurnoverCostEngine.turnover(cur, nxt);
    expect(Math.abs(t - 0.1)).toBeLessThan(1e-9);
  });

  it('lower-bound cost with default config', () => {
    const result = TurnoverCostEngine.lowerBoundCost({
      currentWeights: { A: 0.5, B: 0.5 },
      newWeights: { A: 0.6, B: 0.4 },
      totalValueVnd: 1_000_000,
      costConfig: DEFAULT_TRADING_COST_CONFIG,
    });
    expect(result.ok).toBe(true);
    expect(result.breakdown.buyFeesVnd).toBe(150);
    expect(result.breakdown.sellFeesVnd).toBe(150);
    expect(result.breakdown.sellTaxVnd).toBe(100);
    expect(result.breakdown.slippageVnd).toBe(200);
    expect(result.breakdown.totalVnd).toBe(600);
  });

  it('returns INSUFFICIENT_DATA when totalValueVnd absent', () => {
    const result = TurnoverCostEngine.lowerBoundCost({
      currentWeights: { A: 0.5, B: 0.5 },
      newWeights: { A: 0.6, B: 0.4 },
      totalValueVnd: null,
      costConfig: DEFAULT_TRADING_COST_CONFIG,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('returns INSUFFICIENT_DATA when costConfig absent', () => {
    const result = TurnoverCostEngine.lowerBoundCost({
      currentWeights: { A: 0.5, B: 0.5 },
      newWeights: { A: 0.6, B: 0.4 },
      totalValueVnd: 1_000_000,
      costConfig: null,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('produces lot-rounded execution steps with VietnamLotRule', () => {
    const stepsResult = TurnoverCostEngine.executionSteps({
      currentWeights: { A: 0.5, B: 0.5 },
      newWeights: { A: 0.8, B: 0.2 },
      totalValueVnd: 10_000_000,
      costConfig: DEFAULT_TRADING_COST_CONFIG,
      markPrices: { A: 20_000, B: 10_000 },
    });
    expect(stepsResult.steps.length).toBeGreaterThan(0);
    for (const step of stepsResult.steps) {
      expect(typeof step.roundLotQuantity).toBe('number');
      expect(typeof step.notionalVnd).toBe('number');
    }
    expect(stepsResult.warning).toBeNull();
  });

  it('produces warning when mark price missing', () => {
    const stepsResult = TurnoverCostEngine.executionSteps({
      currentWeights: { A: 0.5, B: 0.5 },
      newWeights: { A: 0.8, B: 0.2 },
      totalValueVnd: 10_000_000,
      costConfig: DEFAULT_TRADING_COST_CONFIG,
      markPrices: { A: 20_000, B: null as any },
    });
    expect(stepsResult.warning).toContain('lacked a mark price');
  });

  it('zero turnover cost when weights unchanged', () => {
    const cur = { A: 0.5, B: 0.5 };
    const nxt = { A: 0.5, B: 0.5 };
    const t = TurnoverCostEngine.turnover(cur, nxt);
    expect(t).toBe(0);
    const result = TurnoverCostEngine.lowerBoundCost({
      currentWeights: cur,
      newWeights: nxt,
      totalValueVnd: 1_000_000,
      costConfig: DEFAULT_TRADING_COST_CONFIG,
    });
    expect(result.ok).toBe(true);
    expect(result.breakdown.totalVnd).toBe(0);
  });
});