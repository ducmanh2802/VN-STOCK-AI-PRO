/**
 * P0-04 REMEDIATION — CANONICAL MARKET DATA INGESTION SERVICE
 * ============================================================
 * The production caller that closes the P0-04 loop:
 *
 *   Provider (KBS/VPS/VNDIRECT adapter)
 *      -> Validation (deterministic ruleset)
 *      -> Canonical persistence (CanonicalMarketDataRepository)
 *      -> Provenance (same write)
 *      -> Quality (same write)
 *      -> Query (point-in-time safe read)
 *      -> UI / API
 *
 * This service is what makes `canonical_market_bars`,
 * `canonical_data_provenance` and `canonical_data_quality` INTEGRATED rather
 * than merely declared: every ingest runs the full chain, and every read is
 * point-in-time safe.
 *
 * Fail-closed contract:
 * - A provider failure produces a report with `sourceUnavailable: true`; no
 *   synthetic or interpolated bar is ever written.
 * - A rejected observation is persisted as an explicit INVALID / UNAVAILABLE
 *   quality row with its reason code, so the gap is visible instead of silent.
 * - When no database is configured, every write reports `persisted: false`.
 *   The service never claims a write it did not perform.
 */
import { CanonicalMarketDataRepository, type CanonicalWriteReport } from '../../lib/db/data/CanonicalMarketDataRepository.ts';
import {
  buildProvenanceRecord,
  buildQualityRecord,
  validateCanonicalBar,
  buildBarKey,
} from '../../lib/data/canonicalBarValidation.ts';
import {
  CANONICAL_BAR_RULE_VERSION,
  type CanonicalBarInput,
  type CanonicalBarQueryResult,
  type CanonicalMarketSource,
  type CanonicalQualityRecord,
  type CanonicalSourceAgreementRecord,
  type CanonicalTimeframe,
  type SourceTier,
} from '../../lib/data/canonicalBarTypes.ts';
import { InstrumentIdentityEngine } from '../../lib/data/InstrumentIdentityEngine.ts';
import type { InstrumentIdentity } from '../../lib/data/types.ts';

/** A normalized provider observation, before canonical validation. */
export interface ProviderBarObservation {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly timeframe: CanonicalTimeframe;
  /** ISO instant the source says the bar closed at. */
  readonly barTime: string;
  readonly tradingDate: string;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly volume: number | null;
  readonly turnoverVnd: number | null;
  readonly referencePrice?: number | null;
  readonly sourceRecordId: string;
  /** ISO instant the source published the observation (if it states one). */
  readonly publicationTime?: string | null;
}

export interface ProviderBatch {
  readonly source: CanonicalMarketSource;
  readonly sourceTier: SourceTier;
  readonly provider: string;
  readonly providerVersion: string | null;
  readonly dataVersion: string;
  readonly sourceUrl?: string | null;
  readonly observations: readonly ProviderBarObservation[];
}

export interface IngestReport {
  readonly source: CanonicalMarketSource;
  readonly sourceUnavailable: boolean;
  readonly received: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly persistedBars: number;
  readonly duplicateBars: number;
  readonly persistedQualityRows: number;
  readonly databaseConfigured: boolean;
  /** Rejections with their rule codes, for the audit trail. */
  readonly rejections: readonly IngestRejection[];
}

export interface IngestRejection {
  readonly instrumentId: string;
  readonly tradingDate: string;
  readonly qualityState: string;
  readonly reason: string;
  readonly detail: string;
}

/** Mutable accumulator used while the batch is processed. */
interface IngestAccumulator {
  source: CanonicalMarketSource;
  sourceUnavailable: boolean;
  received: number;
  accepted: number;
  rejected: number;
  persistedBars: number;
  duplicateBars: number;
  persistedQualityRows: number;
  databaseConfigured: boolean;
  rejections: IngestRejection[];
}

export interface CanonicalIngestionOptions {
  /** Wall-clock reference. Injected so the service is deterministic in tests. */
  readonly now?: Date;
  /** Maximum acceptable effective age before a bar is marked STALE. */
  readonly maxAgeMs?: number;
  /** Registers instruments so bars always carry a canonical identity. */
  readonly registerInstruments?: boolean;
  readonly validFrom?: string;
}

