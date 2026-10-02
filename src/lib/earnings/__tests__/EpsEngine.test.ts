import { describe, it, expect } from 'vitest';
import { EpsEngine, type ShareAdjustmentEvent } from '../EpsEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { makeFact } from './fixtures.ts';

describe('Phase 24 — EpsEngine', () => {
  const period = FinancialPeriodEngine.quarter(2023, 4);

  it('computes basic and diluted EPS prioritizing parent-attributable profit', () => {
    const res = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 10_000_000_000,
      parentNetProfit: 9_500_000_000, // priority
      weightedShares: 5_000_000_000,
      dilutedShares: 5_200_000_000,
    });

    expect(res.basicEps).toBe(1.9); // 9.5B / 5B
    expect(res.dilutedEps).toBe(1.83); // 9.5B / 5.2B
    expect(res.comparableShares).toBe(5_000_000_000);
    expect(res.adjustedBasicEps).toBe(1.9);
  });

  it('falls back to total net profit when parentNetProfit is null', () => {
    const res = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 8_000_000_000,
      parentNetProfit: null,
      weightedShares: 4_000_000_000,
    });

    expect(res.basicEps).toBe(2.0); // 8B / 4B
  });

  it('fails closed: returns null when shares are missing or non-positive', () => {
    const resNull = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 5_000_000_000,
      parentNetProfit: null,
      weightedShares: null,
    });
    expect(resNull.basicEps).toBeNull();
    expect(resNull.reason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');

    const resZero = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 5_000_000_000,
      parentNetProfit: null,
      weightedShares: 0,
    });
    expect(resZero.basicEps).toBeNull();
    expect(resZero.reason).toBe('VALUE_NON_FINITE');
  });

  it('applies Phase 23 corporate action multipliers for historical comparability', () => {
    // Period ended 2023-12-31.
    // In 2024, company conducts 10:1 stock dividend (10% increase in shares).
    const events: ShareAdjustmentEvent[] = [
      {
        exDate: '2024-05-22',
        actionType: 'STOCK_DIVIDEND',
        rawRatioExpression: '10:1',
        effect: 'INCREASE',
      },
    ];

    const res = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 11_000_000_000,
      parentNetProfit: 11_000_000_000,
      weightedShares: 5_000_000_000,
      corporateActions: events,
    });

    expect(res.basicEps).toBe(2.2); // 11B / 5B
    // Comparable shares increased by 10% -> 5.5B shares
    expect(res.comparableShares).toBe(5_500_000_000);
    // Adjusted EPS = 11B / 5.5B = 2.0
    expect(res.adjustedBasicEps).toBe(2.0);
  });
});
