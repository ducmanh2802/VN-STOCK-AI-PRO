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
}
