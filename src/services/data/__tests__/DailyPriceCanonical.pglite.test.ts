/**
 * Canonical daily-price model, end to end on a real (PGlite) PostgreSQL built from the
 * committed migrations: ingestion -> canonical_market_bars -> read model -> HTTP route.
 *
 * Bars below are CONSTRUCTED fixtures (not captured market data); they only exercise
 * persistence and validation.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { sql } from 'drizzle-orm';

vi.mock('../../../db/index.ts', async () => (await import('../../../db/__tests__/pgliteHarness.ts')).mockDbModule());

import { db } from '../../../db/index.ts';
import { withTestDatabaseEnv } from '../../../db/__tests__/pgliteHarness.ts';
import { CanonicalMarketDataIngestionService, type ProviderBatch } from '../CanonicalMarketDataIngestionService.ts';
import { CanonicalMarketDataRepository } from '../../../lib/db/data/CanonicalMarketDataRepository.ts';
import { getDailyPrices } from '../DailyPriceService.ts';
import { createDailyPriceRouter } from '../DailyPriceApiRouter.ts';
import { CANONICAL_DAILY_BAR_VERSION } from '../kbsDailyObservations.ts';

/** Friday 2026-04-10, 18:00 in Hanoi — that session is final. */
const NOW = new Date('2026-04-10T11:00:00.000Z');

type Row = [date: string, open: number, high: number, low: number, close: number, volume: number];

function batch(symbol: string, exchange: 'HOSE' | 'HNX', rows: Row[], overrides: Partial<ProviderBatch> = {}): ProviderBatch {
  return {
    source: 'KBS',
    sourceTier: 'TIER_3_SECONDARY',
    provider: 'KbsHistoricalProvider',
    providerVersion: null,
    dataVersion: CANONICAL_DAILY_BAR_VERSION,
    observations: rows.map(([date, open, high, low, close, volume]) => ({
      instrumentId: `${exchange}:${symbol}`,
      symbol,
      exchange,
      timeframe: '1D' as const,
      barTime: `${date}T07:00:00.000Z`,
      tradingDate: date,
      open,
      high,
      low,
      close,
      volume,
      turnoverVnd: close * volume,
      sourceRecordId: `KBS|${symbol}|1D|${date}`,
      publicationTime: `${date}T08:00:00.000Z`,
    })),
    ...overrides,
  };
}

const ingest = (b: ProviderBatch) => CanonicalMarketDataIngestionService.ingestBatch(b, { now: NOW });

async function countBars(instrumentId: string): Promise<number> {
  const result = await db.execute(sql`SELECT count(*)::int AS n FROM canonical_market_bars WHERE instrument_id = ${instrumentId}`);
  return Number((result.rows[0] as { n: number }).n);
}

let restoreEnv: () => void;

beforeAll(async () => {
  restoreEnv = withTestDatabaseEnv();
  const hpg = await ingest(
    batch('HPG', 'HOSE', [
      ['2026-04-06', 27_500, 27_900, 27_400, 27_800, 11_000_000],
      ['2026-04-07', 27_800, 28_000, 27_600, 27_700, 12_000_000],
      // 2026-04-08 deliberately absent: a gap must be reported, never filled.
      ['2026-04-09', 27_700, 28_100, 27_650, 28_000, 13_000_000],
      ['2026-04-10', 28_000, 28_600, 27_950, 28_500, 14_000_000],
    ])
  );
  expect(hpg.persistenceStatus).toBe('PERSISTED');
  expect(hpg.databaseState).toBe('CONNECTED');
  const shs = await ingest(
    batch('SHS', 'HNX', [
      ['2026-04-09', 18_000, 18_500, 17_900, 18_400, 9_000_000],
      ['2026-04-10', 18_400, 19_000, 18_300, 18_900, 9_500_000],
    ])
  );
  expect(shs.persistedBars).toBe(2);
}, 120_000);

afterAll(() => restoreEnv());

