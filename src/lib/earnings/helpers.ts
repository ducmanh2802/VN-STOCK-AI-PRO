/**
 * PHASE 24 — EARNINGS INTELLIGENCE MATH HELPERS
 * =============================================
 * Pure, deterministic, fail-closed math utilities. Every function returns
 * `number | null`; `null` means "cannot be computed from available data".
 * NaN / ±Infinity are NEVER propagated — they become `null`.
 */

export const EARNINGS_ENGINE_NAME = 'EarningsEngine';
export const EARNINGS_CALCULATION_VERSION = '24.0.0-PROD';

/** True for finite, non-NaN numbers. */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Returns the value when finite, otherwise null. */
export function finite(v: number | null | undefined): number | null {
  return isFiniteNumber(v) ? v : null;
}

/** Safe division: null when numerator/denominator missing or denominator == 0. */
export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  const a = finite(numerator);
  const b = finite(denominator);
  if (a === null || b === null || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

/**
 * Percentage change: ((current / prior) - 1) * 100.
 * Fail-closed: null when either side is missing, or the prior base is <= 0
 * (percentage change against a non-positive base is mathematically undefined
 * for financial reporting and must never be fabricated).
 */
export function pctChange(current: number | null | undefined, prior: number | null | undefined): number | null {
  const c = finite(current);
  const p = finite(prior);
  if (c === null || p === null || p <= 0) return null;
  const r = ((c / p) - 1) * 100;
  return Number.isFinite(r) ? r : null;
}

/** Rounds to `decimals` places; null passes through. */
export function round(value: number | null | undefined, decimals = 2): number | null {
  const v = finite(value);
  if (v === null) return null;
  return Number(Number(v.toFixed(decimals)));
}

/** Ratio expressed as percent of a whole, guarded against zero denominators. */
export function percentOf(part: number | null | undefined, whole: number | null | undefined, decimals = 2): number | null {
  const r = safeDivide(part, whole);
  return r === null ? null : round(r * 100, decimals);
}

/** Deterministic string ordering. */
export function byStringAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
