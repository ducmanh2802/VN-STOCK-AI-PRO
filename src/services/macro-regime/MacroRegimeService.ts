/**
 * PHASE 27 — MACRO REGIME SERVICE
 * ================================
 * Production orchestrator service providing cached, real-data-first Macroeconomic
 * Regime Intelligence with strict publication-date lookahead protection.
 *
 * INVARIANTS:
 *   - In-memory 60s TTL cache (MACRO_REGIME_CACHE_TTL_MS = 60_000)
 *   - Strict fail-closed: If critical statutory inputs are missing, flags UNKNOWN
 *   - Zero mock data; all statutory indicators carry verified source provenance
 */

import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import {
  MacroRegimeOrchestrator,
  type MacroObservation,
  type MacroRegimeSnapshot,
} from '../../lib/macro-regime/index.ts';
import {
  DrizzleMacroRegimeDataSource,
  toSnapshotRow,
  type MacroRegimeDataSource,
} from './MacroRegimeDataProvider.ts';
import { MacroRepository } from '../../lib/db/MacroRepository.ts';

const CACHE_KEY_PREFIX = 'MACRO_REGIME_SNAPSHOT';
const CACHE_TTL_MS = 60_000; // 60s cache

export interface GetMacroRegimeSnapshotOptions {
  readonly asOfDate?: string;
  readonly forceRefresh?: boolean;
  readonly observationsOverride?: readonly MacroObservation[];
  /** Injected real-data source (defaults to the DB-backed provider). */
  readonly dataSource?: MacroRegimeDataSource;
}

export class MacroRegimeService {
  private static readonly defaultDataSource: MacroRegimeDataSource = new DrizzleMacroRegimeDataSource();

  /**
   * Retrieves or builds the canonical MacroRegimeSnapshot.
   *
   * REAL DATA ONLY (P27-D2): observations resolve through the injected data
   * source (default: persisted `macro_observations`). An empty or unreachable
   * store yields an empty observation set and the orchestrator fails closed
   * to UNKNOWN / UNAVAILABLE — frozen samples are never served as production
   * data.
   */
  public static async getSnapshot(
    options?: GetMacroRegimeSnapshotOptions
  ): Promise<MacroRegimeSnapshot> {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `${CACHE_KEY_PREFIX}_${asOfDate}`;

    if (!options?.forceRefresh && !options?.observationsOverride) {
      const cached = cacheGet<MacroRegimeSnapshot>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const observations = options?.observationsOverride ?? (await this.resolveObservations(asOfDate, options?.dataSource));
    const snapshot = MacroRegimeOrchestrator.buildSnapshot({
      observations,
      asOfDate,
    });

    if (!options?.observationsOverride) {
      cacheSet(cacheKey, snapshot, CACHE_TTL_MS);
      // Best-effort persistence (P27-D8): snapshots with real content are
      // appended to `macro_regime_snapshots`. Failures never break reads, and
      // UNKNOWN snapshots (no content) are never persisted.
      if (snapshot.dataFreshness === 'CURRENT' || snapshot.dataFreshness === 'STALE') {
        await this.persistSnapshot(snapshot);
      }
    }
    return snapshot;
  }

  private static async resolveObservations(
    asOfDate: string,
    dataSource?: MacroRegimeDataSource
  ): Promise<readonly MacroObservation[]> {
    const source = dataSource ?? this.defaultDataSource;
    try {
      const result = await source.fetchObservations({ asOfDate });
      return result.observations;
    } catch {
      return [];
    }
  }

  private static async persistSnapshot(snapshot: MacroRegimeSnapshot): Promise<void> {
    try {
      await MacroRepository.appendSnapshot(toSnapshotRow(snapshot));
    } catch {
      // Best-effort only: persistence failures must never break snapshot reads.
    }
  }
}
