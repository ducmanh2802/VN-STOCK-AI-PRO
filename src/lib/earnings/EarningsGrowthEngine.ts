/**
 * PHASE 24 — EARNINGS GROWTH ENGINE
 * =================================
 * Deterministic YoY / QoQ / TTM / YTD growth. Comparisons are ONLY performed
 * between directly comparable periods (FinancialPeriodEngine.isComparable), so a
 * quarter is never compared to a cumulative window.
 *
 * Fail-closed: growth is `null` whenever the denominator is missing or <= 0, or
 * the two periods are not comparable. NaN / ±Infinity are never produced.
 */

import type {
  CanonicalFinancialFact,
  DataUnavailableReasonCode,
  EarningsLineage,
  FinancialPeriod,
  GrowthBasis,
  GrowthMetric,
  GrowthResult,
} from './types.ts';
import { FinancialPeriodEngine } from './FinancialPeriodEngine.ts';
import { buildLineage } from './lineage.ts';
import { finite, pctChange, round } from './helpers.ts';

export interface PeriodValue {
  readonly period: FinancialPeriod;
  readonly value: number | null;
}

/** Builds a deterministic, ascending period-value series for a metric. */
export function buildSeries(facts: readonly CanonicalFinancialFact[]): PeriodValue[] {
  return [...facts]
    .sort((a, b) => FinancialPeriodEngine.compare(a.period, b.period))
    .map((f) => ({ period: f.period, value: finite(f.value) }));
}

function findByYoY(series: readonly PeriodValue[], current: PeriodValue): PeriodValue | null {
  const match = series.find(
    (p) => p.period.fiscalYear === current.period.fiscalYear - 1 && FinancialPeriodEngine.isComparable(current.period, p.period)
  );
  return match ?? null;
}

function findByQoQ(series: readonly PeriodValue[], current: PeriodValue): PeriodValue | null {
  const match = series.find((p) => FinancialPeriodEngine.isQuarterOverQuarterPair(current.period, p.period));
  return match ?? null;
}

export class EarningsGrowthEngine {
  /** Constructs a single GrowthMetric from a current/prior pair. */
  public static growthMetric(
    basis: GrowthBasis,
    current: PeriodValue | null,
    prior: PeriodValue | null
  ): GrowthMetric {
    const curVal = current ? finite(current.value) : null;
    const priorVal = prior ? finite(prior.value) : null;

    let reason: DataUnavailableReasonCode | undefined;
    let percent: number | null = null;

    if (!current || curVal === null) {
      reason = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    } else if (!prior || priorVal === null) {
      reason = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    } else if (priorVal <= 0) {
      // Percent change against a non-positive base is undefined for financials.
      reason = 'VALUE_NON_FINITE';
    } else {
      const r = pctChange(curVal, priorVal);
      percent = r === null ? null : round(r, 2);
      if (percent === null) reason = 'VALUE_NON_FINITE';
    }

    return Object.freeze({
      basis,
      currentPeriod: current?.period ?? null,
      priorPeriod: prior?.period ?? null,
      current: curVal,
      prior: priorVal,
      percent,
      reason,
    });
  }

  /** Year-over-year growth for a period. */
  public static yoy(series: readonly PeriodValue[], current: PeriodValue): GrowthMetric {
    return this.growthMetric('YOY', current, findByYoY(series, current));
  }

  /** Quarter-over-quarter growth for a discrete quarter. */
  public static qoq(series: readonly PeriodValue[], current: PeriodValue): GrowthMetric {
    if (current.period.accumulation !== 'DISCRETE' || current.period.quarter === null) {
      return this.growthMetric('QOQ', null, null);
    }
    return this.growthMetric('QOQ', current, findByQoQ(series, current));
  }

  /**
   * Deterministic YTD derivation: derives a discrete quarter value by
   * subtracting the prior cumulative value from the current cumulative value.
   * Only valid for the standard cumulative chain Q1<H1<9M<FY of the SAME fiscal
   * year; otherwise returns null (fail-closed).
   */
  public static deriveYtdDelta(current: PeriodValue, prior: PeriodValue): number | null {
    if (current.period.fiscalYear !== prior.period.fiscalYear) return null;
    const validChain =
      (current.period.type === 'H1' && prior.period.type === 'Q1') ||
      (current.period.type === '9M' && prior.period.type === 'H1') ||
      (current.period.type === 'FY' && prior.period.type === '9M');
    if (!validChain) return null;
    const c = finite(current.value);
    const p = finite(prior.value);
    if (c === null || p === null) return null;
    return round(c - p, 2);
  }

