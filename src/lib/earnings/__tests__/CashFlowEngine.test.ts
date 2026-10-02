import { describe, it, expect } from 'vitest';
import { CashFlowEngine } from '../CashFlowEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { makeFact } from './fixtures.ts';

describe('Phase 24 — CashFlowEngine', () => {
  const period = FinancialPeriodEngine.quarter(2024, 1);

  it('computes canonical FCF as CFO - |CAPEX| with positive CAPEX magnitude', () => {
    const facts = [
      makeFact('CFO', period, 10_000_000_000, { statementType: 'CASH_FLOW' }),
      makeFact('ICF', period, -4_000_000_000, { statementType: 'CASH_FLOW' }),
      makeFact('FINANCING_CASH_FLOW', period, -2_000_000_000, { statementType: 'CASH_FLOW' }),
      makeFact('CAPEX', period, -3_500_000_000, { statementType: 'CASH_FLOW' }), // negative in filing
      makeFact('CASH_DIVIDEND_PAID', period, 1_000_000_000, { statementType: 'CASH_FLOW' }),
    ];

    const cf = CashFlowEngine.normalize(facts, period, 'CONSOLIDATED', 'INDIRECT');

    expect(cf.operatingCashFlow).toBe(10_000_000_000);
    expect(cf.investingCashFlow).toBe(-4_000_000_000);
    expect(cf.financingCashFlow).toBe(-2_000_000_000);
    expect(cf.capex).toBe(3_500_000_000); // strictly positive magnitude
    expect(cf.cashDividendsPaid).toBe(1_000_000_000);
    expect(cf.freeCashFlow).toBe(6_500_000_000); // 10B - 3.5B
    expect(cf.presentation).toBe('INDIRECT');
    expect(cf.lineage.engine).toBe('CashFlowEngine');
  });

  it('normalizes CAPEX correctly when already provided as a positive value', () => {
    const facts = [
      makeFact('CFO', period, 8_000_000_000, { statementType: 'CASH_FLOW' }),
      makeFact('CAPEX', period, 2_000_000_000, { statementType: 'CASH_FLOW' }),
    ];

    const cf = CashFlowEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(cf.capex).toBe(2_000_000_000);
    expect(cf.freeCashFlow).toBe(6_000_000_000);
  });

  it('fails closed: FCF is null when CFO is missing', () => {
    const facts = [
      makeFact('CAPEX', period, 2_000_000_000, { statementType: 'CASH_FLOW' }),
    ];

    const cf = CashFlowEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(cf.operatingCashFlow).toBeNull();
    expect(cf.freeCashFlow).toBeNull();
    expect(cf.reasons.freeCashFlow).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
  });

  it('fails closed: FCF is null when CAPEX is missing', () => {
    const facts = [
      makeFact('CFO', period, 5_000_000_000, { statementType: 'CASH_FLOW' }),
    ];

    const cf = CashFlowEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(cf.freeCashFlow).toBeNull();
    expect(cf.reasons.freeCashFlow).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
  });
});
