/**
 * RESEARCH-03 TESTS — fees/tax/slippage/spread/lot/liquidity/futures/versioning
 */
import { describe, it, expect } from 'vitest';
import {
  CostEngine, DEFAULT_RESEARCH_COST, FUTURES_MULTIPLIER_VND, FUTURES_TICK_POINTS, EQUITY_BOARD_LOT,
} from '../CostEngine.ts';

describe('CostEngine', () => {
  it('charges VN retail fees + sell tax only on sell', () => {
    const b = CostEngine.feeFor(DEFAULT_RESEARCH_COST, 1000000, 'BUY');
    expect(b.fee).toBeCloseTo(1500, 6);
    expect(b.tax).toBe(0);
    const s = CostEngine.feeFor(DEFAULT_RESEARCH_COST, 1000000, 'SELL');
    expect(s.fee).toBeCloseTo(1500, 6);
    expect(s.tax).toBeCloseTo(1000, 6);
  });

  it('applies BPS slippage symmetrically and SPREAD halves', () => {
    expect(CostEngine.slippagePrice(DEFAULT_RESEARCH_COST, 100, 'BUY')).toBeCloseTo(100.1, 9);
    expect(CostEngine.slippagePrice(DEFAULT_RESEARCH_COST, 100, 'SELL')).toBeCloseTo(99.9, 9);
    const spread = { ...DEFAULT_RESEARCH_COST, slippageModel: 'SPREAD' as const };
    expect(CostEngine.slippagePrice(spread, 100, 'BUY', 20)).toBeCloseTo(100.1, 9);
  });

  it('rounds to lot 100 and caps participation', () => {
    expect(EQUITY_BOARD_LOT).toBe(100);
    expect(CostEngine.roundLot(250)).toBe(200);
    expect(CostEngine.roundLot(99)).toBe(0);
    expect(CostEngine.liquidityCap(10000, 1000, DEFAULT_RESEARCH_COST)).toBe(100);
    expect(CostEngine.liquidityCap(50, 100000, DEFAULT_RESEARCH_COST)).toBe(50);
  });

  it('preserves futures multiplier/tick', () => {
    expect(FUTURES_MULTIPLIER_VND).toBe(100000);
    expect(FUTURES_TICK_POINTS).toBe(0.1);
    expect(CostEngine.futuresNotional(2, 1320.5)).toBe(2 * 1320.5 * 100000);
    expect(CostEngine.roundTick(1320.53)).toBeCloseTo(1320.5, 9);
  });

  it('is versioned', () => {
    expect(DEFAULT_RESEARCH_COST.costModelVersion).toMatch(/^v/);
    expect(DEFAULT_RESEARCH_COST.maxParticipationRate).toBeLessThanOrEqual(1);
  });
});
