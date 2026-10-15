/**
 * Scheduled EOD + backfill ingestion on a real (PGlite) PostgreSQL built from the
 * committed migrations. Production wiring (`createDatabaseIngestionDeps`) is used for
 * the run ledger, repositories, health probe and KBS mapping; only the clock, sleeps,
 * the lock and the KBS HTTP call are substituted.
 *
 * KBS bars are CONSTRUCTED fixtures (deterministic prices), not captured market data.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

vi.mock('../../../db/index.ts', async () => (await import('../../../db/__tests__/pgliteHarness.ts')).mockDbModule());

import { db } from '../../../db/index.ts';
import { stockDaily, stocks } from '../../../db/schema.ts';
import { withTestDatabaseEnv } from '../../../db/__tests__/pgliteHarness.ts';
import { KbsHistoricalProvider } from '../../market/providers/kbs/KbsHistoricalProvider.ts';
import type { NormalizedDailyBar } from '../../market/providers/kbs/types.ts';
import { CanonicalMarketDataIngestionService } from '../CanonicalMarketDataIngestionService.ts';
import { EOD_DAILY_BARS_JOB, runDailyBarIngestion, type DailyIngestionDeps } from '../DailyBarIngestionJob.ts';
import { createDatabaseIngestionDeps } from '../dailyIngestionRuntime.ts';
import { IngestionRunRepository } from '../../../lib/db/data/IngestionRunRepository.ts';
import { reconcileLegacyDailyPrices } from '../dailyPriceReconciliation.ts';
import { getDailyPrices } from '../DailyPriceService.ts';
import { fetchKbsDailyBatch } from '../kbsDailyObservations.ts';

/** Fri 2026-04-10, 18:00 in Hanoi: the 2026-04-10 session is final. */
const FRI_EVENING = new Date('2026-04-10T11:00:00.000Z');
/** Fri 2026-04-10, 12:00 in Hanoi: the 2026-04-10 session is still running. */
const FRI_NOON = new Date('2026-04-10T05:00:00.000Z');

const SESSIONS = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10'];

function bar(date: string, base: number): NormalizedDailyBar {
  const close = base + SESSIONS.indexOf(date) * 100;
  return { date, open: close - 50, high: close + 100, low: close - 100, close, volume: 1_000_000, value: close * 1_000_000 };
}

/** Constructed KBS responses per symbol; a symbol absent from the map has no data. */
let kbsData: Record<string, NormalizedDailyBar[]>;
let kbsCalls: string[];
const failures = new Map<string, number>();

let clock = FRI_EVENING;
let lockHeld = false;
let sleeps: number[];

function deps(overrides: Partial<DailyIngestionDeps> = {}): DailyIngestionDeps {
  return {
    ...createDatabaseIngestionDeps(),
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    lock: async () => {
      if (lockHeld) return null;
      lockHeld = true;
      return async () => {
        lockHeld = false;
      };
    },
    ingest: (batch, options) => CanonicalMarketDataIngestionService.ingestBatch(batch, { ...options, now: clock }),
    ...overrides,
  };
}