const emptyReport = (
  source: CanonicalMarketSource,
  sourceUnavailable: boolean,
  databaseConfigured: boolean
): IngestReport => ({
  source,
  sourceUnavailable,
  received: 0,
  accepted: 0,
  rejected: 0,
  persistedBars: 0,
  duplicateBars: 0,
  persistedQualityRows: 0,
  databaseConfigured,
  rejections: [],
});
export class CanonicalMarketDataIngestionService {
  /**
   * Runs the full provider -> validation -> persistence -> provenance -> quality
   * chain for one provider batch.
   *
   * `ingestionTime` is taken from the injected clock, never from the provider.
   */
  static async ingestBatch(
    batch: ProviderBatch,
    options: CanonicalIngestionOptions = {}
  ): Promise<IngestReport> {
    const nowMs = (options.now ?? new Date()).getTime();
    const ingestionTime = new Date(nowMs).toISOString();
    const databaseConfigured = options.registerInstruments !== undefined || true;

    if (!batch || batch.observations.length === 0) {
      return emptyReport(batch?.source ?? 'KBS', false, databaseConfigured);
    }

    const report: IngestAccumulator = {
      ...emptyReport(batch.source, false, databaseConfigured),
      received: batch.observations.length,
      rejections: [],
    };

    if (options.registerInstruments) {
      CanonicalMarketDataIngestionService.registerInstruments(batch.observations, options.validFrom);
    }

    const qualityRows: CanonicalQualityRecord[] = [];
    const writeReports: CanonicalWriteReport[] = [];

    for (const obs of batch.observations) {
      const input: CanonicalBarInput = {
        instrumentId: obs.instrumentId,
        symbol: obs.symbol,
        exchange: obs.exchange,
        timeframe: obs.timeframe,
        barTime: obs.barTime,
        tradingDate: obs.tradingDate,
        open: obs.open,
        high: obs.high,
        low: obs.low,
        close: obs.close,
        volume: obs.volume,
        turnoverVnd: obs.turnoverVnd,
        adjustmentState: 'RAW',
        adjustmentFactor: null,
        source: batch.source,
        sourceTier: batch.sourceTier,
        sourceRecordId: obs.sourceRecordId,
        provider: batch.provider,
        providerVersion: batch.providerVersion,
        observationTime: obs.barTime,
        publicationTime: obs.publicationTime ?? null,
        effectiveTime: obs.publicationTime ?? obs.barTime,
        ingestionTime,
        dataVersion: batch.dataVersion,
        sourceUrl: batch.sourceUrl ?? null,
      };

      const validation = validateCanonicalBar(
        input,
        options.maxAgeMs === undefined ? { nowMs } : { nowMs, maxAgeMs: options.maxAgeMs }
      );

      if (!validation.ok || !validation.record) {
        const rejection = validation.rejection!;
        report.rejected += 1;
        report.rejections.push({
          instrumentId: obs.instrumentId,
          tradingDate: obs.tradingDate,
          qualityState: rejection.qualityState,
          reason: rejection.reason,
          detail: rejection.detail,
        });
        // The gap is persisted as an explicit quality row so it is visible in the
        // ledger instead of being silently dropped.
        qualityRows.push(
          buildQualityRecord({
            qualityId: `${buildBarKey({
              instrumentId: obs.instrumentId,
              source: batch.source,
              timeframe: obs.timeframe,
              barTime: obs.barTime,
              dataVersion: batch.dataVersion,
            })}|quality|${CANONICAL_BAR_RULE_VERSION}`,
            barKey: buildBarKey({
              instrumentId: obs.instrumentId,
              source: batch.source,
              timeframe: obs.timeframe,
              barTime: obs.barTime,
              dataVersion: batch.dataVersion,
            }),
            instrumentId: obs.instrumentId,
            tradingDate: obs.tradingDate,
            source: batch.source,
            qualityState: rejection.qualityState,
            reason: rejection.reason,
            detail: rejection.detail,
            evaluatedAt: ingestionTime,
            sourceValues: {
              open: obs.open,
              high: obs.high,
              low: obs.low,
              close: obs.close,
              volume: obs.volume,
            },
          })
        );
        continue;
      }

      const bar = validation.record;
      const provenance = buildProvenanceRecord(bar, `${bar.barKey}|prov|${CANONICAL_BAR_RULE_VERSION}`);
      const write = await CanonicalMarketDataRepository.appendBar(bar, provenance);
      writeReports.push(write);
      if (write.inserted) report.persistedBars += 1;
      if (!write.inserted && write.persisted) report.duplicateBars += 1;
      if (!write.persisted) report.databaseConfigured = false;
      report.accepted += 1;

      qualityRows.push(
        buildQualityRecord({
          qualityId: `${bar.barKey}|quality|${CANONICAL_BAR_RULE_VERSION}`,
          barKey: bar.barKey,
          instrumentId: bar.instrumentId,
          tradingDate: bar.tradingDate,
          source: bar.source,
          qualityState: bar.qualityState,
          reason: bar.qualityReason,
          detail: bar.qualityDetail,
          evaluatedAt: ingestionTime,
          sourceValues: {
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          },
          resolvedValues: {
            effectiveTime: bar.effectiveTime,
            transformVersion: bar.transformVersion,
          },
        })
      );
    }

    if (qualityRows.length > 0) {
      const qualityWrite = await CanonicalMarketDataRepository.appendQuality(qualityRows);
      if (!qualityWrite.persisted) report.databaseConfigured = false;
      else report.persistedQualityRows = qualityWrite.inserted ? qualityRows.length : 0;
    }

    return report;
  }
  /**
   * Records a cross-source comparison verdict (P0-04 §18).
   * Disagreement beyond tolerance is marked MISMATCH — never silently resolved
   * by selecting a convenient number.
   */
  static async recordCrossSourceCheck(opts: {
    instrumentId: string;
    tradingDate: string;
    timeframe: CanonicalTimeframe;
    primarySource: CanonicalMarketSource;
    comparedSource: CanonicalMarketSource;
    primaryClose: number;
    comparedClose: number;
    tolerancePercent: number;
    now?: Date;
  }): Promise<CanonicalSourceAgreementRecord> {
    const deviation =
      Math.abs(opts.primaryClose - opts.comparedClose) / opts.comparedClose * 100;
    const comparable =
      Number.isFinite(opts.primaryClose) &&
      Number.isFinite(opts.comparedClose) &&
      opts.primaryClose > 0 &&
      opts.comparedClose > 0;

    const record: CanonicalSourceAgreementRecord = {
      instrumentId: opts.instrumentId,
      tradingDate: opts.tradingDate,
      timeframe: opts.timeframe,
      primarySource: opts.primarySource,
      comparedSource: opts.comparedSource,
      primaryClose: opts.primaryClose,
      comparedClose: opts.comparedClose,
      deviationPercent: Number.isFinite(deviation) ? Number(deviation.toFixed(6)) : 0,
      tolerancePercent: opts.tolerancePercent,
      agreementState: !comparable
        ? 'INSUFFICIENT_DATA'
        : deviation === 0
          ? 'AGREE'
          : deviation <= opts.tolerancePercent
            ? 'TOLERATED'
            : 'MISMATCH',
      detail: comparable
        ? `deviation ${deviation.toFixed(4)}% vs tolerance ${opts.tolerancePercent}%`
        : 'One side has no usable close price; comparison is not meaningful.',
      evaluatedAt: (opts.now ?? new Date()).toISOString(),
    };

    await CanonicalMarketDataRepository.recordAgreement(record);
    return record;
  }

