import { describe, it, expect } from 'vitest';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { IncomeStatementEngine } from '../IncomeStatementEngine.ts';
import { CashFlowEngine } from '../CashFlowEngine.ts';
import { MarginEngine } from '../MarginEngine.ts';
import { EpsEngine } from '../EpsEngine.ts';
import { EarningsGrowthEngine } from '../EarningsGrowthEngine.ts';
import { EarningsCalendarEngine } from '../EarningsCalendarEngine.ts';
import { makeFact } from './fixtures.ts';

describe('Phase 24 — EarningsFailClosed', () => {
  const period = FinancialPeriodEngine.quarter(2024, 1);

  it('fails closed on missing revenue: margins are null and never NaN', () => {
    const income = IncomeStatementEngine.normalize([], period, 'CONSOLIDATED');
    const cf = CashFlowEngine.normalize([], period, 'CONSOLIDATED');
    const margins = MarginEngine.normalize(income, cf);

    expect(margins.grossMargin).toBeNull();
    expect(margins.operatingMargin).toBeNull();
    expect(margins.fcfMargin).toBeNull();
    expect(margins.reasons.grossMargin).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
  });

  it('fails closed when revenue is 0: avoids division by zero', () => {
    const facts = [makeFact('NET_REVENUE', period, 0)];
    const income = IncomeStatementEngine.normalize(facts, period, 'CONSOLIDATED');
    const cf = CashFlowEngine.normalize([], period, 'CONSOLIDATED');
    const margins = MarginEngine.normalize(income, cf);

    expect(margins.grossMargin).toBeNull();
    expect(margins.netMargin).toBeNull();
  });

  it('fails closed on missing CFO or CAPEX: FCF is strictly null', () => {
    // Only CFO
    const cfOnlyCfo = CashFlowEngine.normalize([makeFact('CFO', period, 5000)], period, 'CONSOLIDATED');
    expect(cfOnlyCfo.freeCashFlow).toBeNull();
    expect(cfOnlyCfo.reasons.freeCashFlow).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');

    // Only CAPEX
    const cfOnlyCapex = CashFlowEngine.normalize([makeFact('CAPEX', period, 2000)], period, 'CONSOLIDATED');
    expect(cfOnlyCapex.freeCashFlow).toBeNull();
    expect(cfOnlyCapex.reasons.freeCashFlow).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
  });

  it('fails closed on zero or negative share count: EPS is null and not Infinity', () => {
    const epsZero = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 10_000_000,
      parentNetProfit: 10_000_000,
      weightedShares: 0,
    });

    expect(epsZero.basicEps).toBeNull();
    expect(epsZero.reason).toBe('VALUE_NON_FINITE');

    const epsNeg = EpsEngine.compute({
      symbol: 'HPG',
      period,
      reportType: 'CONSOLIDATED',
      netProfit: 10_000_000,
      parentNetProfit: 10_000_000,
      weightedShares: -500,
    });

    expect(epsNeg.basicEps).toBeNull();
    expect(epsNeg.reason).toBe('VALUE_NON_FINITE');
  });

  it('fails closed when growth prior base is non-positive or missing', () => {
    const cur = { period: FinancialPeriodEngine.quarter(2024, 1), value: 1000 };
    const priorNeg = { period: FinancialPeriodEngine.quarter(2023, 1), value: -500 };
    const priorZero = { period: FinancialPeriodEngine.quarter(2023, 1), value: 0 };

    const yoyNeg = EarningsGrowthEngine.growthMetric('YOY', cur, priorNeg);
    expect(yoyNeg.percent).toBeNull();
    expect(yoyNeg.reason).toBe('VALUE_NON_FINITE');

    const yoyZero = EarningsGrowthEngine.growthMetric('YOY', cur, priorZero);
    expect(yoyZero.percent).toBeNull();
    expect(yoyZero.reason).toBe('VALUE_NON_FINITE');

    const yoyMissing = EarningsGrowthEngine.growthMetric('YOY', cur, null);
    expect(yoyMissing.percent).toBeNull();
    expect(yoyMissing.reason).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
  });

  it('fails closed on invalid period strings: returns null rather than guessing', () => {
    expect(FinancialPeriodEngine.parse('UNKNOWN')).toBeNull();
    expect(FinancialPeriodEngine.parse('2024')).toBeNull();
    expect(FinancialPeriodEngine.parse('')).toBeNull();
  });

  it('fails closed on unparseable calendar dates: sets UNKNOWN status with reason', () => {
    const cal = EarningsCalendarEngine.buildCalendar('HPG', [
      {
        symbol: 'HPG',
        period: 'Q1-2024',
        reportDate: 'invalid-date-format',
      },
    ]);

    expect(cal.entries).toHaveLength(1);
    expect(cal.entries[0].status).toBe('UNKNOWN');
    expect(cal.entries[0].reportDate).toBeNull();
    expect(cal.entries[0].reason).toBe('CORRUPTED_DOCUMENT_STRUCTURE');
  });

  it('fails closed on discontinuous quarters for TTM calculation', () => {
    const discontinuous = [
      { period: FinancialPeriodEngine.quarter(2023, 1), value: 100 },
      { period: FinancialPeriodEngine.quarter(2023, 3), value: 100 }, // Q2 missing!
      { period: FinancialPeriodEngine.quarter(2023, 4), value: 100 },
      { period: FinancialPeriodEngine.quarter(2024, 1), value: 100 },
    ];

    const ttm = EarningsGrowthEngine.ttmValue(discontinuous, FinancialPeriodEngine.quarter(2024, 1));
    expect(ttm).toBeNull();
  });
});
