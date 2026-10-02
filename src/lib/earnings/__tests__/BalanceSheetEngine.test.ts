import { describe, it, expect } from 'vitest';
import { BalanceSheetEngine } from '../BalanceSheetEngine.ts';
import { FinancialPeriodEngine } from '../FinancialPeriodEngine.ts';
import { makeFact } from './fixtures.ts';

describe('Phase 24 — BalanceSheetEngine', () => {
  const period = FinancialPeriodEngine.quarter(2024, 1);

  it('normalizes canonical balance sheet line items', () => {
    const facts = [
      makeFact('CASH', period, 5_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('SHORT_TERM_INVESTMENTS', period, 2_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('RECEIVABLES', period, 8_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('INVENTORY', period, 10_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('OTHER_CURRENT_ASSETS', period, 1_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('TOTAL_CURRENT_ASSETS', period, 26_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('TOTAL_ASSETS', period, 60_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('CURRENT_LIABILITIES', period, 15_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('SHORT_TERM_DEBT', period, 6_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('OTHER_CURRENT_LIABILITIES', period, 9_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('TOTAL_CURRENT_LIABILITIES', period, 15_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('LONG_TERM_DEBT', period, 10_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('TOTAL_LIABILITIES', period, 25_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('TOTAL_EQUITY', period, 35_000_000_000, { statementType: 'BALANCE_SHEET' }),
    ];

    const bs = BalanceSheetEngine.normalize(facts, period, 'CONSOLIDATED');

    expect(bs.cash).toBe(5_000_000_000);
    expect(bs.shortTermInvestments).toBe(2_000_000_000);
    expect(bs.receivables).toBe(8_000_000_000);
    expect(bs.inventory).toBe(10_000_000_000);
    expect(bs.otherCurrentAssets).toBe(1_000_000_000);
    expect(bs.totalCurrentAssets).toBe(26_000_000_000);
    expect(bs.totalAssets).toBe(60_000_000_000);
    expect(bs.currentLiabilities).toBe(15_000_000_000);
    expect(bs.shortTermDebt).toBe(6_000_000_000);
    expect(bs.longTermDebt).toBe(10_000_000_000);
    expect(bs.totalLiabilities).toBe(25_000_000_000);
    expect(bs.totalEquity).toBe(35_000_000_000);
    expect(bs.lineage.engine).toBe('BalanceSheetEngine');
  });

  it('resolves alias names like CASH_AND_EQUIVALENTS and INVENTORIES', () => {
    const facts = [
      makeFact('CASH_AND_EQUIVALENTS', period, 3_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('ACCOUNTS_RECEIVABLE', period, 4_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('INVENTORIES', period, 7_000_000_000, { statementType: 'BALANCE_SHEET' }),
      makeFact('EQUITY', period, 20_000_000_000, { statementType: 'BALANCE_SHEET' }),
    ];

    const bs = BalanceSheetEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(bs.cash).toBe(3_000_000_000);
    expect(bs.receivables).toBe(4_000_000_000);
    expect(bs.inventory).toBe(7_000_000_000);
    expect(bs.totalEquity).toBe(20_000_000_000);
  });

  it('fails closed on missing items without fabricating balancing entries', () => {
    const facts = [
      makeFact('TOTAL_ASSETS', period, 50_000_000_000, { statementType: 'BALANCE_SHEET' }),
    ];

    const bs = BalanceSheetEngine.normalize(facts, period, 'CONSOLIDATED');
    expect(bs.totalAssets).toBe(50_000_000_000);
    expect(bs.cash).toBeNull();
    expect(bs.reasons.cash).toBe('REQUIRED_LINE_ITEM_NOT_FOUND');
    expect(bs.totalLiabilities).toBeNull();
    expect(bs.totalEquity).toBeNull();
  });
});