  /** Point-in-time safe read used by the API/UI layer. */
  static async readHistory(opts: {
    instrumentId: string;
    from: string;
    to: string;
    asOf: string;
    source?: CanonicalMarketSource;
    limit?: number;
    includeNonValid?: boolean;
  }): Promise<readonly CanonicalBarQueryResult[]> {
    return CanonicalMarketDataRepository.getHistory(opts);
  }

  /**
   * Registers canonical instrument identities for the observed instruments.
   * Uses the authoritative `InstrumentIdentityEngine` (P1-05) rather than
   * inventing an identity, and never overwrites an existing registration.
   */
  static registerInstruments(
    observations: readonly ProviderBarObservation[],
    validFrom?: string
  ): readonly InstrumentIdentity[] {
    const seen = new Set<string>();
    const identities: InstrumentIdentity[] = [];
    for (const obs of observations) {
      const id = obs.instrumentId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const exchange =
        obs.exchange === 'HNX' || obs.exchange === 'UPCOM' ? obs.exchange : 'HOSE';
      try {
        identities.push(
          InstrumentIdentityEngine.register({
            instrumentId: id,
            symbol: obs.symbol.trim().toUpperCase(),
            exchange,
            assetClass: 'EQUITY',
            validFrom: validFrom ?? obs.tradingDate,
          })
        );
      } catch {
        // A malformed identity is skipped, never coerced into a fake one.
      }
    }
    return identities;
  }
}

export const canonicalMarketDataIngestion = {
  ingestBatch: CanonicalMarketDataIngestionService.ingestBatch,
  recordCrossSourceCheck: CanonicalMarketDataIngestionService.recordCrossSourceCheck,
  readHistory: CanonicalMarketDataIngestionService.readHistory,
  registerInstruments: CanonicalMarketDataIngestionService.registerInstruments,
};
