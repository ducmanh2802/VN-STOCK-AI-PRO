/**
 * PHASE 19.5.3 — Stock Detail fail-closed metric helpers.
 *
 * Core invariant:
 * - VALID finite data → displayed / calculated
 * - INVALID or UNAVAILABLE data → null / unavailable representation ('--' or '—')
 * - Invalid inputs must NEVER be coerced into fabricated numeric values (no `|| 0`, `?? 0`, `NaN`, `Infinity`).
 */

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Ensures value is finite and positive (> 0), typical for stock prices, shares, EPS, book value, etc.
 */
export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Formats a metric value or returns fallback '--' if invalid or non-finite.
 */
export function formatMetricOrFallback(
  value: unknown,
  formatter: (val: number) => string,
  fallback = '--'
): string {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return formatter(value);
}
