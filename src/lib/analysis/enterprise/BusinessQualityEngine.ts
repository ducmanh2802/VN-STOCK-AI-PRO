/**
 * ENGINE 1 — BUSINESS QUALITY ENGINE
 *
 * Assesses the qualitative/structural quality of the underlying company.
 *
 * STRICT RULE: this engine NEVER invents qualitative information. Each
 * sub-score is only set when the orchestrator supplies real evidence (e.g. a
 * company profile, sector enrichment, or research data). When absent the value
 * is `null` and it is excluded from the composite. The composite is the average
 * of AVAILABLE sub-scores — it is never guessed.
 */
import type { BusinessQualityResult } from '../../../types/enterpriseIntelligence.ts';
import { FinancialFactSet, latestFacts } from './financialFacts.ts';
import { trailingCagr, round2 } from './helpers.ts';
import { metricSeries } from './GrowthEngine.ts';

export interface BusinessQualityQualitative {
  businessModelQuality?: number | null; // 0-100
  industryAttractiveness?: number | null; // 0-100
  competitiveAdvantage?: number | null; // 0-100
  revenueQuality?: number | null; // 0-100
  growthVisibility?: number | null; // 0-100
  customerConcentrationRisk?: number | null; // 0-100 (higher = worse)
}

export class BusinessQualityEngine {
  static evaluate(
    set: FinancialFactSet,
    qualitative?: BusinessQualityQualitative
  ): BusinessQualityResult {
    const risks: string[] = [];
    const { current } = latestFacts(set);

    let growthVisibility = qualitative?.growthVisibility;
    // If not provided qualitatively, derive a data-backed proxy from actual
    // revenue growth (only when the facts exist). This is a deterministic,
    // documented estimate — not invented.
    if (growthVisibility === null || growthVisibility === undefined) {
      const revSeries = metricSeries(set, (f) => f.revenue);
      const cagr5 = trailingCagr(revSeries, 5);
      const cagr3 = trailingCagr(revSeries, 3);
      const cagrUsed = cagr5 ?? cagr3;
      if (cagrUsed !== null) {
        growthVisibility = Math.min(100, Math.max(0, (cagrUsed + 5) * 4));
      }
    }

    if (qualitative?.customerConcentrationRisk !== null && qualitative?.customerConcentrationRisk !== undefined) {
      if (qualitative.customerConcentrationRisk! >= 60) {
        risks.push('Elevated customer/concentration risk (per provided research data).');
      }
    }

    const subs: Array<number | null> = [];
    const push = (v: number | null | undefined) => {
      if (v !== null && v !== undefined) subs.push(v);
    };
    push(qualitative?.businessModelQuality);
    push(qualitative?.industryAttractiveness);
    push(qualitative?.competitiveAdvantage);
    push(qualitative?.revenueQuality);
    push(growthVisibility);

    let score: number | null = null;
    if (subs.length > 0) {
      score = round2(subs.reduce((a, b) => a + b, 0) / subs.length);
    }

    return {
      score,
      businessModelQuality: qualitative?.businessModelQuality ?? null,
      industryAttractiveness: qualitative?.industryAttractiveness ?? null,
      competitiveAdvantage: qualitative?.competitiveAdvantage ?? null,
      revenueQuality: qualitative?.revenueQuality ?? null,
      growthVisibility,
      risks,
    };
  }
}

/** Helper: map a raw growth % (0..25+) to a 0-100 growth-visibility proxy. */
export function growthVisibilityFromGrowth(growthPct: number | null): number | null {
  if (growthPct === null) return null;
  return Math.min(100, Math.max(0, (growthPct + 5) * 4));
}