  /** The latest discrete quarter present in a series (or null). */
  public static latestQuarter(series: readonly PeriodValue[]): FinancialPeriod | null {
    const quarters = series
      .filter((p) => p.period.accumulation === 'DISCRETE' && p.period.quarter !== null && /^Q[1-4]$/.test(p.period.type))
      .sort((a, b) => FinancialPeriodEngine.compare(a.period, b.period));
    return quarters.length > 0 ? quarters[quarters.length - 1].period : null;
  }

  /**
   * Trailing-twelve-month value ending at `end`. Requires FOUR consecutive
   * quarterly periods, each with a finite value; otherwise null (fail-closed).
   * Never mixes quarters with cumulative windows.
   */
  public static ttmValue(series: readonly PeriodValue[], end: FinancialPeriod): number | null {
    if (end.quarter === null || end.accumulation !== 'DISCRETE') return null;
    const endIdx = end.fiscalYear * 4 + (end.quarter - 1);
    let total = 0;
    for (let i = endIdx - 3; i <= endIdx; i++) {
      const y = Math.floor(i / 4);
      const q = (i % 4) + 1;
      const p = series.find(
        (s) => s.period.fiscalYear === y && s.period.quarter === q && /^Q[1-4]$/.test(s.period.type)
      );
      const v = p ? finite(p.value) : null;
      if (v === null) return null;
      total += v;
    }
    return round(total, 2);
  }

  /** TTM using the latest quarter present in the series. */
  public static ttm(series: readonly PeriodValue[]): { period: FinancialPeriod; value: number } | null {
    const end = this.latestQuarter(series);
    if (!end) return null;
    const value = this.ttmValue(series, end);
    if (value === null) return null;
    const endIdx = end.fiscalYear * 4 + (end.quarter as number) - 1;
    const quarters: FinancialPeriod[] = [];
    for (let i = endIdx - 3; i <= endIdx; i++) {
      quarters.push(FinancialPeriodEngine.quarter(Math.floor(i / 4), ((i % 4) + 1) as 1 | 2 | 3 | 4));
    }
    const period = FinancialPeriodEngine.buildTTM(quarters);
    return period ? { period, value } : null;
  }

  /** Aggregates a full GrowthResult across the four canonical income lines. */
  public static evaluate(
    params: {
      symbol: string;
      currentPeriod: FinancialPeriod;
      revenueSeries: readonly PeriodValue[];
      netProfitSeries: readonly PeriodValue[];
      parentNetProfitSeries: readonly PeriodValue[];
      epsSeries: readonly PeriodValue[];
      basis?: 'YOY' | 'QOQ';
    },
    facts: readonly CanonicalFinancialFact[] = []
  ): GrowthResult {
    const basis = params.basis ?? 'YOY';
    const pick = (series: readonly PeriodValue[]): GrowthMetric => {
      const current = series.find((p) => p.period.id === params.currentPeriod.id) ??
        { period: params.currentPeriod, value: null };
      return basis === 'QOQ' ? this.qoq(series, current) : this.yoy(series, current);
    };

    const lineage: EarningsLineage = buildLineage(facts, { engine: 'EarningsGrowthEngine' });

    // Fail-closed (P24-D10): TTM windows are aligned to a COMMON end quarter —
    // the earlier of the two series' latest quarters — so the snapshot never
    // implies revenue and profit cover the same window when they do not.
    const revenueEnd = this.latestQuarter(params.revenueSeries);
    const profitEnd = this.latestQuarter(params.netProfitSeries);
    const commonEnd =
      revenueEnd && profitEnd
        ? FinancialPeriodEngine.compare(revenueEnd, profitEnd) <= 0
          ? revenueEnd
          : profitEnd
        : null;

    return Object.freeze({
      symbol: params.symbol.trim().toUpperCase(),
      revenue: pick(params.revenueSeries),
      netProfit: pick(params.netProfitSeries),
      parentNetProfit: pick(params.parentNetProfitSeries),
      eps: pick(params.epsSeries),
      ttmRevenue: commonEnd ? this.ttmValue(params.revenueSeries, commonEnd) : null,
      ttmNetProfit: commonEnd ? this.ttmValue(params.netProfitSeries, commonEnd) : null,
      lineage,
    });
  }
}
