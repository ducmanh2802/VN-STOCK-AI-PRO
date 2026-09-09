/**
 * ENGINE 5 — EARNINGS QUALITY + CASH FLOW ENGINE
 * Determines whether accounting profit is supported by real cash (CFO vs NI,
 * FCF, accrual ratio, receivables/inventory pace). Produces RISE signals, not
 * fraud accusations — language always says "earnings quality requires attention".
 * Deterministic.
 */
import type { EarningsQualityResult, EarningsQualityClassification } from '../../../types/enterpriseIntelligence.ts';
import { FinancialFactSet, latestFacts } from './financialFacts.ts';
import { freeCashFlowOf } from './GrowthEngine.ts';
import { pctOf } from './profitabilityUtils.ts';
import { n, pctChange, round2, averageOf } from './helpers.ts';
import type { EnterpriseConfig } from './financialFacts.ts';

export class EarningsQualityEngine {
  static evaluate(set: FinancialFactSet, config: EnterpriseConfig): EarningsQualityResult {
    const { current, previous } = latestFacts(set);
    const warnings: string[] = [];

    if (!current) {
      return {
        score: null,
        cfo: null,
        fcf: null,
        cfoMargin: null,
        fcfMargin: null,
        cashConversion: null,
        accrualRatio: null,
        receivablesGrowth: null,
        inventoryGrowth: null,
        qualityClassification: null,
        warnings: ['Không có dữ liya dòng tiền/earnings.'],
      };
    }

    const cfo = n(current.cfo);
    const netIncome = n(current.netProfit);
    const fcf = freeCashFlowOf(current);

    const cfoMargin = pctOf(cfo, current.revenue);
    const fcfMargin = pctOf(fcf, current.revenue);

    let cashConversion: number | null = null;
    if (cfo !== null && netIncome !== null && netIncome > 0) {
      cashConversion = round2(cfo / netIncome);
    }

    let accrualRatio: number | null = null;
    if (netIncome !== null && cfo !== null) {
      const avgAssets = averageOf([current.totalAssets, previous?.totalAssets]);
      if (avgAssets !== null && avgAssets !== 0) {
        accrualRatio = round2((netIncome - cfo) / avgAssets);
      }
    }

    const receivablesGrowth = pctChange(current.receivables, previous?.receivables);
    const inventoryGrowth = pctChange(current.inventory, previous?.inventory);

    // Accounting-quality warnings (risk signals, not fraud accusations).
    const prevProfit = previous?.netProfit;
    const prevCfo = previous?.cfo;
    if (netIncome !== null && prevProfit !== null && netIncome > prevProfit && cfo !== null && prevCfo !== null && cfo < prevCfo) {
      warnings.push('Profit increased while CFO declined — earnings quality requires attention.');
    }
    if (netIncome !== null && prevProfit !== null && netIncome > prevProfit && fcf !== null && previous !== null) {
      const prevFcf = freeCashFlowOf(previous);
      if (prevFcf !== null && fcf < prevFcf) {
        warnings.push('Profit increased while FCF declined — earnings quality requires attention.');
      }
    }
    if (cfo !== null && netIncome !== null && netIncome > 0 && cfo < 0) {
      warnings.push('CFO is negative while net income is positive — accounting profit is not supported by operating cash flow.');
    }
    if (cfo !== null && netIncome !== null && netIncome > 0 && cfo / netIncome < config.cashConversionPartial) {
      warnings.push('CFO persistently below Net Income — low cash conversion.');
    }
    if (receivablesGrowth !== null && current.revenue !== null && previous?.revenue !== null) {
      const revGrowth = pctChange(current.revenue, previous.revenue);
      if (receivablesGrowth > 0 && revGrowth !== null && receivablesGrowth > revGrowth + 20) {
        warnings.push('Receivables growing faster than revenue — possible quality risk.');
      }
    }
    if (inventoryGrowth !== null && current.revenue !== null && previous?.revenue !== null) {
      const revGrowth = pctChange(current.revenue, previous.revenue);
      if (inventoryGrowth > 0 && revGrowth !== null && inventoryGrowth > revGrowth + 20) {
        warnings.push('Inventory growing faster than revenue — possible quality risk.');
      }
    }

    const classification = this.classifyCashConversion(cashConversion, config);

    // Score: weighted components.
    const subs: number[] = [];
    if (cashConversion !== null) {
      subs.push(Math.min(100, Math.max(0, cashConversion * 100)));
    }
    if (fcf !== null) {
      if (fcf > 0) subs.push(fcfMargin !== null && fcfMargin !== 0 ? (40 + Math.min(60, fcfMargin * 10)) : 55);
      else subs.push(15);
    }
    if (accrualRatio !== null) {
      subs.push(Math.min(100, Math.max(0, 60 - Math.abs(accrualRatio) * 600)));
    }
    let score: number | null = null;
    const nonNull = subs.filter((v) => v !== null);
    if (nonNull.length >= 2) score = round2(nonNull.reduce((a, b) => a + b, 0) / nonNull.length);
    if (score !== null && warnings.length > 0) score = round2(score * 0.9);

    return {
      score,
      cfo,
      fcf,
      cfoMargin,
      fcfMargin,
      cashConversion,
      accrualRatio,
      receivablesGrowth,
      inventoryGrowth,
      qualityClassification: classification,
      warnings,
    };
  }

  static classifyCashConversion(
    cashConversion: number | null,
    config: EnterpriseConfig
  ): EarningsQualityClassification | null {
    if (cashConversion === null) return null;
    if (cashConversion >= config.cashConversionHigh) return 'PROFIT_SUPPORTED_BY_CASH';
    if (cashConversion >= config.cashConversionPartial) return 'PROFIT_PARTIALLY_SUPPORTED';
    return 'LOW_CASH_CONVERSION';
  }
}