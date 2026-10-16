/**
 * Canonical Data Freshness Resolver
 * Implements authoritative freshness lifecycle for market & corporate action data:
 * CURRENT | STALE | UNAVAILABLE | INVALID
 */

export interface DataFreshnessInput {
  sourceTimestamp?: number | string | null;
  ttlMs?: number;
  now?: number;
}

export interface DataFreshnessVerdict {
  status: 'CURRENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID';
  normalizedSourceTimestamp: string | null;
  ageMs: number | null;
}

export function resolveDataFreshness(input: DataFreshnessInput): DataFreshnessVerdict {
  const { sourceTimestamp, ttlMs = 120_000, now = Date.now() } = input;
  if (sourceTimestamp === undefined || sourceTimestamp === null) {
    return { status: 'UNAVAILABLE', normalizedSourceTimestamp: null, ageMs: null };
  }
  const ts = typeof sourceTimestamp === 'number' ? sourceTimestamp : Date.parse(sourceTimestamp);
  if (!Number.isFinite(ts) || Number.isNaN(ts) || ts <= 0) {
    return { status: 'INVALID', normalizedSourceTimestamp: null, ageMs: null };
  }
  const age = now - ts;
  if (age < -60_000) {
    // Over 1 minute in the future is invalid
    return { status: 'INVALID', normalizedSourceTimestamp: new Date(ts).toISOString(), ageMs: age };
  }
  const status = age <= ttlMs ? 'CURRENT' : 'STALE';
  return { status, normalizedSourceTimestamp: new Date(ts).toISOString(), ageMs: Math.max(0, age) };
}
