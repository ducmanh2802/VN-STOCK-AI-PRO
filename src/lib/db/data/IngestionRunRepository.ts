/**
 * INGESTION RUN LEDGER REPOSITORY
 * ===============================
 * Persists `market_data_ingestion_runs` and `market_data_ingestion_symbol_results`.
 * STRICT: every method throws on database failure. A job that cannot record its run
 * must say so; it never reports a run it did not store.
 */
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import {
  marketDataIngestionRuns,
  marketDataIngestionSymbolResults,
  type IngestionRunMode,
  type IngestionRunStatus,
  type IngestionSymbolOutcome,
} from '../../../db/schema.ts';

export interface IngestionRunStart {
  readonly runId: string;
  readonly job: string;
  readonly mode: IngestionRunMode;
  readonly targetSession: string | null;
  readonly rangeFrom: string;
  readonly rangeTo: string;
  readonly expectedSymbols: number;
  readonly startedAt: Date;
}

export interface IngestionRunSummary {
  readonly status: Exclude<IngestionRunStatus, 'RUNNING'>;
  readonly completeSymbols: number;
  readonly missingSymbols: number;
  readonly failedSymbols: number;
  readonly barsInserted: number;
  readonly barsDuplicate: number;
  readonly barsRejected: number;
  readonly detail: string | null;
  readonly finishedAt: Date;
}

export interface IngestionSymbolResultRow {
  readonly symbol: string;
  readonly instrumentId: string;
  readonly outcome: IngestionSymbolOutcome;
  readonly attempts: number;
  readonly barsReceived: number;
  readonly barsInserted: number;
  readonly barsDuplicate: number;
  readonly barsRejected: number;
  readonly withheldInProgress: number;
  readonly missingSessions: number;
  readonly errorCode: string | null;
  readonly detail: string | null;
  readonly finishedAt: Date;
}

export type IngestionRunRecord = typeof marketDataIngestionRuns.$inferSelect;

export class IngestionRunRepository {
  /**
   * Closes RUNNING rows of `job` started before `startedBefore` as FAILED. Only called
   * while holding the job lock, so no live run can be among them.
   */
  static async markAbandoned(job: string, startedBefore: Date, now: Date): Promise<number> {
    const rows = await db
      .update(marketDataIngestionRuns)
      .set({ status: 'FAILED', detail: 'ABANDONED: the process running this job stopped before finishing.', finishedAt: now })
      .where(
        and(
          eq(marketDataIngestionRuns.job, job),
          eq(marketDataIngestionRuns.status, 'RUNNING'),
          lt(marketDataIngestionRuns.startedAt, startedBefore)
        )
      )
      .returning({ runId: marketDataIngestionRuns.runId });
    return rows.length;
  }

  static async startRun(start: IngestionRunStart): Promise<void> {
    await db.insert(marketDataIngestionRuns).values({ ...start, status: 'RUNNING' });
  }

  static async recordSymbolResults(runId: string, rows: readonly IngestionSymbolResultRow[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(marketDataIngestionSymbolResults).values(rows.map((r) => ({ ...r, runId })));
  }

  static async finishRun(runId: string, summary: IngestionRunSummary): Promise<void> {
    await db.update(marketDataIngestionRuns).set(summary).where(eq(marketDataIngestionRuns.runId, runId));
  }

  static async latestRuns(job: string, limit = 10): Promise<IngestionRunRecord[]> {
    return db
      .select()
      .from(marketDataIngestionRuns)
      .where(eq(marketDataIngestionRuns.job, job))
      .orderBy(desc(marketDataIngestionRuns.startedAt))
      .limit(limit);
  }

  static async latestRunWithStatus(job: string, status: IngestionRunStatus): Promise<IngestionRunRecord | null> {
    const [row] = await db
      .select()
      .from(marketDataIngestionRuns)
      .where(and(eq(marketDataIngestionRuns.job, job), eq(marketDataIngestionRuns.status, status)))
      .orderBy(desc(marketDataIngestionRuns.startedAt))
      .limit(1);
    return row ?? null;
  }

  static async symbolResults(runId: string) {
    return db
      .select()
      .from(marketDataIngestionSymbolResults)
      .where(eq(marketDataIngestionSymbolResults.runId, runId))
      .orderBy(marketDataIngestionSymbolResults.symbol);
  }
}
