/**
 * Ingestion must report persistence truthfully: configuration is not connectivity,
 * an unreachable database is never reported as written, and a database that drops
 * mid-batch yields PARTIAL rather than success.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import {
  CanonicalMarketDataIngestionService,
  type ProviderBarObservation,
  type ProviderBatch,
} from '../CanonicalMarketDataIngestionService.ts';
import { CanonicalMarketDataRepository } from '../../../lib/db/data/CanonicalMarketDataRepository.ts';
import type { DatabaseHealth } from '../../../db/databaseHealth.ts';
import { KbsHistoricalProvider } from '../../market/providers/kbs/KbsHistoricalProvider.ts';
import { createCanonicalDataApiRouter } from '../CanonicalDataApiRouter.ts';

const NOW = new Date('2026-04-10T08:00:00.000Z');

function obs(date: string, overrides: Partial<ProviderBarObservation> = {}): ProviderBarObservation {
  return {
    instrumentId: 'HOSE:HPG',
    symbol: 'HPG',
    exchange: 'HOSE',
    timeframe: '1D',
    barTime: `${date}T07:00:00.000Z`,
    tradingDate: date,
    open: 27_800,
    high: 28_700,
    low: 27_600,
    close: 28_500,
    volume: 15_000_000,
    turnoverVnd: 427_500_000_000,
    sourceRecordId: `KBS|HPG|1D|${date}`,
    publicationTime: `${date}T08:00:00.000Z`,
    ...overrides,
  };
}

function batch(observations: ProviderBarObservation[]): ProviderBatch {
  return {
    source: 'KBS',
    sourceTier: 'TIER_2_EXCHANGE',
    provider: 'KbsHistoricalProvider',
    providerVersion: null,
    dataVersion: 'v1.0.0-canonical-1d',
    observations,
  };
}

const health = (state: DatabaseHealth['state']): (() => Promise<DatabaseHealth>) => async () => ({
  state,
  checkedAt: NOW.toISOString(),
  latencyMs: state === 'CONNECTED' ? 3 : null,
  missingConfiguration: state === 'NOT_CONFIGURED' ? ['SQL_HOST'] : [],
  reason: state === 'UNAVAILABLE' ? 'CONNECTION_FAILED' : null,
  errorCode: state === 'UNAVAILABLE' ? 'ECONNREFUSED' : null,
});

const written = { persisted: true, inserted: true, insertedCount: 1, skippedReason: null } as const;
const duplicate = { persisted: true, inserted: false, insertedCount: 0, skippedReason: null } as const;
const noDatabase = { persisted: false, inserted: false, insertedCount: 0, skippedReason: 'NO_DATABASE' } as const;
const writeFailed = { persisted: false, inserted: false, insertedCount: 0, skippedReason: 'WRITE_FAILED' } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ingestBatch — database state is probed, never assumed', () => {
  it('NOT_CONFIGURED: validates but attempts no write and claims none', async () => {
    const appendBar = vi.spyOn(CanonicalMarketDataRepository, 'appendBar');
    const appendQuality = vi.spyOn(CanonicalMarketDataRepository, 'appendQuality');
    const report = await CanonicalMarketDataIngestionService.ingestBatch(
      batch([obs('2026-04-08'), obs('2026-04-09')]),
      { now: NOW, databaseHealthCheck: health('NOT_CONFIGURED') }
    );
    expect(appendBar).not.toHaveBeenCalled();
    expect(appendQuality).not.toHaveBeenCalled();
    expect(report.databaseConfigured).toBe(false);
    expect(report.databaseState).toBe('NOT_CONFIGURED');
    expect(report.accepted).toBe(2);
    expect(report.persistedBars).toBe(0);
    expect(report.unpersistedBars).toBe(2);
    expect(report.persistenceStatus).toBe('NOT_PERSISTED');
  });

  it('configured but UNAVAILABLE: no write is attempted and nothing is reported as written', async () => {
    const appendBar = vi.spyOn(CanonicalMarketDataRepository, 'appendBar');
    const report = await CanonicalMarketDataIngestionService.ingestBatch(batch([obs('2026-04-09')]), {
      now: NOW,
      databaseHealthCheck: health('UNAVAILABLE'),
    });
    expect(appendBar).not.toHaveBeenCalled();
    expect(report.databaseConfigured).toBe(true);
    expect(report.databaseState).toBe('UNAVAILABLE');
    expect(report.persistedBars).toBe(0);
    expect(report.persistenceStatus).toBe('NOT_PERSISTED');
  });

  it('CONNECTED: every write lands and the report says PERSISTED', async () => {
    vi.spyOn(CanonicalMarketDataRepository, 'appendBar').mockResolvedValue(written);
    const appendQuality = vi
      .spyOn(CanonicalMarketDataRepository, 'appendQuality')
      .mockImplementation(async (rows) => ({ ...written, insertedCount: rows.length }));
    const report = await CanonicalMarketDataIngestionService.ingestBatch(
      batch([obs('2026-04-08'), obs('2026-04-09')]),
      { now: NOW, databaseHealthCheck: health('CONNECTED') }
    );
    expect(report.databaseState).toBe('CONNECTED');
    expect(report.persistedBars).toBe(2);
    expect(report.persistedQualityRows).toBe(2);
    expect(appendQuality).toHaveBeenCalledTimes(1);
    expect(report.persistenceStatus).toBe('PERSISTED');
  });

  it('re-ingesting existing bars counts duplicates, not new writes', async () => {
    vi.spyOn(CanonicalMarketDataRepository, 'appendBar').mockResolvedValue(duplicate);
    vi.spyOn(CanonicalMarketDataRepository, 'appendQuality').mockResolvedValue(duplicate);
    const report = await CanonicalMarketDataIngestionService.ingestBatch(batch([obs('2026-04-09')]), {
      now: NOW,
      databaseHealthCheck: health('CONNECTED'),
    });
    expect(report.persistedBars).toBe(0);
    expect(report.duplicateBars).toBe(1);
    expect(report.persistedQualityRows).toBe(0);
    expect(report.persistenceStatus).toBe('PERSISTED');
  });

  it('a connection lost mid-batch stops further writes and reports PARTIAL + UNAVAILABLE', async () => {
    const appendBar = vi
      .spyOn(CanonicalMarketDataRepository, 'appendBar')
      .mockResolvedValueOnce(written)
      .mockResolvedValueOnce(noDatabase);
    const appendQuality = vi.spyOn(CanonicalMarketDataRepository, 'appendQuality');
    const report = await CanonicalMarketDataIngestionService.ingestBatch(
      batch([obs('2026-04-07'), obs('2026-04-08'), obs('2026-04-09')]),
      { now: NOW, databaseHealthCheck: health('CONNECTED') }
    );
    // The third bar is never attempted: no per-bar timeout storm against a dead pool.
    expect(appendBar).toHaveBeenCalledTimes(2);
    expect(appendQuality).not.toHaveBeenCalled();
    expect(report.persistedBars).toBe(1);
    expect(report.unpersistedBars).toBe(2);
    expect(report.databaseState).toBe('UNAVAILABLE');
    expect(report.persistenceStatus).toBe('PARTIAL');
  });

  it('a statement-level failure on one bar is counted and does not stop the batch', async () => {
    const appendBar = vi
      .spyOn(CanonicalMarketDataRepository, 'appendBar')
      .mockResolvedValueOnce(writeFailed)
      .mockResolvedValueOnce(written);
    vi.spyOn(CanonicalMarketDataRepository, 'appendQuality').mockResolvedValue(written);
    const report = await CanonicalMarketDataIngestionService.ingestBatch(
      batch([obs('2026-04-08'), obs('2026-04-09')]),
      { now: NOW, databaseHealthCheck: health('CONNECTED') }
    );
    expect(appendBar).toHaveBeenCalledTimes(2);
    expect(report.failedWrites).toBe(1);
    expect(report.persistedBars).toBe(1);
    expect(report.databaseState).toBe('CONNECTED');
    expect(report.persistenceStatus).toBe('PARTIAL');
  });

  it('an empty batch never probes the database', async () => {
    const probe = vi.fn(health('CONNECTED'));
    const report = await CanonicalMarketDataIngestionService.ingestBatch(batch([]), {
      now: NOW,
      databaseHealthCheck: probe,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(report.persistenceStatus).toBe('NOTHING_TO_PERSIST');
  });
});

describe('POST /api/canonical-data/ingest — no success without persistence', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });

  async function post(path: string): Promise<{ status: number; json: any }> {
    const app = express();
    app.use(express.json());
    app.use('/api/canonical-data', createCanonicalDataApiRouter());
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/canonical-data${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '2026-04-01', to: '2026-04-09' }),
    });
    return { status: res.status, json: await res.json() };
  }

  it('answers 503 PERSISTENCE_UNAVAILABLE when the provider answered but nothing was written', async () => {
    vi.spyOn(KbsHistoricalProvider, 'getDailyHistory').mockResolvedValue([
      { date: '2026-04-09', open: 27_800, high: 28_700, low: 27_600, close: 28_500, volume: 1_000, value: 28_500_000 },
    ]);
    vi.spyOn(CanonicalMarketDataIngestionService, 'ingestBatch').mockResolvedValue({
      source: 'KBS',
      sourceUnavailable: false,
      received: 1,
      accepted: 1,
      rejected: 0,
      persistedBars: 0,
      duplicateBars: 0,
      persistedQualityRows: 0,
      databaseConfigured: true,
      databaseState: 'UNAVAILABLE',
      persistenceStatus: 'NOT_PERSISTED',
      unpersistedBars: 1,
      failedWrites: 0,
      rejections: [],
    });
    const { status, json } = await post('/ingest/HPG');
    expect(status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.dataStatus).toBe('PERSISTENCE_UNAVAILABLE');
    expect(json.written).toBe(false);
    expect(json.databaseState).toBe('UNAVAILABLE');
  });
});
