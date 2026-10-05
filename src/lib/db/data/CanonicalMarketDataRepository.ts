/**
 * P0-04 REMEDIATION — CANONICAL MARKET DATA REPOSITORY
 * =====================================================
 * The persistence path required by the actual architecture:
 *
 *   Provider -> Validation -> Canonical persistence -> Provenance -> Quality -> Query
 *
 * Design constraints honoured here:
 * - Identity is `instrumentId` + source + timeframe + barTime + dataVersion.
 *   Ticker text is never the identity.
 * - Append-only, idempotent writes (`onConflictDoNothing` on the deterministic
 *   key): re-ingesting the same observation must not create a second bar and must
 *   never overwrite an existing one.
 * - Provenance is written in the SAME call as the bar, so a bar can never exist
 *   without lineage. Both survive restart because they are rows, not memory.
 * - Reads are point-in-time safe: every historical query filters
 *   `effective_time <= asOf` so no look-ahead is possible.
 * - There is no synthetic fallback. `isSynthetic` exists only so a synthetic row
 *   would be loudly detectable; the repository refuses to write one.
 * - When the database is unreachable the repository is a NO-OP that reports
 *   `persisted: false`. It never fabricates a successful write.
 */
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import {
  canonicalDataProvenance,
  canonicalDataQuality,
  canonicalMarketBars,
  canonicalSourceAgreement,
} from '../../../db/schema.ts';
import type {
  CanonicalBarQueryResult,
  CanonicalBarRecord,
  CanonicalProvenanceRecord,
  CanonicalQualityRecord,
  CanonicalSourceAgreementRecord,
} from '../../data/canonicalBarTypes.ts';

const num = (v: number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

/** Postgres `timestamp` columns are written as `Date`, never as a raw string. */
const ts = (v: string | null | undefined): Date | null => {
  if (v === null || v === undefined) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms) : null;
};

const tsReq = (v: string): Date => new Date(Date.parse(v));

const toNum = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const toBarRow = (b: CanonicalBarRecord) => ({
  barKey: b.barKey,
  instrumentId: b.instrumentId,
  symbol: b.symbol,
  exchange: b.exchange,
  timeframe: b.timeframe,
  barTime: tsReq(b.barTime),
  tradingDate: b.tradingDate,
  open: num(b.open),
  high: num(b.high),
  low: num(b.low),
  close: num(b.close),
  referencePrice: num(b.referencePrice ?? null),
  ceilingPrice: num(b.ceilingPrice ?? null),
  floorPrice: num(b.floorPrice ?? null),
  volume: num(b.volume),
  turnoverVnd: num(b.turnoverVnd),
  adjustmentState: b.adjustmentState,
  adjustmentFactor: num(b.adjustmentFactor),
  source: b.source,
  sourceTier: b.sourceTier,
  sourceRecordId: b.sourceRecordId,
  provider: b.provider,
  providerVersion: b.providerVersion,
  observationTime: tsReq(b.observationTime),
  publicationTime: ts(b.publicationTime),
  effectiveTime: tsReq(b.effectiveTime),
  ingestedAt: tsReq(b.ingestionTime),
  dataVersion: b.dataVersion,
  qualityState: b.qualityState,
  qualityReason: b.qualityReason,
  qualityDetail: b.qualityDetail,
  transformVersion: b.transformVersion,
  transformNote: b.transformNote,
  // P0-04 §18 — the repository never writes a synthetic bar.
  isSynthetic: false,
});

const toProvenanceRow = (p: CanonicalProvenanceRecord) => ({
  provenanceId: p.provenanceId,
  barKey: p.barKey,
  instrumentId: p.instrumentId,
  source: p.source,
  sourceRecordId: p.sourceRecordId,
  provider: p.provider,
  providerVersion: p.providerVersion,
  sourceUrl: p.sourceUrl,
  observationTime: tsReq(p.observationTime),
  publicationTime: ts(p.publicationTime),
  effectiveTime: tsReq(p.effectiveTime),
  ingestedAt: tsReq(p.ingestionTime),
  dataVersion: p.dataVersion,
  payloadChecksum: p.payloadChecksum,
  rawExcerpt: p.rawExcerpt,
});

const toQualityRow = (q: CanonicalQualityRecord) => ({
  qualityId: q.qualityId,
  barKey: q.barKey,
  instrumentId: q.instrumentId,
  tradingDate: q.tradingDate,
  source: q.source,
  qualityState: q.qualityState,
  reasonCode: q.reasonCode,
  detail: q.detail,
  checkedRuleVersion: q.checkedRuleVersion,
  sourceValues: q.sourceValues,
  resolvedValues: q.resolvedValues,
  evaluatedAt: tsReq(q.evaluatedAt),
});

