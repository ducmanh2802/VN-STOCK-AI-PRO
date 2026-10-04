/**
 * PRODUCT-01 — JOURNAL STORE (persistence boundary, DB-ready interface)
 * =====================================================================
 * Local single-learner persistence behind an interface shaped for the existing
 * `decision_journal` / `decision_reviews` tables (drizzle/0004, src/db/schema.ts):
 * entry.id        <-> decision_journal.decision_id (journal-level id)
 * snapshot        <-> immutable JSON of the certified DecisionObject
 * reviews[]       <-> decision_reviews rows (append-only)
 * A future LearningRepository-style repository can implement IJournalStore
 * without changing callers. Fail-safe reads: corrupt state degrades to empty.
 */
import type { JournalEntry } from './JournalEngine.ts';

export interface IJournalStore {
  list(): JournalEntry[];
  get(id: string): JournalEntry | null;
  save(entry: JournalEntry): void;
  remove(id: string): void;
  reset(): void;
}

const JOURNAL_KEY = 'vnstock_product_journal_v1';

function readArr(key: string): JournalEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function writeArr(key: string, value: JournalEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // fail-safe: persistence loss is acceptable, never crash product UI
  }
}

export class LocalJournalStore implements IJournalStore {
  private readonly pfx: string;
  constructor(learnerId = 'local') {
    const id = (learnerId || 'local').trim() || 'local';
    this.pfx = id === 'local' ? '' : `${id}:`;
  }
  private k(): string {
    return `${this.pfx}${JOURNAL_KEY}`;
  }
  list(): JournalEntry[] {
    return readArr(this.k()).filter((e) => e && typeof e.id === 'string');
  }
  get(id: string): JournalEntry | null {
    return this.list().find((e) => e.id === id) ?? null;
  }
  save(entry: JournalEntry): void {
    const all = this.list().filter((e) => e.id !== entry.id);
    all.push(entry);
    writeArr(this.k(), all);
  }
  remove(id: string): void {
    writeArr(this.k(), this.list().filter((e) => e.id !== id));
  }
  reset(): void {
    writeArr(this.k(), []);
  }
}

export const journalStore = new LocalJournalStore();
