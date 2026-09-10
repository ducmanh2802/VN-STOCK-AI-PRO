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
  const retained = facts.reduce((sum, f) => sum + (f.netProfit ?? 0) - (dividends.get(f.year) ?? 0), 0);
  return retained > 0 && first.netProfit !== null && last.netProfit !== null ? (last.netProfit - first.netProfit) / retained : null;
};
