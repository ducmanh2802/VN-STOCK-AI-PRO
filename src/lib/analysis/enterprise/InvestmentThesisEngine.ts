/**
 * SECTION 9/10 — INVESTMENT THESIS ENGINE
 * Generates a structured thesis + mandatory invalidation conditions from the
 * deterministic engine results. All statements are drawn from the supplied
 * evidence; nothing is invented.
 */
import type {
  InvestmentThesisResult,
  InvestmentView,
  GrowthResult,
  ProfitabilityResult,
  FinancialHealthResult,
  EarningsQualityResult,
  ValuationIntelligenceResult,
  CompetitiveResult,
  RiskCatalystResult,
  ScenarioSetResult,
  BusinessQualityResult,
  PiotroskiResult,
} from '../../../types/enterpriseIntelligence.ts';

export interface ThesisInput {
  symbol: string;
  sector: string | null;
  businessQuality: BusinessQualityResult;
  growth: GrowthResult;
  profitability: ProfitabilityResult;
  financialHealth: FinancialHealthResult;
  earningsQuality: EarningsQualityResult;
  piotroski: PiotroskiResult;
  valuation: ValuationIntelligenceResult;
  competitive: CompetitiveResult;
  risk: RiskCatalystResult;
  scenarios: ScenarioSetResult;
  enterpriseScore: number | null;
  isProvisional: boolean;
  dataCompleteness: number;
}

export class InvestmentThesisEngine {
  static evaluate(i: ThesisInput): InvestmentThesisResult {
    const strengths = this.strengths(i);
    const risks = this.risks(i);
    const catalysts = i.risk.catalysts.length > 0 ? i.risk.catalysts : strengths.slice(0, 3);
    const invalidationConditions = this.invalidations(i);
    const watchItems = this.watchItems(i);

    return {
      conclusion: this.conclusion(i),
      strengths,
      risks,
      catalysts,
      bullCase: this.textBull(i),
      baseCase: this.textBase(i),
      bearCase: this.textBear(i),
      invalidationConditions,
      watchItems,
    };
  }

  static strengths(i: ThesisInput): string[] {
    const s: Array<string | null> = [];
    const p = i.profitability;
    if (p.roe !== null) s.push(p.roe > 15 ? `ROE of ${f(p.roe)}% indicates strong capital efficiency.` : p.roe > 8 ? `ROE of ${f(p.roe)}% is moderate.` : null);
    if (i.growth.revenueYoY !== null && i.growth.revenueYoY > 0) s.push(`Revenue grew ${f(i.growth.revenueYoY)}% YoY.`);
    if (p.netMargin !== null && p.netMargin >= 10) s.push(`Net margin of ${f(p.netMargin)}% is healthy.`);
    if (i.earningsQuality.cashConversion !== null && i.earningsQuality.cashConversion >= 1) s.push('Reported profit is fully supported by operating cash flow.');
    if (i.piotroski.total !== null && i.piotroski.total! >= 7) s.push(`Piotroski F-Score ${i.piotroski.total}/${i.piotroski.maxAvailable} is strong.`);
    if (i.valuation.marginOfSafety !== null && i.valuation.marginOfSafety! > 0) s.push(`Trades below estimated fair value (margin of safety ${f(i.valuation.marginOfSafety!)}%).`);
    if (i.competitive.rank !== null && i.competitive.peerCount > 0 && i.competitive.rank! <= 2) s.push(`Ranked ${i.competitive.rank}/${i.competitive.peerCount} vs peers on available metrics.`);
    return s.filter((x): x is string => x !== null).slice(0, 5);
  }

  static risks(i: ThesisInput): string[] {
    const r: string[] = [];
    if (i.financialHealth.riskLevel !== null && i.financialHealth.riskLevel !== 'LOW') r.push(`Financial health risk assessed ${i.financialHealth.riskLevel}.`);
    if (i.earningsQuality.warnings.length > 0) r.push(i.earningsQuality.warnings[0]);
    if (i.valuation.peerPEPremiumDiscount !== null && i.valuation.peerPEPremiumDiscount! > 20) r.push(`Valuation premium vs peers: P/E ${f(i.valuation.peerPEPremiumDiscount!)}% above peer reference.`);
    if (i.risk.score !== null && i.risk.score! >= 50) r.push(`Overall risk score ${f(i.risk.score!)}/100.`);
    if (r.length === 0 && i.sector) r.push(`Sector exposure: ${i.sector}.`);
    return r.slice(0, 5);
  }

