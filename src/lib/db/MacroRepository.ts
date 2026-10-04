/**
 * PHASE 27 — MACRO REPOSITORY
 * ============================
 * Persistence access for the Phase 27 macro tables (`macro_observations`,
 * `macro_regime_snapshots`).
 *
 * SAFETY:
 *   - Reads return raw persisted rows (or empty arrays); mapping to the
 *     Phase 27 domain contracts and all fail-closed decisions live in the
 *     service/provider layer so provenance stays traceable.
 *   - Snapshot appends are insert-only with onConflictDoNothing on the
 *     snapshot identity; history is never overwritten.
 *   - No synthetic seeds, no fallbacks, no default "canonical" datasets.
 */

import { desc, lte } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { macroObservations, macroRegimeSnapshots } from '../../db/schema.ts';

export type MacroObservationRow = InferSelectModel<typeof macroObservations>;
export type MacroRegimeSnapshotRow = InferSelectModel<typeof macroRegimeSnapshots>;
export type NewMacroRegimeSnapshotRow = InferInsertModel<typeof macroRegimeSnapshots>;

export class MacroRepository {
  /**
   * Observations published at or before `asOfDate`, newest revision first
   * per (metric, observation date). Empty array when nothing was ingested.
   */
  static async getObservationsAsOf(asOfDate: string): Promise<MacroObservationRow[]> {
    return db
      .select()
      .from(macroObservations)
      .where(lte(macroObservations.publicationDate, asOfDate))
      .orderBy(desc(macroObservations.observationDate), desc(macroObservations.revisionVersion));
  }

  /** Latest persisted regime snapshot at or before `asOfDate`, if any. */
  static async getLatestSnapshot(asOfDate: string): Promise<MacroRegimeSnapshotRow | null> {
    const rows = await db
      .select()
      .from(macroRegimeSnapshots)
      .where(lte(macroRegimeSnapshots.asOfDate, asOfDate))
      .orderBy(desc(macroRegimeSnapshots.asOfDate))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Appends a regime snapshot row. Returns the inserted row, or null when the
   * snapshot identity already exists (idempotent retry). Never updates.
   */
  static async appendSnapshot(record: NewMacroRegimeSnapshotRow): Promise<MacroRegimeSnapshotRow | null> {
    const inserted = await db
      .insert(macroRegimeSnapshots)
      .values(record)
      .onConflictDoNothing({ target: [macroRegimeSnapshots.snapshotId] })
      .returning();
    return inserted[0] ?? null;
  }

  /** True when at least one observation row exists (ingestion health check). */
  static async hasObservations(): Promise<boolean> {
    const rows = await db.select({ id: macroObservations.id }).from(macroObservations).limit(1);
    return rows.length > 0;
  }
}
