/**
 * PHASE 24 — EARNINGS QUALITY ENGINE
 * ==================================
 * Deterministic earnings-quality signals derived from canonical statements.
 * Extends the existing enterprise earnings-quality concept with quarterly /
 * restatement awareness, without inventing values. Missing inputs yield `null`
 * (never a fabricated "healthy" classification).
 */

import type {
  BalanceSheet,
  CashFlowStatement,
  DataUnavailableReasonCode,
  EarningsQualityClassification,
  EarningsQualityResult,
  IncomeStatement,
} from './types.ts';
import { buildLineage } from './lineage.ts';
import { finite, pctChange, round, safeDivide } from './helpers.ts';

export interface EarningsQualityInput {
  readonly income: IncomeStatement;
  readonly cashFlow: CashFlowStatement;
  readonly balanceSheet: BalanceSheet;
  readonly previousBalanceSheet?: BalanceSheet | null;
  readonly previousIncome?: IncomeStatement | null;
  readonly adjustedForRestatement?: boolean;
}

export class EarningsQualityEngine {
  public static evaluate(input: EarningsQualityInput): EarningsQualityResult {
    const { income, cashFlow, balanceSheet } = input;
    const reasons: Record<string, DataUnavailableReasonCode> = {};
    const warnings: string[] = [];

    const cfo = cashFlow.operatingCashFlow;
    const netIncome = income.netProfit;
    const fcf = cashFlow.freeCashFlow;

    let cashConversion: number | null = null;
    if (cfo !== null && netIncome !== null && netIncome > 0) {
      cashConversion = round(safeDivide(cfo, netIncome), 2);
      if (cashConversion === null) reasons.cashConversion = 'VALUE_NON_FINITE';
    } else {
      reasons.cashConversion = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    }

    let fcfQuality: number | null = null;
    if (fcf !== null && netIncome !== null && netIncome !== 0) {
      fcfQuality = round(safeDivide(fcf, netIncome), 2);
      if (fcfQuality === null) reasons.fcfQuality = 'VALUE_NON_FINITE';
    } else {
      reasons.fcfQuality = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    }

    let accrualRatio: number | null = null;
    const prevAssets = input.previousBalanceSheet?.totalAssets ?? null;
    const avgAssets =
      balanceSheet.totalAssets !== null && prevAssets !== null
        ? (balanceSheet.totalAssets + prevAssets) / 2
        : balanceSheet.totalAssets;
    if (netIncome !== null && cfo !== null && avgAssets !== null && avgAssets !== 0) {
      accrualRatio = round((netIncome - cfo) / avgAssets, 4);
      if (accrualRatio === null) reasons.accrualRatio = 'VALUE_NON_FINITE';
    } else {
      reasons.accrualRatio = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    }

    const receivablesGrowth = pctChange(balanceSheet.receivables, input.previousBalanceSheet?.receivables ?? null);
    if (receivablesGrowth === null) reasons.receivablesGrowth = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    const inventoryGrowth = pctChange(balanceSheet.inventory, input.previousBalanceSheet?.inventory ?? null);
    if (inventoryGrowth === null) reasons.inventoryGrowth = 'REQUIRED_LINE_ITEM_NOT_FOUND';

    // One-off / non-operating intensity
    const nonOpNet =
      income.nonOperatingIncome !== null || income.nonOperatingExpense !== null
        ? (income.nonOperatingIncome ?? 0) - (income.nonOperatingExpense ?? 0)
        : null;
    const nonOperatingIntensity =
      nonOpNet !== null && income.revenue !== null && income.revenue !== 0
        ? round((nonOpNet / income.revenue) * 100, 2)
        : null;
    if (nonOperatingIntensity === null) reasons.nonOperatingIntensity = 'REQUIRED_LINE_ITEM_NOT_FOUND';

    const oneOffRatio =
      income.nonOperatingIncome !== null && income.pretaxProfit !== null && income.pretaxProfit !== 0
        ? round(safeDivide(income.nonOperatingIncome, income.pretaxProfit), 2)
        : null;
    if (oneOffRatio === null) reasons.oneOffRatio = 'REQUIRED_LINE_ITEM_NOT_FOUND';

    // Accounting-quality warnings (risk signals, never fraud accusations).
    const prevNet = input.previousIncome?.netProfit ?? null;
    if (netIncome !== null && prevNet !== null && netIncome > prevNet && cfo !== null && cfo < 0) {
      warnings.push('CFO is negative while net income is positive — profit is not supported by operating cash flow.');
    }
    if (receivablesGrowth !== null && input.previousIncome?.revenue != null && income.revenue !== null) {
      const revGrowth = pctChange(income.revenue, input.previousIncome.revenue);
      if (revGrowth !== null && receivablesGrowth > revGrowth + 20) {
        warnings.push('Receivables growing materially faster than revenue — quality risk.');
      }
    }
    if (inventoryGrowth !== null && input.previousIncome?.revenue != null && income.revenue !== null) {
      const revGrowth = pctChange(income.revenue, input.previousIncome.revenue);
      if (revGrowth !== null && inventoryGrowth > revGrowth + 20) {
        warnings.push('Inventory growing materially faster than revenue — quality risk.');
      }
    }

    const classification = this.classify(cashConversion);

    return Object.freeze({
      cashConversion,
      accrualRatio,
      receivablesGrowth,
      inventoryGrowth,
      oneOffRatio,
      nonOperatingIntensity,
      fcfQuality,
      classification,
      adjustedForRestatement: input.adjustedForRestatement === true,
      warnings: Object.freeze([...warnings]),
      reasons: Object.freeze({ ...reasons }),
      lineage: buildLineage([], { engine: 'EarningsQualityEngine' }),
    });
  }

  public static classify(cashConversion: number | null): EarningsQualityClassification {
    const cc = finite(cashConversion);
    if (cc === null) return 'INDETERMINATE';
    if (cc >= 1.0) return 'PROFIT_SUPPORTED_BY_CASH';
    if (cc >= 0.7) return 'PROFIT_PARTIALLY_SUPPORTED';
    return 'LOW_CASH_CONVERSION';
  }
}