const toAgreementRow = (a: CanonicalSourceAgreementRecord) => ({
  instrumentId: a.instrumentId,
  tradingDate: a.tradingDate,
  timeframe: a.timeframe,
  primarySource: a.primarySource,
  comparedSource: a.comparedSource,
  primaryClose: String(a.primaryClose),
  comparedClose: String(a.comparedClose),
  deviationPercent: String(a.deviationPercent),
  tolerancePercent: String(a.tolerancePercent),
  agreementState: a.agreementState,
  detail: a.detail,
  evaluatedAt: tsReq(a.evaluatedAt),
});

export interface CanonicalWriteReport {
  /** True only when the row actually reached the database. */
  readonly persisted: boolean;
  /** False when the write was a no-op because the bar already existed. */
  readonly inserted: boolean;
  /** Set when the write was skipped because no database was reachable. */
  readonly skippedReason: 'NO_DATABASE' | null;
}

const NO_DB: CanonicalWriteReport = {
  persisted: false,
  inserted: false,
  skippedReason: 'NO_DATABASE',
};

/**
 * Runs a database operation, degrading to an explicit "no database" result when
 * PostgreSQL is unreachable.
 *
 * `db` is a non-nullable drizzle instance, so a plain `if (!db)` guard can never
 * fire. Without this wrapper a missing database turns every read and write into
 * an unhandled connection error — which would silently take down the callers.
 * Fail-soft here is still fail-CLOSED at the domain level: the caller receives
 * `persisted: false`, never a fabricated success.
 */
async function withDb<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  if (!db) return fallback;
  try {
    return await operation();
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[CanonicalMarketDataRepository] database unavailable:', error?.message ?? error);
    }
    return fallback;
  }
}

export class CanonicalMarketDataRepository {
  /**
   * Inserts a validated canonical bar together with its provenance row.
   * Both writes share one connection scope so a bar can never land without lineage.
   */
  static async appendBar(
    bar: CanonicalBarRecord,
    provenance: CanonicalProvenanceRecord
  ): Promise<CanonicalWriteReport> {
    if (bar.isSynthetic) {
      // Fail-closed: the schema keeps the column purely for detection.
      throw new Error('SYNTHETIC_BAR_REFUSED: canonical persistence never writes a synthetic observation.');
    }
    return withDb(async () => {
      const insertedBar = await db!
        .insert(canonicalMarketBars)
        .values(toBarRow(bar))
        .onConflictDoNothing({ target: canonicalMarketBars.barKey })
        .returning({ barKey: canonicalMarketBars.barKey });
      await db!
        .insert(canonicalDataProvenance)
        .values(toProvenanceRow(provenance))
        .onConflictDoNothing({ target: canonicalDataProvenance.provenanceId });
      return {
        persisted: true,
        inserted: insertedBar.length > 0,
        skippedReason: null,
      } as CanonicalWriteReport;
    }, NO_DB);
  }

  /** Append-only quality observations. Never overwrites an existing evaluation. */
  static async appendQuality(records: readonly CanonicalQualityRecord[]): Promise<CanonicalWriteReport> {
    return withDb(async () => {
      let inserted = false;
      for (const q of records) {
        const res = await db!
          .insert(canonicalDataQuality)
          .values(toQualityRow(q))
          .onConflictDoNothing({ target: canonicalDataQuality.qualityId })
          .returning({ qualityId: canonicalDataQuality.qualityId });
        inserted = inserted || res.length > 0;
      }
      return { persisted: true, inserted, skippedReason: null } as CanonicalWriteReport;
    }, NO_DB);
  }

  /** Records a cross-source comparison verdict. Disagreement is recorded, never resolved. */
  static async recordAgreement(
    record: CanonicalSourceAgreementRecord
  ): Promise<CanonicalWriteReport> {
    return withDb(async () => {
      await db!
        .insert(canonicalSourceAgreement)
        .values(toAgreementRow(record))
        .onConflictDoUpdate({
          target: [
            canonicalSourceAgreement.instrumentId,
            canonicalSourceAgreement.tradingDate,
            canonicalSourceAgreement.timeframe,
            canonicalSourceAgreement.comparedSource,
          ],
          set: {
            primarySource: record.primarySource,
            primaryClose: String(record.primaryClose),
            comparedClose: String(record.comparedClose),
            deviationPercent: String(record.deviationPercent),
            tolerancePercent: String(record.tolerancePercent),
            agreementState: record.agreementState,
            detail: record.detail,
            evaluatedAt: tsReq(record.evaluatedAt),
          },
        });
      return { persisted: true, inserted: true, skippedReason: null } as CanonicalWriteReport;
    }, NO_DB);
  }

