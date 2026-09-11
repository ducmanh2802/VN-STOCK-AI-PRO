/**
 * PHASE 18.3.2 — IMMUTABLE MARKET SNAPSHOT
 * =========================================
 * Core MarketSnapshot container, defensive cloning, deep freezing,
 * and integrity verification methods.
 */

import type {
  MarketSnapshot,
  SnapshotSource,
  SnapshotMarket,
  SnapshotInstrument,
  SnapshotQuote,
  SnapshotFundamental,
  SnapshotValuation,
  SnapshotRecommendation,
  SnapshotIntegrity,
  SnapshotVersions,
} from './types.ts';
import { canonicalSerialize, computeSnapshotHash, computeSnapshotId } from './snapshotHash.ts';

/**
 * Deep recursive defensive clone for plain JavaScript data structures.
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) {
      copy[key] = deepClone(value);
    }
  }
  return copy as T;
}

/**
 * Deep recursive Object.freeze to guarantee runtime immutability.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const prop of Object.getOwnPropertyNames(obj)) {
    const val = (obj as Record<string, unknown>)[prop];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Extracts the canonical core payload (excluding snapshotId and hash) for fingerprinting.
 */
export function extractCanonicalPayload(snapshot: Omit<MarketSnapshot, 'snapshotId' | 'hash'> | MarketSnapshot): Record<string, unknown> {
  return {
    capturedAt: snapshot.capturedAt,
    source: {
      provider: snapshot.source.provider,
      feed: snapshot.source.feed,
    },
    market: {
      exchange: snapshot.market.exchange,
      tradingDate: snapshot.market.tradingDate,
      session: snapshot.market.session,
      isOpen: snapshot.market.isOpen,
    },
    instrument: {
      symbol: snapshot.instrument.symbol,
      ...(snapshot.instrument.name != null ? { name: snapshot.instrument.name } : {}),
    },
    quote: {
      last: snapshot.quote.last,
      ...(snapshot.quote.bid != null ? { bid: snapshot.quote.bid } : {}),
      ...(snapshot.quote.ask != null ? { ask: snapshot.quote.ask } : {}),
      ...(snapshot.quote.open != null ? { open: snapshot.quote.open } : {}),
      ...(snapshot.quote.high != null ? { high: snapshot.quote.high } : {}),
      ...(snapshot.quote.low != null ? { low: snapshot.quote.low } : {}),
      ...(snapshot.quote.close != null ? { close: snapshot.quote.close } : {}),
      ...(snapshot.quote.reference != null ? { reference: snapshot.quote.reference } : {}),
      ...(snapshot.quote.ceiling != null ? { ceiling: snapshot.quote.ceiling } : {}),
      ...(snapshot.quote.floor != null ? { floor: snapshot.quote.floor } : {}),
      ...(snapshot.quote.volume != null ? { volume: snapshot.quote.volume } : {}),
      timestamp: snapshot.quote.timestamp,
    },
    ...(snapshot.fundamental != null
      ? {
          fundamental: {
            ...(snapshot.fundamental.pe != null ? { pe: snapshot.fundamental.pe } : {}),
            ...(snapshot.fundamental.pb != null ? { pb: snapshot.fundamental.pb } : {}),
            ...(snapshot.fundamental.eps != null ? { eps: snapshot.fundamental.eps } : {}),
            ...(snapshot.fundamental.roe != null ? { roe: snapshot.fundamental.roe } : {}),
            ...(snapshot.fundamental.roa != null ? { roa: snapshot.fundamental.roa } : {}),
            ...(snapshot.fundamental.revenue != null ? { revenue: snapshot.fundamental.revenue } : {}),
            ...(snapshot.fundamental.netIncome != null ? { netIncome: snapshot.fundamental.netIncome } : {}),
            ...(snapshot.fundamental.freeCashFlow != null ? { freeCashFlow: snapshot.fundamental.freeCashFlow } : {}),
            ...(snapshot.fundamental.debtToEquity != null ? { debtToEquity: snapshot.fundamental.debtToEquity } : {}),
            asOf: snapshot.fundamental.asOf,
          },
        }
      : {}),
    ...(snapshot.valuation != null
      ? {
          valuation: {
            ...(snapshot.valuation.fairValue != null ? { fairValue: snapshot.valuation.fairValue } : {}),
            ...(snapshot.valuation.dcfValue != null ? { dcfValue: snapshot.valuation.dcfValue } : {}),
            ...(snapshot.valuation.marginOfSafety != null ? { marginOfSafety: snapshot.valuation.marginOfSafety } : {}),
            asOf: snapshot.valuation.asOf,
          },
        }
      : {}),
    ...(snapshot.recommendation != null
      ? {
          recommendation: {
            ...(snapshot.recommendation.recommendationId != null ? { recommendationId: snapshot.recommendation.recommendationId } : {}),
            ...(snapshot.recommendation.strategyVersion != null ? { strategyVersion: snapshot.recommendation.strategyVersion } : {}),
            ...(snapshot.recommendation.signal != null ? { signal: snapshot.recommendation.signal } : {}),
            ...(snapshot.recommendation.horizon != null ? { horizon: snapshot.recommendation.horizon } : {}),
            ...(snapshot.recommendation.confidence != null ? { confidence: snapshot.recommendation.confidence } : {}),
          },
        }
      : {}),
    integrity: {
      dataFreshnessMs: snapshot.integrity.dataFreshnessMs,
      validationStatus: snapshot.integrity.validationStatus,
      ...(snapshot.integrity.warnings && snapshot.integrity.warnings.length > 0
        ? { warnings: [...snapshot.integrity.warnings] }
        : {}),
    },
    versions: {
      snapshotSchemaVersion: snapshot.versions.snapshotSchemaVersion,
      ...(snapshot.versions.strategyVersion != null ? { strategyVersion: snapshot.versions.strategyVersion } : {}),
      ...(snapshot.versions.riskPolicyVersion != null ? { riskPolicyVersion: snapshot.versions.riskPolicyVersion } : {}),
    },
  };
}

