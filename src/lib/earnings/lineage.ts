/**
 * PHASE 24 — LINEAGE BUILDER
 * =========================
 * Derives a Phase-24 EarningsLineage compatible with the Phase 23
 * `{sources, engine, calculationVersion}` contract, extended with statement-level
 * audit metadata.
 */

import type { CanonicalFinancialFact, EarningsLineage } from './types.ts';
import { EARNINGS_ENGINE_NAME, EARNINGS_CALCULATION_VERSION } from './helpers.ts';

export interface LineageOverrides {
  engine?: string;
  calculationVersion?: string;
  extraSources?: readonly string[];
}

/**
 * Builds a lineage object from one or more source facts. The FIRST fact that
 * carries statement-level metadata is used as the statement context.
 */
export function buildLineage(
  facts: readonly CanonicalFinancialFact[],
  overrides?: LineageOverrides
): EarningsLineage {
  const sources = new Set<string>();
  for (const f of facts) {
    if (f?.source) sources.add(f.source);
    if (f?.lineage?.sources) for (const s of f.lineage.sources) sources.add(s);
  }
  for (const s of overrides?.extraSources ?? []) sources.add(s);

  const primary = facts.find((f) => f) ?? null;

  return {
    sources: Array.from(sources).sort(),
    engine: overrides?.engine ?? EARNINGS_ENGINE_NAME,
    calculationVersion: overrides?.calculationVersion ?? EARNINGS_CALCULATION_VERSION,
    statementId: primary?.statementId ?? null,
    reportId: primary?.reportId ?? null,
    periodStart: primary?.period?.periodStart ?? null,
    periodEnd: primary?.period?.periodEnd ?? null,
    publicationDate: primary?.publicationDate ?? null,
    auditStatus: primary?.auditStatus ?? null,
    restatementVersion: primary?.restatementVersion ?? null,
  };
}
