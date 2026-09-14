/**
 * PHASE 17.6 — HISTORICAL SIGNAL VERIFIER
 * =========================================
 * Multi-strategy statistical verification coordinator for Phase 17 investment models.
 * 
 * Verifies whether strategies produce statistically viable returns and acceptable
 * risk profiles on historical price action.
 */

import { BacktestEngine } from './BacktestEngine.ts';
import { TrendFollowingBacktestStrategy } from './strategies/TrendFollowingBacktest.ts';
import { BreakoutConfirmationBacktestStrategy } from './strategies/BreakoutConfirmationBacktest.ts';
import { MeanReversionBacktestStrategy } from './strategies/MeanReversionBacktest.ts';
import type {
  BacktestConfig,
  BacktestResult,
  HistoricalCandle,
  HistoricalStrategy,
} from './types.ts';

export interface StrategyVerificationSummary {
  readonly symbol: string;
  readonly dateRange: { from: string; to: string; totalBars: number };
  readonly results: readonly BacktestResult[];
  readonly topPerformingStrategy: string | null;
  readonly bestWinRateStrategy: string | null;
  readonly lowestDrawdownStrategy: string | null;
}

export class HistoricalSignalVerifier {
  private readonly defaultStrategies: readonly HistoricalStrategy[];

  constructor(customStrategies?: readonly HistoricalStrategy[]) {
    this.defaultStrategies = customStrategies ?? [
      new TrendFollowingBacktestStrategy(),
      new BreakoutConfirmationBacktestStrategy(),
      new MeanReversionBacktestStrategy(),
    ];
  }

  /**
   * Verifies all core deterministic investment strategies against a historical candlestick series.
   */
  public verifyAllStrategies(
    candles: readonly HistoricalCandle[],
    config: BacktestConfig
  ): StrategyVerificationSummary {
    const results: BacktestResult[] = [];

    for (const strategy of this.defaultStrategies) {
      const result = BacktestEngine.run(strategy, candles, config);
      results.push(result);
    }

    // Rank strategies
    let topReturn = -Infinity;
    let topPerformingStrategy: string | null = null;

    let topWinRate = -Infinity;
    let bestWinRateStrategy: string | null = null;

    let lowestDrawdown = Infinity;
    let lowestDrawdownStrategy: string | null = null;

    for (const res of results) {
      if (res.metrics.totalTrades > 0) {
        if (res.metrics.totalReturnPct > topReturn) {
          topReturn = res.metrics.totalReturnPct;
          topPerformingStrategy = res.strategyName;
        }
        if (res.metrics.winRatePct > topWinRate) {
          topWinRate = res.metrics.winRatePct;
          bestWinRateStrategy = res.strategyName;
        }
        if (res.metrics.maxDrawdownPct < lowestDrawdown) {
          lowestDrawdown = res.metrics.maxDrawdownPct;
          lowestDrawdownStrategy = res.strategyName;
        }
      }
    }

    const startDate = candles.length > 0 ? candles[0].timestamp : '';
    const endDate = candles.length > 0 ? candles[candles.length - 1].timestamp : '';

    return {
      symbol: config.symbol,
      dateRange: {
        from: startDate,
        to: endDate,
        totalBars: candles.length,
      },
      results: Object.freeze(results),
      topPerformingStrategy,
      bestWinRateStrategy,
      lowestDrawdownStrategy,
    };
  }
}
