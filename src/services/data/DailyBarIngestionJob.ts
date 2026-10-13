/**
 * DAILY BAR INGESTION JOB (scheduled end-of-day + manual backfill)
 * ================================================================
 * Loads daily OHLCV for every supported symbol through the ONE authoritative write
 * path (`CanonicalMarketDataIngestionService.ingestBatch`) and measures completeness
 * against the database afterwards — success is never inferred from "no error".
 *
 * Modes (one job, separate entry points and separately labelled run records):
 *   SCHEDULED — target = the last FINAL session (`lastFinalizedSession`); fetches a
 *               short trailing window so a lagging provider is caught up next time.
 *               A symbol is COMPLETE when a VALID bar for the target session exists.
 *   BACKFILL / MANUAL — explicit [from, to]; a symbol is COMPLETE when every trading
 *               session in the range (up to the last final session) has a bar.
 *
 * Guarantees:
 *   - Idempotent: canonical writes are insert-if-absent; symbols already complete are
 *     not re-fetched on a scheduled run.
 *   - No overlap: an exclusive job lock (Postgres advisory lock in production) plus a
 *     partial unique index allowing one RUNNING row per job.
 *   - Bounded retries per symbol with backoff; a database outage aborts the run.
 *   - A run is COMPLETE only if EVERY expected symbol is complete; otherwise PARTIAL or
 *     FAILED. Nothing is synthesized for a missing bar.
 */
import { randomUUID } from 'node:crypto';
import { VIETNAM_STOCKS_UNIVERSE } from '../market/stockUniverse.ts';
import { asVnExchange, type VnExchange } from '../../lib/data/vnPriceLimits.ts';
import {
  addCalendarDays,
  isCalendarCovered,
  isVnTradingDay,
  lastFinalizedSession,
  vnLocalParts,
} from '../../lib/data/vnTradingCalendar.ts';
import type { DatabaseHealth } from '../../db/databaseHealth.ts';
import type { IngestionRunMode } from '../../db/schema.ts';
import type {
  IngestionRunStart,
  IngestionRunSummary,
  IngestionSymbolResultRow,
} from '../../lib/db/data/IngestionRunRepository.ts';
import type { CanonicalIngestionOptions, IngestReport, ProviderBatch } from './CanonicalMarketDataIngestionService.ts';
import { instrumentIdFor, type KbsDailyFetch } from './kbsDailyObservations.ts';

export const EOD_DAILY_BARS_JOB = 'EOD_DAILY_BARS';

/** Calendar days fetched behind the target session on a scheduled run. */
export const SCHEDULED_LOOKBACK_DAYS = 14;
/** A provider window longer than this is split; KBS rejects very long ranges. */
export const MAX_FETCH_WINDOW_DAYS = 180;
/** A RUNNING row older than this belongs to a dead process. */
export const ABANDONED_AFTER_MS = 2 * 60 * 60 * 1000;

export interface IngestionRunStore {
  markAbandoned(job: string, startedBefore: Date, now: Date): Promise<number>;
  startRun(start: IngestionRunStart): Promise<void>;
  recordSymbolResults(runId: string, rows: readonly IngestionSymbolResultRow[]): Promise<void>;
  finishRun(runId: string, summary: IngestionRunSummary): Promise<void>;
}

/** Acquires the exclusive job lock; resolves to a release function, or null if held. */
export type JobLock = () => Promise<(() => Promise<void>) | null>;

export interface DailyIngestionDeps {
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly health: () => Promise<DatabaseHealth>;
  readonly lock: JobLock;
  readonly store: IngestionRunStore;
  readonly fetchBatch: (opts: {
    symbol: string;
    exchange: VnExchange;
    from: string;
    to: string;
    now: Date;
  }) => Promise<KbsDailyFetch>;
  readonly ingest: (batch: ProviderBatch, options: CanonicalIngestionOptions) => Promise<IngestReport>;
  /** Instruments with a VALID authoritative bar for the date. Throws on DB failure. */
  readonly barsPresent: (tradingDate: string, instrumentIds: readonly string[], asOf: Date) => Promise<Set<string>>;
  /** Trading dates stored for one instrument within [from, to]. Throws on DB failure. */
  readonly storedDates: (instrumentId: string, from: string, to: string, asOf: Date) => Promise<Set<string>>;
  readonly newRunId?: () => string;
}

export interface DailyIngestionRequest {
  readonly mode: IngestionRunMode;
  /** Defaults to every supported symbol. */
  readonly symbols?: readonly string[];
  /** Required for BACKFILL/MANUAL; ignored for SCHEDULED. */
  readonly from?: string;
  readonly to?: string;
  readonly maxAttempts?: number;
  readonly concurrency?: number;
  /** Delay before attempt 2, 3, … (the last value repeats). */
  readonly retryDelaysMs?: readonly number[];
}

