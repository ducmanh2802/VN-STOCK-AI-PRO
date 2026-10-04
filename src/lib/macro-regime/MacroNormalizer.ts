/**
 * PHASE 27 — MACRO NORMALIZER ENGINE
 * ==================================
 * Normalizes raw macroeconomic observations into standardized domain facts.
 * Computes momentum, trend direction, and validates publication dates.
 *
 * LOOKAHEAD-SAFETY (P0 INVARIANT):
 *   `publicationDate <= asOfDate` is strictly enforced.
 *   Observations released after `asOfDate` are filtered out.
 */

import type {
  MacroObservation,
  NormalizedMacroObservation,
  DataFreshnessStatus,
} from './types.ts';

export interface NormalizeOptions {
  readonly asOfDate?: string;
  readonly previousObservations?: readonly MacroObservation[];
}

export class MacroNormalizer {
  public static readonly VERSION = 'v1.0.0-phase27';

  /**
   * Filters and normalizes a collection of observations up to the publication cutoff date.
   *
   * Source-integrity gate (P27-D1): TIER_4_UNVERIFIED observations can never
   * enter deterministic models, and SUSPECT / INVALID observations are excluded
   * from scoring. Such rows are dropped (counted as integrity rejections), so a
   * poisoned or unverified feed degrades to UNKNOWN rather than a fabricated
   * regime.
   */
  public static filterAndNormalize(
    observations: readonly MacroObservation[],
    options?: NormalizeOptions
  ): {
    normalizedList: NormalizedMacroObservation[];
    rejectedLookaheadCount: number;
    lookaheadViolations: string[];
    rejectedIntegrityCount: number;
    integrityViolations: string[];
  } {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const normalizedList: NormalizedMacroObservation[] = [];
    const lookaheadViolations: string[] = [];
    let rejectedLookaheadCount = 0;
    const integrityViolations: string[] = [];
    let rejectedIntegrityCount = 0;

    // Deduplicate by metricCode + observationDate + revisionVersion (take latest valid revision)
    const latestRevisionMap = new Map<string, MacroObservation>();

    for (const obs of observations) {
      // 1. Enforce strict publication cutoff
      if (obs.publicationDate > asOfDate) {
        lookaheadViolations.push(
          `Metric ${obs.metricCode} (${obs.periodId || obs.observationDate}) publicationDate (${obs.publicationDate}) > asOfDate (${asOfDate})`
        );
        rejectedLookaheadCount++;
        continue;
      }

      // 1b. Source-integrity gate (P27-D1): unverified / suspect / invalid
      // observations never enter deterministic models.
      if (
        obs.sourceTier === 'TIER_4_UNVERIFIED' ||
        obs.validationStatus === 'SUSPECT' ||
        obs.validationStatus === 'INVALID'
      ) {
        integrityViolations.push(
          `Metric ${obs.metricCode} (${obs.periodId || obs.observationDate}) excluded from models: tier=${obs.sourceTier} validation=${obs.validationStatus}`
        );
        rejectedIntegrityCount++;
        continue;
      }

      // 2. Validate numeric value
      if (obs.value === null || isNaN(obs.value)) {
        continue;
      }

      const dedupeKey = `${obs.metricCode}_${obs.observationDate}`;
      const existing = latestRevisionMap.get(dedupeKey);
      if (!existing || obs.revisionVersion >= existing.revisionVersion) {
        latestRevisionMap.set(dedupeKey, obs);
      }
    }

    // Now normalize each unique observation
    const prevMap = new Map<string, MacroObservation>();
    if (options?.previousObservations) {
      for (const p of options.previousObservations) {
        if (p.publicationDate <= asOfDate && p.value !== null && !isNaN(p.value)) {
          prevMap.set(p.metricCode, p);
        }
      }
    }

    for (const obs of latestRevisionMap.values()) {
      const prev = prevMap.get(obs.metricCode);
      const prevVal = prev?.value ?? null;

      let momentum: number | null = null;
      let trend: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN' = 'UNKNOWN';

      if (obs.value !== null && prevVal !== null) {
        momentum = Number((obs.value - prevVal).toFixed(4));
        const threshold = Math.abs(obs.value) * 0.01; // 1% threshold
        if (momentum > threshold) {
          trend = 'RISING';
        } else if (momentum < -threshold) {
          trend = 'FALLING';
        } else {
          trend = 'STABLE';
        }
      }

      normalizedList.push({
        metricCode: obs.metricCode,
        observation: obs,
        normalizedValue: obs.value,
        momentum,
        trend,
        isValid: obs.validationStatus === 'VALID' || obs.validationStatus === 'PROVISIONAL',
      });
    }

    return {
      normalizedList,
      rejectedLookaheadCount,
      lookaheadViolations,
      rejectedIntegrityCount,
      integrityViolations,
    };
  }

  /**
   * Helper to derive aggregate freshness status across active observations.
   */
  public static deriveAggregateFreshness(
    observations: readonly NormalizedMacroObservation[]
  ): DataFreshnessStatus {
    if (observations.length === 0) {
      return 'UNAVAILABLE';
    }
    if (observations.some((o) => o.observation.freshnessStatus === 'INVALID')) {
      return 'INVALID';
    }
    if (observations.every((o) => o.observation.freshnessStatus === 'CURRENT')) {
      return 'CURRENT';
    }
    if (observations.some((o) => o.observation.freshnessStatus === 'CURRENT' || o.observation.freshnessStatus === 'STALE')) {
      return 'STALE';
    }
    return 'UNAVAILABLE';
  }
}
