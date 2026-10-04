/**
 * PHASE 24 — BALANCE SHEET NORMALIZATION ENGINE
 * =============================================
 * Normalizes canonical balance-sheet facts into a deterministic statement.
 * Fail-closed: missing fields remain `null` with an explicit reason code.
 * No field is derived/back-filled to satisfy the schema.
 */

import type {
  BalanceSheet,
  CanonicalFinancialFact,
  DataUnavailableReasonCode,
  EarningsReportType,
  FinancialPeriod,
} from './types.ts';
import { buildFactIndex, lookupMetric, type FactIndex, type MetricLookup } from './factLookup.ts';
import { buildLineage } from './lineage.ts';

export const BALANCE_METRIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  cash: ['CASH', 'CASH_AND_EQUIVALENTS'],
  shortTermInvestments: ['SHORT_TERM_INVESTMENTS'],
  receivables: ['RECEIVABLES', 'ACCOUNTS_RECEIVABLE'],
  inventory: ['INVENTORY', 'INVENTORIES'],
  otherCurrentAssets: ['OTHER_CURRENT_ASSETS'],
  totalCurrentAssets: ['TOTAL_CURRENT_ASSETS', 'CURRENT_ASSETS'],
  totalAssets: ['TOTAL_ASSETS'],
  // Fail-closed (P24-D5): short-term vs total current liabilities use DISTINCT
  // keys. A filing that reports only one of them leaves the other null — the
  // engines never copy one field into the other.
  currentLiabilities: ['CURRENT_LIABILITIES'],
  shortTermDebt: ['SHORT_TERM_DEBT'],
  otherCurrentLiabilities: ['OTHER_CURRENT_LIABILITIES'],
  totalCurrentLiabilities: ['TOTAL_CURRENT_LIABILITIES'],
  longTermDebt: ['LONG_TERM_DEBT'],
  totalLiabilities: ['TOTAL_LIABILITIES', 'LIABILITIES'],
  totalEquity: ['TOTAL_EQUITY', 'EQUITY'],
};

function firstAvailable(index: FactIndex, aliases: readonly string[]): MetricLookup {
  for (const alias of aliases) {
    const hit = lookupMetric(index, alias);
    if (hit.fact !== null) return hit;
  }
  return { value: null, reason: 'REQUIRED_LINE_ITEM_NOT_FOUND', fact: null };
}

export class BalanceSheetEngine {
  public static normalize(
    facts: readonly CanonicalFinancialFact[],
    period: FinancialPeriod,
    reportType: EarningsReportType
  ): BalanceSheet {
    const index = buildFactIndex(facts);
    const reasons: Record<string, DataUnavailableReasonCode> = {};
    const usedFacts: CanonicalFinancialFact[] = [];

    const pick = (field: keyof typeof BALANCE_METRIC_ALIASES): number | null => {
      const hit = firstAvailable(index, BALANCE_METRIC_ALIASES[field]);
      if (hit.fact) usedFacts.push(hit.fact);
      if (hit.reason) reasons[field] = hit.reason;
      return hit.value;
    };

    return Object.freeze({
      cash: pick('cash'),
      shortTermInvestments: pick('shortTermInvestments'),
      receivables: pick('receivables'),
      inventory: pick('inventory'),
      otherCurrentAssets: pick('otherCurrentAssets'),
      totalCurrentAssets: pick('totalCurrentAssets'),
      totalAssets: pick('totalAssets'),
      currentLiabilities: pick('currentLiabilities'),
      shortTermDebt: pick('shortTermDebt'),
      otherCurrentLiabilities: pick('otherCurrentLiabilities'),
      totalCurrentLiabilities: pick('totalCurrentLiabilities'),
      longTermDebt: pick('longTermDebt'),
      totalLiabilities: pick('totalLiabilities'),
      totalEquity: pick('totalEquity'),
      reportType,
      period,
      reasons: Object.freeze({ ...reasons }),
      lineage: buildLineage(usedFacts, { engine: 'BalanceSheetEngine' }),
    });
  }
}
