import { describe, it, expect } from 'vitest';
import { EarningsQualityEngine } from '../EarningsQualityEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import type { IncomeStatement, BalanceSheet, CashFlowStatement } from '../types.ts';

describe('Phase 24 — EarningsQualityEngine', () => {
  const period = FinancialPeriodEngine.quarter(2024, 1);

  const baseIncome: IncomeStatement = {
    revenue: 50_000_000_000,
    cogs: 35_000_000_000,
    grossProfit: 15_000_000_000,
    operatingExpenses: 5_000_000_000,
    operatingProfit: 10_000_000_000,
    ebitda: 11_000_000_000,
    nonOperatingIncome: 200_000_000,
    nonOperatingExpense: 50_000_000,
    pretaxProfit: 10_150_000_000,
    incomeTax: 2_030_000_000,
    netProfit: 8_120_000_000,
    parentNetProfit: 8_000_000_000,
    eps: 1600,
    reportType: 'CONSOLIDATED',
    period,
    reasons: {},
    lineage: { sources: ['HOSE'], engine: 'Test', calculationVersion: '1.0' },
  };

  const baseBS: BalanceSheet = {
    cash: 10_000_000_000,
    shortTermInvestments: 5_000_000_000,
    receivables: 8_000_000_000,
    inventory: 12_000_000_000,
    otherCurrentAssets: 2_000_000_000,
    totalCurrentAssets: 37_000_000_000,
    totalAssets: 80_000_000_000,
    currentLiabilities: 20_000_000_000,
    shortTermDebt: 5_000_000_000,
    otherCurrentLiabilities: 15_000_000_000,
    totalCurrentLiabilities: 20_000_000_000,
    longTermDebt: 10_000_000_000,
    totalLiabilities: 30_000_000_000,
    totalEquity: 50_000_000_000,
    reportType: 'CONSOLIDATED',
    period,
    reasons: {},
    lineage: { sources: ['HOSE'], engine: 'Test', calculationVersion: '1.0' },
  };

  const baseCF: CashFlowStatement = {
    operatingCashFlow: 9_000_000_000,
    investingCashFlow: -3_000_000_000,
    financingCashFlow: -1_000_000_000,
    capex: 2_000_000_000,
    cashDividendsPaid: 1_000_000_000,
    freeCashFlow: 7_000_000_000,
    presentation: 'INDIRECT',
    reportType: 'CONSOLIDATED',
    period,
    reasons: {},
    lineage: { sources: ['HOSE'], engine: 'Test', calculationVersion: '1.0' },
  };

  it('evaluates high-quality earnings with cash conversion >= 1.0', () => {
    const res = EarningsQualityEngine.evaluate({
      income: baseIncome,
      balanceSheet: baseBS,
      cashFlow: {
        ...baseCF,
        operatingCashFlow: 9_000_000_000, // 9B CFO / 8.12B Net Income = 1.11
      },
    });

    expect(res.cashConversion).toBe(1.11);
    expect(res.classification).toBe('PROFIT_SUPPORTED_BY_CASH');
    expect(res.fcfQuality).toBeCloseTo(7_000 / 8_120, 2);
    expect(res.lineage.engine).toBe('EarningsQualityEngine');
  });

  it('classifies partially supported profit when cash conversion is between 0.7 and 1.0', () => {
    const res = EarningsQualityEngine.evaluate({
      income: baseIncome,
      balanceSheet: baseBS,
      cashFlow: {
        ...baseCF,
        operatingCashFlow: 6_500_000_000, // 6.5B / 8.12B = 0.80
      },
    });

    expect(res.cashConversion).toBe(0.8);
    expect(res.classification).toBe('PROFIT_PARTIALLY_SUPPORTED');
  });

  it('classifies low cash conversion and warns when CFO is negative while profit is positive', () => {
    const res = EarningsQualityEngine.evaluate({
      income: baseIncome,
      balanceSheet: baseBS,
      cashFlow: {
        ...baseCF,
        operatingCashFlow: -1_000_000_000, // negative CFO!
      },
      previousIncome: {
        ...baseIncome,
        netProfit: 7_000_000_000,
      },
    });

    expect(res.cashConversion).toBe(-0.12);
    expect(res.classification).toBe('LOW_CASH_CONVERSION');
    expect(res.warnings.some((w) => w.includes('CFO is negative'))).toBe(true);
  });

  it('classifies as INDETERMINATE when cash conversion is null', () => {
    expect(EarningsQualityEngine.classify(null)).toBe('INDETERMINATE');
  });
});
