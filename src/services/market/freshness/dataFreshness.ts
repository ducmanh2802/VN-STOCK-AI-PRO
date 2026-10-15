/**
 * P0-02 REMEDIATION — DETERMINISTIC DATA FRESHNESS RESOLVER
 * ========================================================
 * The single authority that maps a real source timestamp onto the repository's
 * established four-state freshness lifecycle:
 *
 *     CURRENT | STALE | UNAVAILABLE | INVALID      (src/types/stock.ts:7)
 *
 * P0-02 PROHIBITION ENFORCED HERE
 * - `CURRENT` is never assumed. It is only ever reached by an explicit
 *   age-vs-TTL comparison against a real, parseable source timestamp.
 * - A missing / null / empty source timestamp is `UNAVAILABLE`, never `CURRENT`.
 * - A future source timestamp beyond the configured clock-skew tolerance is
 *   `INVALID` (look-ahead / clock fault), never `CURRENT`.
 * - An unparseable timestamp is `INVALID`, never `CURRENT`.
 *
 * TTL ARCHITECTURE RESPECTED: callers pass the TTL already configured for their
 * own path (quote guard TTL, cache TTL, ...). This module never hardcodes one.
 */

import type { DataFreshnessStatus } from '../../../types/stock.ts';

export interface FreshnessInput {
  /** Real observation time reported by the source. `null`/`undefined` is a hard fail. */
  sourceTimestamp: string | number | null | undefined;
  /** Wall-clock reference for the comparison. Defaults to `Date.now()`. */
  referenceTimeMs?: number;
  /** Maximum age before the observation is no longer `CURRENT`. Must be > 0. */
  ttlMs: number;
  /** Tolerance for clock skew / feed lag into the future. Defaults to 60 000 ms. */
  futureSkewMs?: number;
}

export interface FreshnessVerdict {
  status: DataFreshnessStatus;
  /** Age in ms relative to `referenceTimeMs`. `null` when it cannot be computed. */
  ageMs: number | null;
  /** Machine-readable provenance for a non-CURRENT verdict. */
  reason: string | null;
  /** Normalized source timestamp (ISO) when the source supplied a usable value. */
  normalizedSourceTimestamp: string | null;
}

/** Fail-closed default TTL when a caller supplies an unusable one. */
const FALLBACK_FUTURE_SKEW_MS = 60_000;

/** Parses a source timestamp of unknown shape into epoch ms, or `NaN`. */
export function parseSourceTimestamp(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  const trimmed = value.trim();
  if (trimmed === '') return Number.NaN;
  // Numeric strings are epoch ms (or seconds when implausibly small).
  if (/^-?\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (!Number.isFinite(asNumber)) return Number.NaN;
    return asNumber < 1e11 ? asNumber * 1000 : asNumber;
  }
  return new Date(trimmed).getTime();
}

/**
 * Resolves the freshness state of an observation. Never returns `CURRENT`
 * unless a real timestamp was supplied and it is within the configured TTL.
 */
export function resolveDataFreshness(input: FreshnessInput): FreshnessVerdict {
  const referenceTimeMs = input.referenceTimeMs ?? Date.now();
  const futureSkewMs = input.futureSkewMs ?? FALLBACK_FUTURE_SKEW_MS;

  // 1. Fail-closed: no timestamp is never CURRENT. A whitespace-only value is
  //    treated as absent (UNAVAILABLE), not as an invalid observation.
  if (
    input.sourceTimestamp === null ||
    input.sourceTimestamp === undefined ||
    (typeof input.sourceTimestamp === 'string' && input.sourceTimestamp.trim() === '')
  ) {
    return {
      status: 'UNAVAILABLE',
      ageMs: null,
      reason: 'MISSING_SOURCE_TIMESTAMP',
      normalizedSourceTimestamp: null,
    };
  }

  const sourceMs = parseSourceTimestamp(input.sourceTimestamp);

  // 2. Fail-closed: unparseable timestamp is an invalid observation.
  if (!Number.isFinite(sourceMs)) {
    return {
      status: 'INVALID',
      ageMs: null,
      reason: 'UNPARSEABLE_SOURCE_TIMESTAMP',
      normalizedSourceTimestamp: null,
    };
  }

  const normalizedSourceTimestamp = new Date(sourceMs).toISOString();

  // 3. Fail-closed: a source timestamp ahead of the reference clock beyond the
  //    skew tolerance is a clock fault / look-ahead, never a fresh observation.
  if (sourceMs > referenceTimeMs + futureSkewMs) {
    return {
      status: 'INVALID',
      ageMs: referenceTimeMs - sourceMs,
      reason: 'FUTURE_SOURCE_TIMESTAMP',
      normalizedSourceTimestamp,
    };
  }

  const ageMs = referenceTimeMs - sourceMs;

  // 4. A non-positive / unusable TTL can never certify freshness.
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
    return {
      status: 'UNAVAILABLE',
      ageMs,
      reason: 'INVALID_TTL_CONFIGURATION',
      normalizedSourceTimestamp,
    };
  }

  // 5. The only path to CURRENT.
  if (ageMs > input.ttlMs) {
    return {
      status: 'STALE',
      ageMs,
      reason: 'EXCEEDS_TTL',
      normalizedSourceTimestamp,
    };
  }

  return {
    status: 'CURRENT',
    ageMs,
    reason: null,
    normalizedSourceTimestamp,
  };
}

/**
 * Combines several freshness states without ever letting a weaker state mask a
 * stronger one. Order of severity: INVALID > UNAVAILABLE > STALE > CURRENT.
 */
export function combineFreshness(
  states: readonly (DataFreshnessStatus | undefined | null)[]
): DataFreshnessStatus {
  let result: DataFreshnessStatus = 'CURRENT';
  for (const state of states) {
    if (!state) continue;
    if (state === 'INVALID') return 'INVALID';
    if (state === 'UNAVAILABLE') {
      result = 'UNAVAILABLE';
      continue;
    }
    if (state === 'STALE' && result !== 'UNAVAILABLE') result = 'STALE';
  }
  return result;
}