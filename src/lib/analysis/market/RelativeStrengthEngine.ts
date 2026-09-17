/**
 * PHASE 20.5 — CANONICAL RELATIVE STRENGTH ENGINE
 * =================================================
 * Computes multi-timeframe excess returns (RS) and composite RS ratings for any
 * asset against a chosen benchmark (VN-INDEX or VN30).
 *
 * TIME HORIZONS:
 *   - 1W  (5 trading bars)
 *   - 1M  (21 trading bars)
 *   - 3M  (63 trading bars)
 *   - 6M  (126 trading bars)
 *   - 12M (252 trading bars)
 *
 * QUANTITATIVE INVARIANTS:
 *   - excessReturn = assetReturn - benchmarkReturn
 *   - No NaN or Infinity in outputs
 *   - Fail-closed if either asset or benchmark candles are insufficient
 *   - Explicit corporate action limitation warnings
 */

import type { CandlePoint } from '../../indicators/types.ts';
import type {
  RelativeStrengthMetrics,
  RSPeriod,
  RSPeriodMetric,
} from './types.ts';

export interface RelativeStrengthInput {
  symbol: string;
  assetCandles: readonly CandlePoint[];
  benchmarkCandles: readonly CandlePoint[];
  benchmarkName?: 'VN-INDEX' | 'VN30';
  asOf?: string;
}

export class RelativeStrengthEngine {
  public static readonly VERSION = 'v1.0.0-phase20';

  private static readonly PERIOD_BARS: Record<RSPeriod, number> = {
    '1W': 5,
    '1M': 21,
    '3M': 63,
    '6M': 126,
    '12M': 252,
  };

  private static readonly PERIOD_WEIGHTS: Record<RSPeriod, number> = {
    '1W': 0.10,
    '1M': 0.25,
    '3M': 0.30,
    '6M': 0.20,
    '12M': 0.15,
  };

  /**
   * Computes multi-timeframe Relative Strength metrics for a symbol vs a benchmark.
   */
  public static evaluate(input: RelativeStrengthInput): RelativeStrengthMetrics {
    const {
      symbol,
      assetCandles,
      benchmarkCandles,
      benchmarkName = 'VN-INDEX',
      asOf = new Date().toISOString(),
    } = input;

    const warnings: string[] = [
      'CORPORATE_ACTION_NOTE: Historical returns are calculated from standard price series. Non-split-adjusted dividends may introduce minor tracking variance.',
    ];

    const periods: Record<RSPeriod, RSPeriodMetric> = {
      '1W': this.createEmptyPeriod('1W'),
      '1M': this.createEmptyPeriod('1M'),
      '3M': this.createEmptyPeriod('3M'),
      '6M': this.createEmptyPeriod('6M'),
      '12M': this.createEmptyPeriod('12M'),
    };

    if (!assetCandles || assetCandles.length < 5) {
      warnings.push('INSUFFICIENT_ASSET_DATA: Asset candle history is under 5 bars.');
      return {
        symbol,
        benchmark: benchmarkName,
        periods,
        overallRS: null,
        asOf,
        warnings,
        dataLineage: {
          assetSource: 'RealMarketData',
          benchmarkSource: benchmarkName,
          timestamp: asOf,
        },
      };
    }

    if (!benchmarkCandles || benchmarkCandles.length < 5) {
      warnings.push('INSUFFICIENT_BENCHMARK_DATA: Benchmark candle history is under 5 bars.');
      return {
        symbol,
        benchmark: benchmarkName,
        periods,
        overallRS: null,
        asOf,
        warnings,
        dataLineage: {
          assetSource: 'RealMarketData',
          benchmarkSource: benchmarkName,
          timestamp: asOf,
        },
      };
    }

    const latestAsset = assetCandles[assetCandles.length - 1];
    const latestBmk = benchmarkCandles[benchmarkCandles.length - 1];

    if (
      typeof latestAsset.close !== 'number' ||
      isNaN(latestAsset.close) ||
      latestAsset.close <= 0 ||
      typeof latestBmk.close !== 'number' ||
      isNaN(latestBmk.close) ||
      latestBmk.close <= 0
    ) {
      warnings.push('INVALID_LATEST_PRICE: Latest close price is non-positive or NaN.');
      return {
        symbol,
        benchmark: benchmarkName,
        periods,
        overallRS: null,
        asOf,
        warnings,
        dataLineage: {
          assetSource: 'RealMarketData',
          benchmarkSource: benchmarkName,
          timestamp: asOf,
        },
      };
    }

    let weightedScoreSum = 0;
    let totalWeightApplied = 0;

    for (const p of (['1W', '1M', '3M', '6M', '12M'] as const)) {
      const barsNeeded = RelativeStrengthEngine.PERIOD_BARS[p];

      if (assetCandles.length > barsNeeded && benchmarkCandles.length > barsNeeded) {
        const priorAsset = assetCandles[assetCandles.length - 1 - barsNeeded];
        const priorBmk = benchmarkCandles[benchmarkCandles.length - 1 - barsNeeded];

        if (priorAsset.close > 0 && priorBmk.close > 0) {
          const assetReturn = Number(
            (((latestAsset.close - priorAsset.close) / priorAsset.close) * 100).toFixed(2)
          );
          const benchmarkReturn = Number(
            (((latestBmk.close - priorBmk.close) / priorBmk.close) * 100).toFixed(2)
          );
          const excessReturn = Number((assetReturn - benchmarkReturn).toFixed(2));

          // Normalize excess return to 0 - 100 percentile score (50 = in-line with benchmark)
          // 1% excess return gives +1.5 points, clamped between 0 and 100
          const rsScore = Math.min(Math.max(Math.round(50 + excessReturn * 1.5), 0), 100);

          periods[p] = {
            period: p,
            assetReturn,
            benchmarkReturn,
            excessReturn,
            rsScore,
          };

          const weight = RelativeStrengthEngine.PERIOD_WEIGHTS[p];
          weightedScoreSum += rsScore * weight;
          totalWeightApplied += weight;
        }
      }
    }

    const overallRS =
      totalWeightApplied > 0 ? Math.round(weightedScoreSum / totalWeightApplied) : null;

    return {
      symbol,
      benchmark: benchmarkName,
      periods,
      overallRS,
      asOf,
      warnings,
      dataLineage: {
        assetSource: 'RealMarketData',
        benchmarkSource: benchmarkName,
        timestamp: asOf,
      },
    };
  }

  private static createEmptyPeriod(period: RSPeriod): RSPeriodMetric {
    return {
      period,
      assetReturn: null,
      benchmarkReturn: null,
      excessReturn: null,
      rsScore: null,
    };
  }
}
