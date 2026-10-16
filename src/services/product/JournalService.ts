import {
  JournalEngine,
  type JournalEntry,
  type CreateJournalEntryInput,
} from '../../lib/product/journal/JournalEngine.ts';
import type { DecisionObject, DecisionReview } from '../../lib/decision/types.ts';

const STORAGE_KEY = 'vnstock_product_journal_v1';

function readStorage(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: JournalEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export class JournalService {
  public static list(): readonly JournalEntry[] {
    return readStorage();
  }

  public static get(id: string): JournalEntry | null {
    const list = readStorage();
    return list.find((e) => e.id === id) ?? null;
  }

  public static create(input: CreateJournalEntryInput): JournalEntry {
    const entry = JournalEngine.create(input);
    const list = readStorage();
    const filtered = list.filter((e) => e.id !== entry.id);
    filtered.push(entry);
    writeStorage(filtered);
    return entry;
  }

  public static activate(id: string, nowIso?: string): JournalEntry | null {
    const list = readStorage();
    const entry = list.find((e) => e.id === id);
    if (!entry) return null;
    const time = nowIso ?? new Date().toISOString();
    const updated = JournalEngine.activate(entry, time);
    const filtered = list.map((e) => (e.id === id ? updated : e));
    writeStorage(filtered);
    return updated;
  }

  public static attachSnapshot(id: string, snapshot: DecisionObject, nowIso?: string): JournalEntry | null {
    const list = readStorage();
    const entry = list.find((e) => e.id === id);
    if (!entry) return null;
    const time = nowIso ?? new Date().toISOString();
    const updated = JournalEngine.attachDecisionSnapshot(entry, snapshot, time);
    const filtered = list.map((e) => (e.id === id ? updated : e));
    writeStorage(filtered);
    return updated;
  }

  public static markReviewDue(id: string, reviewDate: string, nowIso?: string): JournalEntry | null {
    const list = readStorage();
    const entry = list.find((e) => e.id === id);
    if (!entry) return null;
    const time = nowIso ?? new Date().toISOString();
    const updated = JournalEngine.markReviewDue(entry, reviewDate, time);
    const filtered = list.map((e) => (e.id === id ? updated : e));
    writeStorage(filtered);
    return updated;
  }

  public static buildAndAttachSnapshot(
    id: string,
    params: {
      proposedType: any;
      direction: any;
      evidence: any;
      asOfDate: string;
      at?: string;
    }
  ): JournalEntry | null {
    const list = readStorage();
    const entry = list.find((e) => e.id === id);
    if (!entry) return null;
    const time = params.at ?? new Date().toISOString();
    const snapshot: DecisionObject = {
      decisionId: `dec-${Date.now()}`,
      instrumentId: entry.symbol,
      decisionType: params.proposedType,
      direction: params.direction,
      asOfDate: params.asOfDate,
      evidence: [params.evidence],
      decisionStatus: 'ACTIVE',
      createdAt: time,
      version: '1.0.0',
    } as any;
    return this.attachSnapshot(id, snapshot, time);
  }

  public static addReview(id: string, review: DecisionReview, nowIso?: string): JournalEntry | null {

    const list = readStorage();
    const entry = list.find((e) => e.id === id);
    if (!entry) return null;
    const time = nowIso ?? new Date().toISOString();
    const updated = {
      ...entry,
      reviews: [...entry.reviews, review],
      updatedAt: time,
    };
    const filtered = list.map((e) => (e.id === id ? updated : e));
    writeStorage(filtered);
    return updated;
  }

  public static close(id: string, nowIso?: string): JournalEntry | null {
    const list = readStorage();
    const entry = list.find((e) => e.id === id);
    if (!entry) return null;
    const time = nowIso ?? new Date().toISOString();
    const updated = JournalEngine.close(entry, time);
    const filtered = list.map((e) => (e.id === id ? updated : e));
    writeStorage(filtered);
    return updated;
  }


  public static delete(id: string): boolean {
    const list = readStorage();
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length !== list.length) {
      writeStorage(filtered);
      return true;
    }
    return false;
  }
}
