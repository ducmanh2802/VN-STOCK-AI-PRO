/**
 * PHASE 23 — CORPORATE ACTIONS INTELLIGENCE SERVICE
 * =================================================
 * Orchestrator service providing high-performance, cached corporate actions intelligence.
 *
 * CACHE POLICY:
 * - In-memory TTL cache with 60-second validity (CORPORATE_ACTION_SNAPSHOT_CACHE_TTL_MS = 60_000).
 * - Key namespace isolation: 'CORP_ACTION_SNAPSHOT_' + symbol to avoid collisions.
 * - Cache bypass support via { forceRefresh: true }.
 */

import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import { CorporateActionDataProvider } from './CorporateActionDataProvider.ts';
import { CorporateActionSnapshotBuilder } from '../../lib/corporate-actions/CorporateActionSnapshotBuilder.ts';
import type { CorporateActionIntelligenceSnapshot } from '../../lib/corporate-actions/types.ts';
import type { DataFreshnessStatus } from '../../types/stock.ts';

const SNAPSHOT_CACHE_PREFIX = 'CORP_ACTION_SNAPSHOT_';
const SNAPSHOT_CACHE_TTL_MS = 60_000; // 60 seconds

export interface GetCorporateActionSnapshotOptions {
  asOfDate?: string;
  forceRefresh?: boolean;
}

export class CorporateActionIntelligenceService {
  /**
   * Retrieves or computes the corporate action intelligence snapshot for a given symbol.
   */
  public static async getSnapshot(
    symbol: string,
    options?: GetCorporateActionSnapshotOptions
  ): Promise<CorporateActionIntelligenceSnapshot> {
    const sym = symbol.trim().toUpperCase();
    const asOfDate = options?.asOfDate || new Date().toISOString().slice(0, 10);
    const cacheKey = `${SNAPSHOT_CACHE_PREFIX}${sym}_${asOfDate}`;

    if (!options?.forceRefresh) {
      const cached = cacheGet<CorporateActionIntelligenceSnapshot>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const fetchedAt = new Date().toISOString();
    const sourceTimestamp = Date.now();

    // 1. Fetch authoritative corporate actions for symbol
    const actions = await CorporateActionDataProvider.getCorporateActions(sym);

    // 2. Fetch market context (current price and historical close quotes)
    const marketContext = await CorporateActionDataProvider.getMarketContext(sym);

    // 3. Determine freshness status
    const dataFreshness: DataFreshnessStatus = 'CURRENT';

    // 4. Build snapshot
    const snapshot = CorporateActionSnapshotBuilder.buildSnapshot({
      symbol: sym,
      asOfDate,
      actions,
      historicalQuotes: marketContext.historicalQuotes,
      currentMarketPrice: marketContext.currentPrice,
      fetchedAt,
      sourceTimestamp,
      dataFreshness,
    });

    // 5. Store in TTL cache
    cacheSet(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_MS);

    return snapshot;
  }
}
