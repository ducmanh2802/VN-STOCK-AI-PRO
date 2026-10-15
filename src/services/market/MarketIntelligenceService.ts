/**
 * PHASE 20 — REAL MARKET INTELLIGENCE SERVICE
 * =============================================
 * Aggregates real market data from KBS/VPS into canonical MarketIntelligenceSnapshot.
 * Enforces caching, fail-closed data quality policies, and zero mock data.
 */

import { VIETNAM_STOCKS_UNIVERSE } from './stockUniverse.ts';
import { getHistoricalStockData } from './realMarketDataService.ts';
import { cacheGet, cacheSet } from './marketDataCache.ts';
import {
  MarketIntelligenceSnapshotBuilder,
  type ConstituentCandleData,
  type MarketIntelligenceSnapshot,
  type DataFreshnessStatus,
} from '../../lib/analysis/market/index.ts';
import type { CandlePoint } from '../../lib/indicators/types.ts';

const SNAPSHOT_CACHE_KEY = 'MARKET_INTELLIGENCE_SNAPSHOT_PHASE20';
const SNAPSHOT_CACHE_TTL_MS = 60_000; // 1 minute TTL

export class MarketIntelligenceService {
  /**
   * Retrieves or computes the canonical MarketIntelligenceSnapshot using real market data.
   * Strictly fail-closed: Never synthesizes fake benchmark prices when index feed is unavailable.
   */
  public static async getSnapshot(options?: {
    forceRefresh?: boolean;
    universeSubset?: string[];
  }): Promise<MarketIntelligenceSnapshot> {
    const cacheKey = options?.universeSubset
      ? `${SNAPSHOT_CACHE_KEY}_${options.universeSubset.sort().join('_')}`
      : SNAPSHOT_CACHE_KEY;

    if (!options?.forceRefresh) {
      const cached = cacheGet<MarketIntelligenceSnapshot>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const now = Date.now();
    const fetchedAt = new Date(now).toISOString();
    let latestSourceTime: number | null = null;

    // 1. Determine symbols to fetch
    const symbolsToFetch = options?.universeSubset
      ? options.universeSubset
      : VIETNAM_STOCKS_UNIVERSE.map((s) => s.symbol);

    // 2. Concurrently fetch historical candles for constituents (with error tolerance per symbol)
    const constituentData: ConstituentCandleData[] = [];

    // Chunk requests into batches of 10 to respect network rate limits
    const batchSize = 10;
    for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
      const batch = symbolsToFetch.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            const stockData = await getHistoricalStockData(symbol, '3M');
            if (stockData && stockData.candles && stockData.candles.length > 0) {
              const meta = VIETNAM_STOCKS_UNIVERSE.find(
                (s) => s.symbol.toUpperCase() === symbol.toUpperCase()
              );
              constituentData.push({
                symbol: symbol.toUpperCase(),
                sectorId: meta?.sectorId,
                candles: stockData.candles,
              });

              // Track latest source bar timestamp
              const lastCandle = stockData.candles[stockData.candles.length - 1];
              if (lastCandle && lastCandle.time) {
                const barTs = new Date(lastCandle.time).getTime();
                if (!isNaN(barTs) && (latestSourceTime === null || barTs > latestSourceTime)) {
                  latestSourceTime = barTs;
                }
              }
            }
          } catch (e) {
            // Fail closed on individual stock: omitted from constituentData, reported in coverage
          }
        })
      );
    }

    // 3. Attempt to fetch benchmark candles (VN-INDEX / VN30)
    // Strictly fail closed: If index symbol is unavailable, set indexCandles to []
    // NEVER synthesize fake index prices by averaging constituent baskets.
    let indexCandles: CandlePoint[] = [];
    try {
      const vnIndexData = await getHistoricalStockData('VNINDEX', '3M');
      if (vnIndexData && vnIndexData.candles && vnIndexData.candles.length > 0) {
        indexCandles = vnIndexData.candles;
        const lastIndexBar = indexCandles[indexCandles.length - 1];
        if (lastIndexBar && lastIndexBar.time) {
          const indexTs = new Date(lastIndexBar.time).getTime();
          if (!isNaN(indexTs) && (latestSourceTime === null || indexTs > latestSourceTime)) {
            latestSourceTime = indexTs;
          }
        }
      }
    } catch {
      // Real index candle data is unavailable: fail closed, indexCandles remains empty.
      indexCandles = [];
    }

    // 4. Derive PR-01 freshness status
    let dataFreshness: DataFreshnessStatus = 'CURRENT';
    if (constituentData.length === 0) {
      dataFreshness = 'UNAVAILABLE';
    } else {
      const totalExpected = symbolsToFetch.length;
      const coverageRatio = totalExpected > 0 ? constituentData.length / totalExpected : 0;
      if (coverageRatio < 0.5) {
        dataFreshness = 'STALE';
      }
    }

    // 5. Build canonical snapshot
    const snapshot = MarketIntelligenceSnapshotBuilder.build({
      indexCandles,
      constituents: constituentData,
      universeName: options?.universeSubset ? 'CUSTOM_SUBSET' : 'VIETNAM_ALL',
      dataFreshness,
      fetchedAt,
      sourceTimestamp: latestSourceTime,
    });

    // 6. Cache result if valid
    cacheSet(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_MS);

    return snapshot;
  }
}