describe('one authoritative write path: canonical_market_bars', () => {
  it('re-ingesting the same bars is idempotent', async () => {
    const before = await countBars('HOSE:HPG');
    const again = await ingest(batch('HPG', 'HOSE', [['2026-04-10', 28_000, 28_600, 27_950, 28_500, 14_000_000]]));
    expect(again.persistedBars).toBe(0);
    expect(again.duplicateBars).toBe(1);
    expect(again.revisionConflicts).toEqual([]);
    expect(await countBars('HOSE:HPG')).toBe(before);
  });

  it('a revised re-report keeps the stored bar and records the conflict', async () => {
    const report = await ingest(batch('HPG', 'HOSE', [['2026-04-10', 28_000, 28_600, 27_950, 28_450, 14_000_000]]));
    expect(report.duplicateBars).toBe(1);
    expect(report.revisionConflicts).toEqual([{ instrumentId: 'HOSE:HPG', tradingDate: '2026-04-10', fields: ['close'] }]);
    const result = await getDailyPrices('HPG', { now: NOW, from: '2026-04-10', to: '2026-04-10' });
    expect(result.status === 'OK' && result.bars[0]?.close).toBe(28_500);
    const quality = await CanonicalMarketDataRepository.getQualityHistory('HOSE:HPG');
    expect(quality.some((q) => q.reasonCode === 'DUPLICATE_BAR' && q.qualityState === 'INVALID')).toBe(true);
  });

  it('invalid records are rejected, recorded, and never served', async () => {
    const report = await ingest(
      batch('HPG', 'HOSE', [
        ['2026-04-03', 27_000, 26_900, 26_800, 26_950, 1_000], // open above high
        ['2026-04-02', 27_000, 27_100, 26_800, 26_950, Number.NaN], // non-finite volume
      ])
    );
    expect(report.rejected).toBe(2);
    expect(report.accepted).toBe(0);
    expect(report.rejections.map((r) => r.reason).sort()).toEqual(['NEGATIVE_VOLUME', 'OHLC_INCONSISTENT']);
    const result = await getDailyPrices('HPG', { now: NOW, from: '2026-04-01', to: '2026-04-05' });
    expect(result.status).toBe('EMPTY');
  });

  it('a daily bar filed under the wrong session date is rejected', async () => {
    const wrong = batch('HPG', 'HOSE', [['2026-04-01', 27_000, 27_100, 26_900, 27_050, 1_000]]);
    const shifted: ProviderBatch = {
      ...wrong,
      observations: wrong.observations.map((o) => ({ ...o, barTime: '2026-04-01T20:00:00.000Z' })), // 03:00 on 04-02 in Hanoi
    };
    const report = await ingest(shifted);
    expect(report.rejections[0]?.reason).toBe('INVALID_TIMESTAMP');
  });
});

