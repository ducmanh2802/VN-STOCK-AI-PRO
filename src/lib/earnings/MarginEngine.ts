/**
 * PHASE 24 — MARGIN ENGINE
 * ========================
 * Deterministic margin computation from canonical normalized statements.
 * Extends (does not fork) the existing fundamental margin definitions:
 * margin = part / revenue * 100, with division-by-zero -> null (fail-closed).
 */

import type {
  CashFlowStatement,
  DataUnavailableReasonCode,
  IncomeStatement,
  MarginResult,
} from './types.ts';
import { buildLineage } from './lineage.ts';
import { percentOf } from './helpers.ts';

export class MarginEngine {
  public static normalize(income: IncomeStatement, cashFlow: CashFlowStatement): MarginResult {
    const revenue = income.revenue;
    const reasons: Record<string, DataUnavailableReasonCode> = {};

    const compute = (part: number | null, field: string): number | null => {
      if (revenue === null) {
        reasons[field] = income.reasons.revenue ?? 'REQUIRED_LINE_ITEM_NOT_FOUND';
        return null;
      }
      if (part === null) {
        reasons[field] = income.reasons[field] ?? 'REQUIRED_LINE_ITEM_NOT_FOUND';
        return null;
      }
      return percentOf(part, revenue);
    };

    const fcf = cashFlow.freeCashFlow;
    let fcfMargin: number | null = null;
    if (revenue === null) {
      reasons.fcfMargin = income.reasons.revenue ?? 'REQUIRED_LINE_ITEM_NOT_FOUND';
    } else if (fcf === null) {
      reasons.fcfMargin = cashFlow.reasons.freeCashFlow ?? 'REQUIRED_LINE_ITEM_NOT_FOUND';
    } else {
      fcfMargin = percentOf(fcf, revenue);
    }

    return Object.freeze({
      grossMargin: compute(income.grossProfit, 'grossMargin'),
      operatingMargin: compute(income.operatingProfit, 'operatingMargin'),
      ebitdaMargin: compute(income.ebitda, 'ebitdaMargin'),
      netMargin: compute(income.netProfit, 'netMargin'),
      fcfMargin,
      reasons: Object.freeze({ ...reasons }),
      lineage: buildLineage([], { engine: 'MarginEngine' }),
    });
  }
}
