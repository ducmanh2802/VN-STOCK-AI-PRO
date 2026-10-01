/**
 * PHASE 24 — CANONICAL FACT LOOKUP
 * ================================
 * Deterministic index + fail-closed lookup over canonical financial facts.
 * Used by the statement / growth / quality engines.
 */

import type { CanonicalFinancialFact, DataUnavailableReasonCode } from './types.ts';
import { finite } from './helpers.ts';

export interface MetricLookup {
  readonly value: number | null;
  readonly reason?: DataUnavailableReasonCode;
  readonly fact: CanonicalFinancialFact | null;
}

export type FactIndex = ReadonlyMap<string, CanonicalFinancialFact>;

/**
 * Builds a metric-keyed index. When several versions of the same metric exist
 * the caller is expected to have already selected the authoritative version
 * (see RestatementEngine); otherwise the last one wins deterministically.
 */
export function buildFactIndex(facts: readonly CanonicalFinancialFact[]): FactIndex {
  const idx = new Map<string, CanonicalFinancialFact>();
  for (const f of facts) idx.set(f.metric, f);
  return idx;
}

/** Fail-closed lookup: missing fact -> null value + REQUIRED_LINE_ITEM_NOT_FOUND. */
export function lookupMetric(index: FactIndex, metric: string): MetricLookup {
  const fact = index.get(metric) ?? null;
  if (!fact) {
    return { value: null, reason: 'REQUIRED_LINE_ITEM_NOT_FOUND', fact: null };
  }
  const value = finite(fact.value);
  if (value === null) {
    return { value: null, reason: fact.unavailableReason ?? 'VALUE_NON_FINITE', fact };
  }
  return { value, reason: undefined, fact };
}

/** Convenience: collect the reason (if any) into a mutable reason map. */
export function recordReason(
  reasons: Record<string, DataUnavailableReasonCode>,
  field: string,
  lookup: MetricLookup
): void {
  if (lookup.reason) reasons[field] = lookup.reason;
}
