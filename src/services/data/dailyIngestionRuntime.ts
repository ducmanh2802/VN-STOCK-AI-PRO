/**
 * Production wiring of the daily-bar ingestion job: PostgreSQL-backed run ledger,
 * PostgreSQL advisory lock, the KBS fetcher and the canonical ingestion service.
 */
import { checkDatabaseConnectivity } from '../../db/databaseHealth.ts';
import { CanonicalMarketDataRepository } from '../../lib/db/data/CanonicalMarketDataRepository.ts';
import { IngestionRunRepository } from '../../lib/db/data/IngestionRunRepository.ts';
import { addCalendarDays } from '../../lib/data/vnTradingCalendar.ts';
import { CanonicalMarketDataIngestionService } from './CanonicalMarketDataIngestionService.ts';
import type { DailyIngestionDeps, JobLock } from './DailyBarIngestionJob.ts';
import { AUTHORITATIVE_DAILY_SERIES, fetchKbsDailyBatch } from './kbsDailyObservations.ts';

/** Advisory-lock key of the EOD job (distinct from the migration runner's key). */
export const EOD_INGEST_LOCK_KEY = 7_214_012;

/**
 * Session-scoped advisory lock held on ONE dedicated pool connection for the whole run
 * (an advisory lock taken through the pool could be released on a different session).
 */
export function postgresAdvisoryLock(key: number): JobLock {
  return async () => {
    const { createPool } = await import('../../db/index.ts');
    const client = await createPool().connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [key]);
      if (!rows[0]?.locked) {
        client.release();
        return null;
      }
    } catch (error) {
      client.release();
      throw error;
    }
    return async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [key]);
      } finally {
        client.release();
      }
    };
  };
}

export function createDatabaseIngestionDeps(): DailyIngestionDeps {
  return {
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    health: () => checkDatabaseConnectivity(),
    lock: postgresAdvisoryLock(EOD_INGEST_LOCK_KEY),
    store: IngestionRunRepository,
    fetchBatch: (opts) => fetchKbsDailyBatch({ ...opts, timeoutMs: 20_000 }),
    ingest: (batch, options) => CanonicalMarketDataIngestionService.ingestBatch(batch, options),
    barsPresent: (tradingDate, instrumentIds, asOf) =>
      CanonicalMarketDataRepository.instrumentsWithDailyBar({ tradingDate, instrumentIds, series: AUTHORITATIVE_DAILY_SERIES, asOf }),
    storedDates: async (instrumentId, from, to, asOf) => {
      // One row per session at most, so the calendar span bounds the row count.
      let span = 1;
      for (let d = from; d < to; d = addCalendarDays(d, 1)) span += 1;
      const bars = await CanonicalMarketDataRepository.getDailySeries({
        instrumentId,
        series: AUTHORITATIVE_DAILY_SERIES,
        asOf,
        from,
        to,
        limit: span,
      });
      return new Set(bars.map((b) => b.tradingDate));
    },
  };
}
