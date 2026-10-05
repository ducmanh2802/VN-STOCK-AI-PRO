/**
 * P0-04 REGRESSION SUITE — CANONICAL BAR / PROVENANCE / QUALITY PERSISTENCE
 * =========================================================================
 * Proves the missing data-foundation persistence actually exists and is wired:
 *
 *   - migration 0013 reserves a genuinely unused ID and creates the four tables;
 *   - the drizzle schema mirrors the migration;
 *   - identity is instrumentId-based, never ticker text;
 *   - validation is deterministic and fail-closed on every audited defect class;
 *   - provenance and quality are produced for every bar;
 *   - historical reads are point-in-time safe (no look-ahead);
 *   - the chain has a real production caller (HTTP route) and a real query path.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import type { Server } from 'http';

import {
  validateCanonicalBar,
  buildBarKey,
  buildProvenanceRecord,
  buildQualityRecord,
} from '../../../lib/data/canonicalBarValidation.ts';
import { CANONICAL_BAR_RULE_VERSION } from '../../../lib/data/canonicalBarTypes.ts';
import type { CanonicalBarInput } from '../../../lib/data/canonicalBarTypes.ts';
import { InstrumentIdentityEngine } from '../../../lib/data/InstrumentIdentityEngine.ts';
import {
  createCanonicalDataApiRouter,
  resolveInstrumentId,
  resolveExchange,
} from '../CanonicalDataApiRouter.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__ -> data -> services -> src  => repo root
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

const NOW_MS = Date.parse('2026-04-10T08:00:00.000Z');
const NOW_ISO = new Date(NOW_MS).toISOString();

function baseInput(overrides: Partial<CanonicalBarInput> = {}): CanonicalBarInput {
  return {
    instrumentId: 'HOSE:HPG',
    symbol: 'HPG',
    exchange: 'HOSE',
    timeframe: '1D',
    barTime: '2026-04-09T07:00:00.000Z',
    tradingDate: '2026-04-09',
    open: 27_800,
    high: 28_700,
    low: 27_600,
    close: 28_500,
    volume: 15_000_000,
    turnoverVnd: 427_500_000_000,
    adjustmentState: 'RAW',
    adjustmentFactor: null,
    source: 'KBS',
    sourceTier: 'TIER_2_EXCHANGE',
    sourceRecordId: 'KBS|HPG|1D|2026-04-09',
    provider: 'KbsHistoricalProvider',
    providerVersion: null,
    observationTime: '2026-04-09T07:00:00.000Z',
    publicationTime: '2026-04-09T08:00:00.000Z',
    effectiveTime: '2026-04-09T08:00:00.000Z',
    ingestionTime: NOW_ISO,
    dataVersion: 'v1.0.0-canonical-1d',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Migration safety (P0-04 §20)
// ---------------------------------------------------------------------------
describe('P0-04 — migration safety', () => {
  const drizzleDir = resolve(REPO_ROOT, 'drizzle');

  it('0013 is the first unused migration id; 0000-0012 are untouched', () => {
    const files = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
    const ids = files.map((f) => Number(f.slice(0, 4)));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids[0]).toBe(0);
    expect(ids[ids.length - 1]).toBe(13);
    // No duplicate ids.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the P0-04 migration creates exactly the four canonical tables', () => {
    const sql = readFileSync(resolve(drizzleDir, '0013_canonical_market_data.sql'), 'utf8');
    for (const table of [
      'canonical_market_bars',
      'canonical_data_provenance',
      'canonical_data_quality',
      'canonical_source_agreement',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it('the migration is idempotent (IF NOT EXISTS) and never drops anything', () => {
    const sql = readFileSync(resolve(drizzleDir, '0013_canonical_market_data.sql'), 'utf8');
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|INDEX|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+"?instruments"?/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+"?corporate_action_events"?/i);
    const creates = sql.match(/CREATE TABLE IF NOT EXISTS/gi) ?? [];
    expect(creates).toHaveLength(4);
  });

  it('the migration is additive only: it never edits an earlier migration', () => {
    // Guards the "do not modify already-used migrations" rule structurally.
    const files = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql') && f < '0013_');
    for (const f of files) {
      const sql = readFileSync(resolve(drizzleDir, f), 'utf8');
      expect(sql).not.toMatch(/canonical_market_bars|canonical_data_provenance|canonical_data_quality/);
    }
  });

  it('the drizzle schema declares every table the migration creates', () => {
    const schema = readFileSync(resolve(REPO_ROOT, 'src/db/schema.ts'), 'utf8');
    for (const t of [
      "'canonical_market_bars'",
      "'canonical_data_provenance'",
      "'canonical_data_quality'",
      "'canonical_source_agreement'",
    ]) {
      expect(schema).toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Canonical identity (P0-04 §15)
// ---------------------------------------------------------------------------
describe('P0-04 — canonical bar identity is instrument-based', () => {
  it('the bar key contains the instrumentId, source, timeframe, bar time and version', () => {
    const key = buildBarKey({
      instrumentId: 'HOSE:HPG',
      source: 'KBS',
      timeframe: '1D',
      barTime: '2026-04-09T07:00:00.000Z',
      dataVersion: 'v1.0.0-canonical-1d',
    });
    expect(key).toBe('HOSE:HPG|KBS|1D|2026-04-09T07:00:00.000Z|v1.0.0-canonical-1d');
    expect(key).toContain('HOSE:HPG');
    expect(key).not.toMatch(/^HPG\|/);
  });

  it('ticker text alone is not the identity: two exchanges, two identities', () => {
    const hose = buildBarKey({
      instrumentId: resolveInstrumentId('HPG', 'HOSE'),
      source: 'KBS',
      timeframe: '1D',
      barTime: '2026-04-09T07:00:00.000Z',
      dataVersion: 'v1',
    });
    const hnx = buildBarKey({
      instrumentId: resolveInstrumentId('HPG', 'HNX'),
      source: 'KBS',
      timeframe: '1D',
      barTime: '2026-04-09T07:00:00.000Z',
      dataVersion: 'v1',
    });
    expect(hose).not.toBe(hnx);
    expect(resolveInstrumentId('HPG', 'HOSE')).not.toBe(resolveInstrumentId('HPG', 'HNX'));
  });

  it('the resolved instrumentId satisfies the canonical InstrumentIdentityEngine', () => {
    const id = InstrumentIdentityEngine.register({
      instrumentId: resolveInstrumentId('HPG', 'HOSE'),
      symbol: 'HPG',
      exchange: 'HOSE',
      assetClass: 'EQUITY',
      validFrom: '2026-01-01',
    });
    expect(id.instrumentId).toBe('HOSE:HPG');
    expect(id.symbol).toBe('HPG');
  });

  it('the same observation from two sources yields two distinct bars', () => {
    const kbs = validateCanonicalBar(baseInput({ source: 'KBS' }), { nowMs: NOW_MS });
    const vps = validateCanonicalBar(baseInput({ source: 'VPS' }), { nowMs: NOW_MS });
    expect(kbs.record!.barKey).not.toBe(vps.record!.barKey);
  });
});

// ---------------------------------------------------------------------------
// 3. Deterministic validation (P0-04 §17)
// ---------------------------------------------------------------------------
describe('P0-04 — validation is deterministic and fail-closed', () => {
  it('accepts a well-formed bar', () => {
    const r = validateCanonicalBar(baseInput(), { nowMs: NOW_MS });
    expect(r.ok).toBe(true);
    expect(r.record!.qualityState).toBe('VALID');
    expect(r.record!.qualityReason).toBe('OK');
    expect(r.record!.isSynthetic).toBe(false);
    expect(r.record!.barKey).toBeTruthy();
  });

  it('rejects a bar with no source identifier (no provenance)', () => {
    const r = validateCanonicalBar(baseInput({ sourceRecordId: '  ' }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('SOURCE_MISMATCH');
    expect(r.rejection!.detail).toMatch(/sourceRecordId is required/);
  });

  it('rejects a bar with no provider', () => {
    const r = validateCanonicalBar(baseInput({ provider: '' }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('SOURCE_MISMATCH');
  });

  it('rejects a missing instrument identity', () => {
    const r = validateCanonicalBar(baseInput({ instrumentId: '' }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('SOURCE_MISMATCH');
  });

  it('rejects a missing close price as UNAVAILABLE', () => {
    const r = validateCanonicalBar(baseInput({ close: null }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.qualityState).toBe('UNAVAILABLE');
    expect(r.rejection!.reason).toBe('MISSING_REQUIRED_FIELD');
  });

  it('rejects non-positive prices', () => {
    const r = validateCanonicalBar(baseInput({ close: 0 }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('NON_POSITIVE_PRICE');
  });

  it('rejects OHLC inconsistency (high below low)', () => {
    const r = validateCanonicalBar(baseInput({ high: 27_000, low: 28_000, close: 28_500 }), {
      nowMs: NOW_MS,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('OHLC_INCONSISTENT');
  });

  it('rejects a close outside the high/low band', () => {
    const r = validateCanonicalBar(baseInput({ high: 28_000, close: 28_500 }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('OHLC_INCONSISTENT');
  });

  it('rejects negative volume', () => {
    const r = validateCanonicalBar(baseInput({ volume: -1 }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('NEGATIVE_VOLUME');
  });

  it('rejects an invalid timestamp', () => {
    const r = validateCanonicalBar(baseInput({ barTime: 'not-a-date' }), { nowMs: NOW_MS });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('INVALID_TIMESTAMP');
  });

  it('rejects a future bar (look-ahead at ingestion time)', () => {
    const r = validateCanonicalBar(baseInput({ barTime: '2026-04-20T07:00:00.000Z' }), {
      nowMs: NOW_MS,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('FUTURE_TIMESTAMP');
  });

  it('rejects an ingestion that precedes the observation', () => {
    const r = validateCanonicalBar(
      baseInput({ ingestionTime: '2026-04-01T00:00:00.000Z', observationTime: '2026-04-09T07:00:00.000Z' }),
      { nowMs: NOW_MS }
    );
    expect(r.ok).toBe(false);
    expect(r.rejection!.reason).toBe('INVALID_TIMESTAMP');
  });

  it('marks an aged bar STALE rather than dropping it', () => {
    const r = validateCanonicalBar(baseInput(), { nowMs: NOW_MS, maxAgeMs: 1000 });
    expect(r.ok).toBe(true);
    expect(r.record!.qualityState).toBe('STALE');
    expect(r.record!.qualityReason).toBe('BEYOND_MAX_STALENESS');
  });

  it('never silently repairs an OHLC violation', () => {
    const bad = baseInput({ high: 27_000, low: 28_000, close: 28_500 });
    const r = validateCanonicalBar(bad, { nowMs: NOW_MS });
    expect(r.record).toBeNull();
    // The input object is untouched — no mutation-based "fix".
    expect(bad.high).toBe(27_000);
    expect(bad.low).toBe(28_000);
  });

  it('records every deterministic repair it does apply', () => {
    const r = validateCanonicalBar(
      baseInput({ tradingDate: '', effectiveTime: null, publicationTime: null }),
      { nowMs: NOW_MS }
    );
    expect(r.ok).toBe(true);
    expect(r.record!.tradingDate).toBe('2026-04-09');
    expect(r.record!.effectiveTime).toBe('2026-04-09T07:00:00.000Z');
    expect(r.record!.transformVersion).toBe(CANONICAL_BAR_RULE_VERSION);
    expect(r.record!.transformNote).toMatch(/derived/);
  });

  it('is deterministic: identical input yields an identical verdict', () => {
    const a = validateCanonicalBar(baseInput(), { nowMs: NOW_MS });
    const b = validateCanonicalBar(baseInput(), { nowMs: NOW_MS });
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// 4. Provenance (P0-04 §16)
// ---------------------------------------------------------------------------
describe('P0-04 — provenance is complete and durable', () => {
  it('every provenance row carries source, source id, times, provider and version', () => {
    const bar = validateCanonicalBar(baseInput(), { nowMs: NOW_MS }).record!;
    const prov = buildProvenanceRecord(bar, `${bar.barKey}|prov`);
    expect(prov.source).toBe('KBS');
    expect(prov.sourceRecordId).toBe('KBS|HPG|1D|2026-04-09');
    expect(prov.provider).toBe('KbsHistoricalProvider');
    expect(prov.dataVersion).toBe('v1.0.0-canonical-1d');
    expect(prov.observationTime).toBe('2026-04-09T07:00:00.000Z');
    expect(prov.publicationTime).toBe('2026-04-09T08:00:00.000Z');
    expect(prov.effectiveTime).toBe('2026-04-09T08:00:00.000Z');
    expect(prov.ingestionTime).toBe(NOW_ISO);
    expect(prov.barKey).toBe(bar.barKey);
  });

  it('provenance is written in the same call as the bar (never orphaned)', async () => {
    const repoSrc = readFileSync(
      resolve(REPO_ROOT, 'src/lib/db/data/CanonicalMarketDataRepository.ts'),
      'utf8'
    );
    const appendBarBody = repoSrc.slice(
      repoSrc.indexOf('static async appendBar'),
      repoSrc.indexOf('static async appendQuality')
    );
    expect(appendBarBody).toContain('canonicalMarketBars');
    expect(appendBarBody).toContain('canonicalDataProvenance');
  });

  it('the repository refuses to write a synthetic bar', async () => {
    const { CanonicalMarketDataRepository } = await import(
      '../../../lib/db/data/CanonicalMarketDataRepository.ts'
    );
    const bar = { ...validateCanonicalBar(baseInput(), { nowMs: NOW_MS }).record!, isSynthetic: true as const };
    await expect(
      CanonicalMarketDataRepository.appendBar(bar as never, {} as never)
    ).rejects.toThrow(/SYNTHETIC_BAR_REFUSED/);
  });
});

// ---------------------------------------------------------------------------
// 5. Quality (P0-04 §17)
// ---------------------------------------------------------------------------
describe('P0-04 — quality is explicit and rule-versioned', () => {
  it('a quality row records the rule version and both value sets', () => {
    const bar = validateCanonicalBar(baseInput(), { nowMs: NOW_MS }).record!;
    const q = buildQualityRecord({
      qualityId: `${bar.barKey}|quality`,
      barKey: bar.barKey,
      instrumentId: bar.instrumentId,
      tradingDate: bar.tradingDate,
      source: bar.source,
      qualityState: bar.qualityState,
      reason: bar.qualityReason,
      detail: bar.qualityDetail,
      evaluatedAt: NOW_ISO,
      sourceValues: { close: bar.close },
      resolvedValues: { effectiveTime: bar.effectiveTime },
    });
    expect(q.checkedRuleVersion).toBe(CANONICAL_BAR_RULE_VERSION);
    expect(q.qualityState).toBe('VALID');
    expect(JSON.parse(q.sourceValues!)).toEqual({ close: 28_500 });
    expect(JSON.parse(q.resolvedValues!)).toEqual({ effectiveTime: '2026-04-09T08:00:00.000Z' });
  });

  it('every quality state in the migration enum is reachable by the validator', async () => {
    const schema = await import('../../../db/schema.ts');
    const reachable = new Set<string>();
    reachable.add(
      validateCanonicalBar(baseInput(), { nowMs: NOW_MS }).record!.qualityState
    );
    reachable.add(
      validateCanonicalBar(baseInput(), { nowMs: NOW_MS, maxAgeMs: 1 }).record!.qualityState
    );
    const invalid = validateCanonicalBar(baseInput({ close: -1 }), { nowMs: NOW_MS });
    reachable.add(invalid.rejection!.qualityState);
    const unavailable = validateCanonicalBar(baseInput({ close: null }), { nowMs: NOW_MS });
    reachable.add(unavailable.rejection!.qualityState);

    expect([...reachable].sort()).toEqual([...schema.CANONICAL_QUALITY_STATES].sort());
  });
});

// ---------------------------------------------------------------------------
// 6. Point-in-time safety (P0-04 §19)
// ---------------------------------------------------------------------------
describe('P0-04 — historical reads cannot see the future', () => {
  it('the read API filters on effective_time, not ingestion time', () => {
    const repoSrc = readFileSync(
      resolve(REPO_ROOT, 'src/lib/db/data/CanonicalMarketDataRepository.ts'),
      'utf8'
    );
    const readBody = repoSrc.slice(
      repoSrc.indexOf('static async getHistory'),
      repoSrc.indexOf('static async getProvenance')
    );
    expect(readBody).toContain('canonicalMarketBars.effectiveTime');
    expect(readBody).not.toContain('canonicalMarketBars.ingestedAt');
  });

  it('effective time defaults to the latest knowable source instant', () => {
    const withPublication = validateCanonicalBar(
      baseInput({ effectiveTime: null }),
      { nowMs: NOW_MS }
    );
    expect(withPublication.record!.effectiveTime).toBe('2026-04-09T08:00:00.000Z');

    const withoutPublication = validateCanonicalBar(
      baseInput({ effectiveTime: null, publicationTime: null }),
      { nowMs: NOW_MS }
    );
    expect(withoutPublication.record!.effectiveTime).toBe('2026-04-09T07:00:00.000Z');
  });

  it('a bar published after its trading date stays invisible until it was published', () => {
    // The bar is knowable only from its publication instant onward.
    const bar = validateCanonicalBar(
      baseInput({ publicationTime: '2026-04-09T18:00:00.000Z', effectiveTime: null }),
      { nowMs: Date.parse('2026-04-11T08:00:00.000Z') }
    ).record!;
    expect(bar.effectiveTime).toBe('2026-04-09T18:00:00.000Z');
    expect(Date.parse(bar.effectiveTime) > Date.parse('2026-04-09T08:00:00.000Z')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Multi-source (P0-04 §18)
// ---------------------------------------------------------------------------
describe('P0-04 — multi-source disagreement is recorded, not resolved', () => {
  it('KBS, VPS and VNDIRECT all remain valid source-of-truth identifiers', async () => {
    const types = await import('../../../lib/data/canonicalBarTypes.ts');
    expect(types.CANONICAL_MARKET_SOURCES).toEqual(['KBS', 'VPS', 'VNDIRECT']);
  });

  it('classifies agreement states without picking a convenient number', async () => {
    const { CanonicalMarketDataIngestionService } = await import(
      '../CanonicalMarketDataIngestionService.ts'
    );
    const now = new Date(NOW_MS);
    const base = {
      instrumentId: 'HOSE:HPG',
      tradingDate: '2026-04-09',
      timeframe: '1D' as const,
      primarySource: 'KBS' as const,
      comparedSource: 'VPS' as const,
      tolerancePercent: 10,
      now,
    };

    const agree = await CanonicalMarketDataIngestionService.recordCrossSourceCheck({
      ...base,
      primaryClose: 28_500,
      comparedClose: 28_500,
    });
    expect(agree.agreementState).toBe('AGREE');

    const tolerated = await CanonicalMarketDataIngestionService.recordCrossSourceCheck({
      ...base,
      primaryClose: 28_800,
      comparedClose: 28_500,
    });
    expect(tolerated.agreementState).toBe('TOLERATED');
    expect(tolerated.deviationPercent).toBeGreaterThan(0);

    const mismatch = await CanonicalMarketDataIngestionService.recordCrossSourceCheck({
      ...base,
      primaryClose: 35_000,
      comparedClose: 28_500,
    });
    expect(mismatch.agreementState).toBe('MISMATCH');

    const insufficient = await CanonicalMarketDataIngestionService.recordCrossSourceCheck({
      ...base,
      primaryClose: 0,
      comparedClose: 28_500,
    });
    expect(insufficient.agreementState).toBe('INSUFFICIENT_DATA');
  });
});

// ---------------------------------------------------------------------------
// 8. Repository integration (P0-04 §21) — a table without a caller is NOT integrated
// ---------------------------------------------------------------------------
describe('P0-04 — the persistence chain has real production callers', () => {
  it('server.ts mounts the canonical-data router', () => {
    const server = readFileSync(resolve(REPO_ROOT, 'server.ts'), 'utf8');
    expect(server).toContain("createCanonicalDataApiRouter");
    expect(server).toMatch(/app\.use\(\s*'\/api\/canonical-data'/);
  });

  it('the ingestion service is called by the router (not test-only)', () => {
    const router = readFileSync(resolve(REPO_ROOT, 'src/services/data/CanonicalDataApiRouter.ts'), 'utf8');
    expect(router).toContain('CanonicalMarketDataIngestionService.ingestBatch');
    expect(router).toContain('CanonicalMarketDataIngestionService.readHistory');
    expect(router).toContain('KbsHistoricalProvider.getDailyHistory');
    const routerNoComments = router
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(routerNoComments).toContain('CanonicalMarketDataIngestionService.ingestBatch');
  });

  it('the repository is reachable from the Data Foundation service layer', async () => {
    // P1-01 + P1-05: the repositories and the Data Foundation / point-in-time
    // engines now have a real production caller, not just tests.
    const composition = await import('../DataFoundationComposition.ts');
    expect(typeof composition.getDataFoundationService).toBe('function');
    const service = composition.getDataFoundationService();
    expect(service).toBeTruthy();
    expect(typeof service.getBarsAsync).toBe('function');

    const compositionSrc = readFileSync(resolve(REPO_ROOT, 'src/services/data/DataFoundationComposition.ts'), 'utf8');
    expect(compositionSrc).toContain('InstrumentRepository.upsert');
    expect(compositionSrc).toContain('CorporateActionEventRepository.append');
    expect(compositionSrc).toContain('PointInTimeGuard.getInstrumentAsOf');
    expect(compositionSrc).toContain('InstrumentIdentityEngine.register');
    expect(compositionSrc).toContain('CanonicalMarketDataRepository.getHistory');

    // The router reaches the composition, so the whole chain has one entry point.
    const routerSrc = readFileSync(resolve(REPO_ROOT, 'src/services/data/CanonicalDataApiRouter.ts'), 'utf8');
    for (const symbol of [
      'resolveInstrumentAsOf',
      'resolveUniverseAsOf',
      'getCanonicalAdjustedBars',
      'getCanonicalBars',
      'registerInstrument',
    ]) {
      expect(routerSrc).toContain(symbol);
    }
  });

  describe('HTTP surface', () => {
    let server: Server;
    let baseUrl: string;
    let ingestSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      const { CanonicalMarketDataIngestionService } = await import(
        '../CanonicalMarketDataIngestionService.ts'
      );
      ingestSpy = vi
        .spyOn(CanonicalMarketDataIngestionService, 'ingestBatch')
        .mockResolvedValue({
          source: 'KBS',
          sourceUnavailable: false,
          received: 2,
          accepted: 2,
          rejected: 0,
          persistedBars: 2,
          duplicateBars: 0,
          persistedQualityRows: 2,
          databaseConfigured: false,
          rejections: [],
        });

      const app = express();
      app.use(express.json());
      app.use('/api/canonical-data', createCanonicalDataApiRouter());
      server = await new Promise((r) => {
        const s = app.listen(0, '127.0.0.1', () => r(s));
      });
      const { port } = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${port}/api/canonical-data`;
    });

    afterEach(async () => {
      ingestSpy.mockRestore();
      await new Promise<void>((r) => server.close(() => r()));
    });

    it('POST /ingest/:symbol runs the provider -> persistence chain', async () => {
      const res = await fetch(`${baseUrl}/ingest/HPG`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: '2025-01-01', to: '2025-06-30' }),
      });
      const json = await res.json();
      // Either the real provider answered (and the chain ran) or the source is
      // unavailable. Both are explicit; neither fabricates success.
      if (res.ok) {
        expect(ingestSpy).toHaveBeenCalled();
        expect(json.report.persistedBars).toBeGreaterThanOrEqual(0);
        expect(json.instrumentId).toBe('HOSE:HPG');
      } else {
        expect(json.dataStatus).toBe('SOURCE_UNAVAILABLE');
        expect(json.written).toBe(false);
      }
    }, 30_000);

    it('POST /ingest rejects an unsupported (synthetic) source', async () => {
      const res = await fetch(`${baseUrl}/ingest/HPG`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'SYNTHETIC' }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('UNSUPPORTED_SOURCE');
      expect(ingestSpy).not.toHaveBeenCalled();
    });

    it('POST /ingest rejects an invalid symbol', async () => {
      const res = await fetch(`${baseUrl}/ingest/$$$`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect(ingestSpy).not.toHaveBeenCalled();
    });

    it('GET /identity/:symbol returns a canonical instrument identity', async () => {
      const res = await fetch(`${baseUrl}/identity/HPG`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.identity.instrumentId).toBe('HOSE:HPG');
      expect(json.identity.symbol).toBe('HPG');
    });

    it('POST /cross-source-check records a verdict', async () => {
      const res = await fetch(`${baseUrl}/cross-source-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentId: 'HOSE:HPG',
          tradingDate: '2026-04-09',
          primarySource: 'KBS',
          comparedSource: 'VPS',
          primaryClose: 28_500,
          comparedClose: 28_500,
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.record.agreementState).toBe('AGREE');
    });

    it('POST /cross-source-check requires every field (no silent defaults)', async () => {
      const res = await fetch(`${baseUrl}/cross-source-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrumentId: 'HOSE:HPG' }),
      });
      expect(res.status).toBe(400);
      expect(res.status).toBe(400);
    });

    it('GET /bars/:symbol rejects a non-ISO asOf instead of ignoring it', async () => {
      const res = await fetch(`${baseUrl}/bars/HPG?asOf=not-a-date`);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(String(json.error)).toMatch(/INVALID_AS_OF|Invalid canonical query/);
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Full-chain integration through the ingestion service
// ---------------------------------------------------------------------------
describe('P0-04 — provider -> validation -> persistence -> provenance -> quality -> query', () => {
  it('runs the whole chain and reports every stage', async () => {
    const { CanonicalMarketDataIngestionService } = await import(
      '../CanonicalMarketDataIngestionService.ts'
    );
    const report = await CanonicalMarketDataIngestionService.ingestBatch(
      {
        source: 'KBS',
        sourceTier: 'TIER_2_EXCHANGE',
        provider: 'KbsHistoricalProvider',
        providerVersion: null,
        dataVersion: 'v1.0.0-canonical-1d',
        observations: [
          {
            instrumentId: 'HOSE:HPG',
            symbol: 'HPG',
            exchange: 'HOSE',
            timeframe: '1D',
            barTime: '2026-04-09T07:00:00.000Z',
            tradingDate: '2026-04-09',
            open: 27_800,
            high: 28_700,
            low: 27_600,
            close: 28_500,
            volume: 15_000_000,
            turnoverVnd: 427_500_000_000,
            sourceRecordId: 'KBS|HPG|1D|2026-04-09',
            publicationTime: '2026-04-09T08:00:00.000Z',
          },
          // Deliberately invalid: OHLC violation. Must be rejected, not repaired.
          {
            instrumentId: 'HOSE:HPG',
            symbol: 'HPG',
            exchange: 'HOSE',
            timeframe: '1D',
            barTime: '2026-04-08T07:00:00.000Z',
            tradingDate: '2026-04-08',
            open: 27_800,
            high: 27_000,
            low: 28_000,
            close: 27_500,
            volume: 1,
            turnoverVnd: null,
            sourceRecordId: 'KBS|HPG|1D|2026-04-08',
            publicationTime: '2026-04-08T08:00:00.000Z',
          },
        ],
      },
      { now: new Date(NOW_MS), registerInstruments: true, validFrom: '2026-01-01' }
    );

    expect(report.source).toBe('KBS');
    expect(report.received).toBe(2);
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.rejections[0].reason).toBe('OHLC_INCONSISTENT');
    // No database is configured in the unit environment, so the service reports
    // the truth instead of claiming a successful write.
    expect(report.persistedBars).toBe(0);
    expect(report.databaseConfigured).toBe(false);
  });

  it('registers canonical instrument identities through the authoritative engine', async () => {
    const { CanonicalMarketDataIngestionService } = await import(
      '../CanonicalMarketDataIngestionService.ts'
    );
    const identities = CanonicalMarketDataIngestionService.registerInstruments(
      [
        {
          instrumentId: 'HOSE:HPG',
          symbol: 'HPG',
          exchange: 'HOSE',
          timeframe: '1D',
          barTime: '2026-04-09T07:00:00.000Z',
          tradingDate: '2026-04-09',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
          turnoverVnd: 1,
          sourceRecordId: 'x',
        },
        {
          // Malformed identity: skipped, never coerced into a fake one.
          instrumentId: '',
          symbol: 'BAD',
          exchange: 'HOSE',
          timeframe: '1D',
          barTime: '2026-04-09T07:00:00.000Z',
          tradingDate: '2026-04-09',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
          turnoverVnd: 1,
          sourceRecordId: 'y',
        },
      ],
      '2026-01-01'
    );
    expect(identities).toHaveLength(1);
    expect(identities[0].instrumentId).toBe('HOSE:HPG');
  });
});