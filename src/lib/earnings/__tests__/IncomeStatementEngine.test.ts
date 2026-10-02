import { describe, it, expect } from 'vitest';
import { IncomeStatementEngine } from '../IncomeStatementEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { makeFact } from './fixtures.ts';

describe('Phase 24 — IncomeStatementEngine', () => {
  const period = FinancialPeriodEngine.quarter(2024, 1);

  it('normalizes canonical income statement fields from facts', () => {
    const facts = [
      makeFact('NET_REVENUE', period, 30_000_000_000),
      makeFact('COGS', period, 20_000_000_000),
      makeFact('GROSS_PROFIT', period, 10_000_000_000),
      makeFact('OPERATING_EXPENSES', period, 2_000_000_000),
      makeFact('OPERATING_PROFIT', period, 8_000_000_000),
      makeFact('EBITDA', period, 9_500_000_000),
      makeFact('NON_OPERATING_INCOME', period, 500_000_000),
      makeFact('NON_OPERATING_EXPENSE', period, 100_000_000),
      makeFact('PRETAX_PROFIT', period, 8_400_000_000),
      makeFact('INCOME_TAX', period, 1_680_000_000),
      makeFact('NET_PROFIT', period, 6_720_000_000),
      makeFact('PARENT_NET_PROFIT', period, 6_500_000_000),
      makeFact('EPS', period, 1200),
    ];

    const statement = IncomeStatementEngine.normalize(facts, period, 'CONSOLIDATED');

    expect(statement.revenue).toBe(30_000_000_000);
    expect(statement.cogs).toBe(20_000_000_000);
    expect(statement.grossProfit).toBe(10_000_000_000);
    expect(statement.operatingExpenses).toBe(2_000_000_000);
    expect(statement.operatingProfit).toBe(8_000_000_000);
    expect(statement.ebitda).toBe(9_500_000_000);
    expect(statement.nonOperatingIncome).toBe(500_000_000);
    expect(statement.nonOperatingExpense).toBe(100_000_000);
    expect(statement.pretaxProfit).toBe(8_400_000_000);
    expect(statement.incomeTax).toBe(1_680_000_000);
    expect(statement.netProfit).toBe(6_720_000_000);
    expect(statement.parentNetProfit).toBe(6_500_000_000);
    expect(statement.eps).toBe(1200);
    expect(statement.reportType).toBe('CONSOLIDATED');
    expect(statement.period.id).toBe(period.id);
    expect(statement.lineage.engine).toBe('IncomeStatementEngine');
  });

  it('resolves metric aliases such as REVENUE and EBIT', () => {
    const facts = [
      makeFact('REVENUE', period, 15_000_000_000),
      makeFact('EBIT', period, 4_000_000_000),
      makeFact('PROFIT_BEFORE_TAX', period, 4_200_000_000),
    ];

    const statement = IncomeStatementEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(statement.revenue).toBe(15_000_000_000);
    expect(statement.operatingProfit).toBe(4_000_000_000);
    expect(statement.pretaxProfit).toBe(4_200_000_000);
  });

  it('fails closed on missing line items: sets null and records reasons', () => {
    const facts = [
      makeFact('NET_REVENUE', period, 10_000_000_000),
    ];

    const statement = IncomeStatementEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(statement.revenue).toBe(10_000_000_000);
    expect(statement.grossProfit).toBeNull();
    expect(statement.reasons.grossProfit).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
    expect(statement.netProfit).toBeNull();
    expect(statement.reasons.netProfit).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
  });

  it('propagates unavailable reasons when fact has null value', () => {
    const facts = [
      makeFact('NET_REVENUE', period, null, { freshness: 'UNAVAILABLE' }),
    ];

    const statement = IncomeStatementEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(statement.revenue).toBeNull();
    expect(statement.reasons.revenue).toBeDefined();
  });
});
