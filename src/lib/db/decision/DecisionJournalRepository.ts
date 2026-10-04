/**
 * DECISION OS REPOSITORIES — journal persistence (append-only).
 * Decisions + reviews are never rewritten: inserts only, unique ids,
 * status changes recorded as new rows where applicable.
 */
import { db } from '../../../db/index.ts';
import { decisionJournal, decisionReviews } from '../../../db/schema.ts';
import type { DecisionObject, DecisionReview } from '../../decision/index.ts';

export class DecisionJournalRepository {
  static async recordDecision(d: DecisionObject): Promise<void> {
    if (!db) return;
    await db
      .insert(decisionJournal)
      .values({
        decisionId: d.decisionId,
        instrumentId: d.instrumentId,
        asOfDate: d.asOfDate,
        decisionType: d.decisionType,
        decisionStatus: d.decisionStatus,
        evidence: JSON.stringify(d.evidence),
        thesisId: d.thesisId,
        confidence: d.confidence !== null && d.confidence !== undefined ? String(d.confidence) : null,
        dataQuality: d.dataQuality,
        provenance: JSON.stringify(d.provenance),
        failCode: d.failCode,
        notes: JSON.stringify(d.notes),
        version: d.version,
      })
      .onConflictDoNothing({ target: decisionJournal.decisionId });
  }

  static async recordReview(r: DecisionReview): Promise<void> {
    if (!db) return;
    await db
      .insert(decisionReviews)
      .values({
        reviewId: r.reviewId,
        decisionId: r.decisionId,
        originalDecision: r.originalDecision,
        originalEvidence: JSON.stringify(r.originalEvidence),
        actualOutcome: r.actualOutcome,
        whatChanged: JSON.stringify(r.whatChanged),
        whatWasCorrect: JSON.stringify(r.whatWasCorrect),
        whatWasWrong: JSON.stringify(r.whatWasWrong),
        lessons: JSON.stringify(r.lessons),
        newDecision: r.newDecision,
        reviewedAt: new Date(r.reviewedAt),
      })
      .onConflictDoNothing({ target: decisionReviews.reviewId });
  }
}
