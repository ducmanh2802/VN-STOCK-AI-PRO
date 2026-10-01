/**
 * PHASE 24 — RESTATEMENT / REVISION ENGINE (P0)
 * =============================================
 * Append-only, versioned canonical financial fact store.
 *
 * INVARIANTS (enforced):
 *   1. Original filings are never mutated or deleted.
 *   2. Every distinct version coexists (append-only).
 *   3. Duplicate filings (same reportId + publicationDate + source + value) are
 *      rejected deterministically.
 *   4. The latest authoritative version is selected deterministically.
 *   5. Source authority dominates: a Tier-4 broker cross-check can NEVER override
 *      a conflicting higher-tier (Tier 1/2/3) fact.
 */

import type {
  CanonicalFinancialFact,
  EarningsReportType,
  EarningsStatementType,
  RestatementSelection,
  RestatementStatus,
  SourceTier,
} from './types.ts';
import { finite } from './helpers.ts';

export interface AppendResult {
  readonly accepted: boolean;
  readonly version: number | null;
  readonly reason?: string;
}

const TIER_RANK: Readonly<Record<SourceTier, number>> = {
  TIER_1_PRIMARY: 4,
  TIER_2_EXCHANGE: 3,
  TIER_3_ISSUER: 2,
  TIER_4_BROKER_CROSS_CHECK: 1,
};

const STATUS_RANK: Readonly<Record<RestatementStatus, number>> = {
  ORIGINAL: 1,
  AMENDED: 2,
  RESTATED: 3,
};

export class RestatementEngine {
  /** Append-only storage, in insertion order. */
  private readonly facts: CanonicalFinancialFact[] = [];

  /** Deterministic logical identity of a fact (excludes version/publication). */
  public static identityKey(fact: CanonicalFinancialFact): string {
    return [
      fact.symbol.toUpperCase(),
      fact.statementType,
      fact.reportType,
      fact.period.id,
      fact.metric,
    ].join('|');
  }

  /** Deterministic duplicate fingerprint (identity + reportId + source + publication + value). */
  public static duplicateKey(fact: CanonicalFinancialFact): string {
    return [
      RestatementEngine.identityKey(fact),
      fact.reportId,
      fact.source,
      fact.publicationDate ?? '',
      finite(fact.value) ?? 'null',
    ].join('~');
  }

  /** All stored facts (defensive copy). */
  public getAll(): readonly CanonicalFinancialFact[] {
    return [...this.facts];
  }

  /**
   * Appends a fact. Duplicates are rejected. Versions are assigned monotonically.
   */
  public append(fact: CanonicalFinancialFact): AppendResult {
    const dupKey = RestatementEngine.duplicateKey(fact);
    for (const existing of this.facts) {
      if (RestatementEngine.duplicateKey(existing) === dupKey) {
        return { accepted: false, version: null, reason: 'DUPLICATE_FILING' };
      }
    }

    const identity = RestatementEngine.identityKey(fact);
    const versions = this.facts.filter((f) => RestatementEngine.identityKey(f) === identity);
    let version = 0;
    let status: RestatementStatus = fact.restatementStatus;

    if (versions.length > 0) {
      version = Math.max(...versions.map((v) => v.restatementVersion)) + 1;
      if (status === 'ORIGINAL') {
        const priorLatest = versions[versions.length - 1];
        const changed = finite(fact.value) !== finite(priorLatest.value);
        status = changed ? 'RESTATED' : 'AMENDED';
      }
    } else {
      version = 0;
      status = 'ORIGINAL';
    }

    this.facts.push(Object.freeze({ ...fact, restatementVersion: version, restatementStatus: status }));
    return { accepted: true, version };
  }

  /** Appends many facts; returns per-fact results. */
  public appendMany(newFacts: readonly CanonicalFinancialFact[]): AppendResult[] {
    return newFacts.map((f) => this.append(f));
  }

  /** All versions of a logical statement (append order = chronological). */
  public getVersions(
    symbol: string,
    statementType: EarningsStatementType,
    reportType: EarningsReportType,
    periodId: string,
    metric?: string
  ): CanonicalFinancialFact[] {
    const sym = symbol.trim().toUpperCase();
    return this.facts.filter(
      (f) =>
        f.symbol.toUpperCase() === sym &&
        f.statementType === statementType &&
        f.reportType === reportType &&
        f.period.id === periodId &&
        (metric === undefined || f.metric === metric)
    );
  }

  /** Deterministic precedence: authority tier, then status, then publication, then version. */
  public static pickLatest(versions: readonly CanonicalFinancialFact[]): CanonicalFinancialFact | null {
    if (versions.length === 0) return null;
    return [...versions].sort((a, b) => {
      const tier = TIER_RANK[b.sourceTier] - TIER_RANK[a.sourceTier];
      if (tier !== 0) return tier;
      const status = STATUS_RANK[b.restatementStatus] - STATUS_RANK[a.restatementStatus];
      if (status !== 0) return status;
      const pub = (b.publicationDate ?? '').localeCompare(a.publicationDate ?? '');
      if (pub !== 0) return pub;
      return b.restatementVersion - a.restatementVersion;
    })[0];
  }

  /** Selects the latest authoritative fact + full lineage for one metric/period. */
  public selectLatest(
    symbol: string,
    statementType: EarningsStatementType,
    reportType: EarningsReportType,
    periodId: string,
    metric?: string
  ): RestatementSelection {
    const versions = this.getVersions(symbol, statementType, reportType, periodId, metric);
    const latest = RestatementEngine.pickLatest(versions);
    return Object.freeze({
      symbol: symbol.trim().toUpperCase(),
      statementType,
      reportType,
      periodId,
      latest,
      versions: Object.freeze([...versions]),
      status: latest?.restatementStatus ?? null,
      reason: latest ? undefined : 'REQUIRED_LINE_ITEM_NOT_FOUND',
    });
  }

  /**
   * True when a lower-authority (Tier-4 broker) fact materially conflicts with the
   * selected higher-authority fact for the same identity (tolerance default 1%).
   */
  public static hasBrokerConflict(versions: readonly CanonicalFinancialFact[], tolerancePct = 1.0): boolean {
    const latest = RestatementEngine.pickLatest(versions);
    if (!latest) return false;
    const latestVal = finite(latest.value);
    if (latestVal === null) return false;
    const latestTier = TIER_RANK[latest.sourceTier];
    return versions.some((v) => {
      if (TIER_RANK[v.sourceTier] >= latestTier) return false;
      const val = finite(v.value);
      if (val === null) return false;
      const base = Math.abs(latestVal);
      const diffPct = base > 0 ? (Math.abs(latestVal - val) / base) * 100 : (val === 0 ? 0 : 100);
      return diffPct > tolerancePct;
    });
  }
}
