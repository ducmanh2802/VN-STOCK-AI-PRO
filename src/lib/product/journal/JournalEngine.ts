export interface CreateJournalEntryInput {
  id: string;
  symbol: string;
  title: string;
  thesis?: any;
  confidence?: number | null;
  timeHorizon?: string | null;
  entryDate: string;
  reviewDate?: string | null;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  title: string;
  status: 'DRAFT' | 'ACTIVE' | 'REVIEW_DUE' | 'REVIEWED' | 'CLOSED';
  entryType: string;
  thesis?: any;
  confidence?: number | null;
  timeHorizon?: string | null;
  entryDate: string;
  reviewDate?: string | null;
  decisionSnapshot?: any;
  reviews: any[];
  createdAt: string;
  updatedAt?: string;
}

export class JournalEngine {
  public static create(input: CreateJournalEntryInput): JournalEntry {
    return {
      id: input.id,
      symbol: input.symbol.trim().toUpperCase(),
      title: input.title.trim(),
      status: 'DRAFT',
      entryType: 'MANUAL',
      thesis: input.thesis,
      confidence: input.confidence ?? null,
      timeHorizon: input.timeHorizon ?? null,
      entryDate: input.entryDate,
      reviewDate: input.reviewDate ?? null,
      reviews: [],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }

  public static activate(entry: JournalEntry, time: string): JournalEntry {
    return {
      ...entry,
      status: 'ACTIVE',
      updatedAt: time,
    };
  }

  public static attachDecisionSnapshot(entry: JournalEntry, snapshot: any, time: string): JournalEntry {
    return {
      ...entry,
      decisionSnapshot: snapshot,
      updatedAt: time,
    };
  }

  public static markReviewDue(entry: JournalEntry, reviewDate: string, time: string): JournalEntry {
    return {
      ...entry,
      status: 'REVIEW_DUE',
      reviewDate,
      updatedAt: time,
    };
  }

  public static close(entry: JournalEntry, time: string): JournalEntry {
    return {
      ...entry,
      status: 'CLOSED',
      updatedAt: time,
    };
  }

  public static assessQuality(isCorrect: boolean | null, isGoodOutcome: boolean | null): string {
    if (isCorrect === true && isGoodOutcome === true) return 'HIGH (Disciplined & Profitable)';
    if (isCorrect === true && isGoodOutcome === false) return 'GOOD_PROCESS (Sound thesis, adverse variance)';
    if (isCorrect === false && isGoodOutcome === true) return 'LUCKY (Faulty thesis, fortuitous gain)';
    if (isCorrect === false && isGoodOutcome === false) return 'POOR (Flawed execution & outcome)';
    return 'UNEVALUATED';
  }

  public static compareThesisVsOutcome(entry: JournalEntry): { lessons: string[] } {
    const allLessons: string[] = [];
    for (const r of entry.reviews || []) {
      if (Array.isArray(r.lessons)) {
        allLessons.push(...r.lessons);
      }
    }
    return { lessons: allLessons };
  }
}
