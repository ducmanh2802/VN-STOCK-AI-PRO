import type { StrategyContext, StrategySignal } from '../../lib/strategy/types.ts';
import { StrategyFactory } from '../../lib/strategy/StrategyFactory.ts';
import { StrategyContextAggregator } from '../../lib/strategy/StrategyContextAggregator.ts';
import { cacheGet, cacheSet } from '../market/marketDataCache.ts';

export interface EvaluateSignalOptions {
  strategyId: string;
  symbol: string;
  asOfDate?: string;
  contextOverride?: StrategyContext;
  forceRefresh?: boolean;
}

export class StrategyIntelligenceService {
  public static async evaluateSignal(options: EvaluateSignalOptions): Promise<StrategySignal> {
    const { strategyId, symbol, asOfDate, contextOverride, forceRefresh } = options;
    const cleanSymbol = symbol.trim().toUpperCase();
    const date = asOfDate ?? new Date().toISOString().slice(0, 10);
    const cacheKey = `strategy_signal_${strategyId}_${cleanSymbol}_${date}`;

    if (!forceRefresh && !contextOverride) {
      const cachedSignal = cacheGet<StrategySignal>(cacheKey);
      if (cachedSignal) {
        return cachedSignal;
      }
    }

    const context =
      contextOverride ??
      (await StrategyContextAggregator.buildContext({
        symbol: cleanSymbol,
        assetClass: 'EQUITY',
        asOfDate: date,
        forceRefresh,
      }));

    const signal = StrategyFactory.evaluate(strategyId, context);

    // Fail-closed invariant: Do NOT cache fail-closed / stale / unavailable signals so healed feeds recover immediately
    const isFailClosed =
      signal.dataFreshness === 'UNAVAILABLE' ||
      signal.dataFreshness === 'INVALID' ||
      signal.dataFreshness === 'STALE' ||
      signal.reasonCode?.includes('STALE') ||
      signal.reasonCode?.includes('UNAVAILABLE');

    if (!isFailClosed && !contextOverride) {
      cacheSet(cacheKey, signal, 30000);
    }

    return signal;
  }
}