/**
 * Creates a fully validated, defensively cloned, and frozen MarketSnapshot.
 */
export function createMarketSnapshot(params: {
  capturedAt: string;
  source: SnapshotSource;
  market: SnapshotMarket;
  instrument: SnapshotInstrument;
  quote: SnapshotQuote;
  fundamental?: SnapshotFundamental | null;
  valuation?: SnapshotValuation | null;
  recommendation?: SnapshotRecommendation | null;
  integrity: SnapshotIntegrity;
  versions: SnapshotVersions;
}): MarketSnapshot {
  // 1. Deep defensive cloning of all components
  const cloned = {
    capturedAt: String(params.capturedAt),
    source: deepClone(params.source),
    market: deepClone(params.market),
    instrument: deepClone(params.instrument),
    quote: deepClone(params.quote),
    fundamental: params.fundamental ? deepClone(params.fundamental) : null,
    valuation: params.valuation ? deepClone(params.valuation) : null,
    recommendation: params.recommendation ? deepClone(params.recommendation) : null,
    integrity: deepClone(params.integrity),
    versions: deepClone(params.versions),
  };

  // 2. Compute deterministic content-addressed hash and ID
  const canonicalPayload = extractCanonicalPayload(cloned);
  const hash = computeSnapshotHash(canonicalPayload);
  const snapshotId = computeSnapshotId(canonicalPayload);

  // 3. Construct immutable MarketSnapshot
  const snapshot: MarketSnapshot = {
    snapshotId,
    capturedAt: cloned.capturedAt,
    source: cloned.source,
    market: cloned.market,
    instrument: cloned.instrument,
    quote: cloned.quote,
    fundamental: cloned.fundamental,
    valuation: cloned.valuation,
    recommendation: cloned.recommendation,
    integrity: cloned.integrity,
    versions: cloned.versions,
    hash,
  };

  // 4. Deep freeze to prevent runtime mutation
  return deepFreeze(snapshot);
}

/**
 * Verifies that a MarketSnapshot has not been tampered with and satisfies content addressing.
 */
export function verifySnapshotIntegrity(snapshot: MarketSnapshot): boolean {
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }
  try {
    const canonicalPayload = extractCanonicalPayload(snapshot);
    const recomputedHash = computeSnapshotHash(canonicalPayload);
    const recomputedId = computeSnapshotId(canonicalPayload);

    return recomputedHash === snapshot.hash && recomputedId === snapshot.snapshotId;
  } catch {
    return false;
  }
}

/**
 * Serializes a MarketSnapshot to its canonical JSON representation.
 */
export function serializeMarketSnapshot(snapshot: MarketSnapshot): string {
  return canonicalSerialize(snapshot);
}
