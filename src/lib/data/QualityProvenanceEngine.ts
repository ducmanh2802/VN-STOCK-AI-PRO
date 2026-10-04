/**
 * DATA-03 — QUALITY, PROVENANCE, LINEAGE, CROSS-SOURCE
 * ====================================================
 * Explicit quality states; integrate (not duplicate) existing freshness:
 *   existing CURRENT/STALE/UNAVAILABLE/INVALID  <->  quality VALID/WARNING/STALE/INVALID/UNAVAILABLE
 * Mapping: CURRENT->VALID, STALE->STALE, UNAVAILABLE->UNAVAILABLE, INVALID->INVALID.
 * Pure + deterministic.
 */

import type {
  CanonicalBar,
  DataQualityState,
  FreshnessState,
  LineageNode,
  Provenance,
} from './types.ts';

export function freshnessToQuality(f: FreshnessState): DataQualityState {
  switch (f) {
    case 'CURRENT':
      return 'VALID';
    case 'STALE':
      return 'STALE';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'INVALID':
      return 'INVALID';
  }
}

export interface QualityCheckResult {
  readonly dimension: string;
  readonly passed: boolean;
  readonly detail: string;
}

export class QualityEngine {
  static assessBars(bars: readonly CanonicalBar[]): {
    readonly quality: DataQualityState;
    readonly checks: readonly QualityCheckResult[];
  } {
    const checks: QualityCheckResult[] = [];
    const completeness = bars.length > 0;
    checks.push({
      dimension: 'completeness',
      passed: completeness,
      detail: completeness ? `${bars.length} bars` : 'empty series',
    });
    let correctness = true;
    for (const b of bars) {
      if (!(b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0)) {
        correctness = false;
        break;
      }
      if (b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close)) {
        correctness = false;
        break;
      }
    }
    checks.push({ dimension: 'correctness', passed: correctness, detail: correctness ? 'OHLC valid' : 'OHLC violation' });
    const keys = new Set(bars.map((b) => `${b.instrumentId}|${b.date}`));
    const uniqueness = keys.size === bars.length;
    checks.push({ dimension: 'uniqueness', passed: uniqueness, detail: uniqueness ? 'no duplicates' : 'duplicates present' });
    let rangeOk = true;
    for (const b of bars) {
      if (!(b.volume >= 0 && b.value >= 0)) {
        rangeOk = false;
        break;
      }
    }
    checks.push({ dimension: 'range validity', passed: rangeOk, detail: rangeOk ? 'volume/value >= 0' : 'negative volume/value' });
    let chrono = true;
    for (let i = 1; i < bars.length; i += 1) {
      if (bars[i].date < bars[i - 1].date) {
        chrono = false;
        break;
      }
    }
    checks.push({ dimension: 'consistency', passed: chrono, detail: chrono ? 'chronological' : 'out of order' });
    const allPassed = checks.every((c) => c.passed);
    const anyInvalid = !correctness || !rangeOk;
    return {
      quality: bars.length === 0 ? 'UNAVAILABLE' : anyInvalid ? 'INVALID' : allPassed ? 'VALID' : 'WARNING',
      checks,
    };
  }

  static qualityReport(opts: {
    readonly coverageBarCount: number;
    readonly missingCount: number;
    readonly staleCount: number;
    readonly invalidCount: number;
    readonly providerDisagreements: number;
    readonly lineageComplete: boolean;
  }): {
    readonly coverage: number;
    readonly missingness: number;
    readonly staleness: number;
    readonly invalidShare: number;
    readonly quality: DataQualityState;
  } {
    const total = Math.max(1, opts.coverageBarCount + opts.missingCount);
    return {
      coverage: opts.coverageBarCount / total,
      missingness: opts.missingCount / total,
      staleness: opts.staleCount / total,
      invalidShare: opts.invalidCount / total,
      quality:
        opts.invalidCount > 0
          ? 'INVALID'
          : opts.coverageBarCount === 0
            ? 'UNAVAILABLE'
            : opts.staleCount > 0 || opts.missingCount > 0 || !opts.lineageComplete
              ? 'WARNING'
              : 'VALID',
    };
  }
}

let provenanceSeq = 0;

export class ProvenanceEngine {
  static build(opts: {
    readonly source: string;
    readonly provider: string;
    readonly endpointOrQuery?: string | null;
    readonly retrievalTime: string;
    readonly observationTime: string;
    readonly publicationTime: string;
    readonly ingestionTime: string;
    readonly dataVersion: string;
    readonly transformation: string;
    readonly adjustment: Provenance['adjustment'];
    readonly quality: DataQualityState;
  }): Provenance {
    provenanceSeq += 1;
    void provenanceSeq;
    return { ...opts };
  }

  static chainToLineage(chain: readonly { readonly kind: string; readonly ref: string; readonly provenance: Provenance }[]): readonly LineageNode[] {
    return chain.map((n) => ({ kind: n.kind, ref: n.ref, provenance: n.provenance }));
  }

  static lineageComplete(chain: readonly LineageNode[]): boolean {
    if (chain.length === 0) return false;
    return chain.every((n) => !!n.provenance.source && !!n.provenance.observationTime && !!n.provenance.publicationTime);
  }
}

export interface CrossSourceComparison {
  readonly comparable: boolean;
  readonly reason?: string;
  readonly discrepancyBasisPoints?: number;
  readonly verdict?: 'OK' | 'MISMATCH' | 'UNVERIFIED';
}

export class CrossSourceValidator {
  static compare(opts: {
    readonly valueA: number | null;
    readonly valueB: number | null;
    readonly sameInstrument: boolean;
    readonly sameTimestamp: boolean;
    readonly sameUnit: boolean;
    readonly tolerancePercent?: number;
  }): CrossSourceComparison {
    if (!opts.sameInstrument || !opts.sameTimestamp || !opts.sameUnit) {
      return { comparable: false, reason: 'NOT_SEMANTICALLY_COMPARABLE' };
    }
    if (opts.valueA === null || opts.valueB === null || !(opts.valueA > 0) || !(opts.valueB > 0)) {
      return { comparable: true, verdict: 'UNVERIFIED', reason: 'MISSING_SIDE' };
    }
    const tol = opts.tolerancePercent ?? 10;
    const dev = Math.abs(opts.valueA - opts.valueB) / opts.valueB;
    const bps = Math.round(dev * 10000);
    return {
      comparable: true,
      discrepancyBasisPoints: bps,
      verdict: dev * 100 <= tol ? 'OK' : 'MISMATCH',
    };
  }
}
