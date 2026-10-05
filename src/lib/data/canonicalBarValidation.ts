/**
 * P0-04 REMEDIATION — CANONICAL BAR VALIDATION & IDENTITY
 * =======================================================
 * Pure, deterministic, no I/O and no clock of its own: every timestamp comes
 * from the caller. Turns a raw provider observation into either
 *   - a `CanonicalBarRecord` that is safe to persist, or
 *   - a rejection carrying the exact rule that failed.
 *
 * DETERMINISTIC-REPAIR POLICY (P0-04 §17)
 * A repair is applied only when it has an explicit rule AND is recorded in
 * `transformVersion` / `transformNote`. The only two repairs are:
 *   1. `effectiveTime` defaults to `publicationTime ?? observationTime`;
 *   2. `tradingDate` defaults to the date part of `barTime`.
 * Neither changes a price, a volume or a timestamp the source reported.
 * OHLC violations, negative volumes, missing fields and future timestamps are
 * marked INVALID / UNAVAILABLE with their reason — never repaired.
 *
 * IDENTITY POLICY (P0-04 §15)
 * `barKey = instrumentId | source | timeframe | barTime | dataVersion`.
 * Ticker text is deliberately NOT part of the key: the repository already defines
 * a canonical `instrumentId` (instruments.instrument_id).
 */

import {
  CANONICAL_BAR_RULE_VERSION,
  type CanonicalBarInput,
  type CanonicalBarRecord,
  type CanonicalProvenanceRecord,
  type CanonicalQualityReason,
  type CanonicalQualityRecord,
  type CanonicalQualityState,
  type CanonicalMarketSource,
} from './canonicalBarTypes.ts';

const SYMBOL_PATTERN = /^[A-Z0-9_.]{1,20}$/;
const INSTRUMENT_PATTERN = /^[A-Z0-9_.:-]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

function parseMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Deterministic canonical identity for a bar. Exported for reuse and testing. */
export function buildBarKey(input: {
  instrumentId: string;
  source: string;
  timeframe: string;
  barTime: string;
  dataVersion: string;
}): string {
  const barMs = Date.parse(input.barTime);
  const normalizedBarTime = Number.isFinite(barMs)
    ? new Date(barMs).toISOString()
    : input.barTime;
  return [
    input.instrumentId,
    input.source,
    input.timeframe,
    normalizedBarTime,
    input.dataVersion,
  ].join('|');
}

export interface CanonicalBarRejection {
  readonly qualityState: CanonicalQualityState;
  readonly reason: CanonicalQualityReason;
  readonly detail: string;
}

export interface CanonicalBarValidationResult {
  readonly ok: boolean;
  readonly record: CanonicalBarRecord | null;
  readonly rejection: CanonicalBarRejection | null;
}

export interface ValidateCanonicalBarOptions {
  /** Wall-clock reference for the future-timestamp rule. Supplied by the caller. */
  readonly nowMs: number;
  /** Maximum acceptable age between effective time and `nowMs`. */
  readonly maxAgeMs?: number;
}

