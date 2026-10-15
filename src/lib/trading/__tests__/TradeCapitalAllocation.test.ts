import { describe, expect, it } from 'vitest';
import { TradeCapitalAllocation } from '../capitalAllocation/TradeCapitalAllocation.ts';
import type { TradeCapitalAllocationInput } from '../capitalAllocation/TradeCapitalAllocationTypes.ts';

const input = (overrides: Partial<TradeCapitalAllocationInput> = {}): TradeCapitalAllocationInput => ({
  account: { equity: 100_000_000, availableCash: 50_000_000, marketValue: 20_000_000 },
  recommendation: { signal: 'BUY' }, riskDecision: { approved: true, code: 'APPROVED', reason: 'Approved' },
  riskConfig: { maxPortfolioExposureRate: 0.8 }, riskApprovedCapital: 40_000_000, ...overrides,
});

describe('TradeCapitalAllocation', () => {
  it('allocates capital only, capped by the smallest canonical capacity', () => {
    const result = TradeCapitalAllocation.allocate(input());
    expect(result).toMatchObject({ status: 'ALLOCATED', allocationCapital: 40_000_000, allocationPct: 40 });
    if (result.status === 'ALLOCATED') expect(20_000_000 + result.allocationCapital).toBeLessThanOrEqual(100_000_000 * 0.8);
    expect('quantity' in result).toBe(false);
  });
  it('applies cash, exposure, and risk caps', () => {
    expect(TradeCapitalAllocation.allocate(input({ account: { equity: 100_000_000, availableCash: 10_000_000, marketValue: 20_000_000 } })).allocationCapital).toBe(10_000_000);
    expect(TradeCapitalAllocation.allocate(input({ account: { equity: 100_000_000, availableCash: 50_000_000, marketValue: 75_000_000 } })).allocationCapital).toBe(5_000_000);
    expect(TradeCapitalAllocation.allocate(input({ riskApprovedCapital: 2_000_000 })).allocationCapital).toBe(2_000_000);
  });
  it('fails closed for risk rejection, sell, zero capacity, missing and invalid numbers', () => {
    expect(TradeCapitalAllocation.allocate(input({ riskDecision: { approved: false, code: 'EXCESSIVE_RISK', reason: 'Denied' } })).allocationCapital).toBe(0);
    expect(TradeCapitalAllocation.allocate(input({ recommendation: { signal: 'SELL' } })).status).toBe('NOT_APPLICABLE');
    expect(TradeCapitalAllocation.allocate(input({ account: { equity: 100_000_000, availableCash: 0, marketValue: 20_000_000 } })).allocationCapital).toBe(0);
    expect(TradeCapitalAllocation.allocate(input({ account: { equity: Number.NaN, availableCash: 1, marketValue: 0 } })).status).toBe('INSUFFICIENT_DATA');
    expect(TradeCapitalAllocation.allocate(input({ riskApprovedCapital: Number.POSITIVE_INFINITY })).status).toBe('INSUFFICIENT_DATA');
    expect(TradeCapitalAllocation.allocate(input({ riskConfig: { maxPortfolioExposureRate: 1.1 } })).status).toBe('INSUFFICIENT_DATA');
  });
});
