import { describe, it, expect } from 'vitest';
import { EarningsGrowthEngine, type PeriodValue } from '../EarningsGrowthEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';

describe('Phase 24 — EarningsGrowthEngine', () => {
  const q1_2023 = FinancialPeriodEngine.quarter(2023, 1);
  const q2_2023 = FinancialPeriodEngine.quarter(2023, 2);
  const q3_2023 = FinancialPeriodEngine.quarter(2023, 3);
  const q4_2023 = FinancialPeriodEngine.quarter(2023, 4);
  const q1_2024 = FinancialPeriodEngine.quarter(2024, 1);
  const q2_2024 = FinancialPeriodEngine.quarter(2024, 2);

  it('calculates YoY growth for comparable quarters', () => {
    const series: PeriodValue[] = [
      { period: q2_2023, value: 20_000_000_000 },
      { period: q2_2024, value: 25_000_000_000 },
    ];

    const current: PeriodValue = { period: q2_2024, value: 25_000_000_000 };
    const yoy = EarningsGrowthEngine.yoy(series, current);

    expect(yoy.basis).toBe('YOY');
    expect(yoy.current).toBe(25_000_000_000);
    expect(yoy.prior).toBe(20_000_000_000);
    expect(yoy.percent).toBe(25.0); // +25%
    expect(yoy.reason).toBeUndefined();
  });

  it('calculates QoQ growth for adjacent discrete quarters', () => {
    const series: PeriodValue[] = [
      { period: q1_2024, value: 20_000_000_000 },
      { period: q2_2024, value: 22_000_000_000 },
    ];

    const current: PeriodValue = { period: q2_2024, value: 22_000_000_000 };
    const qoq = EarningsGrowthEngine.qoq(series, current);

    expect(qoq.basis).toBe('QOQ');
    expect(qoq.current).toBe(22_000_000_000);
    expect(qoq.prior).toBe(20_000_000_000);
    expect(qoq.percent).toBe(10.0); // +10%
  });

  it('fails closed when prior base is <= 0 (non-positive base)', () => {
    const series: PeriodValue[] = [
      { period: q2_2023, value: -5_000_000_000 }, // loss in prior year
      { period: q2_2024, value: 10_000_000_000 },
    ];

    const current: PeriodValue = { period: q2_2024, value: 10_000_000_000 };
    const yoy = EarningsGrowthEngine.yoy(series, current);

    expect(yoy.percent).toBeNull();
    expect(yoy.reason).toBe('VALUE_NON_FINITE');
  });

  it('rejects QoQ calculation on cumulative periods like FY or H1', () => {
    const fy = FinancialPeriodEngine.cumulative(2024, 'FY');
    const qoq = EarningsGrowthEngine.qoq([], { period: fy, value: 50_000_000_000 });
    expect(qoq.percent).toBeNull();
    expect(qoq.currentPeriod).toBeNull();
  });

  it('computes rolling TTM value strictly requiring four consecutive quarters', () => {
    const series: PeriodValue[] = [
      { period: q1_2023, value: 10_000 },
      { period: q2_2023, value: 12_000 },
      { period: q3_2023, value: 11_000 },
      { period: q4_2023, value: 15_000 },
    ];

    const ttm = EarningsGrowthEngine.ttmValue(series, q4_2023);
    expect(ttm).toBe(48_000); // 10k + 12k + 11k + 15k
  });

  it('fails closed: returns null TTM if any quarter is missing from the 4-quarter window', () => {
    const discontinuousSeries: PeriodValue[] = [
      { period: q1_2023, value: 10_000 },
      // q2_2023 missing!
      { period: q3_2023, value: 11_000 },
      { period: q4_2023, value: 15_000 },
    ];

    const ttm = EarningsGrowthEngine.ttmValue(discontinuousSeries, q4_2023);
    expect(ttm).toBeNull();
  });

  it('derives YTD discrete delta for H1 over Q1 of same fiscal year', () => {
    const q1 = { period: FinancialPeriodEngine.quarter(2024, 1), value: 10_000_000_000 };
    const h1 = { period: FinancialPeriodEngine.cumulative(2024, 'H1'), value: 22_000_000_000 };

    const derivedQ2 = EarningsGrowthEngine.deriveYtdDelta(h1, q1);
    expect(derivedQ2).toBe(12_000_000_000); // 22B - 10B
  });
});