  static invalidations(i: ThesisInput): string[] {
    const out: string[] = [];
    if (i.growth.revenueYoY !== null) out.push(`Investment thesis invalidated if revenue growth falls below ${f(i.growth.revenueYoY! * 0.4)}% (declining momentum).`);
    if (i.profitability.netMargin !== null) out.push(`Invalid if net margin compresses below ${f(i.profitability.netMargin! * 0.6)}%.`);
    if (i.earningsQuality.cashConversion !== null && i.earningsQuality.cashConversion! < 1) out.push('Invalid if CFO remains persistently below Net Income.');
    if (i.valuation.historicalPEPercentile !== null) {
      const cap = Math.min(100, (i.valuation.historicalPEPercentile ?? 50) + 20);
      out.push(`Invalid if P/E exceeds about the ${f(cap)}th historical percentile without earnings growth.`);
    }
    if (i.scenarios.bear.fairValue !== null) out.push(`Invalid if price suffers more than ${i.scenarios.bear.upside !== null ? f(Math.max(0, -i.scenarios.bear.upside!)) : 'n/a'}% downside vs the bear case.`);
    return out.slice(0, 5);
  }

  static watchItems(i: ThesisInput): string[] {
    const out: string[] = [];
    if (i.earningsQuality.receivablesGrowth !== null && i.earningsQuality.receivablesGrowth! > 10) out.push('Monitor receivables growth vs revenue.');
    if (i.earningsQuality.inventoryGrowth !== null && i.earningsQuality.inventoryGrowth! > 10) out.push('Monitor inventory growth vs revenue.');
    if (i.profitability.roic !== null) out.push(`Track ROIC (${f(i.profitability.roic!)}%) against the estimated cost of capital.`);
    if (i.financialHealth.debtGrowth !== null && i.financialHealth.debtGrowth! > 10) out.push('Watch debt growth trajectory.');
    if (i.valuation.dcfFairValue !== null) out.push('Reconcile DCF fair value against the weighted estimate.');
    return out.slice(0, 4);
  }

  static textBull(i: ThesisInput): string {
    const s = i.scenarios.bull;
    return `Bull: fair value ${g(s.fairValue)} at ${f(s.multiple)}x multiple, ${f(s.growth)}% growth, ${s.upside !== null ? f(s.upside) + '% upside' : 'upside n/a'} (${f(s.probability * 100)}% probability).`;
  }
  static textBase(i: ThesisInput): string {
    const s = i.scenarios.base;
    return `Base: fair value ${g(s.fairValue)} at ${f(s.multiple)}x, ${f(s.growth)}% growth (${f(s.probability * 100)}% probability).`;
  }
  static textBear(i: ThesisInput): string {
    const s = i.scenarios.bear;
    return `Bear: fair value ${g(s.fairValue)} at ${f(s.multiple)}x, ${f(s.growth)}% growth, ${s.upside !== null ? f(s.upside) + '% downside' : 'downside n/a'} (${f(s.probability * 100)}% probability).`;
  }

  static conclusion(i: ThesisInput): InvestmentView | null {
    if (i.enterpriseScore === null) return null;
    if (i.isProvisional) return 'NEUTRAL';
    const s = i.enterpriseScore;
    if (s >= 80) return 'VERY_POSITIVE';
    if (s >= 70) return 'POSITIVE';
    if (s >= 60) return 'NEUTRAL';
    if (s >= 50) return 'CAUTIOUS';
    return 'NEGATIVE';
  }
}

function f(v: number): string {
  return v !== null && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '--';
}
function g(v: number | null): string {
  return v === null ? 'n/a' : `VND ${Math.round(v).toLocaleString()}`;
}