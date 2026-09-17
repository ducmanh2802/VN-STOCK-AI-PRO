import type { AnnualFinancialFact } from './types.ts';

export const pct = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator !== 0 ? (numerator / denominator) * 100 : null;
export const change = (current: number | null, previous: number | null): number | null =>
  current !== null && previous !== null && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;
export const fcf = (f: AnnualFinancialFact): number | null =>
  f.cfo !== null && f.capex !== null ? f.cfo - f.capex : null;
export const roe = (current: AnnualFinancialFact, previous: AnnualFinancialFact | null): number | null =>
  pct(current.netProfit, current.totalEquity !== null && previous?.totalEquity != null ? (current.totalEquity + previous.totalEquity) / 2 : current.totalEquity);
export const roic = (current: AnnualFinancialFact, previous: AnnualFinancialFact | null): number | null => {
  const capital = current.totalEquity !== null && current.longTermDebt !== null ? current.totalEquity + current.longTermDebt : null;
  const prior = previous?.totalEquity != null && previous?.longTermDebt != null ? previous.totalEquity + previous.longTermDebt : null;
  return pct(current.operatingProfit, capital !== null && prior !== null ? (capital + prior) / 2 : capital);
};
/** An analytical association, not a causal proof. */
export const incrementalProfitPerRetainedCapital = (facts: AnnualFinancialFact[], dividends: Map<number, number | null>): number | null => {
  if (facts.length < 2) return null;
  const first = facts[0]; const last = facts[facts.length - 1];
  if (first.netProfit === null || last.netProfit === null) return null;

  let retained = 0;
  for (const f of facts) {
    if (f.netProfit === null) return null;
    const div = dividends.get(f.year);
    if (div === undefined || div === null) return null;
    retained += f.netProfit - div;
  }
  return retained > 0 ? (last.netProfit - first.netProfit) / retained : null;
};