async function count(table: string): Promise<number> {
  const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`));
  return Number((r.rows[0] as { n: number }).n);
}

let restoreEnv: () => void;

beforeAll(() => {
  restoreEnv = withTestDatabaseEnv();
});
afterAll(() => restoreEnv());

beforeEach(() => {
  clock = FRI_EVENING;
  lockHeld = false;
  sleeps = [];
  kbsCalls = [];
  failures.clear();
  kbsData = {
    HPG: SESSIONS.map((d) => bar(d, 27_000)),
    SHS: SESSIONS.map((d) => bar(d, 18_000)),
    // FPT has no 2026-04-10 bar (e.g. halted that day).
    FPT: SESSIONS.filter((d) => d !== '2026-04-10').map((d) => bar(d, 120_000)),
  };
  vi.spyOn(KbsHistoricalProvider, 'getDailyHistory').mockImplementation(async (symbol: string, from: string, to: string) => {
    kbsCalls.push(symbol);
    const remaining = failures.get(symbol) ?? 0;
    if (remaining > 0) {
      failures.set(symbol, remaining - 1);
      throw Object.assign(new Error(`KBS timeout for ${symbol}`), { code: 'ETIMEDOUT' });
    }
    return (kbsData[symbol] ?? []).filter((b) => b.date >= from && b.date <= to);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('scheduled EOD run', () => {
  it('loads every symbol, verifies the target session from the DB, and never calls a partial load COMPLETE', async () => {
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG', 'SHS', 'FPT'] }, deps());
    expect(result.targetSession).toBe('2026-04-10');
    expect(result.status).toBe('PARTIAL');
    expect(result.recorded).toBe(true);
    expect(result).toMatchObject({ expectedSymbols: 3, completeSymbols: 2, missingSymbols: 1, failedSymbols: 0 });
    expect(result.symbols.find((s) => s.symbol === 'FPT')).toMatchObject({ outcome: 'MISSING', missingSessions: 1 });

    const [run] = await IngestionRunRepository.latestRuns(EOD_DAILY_BARS_JOB, 1);
    expect(run).toMatchObject({ status: 'PARTIAL', mode: 'SCHEDULED', targetSession: '2026-04-10', expectedSymbols: 3, completeSymbols: 2, missingSymbols: 1 });
    expect(run!.finishedAt).not.toBeNull();
    expect(await IngestionRunRepository.symbolResults(run!.runId)).toHaveLength(3);
  });

  it('is idempotent: a rerun skips complete symbols and writes no duplicate bars', async () => {
    const barsBefore = await count('canonical_market_bars');
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG', 'SHS', 'FPT'] }, deps());
    expect(kbsCalls).toEqual(['FPT']);
    expect(result.status).toBe('PARTIAL');
    expect(result.symbols.find((s) => s.symbol === 'FPT')).toMatchObject({ barsInserted: 0 });
    expect(await count('canonical_market_bars')).toBe(barsBefore);
  });

  it('becomes COMPLETE once the missing bar is published, and is recorded as the last complete run', async () => {
    kbsData.FPT = SESSIONS.map((d) => bar(d, 120_000));
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG', 'SHS', 'FPT'] }, deps());
    expect(result.status).toBe('COMPLETE');
    const lastComplete = await IngestionRunRepository.latestRunWithStatus(EOD_DAILY_BARS_JOB, 'COMPLETE');
    expect(lastComplete?.runId).toBe(result.runId);
    expect(lastComplete?.targetSession).toBe('2026-04-10');
  });

  it('during trading hours targets the previous session and never requests or stores today', async () => {
    clock = FRI_NOON;
    kbsData.ACB = SESSIONS.map((d) => bar(d, 24_000));
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['ACB'] }, deps());
    expect(result.targetSession).toBe('2026-04-09');
    expect(result.rangeTo).toBe('2026-04-09');
    expect(result.status).toBe('COMPLETE');
    const stored = await getDailyPrices('ACB', { now: FRI_EVENING });
    expect(stored.status === 'OK' && stored.bars.at(-1)?.tradingDate).toBe('2026-04-09');
  });

  it('the KBS mapping withholds an in-progress session even when the provider returns it', async () => {
    kbsData.ACB = SESSIONS.map((d) => bar(d, 24_000));
    const fetched = await fetchKbsDailyBatch({ symbol: 'ACB', exchange: 'HOSE', from: '2026-04-06', to: '2026-04-10', now: FRI_NOON });
    expect(fetched.lastFinalSession).toBe('2026-04-09');
    expect(fetched.withheldInProgress).toBe(1);
    expect(fetched.batch.observations.map((o) => o.tradingDate)).not.toContain('2026-04-10');
    expect(fetched.batch.sourceTier).toBe('TIER_3_SECONDARY');
  });

  it('retries a failing provider with bounded backoff', async () => {
    kbsData.VCB = SESSIONS.map((d) => bar(d, 60_000));
    failures.set('VCB', 2);
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['VCB'] }, deps());
    expect(result.status).toBe('COMPLETE');
    expect(result.symbols[0]).toMatchObject({ outcome: 'COMPLETE', attempts: 3 });
    expect(sleeps).toEqual([2_000, 5_000]);
  });

  it('gives up after the attempt budget and reports the symbol FAILED', async () => {
    failures.set('MBB', 99);
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['MBB', 'HPG'] }, deps());
    expect(result.status).toBe('PARTIAL');
    expect(result.symbols.find((s) => s.symbol === 'MBB')).toMatchObject({ outcome: 'FAILED', attempts: 3, errorCode: 'ETIMEDOUT' });
  });

  it('aborts, and claims nothing complete, when the database is lost mid-run', async () => {
    kbsData.TCB = SESSIONS.map((d) => bar(d, 30_000));
    const result = await runDailyBarIngestion(
      { mode: 'SCHEDULED', symbols: ['TCB'] },
      deps({
        ingest: async (batch) => ({
          source: batch.source, sourceUnavailable: false, received: batch.observations.length, accepted: batch.observations.length,
          rejected: 0, persistedBars: 0, duplicateBars: 0, persistedQualityRows: 0, databaseConfigured: true,
          databaseState: 'UNAVAILABLE', persistenceStatus: 'NOT_PERSISTED', unpersistedBars: batch.observations.length,
          failedWrites: 0, revisionConflicts: [], rejections: [],
        }),
      })
    );
    expect(result.status).toBe('FAILED');
    expect(result.reason).toBe('DATABASE_UNAVAILABLE');
    expect(result.symbols[0]).toMatchObject({ outcome: 'FAILED', errorCode: 'DATABASE_UNAVAILABLE' });
  });
});

describe('preconditions and overlap', () => {
  it('a held lock means SKIPPED and no run row', async () => {
    const runsBefore = await count('market_data_ingestion_runs');
    lockHeld = true;
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG'] }, deps());
    expect(result).toMatchObject({ status: 'SKIPPED', reason: 'LOCK_HELD', runId: null, recorded: false });
    expect(await count('market_data_ingestion_runs')).toBe(runsBefore);
    expect(kbsCalls).toEqual([]);
  });

  it('the database admits only one RUNNING row per job, even without the lock', async () => {
    await IngestionRunRepository.startRun({ runId: 'stale-1', job: EOD_DAILY_BARS_JOB, mode: 'SCHEDULED', targetSession: '2026-04-09', rangeFrom: '2026-03-26', rangeTo: '2026-04-09', expectedSymbols: 1, startedAt: new Date('2026-04-10T07:00:00Z') });
    await expect(
      IngestionRunRepository.startRun({ runId: 'stale-2', job: EOD_DAILY_BARS_JOB, mode: 'SCHEDULED', targetSession: '2026-04-09', rangeFrom: '2026-03-26', rangeTo: '2026-04-09', expectedSymbols: 1, startedAt: new Date('2026-04-10T07:30:00Z') })
    ).rejects.toThrow();
  });

  it('a RUNNING row left by a dead process is closed as ABANDONED by the next run', async () => {
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG'] }, deps());
    expect(result.recorded).toBe(true);
    const runs = await IngestionRunRepository.latestRuns(EOD_DAILY_BARS_JOB, 20);
    expect(runs.find((r) => r.runId === 'stale-1')).toMatchObject({ status: 'FAILED' });
    expect(runs.find((r) => r.runId === 'stale-1')?.detail).toMatch(/ABANDONED/);
  });

  it('no database configuration: FAILED, nothing loaded, nothing recorded', async () => {
    const saved = process.env.SQL_PASSWORD;
    delete process.env.SQL_PASSWORD;
    try {
      const runsBefore = await count('market_data_ingestion_runs');
      const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG'] }, deps());
      expect(result).toMatchObject({ status: 'FAILED', reason: 'DATABASE_NOT_CONFIGURED', recorded: false });
      expect(kbsCalls).toEqual([]);
      expect(await count('market_data_ingestion_runs')).toBe(runsBefore);
    } finally {
      process.env.SQL_PASSWORD = saved;
    }
  });

  it('a date the holiday calendar does not cover is refused, not guessed', async () => {
    clock = new Date('2029-03-01T11:00:00Z');
    const result = await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['HPG'] }, deps());
    expect(result).toMatchObject({ status: 'FAILED', reason: 'CALENDAR_NOT_COVERED' });
  });

  it('unsupported symbols and malformed backfills are rejected up front', async () => {
    expect((await runDailyBarIngestion({ mode: 'SCHEDULED', symbols: ['NOPE'] }, deps())).reason).toBe('INVALID_REQUEST');
    expect((await runDailyBarIngestion({ mode: 'BACKFILL', symbols: ['HPG'] }, deps())).reason).toBe('INVALID_REQUEST');
  });
});

describe('manual backfill', () => {
  it('COMPLETE only when every session in the range is stored; the range stops at the last final session', async () => {
    kbsData.SSI = SESSIONS.map((d) => bar(d, 25_000));
    const result = await runDailyBarIngestion({ mode: 'BACKFILL', symbols: ['SSI'], from: '2026-03-30', to: '2026-04-30' }, deps());
    expect(result.rangeTo).toBe('2026-04-10');
    expect(result.status).toBe('COMPLETE');
    expect(result.symbols[0]).toMatchObject({ outcome: 'COMPLETE', barsInserted: 10, missingSessions: 0 });
    const [run] = await IngestionRunRepository.latestRuns(EOD_DAILY_BARS_JOB, 1);
    expect(run).toMatchObject({ mode: 'BACKFILL', targetSession: null, status: 'COMPLETE' });
  });

  it('counts the sessions a backfill could not fill', async () => {
    kbsData.STB = SESSIONS.filter((d) => d !== '2026-04-02' && d !== '2026-04-07').map((d) => bar(d, 33_000));
    const result = await runDailyBarIngestion({ mode: 'BACKFILL', symbols: ['STB'], from: '2026-03-30', to: '2026-04-10' }, deps());
    expect(result.status).toBe('FAILED');
    expect(result.symbols[0]).toMatchObject({ outcome: 'MISSING', missingSessions: 2 });
  });
});

describe('legacy stock_daily reconciliation (read-only)', () => {
  it('is safe to retire only when every legacy row matches the canonical series', async () => {
    const [shs] = await db
      .insert(stocks)
      .values({ symbol: 'SHS', companyName: 'fixture', exchange: 'HNX', sector: 'fixture' })
      .returning({ id: stocks.id });
    const legacy = (date: string) => {
      const b = bar(date, 18_000);
      return { stockId: shs!.id, date, open: String(b.open), high: String(b.high), low: String(b.low), close: String(b.close), volume: b.volume, value: String(b.value) };
    };
    await db.insert(stockDaily).values([legacy('2026-04-08'), legacy('2026-04-09')]);
    const clean = await reconcileLegacyDailyPrices(FRI_EVENING);
    expect(clean).toMatchObject({ legacyRows: 2, matched: 2, missingInCanonical: 0, valueMismatches: 0, safeToRetireLegacyTable: true });

    await db.insert(stockDaily).values([
      { ...legacy('2026-04-10'), close: '99999.00' },
      { ...legacy('2026-03-20') },
    ]);
    const dirty = await reconcileLegacyDailyPrices(FRI_EVENING);
    expect(dirty).toMatchObject({ legacyRows: 4, matched: 2, missingInCanonical: 1, valueMismatches: 1, safeToRetireLegacyTable: false });
  });
});
