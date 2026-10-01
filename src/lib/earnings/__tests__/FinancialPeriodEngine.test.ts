import { describe, it, expect } from 'vitest';
import { FinancialPeriodEngine, inclusiveDayCount, DEFAULT_FISCAL_CONFIG } from '../FinancialPeriodEngine.ts';

describe('Phase 24 — FinancialPeriodEngine', () => {
  it('builds valid quarterly periods with correct bounds', () => {
    const q1 = FinancialPeriodEngine.quarter(2024, 1);
    expect(q1.id).toBe('Q1-2024');
    expect(q1.periodStart).toBe('2024-01-01');
    expect(q1.periodEnd).toBe('2024-03-31');
    expect(q1.durationDays).toBe(inclusiveDayCount('2024-01-01', '2024-03-31'));
    expect(q1.accumulation).toBe('DISCRETE');
    expect(FinancialPeriodEngine.validate(q1).isValid).toBe(true);

    const q4 = FinancialPeriodEngine.quarter(2024, 4);
    expect(q4.periodEnd).toBe('2024-12-31');
    expect(FinancialPeriodEngine.validate(q4).isValid).toBe(true);
  });

  it('handles leap-year February in Q1', () => {
    expect(FinancialPeriodEngine.quarter(2024, 1).durationDays).toBe(91);
    expect(FinancialPeriodEngine.quarter(2023, 1).durationDays).toBe(90);
  });

  it('builds cumulative H1/9M/FY periods', () => {
    expect(FinancialPeriodEngine.cumulative(2024, 'H1').periodEnd).toBe('2024-06-30');
    expect(FinancialPeriodEngine.cumulative(2024, '9M').periodEnd).toBe('2024-09-30');
    const fy = FinancialPeriodEngine.cumulative(2024, 'FY');
    expect(fy.periodEnd).toBe('2024-12-31');
    expect(fy.accumulation).toBe('CUMULATIVE');
    expect(FinancialPeriodEngine.validate(fy).isValid).toBe(true);
  });

  it('rejects invalid year/month inputs deterministically', () => {
    expect(() => FinancialPeriodEngine.quarter(1800, 1)).toThrow();
    expect(() => FinancialPeriodEngine.cumulative(2024, 'YTD', 13)).toThrow();
  });

  it('parses supported period strings', () => {
    expect(FinancialPeriodEngine.parse('FY_2024')?.id).toBe('FY2024');
    expect(FinancialPeriodEngine.parse('FY2024')?.id).toBe('FY2024');
    expect(FinancialPeriodEngine.parse('Q3_2024')?.id).toBe('Q3-2024');
    expect(FinancialPeriodEngine.parse('2024Q2')?.id).toBe('Q2-2024');
    expect(FinancialPeriodEngine.parse('H1-2024')?.id).toBe('H1-2024');
    expect(FinancialPeriodEngine.parse('9M_2024')?.id).toBe('9M-2024');
    expect(FinancialPeriodEngine.parse('TTM-2024-Q4')?.type).toBe('TTM');
  });

  it('fails closed (null) on ambiguous/unparseable strings — never guesses', () => {
    expect(FinancialPeriodEngine.parse('2024')).toBeNull();
    expect(FinancialPeriodEngine.parse('Q5_2024')).toBeNull();
    expect(FinancialPeriodEngine.parse('')).toBeNull();
    expect(FinancialPeriodEngine.parse('random')).toBeNull();
  });

  it('exposes the default fiscal calendar (calendar-year FY)', () => {
    expect(DEFAULT_FISCAL_CONFIG.fiscalYearEndMonth).toBe(12);
  });

  it('enforces quarter-vs-YTD distinction via isComparable', () => {
    const q2 = FinancialPeriodEngine.quarter(2024, 2);
    const h1 = FinancialPeriodEngine.cumulative(2024, 'H1');
    const q3 = FinancialPeriodEngine.quarter(2024, 3);
    const nineM = FinancialPeriodEngine.cumulative(2024, '9M');
    const q4 = FinancialPeriodEngine.quarter(2024, 4);
    const fy = FinancialPeriodEngine.cumulative(2024, 'FY');

    expect(FinancialPeriodEngine.isComparable(q2, h1)).toBe(false);
    expect(FinancialPeriodEngine.isComparable(q3, nineM)).toBe(false);
    expect(FinancialPeriodEngine.isComparable(q4, fy)).toBe(false);
    expect(FinancialPeriodEngine.isComparable(q2, FinancialPeriodEngine.quarter(2023, 2))).toBe(true);
  });

  it('identifies YoY and QoQ pairs deterministically', () => {
    const q2_2024 = FinancialPeriodEngine.quarter(2024, 2);
    const q2_2023 = FinancialPeriodEngine.quarter(2023, 2);
    const q1_2024 = FinancialPeriodEngine.quarter(2024, 1);
    expect(FinancialPeriodEngine.isYearOverYearPair(q2_2024, q2_2023)).toBe(true);
    expect(FinancialPeriodEngine.isQuarterOverQuarterPair(q2_2024, q1_2024)).toBe(true);
    expect(FinancialPeriodEngine.isQuarterOverQuarterPair(q2_2024, q2_2023)).toBe(false);
  });

  it('orders periods deterministically', () => {
    const periods = [
      FinancialPeriodEngine.quarter(2024, 3),
      FinancialPeriodEngine.quarter(2024, 1),
      FinancialPeriodEngine.cumulative(2024, 'FY'),
      FinancialPeriodEngine.quarter(2023, 4),
    ];
    const sorted = [...periods].sort((a, b) => FinancialPeriodEngine.compare(a, b)).map((p) => p.id);
    expect(sorted).toEqual(['Q4-2023', 'Q1-2024', 'Q3-2024', 'FY2024']);
  });

  it('builds TTM only from four consecutive quarters (fail-closed otherwise)', () => {
    const four = [
      FinancialPeriodEngine.quarter(2024, 1),
      FinancialPeriodEngine.quarter(2024, 2),
      FinancialPeriodEngine.quarter(2024, 3),
      FinancialPeriodEngine.quarter(2024, 4),
    ];
    const ttm = FinancialPeriodEngine.buildTTM(four);
    expect(ttm?.type).toBe('TTM');
    expect(ttm?.periodStart).toBe('2024-01-01');
    expect(ttm?.periodEnd).toBe('2024-12-31');

    const gap = [
      FinancialPeriodEngine.quarter(2024, 1),
      FinancialPeriodEngine.quarter(2024, 3),
      FinancialPeriodEngine.quarter(2024, 4),
      FinancialPeriodEngine.quarter(2023, 4),
    ];
    expect(FinancialPeriodEngine.buildTTM(gap)).toBeNull();
    expect(FinancialPeriodEngine.buildTTM(four.slice(0, 3))).toBeNull();
  });

  it('builds rolling TTM across a fiscal-year boundary', () => {
    const rolling = [
      FinancialPeriodEngine.quarter(2023, 3),
      FinancialPeriodEngine.quarter(2023, 4),
      FinancialPeriodEngine.quarter(2024, 1),
      FinancialPeriodEngine.quarter(2024, 2),
    ];
    const ttm = FinancialPeriodEngine.buildTTM(rolling);
    expect(ttm?.periodStart).toBe('2023-07-01');
    expect(ttm?.periodEnd).toBe('2024-06-30');
  });

  it('validate() rejects structurally inconsistent periods', () => {
    const q1 = FinancialPeriodEngine.quarter(2024, 1);
    expect(FinancialPeriodEngine.validate({ ...q1, durationDays: 999 }).isValid).toBe(false);
    expect(FinancialPeriodEngine.validate({ ...q1, accumulation: 'CUMULATIVE' }).isValid).toBe(false);
    expect(FinancialPeriodEngine.validate(null).isValid).toBe(false);
  });
});