/** Validates one observation. Never throws for business reasons. */
export function validateCanonicalBar(
  input: CanonicalBarInput,
  options: ValidateCanonicalBarOptions
): CanonicalBarValidationResult {
  const reject = (
    qualityState: CanonicalQualityState,
    reason: CanonicalQualityReason,
    detail: string
  ): CanonicalBarValidationResult => ({
    ok: false,
    record: null,
    rejection: { qualityState, reason, detail },
  });

  // -- Identity -------------------------------------------------------------
  if (!input.instrumentId || !INSTRUMENT_PATTERN.test(input.instrumentId)) {
    return reject('INVALID', 'SOURCE_MISMATCH', `Missing or malformed instrumentId: "${input.instrumentId}"`);
  }
  if (!input.symbol || !SYMBOL_PATTERN.test(input.symbol)) {
    return reject('INVALID', 'SOURCE_MISMATCH', `Missing or malformed symbol: "${input.symbol}"`);
  }
  if (!input.source || !SYMBOL_PATTERN.test(input.source)) {
    return reject('INVALID', 'SOURCE_MISMATCH', `Missing or malformed source: "${input.source}"`);
  }
  if (!input.sourceRecordId || input.sourceRecordId.trim() === '') {
    return reject('INVALID', 'SOURCE_MISMATCH', 'sourceRecordId is required: a bar without a source identifier has no provenance.');
  }
  if (!input.provider || input.provider.trim() === '') {
    return reject('INVALID', 'SOURCE_MISMATCH', 'provider is required: provenance must name the producing provider.');
  }
  if (!input.dataVersion || input.dataVersion.trim() === '') {
    return reject('INVALID', 'SOURCE_MISMATCH', 'dataVersion is required.');
  }

  // -- Time model (P0-04 §19) ----------------------------------------------
  const barMs = parseMs(input.barTime);
  if (barMs === null) return reject('UNAVAILABLE', 'MISSING_REQUIRED_FIELD', 'barTime is required.');
  if (Number.isNaN(barMs)) {
    return reject('INVALID', 'INVALID_TIMESTAMP', `Unparseable barTime: "${input.barTime}"`);
  }
  if (barMs > options.nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return reject('INVALID', 'FUTURE_TIMESTAMP', `barTime ${input.barTime} is in the future relative to the reference clock.`);
  }

  const observationMs = parseMs(input.observationTime);
  if (observationMs === null) {
    return reject('UNAVAILABLE', 'MISSING_REQUIRED_FIELD', 'observationTime is required for provenance.');
  }
  if (Number.isNaN(observationMs)) {
    return reject('INVALID', 'INVALID_TIMESTAMP', `Unparseable observationTime: "${input.observationTime}"`);
  }
  if (observationMs > options.nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return reject('INVALID', 'FUTURE_TIMESTAMP', `observationTime ${input.observationTime} is in the future.`);
  }

  const publicationMs = parseMs(input.publicationTime);
  if (input.publicationTime != null && (publicationMs === null || Number.isNaN(publicationMs))) {
    return reject('INVALID', 'INVALID_TIMESTAMP', `Unparseable publicationTime: "${input.publicationTime}"`);
  }
  if (publicationMs !== null && publicationMs > options.nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return reject('INVALID', 'FUTURE_TIMESTAMP', `publicationTime ${input.publicationTime} is in the future.`);
  }

  // Deterministic repair #1 (recorded): effective time defaults to the latest
  // knowable instant the source supplied.
  const effectiveTimeRaw = input.effectiveTime ?? input.publicationTime ?? input.observationTime;
  const effectiveMs = parseMs(effectiveTimeRaw);
  if (effectiveMs === null || Number.isNaN(effectiveMs)) {
    return reject('UNAVAILABLE', 'MISSING_REQUIRED_FIELD', 'No knowable effectiveTime could be derived.');
  }
  if (effectiveMs > options.nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return reject('INVALID', 'FUTURE_TIMESTAMP', `effectiveTime ${effectiveTimeRaw} is in the future.`);
  }
  const effectiveTime = new Date(effectiveMs).toISOString();

  const ingestionMs = parseMs(input.ingestionTime);
  if (ingestionMs === null) return reject('UNAVAILABLE', 'MISSING_REQUIRED_FIELD', 'ingestionTime is required.');
  if (Number.isNaN(ingestionMs)) {
    return reject('INVALID', 'INVALID_TIMESTAMP', `Unparseable ingestionTime: "${input.ingestionTime}"`);
  }
  // A system cannot have ingested an observation before observing it.
  if (ingestionMs + CLOCK_SKEW_TOLERANCE_MS < observationMs) {
    return reject(
      'INVALID',
      'INVALID_TIMESTAMP',
      `ingestionTime (${input.ingestionTime}) precedes observationTime (${input.observationTime}).`
    );
  }

  // Deterministic repair #2 (recorded): trading date defaults to the date part
  // of the bar time when the caller omitted it.
  const tradingDate =
    input.tradingDate && ISO_DATE.test(input.tradingDate)
      ? input.tradingDate
      : new Date(barMs).toISOString().slice(0, 10);

  // -- OHLC + volume correctness (P0-04 §17) — never repaired ---------------
  const { open, high, low, close, volume, turnoverVnd } = input;

  if (close === null) {
    return reject('UNAVAILABLE', 'MISSING_REQUIRED_FIELD', 'close is required.');
  }
  const priceFields: readonly (readonly [string, number | null])[] = [
    ['open', open],
    ['high', high],
    ['low', low],
    ['close', close],
  ];
  for (const [name, value] of priceFields) {
    if (value === null) continue;
    if (!isFiniteNumber(value) || value <= 0) {
      return reject('INVALID', 'NON_POSITIVE_PRICE', `${name} must be a positive finite number, got: ${value}`);
    }
  }
  if (high !== null && low !== null && high < low) {
    return reject('INVALID', 'OHLC_INCONSISTENT', `high (${high}) is below low (${low}).`);
  }
  if (high !== null && close > high) {
    return reject('INVALID', 'OHLC_INCONSISTENT', `close (${close}) exceeds high (${high}).`);
  }
  if (low !== null && close < low) {
    return reject('INVALID', 'OHLC_INCONSISTENT', `close (${close}) is below low (${low}).`);
  }
  if (volume !== null && (!isFiniteNumber(volume) || volume < 0)) {
    return reject('INVALID', 'NEGATIVE_VOLUME', `volume must be a non-negative finite number, got: ${volume}`);
  }
  if (turnoverVnd !== null && (!isFiniteNumber(turnoverVnd) || turnoverVnd < 0)) {
    return reject('INVALID', 'NEGATIVE_VOLUME', `turnoverVnd must be a non-negative finite number, got: ${turnoverVnd}`);
  }

  // -- Staleness (P0-04 §17) -----------------------------------------------
  let qualityState: CanonicalQualityState = 'VALID';
  let qualityReason: CanonicalQualityReason = 'OK';
  let qualityDetail: string | null = null;
  if (options.maxAgeMs !== undefined && options.nowMs - effectiveMs > options.maxAgeMs) {
    qualityState = 'STALE';
    qualityReason = 'BEYOND_MAX_STALENESS';
    qualityDetail = `effective age ${Math.round((options.nowMs - effectiveMs) / 1000)}s exceeds ${Math.round(options.maxAgeMs / 1000)}s`;
  }

  const barKey = buildBarKey({
    instrumentId: input.instrumentId,
    source: input.source,
    timeframe: input.timeframe,
    barTime: input.barTime,
    dataVersion: input.dataVersion,
  });

  const derivedTradingDate = !input.tradingDate || !ISO_DATE.test(input.tradingDate);
  const derivedEffectiveTime = input.effectiveTime === null || input.effectiveTime === undefined;
  const repaired = derivedTradingDate || derivedEffectiveTime;

  return {
    ok: true,
    record: {
      ...input,
      barKey,
      tradingDate,
      effectiveTime,
      qualityState,
      qualityReason,
      qualityDetail,
      transformVersion: repaired ? CANONICAL_BAR_RULE_VERSION : null,
      transformNote: repaired
        ? [
            derivedTradingDate ? `tradingDate derived from barTime (${input.barTime})` : null,
            derivedEffectiveTime
              ? `effectiveTime derived from ${input.publicationTime ? 'publicationTime' : 'observationTime'}`
              : null,
          ]
            .filter(Boolean)
            .join('; ')
        : null,
      isSynthetic: false,
    },
    rejection: null,
  };
}

