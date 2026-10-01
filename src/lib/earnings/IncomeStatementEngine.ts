/**
 * PHASE 24 — INCOME STATEMENT NORMALIZATION ENGINE
 * ================================================
 * Normalizes canonical income-statement facts into a deterministic statement.
 *
 * Fail-closed: unrecognized/absent line items remain `null` with an explicit
 * reason code. No accounting identity is invented to fill a missing field.
 */

import type {
  CanonicalFinancialFact,
  DataUnavailableReasonCode,
  EarningsReportType,
  FinancialPeriod,
  IncomeStatement,
} from './types.ts';
import { buildFactIndex, lookupMetric, type FactIndex, type MetricLookup } from './factLookup.ts';
import { buildLineage } from './lineage.ts';

/** Canonical Phase-24 income-statement metric keys (with source aliases). */
export const INCOME_METRIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  revenue: ['NET_REVENUE', 'REVENUE'],
  cogs: ['COGS', 'COST_OF_GOODS_SOLD'],
  grossProfit: ['GROSS_PROFIT'],
  operatingExpenses: ['OPERATING_EXPENSES'],
  operatingProfit: ['OPERATING_PROFIT', 'EBIT'],
  ebitda: ['EBITDA'],
  nonOperatingIncome: ['NON_OPERATING_INCOME'],
  nonOperatingExpense: ['NON_OPERATING_EXPENSE'],
  pretaxProfit: ['PRETAX_PROFIT', 'PROFIT_BEFORE_TAX'],
  incomeTax: ['INCOME_TAX', 'TAX_EXPENSE'],
  netProfit: ['NET_PROFIT'],
  parentNetProfit: ['PARENT_NET_PROFIT', 'NET_PROFIT_ATTRIBUTABLE_TO_PARENT'],
  eps: ['EPS'],
};

function firstAvailable(index: FactIndex, aliases: readonly string[]): MetricLookup {
  for (const alias of aliases) {
    const hit = lookupMetric(index, alias);
    if (hit.fact !== null) return hit;
  }
  return { value: null, reason: 'REQUIRED_LINE_ITEM_NOT_FOUND', fact: null };
}

export class IncomeStatementEngine {
  /** Normalizes an income statement from canonical facts. */
  public static normalize(
    facts: readonly CanonicalFinancialFact[],
    period: FinancialPeriod,
    reportType: EarningsReportType
  ): IncomeStatement {
    const index = buildFactIndex(facts);
    const reasons: Record<string, DataUnavailableReasonCode> = {};
    const usedFacts: CanonicalFinancialFact[] = [];

    const pick = (field: keyof typeof INCOME_METRIC_ALIASES): number | null => {
      const hit = firstAvailable(index, INCOME_METRIC_ALIASES[field]);
      if (hit.fact) usedFacts.push(hit.fact);
      if (hit.reason) reasons[field] = hit.reason;
      return hit.value;
    };

    const revenue = pick('revenue');
    const cogs = pick('cogs');
    const grossProfit = pick('grossProfit');
    const operatingExpenses = pick('operatingExpenses');
    const operatingProfit = pick('operatingProfit');
    const ebitda = pick('ebitda');
    const nonOperatingIncome = pick('nonOperatingIncome');
    const nonOperatingExpense = pick('nonOperatingExpense');
    const pretaxProfit = pick('pretaxProfit');
    const incomeTax = pick('incomeTax');
    const netProfit = pick('netProfit');
    const parentNetProfit = pick('parentNetProfit');
    const eps = pick('eps');

    return Object.freeze({
      revenue,
      cogs,
      grossProfit,
      operatingExpenses,
      operatingProfit,
      ebitda,
      nonOperatingIncome,
      nonOperatingExpense,
      pretaxProfit,
      incomeTax,
      netProfit,
      parentNetProfit,
      eps,
      reportType,
      period,
      reasons: Object.freeze({ ...reasons }),
      lineage: buildLineage(usedFacts, { engine: 'IncomeStatementEngine' }),
    });
  }
}
