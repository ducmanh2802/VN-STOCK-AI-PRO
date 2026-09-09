/**
 * SECTION 34 — ALERT ENGINE
 * Deterministic alerts generated from the engine results. No fabricated
 * thresholds: each threshold is derived from documented model defaults, the
 * company's own history, or an explicit configured value.
 */
import type { EnterpriseAlert } from '../../../types/enterpriseIntelligence.ts';
import type { GrowthResult, ProfitabilityResult, FinancialHealthResult, EarningsQualityResult, ValuationIntelligenceResult, PiotroskiResult, ScenarioSetResult } from '../../../types/enterpriseIntelligence.ts';
import { EnterpriseConfig } from './financialFacts.ts';

export interface AlertInput {
  growth: GrowthResult;
  profitability: ProfitabilityResult;
  financialHealth: FinancialHealthResult;
  earningsQuality: EarningsQualityResult;
  valuation: ValuationIntelligenceResult;
  piotroski: PiotroskiResult;
  scenarios: ScenarioSetResult;
  config: EnterpriseConfig;
}

export class AlertEngine {
  static evaluate(i: AlertInput): EnterpriseAlert[] {
    const alerts: EnterpriseAlert[] = [];

    if (i.earningsQuality.cashConversion !== null && i.earningsQuality.cashConversion! < i.config.cashConversionHigh) {
      alerts.push({
        id: 'PROFIT_CASH_DIVERGENCE',
        severity: i.earningsQuality.cashConversion! < i.config.cashConversionPartial ? 'CRITICAL' : 'WARNING',
        metric: 'cashConversion',
        value: i.earningsQuality.cashConversion,
        threshold: i.config.cashConversionHigh,
        reason: 'Reported profit not fully supported by operating cash flow.',
      });
    }
    if (i.earningsQuality.fcf !== null && i.earningsQuality.fcf! < 0) {
      alerts.push({ id: 'FCF_NEGATIVE', severity: 'CRITICAL', metric: 'fcf', value: i.earningsQuality.fcf, threshold: 0, reason: 'Free cash flow is negative.' });
    }
    if (i.profitability.trends.marginChange !== null && i.profitability.trends.marginChange! < 0) {
      alerts.push({ id: 'MARGIN_COMPRESSION', severity: 'WARNING', metric: 'marginChange', value: i.profitability.trends.marginChange, threshold: 0, reason: 'Margins compressed vs prior period.' });
    }
    if (i.financialHealth.debtGrowth !== null && i.financialHealth.debtGrowth! > 15) {
      alerts.push({ id: 'DEBT_INCREASE', severity: 'WARNING', metric: 'debtGrowth', value: i.financialHealth.debtGrowth, threshold: 15, reason: 'Debt grew faster than a 15% documented threshold.' });
    }
    if (i.profitability.trends.roeTrend !== null && i.profitability.trends.roeTrend! < 0) {
      alerts.push({ id: 'ROE_DECLINE', severity: 'INFO', metric: 'roeTrend', value: i.profitability.trends.roeTrend, threshold: 0, reason: 'ROE declined vs prior period.' });
    }
    if (i.profitability.roic !== null && i.profitability.roic! < i.config.wacc * 100) {
      alerts.push({ id: 'ROIC_BELOW_WACC', severity: 'CRITICAL', metric: 'roic', value: i.profitability.roic, threshold: i.config.wacc * 100, reason: `ROIC below estimated WACC of ${(i.config.wacc * 100).toFixed(1)}%.` });
    }
    if (i.valuation.peerPEPremiumDiscount !== null && i.valuation.peerPEPremiumDiscount! > 30) {
      alerts.push({ id: 'VALUATION_PREMIUM', severity: 'WARNING', metric: 'peerPEPremium', value: i.valuation.peerPEPremiumDiscount, threshold: 30, reason: 'Trading at a large P/E premium to peers.' });
    }
    if (i.valuation.peerPEPremiumDiscount !== null && i.valuation.peerPEPremiumDiscount! < -30) {
      alerts.push({ id: 'VALUATION_DISCOUNT', severity: 'INFO', metric: 'peerPEPremium', value: i.valuation.peerPEPremiumDiscount, threshold: -30, reason: 'Trading at a meaningful P/E discount to peers.' });
    }
    if (i.earningsQuality.receivablesGrowth !== null && i.earningsQuality.receivablesGrowth! > 15) {
      alerts.push({ id: 'RECEIVABLES_WARNING', severity: 'WARNING', metric: 'receivablesGrowth', value: i.earningsQuality.receivablesGrowth, threshold: 15, reason: 'Receivables growing quickly.' });
    }
    if (i.earningsQuality.inventoryGrowth !== null && i.earningsQuality.inventoryGrowth! > 15) {
      alerts.push({ id: 'INVENTORY_WARNING', severity: 'WARNING', metric: 'inventoryGrowth', value: i.earningsQuality.inventoryGrowth, threshold: 15, reason: 'Inventory building up.' });
    }
    if (i.piotroski.total !== null && i.piotroski.maxAvailable > 0) {
      if (i.piotroski.total! <= 2) alerts.push({ id: 'PIOTROSKI_WEAK', severity: 'WARNING', metric: 'piotroski', value: i.piotroski.total, threshold: 3, reason: 'Piotroski F-Score is weak.' });
      if (i.piotroski.total! >= 7) alerts.push({ id: 'PIOTROSKI_STRONG', severity: 'INFO', metric: 'piotroski', value: i.piotroski.total, threshold: 7, reason: 'Piotroski F-Score is strong.' });
    }

    return alerts;
  }
}