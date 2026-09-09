/**
 * ENGINE 2 — GROWTH ENGINE
 * Analyzes revenue / profit / EPS / FCF growth (YoY + CAGR) and classifies
 * the quality of growth (STRONG / HEALTHY / MODERATE / WEAK / DECLINING).
 * Deterministic; every output is `number | null` when data is insufficient.
 */
import type { GrowthResult, GrowthClassification } from '../../../types/enterpriseIntelligence.ts';
import { AnnualFinancialFact, FinancialFactSet, latestFacts } from './financialFacts.ts';
import { pctChange, trailingCagr, round2 } from './helpers.ts';

export function freeCashFlowOf(fact: AnnualFinancialFact | null): number | null {
  if (!fact || fact.cfo === null) return null;
  if (fact.capex === null) return fact.cfo; // CapEx unavailable → CFO as FCF proxy (documented)
  return fact.cfo - fact.capex;
}

export function metricSeries(
  set: FinancialFactSet,
  getter: (f: AnnualFinancialFact) => number | null
): Array<{ year: number; value: number | null }> {
  return set.annals.map((f) => ({ year: f.year, value: getter(f) }));
}

export class GrowthEngine {
  static evaluate(set: FinancialFactSet): GrowthResult {
    const { current, previous } = latestFacts(set);
    if (!current) {
      return {
        score: null,
        revenueYoY: null,
        revenueCAGR3Y: null,
        revenueCAGR5Y: null,
        profitYoY: null,
        profitCAGR3Y: null,
        epsGrowth: null,
        fcfGrowth: null,
        growthAcceleration: null,
        classification: null,
      };
    }

    const revenueYoY = pctChange(current.revenue, previous?.revenue);
    const profitYoY = pctChange(current.netProfit, previous?.netProfit);
    const epsGrowth = pctChange(current.eps, previous?.eps);
    const fcfGrowth = pctChange(freeCashFlowOf(current), freeCashFlowOf(previous));

    const revenueSeries = metricSeries(set, (f) => f.revenue);
    const profitSeries = metricSeries(set, (f) => f.netProfit);
    const epsSeries = metricSeries(set, (f) => f.eps);
    const fcfSeries = metricSeries(set, (f) => freeCashFlowOf(f));

    const revenueCAGR3Y = trailingCagr(revenueSeries, 3);
    const revenueCAGR5Y = trailingCagr(revenueSeries, 5);
    const profitCAGR3Y = trailingCagr(profitSeries, 3);
    const epsCAGR3Y = trailingCagr(epsSeries, 3);

    // Growth acceleration: current YoY minus previous YoY (needs 3 facts).
    let growthAcceleration: number | null = null;
    const sorted = [...set.annals].sort((a, b) => a.year - b.year);
    if (sorted.length >= 3) {
      const secondLast = sorted[sorted.length - 2];
      const thirdLast = sorted[sorted.length - 3];
      const prevRevGrowth = pctChange(secondLast.revenue, thirdLast.revenue);
      if (revenueYoY !== null && prevRevGrowth !== null) {
        growthAcceleration = round2(revenueYoY - prevRevGrowth);
      }
    }

    const classification = this.classify(revenueYoY, profitYoY);

    const score = this.score(classification, revenueYoY, profitYoY, epsCAGR3Y);

    return {
      score,
      revenueYoY,
      revenueCAGR3Y,
      revenueCAGR5Y,
      profitYoY,
      profitCAGR3Y,
      epsGrowth,
      fcfGrowth,
      growthAcceleration,
      classification,
    };
  }

  static classify(revenueYoY: number | null, profitYoY: number | null): GrowthClassification | null {
    if (revenueYoY === null) return null;
    if (profitYoY === null) {
      if (revenueYoY >= 20) return 'STRONG';
      if (revenueYoY >= 10) return 'HEALTHY';
      if (revenueYoY >= 0) return 'MODERATE';
      if (revenueYoY <= -10) return 'DECLINING';
      return 'WEAK';
    }
    if (revenueYoY >= 20 && profitYoY >= 20) return 'STRONG';
    if (revenueYoY >= 10 && profitYoY >= 10) return 'HEALTHY';
    if (revenueYoY >= 0 && profitYoY >= 0) return 'MODERATE';
    if (revenueYoY < 0 && profitYoY < 0) {
      return revenueYoY <= -10 || profitYoY <= -10 ? 'DECLINING' : 'WEAK';
    }
    // Mixed directional growth (revenue up & profit down, or vice versa).
    return 'WEAK';
  }

  static score(
    classification: GrowthClassification | null,
    revenueYoY: number | null,
    profitYoY: number | null,
    epsCAGR3Y: number | null
  ): number | null {
    if (classification === null && revenueYoY === null && profitYoY === null) return null;
    const map: Record<GrowthClassification, number> = {
      STRONG: 95,
      HEALTHY: 80,
      MODERATE: 60,
      WEAK: 35,
      DECLINING: 15,
    };
    return map[classification ?? 'MODERATE'];
  }
}