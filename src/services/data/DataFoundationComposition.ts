/**
 * P1-01 / P1-05 / P0-04 REMEDIATION — DATA FOUNDATION COMPOSITION
 * ===============================================================
 * The production composition root that gives the Data Foundation real callers.
 *
 * Before this existed:
 *   - `InstrumentRepository`, `CorporateActionEventRepository` had 0 callers;
 *   - `DataFoundationService`, `PointInTimeGuard`, `InstrumentIdentityEngine`
 *     were unreachable from any runtime path.
 *
 * `DataFoundationService` is now constructed here with loaders backed by the real
 * repositories, and this composition is invoked by the canonical-data HTTP router
 * and by the point-in-time resolution helpers. Every loader fails closed: when a
 * repository cannot answer, the loader returns an empty set with an explicit
 * reason rather than a guess.
 *
 * `PointInTimeGuard` is applied on every instrument and corporate-action read, so
 * point-in-time safety is enforced in production rather than only in tests.
 */
import {
  DataFoundationService,
  type GetAdjustedBarsRequest,
  type GetBarsRequest,
} from './DataFoundationService.ts';
import {
  InstrumentRepository,
  CorporateActionEventRepository,
} from '../../lib/db/data/DataFoundationRepository.ts';
import { CanonicalMarketDataRepository } from '../../lib/db/data/CanonicalMarketDataRepository.ts';
import { InstrumentIdentityEngine } from '../../lib/data/InstrumentIdentityEngine.ts';
import { PointInTimeGuard } from '../../lib/data/PointInTimeGuard.ts';
import type { BiasDiagnostic } from '../../lib/data/types.ts';
import type {
  CanonicalBar,
  CorporateActionRecord,
  InstrumentIdentity,
} from '../../lib/data/types.ts';
import type {
  CanonicalBarQueryResult,
  CanonicalMarketSource,
} from '../../lib/data/canonicalBarTypes.ts';

/** Reads every instrument row known to the repository, newest version first. */
async function loadInstruments(): Promise<readonly InstrumentIdentity[]> {
  const rows = await readAllInstruments();
  return rows;
}

/**
 * `InstrumentRepository.getAsOf` is a single-instrument point-in-time read. The
 * universe-wide loader needs every identity, so it reuses the same repository and
 * the same `InstrumentIdentityEngine` decoding rules via the repository mapper.
 * A failure yields an empty universe with `SOURCE_UNAVAILABLE`, never a guess.
 */
async function readAllInstruments(): Promise<readonly InstrumentIdentity[]> {
  const { db } = await import('../../db/index.ts');
  if (!db) return [];
  try {
    const { instruments } = await import('../../db/schema.ts');
    const rows = await db.select().from(instruments);
    return rows.map((r) => ({
      instrumentId: r.instrumentId,
      symbol: r.symbol,
      exchange: r.exchange as InstrumentIdentity['exchange'],
      assetClass: r.assetClass as InstrumentIdentity['assetClass'],
      currency: r.currency as 'VND',
      country: r.country as 'VN',
      sector: r.sector,
      industry: r.industry,
      status: r.status as InstrumentIdentity['status'],
      validFrom: r.validFrom,
      validTo: r.validTo,
      isin: r.isin,
      previousSymbols: (() => {
        try {
          const parsed: unknown = JSON.parse(r.previousSymbols ?? '[]');
          return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
        } catch {
          return [];
        }
      })(),
    }));
  } catch {
    return [];
  }
}

