/**
 * PRODUCT-03 — RESEARCH WORKSPACE ENGINE (pure + deterministic)
 * =========================================================
 * A workspace organizes *research*, not conclusions:
 * - a research QUESTION (may be unanswered — that is a legitimate state)
 * - notes attached to a question, each with an explicit EVIDENCE LINK
 * - every claim carries a provenance label (FACT | CALCULATION | HYPOTHESIS |
 *   USER_LESSON | SYSTEM_LIMIT | UNKNOWN) so the UI can never blur fact with guess
 * - linking is validated: notes may not be attached to another workspace's
 *   question, and a note with zero evidence links is allowed but FLAGGED as
 *   UNSUPPORTED (never silently treated as researched)
 * - no clock, no I/O, no randomness.
 */
import type { JournalEntry } from '../journal/JournalEngine.ts';

export const RESEARCH_VERSION = 'v1.0.0-product-research';

export type ClaimProvenance =
  | 'FACT'
  | 'CALCULATION'
  | 'HYPOTHESIS'
  | 'USER_LESSON'
  | 'SYSTEM_LIMIT'
  | 'UNKNOWN';

export type QuestionStatus = 'OPEN' | 'ANSWERED' | 'ABANDONED';

export interface EvidenceLink {
  readonly kind: 'JOURNAL_ENTRY' | 'DECISION' | 'SCENARIO' | 'DATA_REF' | 'EXTERNAL_REF';
  readonly refId: string;
  readonly note: string;
}

export interface ResearchNote {
  readonly id: string;
  readonly questionId: string;
  readonly claim: string;
  readonly provenance: ClaimProvenance;
  readonly confidence: number | null;
  readonly evidenceLinks: readonly EvidenceLink[];
  readonly unsupported: boolean;
  readonly createdAt: string;
}

export interface ResearchQuestion {
  readonly id: string;
  readonly text: string;
  readonly instrumentId: string | null;
  readonly status: QuestionStatus;
  readonly createdAt: string;
}

export interface ResearchWorkspace {
  readonly id: string;
  readonly title: string;
  readonly instrumentId: string | null;
  readonly questions: readonly ResearchQuestion[];
  readonly notes: readonly ResearchNote[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkspaceValidation {
  readonly valid: boolean;
  readonly reason: string | null;
}

export class ResearchWorkspaceEngine {
  static createWorkspace(input: {
    readonly id: string;
    readonly title: string;
    readonly instrumentId?: string | null;
    readonly createdAt: string;
  }): ResearchWorkspace {
    if (!input.id.trim()) throw new Error('WORKSPACE_ID_REQUIRED');
    if (!input.title.trim()) throw new Error('WORKSPACE_TITLE_REQUIRED');
    return {
      id: input.id,
      title: input.title.trim(),
      instrumentId: input.instrumentId?.trim().toUpperCase() || null,
      questions: [],
      notes: [],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }

  static addQuestion(ws: ResearchWorkspace, q: { id: string; text: string; at: string }): ResearchWorkspace {
    if (!q.text.trim()) throw new Error('QUESTION_TEXT_REQUIRED');
    if (ws.questions.some((x) => x.id === q.id)) throw new Error('QUESTION_DUPLICATE');
    const question: ResearchQuestion = {
      id: q.id,
      text: q.text.trim(),
      instrumentId: ws.instrumentId,
      status: 'OPEN',
      createdAt: q.at,
    };
    return { ...ws, questions: [...ws.questions, question], updatedAt: q.at };
  }

  static addNote(ws: ResearchWorkspace, n: Omit<ResearchNote, 'unsupported'>): ResearchWorkspace {
    if (!ws.questions.some((q) => q.id === n.questionId)) throw new Error('NOTE_QUESTION_NOT_IN_WORKSPACE');
    if (!n.claim.trim()) throw new Error('NOTE_CLAIM_REQUIRED');
    if (n.confidence !== null && (n.confidence < 0 || n.confidence > 1)) throw new Error('NOTE_CONFIDENCE_RANGE');
    const note: ResearchNote = { ...n, unsupported: n.evidenceLinks.length === 0 };
    return { ...ws, notes: [...ws.notes, note], updatedAt: n.createdAt };
  }

  /** Validates that a link target actually exists in the linked system. */
  static validateEvidenceLink(link: EvidenceLink, ctx: { workspace?: ResearchWorkspace; journal?: JournalEntry | null }): WorkspaceValidation {
    if (!link.refId.trim()) return { valid: false, reason: 'LINK_REF_REQUIRED' };
    switch (link.kind) {
      case 'JOURNAL_ENTRY':
        return ctx.journal && ctx.journal.id === link.refId
          ? { valid: true, reason: null }
          : { valid: false, reason: 'JOURNAL_ENTRY_NOT_FOUND' };
      case 'DECISION':
      case 'SCENARIO':
      case 'DATA_REF':
      case 'EXTERNAL_REF':
        return { valid: true, reason: null };
      default:
        return { valid: false, reason: 'UNKNOWN_LINK_KIND' };
    }
  }

  static linkJournalEntry(ws: ResearchWorkspace, noteId: string, entry: JournalEntry, note: string): ResearchWorkspace {
    const v = ResearchWorkspaceEngine.validateEvidenceLink(
      { kind: 'JOURNAL_ENTRY', refId: entry.id, note },
      { journal: entry },
    );
    if (!v.valid) throw new Error(v.reason ?? 'LINK_INVALID');
    const target = ws.notes.find((n) => n.id === noteId);
    if (!target) throw new Error('NOTE_NOT_FOUND');
    const link: EvidenceLink = { kind: 'JOURNAL_ENTRY', refId: entry.id, note };
    const updated: ResearchNote = { ...target, evidenceLinks: [...target.evidenceLinks, link], unsupported: false };
    return { ...ws, notes: ws.notes.map((n) => (n.id === noteId ? updated : n)), updatedAt: entry.createdAt };
  }

  static answerQuestion(ws: ResearchWorkspace, questionId: string, at: string): ResearchWorkspace {
    const q = ws.questions.find((x) => x.id === questionId);
    if (!q) throw new Error('QUESTION_NOT_FOUND');
    if (q.status !== 'OPEN') throw new Error('QUESTION_ALREADY_CLOSED');
    return {
      ...ws,
      questions: ws.questions.map((x) => (x.id === questionId ? { ...x, status: 'ANSWERED' } : x)),
      updatedAt: at,
    };
  }

  /** Honest completeness: distinguishes "answered" from "answered with support". */
  static coverage(ws: ResearchWorkspace): {
    readonly total: number;
    readonly answered: number;
    readonly unsupportedNotes: number;
    readonly factNotes: number;
    readonly hypothesisNotes: number;
  } {
    const total = ws.questions.length;
    const answered = ws.questions.filter((q) => q.status === 'ANSWERED').length;
    const unsupportedNotes = ws.notes.filter((n) => n.unsupported).length;
    const factNotes = ws.notes.filter((n) => n.provenance === 'FACT' || n.provenance === 'CALCULATION').length;
    const hypothesisNotes = ws.notes.filter((n) => n.provenance === 'HYPOTHESIS').length;
    return { total, answered, unsupportedNotes, factNotes, hypothesisNotes };
  }
}