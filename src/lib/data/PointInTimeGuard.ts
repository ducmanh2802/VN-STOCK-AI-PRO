/**
 * DATA-04 — POINT-IN-TIME GUARD + BIAS DIAGNOSTICS
 * =================================================
 * Availability semantics: for a query at time T, only data with
 * publicationTime <= T may be used as known information
 * (unless the data type documents different semantics).
 *
 * Reusable guards: future earnings/fundamentals/CA/membership/metadata/
 * macro/strategy inputs. Delisted instruments stay queryable.
 * Pure + deterministic.
 */

import type { BiasDiagnostic, BiasCode, InstrumentIdentity } from './types.ts';

export interface TimestampedRecord {
  readonly publicationDate: string;
  readonly [k: string]: unknown;
}

export class PointInTimeGuard {
  static isKnowable(publicationDate: string, asOf: string): boolean {
    return publicationDate <= asOf;
  }

  static filterKnowable<T extends TimestampedRecord>(records: readonly T[], asOf: string): {
    readonly knowable: readonly T[];
    readonly rejected: readonly T[];
  } {
    const knowable: T[] = [];
    const rejected: T[] = [];
    for (const r of records) {
      if (PointInTimeGuard.isKnowable(r.publicationDate, asOf)) knowable.push(r);
      else rejected.push(r);
    }
    return { knowable, rejected };
  }

  static assertNoFutureInput(opts: {
    readonly kind: string;
    readonly publicationDate: string | null;
    readonly asOf: string;
  }): BiasDiagnostic | null {
    if (!opts.publicationDate) {
      return {
        code: 'FUTURE_PUBLICATION',
        detail: `${opts.kind}: missing publicationDate cannot prove point-in-time availability`,
        offendingRef: opts.kind,
      };
    }
    if (opts.publicationDate > opts.asOf) {
      return {
        code: 'LOOKAHEAD_DETECTED',
        detail: `${opts.kind}: publicationDate ${opts.publicationDate} after asOf ${opts.asOf}`,
        offendingRef: opts.kind,
      };
    }
    return null;
  }

  static getInstrumentAsOf(
    versions: readonly InstrumentIdentity[],
    instrumentId: string,
    asOf: string
  ): InstrumentIdentity | null {
    const matches = versions
      .filter((v) => v.instrumentId === instrumentId && v.validFrom <= asOf && (!v.validTo || asOf <= v.validTo))
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
    return matches[0] ?? null;
  }

  static getUniverseAsOf(
    versions: readonly InstrumentIdentity[],
    asOf: string,
    opts?: { readonly includeDelisted?: boolean }
  ): { readonly universe: readonly InstrumentIdentity[]; readonly diagnostics: readonly BiasDiagnostic[] } {
    const includeDelisted = opts?.includeDelisted ?? false;
    const latest = new Map<string, InstrumentIdentity>();
    for (const v of versions) {
      if (v.validFrom > asOf) continue;
      if (v.validTo && asOf > v.validTo) continue;
      const prev = latest.get(v.instrumentId);
      if (!prev || v.validFrom > prev.validFrom) latest.set(v.instrumentId, v);
    }
    const all = [...latest.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
    const diagnostics: BiasDiagnostic[] = [];
    if (!includeDelisted) {
      const delistedCount = all.filter((v) => v.status !== 'ACTIVE').length;
      if (delistedCount > 0) {
        diagnostics.push({
          code: 'SURVIVORSHIP_RISK',
          detail: `${delistedCount} non-active instruments excluded from active-only universe at ${asOf}; use includeDelisted for unbiased research`,
        });
      }
    }
    return {
      universe: includeDelisted ? all : all.filter((v) => v.status === 'ACTIVE'),
      diagnostics,
    };
  }

  static detectCurrentConstituentLeak(opts: {
    readonly usedUniverseDate: string | null;
    readonly researchAsOf: string;
  }): BiasDiagnostic | null {
    if (!opts.usedUniverseDate) {
      return {
        code: 'CURRENT_CONSTITUENT_LEAK',
        detail: `universe vintage unknown for research asOf ${opts.researchAsOf}; cannot prove historical membership`,
      };
    }
    if (opts.usedUniverseDate > opts.researchAsOf) {
      return {
        code: 'CURRENT_CONSTITUENT_LEAK',
        detail: `universe dated ${opts.usedUniverseDate} is newer than research asOf ${opts.researchAsOf}`,
      };
    }
    return null;
  }

  static futureMetadata(opts: { readonly metadataDate: string; readonly asOf: string; readonly ref: string }): BiasDiagnostic | null {
    if (opts.metadataDate > opts.asOf) {
      const code: BiasCode = 'FUTURE_METADATA';
      return { code, detail: `${opts.ref}: metadata date ${opts.metadataDate} after asOf ${opts.asOf}`, offendingRef: opts.ref };
    }
    return null;
  }
}
