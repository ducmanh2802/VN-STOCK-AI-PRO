/**
 * ENGINE 3 — PROFITABILITY ENGINE
 * Margins, ROA, ROE, ROIC and their trends.
 * Deterministic; averages two consecutive periods when both exist, otherwise
 * falls back to period-end (explicitly flagged via `calculationMethod`).
 */
import type { ProfitabilityResult } from '../../../types/enterpriseIntelligence.ts';
import { AnnualFinancialFact, FinancialFactSet, latestFacts } from './financialFacts.ts';
import { n, round2 } from './helpers.ts';

export interface ProfitabilityOptions {
  effectiveTaxRate?: number | null; // decimal, e.g. 0.2
}

export class ProfitabilityEngine {
  static evaluate(set: FinancialFactSet, options?: ProfitabilityOptions): ProfitabilityResult {
    const { current, previous } = latestFacts(set);
    if (!current) return this.empty();

    const grossMargin = pctOf(current.grossProfit, current.revenue);
    const operatingMargin = pctOf(current.operatingProfit, current.revenue);
    const netMargin = pctOf(current.netProfit, current.revenue);

    const avgAssets = avgOrPeriodEnd(current.totalAssets, previous?.totalAssets);
    const avgEquity = avgOrPeriodEnd(current.totalEquity, previous?.totalEquity);

    const roa = avgAssets.value === null ? null : pctOf(current.netProfit, avgAssets.value);
    const roe = avgEquity.value === null ? null : pctOf(current.netProfit, avgEquity.value);

    const roic = this.calcROIC(current, previous, options?.effectiveTaxRate);

    // Trends (current vs previous period values)
    const prevGross = pctOf(previous?.grossProfit, previous?.revenue);
    const prevNet = pctOf(previous?.netProfit, previous?.revenue);
    const prevAssets = avgOrPeriodEnd(previous?.totalAssets, null).value;
    const prevEquity = avgOrPeriodEnd(previous?.totalEquity, null).value;
    const prevROA = prevAssets === null ? null : pctOf(previous?.netProfit, prevAssets);
    const prevROE = prevEquity === null ? null : pctOf(previous?.netProfit, prevEquity);
    const prevROIC = this.calcROIC(previous, null, options?.effectiveTaxRate);

    const marginChange = deltaOf(netMargin, prevNet);
    const roeTrend = deltaOf(roe, prevROE);
    const roaTrend = deltaOf(roa, prevROA);
    const roicTrend = deltaOf(roic, prevROIC);

    // Score: weighted, null when too few components.
    const components: number[] = [];
    if (roe !== null) components.push(scoreHighBetter(roe, 10, 25));
    if (roic !== null) components.push(scoreHighBetter(roic, 8, 20));
    if (netMargin !== null) components.push(scoreHighBetter(netMargin, 2, 20));
    if (operatingMargin !== null) components.push(scoreHighBetter(operatingMargin, 3, 25));
    let score: number | null = null;
    if (components.length >= 2) {
      score = round2(components.reduce((a, b) => a + b, 0) / components.length);
    }

    return {
      score,
      grossMargin,
      operatingMargin,
      netMargin,
      roe,
      roa,
      roic,
      trends: { marginChange, roeTrend, roaTrend, roicTrend },
    };
  }

  static calcROIC(
    current: AnnualFinancialFact | null,
    previous: AnnualFinancialFact | null,
    effectiveTaxRate?: number | null
  ): number | null {
    if (!current) return null;
    const ebit = current.operatingProfit ?? current.ebitda;
    if (ebit === null) return null;
    const avgEquity = avgOrPeriodEnd(current.totalEquity, previous?.totalEquity).value;
    const avgDebt = avgOrPeriodEnd(current.totalLiabilities, previous?.totalLiabilities).value;
    const cash = current.cash;
    if (avgEquity === null) return null;
    const investedCapital = avgEquity + (avgDebt ?? 0) - (cash ?? 0);
    if (investedCapital <= 0) return null;
    const tax = effectiveTaxRate ?? 0; // documented: tax rate unavailable → 0
    const nopat = ebit * (1 - tax);
    return round2((nopat / investedCapital) * 100);
  }

  private static empty(): ProfitabilityResult {
    return {
      score: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      roe: null,
      roa: null,
      roic: null,
      trends: { marginChange: null, roeTrend: null, roaTrend: null, roicTrend: null },
    };
  }
}

function pctOf(part: number | null | undefined, whole: number | null | undefined): number | null {
  const p = n(part);
  const w = n(whole);
  if (p === null || w === null || w === 0) return null;
  return round2((p / w) * 100);
}

function avgOrPeriodEnd(
  current: number | null | undefined,
  previous: number | null | undefined
): { value: number | null; method: 'average' | 'period_end' } {
  const c = n(current);
  const p = n(previous);
  if (c === null) return { value: null, method: 'period_end' };
  if (p === null) return { value: c, method: 'period_end' };
  return { value: (c + p) / 2, method: 'average' };
}

function deltaOf(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null) return null;
  return round2(cur - prev);
}

/** Linear scoring: 0 at `low`, 100 at `high`, clamped. */
function scoreHighBetter(value: number, low: number, high: number): number {
  const t = (value - low) / (high - low);
  return Math.min(100, Math.max(0, t * 100));
}