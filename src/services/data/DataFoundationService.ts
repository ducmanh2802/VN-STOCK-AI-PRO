/**
 * DATA FOUNDATION SERVICE — CANONICAL DATA ACCESS
 * =================================================
 * Orchestration only. Pure math stays in src/lib/data/**.
 * Fail-closed: DATA_UNAVAILABLE / DATA_INVALID / POINT_IN_TIME_UNAVAILABLE.
 * Never: guess, interpolate silently, use current/future/synthetic data.
 */

import type { CanonicalBar, CorporateActionRecord, InstrumentIdentity } from '../../lib/data/index.ts';
import { HistoricalBarsEngine } from '../../lib/data/HistoricalBarsEngine.ts';
import { AdjustmentEngine, CorporateActionValidator } from '../../lib/data/CorporateActionsEngine.ts';
import { PointInTimeGuard } from '../../lib/data/PointInTimeGuard.ts';

export interface GetBarsRequest {
  readonly instrumentId: string;
  readonly from: string;
  readonly to: string;
}

export interface GetAdjustedBarsRequest extends GetBarsRequest {
  readonly mode: 'RAW' | 'ADJUSTED';
}

export class DataFoundationService {
  constructor(
    private readonly deps: {
      readonly loadBars: (instrumentId: string, from: string, to: string) => readonly CanonicalBar[];
      readonly loadCorporateActions: (instrumentId: string) => readonly CorporateActionRecord[];
      readonly loadInstruments: () => readonly InstrumentIdentity[];
      readonly loadPrevCloses: (instrumentId: string) => Readonly<Record<string, number>>;
      /**
       * P0-04 / P1-01: asynchronous loaders. The repositories are I/O bound, so a
       * production composition cannot pre-resolve the whole universe in memory.
       * When supplied, the `*Async` methods below are used; the synchronous
       * methods keep their original in-memory semantics untouched.
       */
      readonly loadBarsAsync?: (
        instrumentId: string,
        from: string,
        to: string
      ) => Promise<readonly CanonicalBar[]>;
      readonly loadCorporateActionsAsync?: (
        instrumentId: string
      ) => Promise<readonly CorporateActionRecord[]>;
      readonly loadInstrumentsAsync?: () => Promise<readonly InstrumentIdentity[]>;
      readonly loadPrevClosesAsync?: (
        instrumentId: string
      ) => Promise<Readonly<Record<string, number>>>;
    }
  ) {}

  getBars(req: GetBarsRequest): readonly CanonicalBar[] {
    const bars = this.deps.loadBars(req.instrumentId, req.from, req.to);
    return HistoricalBarsEngine.query(bars, req);
  }

  getAdjustedBars(req: GetAdjustedBarsRequest): readonly CanonicalBar[] {
    const bars = this.getBars(req);
    if (req.mode === 'RAW') return bars;
    const allActions = this.deps.loadCorporateActions(req.instrumentId);
    const { valid } = CorporateActionValidator.validate(allActions);
    const prevCloses = this.deps.loadPrevCloses(req.instrumentId);
    return AdjustmentEngine.adjust(bars, valid, prevCloses, 'ADJUSTED');
  }

  getInstrumentAsOf(instrumentId: string, asOf: string): InstrumentIdentity | null {
    return PointInTimeGuard.getInstrumentAsOf(this.deps.loadInstruments(), instrumentId, asOf);
  }

  getUniverseAsOf(asOf: string, opts?: { readonly includeDelisted?: boolean }) {
    return PointInTimeGuard.getUniverseAsOf(this.deps.loadInstruments(), asOf, opts);
  }

  getCorporateActionsAsOf(instrumentId: string, asOf: string): readonly CorporateActionRecord[] {
    const all = this.deps.loadCorporateActions(instrumentId);
    const { valid } = CorporateActionValidator.validate(all);
    return valid.filter((e) => {
      const pub = e.announcementDate ?? e.exDate ?? e.effectiveDate;
      if (!pub) return false;
      return pub <= asOf;
    });
  }

  // -------------------------------------------------------------------------
  // Async variants (P0-04 / P1-01): identical semantics, repository-backed loads.
  // Each falls back to the synchronous loader when no async loader is supplied.
  // -------------------------------------------------------------------------

  async getBarsAsync(req: GetBarsRequest): Promise<readonly CanonicalBar[]> {
    const bars = this.deps.loadBarsAsync
      ? await this.deps.loadBarsAsync(req.instrumentId, req.from, req.to)
      : this.deps.loadBars(req.instrumentId, req.from, req.to);
    return HistoricalBarsEngine.query(bars, req);
  }

  async getAdjustedBarsAsync(
    req: GetAdjustedBarsRequest
  ): Promise<readonly CanonicalBar[]> {
    const bars = await this.getBarsAsync(req);
    if (req.mode === 'RAW') return bars;
    const allActions = this.deps.loadCorporateActionsAsync
      ? await this.deps.loadCorporateActionsAsync(req.instrumentId)
      : this.deps.loadCorporateActions(req.instrumentId);
    const { valid } = CorporateActionValidator.validate(allActions);
    const prevCloses = this.deps.loadPrevClosesAsync
      ? await this.deps.loadPrevClosesAsync(req.instrumentId)
      : this.deps.loadPrevCloses(req.instrumentId);
    return AdjustmentEngine.adjust(bars, valid, prevCloses, 'ADJUSTED');
  }

  async getInstrumentAsOfAsync(
    instrumentId: string,
    asOf: string
  ): Promise<InstrumentIdentity | null> {
    const universe = this.deps.loadInstrumentsAsync
      ? await this.deps.loadInstrumentsAsync()
      : this.deps.loadInstruments();
    return PointInTimeGuard.getInstrumentAsOf(universe, instrumentId, asOf);
  }

  async getUniverseAsOfAsync(
    asOf: string,
    opts?: { readonly includeDelisted?: boolean }
  ): Promise<ReturnType<typeof PointInTimeGuard.getUniverseAsOf>> {
    const universe = this.deps.loadInstrumentsAsync
      ? await this.deps.loadInstrumentsAsync()
      : this.deps.loadInstruments();
    return PointInTimeGuard.getUniverseAsOf(universe, asOf, opts);
  }

  async getCorporateActionsAsOfAsync(
    instrumentId: string,
    asOf: string
  ): Promise<readonly CorporateActionRecord[]> {
    const all = this.deps.loadCorporateActionsAsync
      ? await this.deps.loadCorporateActionsAsync(instrumentId)
      : this.deps.loadCorporateActions(instrumentId);
    const { valid } = CorporateActionValidator.validate(all);
    return valid.filter((e) => {
      const pub = e.announcementDate ?? e.exDate ?? e.effectiveDate;
      if (!pub) return false;
      return pub <= asOf;
    });
  }
}