export type DailyIngestionStatus = 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'SKIPPED';

export type DailyIngestionReason =
  | 'LOCK_HELD'
  | 'DATABASE_NOT_CONFIGURED'
  | 'DATABASE_UNAVAILABLE'
  | 'CALENDAR_NOT_COVERED'
  | 'NO_FINAL_SESSION'
  | 'INVALID_REQUEST'
  | 'RUN_NOT_RECORDED'
  | null;

export interface SymbolIngestionOutcome extends Omit<IngestionSymbolResultRow, 'finishedAt'> {
  readonly exchange: VnExchange;
}

export interface DailyIngestionResult {
  readonly status: DailyIngestionStatus;
  readonly reason: DailyIngestionReason;
  readonly detail: string | null;
  readonly runId: string | null;
  /** True only when the run row and every symbol result were stored. */
  readonly recorded: boolean;
  readonly mode: IngestionRunMode;
  readonly targetSession: string | null;
  readonly rangeFrom: string | null;
  readonly rangeTo: string | null;
  readonly expectedSymbols: number;
  readonly completeSymbols: number;
  readonly missingSymbols: number;
  readonly failedSymbols: number;
  readonly symbols: readonly SymbolIngestionOutcome[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

interface Target {
  readonly symbol: string;
  readonly exchange: VnExchange;
  readonly instrumentId: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every supported symbol with a known exchange. */
export function supportedTargets(): Target[] {
  const targets: Target[] = [];
  for (const meta of VIETNAM_STOCKS_UNIVERSE) {
    const exchange = asVnExchange(meta.exchange);
    if (exchange) targets.push({ symbol: meta.symbol, exchange, instrumentId: instrumentIdFor(meta.symbol, exchange) });
  }
  return targets;
}

function tradingDatesIn(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addCalendarDays(d, 1)) if (isVnTradingDay(d)) dates.push(d);
  return dates;
}

/** Splits [from, to] into windows of at most MAX_FETCH_WINDOW_DAYS calendar days. */
export function fetchWindows(from: string, to: string): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  for (let start = from; start <= to; start = addCalendarDays(start, MAX_FETCH_WINDOW_DAYS)) {
    const end = addCalendarDays(start, MAX_FETCH_WINDOW_DAYS - 1);
    windows.push({ from: start, to: end < to ? end : to });
  }
  return windows;
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && code) return code.slice(0, 64);
  const name = (error as { name?: unknown })?.name;
  return typeof name === 'string' && name ? name.slice(0, 64) : 'ERROR';
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

class DatabaseLostError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'DatabaseLostError';
  }
}

