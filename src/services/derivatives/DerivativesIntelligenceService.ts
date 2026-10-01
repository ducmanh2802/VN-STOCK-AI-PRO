/**
 * PHASE 21 — DERIVATIVES INTELLIGENCE SERVICE
 * ============================================
 * Production service orchestrating Derivatives Intelligence.
 * Coordinates contract resolution, live quotes, basis calculations,
 * Open Interest analysis, term structure, and snapshot construction.
 *
 * Enforces caching, zero-synthetic invariants, and fail-closed integrity.
 */

import type {
  UnderlyingIndex,
  DerivativesIntelligenceSnapshot,
  DerivativesQuote,
  ContinuousFuturesSeries,
  ContinuousAdjustmentMethod,
  CandlePoint,
} from '../../lib/derivatives/types.ts';
import { ContractResolver } from '../../lib/derivatives/ContractResolver.ts';
import { DerivativesIntelligenceSnapshotBuilder } from '../../lib/derivatives/DerivativesIntelligenceSnapshotBuilder.ts';
import { ContinuousFuturesEngine } from '../../lib/derivatives/ContinuousFuturesEngine.ts';
import { DerivativesDataProvider } from './DerivativesDataProvider.ts';
import { cacheGet, cacheSet } from '../market/marketDataCache.ts';

const SNAPSHOT_CACHE_KEY_PREFIX = 'DERIVATIVES_SNAPSHOT_PHASE21';
const SNAPSHOT_CACHE_TTL_MS = 60_000; // 60s TTL matching Phase 20

export interface DerivativesSnapshotOptions {
  underlying?: UnderlyingIndex;
  forceRefresh?: boolean;
  asOfDate?: string;
  previousOI?: number | null;
  riskFreeRate?: number;
  dividendYield?: number;
  timeoutMs?: number;
}

export class DerivativesIntelligenceService {
  /**
   * Retrieves or computes the canonical DerivativesIntelligenceSnapshot.
   */
  public static async getSnapshot(
    options?: DerivativesSnapshotOptions
  ): Promise<DerivativesIntelligenceSnapshot> {
    const underlying = options?.underlying || 'VN30';
    const cacheKey = `${SNAPSHOT_CACHE_KEY_PREFIX}_${underlying}`;

    if (!options?.forceRefresh) {
      const cached = cacheGet<DerivativesIntelligenceSnapshot>(cacheKey);
      if (cached) return cached;
    }

    const fetchedAt = new Date().toISOString();
    const universe = ContractResolver.resolveActiveUniverse(underlying, options?.asOfDate);
    const activeContract = universe.frontMonth;

    // Concurrently fetch active futures quote, other tenors, and spot quote
    const [activeQuote, quote2M, quote1Q, quote2Q, spotQuote] = await Promise.all([
      DerivativesDataProvider.getFuturesQuote(activeContract.symbol, {
        timeoutMs: options?.timeoutMs,
        forceRefresh: options?.forceRefresh,
        underlying,
      }),
      DerivativesDataProvider.getFuturesQuote(universe.nextMonth.symbol, {
        timeoutMs: options?.timeoutMs,
        forceRefresh: options?.forceRefresh,
        underlying,
      }).catch(() => null),
      DerivativesDataProvider.getFuturesQuote(universe.quarter1.symbol, {
        timeoutMs: options?.timeoutMs,
        forceRefresh: options?.forceRefresh,
        underlying,
      }).catch(() => null),
      DerivativesDataProvider.getFuturesQuote(universe.quarter2.symbol, {
        timeoutMs: options?.timeoutMs,
        forceRefresh: options?.forceRefresh,
        underlying,
      }).catch(() => null),
      DerivativesDataProvider.getSpotQuote(underlying, {
        timeoutMs: options?.timeoutMs,
        forceRefresh: options?.forceRefresh,
      }),
    ]);

    const allTenorQuotes: Record<string, DerivativesQuote | null> = {
      '1M': activeQuote,
      '2M': quote2M,
      '1Q': quote1Q,
      '2Q': quote2Q,
    };

    const snapshot = DerivativesIntelligenceSnapshotBuilder.build({
      underlying,
      activeContract,
      quote: activeQuote,
      spotQuote,
      allTenorQuotes,
      previousOI: options?.previousOI,
      basisOptions: {
        riskFreeRate: options?.riskFreeRate,
        dividendYield: options?.dividendYield,
      },
      fetchedAt,
    });

    if (snapshot.dataFreshness === 'CURRENT') {
      cacheSet(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_MS);
    }

    return snapshot;
  }

  /**
   * Builds continuous futures series from historical contract bars.
   */
  public static buildContinuousSeries(
    underlying: UnderlyingIndex,
    method: ContinuousAdjustmentMethod,
    contractBars: Record<string, CandlePoint[]>,
    asOfDate?: string
  ): ContinuousFuturesSeries {
    const universe = ContractResolver.resolveActiveUniverse(underlying, asOfDate);
    const contracts = [
      universe.frontMonth,
      universe.nextMonth,
      universe.quarter1,
      universe.quarter2,
    ];

    return ContinuousFuturesEngine.buildSeries({
      underlying,
      method,
      contracts,
      contractBars,
    });
  }
}
