/**
 * SECTION 5 — ENTERPRISE SCORE (deterministic, 100-point scale)
 *
 * Weights:
 *   Business Quality 15 | Growth 15 | Profitability 15 | Financial Health 15 |
 *   Earnings Quality 10 | Valuation 15 | Competitive 5 | Market/Technical 5 |
 *   Risk Adjustment 5
 *
 * The risk adjustment converts a risk LEVEL into a 0-100 score so it can be
 * weighted like the rest: LOW=100(+5), MEDIUM=60(+3), HIGH=20(+1), CRITICAL=0(+0).
 * Available weights are re-normalized to sum to 100 so the total stays 0-100.
 * If fewer than half of the total weight is available, the result is flagged
 * PROVISIONAL (never presented as a hard score).
 */
import type { EnterpriseScoreResult, ScoreClassification, RiskLevel } from '../../../types/enterpriseIntelligence.ts';
import { round2 } from './helpers.ts';

export interface EnterpriseScoreInput {
  businessQuality: number | null;
  growth: number | null;
  profitability: number | null;
  financialHealth: number | null;
  earningsQuality: number | null;
  valuation: number | null;
  competitive: number | null;
  marketTechnical: number | null;
  riskLevel: RiskLevel | null;
}

const RISK_LEVEL_SCORE: Record<RiskLevel, number> = {
  LOW: 100,
  MEDIUM: 60,
  HIGH: 20,
  CRITICAL: 0,
};

export class EnterpriseScoreEngine {
  static readonly WEIGHTS = {
    businessQuality: 15,
    growth: 15,
    profitability: 15,
    financialHealth: 15,
    earningsQuality: 10,
    valuation: 15,
    competitive: 5,
    marketTechnical: 5,
    riskAdjustment: 5,
  };

  static evaluate(input: EnterpriseScoreInput): EnterpriseScoreResult {
    const cats: Array<{ key: string; label: string; score: number | null; weight: number }> = [
      { key: 'businessQuality', label: 'Business Quality', score: input.businessQuality, weight: this.WEIGHTS.businessQuality },
      { key: 'growth', label: 'Growth', score: input.growth, weight: this.WEIGHTS.growth },
      { key: 'profitability', label: 'Profitability', score: input.profitability, weight: this.WEIGHTS.profitability },
      { key: 'financialHealth', label: 'Financial Health', score: input.financialHealth, weight: this.WEIGHTS.financialHealth },
      { key: 'earningsQuality', label: 'Earnings Quality', score: input.earningsQuality, weight: this.WEIGHTS.earningsQuality },
      { key: 'valuation', label: 'Valuation', score: input.valuation, weight: this.WEIGHTS.valuation },
      { key: 'competitive', label: 'Competitive', score: input.competitive, weight: this.WEIGHTS.competitive },
      { key: 'marketTechnical', label: 'Market/Technical', score: input.marketTechnical, weight: this.WEIGHTS.marketTechnical },
    ];

    const riskScore = input.riskLevel !== null ? RISK_LEVEL_SCORE[input.riskLevel] : null;
    const riskWeight = this.WEIGHTS.riskAdjustment;

    const available = cats.filter((c) => c.score !== null);
    const sumAvailableWeights = available.reduce((a, c) => a + c.weight, 0) + (riskScore !== null ? riskWeight : 0);

    let total: number | null = null;
    const isProvisional = sumAvailableWeights < 50;

    let weightedSum = 0;
    for (const c of cats) {
      if (c.score === null) continue;
      weightedSum += c.score! * ((c.weight / sumAvailableWeights));
    }
    if (riskScore !== null) {
      weightedSum += riskScore * (riskWeight / sumAvailableWeights);
    }
    if (sumAvailableWeights > 0) {
      total = round2(weightedSum);
    }

    const breakdown: EnterpriseScoreResult['breakdown'] = {
      businessQuality: pointsFor('businessQuality', cats),
      growth: pointsFor('growth', cats),
      profitability: pointsFor('profitability', cats),
      financialHealth: pointsFor('financialHealth', cats),
      earningsQuality: pointsFor('earningsQuality', cats),
      valuation: pointsFor('valuation', cats),
      competitive: pointsFor('competitive', cats),
      marketTechnical: pointsFor('marketTechnical', cats),
      riskAdjustment: riskScore !== null ? round2(riskScore * (riskWeight / 100)) : 0,
    };

    const cv = clampScore(total);
    return {
      total: total === null ? null : round2(total),
      classification: cv === null ? null : this.classify(cv),
      confidence: null,
      dataCompleteness: null,
      isProvisional,
      breakdown,
      availableMetrics: available.map((c) => c.label),
      missingMetrics: cats.filter((c) => c.score === null).map((c) => c.label),
    };
  }

  static classify(score: number): ScoreClassification {
    if (score >= 90) return 'EXCEPTIONAL';
    if (score >= 80) return 'STRONG';
    if (score >= 70) return 'GOOD';
    if (score >= 60) return 'NEUTRAL';
    if (score >= 50) return 'WEAK';
    return 'RISKY';
  }
}

function pointsFor(key: string, cats: Array<{ key: string; score: number | null; weight: number }>): number {
  const c = cats.find((x) => x.key === key);
  if (!c || c.score === null) return 0;
  return round2(c.score! * (c.weight / 100));
}

function clampScore(v: number | null): number | null {
  if (v === null) return null;
  return Math.min(100, Math.max(0, v));
}