export async function runDailyBarIngestion(
  request: DailyIngestionRequest,
  deps: DailyIngestionDeps
): Promise<DailyIngestionResult> {
  const started = deps.now();
  const maxAttempts = Math.max(1, request.maxAttempts ?? 3);
  const retryDelays = request.retryDelaysMs ?? [2_000, 5_000];
  const concurrency = request.concurrency ?? 3;

  const base = {
    mode: request.mode,
    runId: null as string | null,
    recorded: false,
    targetSession: null as string | null,
    rangeFrom: null as string | null,
    rangeTo: null as string | null,
    expectedSymbols: 0,
    completeSymbols: 0,
    missingSymbols: 0,
    failedSymbols: 0,
    symbols: [] as SymbolIngestionOutcome[],
    startedAt: started.toISOString(),
  };
  const stop = (status: DailyIngestionStatus, reason: DailyIngestionReason, detail: string, extra: Partial<typeof base> = {}): DailyIngestionResult => ({
    ...base,
    ...extra,
    status,
    reason,
    detail,
    finishedAt: deps.now().toISOString(),
  });

  // -- What to load -------------------------------------------------------------
  const universe = supportedTargets();
  let targets = universe;
  if (request.symbols && request.symbols.length > 0) {
    const wanted = new Set(request.symbols.map((s) => s.trim().toUpperCase()));
    targets = universe.filter((t) => wanted.has(t.symbol));
    const unknown = [...wanted].filter((s) => !targets.some((t) => t.symbol === s));
    if (unknown.length > 0) return stop('FAILED', 'INVALID_REQUEST', `Unsupported symbol(s): ${unknown.join(', ')}`);
  }

  const lastFinal = lastFinalizedSession(started);
  const today = vnLocalParts(started).date;
  if (!isCalendarCovered(today) || (lastFinal !== null && !isCalendarCovered(lastFinal))) {
    return stop('FAILED', 'CALENDAR_NOT_COVERED', `The holiday calendar does not cover ${today}; trading sessions cannot be determined.`);
  }
  if (!lastFinal) return stop('FAILED', 'NO_FINAL_SESSION', 'No final trading session could be determined.');

  let targetSession: string | null = null;
  let rangeFrom: string;
  let rangeTo: string;
  if (request.mode === 'SCHEDULED') {
    targetSession = lastFinal;
    rangeFrom = addCalendarDays(lastFinal, -SCHEDULED_LOOKBACK_DAYS);
    rangeTo = lastFinal;
  } else {
    if (!request.from || !request.to || !ISO_DATE.test(request.from) || !ISO_DATE.test(request.to) || request.from > request.to) {
      return stop('FAILED', 'INVALID_REQUEST', 'A backfill needs from <= to, both YYYY-MM-DD.');
    }
    rangeFrom = request.from;
    // Sessions that are not final yet are never part of a backfill.
    rangeTo = request.to < lastFinal ? request.to : lastFinal;
    if (rangeFrom > rangeTo) {
      return stop('FAILED', 'INVALID_REQUEST', `No final session in ${request.from}..${request.to} (last final session ${lastFinal}).`);
    }
  }
  const scope = { targetSession, rangeFrom, rangeTo, expectedSymbols: targets.length };

  // -- Preconditions: a reachable database and the exclusive lock ----------------
  const health = await deps.health();
  if (health.state !== 'CONNECTED') {
    return stop(
      'FAILED',
      health.state === 'NOT_CONFIGURED' ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_UNAVAILABLE',
      `Database ${health.state}${health.reason ? ` (${health.reason})` : ''}; nothing was loaded and no run was recorded.`,
      scope
    );
  }
  let release: (() => Promise<void>) | null;
  try {
    release = await deps.lock();
  } catch (error) {
    return stop('FAILED', 'DATABASE_UNAVAILABLE', `Could not acquire the job lock (${errorCodeOf(error)}); nothing was loaded.`, scope);
  }
  if (!release) return stop('SKIPPED', 'LOCK_HELD', 'Another ingestion run holds the job lock.', scope);

  const runId = deps.newRunId?.() ?? `eod-${started.toISOString()}-${randomUUID().slice(0, 8)}`;
  try {
    await deps.store.markAbandoned(EOD_DAILY_BARS_JOB, new Date(started.getTime() - ABANDONED_AFTER_MS), started);
    await deps.store.startRun({ runId, job: EOD_DAILY_BARS_JOB, mode: request.mode, ...scope, startedAt: started });
  } catch (error) {
    await release().catch(() => undefined);
    return stop('FAILED', 'RUN_NOT_RECORDED', `Could not register the run (${errorCodeOf(error)}); nothing was loaded.`, scope);
  }

  // -- Load ------------------------------------------------------------------------
  let databaseLost: string | null = null;
  const sessions = tradingDatesIn(rangeFrom, rangeTo);

  // A scheduled run does not re-fetch symbols whose target bar is already stored.
  let alreadyComplete = new Set<string>();
  if (targetSession) {
    try {
      alreadyComplete = await deps.barsPresent(targetSession, targets.map((t) => t.instrumentId), started);
    } catch (error) {
      databaseLost = `completeness check failed (${errorCodeOf(error)})`;
    }
  }

  const loadSymbol = async (target: Target): Promise<SymbolIngestionOutcome> => {
    const counters = { barsReceived: 0, barsInserted: 0, barsDuplicate: 0, barsRejected: 0, withheldInProgress: 0 };
    const result = (outcome: SymbolIngestionOutcome['outcome'], attempts: number, errorCode: string | null, detail: string | null): SymbolIngestionOutcome => ({
      symbol: target.symbol,
      exchange: target.exchange,
      instrumentId: target.instrumentId,
      outcome,
      attempts,
      ...counters,
      missingSessions: 0,
      errorCode,
      detail,
    });
    if (databaseLost) return result('FAILED', 0, 'DATABASE_UNAVAILABLE', databaseLost);
    if (alreadyComplete.has(target.instrumentId)) return result('COMPLETE', 0, null, 'Target session already stored.');

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (databaseLost) return result('FAILED', attempt - 1, 'DATABASE_UNAVAILABLE', databaseLost);
      try {
        for (const window of fetchWindows(rangeFrom, rangeTo)) {
          const fetched = await deps.fetchBatch({ symbol: target.symbol, exchange: target.exchange, from: window.from, to: window.to, now: started });
          counters.withheldInProgress += fetched.withheldInProgress;
          if (fetched.batch.observations.length === 0) continue;
          const report = await deps.ingest(fetched.batch, { registerInstruments: true, validFrom: rangeFrom });
          counters.barsReceived += report.received;
          counters.barsInserted += report.persistedBars;
          counters.barsDuplicate += report.duplicateBars;
          counters.barsRejected += report.rejected;
          if (report.persistenceStatus === 'NOT_PERSISTED' || report.databaseState === 'UNAVAILABLE') {
            throw new DatabaseLostError(`database ${report.databaseState ?? 'UNAVAILABLE'} while writing ${target.symbol}`);
          }
        }
        // Outcome is decided by the completeness check after all symbols ran.
        return result('COMPLETE', attempt, null, null);
      } catch (error) {
        if (error instanceof DatabaseLostError) {
          databaseLost = error.message;
          return result('FAILED', attempt, 'DATABASE_UNAVAILABLE', error.message);
        }
        lastError = error;
        if (attempt < maxAttempts) await deps.sleep(retryDelays[Math.min(attempt - 1, retryDelays.length - 1)] ?? 0);
      }
    }
    return result('FAILED', maxAttempts, errorCodeOf(lastError), `provider failed after ${maxAttempts} attempt(s): ${(lastError as Error)?.message ?? lastError}`.slice(0, 500));
  };

  let outcomes = await mapWithConcurrency(targets, concurrency, loadSymbol);

  // -- Verify completeness from the database, never from the load itself -----------
  if (!databaseLost) {
    try {
      if (targetSession) {
        const present = await deps.barsPresent(targetSession, targets.map((t) => t.instrumentId), deps.now());
        outcomes = outcomes.map((o) =>
          o.outcome === 'FAILED'
            ? o
            : present.has(o.instrumentId)
              ? { ...o, outcome: 'COMPLETE' }
              : { ...o, outcome: 'MISSING', missingSessions: 1, detail: `No ${targetSession} bar stored (suspended, not yet published, or rejected).` }
        );
      } else {
        const verified: SymbolIngestionOutcome[] = [];
        for (const o of outcomes) {
          if (o.outcome === 'FAILED') {
            verified.push(o);
            continue;
          }
          const stored = await deps.storedDates(o.instrumentId, rangeFrom, rangeTo, deps.now());
          const missing = sessions.filter((d) => !stored.has(d));
          verified.push(
            missing.length === 0
              ? { ...o, outcome: 'COMPLETE', missingSessions: 0 }
              : { ...o, outcome: 'MISSING', missingSessions: missing.length, detail: `${missing.length} session(s) without a stored bar, first ${missing[0]}.` }
          );
        }
        outcomes = verified;
      }
    } catch (error) {
      databaseLost = `completeness check failed (${errorCodeOf(error)})`;
    }
  }
  if (databaseLost) {
    // Without a verifiable database nothing can be called complete.
    outcomes = outcomes.map((o) => (o.outcome === 'FAILED' ? o : { ...o, outcome: 'FAILED', errorCode: 'DATABASE_UNAVAILABLE', detail: databaseLost }));
  }

  const complete = outcomes.filter((o) => o.outcome === 'COMPLETE').length;
  const missing = outcomes.filter((o) => o.outcome === 'MISSING').length;
  const failed = outcomes.filter((o) => o.outcome === 'FAILED').length;
  const status: DailyIngestionStatus =
    complete === targets.length && targets.length > 0 ? 'COMPLETE' : complete > 0 ? 'PARTIAL' : 'FAILED';
  const detail = databaseLost
    ? `Aborted: ${databaseLost}.`
    : `${complete}/${targets.length} symbols complete${targetSession ? ` for ${targetSession}` : ` for ${rangeFrom}..${rangeTo}`}; ${missing} missing, ${failed} failed.`;
  const finished = deps.now();

  let recorded = true;
  try {
    await deps.store.recordSymbolResults(runId, outcomes.map(({ exchange: _exchange, ...row }) => ({ ...row, finishedAt: finished })));
    await deps.store.finishRun(runId, {
      status,
      completeSymbols: complete,
      missingSymbols: missing,
      failedSymbols: failed,
      barsInserted: outcomes.reduce((n, o) => n + o.barsInserted, 0),
      barsDuplicate: outcomes.reduce((n, o) => n + o.barsDuplicate, 0),
      barsRejected: outcomes.reduce((n, o) => n + o.barsRejected, 0),
      detail,
      finishedAt: finished,
    });
  } catch {
    // The RUNNING row stays behind and is closed as ABANDONED by the next run.
    recorded = false;
  } finally {
    await release().catch(() => undefined);
  }

  return {
    ...base,
    ...scope,
    runId,
    recorded,
    status,
    reason: databaseLost ? 'DATABASE_UNAVAILABLE' : recorded ? null : 'RUN_NOT_RECORDED',
    detail,
    completeSymbols: complete,
    missingSymbols: missing,
    failedSymbols: failed,
    symbols: outcomes,
    finishedAt: finished.toISOString(),
  };
}
