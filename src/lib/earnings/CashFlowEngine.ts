/**
 * PHASE 24 — CASH FLOW NORMALIZATION ENGINE
 * =========================================
 * Canonical free cash flow definition (SINGLE source of truth in Phase 24):
 *
 *     FCF = OperatingCashFlow − |CAPEX|
 *
 * Sign convention (documented, deterministic):
 *   - CAPEX is stored as a strictly POSITIVE magnitude (|x|).
 *   - Investing/financing cash flows retain the source sign convention
 *     (negative = cash outflow) and are never re-signed.
 *   - FCF is undefined (null) unless BOTH operatingCashFlow and capex exist.
 */

import type {
  CanonicalFinancialFact,
  CashFlowStatement,
  DataUnavailableReasonCode,
  EarningsReportType,
  FinancialPeriod,
} from './types.ts';
import { buildFactIndex, lookupMetric, type FactIndex, type MetricLookup } from './factLookup.ts';
import { buildLineage } from './lineage.ts';
import { round } from './helpers.ts';

export const CASHFLOW_METRIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  operatingCashFlow: ['CFO', 'OPERATING_CASH_FLOW'],
  investingCashFlow: ['ICF', 'INVESTING_CASH_FLOW'],
  financingCashFlow: ['FINANCING_CASH_FLOW'],
  capex: ['CAPEX', 'CAPITAL_EXPENDITURE'],
  cashDividendsPaid: ['CASH_DIVIDEND_PAID', 'DIVIDENDS_PAID'],
};

export type CashFlowPresentation = 'DIRECT' | 'INDIRECT' | 'UNKNOWN';

function firstAvailable(index: FactIndex, aliases: readonly string[]): MetricLookup {
  for (const alias of aliases) {
    const hit = lookupMetric(index, alias);
    if (hit.fact !== null) return hit;
  }
  return { value: null, reason: 'REQUIRED_LINE_ITEM_NOT_FOUND', fact: null };
}

export class CashFlowEngine {
  public static normalize(
    facts: readonly CanonicalFinancialFact[],
    period: FinancialPeriod,
    reportType: EarningsReportType,
    presentation: CashFlowPresentation = 'UNKNOWN'
  ): CashFlowStatement {
    const index = buildFactIndex(facts);
    const reasons: Record<string, DataUnavailableReasonCode> = {};
    const usedFacts: CanonicalFinancialFact[] = [];

    const pick = (field: keyof typeof CASHFLOW_METRIC_ALIASES): number | null => {
      const hit = firstAvailable(index, CASHFLOW_METRIC_ALIASES[field]);
      if (hit.fact) usedFacts.push(hit.fact);
      if (hit.reason) reasons[field] = hit.reason;
      return hit.value;
    };

    const operatingCashFlow = pick('operatingCashFlow');
    const investingCashFlow = pick('investingCashFlow');
    const financingCashFlow = pick('financingCashFlow');
    const capexRaw = pick('capex');
    const capex = capexRaw === null ? null : Math.abs(capexRaw);
    const cashDividendsPaid = pick('cashDividendsPaid');

    // Canonical FCF: fail-closed unless both components exist.
    let freeCashFlow: number | null = null;
    if (operatingCashFlow === null) {
      reasons.freeCashFlow = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    } else if (capex === null) {
      reasons.freeCashFlow = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    } else {
      freeCashFlow = round(operatingCashFlow - capex, 2);
      if (freeCashFlow === null) reasons.freeCashFlow = 'VALUE_NON_FINITE';
    }

    return Object.freeze({
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      capex,
      cashDividendsPaid,
      freeCashFlow,
      presentation,
      reportType,
      period,
      reasons: Object.freeze({ ...reasons }),
      lineage: buildLineage(usedFacts, { engine: 'CashFlowEngine' }),
    });
  }
}
