/**
 * Deterministic financial math helpers. All functions are pure and safe against
 * division-by-zero / NaN / Infinity. Every result is `number | null` where
 * `null` means "cannot be computed from the available data" (never a guess).
 */
import type { ConfidenceLevel } from '../../../types/enterpriseIntelligence.ts';

export function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && !Number.isNaN(v);
}

export function n(v: unknown): number | null {
  return isNumber(v) ? v : null;
}

/** Safe division: returns null when divisor <= 0 or inputs invalid. */
export function safeDiv(numerator: number | null | undefined, divisor: number | null | undefined): number | null {
  const a = n(numerator);
  const b = n(divisor);
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/** Percent change: ((cur / prev) - 1) * 100. Null when prev <= 0. */
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  const c = n(cur);
  const p = n(prev);
  if (c === null || p === null || p === 0) return null;
  return ((c / p) - 1) * 100;
}

/**
 * Compound Annual Growth Rate (%). CAGR = (Ending / Beginning)^(1/years) - 1.
 * Returns null when either endpoint missing, beginning <= 0, or years <= 0.
 */
export function cagr(ending: number | null | undefined, beginning: number | null | undefined, years: number): number | null {
  const e = n(ending);
  const b = n(beginning);
  if (e === null || b === null || years <= 0 || b <= 0 || e < 0) return null;
  return (Math.pow(e / b, 1 / years) - 1) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function round1(value: number): number {
  return Number(value.toFixed(1));
}

/** Average of non-null values; null when none present or one side missing. */
export function averageOf(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => isNumber(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/** Average of two period values (typically period start + period end). */
export function average(start: number | null | undefined, end: number | null | undefined): number | null {
  const a = n(start);
  const b = n(end);
  if (a === null || b === null) return null;
  return (a + b) / 2;
}

/**
 * Percentile rank (0..1) of `value` within an ascending sorted historical set.
 * Returns null when not enough data or value is missing. Uses linear
 * interpolation of the count of values <= value.
 */
export function percentileRank(value: number | null | undefined, historical: Array<number | null | undefined>): number | null {
  const v = n(value);
  if (v === null || historical.length === 0) return null;
  const present = historical
    .map(n)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (present.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const x of present) {
    if (x < v) below += 1;
    else if (x === v) equal += 1;
  }
  const rank = below + equal * 0.5;
  return clamp(rank / present.length, 0, 1);
}

export interface SourceTag {
  source: string;
  period: string | null;
  calculationMethod?: 'average' | 'period_end';
}

/** Builds an AnalysisEvidence entry. */
export function evidence(
  metric: string,
  value: number | string | null,
  period: string | null,
  source: string,
  calculation: string | null,
  confidence: ConfidenceLevel
) {
  return { metric, value, period, source, calculation, confidence };
}

/** Heuristic confidence from data completeness percentage. */
export function confidenceFromCompleteness(pct: number): ConfidenceLevel {
  if (pct >= 75) return 'HIGH';
  if (pct >= 50) return 'MEDIUM';
  return 'LOW';
}

/** Format a value for display fallback when null. */
export function displayValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return '--';
  return String(v);
}

/**
 * CAGR over the trailing `years` periods from a time series of yearly values.
 * Requires at least `years + 1` points.
 */
export function trailingCagr(
  series: Array<{ year: number; value: number | null }>,
  years: number
): number | null {
  const sorted = [...series].sort((a, b) => a.year - b.year);
  if (sorted.length < years + 1) return null;
  const ending = sorted[sorted.length - 1].value;
  const beginning = sorted[sorted.length - 1 - years].value;
  return cagr(ending, beginning, years);
}