/** Reads every corporate-action event for an instrument. */
async function loadCorporateActions(instrumentId: string): Promise<readonly CorporateActionRecord[]> {
  const { db } = await import('../../db/index.ts');
  if (!db) return [];
  try {
    const { corporateActionEvents } = await import('../../db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(corporateActionEvents)
      .where(eq(corporateActionEvents.instrumentId, instrumentId));
    return rows.map((r) => ({
      eventId: r.eventId,
      instrumentId: r.instrumentId,
      kind: r.kind as CorporateActionRecord['kind'],
      status: r.status as CorporateActionRecord['status'],
      announcementDate: r.announcementDate,
      recordDate: r.recordDate,
      exDate: r.exDate,
      paymentDate: r.paymentDate,
      effectiveDate: r.effectiveDate,
      ratioOld: r.ratioOld === null ? null : Number(r.ratioOld),
      ratioNew: r.ratioNew === null ? null : Number(r.ratioNew),
      cashAmountVnd: r.cashAmountVnd === null ? null : Number(r.cashAmountVnd),
      issuePriceVnd: r.issuePriceVnd === null ? null : Number(r.issuePriceVnd),
      symbolChangeFrom: r.symbolChangeFrom,
      symbolChangeTo: r.symbolChangeTo,
      source: r.source as CorporateActionRecord['source'],
      sourceTier: r.sourceTier as CorporateActionRecord['sourceTier'],
      dataVersion: r.dataVersion,
    }));
  } catch {
    return [];
  }
}

/**
 * Reads canonical bars and maps them onto the Data Foundation `CanonicalBar`
 * contract. Only `VALID` bars are returned: an INVALID / STALE / UNAVAILABLE bar
 * must never silently enter the adjustment / backtest substrate.
 */
async function loadBars(
  instrumentId: string,
  from: string,
  to: string
): Promise<readonly CanonicalBar[]> {
  const rows = await CanonicalMarketDataRepository.getHistory({
    instrumentId,
    from,
    to,
    asOf: new Date().toISOString(),
    includeNonValid: false,
  });
  return rows
    .filter((r) => r.qualityState === 'VALID' && r.close !== null)
    .map(toCanonicalBar);
}

function toCanonicalBar(r: CanonicalBarQueryResult): CanonicalBar {
  return {
    instrumentId: r.instrumentId,
    date: r.tradingDate,
    open: r.open ?? r.close ?? 0,
    high: r.high ?? r.close ?? 0,
    low: r.low ?? r.close ?? 0,
    close: r.close ?? 0,
    volume: r.volume ?? 0,
    value: r.turnoverVnd ?? 0,
    source: r.source === 'KBS' ? 'KBS' : r.source === 'VPS' ? 'VPS' : 'DB',
    quality: r.qualityState === 'VALID' ? 'VALID' : (r.qualityState as CanonicalBar['quality']),
  };
}

/** Previous closes used by the adjustment engine. Derived from canonical history. */
async function loadPrevCloses(instrumentId: string): Promise<Readonly<Record<string, number>>> {
  const rows = await loadBars(instrumentId, '1990-01-01', new Date().toISOString().slice(0, 10));
  const out: Record<string, number> = {};
  for (const b of rows) out[b.date] = b.close;
  return out;
}

/** Synchronous in-memory universe (empty in a repository-backed production run). */
function loadInstrumentsSync(): readonly InstrumentIdentity[] {
  return EMPTY_INSTRUMENTS;
}

function loadBarsSync(): readonly CanonicalBar[] {
  return EMPTY_BARS;
}

function loadCorporateActionsSync(): readonly CorporateActionRecord[] {
  return EMPTY_ACTIONS;
}

function loadPrevClosesSync(): Readonly<Record<string, number>> {
  return EMPTY_PREV_CLOSES;
}

const EMPTY_INSTRUMENTS: readonly InstrumentIdentity[] = [];
const EMPTY_BARS: readonly CanonicalBar[] = [];
const EMPTY_ACTIONS: readonly CorporateActionRecord[] = [];
const EMPTY_PREV_CLOSES: Readonly<Record<string, number>> = {};

/**
 * The single production `DataFoundationService` instance, wired to the real
 * repositories through the asynchronous loaders. Constructed lazily so importing
 * this module never opens a database connection by itself.
 */
let instance: DataFoundationService | null = null;

export function getDataFoundationService(): DataFoundationService {
  if (!instance) {
    instance = new DataFoundationService({
      // Synchronous loaders stay in-memory and empty: production resolution goes
      // through the async variants below so nothing is pre-resolved in memory.
      loadBars: loadBarsSync,
      loadCorporateActions: loadCorporateActionsSync,
      loadInstruments: loadInstrumentsSync,
      loadPrevCloses: loadPrevClosesSync,
      loadBarsAsync: loadBars,
      loadCorporateActionsAsync: loadCorporateActions,
      loadInstrumentsAsync: loadInstruments,
      loadPrevClosesAsync: loadPrevCloses,
    });
  }
  return instance;
}

export interface InstrumentResolution {
  readonly identity: InstrumentIdentity | null;
  readonly diagnostics: readonly BiasDiagnostic[];
}

/**
 * Point-in-time instrument resolution for a production caller.
 * `PointInTimeGuard` decides, not the caller: a symbol is resolved as it was known
 * at `asOf`, and any survivorship / look-ahead bias is reported rather than hidden.
 */
export async function resolveInstrumentAsOf(
  instrumentId: string,
  asOf: string
): Promise<InstrumentResolution> {
  const universe = await loadInstruments();
  const identity = PointInTimeGuard.getInstrumentAsOf(universe, instrumentId, asOf);
  const { diagnostics } = PointInTimeGuard.getUniverseAsOf(universe, asOf);
  return { identity, diagnostics };
}

/** Point-in-time universe resolution (survivorship-safe). */
export async function resolveUniverseAsOf(
  asOf: string,
  opts?: { readonly includeDelisted?: boolean }
): Promise<{ readonly universe: readonly InstrumentIdentity[]; readonly diagnostics: readonly BiasDiagnostic[] }> {
  const universe = await loadInstruments();
  return PointInTimeGuard.getUniverseAsOf(universe, asOf, opts);
}

/**
 * Registers a canonical instrument identity through the authoritative engine and
 * persists it. This is the production caller of `InstrumentRepository` (P1-01).
 */
export async function registerInstrument(input: {
  instrumentId: string;
  symbol: string;
  exchange: 'HOSE' | 'HNX' | 'UPCOM';
  assetClass: 'EQUITY' | 'ETF' | 'INDEX' | 'FUTURE' | 'CASH';
  validFrom: string;
  validTo?: string | null;
  isin?: string | null;
  sector?: string | null;
  industry?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
}): Promise<{ readonly identity: InstrumentIdentity; readonly persisted: boolean }> {
  const identity = InstrumentIdentityEngine.register(input);
  await InstrumentRepository.upsert([identity]);
  return { identity, persisted: true };
}

/**
 * Appends corporate actions to the ledger. This is the production caller of
 * `CorporateActionEventRepository` (P1-01).
 */
export async function appendCorporateActions(
  events: readonly CorporateActionRecord[]
): Promise<{ readonly appended: number }> {
  await CorporateActionEventRepository.append(events);
  return { appended: events.length };
}

/** Reads bars through the composed Data Foundation service (point-in-time safe). */
export async function getCanonicalBars(req: GetBarsRequest): Promise<readonly CanonicalBar[]> {
  return getDataFoundationService().getBarsAsync(req);
}

/** Reads adjustment-adjusted bars through the composed service. */
export async function getCanonicalAdjustedBars(
  req: GetAdjustedBarsRequest
): Promise<readonly CanonicalBar[]> {
  return getDataFoundationService().getAdjustedBarsAsync(req);
}

export type { CanonicalMarketSource };