describe('read model: getDailyPrices', () => {
  it('serves multiple symbols from their own canonical identities', async () => {
    const hpg = await getDailyPrices('HPG', { now: NOW });
    const shs = await getDailyPrices('SHS', { now: NOW });
    expect(hpg.status === 'OK' && hpg.instrumentId).toBe('HOSE:HPG');
    expect(shs.status === 'OK' && shs.instrumentId).toBe('HNX:SHS');
    expect(shs.status === 'OK' && shs.bars.map((b) => b.tradingDate)).toEqual(['2026-04-09', '2026-04-10']);
  });

  it('honours from/to and returns the MOST RECENT `limit` bars, ascending', async () => {
    const ranged = await getDailyPrices('HPG', { now: NOW, from: '2026-04-07', to: '2026-04-09' });
    expect(ranged.status === 'OK' && ranged.bars.map((b) => b.tradingDate)).toEqual(['2026-04-07', '2026-04-09']);
    const latest2 = await getDailyPrices('HPG', { now: NOW, limit: 2 });
    expect(latest2.status === 'OK' && latest2.bars.map((b) => b.tradingDate)).toEqual(['2026-04-09', '2026-04-10']);
  });

  it('reports the missing session instead of synthesizing it', async () => {
    const result = await getDailyPrices('HPG', { now: NOW });
    expect(result.status === 'OK' && result.missingSessions).toEqual(['2026-04-08']);
    expect(result.status === 'OK' && result.bars.some((b) => b.tradingDate === '2026-04-08')).toBe(false);
  });

  it('is point-in-time: a bar published after `now` is invisible', async () => {
    const atNoon = await getDailyPrices('HPG', { now: new Date('2026-04-10T05:00:00.000Z') });
    expect(atNoon.status === 'OK' && atNoon.bars.at(-1)?.tradingDate).toBe('2026-04-09');
  });

  it('empty history is EMPTY, not an error and not invented', async () => {
    const result = await getDailyPrices('FPT', { now: NOW });
    expect(result.status).toBe('EMPTY');
    expect(result.status === 'EMPTY' && result.bars).toEqual([]);
  });

  it('rejects unsupported symbols and malformed queries', async () => {
    expect((await getDailyPrices('ZZZZ', { now: NOW })).status).toBe('UNSUPPORTED_SYMBOL');
    expect((await getDailyPrices('HPG', { now: NOW, from: '2026/04/01' })).status).toBe('INVALID_QUERY');
    expect((await getDailyPrices('HPG', { now: NOW, from: '2026-04-10', to: '2026-04-01' })).status).toBe('INVALID_QUERY');
    expect((await getDailyPrices('HPG', { now: NOW, limit: 0 })).status).toBe('INVALID_QUERY');
  });

  it('an unreachable database is DATABASE_UNAVAILABLE, never an empty history', async () => {
    const spy = vi
      .spyOn(CanonicalMarketDataRepository, 'getDailySeries')
      .mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const result = await getDailyPrices('HPG', { now: NOW });
    expect(result).toMatchObject({ status: 'DATABASE_UNAVAILABLE', databaseState: 'UNAVAILABLE' });
    spy.mockRestore();
  });

  it('missing configuration is DATABASE_UNAVAILABLE without touching the database', async () => {
    const saved = process.env.SQL_HOST;
    delete process.env.SQL_HOST;
    const spy = vi.spyOn(CanonicalMarketDataRepository, 'getDailySeries');
    try {
      expect(await getDailyPrices('HPG', { now: NOW })).toMatchObject({ status: 'DATABASE_UNAVAILABLE', databaseState: 'NOT_CONFIGURED' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      process.env.SQL_HOST = saved;
      spy.mockRestore();
    }
  });
});

describe('GET /api/stocks/:symbol/daily', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use('/api/stocks', createDailyPriceRouter({ now: () => NOW }));
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/stocks`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('keeps the legacy row shape and adds provenance + status headers', async () => {
    const res = await fetch(`${base}/HPG/daily?from=2026-04-09&to=2026-04-10`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-data-status')).toBe('OK');
    expect(res.headers.get('x-data-source')).toBe('KBS');
    expect(res.headers.get('x-data-version')).toBe(CANONICAL_DAILY_BAR_VERSION);
    const rows = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      stockId: null,
      instrumentId: 'HOSE:HPG',
      date: '2026-04-10',
      open: '28000.00',
      high: '28600.00',
      low: '27950.00',
      close: '28500.00',
      volume: 14_000_000,
      source: 'KBS',
      dataVersion: CANONICAL_DAILY_BAR_VERSION,
    });
    // Every column of the former stock_daily row is still present.
    for (const legacyKey of ['id', 'stockId', 'date', 'open', 'high', 'low', 'close', 'refPrice', 'ceilingPrice', 'floorPrice', 'change', 'changePercent', 'volume', 'value', 'createdAt', 'updatedAt']) {
      expect(rows[0], legacyKey).toHaveProperty(legacyKey);
    }
  });

  it('reports gaps in a header', async () => {
    const res = await fetch(`${base}/HPG/daily`);
    expect(res.headers.get('x-data-missing-sessions')).toBe('1');
  });

  it('answers 200 [] with EMPTY for a supported symbol without history', async () => {
    const res = await fetch(`${base}/FPT/daily`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-data-status')).toBe('EMPTY');
    expect(await res.json()).toEqual([]);
  });

  it('404 for an unsupported symbol, 400 for a malformed query', async () => {
    expect((await fetch(`${base}/ZZZZ/daily`)).status).toBe(404);
    expect((await fetch(`${base}/HPG/daily?limit=abc`)).status).toBe(400);
  });

  it('503 DATA_UNAVAILABLE when the database is down', async () => {
    const spy = vi
      .spyOn(CanonicalMarketDataRepository, 'getDailySeries')
      .mockRejectedValueOnce(Object.assign(new Error('timeout expired'), { code: 'ETIMEDOUT' }));
    const res = await fetch(`${base}/HPG/daily`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ dataStatus: 'DATA_UNAVAILABLE', databaseState: 'UNAVAILABLE' });
    spy.mockRestore();
  });
});
