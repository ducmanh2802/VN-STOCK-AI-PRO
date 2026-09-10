import { describe, expect, it } from 'vitest';
import { CapitalAllocationEngine } from '../CapitalAllocationEngine.ts';
import type { AnnualFinancialFact } from '../../enterprise/financialFacts.ts';

const fact = (year: number, values: Partial<AnnualFinancialFact>): AnnualFinancialFact => ({
  year, period: `FY${year}`, source: 'Test financial statements', calculationMethod: 'period_end', revenue: null, grossProfit: null, operatingProfit: null, ebitda: null, netProfit: null, cfo: null, capex: null, totalAssets: null, totalLiabilities: null, totalEquity: null, currentAssets: null, currentLiabilities: null, cash: null, inventory: null, receivables: null, interestExpense: null, longTermDebt: null, sharesOutstanding: null, eps: null, bvps: null, ...values
});

describe('CapitalAllocationEngine', () => {
  it('calculates cash, FCF, payout and normalized profit view from explicit statement scenarios', () => {
    const r = CapitalAllocationEngine.analyze({ symbol: 'TEST', asOfDate: '2025-12-31', facts: { annals: [
      fact(2024, { revenue: 1000, netProfit: 100, cfo: 120, capex: 30, totalEquity: 400, operatingProfit: 140 }),
      fact(2025, { revenue: 1200, netProfit: 150, cfo: 180, capex: 60, totalEquity: 500, operatingProfit: 200 }),
    ] }, dividendsPaid: new Map([[2024, 20], [2025, 45]]) });
    expect(r.dataStatus).toBe('OK');
    expect(r.metrics.fcf.value).toBe(120);
    expect(r.metrics.cashConversion.value).toBe(120);
    expect(r.metrics.dividendPayout.value).toBe(30);
    expect(r.normalizedPer1000Billion).toEqual({ dividend: 300, retained: 700 });
    expect(r.evidence.some(e => e.lineItem === 'Operating cash flow')).toBe(true);
  });

  it('does not invent missing cash flow, capex or dividends', () => {
    const r = CapitalAllocationEngine.analyze({ symbol: 'TEST', asOfDate: null, facts: { annals: [fact(2025, { revenue: 100, netProfit: 10, totalEquity: 50 })] } });
    expect(r.dataStatus).toBe('DATA_UNAVAILABLE');
    expect(r.score).toBeNull();
    expect(r.metrics.fcf.value).toBeNull();
    expect(r.explanations[0].title).toContain('Chưa đủ');
  });

  it('uses bank-specific handling and does not calculate industrial FCF/ROIC', () => {
    const r = CapitalAllocationEngine.analyze({ symbol: 'BANK', companyType: 'BANK', asOfDate: null, facts: { annals: [fact(2025, { netProfit: 200, cfo: 1, capex: 1, totalEquity: 1000 })] }, dividendsPaid: new Map([[2025, 20]]) });
    expect(r.metrics.fcf.value).toBeNull();
    expect(r.metrics.roic.value).toBeNull();
    expect(r.investorWatchlist[0]).toContain('tăng trưởng tín dụng');
  });
});
