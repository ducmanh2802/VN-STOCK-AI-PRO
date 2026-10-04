/**
 * PHASE 27 — MACRO REGIME DATA PROVIDER
 * =====================================
 * Bridges the read-only Phase 27 persistence layer (MacroRepository) into the
 * deterministic Phase 27 domain contracts.
 *
 * REAL DATA ONLY: every value originates from persisted `macro_observations`
 * rows. No hardcoded / "canonical" datasets, no frozen samples, no synthetic
 * fallbacks. An empty or unreachable store yields an empty observation set,
 * and the orchestrator fails closed to UNKNOWN / UNAVAILABLE.
 */

import { MacroRepository, type MacroObservationRow } from '../../lib/db/MacroRepository.ts';
import type {
  DataFreshnessStatus,
  MacroFrequency,
  MacroObservation,
  MacroRegimeSnapshot,
  MacroSourceTier,
  MacroValidationStatus,
} from '../../lib/macro-regime/index.ts';
import type { NewMacroRegimeSnapshotRow } from '../../lib/db/MacroRepository.ts';

export interface MacroRegimeDataRequest {
  readonly asOfDate: string;
}

export interface MacroRegimeDataResult {
  readonly observations: readonly MacroObservation[];
  readonly issues: readonly string[];
}

export interface MacroRegimeDataSource {
  fetchObservations(request: MacroRegimeDataRequest): Promise<MacroRegimeDataResult>;
}

const SOURCE_TIERS: readonly MacroSourceTier[] = [
  'TIER_1_STATUTORY',
  'TIER_2_EXCHANGE',
  'TIER_3_SECONDARY',
  'TIER_4_UNVERIFIED',
];
const VALIDATION_STATUSES: readonly MacroValidationStatus[] = ['VALID', 'PROVISIONAL', 'SUSPECT', 'INVALID'];
const FREQUENCIES: readonly MacroFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'EVENT_DRIVEN'];
const FRESHNESS_STATUSES: readonly DataFreshnessStatus[] = ['CURRENT', 'STALE', 'UNAVAILABLE', 'INVALID'];

function finiteNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Maps one persisted row to a domain observation; null when the row is unusable. */
function toDomainObservation(row: MacroObservationRow): MacroObservation | null {
  if (!SOURCE_TIERS.includes(row.sourceTier as MacroSourceTier)) return null;
  if (!VALIDATION_STATUSES.includes(row.validationStatus as MacroValidationStatus)) return null;
  if (!FREQUENCIES.includes(row.frequency as MacroFrequency)) return null;
  if (!FRESHNESS_STATUSES.includes(row.freshnessStatus as DataFreshnessStatus)) return null;
  if (!row.metricCode || !row.observationDate || !row.publicationDate) return null;
  return {
    metricCode: row.metricCode,
    observationDate: row.observationDate,
    publicationDate: row.publicationDate,
    retrievalDate: row.retrievalDate,
    value: finiteNumber(row.value),
    unit: row.unit,
    source: row.source,
    sourceTier: row.sourceTier as MacroSourceTier,
    revisionVersion: row.revisionVersion ?? 0,
    frequency: row.frequency as MacroFrequency,
    periodId: row.periodId,
    validationStatus: row.validationStatus as MacroValidationStatus,
    freshnessStatus: row.freshnessStatus as DataFreshnessStatus,
    notes: row.notes,
  };
}

/** Real database-backed data source. Reads `macro_observations` as-of a date. */
export class DrizzleMacroRegimeDataSource implements MacroRegimeDataSource {
  async fetchObservations(request: MacroRegimeDataRequest): Promise<MacroRegimeDataResult> {
    const rows = await MacroRepository.getObservationsAsOf(request.asOfDate);
    const observations: MacroObservation[] = [];
    const issues: string[] = [];
    for (const row of rows) {
      const mapped = toDomainObservation(row);
      if (mapped) observations.push(mapped);
      else issues.push(`Skipped unmappable macro_observations row id=${row.id} metric=${row.metricCode}`);
    }
    if (observations.length === 0) {
      issues.push(
        `No persisted macro observations available as of ${request.asOfDate} (fail-closed: regime UNKNOWN).`
      );
    }
    return { observations, issues };
  }
}

/** Serializes a computed snapshot to a persistence row (append-only). */
export function toSnapshotRow(snapshot: MacroRegimeSnapshot): NewMacroRegimeSnapshotRow {
  return {
    snapshotId: snapshot.snapshotId,
    asOfDate: snapshot.asOfDate,
    publicationCutoffDate: snapshot.publicationCutoffDate,
    evaluatedAt: new Date(snapshot.evaluatedAt),
    macroRegime: snapshot.macroRegime,
    growthState: snapshot.growthState,
    inflationState: snapshot.inflationState,
    monetaryState: snapshot.monetaryState,
    externalSectorState: snapshot.externalSectorState,
    financialConditionsState: snapshot.financialConditionsState,
    dataCoverage: snapshot.dataCoverage,
    confidencePercent: String(snapshot.confidencePercent),
    classificationVersion: snapshot.classificationVersion,
    diagnostics: JSON.stringify(snapshot.diagnostics),
    transition: JSON.stringify(snapshot.transition),
    rationaleVi: snapshot.rationaleVi,
    dataFreshness: snapshot.dataFreshness,
    lookaheadRejected: snapshot.lookaheadRejected,
  };
}
