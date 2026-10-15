/**
 * PRODUCT-01 — INVESTMENT JOURNAL ENGINE (product orchestration, pure + deterministic)
 * =============================================================================
 * The journal is the user's historical record (thought → evidence → decision →
 * snapshot → review → lesson). It ORCHESTRATES certified Decision OS engines
 * (ThesisEngine, DecisionChainBuilder types, ReviewEngine) and NEVER duplicates
 * their logic. Decision snapshots are deep-frozen copies: later market data can
 * never silently rewrite history.
 */
import { ReviewEngine, type CreateReviewInput } from '../../decision/MonitoringEngine.ts';
import { ThesisEngine, type CreateThesisInput } from '../../decision/ThesisEngine.ts';
import type { DecisionObject, DecisionReview, EvidenceRef, InvestmentThesis } from '../../decision/types.ts';

export type JournalEntryType = 'THESIS' | 'DECISION' | 'REVIEW' | 'NOTE';
export type JournalStatus = 'DRAFT' | 'ACTIVE' | 'REVIEW_DUE' | 'REVIEWED' | 'CLOSED';
export type DecisionQuality = 'GOOD_DECISION_GOOD_OUTCOME' | 'GOOD_DECISION_BAD_OUTCOME' | 'BAD_DECISION_GOOD_OUTCOME' | 'BAD_DECISION_BAD_OUTCOME' | 'UNASSESSED';

export interface JournalEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly symbol: string;
  readonly assetClass: string;
  readonly entryType: JournalEntryType;
  readonly status: JournalStatus;
  readonly title: string;
  readonly summary: string;
  readonly thesis: InvestmentThesis | null;
  /** Deep-frozen copy of the DecisionObject at decision time. Never recomputed. */
  readonly decisionSnapshot: DecisionObject | null;
  readonly decisionStatus: string;
  readonly confidence: number | null;
  readonly timeHorizon: string | null;
  readonly entryDate: string;
  readonly reviewDate: string | null;
  readonly tags: readonly string[];
  readonly notes: readonly string[];
  readonly reviews: readonly DecisionReview[];
  readonly version: string;
}

export const JOURNAL_VERSION = 'v1.0.0-product-journal';

export interface CreateJournalEntryInput {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass?: string;
  readonly entryType?: JournalEntryType;
  readonly title: string;
  readonly summary?: string;
  readonly thesis?: CreateThesisInput | null;
  readonly confidence?: number | null;
  readonly timeHorizon?: string | null;
  readonly entryDate: string;
  readonly reviewDate?: string | null;
  readonly tags?: readonly string[];
  readonly notes?: readonly string[];
  readonly createdAt: string;
}

