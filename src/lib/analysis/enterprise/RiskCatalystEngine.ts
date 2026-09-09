/**
 * ENGINE 9 — RISK + CATALYST ENGINE
 * Produces a risk score (0=lowest .. 100=highest) per category and a risk level
 * (LOW/MEDIUM/HIGH/CRITICAL). Only categories backed by real data are scored;
 * otherwise `null`. Catalysts are emitted ONLY when supported by real data.
 */
import type { RiskCatalystResult, RiskLevel, ConfidenceLevel } from '../../../types/enterpriseIntelligence.ts';
import { round2, clamp } from './helpers.ts';

export interface RiskInput {
  revenueGrowth: number | null;
  revenueCAGR3Y: number | null;
  netMargin: number | null;
  roe: number | null;
  roeTrend: number | null;
  marginChange: number | null;
  cashConversion: number | null;
  fcf: number | null;
  fcfMargin: number | null;
  debtToEquity: number | null;
  netDebtToEBITDA: number | null;
  quickRatio: number | null;
  interestCoverage: number | null;
  pePercentile: number | null;
  marginOfSafety: number | null;
  peerPremium: number | null;
  /** Optional qualitative business/industry risk scores supplied with evidence. */
  businessRisk?: number | null;
  industryRisk?: number | null;
  dataDate: string | null;
}

export class RiskCatalystEngine {
  static evaluate(input: RiskInput): RiskCatalystResult {
    const financial = this.financialRisk(input);
    const valuation = this.valuationRisk(input);
    const earnings = this.earningsRisk(input);
    const cashFlow = this.cashFlowRisk(input);
    const market = this.marketRisk(input);
    const business = clamp01(input.businessRisk);
    const industry = clamp01(input.industryRisk);

    const risks: RiskCatalystResult['risks'] = [];
    pushRisk(risks, 'business', business, 'Business risk', input.dataDate);
    pushRisk(risks, 'industry', industry, 'Industry risk', input.dataDate);
    pushRisk(risks, 'financial', financial, 'Financial risk', input.dataDate);
    pushRisk(risks, 'valuation', valuation, 'Valuation risk', input.dataDate);
    pushRisk(risks, 'earnings', earnings, 'Earnings risk', input.dataDate);
    pushRisk(risks, 'cashFlow', cashFlow, 'Cash-flow risk', input.dataDate);
    pushRisk(risks, 'market', market, 'Market risk', input.dataDate);

    const scored = [financial, valuation, earnings, cashFlow, market, business, industry].filter((v): v is number => v !== null);
    const overallScore = scored.length > 0 ? round2(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
    const overall = overallScore === null ? null : levelOf(overallScore);

    const catalysts = this.catalysts(input);

    return {
      overall,
      score: overallScore,
      business,
      industry,
      financial,
      valuation,
      earnings,
      cashFlow,
      market,
      catalysts,
      risks,
    };
  }

  static financialRisk(i: RiskInput): number | null {
    const subs: number[] = [];
    if (i.debtToEquity !== null) subs.push(clamp((i.debtToEquity - 0.5) * 40, 0, 100));
    if (i.netDebtToEBITDA !== null) subs.push(clamp((i.netDebtToEBITDA - 1) * 25, 0, 100));
    if (i.quickRatio !== null) subs.push(clamp((1.5 - i.quickRatio) * 80, 0, 100));
    if (i.interestCoverage !== null) subs.push(clamp((3 - i.interestCoverage) * 40, 0, 100));
    if (subs.length === 0) return null;
    return round2(subs.reduce((a, b) => a + b, 0) / subs.length);
  }

  static valuationRisk(i: RiskInput): number | null {
    const subs: number[] = [];
    if (i.pePercentile !== null) subs.push(i.pePercentile);
    if (i.marginOfSafety !== null) subs.push(clamp(50 - i.marginOfSafety, 0, 100));
    if (i.peerPremium !== null) subs.push(clamp(i.peerPremium + 30, 0, 100));
    if (subs.length === 0) return null;
    return round2(subs.reduce((a, b) => a + b, 0) / subs.length);
  }

  static earningsRisk(i: RiskInput): number | null {
    if (i.cashConversion === null) return null;
    return round2(clamp((i.cashConversion < 1 ? (1 - i.cashConversion) : 0) * 120, 0, 100));
  }

  static cashFlowRisk(i: RiskInput): number | null {
    if (i.fcf === null) return null;
    if (i.fcf < 0) return 85;
    return round2(clamp((2 - (i.fcfMargin ?? 0)) * 20, 0, 60));
  }

  static marketRisk(i: RiskInput): number | null {
    if (i.revenueGrowth === null) return null;
    return round2(clamp(40 - i.revenueGrowth * 0.8, 0, 100));
  }

  static catalysts(i: RiskInput): string[] {
    const out: string[] = [];
    if (i.revenueGrowth !== null && i.revenueGrowth > 0) out.push('Revenue growth (earnings driver).');
    if (i.marginChange !== null && i.marginChange > 0) out.push('Margin expansion.');
    if (i.roeTrend !== null && i.roeTrend > 0) out.push('Improving ROE.');
    if (i.fcfMargin !== null && (i.fcfMargin ?? 0) > 15) out.push('Strong cash-flow generation.');
    if (i.peerPremium !== null && i.peerPremium < 0) out.push('Valuation re-rating upside (trades at a discount to peers).');
    return out;
  }
}

function clamp01(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : clamp01Num(v);
}
function clamp01Num(v: number): number {
  return clamp(v, 0, 100);
}

function levelOf(score: number): RiskLevel {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function pushRisk(
  risks: RiskCatalystResult['risks'],
  category: string,
  score: number | null,
  reason: string,
  dataDate: string | null
) {
  if (score === null) return;
  const confidence: ConfidenceLevel = score === null ? 'LOW' : 'MEDIUM';
  risks.push({
    category,
    score,
    level: levelOf(score),
    reason,
    evidence: score === null ? null : `${category} risk scored from real financial data.`,
    dataDate,
    confidence,
  });
}