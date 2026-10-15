/**
 * PAPER REPLAY REPOSITORY — append-only replay journal.
 * Replay results are never rewritten; manifest fingerprint + result
 * fingerprint are stored for reproducibility proofs.
 */
import { db } from '../../../db/index.ts';
import { replayRuns } from '../../../db/schema.ts';
import type { ReplayManifest, ReplayResult } from '../../replay/index.ts';

export class ReplayRepository {
  static async record(r: ReplayResult, manifest: ReplayManifest): Promise<void> {
    if (!db) return;
    await db
      .insert(replayRuns)
      .values({
        replayId: r.replayId,
        mode: manifest.mode,
        status: r.status,
        manifestFingerprint: r.fingerprint,
        manifest: JSON.stringify(manifest),
        startDate: r.startDate,
        endDate: r.endDate,
        initialCapital: String(r.initialCapital),
        finalNav: String(r.finalNAV),
        returnPct: r.returnPct !== null && r.returnPct !== undefined ? String(r.returnPct) : null,
        strategyTradeCount: r.strategyTradeCount,
        riskRejectionCount: r.riskRejectionCount,
        executionRejectionCount: r.executionRejectionCount,
        filledQuantity: r.filledQuantity,
        accountingStatus: r.accountingStatus,
        reconciliationStatus: r.reconciliationStatus,
        limitations: JSON.stringify(r.limitations),
      })
      .onConflictDoNothing({ target: replayRuns.replayId });
  }
}