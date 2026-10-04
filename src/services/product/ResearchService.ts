/**
 * PRODUCT-03 — RESEARCH WORKSPACE SERVICE (application orchestration)
 * Owns workspace persistence; all rules stay in ResearchWorkspaceEngine.
 */
import {
  ResearchWorkspaceEngine,
  type EvidenceLink,
  type ResearchNote,
  type ResearchWorkspace,
  RESEARCH_VERSION,
} from '../../lib/product/research/ResearchWorkspaceEngine.ts';
import { journalStore } from '../../lib/product/journal/JournalStore.ts';

const KEY = `vnstock_product_research_v1:${RESEARCH_VERSION}`;

function read(): ResearchWorkspace[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ResearchWorkspace[]) : [];
  } catch {
    return [];
  }
}

function write(list: readonly ResearchWorkspace[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export const ResearchService = {
  list(): ResearchWorkspace[] {
    return read().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },
  get(id: string): ResearchWorkspace | null {
    return read().find((w) => w.id === id) ?? null;
  },
  create(input: { id: string; title: string; instrumentId?: string | null; at: string }): ResearchWorkspace {
    const ws = ResearchWorkspaceEngine.createWorkspace({ ...input, createdAt: input.at });
    write([...read(), ws]);
    return ws;
  },
  addQuestion(wsId: string, q: { id: string; text: string; at: string }): ResearchWorkspace | null {
    const ws = ResearchService.get(wsId);
    if (!ws) return null;
    const next = ResearchWorkspaceEngine.addQuestion(ws, q);
    write(read().map((w) => (w.id === wsId ? next : w)));
    return next;
  },
  addNote(
    wsId: string,
    n: Omit<ResearchNote, 'unsupported'>,
  ): ResearchWorkspace | null {
    const ws = ResearchService.get(wsId);
    if (!ws) return null;
    const next = ResearchWorkspaceEngine.addNote(ws, n);
    write(read().map((w) => (w.id === wsId ? next : w)));
    return next;
  },
  /** Fails loudly when the referenced journal entry does not exist. */
  linkJournal(wsId: string, noteId: string, journalId: string, note: string): ResearchWorkspace | null {
    const ws = ResearchService.get(wsId);
    const entry = journalStore.get(journalId);
    if (!ws || !entry) return null;
    const next = ResearchWorkspaceEngine.linkJournalEntry(ws, noteId, entry, note);
    write(read().map((w) => (w.id === wsId ? next : w)));
    return next;
  },
  answer(wsId: string, questionId: string, at: string): ResearchWorkspace | null {
    const ws = ResearchService.get(wsId);
    if (!ws) return null;
    const next = ResearchWorkspaceEngine.answerQuestion(ws, questionId, at);
    write(read().map((w) => (w.id === wsId ? next : w)));
    return next;
  },
  coverage(wsId: string): ReturnType<typeof ResearchWorkspaceEngine.coverage> | null {
    const ws = ResearchService.get(wsId);
    return ws ? ResearchWorkspaceEngine.coverage(ws) : null;
  },
  validateLink(link: EvidenceLink): boolean {
    const entry = link.kind === 'JOURNAL_ENTRY' ? journalStore.get(link.refId) : null;
    return ResearchWorkspaceEngine.validateEvidenceLink(link, { journal: entry }).valid;
  },
};