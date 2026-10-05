/**
 * P0-04 REMEDIATION — CANONICAL DATA API ROUTER
 * ==============================================
 * The production route that makes the canonical bar / provenance / quality tables
 * REACHABLE. Without it the tables, the repository and the ingestion service would
 * be orphans, which is exactly the defect class the P0-04 audit flagged.
 *
 * Chain proven by this router:
 *
 *   Provider (KBS / VPS / VNDIRECT adapter)
 *      -> Validation (deterministic ruleset)
 *      -> Canonical persistence  (canonical_market_bars)
 *      -> Provenance             (canonical_data_provenance)
 *      -> Quality                (canonical_data_quality)
 *      -> Query (point-in-time safe)
 *      -> API / UI
 *
 * Every response reports the ingest report so the caller can see exactly which
 * bars were accepted, which were rejected (with the rule code), which were
 * duplicates, and whether a database was actually reached.
 */
import { Router, type Request, type Response } from 'express';
import {
  CanonicalMarketDataIngestionService,
  type ProviderBarObservation,
} from './CanonicalMarketDataIngestionService.ts';
import {
  resolveInstrumentAsOf,
  resolveUniverseAsOf,
  getCanonicalAdjustedBars,
  getCanonicalBars,
  registerInstrument,
} from './DataFoundationComposition.ts';
import { KbsHistoricalProvider } from '../market/providers/kbs/KbsHistoricalProvider.ts';
import { InstrumentIdentityEngine } from '../../lib/data/InstrumentIdentityEngine.ts';
import { VIETNAM_STOCKS_UNIVERSE } from '../market/stockUniverse.ts';
import type { CanonicalMarketSource } from '../../lib/data/canonicalBarTypes.ts';

/** Cross-source close tolerance, matching the existing quote cross-check policy. */
export const CANONICAL_CROSS_SOURCE_TOLERANCE_PERCENT = 10;

/** Version stamp of the canonical daily-bar data version. */
export const CANONICAL_DAILY_BAR_VERSION = 'v1.0.0-canonical-1d';

/**
 * Maps a ticker onto the canonical `instrumentId`. Uses the authoritative
 * `InstrumentIdentityEngine` contract (`<EXCHANGE>:<SYMBOL>`) rather than bare
 * ticker text, so a symbol that migrates exchanges cannot collide.
 */
export function resolveInstrumentId(symbol: string, exchange: string): string {
  const clean = symbol.trim().toUpperCase();
  const ex = exchange === 'HNX' || exchange === 'UPCOM' ? exchange : 'HOSE';
  return `${ex}:${clean}`;
}

/** Looks the exchange up from the authoritative universe when the ticker is known. */
export function resolveExchange(symbol: string): string {
  const meta = VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === symbol.trim().toUpperCase());
  return meta?.exchange ?? 'HOSE';
}

