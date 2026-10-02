/**
 * PHASE 25 — STRATEGY INTELLIGENCE SERVICE
 * ==========================================
 * Production orchestrator service executing Multi-Asset Strategies.
 * Coordinates context aggregation, factory execution, signal normalization,
 * fail-closed handling, and 60-second in-memory TTL caching.
 *
 * CACHE POLICY:
 *   - Key format: STRATEGY_SIGNAL_${strategyId}_${assetClass}_${symbol}_${asOfDate}_${paramHash}
 *   - TTL: 60,000 ms (60 seconds)
 *   - Force refresh support: bypasses cache and recalculates upstream
 */

import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import { StrategyFactory } from '../../lib/strategy/StrategyFactory.ts';
import { StrategyContextAggregator } from '../../lib/strategy/StrategyContextAggregator.ts';
import { UniversalSignalNormalizer } from '../../lib/strategy/UniversalSignalNormalizer.ts';
import type {
  AssetClass,
  StrategyContext,
  StrategyParameters,
  StrategySignal,
  StrategySignalLineage,
} from '../../lib/strategy/types.ts';

const CACHE_PREFIX = 'STRATEGY_SIGNAL';
const CACHE_TTL_MS = 60_000; // 60s TTL matching Phases 20–24

/**
 * Deterministically hashes strategy parameters to prevent cache collisions.
 */
export function hashParameters(params?: StrategyParameters): string {
  if (!params || Object.keys(params).length === 0) {
    return 'DEFAULT';
  }
  const keys = Object.keys(params).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of keys) {
    sortedObj[k] = params[k];
  }
  const str = JSON.stringify(sortedObj);

  // FNV-1a 32-bit hash algorithm
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface EvaluateSignalOptions {
  readonly strategyId: string;
  readonly symbol: string;
  readonly assetClass?: AssetClass;
  readonly asOfDate?: string;
  readonly currentPrice?: number | null;
  readonly parameters?: StrategyParameters;
  readonly forceRefresh?: boolean;
  readonly contextOverride?: StrategyContext;
}

export class StrategyIntelligenceService {
  /**
   * Evaluates a multi-asset strategy with caching and fail-closed guards.
   */
  public static async evaluateSignal(
    options: EvaluateSignalOptions
  ): Promise<StrategySignal> {
    const strategyId = options.strategyId.trim();
    const symbol = options.symbol.trim().toUpperCase();
    const asOfDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
    const paramHash = hashParameters(options.parameters);

    // 1. Resolve strategy to obtain canonical asset class if not provided
    const strategy = StrategyFactory.getStrategy(strategyId);
    const assetClass: AssetClass =
      options.assetClass ?? strategy?.assetClass ?? 'EQUITY';

    const cacheKey = `${CACHE_PREFIX}_${strategyId}_${assetClass}_${symbol}_${asOfDate}_${paramHash}`;

    // 2. Check Cache
    if (!options.forceRefresh) {
      const cached = cacheGet<StrategySignal>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const lineage: StrategySignalLineage = {
      strategyId,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyIntelligenceService',
      evaluatedAt: new Date().toISOString(),
      asOfDate,
      assetClass,
      sourceSnapshots: {},
    };

    // 3. Unknown Strategy Guard
    if (!strategy) {
      return UniversalSignalNormalizer.failClosed(
        strategyId,
        assetClass,
        symbol,
        'INVALID_STRATEGY_ID',
        lineage,
        [`Strategy '${strategyId}' is not registered in StrategyFactory`]
      );
    }

    // 4. Build or use Context
    let context: StrategyContext;
    if (options.contextOverride) {
      context = options.contextOverride;
    } else {
      context = await StrategyContextAggregator.buildContext({
        symbol,
        assetClass,
        asOfDate,
        currentPrice: options.currentPrice,
        forceRefresh: options.forceRefresh,
      });
    }

    // 5. Evaluate through StrategyFactory
    const signal = StrategyFactory.evaluate(
      strategyId,
      context,
      options.parameters
    );

    // 6. Cache valid result (60s TTL)
    cacheSet(cacheKey, signal, CACHE_TTL_MS);

    return signal;
  }
}