/** Builds the provenance row for a validated bar. */
export function buildProvenanceRecord(
  bar: CanonicalBarRecord,
  provenanceId: string
): CanonicalProvenanceRecord {
  return {
    provenanceId,
    barKey: bar.barKey,
    instrumentId: bar.instrumentId,
    source: bar.source,
    sourceRecordId: bar.sourceRecordId,
    provider: bar.provider,
    providerVersion: bar.providerVersion,
    sourceUrl: bar.sourceUrl ?? null,
    observationTime: bar.observationTime,
    publicationTime: bar.publicationTime,
    effectiveTime: bar.effectiveTime,
    ingestionTime: bar.ingestionTime,
    dataVersion: bar.dataVersion,
    payloadChecksum: bar.payloadChecksum ?? null,
    rawExcerpt: bar.rawExcerpt ?? null,
  };
}

/** Builds the quality row for a validated or rejected bar. */
export function buildQualityRecord(opts: {
  qualityId: string;
  barKey: string;
  instrumentId: string;
  tradingDate: string;
  source: CanonicalMarketSource;
  qualityState: CanonicalQualityState;
  reason: CanonicalQualityReason;
  detail: string | null;
  evaluatedAt: string;
  sourceValues?: unknown;
  resolvedValues?: unknown;
}): CanonicalQualityRecord {
  return {
    qualityId: opts.qualityId,
    barKey: opts.barKey,
    instrumentId: opts.instrumentId,
    tradingDate: opts.tradingDate,
    source: opts.source,
    qualityState: opts.qualityState,
    reasonCode: opts.reason,
    detail: opts.detail,
    checkedRuleVersion: CANONICAL_BAR_RULE_VERSION,
    sourceValues: opts.sourceValues === undefined ? null : JSON.stringify(opts.sourceValues),
    resolvedValues: opts.resolvedValues === undefined ? null : JSON.stringify(opts.resolvedValues),
    evaluatedAt: opts.evaluatedAt,
  };
}