function freeze<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class JournalEngine {
  static create(input: CreateJournalEntryInput): JournalEntry {
    const symbol = (input.symbol || '').trim().toUpperCase();
    if (!symbol) throw new Error('JOURNAL_SYMBOL_REQUIRED');
    if (!input.title || !input.title.trim()) throw new Error('JOURNAL_TITLE_REQUIRED');
    if (!input.entryDate) throw new Error('JOURNAL_ENTRY_DATE_REQUIRED');
    const thesis = input.thesis ? ThesisEngine.create(input.thesis) : null;
    return {
      id: input.id,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      symbol,
      assetClass: (input.assetClass || 'EQUITY').trim().toUpperCase(),
      entryType: input.entryType ?? (thesis ? 'THESIS' : 'NOTE'),
      status: 'DRAFT',
      title: input.title.trim(),
      summary: (input.summary ?? '').trim(),
      thesis,
      decisionSnapshot: null,
      decisionStatus: 'NONE',
      confidence: input.confidence ?? null,
      timeHorizon: input.timeHorizon ?? null,
      entryDate: input.entryDate,
      reviewDate: input.reviewDate ?? null,
      tags: [...(input.tags ?? [])],
      notes: [...(input.notes ?? [])],
      reviews: [],
      version: JOURNAL_VERSION,
    };
  }

  static activate(entry: JournalEntry, at: string): JournalEntry {
    if (entry.status !== 'DRAFT') throw new Error(`JOURNAL_INVALID_TRANSITION:${entry.status}->ACTIVE`);
    return { ...entry, status: 'ACTIVE', updatedAt: at };
  }

  /** Attach a deep-frozen snapshot of a certified DecisionObject. Original stays live; snapshot never changes. */
  static attachDecisionSnapshot(entry: JournalEntry, decision: DecisionObject, at: string): JournalEntry {
    if (entry.status !== 'ACTIVE' && entry.status !== 'DRAFT') {
      throw new Error(`JOURNAL_SNAPSHOT_REJECTED:${entry.status}`);
    }
    if (decision.instrumentId !== entry.symbol) throw new Error('JOURNAL_SYMBOL_MISMATCH');
    return {
      ...entry,
      entryType: 'DECISION',
      decisionSnapshot: freeze(decision),
      decisionStatus: decision.decisionStatus,
      updatedAt: at,
    };
  }

  static markReviewDue(entry: JournalEntry, reviewDate: string, at: string): JournalEntry {
    if (entry.status !== 'ACTIVE') throw new Error(`JOURNAL_REVIEW_DUE_REJECTED:${entry.status}`);
    return { ...entry, status: 'REVIEW_DUE', reviewDate, updatedAt: at };
  }

  /** Append-only review (ReviewEngine-validated). History is never rewritten. */
  static addReview(entry: JournalEntry, input: CreateReviewInput): JournalEntry {
    if (entry.status !== 'REVIEW_DUE' && entry.status !== 'ACTIVE') {
      throw new Error(`JOURNAL_REVIEW_REJECTED:${entry.status}`);
    }
    if (!entry.decisionSnapshot) throw new Error('JOURNAL_REVIEW_WITHOUT_SNAPSHOT');
    if (input.decisionId !== entry.decisionSnapshot.decisionId) throw new Error('JOURNAL_REVIEW_DECISION_MISMATCH');
    const review = ReviewEngine.create(input);
    return { ...entry, reviews: [...entry.reviews, review], status: 'REVIEWED', updatedAt: input.reviewedAt };
  }

  static close(entry: JournalEntry, at: string): JournalEntry {
    if (entry.status !== 'REVIEWED' && entry.status !== 'ACTIVE') {
      throw new Error(`JOURNAL_CLOSE_REJECTED:${entry.status}`);
    }
    return { ...entry, status: 'CLOSED', updatedAt: at };
  }

  /**
   * Decision-quality matrix: separates decision quality from outcome luck.
   * Caller asserts both sides explicitly — the engine never infers them.
   */
  static assessQuality(wasGoodDecision: boolean | null, wasGoodOutcome: boolean | null): DecisionQuality {
    if (wasGoodDecision === null || wasGoodOutcome === null) return 'UNASSESSED';
    if (wasGoodDecision && wasGoodOutcome) return 'GOOD_DECISION_GOOD_OUTCOME';
    if (wasGoodDecision) return 'GOOD_DECISION_BAD_OUTCOME';
    if (wasGoodOutcome) return 'BAD_DECISION_GOOD_OUTCOME';
    return 'BAD_DECISION_BAD_OUTCOME';
  }

  /** Thesis-vs-outcome comparison summary (explicit inputs only, no inference). */
  static compareThesisVsOutcome(entry: JournalEntry): {
    readonly hasThesis: boolean;
    readonly hasSnapshot: boolean;
    readonly reviewCount: number;
    readonly thesisStatus: string | null;
    readonly lessons: readonly string[];
  } {
    return {
      hasThesis: entry.thesis !== null,
      hasSnapshot: entry.decisionSnapshot !== null,
      reviewCount: entry.reviews.length,
      thesisStatus: entry.thesis?.status ?? null,
      lessons: entry.reviews.flatMap((r) => r.lessons),
    };
  }
}

export type { CreateReviewInput, CreateThesisInput, DecisionObject, DecisionReview, EvidenceRef, InvestmentThesis };