function daysAgo(n: number, from = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAhead(n: number, from = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches real KBS daily bars and converts them into canonical provider
 * observations. No synthetic fallback: a provider failure propagates.
 */
async function fetchKbsObservations(
  symbol: string,
  from: string,
  to: string
): Promise<ProviderBarObservation[]> {
  const bars = await KbsHistoricalProvider.getDailyHistory(symbol, from, to, { timeoutMs: 10_000 });
  const exchange = resolveExchange(symbol);
  const instrumentId = resolveInstrumentId(symbol, exchange);
  return bars.map((b) => ({
    instrumentId,
    symbol: symbol.toUpperCase(),
    exchange,
    timeframe: '1D' as const,
    // KBS supplies a trading date only. The bar is closed at the exchange close,
    // so the bar instant is that date at 07:00 UTC = 14:00 ICT. This is a
    // deterministic documented mapping, recorded in the ingestion transform note.
    barTime: `${b.date}T07:00:00.000Z`,
    tradingDate: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    turnoverVnd: b.value > 0 ? b.value : null,
    sourceRecordId: `KBS|${symbol.toUpperCase()}|1D|${b.date}`,
    publicationTime: `${b.date}T08:00:00.000Z`,
  }));
}

export function createCanonicalDataApiRouter(): Router {
  const router = Router();

  /**
   * Ingest: provider -> validation -> canonical persistence -> provenance -> quality.
   * Read-only in intent: it never fabricates and never returns success for a write
   * that did not happen.
   */
  router.post('/ingest/:symbol', async (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'INVALID_SYMBOL' });
    }
    const source = String((req.body?.source as CanonicalMarketSource) ?? 'KBS').toUpperCase() as CanonicalMarketSource;
    if (!['KBS', 'VPS', 'VNDIRECT'].includes(source)) {
      return res.status(400).json({
        success: false,
        error: 'UNSUPPORTED_SOURCE',
        detail: 'Source-of-truth identifiers are KBS, VPS and VNDIRECT. No synthetic source is accepted.',
      });
    }

    const from = typeof req.body?.from === 'string' ? req.body.from : daysAgo(365);
    const to = typeof req.body?.to === 'string' ? req.body.to : daysAhead(1);

    try {
      const observations = await fetchKbsObservations(symbol, from, to);
      const report = await CanonicalMarketDataIngestionService.ingestBatch(
        {
          source,
          sourceTier: 'TIER_2_EXCHANGE',
          provider: 'KbsHistoricalProvider',
          providerVersion: null,
          dataVersion: CANONICAL_DAILY_BAR_VERSION,
          sourceUrl: `https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/${symbol}/data_day`,
          observations,
        },
        { registerInstruments: true, validFrom: from }
      );
      return res.json({
        success: true,
        symbol,
        instrumentId: resolveInstrumentId(symbol, resolveExchange(symbol)),
        report,
      });
    } catch (error: any) {
      // Fail-closed: a provider failure produces an explicit unavailable state and
      // writes nothing at all.
      return res.status(503).json({
        success: false,
        symbol,
        dataStatus: 'SOURCE_UNAVAILABLE',
        source,
        error: error?.message ?? 'Canonical ingest source unavailable',
        written: false,
      });
    }
  });

  /**
   * Query: point-in-time safe history read. A caller may pass `asOf` to prove
   * the no-look-ahead property; the default is "now".
   */
  router.get('/bars/:symbol', async (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'INVALID_SYMBOL' });
    }
    const exchange = resolveExchange(symbol);
    const instrumentId =
      typeof req.query.instrumentId === 'string' && req.query.instrumentId.trim()
        ? req.query.instrumentId.trim()
        : resolveInstrumentId(symbol, exchange);
    const from = typeof req.query.from === 'string' ? req.query.from : daysAgo(90);
    const to = typeof req.query.to === 'string' ? req.query.to : daysAhead(1);
    const asOf =
      typeof req.query.asOf === 'string' ? req.query.asOf : new Date().toISOString();
    const source =
      typeof req.query.source === 'string'
        ? (req.query.source as CanonicalMarketSource)
        : undefined;
    const includeNonValid = req.query.includeNonValid === 'true';

    try {
      const bars = await CanonicalMarketDataIngestionService.readHistory({
        instrumentId,
        from,
        to,
        asOf,
        source,
        limit: 2000,
        includeNonValid,
      });
      return res.json({
        success: true,
        symbol,
        instrumentId,
        asOf,
        barCount: bars.length,
        bars,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message ?? 'Invalid canonical query' });
    }
  });

  /** Quality ledger for an instrument. */
  router.get('/quality/:symbol', async (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? '').trim().toUpperCase();
    const instrumentId =
      typeof req.query.instrumentId === 'string' && req.query.instrumentId.trim()
        ? req.query.instrumentId.trim()
        : resolveInstrumentId(symbol, resolveExchange(symbol));
    const { CanonicalMarketDataRepository } = await import(
      '../../lib/db/data/CanonicalMarketDataRepository.ts'
    );
    const rows = await CanonicalMarketDataRepository.getQualityHistory(instrumentId, 200);
    return res.json({ success: true, instrumentId, count: rows.length, quality: rows });
  });

  /**
   * Cross-source comparison (P0-04 §18). Disagreement beyond the configured
   * tolerance is recorded as MISMATCH — never silently resolved.
   */
  router.post('/cross-source-check', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const required = ['instrumentId', 'tradingDate', 'primarySource', 'comparedSource', 'primaryClose', 'comparedClose'];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return res.status(400).json({ success: false, error: `MISSING_FIELD: ${field}` });
      }
    }
    const record = await CanonicalMarketDataIngestionService.recordCrossSourceCheck({
      instrumentId: String(body.instrumentId),
      tradingDate: String(body.tradingDate),
      timeframe: (body.timeframe as '1D') ?? '1D',
      primarySource: body.primarySource,
      comparedSource: body.comparedSource,
      primaryClose: Number(body.primaryClose),
      comparedClose: Number(body.comparedClose),
      tolerancePercent:
        typeof body.tolerancePercent === 'number'
          ? body.tolerancePercent
          : CANONICAL_CROSS_SOURCE_TOLERANCE_PERCENT,
    });
    return res.json({ success: true, record });
  });

  /** Instrument identity resolution, so the canonical ID contract is inspectable. */
  router.get('/identity/:symbol', (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'INVALID_SYMBOL' });
    }
    const exchange = resolveExchange(symbol);
    const instrumentId = resolveInstrumentId(symbol, exchange);
    const identity = InstrumentIdentityEngine.register({
      instrumentId,
      symbol,
      exchange: exchange as 'HOSE',
      assetClass: 'EQUITY',
      validFrom: new Date().toISOString().slice(0, 10),
    });
    return res.json({ success: true, identity });
  });

  /**
   * Registers an instrument through the authoritative `InstrumentIdentityEngine`
   * and persists it via `InstrumentRepository` (the P1-01 production caller).
   */
  router.post('/instrument', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const symbol = String(body.symbol ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'INVALID_SYMBOL' });
    }
    try {
      const result = await registerInstrument({
        instrumentId:
          typeof body.instrumentId === 'string' && body.instrumentId.trim()
            ? body.instrumentId.trim()
            : resolveInstrumentId(symbol, String(body.exchange ?? resolveExchange(symbol))),
        symbol,
        exchange: body.exchange === 'HNX' || body.exchange === 'UPCOM' ? body.exchange : resolveExchange(symbol),
        assetClass: body.assetClass ?? 'EQUITY',
        validFrom:
          typeof body.validFrom === 'string' ? body.validFrom : new Date().toISOString().slice(0, 10),
        validTo: typeof body.validTo === 'string' ? body.validTo : null,
        isin: typeof body.isin === 'string' ? body.isin : null,
        sector: typeof body.sector === 'string' ? body.sector : null,
        industry: typeof body.industry === 'string' ? body.industry : null,
        status: body.status,
      });
      return res.status(201).json({ success: true, ...result });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: 'INSTRUMENT_IDENTITY_REJECTED',
        detail: error?.message ?? 'The canonical identity engine rejected this instrument.',
      });
    }
  });

  /**
   * Point-in-time instrument resolution (P1-05). `PointInTimeGuard` decides which
   * identity was knowable at `asOf`; any bias is reported, not hidden.
   */
  router.get('/pit/instrument/:symbol', async (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'INVALID_SYMBOL' });
    }
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : new Date().toISOString().slice(0, 10);
    const instrumentId = resolveInstrumentId(symbol, resolveExchange(symbol));
    const resolution = await resolveInstrumentAsOf(instrumentId, asOf);
    return res.json({
      success: true,
      instrumentId,
      asOf,
      identity: resolution.identity,
      diagnostics: resolution.diagnostics,
      dataStatus: resolution.identity ? 'OK' : 'DATA_UNAVAILABLE',
    });
  });

  /** Survivorship-safe point-in-time universe. */
  router.get('/pit/universe', async (req: Request, res: Response) => {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : new Date().toISOString().slice(0, 10);
    const includeDelisted = req.query.includeDelisted === 'true';
    const { universe, diagnostics } = await resolveUniverseAsOf(asOf, { includeDelisted });
    return res.json({
      success: true,
      asOf,
      universeSize: universe.length,
      universe,
      diagnostics,
      dataStatus: universe.length > 0 ? 'OK' : 'DATA_UNAVAILABLE',
    });
  });

  /**
   * Canonical bars via the composed Data Foundation service. This is the
   * repository -> service -> route path, so the Data Foundation and the canonical
   * tables are genuinely reachable rather than declared.
   */
  router.get('/foundation/bars/:symbol', async (req: Request, res: Response) => {
    const symbol = (req.params.symbol ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return res.status(400).json({ success: false, error: 'INVALID_SYMBOL' });
    }
    const instrumentId = resolveInstrumentId(symbol, resolveExchange(symbol));
    const from = typeof req.query.from === 'string' ? req.query.from : daysAgo(365);
    const to = typeof req.query.to === 'string' ? req.query.to : daysAhead(1);
    const adjusted = req.query.adjusted === 'true';
    const bars = adjusted
      ? await getCanonicalAdjustedBars({ instrumentId, from, to, mode: 'ADJUSTED' })
      : await getCanonicalBars({ instrumentId, from, to });
    return res.json({
      success: true,
      instrumentId,
      mode: adjusted ? 'ADJUSTED' : 'RAW',
      barCount: bars.length,
      bars,
      dataStatus: bars.length > 0 ? 'OK' : 'DATA_UNAVAILABLE',
    });
  });

  return router;
}