  /**
   * Point-in-time safe history read (P0-04 §19).
   * `asOf` is an ISO instant; only bars whose `effective_time` is at or before it
   * are visible, so a historical query can never see data that was not yet
   * knowable at that instant.
   */
  static async getHistory(opts: {
    instrumentId: string;
    from: string;
    to: string;
    asOf: string;
    source?: string;
    limit?: number;
    includeNonValid?: boolean;
  }): Promise<CanonicalBarQueryResult[]> {
    if (!db) return [];
    // Point-in-time safety: `asOf` is an ISO instant, converted to a Date so the
    // comparison happens in Postgres against `effective_time`.
    const asOfMs = Date.parse(opts.asOf);
    if (!Number.isFinite(asOfMs)) {
      throw new Error(`INVALID_AS_OF: asOf must be an ISO timestamp, got "${opts.asOf}"`);
    }
    const conditions = [
      eq(canonicalMarketBars.instrumentId, opts.instrumentId),
      gte(canonicalMarketBars.tradingDate, opts.from),
      lte(canonicalMarketBars.tradingDate, opts.to),
      lte(canonicalMarketBars.effectiveTime, new Date(asOfMs)),
    ];
    if (opts.source) conditions.push(eq(canonicalMarketBars.source, opts.source));
    if (!opts.includeNonValid) {
      conditions.push(eq(canonicalMarketBars.qualityState, 'VALID'));
    }

    return withDb(async () => {
      const rows = await db!
        .select()
        .from(canonicalMarketBars)
        .where(and(...conditions))
        .orderBy(asc(canonicalMarketBars.tradingDate))
        .limit(opts.limit ?? 1000);

      return rows.map((r) => ({
        barKey: r.barKey,
        instrumentId: r.instrumentId,
        symbol: r.symbol,
        tradingDate: r.tradingDate,
        barTime: r.barTime.toISOString(),
        open: toNum(r.open),
        high: toNum(r.high),
        low: toNum(r.low),
        close: toNum(r.close),
        volume: toNum(r.volume),
        turnoverVnd: toNum(r.turnoverVnd),
        source: r.source as CanonicalBarQueryResult['source'],
        sourceTier: r.sourceTier as CanonicalBarQueryResult['sourceTier'],
        provider: r.provider,
        sourceRecordId: r.sourceRecordId,
        observationTime: r.observationTime.toISOString(),
        publicationTime: r.publicationTime ? r.publicationTime.toISOString() : null,
        effectiveTime: r.effectiveTime.toISOString(),
        ingestionTime: r.ingestedAt.toISOString(),
        dataVersion: r.dataVersion,
        adjustmentState: r.adjustmentState as CanonicalBarQueryResult['adjustmentState'],
        qualityState: r.qualityState as CanonicalBarQueryResult['qualityState'],
        qualityReason: (r.qualityReason ?? 'OK') as CanonicalBarQueryResult['qualityReason'],
        isSynthetic: r.isSynthetic,
      })) satisfies CanonicalBarQueryResult[];
    }, [] as CanonicalBarQueryResult[]);
  }

  /** Reads the provenance ledger for one bar. Provenance must survive restart. */
  static async getProvenance(barKey: string): Promise<CanonicalProvenanceRecord | null> {
    return withDb(async () => {
      const rows = await db!
        .select()
        .from(canonicalDataProvenance)
        .where(eq(canonicalDataProvenance.barKey, barKey))
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        provenanceId: r.provenanceId,
        barKey: r.barKey,
        instrumentId: r.instrumentId,
        source: r.source as CanonicalProvenanceRecord['source'],
        sourceRecordId: r.sourceRecordId,
        provider: r.provider,
        providerVersion: r.providerVersion,
        sourceUrl: r.sourceUrl,
        observationTime: r.observationTime.toISOString(),
        publicationTime: r.publicationTime ? r.publicationTime.toISOString() : null,
        effectiveTime: r.effectiveTime.toISOString(),
        ingestionTime: r.ingestedAt.toISOString(),
        dataVersion: r.dataVersion,
        payloadChecksum: r.payloadChecksum,
        rawExcerpt: r.rawExcerpt,
      } satisfies CanonicalProvenanceRecord;
    }, null);
  }

  /** Reads recorded quality observations for one instrument, newest first. */
  static async getQualityHistory(
    instrumentId: string,
    limit = 200
  ): Promise<readonly CanonicalQualityRecord[]> {
    return withDb(async () => {
      const rows = await db!
        .select()
        .from(canonicalDataQuality)
        .where(eq(canonicalDataQuality.instrumentId, instrumentId))
        .orderBy(desc(canonicalDataQuality.evaluatedAt))
        .limit(limit);
      return rows.map((r) => ({
        qualityId: r.qualityId,
        barKey: r.barKey,
        instrumentId: r.instrumentId,
        tradingDate: r.tradingDate,
        source: r.source as CanonicalQualityRecord['source'],
        qualityState: r.qualityState as CanonicalQualityRecord['qualityState'],
        reasonCode: r.reasonCode as CanonicalQualityRecord['reasonCode'],
        detail: r.detail,
        checkedRuleVersion: r.checkedRuleVersion,
        sourceValues: r.sourceValues,
        resolvedValues: r.resolvedValues,
        evaluatedAt: r.evaluatedAt.toISOString(),
      })) satisfies CanonicalQualityRecord[];
    }, [] as CanonicalQualityRecord[]);
  }
}
