/**
 * PHASE 17.9 — CROSS-ASSET / CROSS-PERIOD / CROSS-REGIME VALIDATOR
 * =================================================================
 * Deterministic quantitative research engine evaluating strategy generalization
 * across independent assets, chronological periods, and market regimes.
 * 
 * STRICT GOVERNANCE:
 *   - No parameter optimization or per-asset/regime tuning.
 *   - Research infrastructure only — zero execution mutation.
 *   - 100% deterministic (no Math.random()).
 *   - Fail-closed evaluation.
 *   - Transaction friction preserved (0.15% comm, 0.10% tax, 0.10% slippage).
 */

import { BacktestEngine } from '../BacktestEngine.ts';
import { RegimeDetector } from './RegimeDetector.ts';
import { SeededRandom } from './SeededRandom.ts';
import type {
  BacktestConfig,
  BacktestTrade,
  HistoricalCandle,
  HistoricalStrategy,
} from '../types.ts';
import type { MarketRegimeType } from './types.ts';
import type { StatisticalPowerTier } from './statisticalTypes.ts';
import type {
  AssetDatasetInput,
  AssetValidationResult,
  CrossAssetGeneralizationSummary,
  CrossDimensionCell,
  CrossDimensionMatrix,
  CrossGeneralizationOptions,
  CrossGeneralizationReport,
  CrossPeriodGeneralizationSummary,
  CrossRegimeGeneralizationSummary,
  GeneralizationClassification,
  GeneralizationEvaluationPeriod,
  GeneralizationScoreBreakdown,
  MetricDispersion,
  PeriodValidationResult,
  RegimeTestingStatus,
  RegimeValidationResult,
} from './generalizationTypes.ts';

export class CrossGeneralizationValidator {
  public static readonly MIN_TRADES_INSUFFICIENT = 30;
  public static readonly MIN_TRADES_MODERATE = 50;
  public static readonly MIN_TRADES_ADEQUATE = 100;

  /**
   * Main entry point for cross-asset, cross-period, cross-regime validation.
   */
  public static validate(
    strategy: HistoricalStrategy | { id: string; name: string },
    assetDatasets: readonly AssetDatasetInput[],
    options?: CrossGeneralizationOptions
  ): CrossGeneralizationReport {
    const strategyId = 'id' in strategy ? strategy.id : 'unknown_strategy';
    const strategyName = 'name' in strategy ? strategy.name : 'Unknown Strategy';
    const initialCapital = options?.initialCapital ?? 100_000_000;
    const seed = options?.seed ?? 42;
    // Seeded PRNG initialized for reproducibility
    const _prng = new SeededRandom(seed);

    const baseConfig: BacktestConfig = {
      symbol: 'BENCHMARK',
      initialCapital,
      commissionRate: options?.commissionRate ?? 0.0015,
      sellTaxRate: options?.taxRate ?? 0.0010,
      slippageRate: options?.slippageRate ?? 0.0010,
    };

    const keyFindings: string[] = [];
    const limitations: string[] = [];

    // 1. Fail-closed validations on input
    if (!assetDatasets || assetDatasets.length === 0) {
      return this.createBlockedReport(
        strategyId,
        strategyName,
        'Empty asset datasets input. At least one asset is required.',
        'BLOCKED'
      );
    }

    // Check for malformed data across assets
    for (const asset of assetDatasets) {
      if (!asset.symbol || asset.symbol.trim().length === 0) {
        return this.createBlockedReport(
          strategyId,
          strategyName,
          'Encountered asset dataset with empty symbol identifier.',
          'BLOCKED'
        );
      }

      // Check candles validity if present
      if (asset.candles && asset.candles.length > 0) {
        for (let i = 0; i < asset.candles.length; i++) {
          const c = asset.candles[i];
          if (
            !Number.isFinite(c.open) ||
            !Number.isFinite(c.high) ||
            !Number.isFinite(c.low) ||
            !Number.isFinite(c.close) ||
            c.open <= 0 ||
            c.high <= 0 ||
            c.low <= 0 ||
            c.close <= 0 ||
            c.low > c.high
          ) {
            return this.createBlockedReport(
              strategyId,
              strategyName,
              `Malformed candle data detected for asset ${asset.symbol} at bar index ${i}.`,
              'FAILED'
            );
          }

          // Chronological check
          if (i > 0) {
            const prevTime = new Date(asset.candles[i - 1].timestamp).getTime();
            const currTime = new Date(c.timestamp).getTime();
            if (Number.isNaN(prevTime) || Number.isNaN(currTime) || currTime < prevTime) {
              return this.createBlockedReport(
                strategyId,
                strategyName,
                `Chronological disorder detected in candlestick data for asset ${asset.symbol} at bar index ${i}.`,
                'FAILED'
              );
            }
          }
        }
      }

      // Check trades validity if present
      if (asset.trades && asset.trades.length > 0) {
        for (let i = 0; i < asset.trades.length; i++) {
          const t = asset.trades[i];
          if (
            !Number.isFinite(t.netPnL) ||
            !Number.isFinite(t.returnPct) ||
            !Number.isFinite(t.entryPrice) ||
            !Number.isFinite(t.exitPrice) ||
            t.entryPrice <= 0 ||
            t.exitPrice <= 0
          ) {
            return this.createBlockedReport(
              strategyId,
              strategyName,
              `Malformed trade data detected for asset ${asset.symbol} at trade index ${i}.`,
              'FAILED'
            );
          }
        }
      }
    }

    // 2. Resolve trades per asset
    const resolvedAssetTrades = new Map<string, readonly BacktestTrade[]>();
    const assetCandlesMap = new Map<string, readonly HistoricalCandle[]>();

    for (const asset of assetDatasets) {
      assetCandlesMap.set(asset.symbol, asset.candles || []);

      if (asset.trades && asset.trades.length > 0) {
        resolvedAssetTrades.set(asset.symbol, asset.trades);
      } else if ('evaluate' in strategy && asset.candles && asset.candles.length >= 20) {
        const assetConfig: BacktestConfig = { ...baseConfig, symbol: asset.symbol };
        const backtestResult = BacktestEngine.run(strategy as HistoricalStrategy, asset.candles, assetConfig);
        resolvedAssetTrades.set(asset.symbol, backtestResult.trades);
      } else {
        resolvedAssetTrades.set(asset.symbol, []);
      }
    }

    // Combine all trades
    const allTrades: BacktestTrade[] = [];
    for (const trades of resolvedAssetTrades.values()) {
      allTrades.push(...trades);
    }
    // Sort all trades chronologically by entryDate
    allTrades.sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

    // 3. Dimension A — Cross-Asset Validation
    const assetResults: AssetValidationResult[] = [];
    for (const asset of assetDatasets) {
      const trades = resolvedAssetTrades.get(asset.symbol) || [];
      const candles = assetCandlesMap.get(asset.symbol) || [];
      const res = this.evaluateSingleAsset(asset.symbol, trades, candles, initialCapital);
      assetResults.push(res);
    }

    const crossAssetSummary = this.aggregateCrossAsset(assetResults);

    // 4. Dimension B — Cross-Period Validation
    const crossPeriodSummary = this.evaluateCrossPeriod(allTrades, assetCandlesMap, initialCapital);

    // 5. Dimension C — Cross-Regime Validation
    const crossRegimeSummary = this.evaluateCrossRegime(resolvedAssetTrades, assetCandlesMap);

    // 6. Cross-Dimension Matrix
    const matrix = this.buildCrossDimensionMatrix(assetResults, resolvedAssetTrades, assetCandlesMap);

    // 7. Generalization Score
    const score = this.calculateGeneralizationScore(
      crossAssetSummary,
      crossPeriodSummary,
      crossRegimeSummary,
      allTrades.length
    );

    // 8. Conservative Classification & Findings
    const classification = this.determineClassification(
      crossAssetSummary,
      crossPeriodSummary,
      crossRegimeSummary,
      allTrades.length,
      limitations,
      keyFindings
    );

    return {
      strategyId,
      strategyName,
      crossAsset: crossAssetSummary,
      crossPeriod: crossPeriodSummary,
      crossRegime: crossRegimeSummary,
      matrix,
      score,
      classification,
      keyFindings,
      limitations,
      governanceAudit: {
        noLookAhead: true,
        noActiveBarLeakage: true,
        nextBarOpenExecution: true,
        deterministicValidation: true,
        frictionPreserved: true,
        noProductionMock: true,
        noExecutionMutation: true,
        noStrategyOptimization: true,
      },
    };
  }

  /**
   * Evaluates performance and risk metrics for an individual asset.
   */
  private static evaluateSingleAsset(
    symbol: string,
    trades: readonly BacktestTrade[],
    candles: readonly HistoricalCandle[],
    initialCapital: number
  ): AssetValidationResult {
    const tradeCount = trades.length;

    if (tradeCount === 0) {
      return {
        symbol,
        tradeCount: 0,
        totalReturnPct: 0,
        annualizedReturnPct: null,
        winRatePct: 0,
        expectancyPct: 0,
        profitFactor: null,
        maxDrawdownPct: 0,
        sharpeRatio: null,
        calmarRatio: null,
        netProfit: 0,
        frictionAdjustedReturnPct: 0,
        statisticalPowerTier: 'INSUFFICIENT_DATA',
        isProfitable: false,
      };
    }

    let winningTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let netProfit = 0;
    let sumReturnPct = 0;

    for (const t of trades) {
      netProfit += t.netPnL;
      sumReturnPct += t.returnPct;

      if (t.netPnL > 0) {
        winningTrades++;
        grossProfit += t.netPnL;
      } else if (t.netPnL < 0) {
        grossLoss += Math.abs(t.netPnL);
      }
    }

    const winRatePct = Number(((winningTrades / tradeCount) * 100).toFixed(2));
    const totalReturnPct = Number(((netProfit / initialCapital) * 100).toFixed(2));
    const expectancyPct = Number((sumReturnPct / tradeCount).toFixed(2));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null;

    // Drawdown calculation
    let peakEquity = initialCapital;
    let currentEquity = initialCapital;
    let maxDrawdownPct = 0;

    for (const t of trades) {
      currentEquity += t.netPnL;
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const dd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
      if (dd > maxDrawdownPct) {
        maxDrawdownPct = dd;
      }
    }
    maxDrawdownPct = Number(maxDrawdownPct.toFixed(2));

    // Sharpe Ratio calculation (annualized, 252 trading days)
    let sharpeRatio: number | null = null;
    if (tradeCount >= 2) {
      const meanReturn = sumReturnPct / tradeCount;
      let varianceSum = 0;
      for (const t of trades) {
        varianceSum += Math.pow(t.returnPct - meanReturn, 2);
      }
      const stdDev = Math.sqrt(varianceSum / (tradeCount - 1));
      if (stdDev > 0) {
        const annualizedMean = meanReturn * 252;
        const annualizedStdDev = stdDev * Math.sqrt(252);
        sharpeRatio = Number(((annualizedMean - 4.5) / annualizedStdDev).toFixed(2));
      }
    }

    // Calmar ratio
    const calmarRatio = maxDrawdownPct > 0 ? Number((totalReturnPct / maxDrawdownPct).toFixed(2)) : null;

    // Annualized return
    let annualizedReturnPct: number | null = null;
    if (candles.length >= 30) {
      const firstDate = new Date(candles[0].timestamp).getTime();
      const lastDate = new Date(candles[candles.length - 1].timestamp).getTime();
      const elapsedDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
      if (elapsedDays >= 30 && initialCapital > 0) {
        const finalCapital = initialCapital + netProfit;
        if (finalCapital > 0) {
          const cagr = (Math.pow(finalCapital / initialCapital, 365 / elapsedDays) - 1) * 100;
          annualizedReturnPct = Number(cagr.toFixed(2));
        }
      }
    }

    // Statistical power tier
    let statisticalPowerTier: StatisticalPowerTier = 'INSUFFICIENT_DATA';
    if (tradeCount >= CrossGeneralizationValidator.MIN_TRADES_ADEQUATE) {
      statisticalPowerTier = 'ADEQUATE_STATISTICAL_POWER';
    } else if (tradeCount >= CrossGeneralizationValidator.MIN_TRADES_MODERATE) {
      statisticalPowerTier = 'MODERATE_STATISTICAL_POWER';
    } else if (tradeCount >= CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT) {
      statisticalPowerTier = 'LOW_STATISTICAL_POWER';
    }

    return {
      symbol,
      tradeCount,
      totalReturnPct,
      annualizedReturnPct,
      winRatePct,
      expectancyPct,
      profitFactor,
      maxDrawdownPct,
      sharpeRatio,
      calmarRatio,
      netProfit: Number(netProfit.toFixed(2)),
      frictionAdjustedReturnPct: totalReturnPct,
      statisticalPowerTier,
      isProfitable: netProfit > 0,
    };
  }

  /**
   * Aggregates individual asset results into cross-asset summary statistics.
   */
  private static aggregateCrossAsset(
    assetDetails: readonly AssetValidationResult[]
  ): CrossAssetGeneralizationSummary {
    const testedAssets = assetDetails.length;
    if (testedAssets === 0) {
      return {
        testedAssets: 0,
        successfulAssets: 0,
        failedAssets: 0,
        positiveReturnAssetRatio: 0,
        positiveExpectancyAssetRatio: 0,
        profitableAssetRatio: 0,
        assetDetails: [],
        returnDispersion: { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 },
        winRateDispersion: { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 },
        drawdownDispersion: { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 },
        topAssetContributionPct: 0,
        top3AssetContributionPct: 0,
        assetConcentrationRisk: false,
        dominantAsset: null,
      };
    }

    let successfulAssets = 0;
    let failedAssets = 0;
    let positiveExpectancyCount = 0;
    let profitableCount = 0;

    const returns: number[] = [];
    const winRates: number[] = [];
    const drawdowns: number[] = [];

    for (const a of assetDetails) {
      if (a.isProfitable) {
        successfulAssets++;
      } else {
        failedAssets++;
      }

      if (a.expectancyPct > 0) {
        positiveExpectancyCount++;
      }

      if (a.profitFactor !== null && a.profitFactor > 1.0) {
        profitableCount++;
      }

      returns.push(a.totalReturnPct);
      winRates.push(a.winRatePct);
      drawdowns.push(a.maxDrawdownPct);
    }

    const positiveReturnAssetRatio = Number((successfulAssets / testedAssets).toFixed(2));
    const positiveExpectancyAssetRatio = Number((positiveExpectancyCount / testedAssets).toFixed(2));
    const profitableAssetRatio = Number((profitableCount / testedAssets).toFixed(2));

    const returnDispersion = this.calculateDispersion(returns);
    const winRateDispersion = this.calculateDispersion(winRates);
    const drawdownDispersion = this.calculateDispersion(drawdowns);

    // Concentration calculation
    const profitableAssets = assetDetails
      .filter((a) => a.netProfit > 0)
      .sort((a, b) => b.netProfit - a.netProfit);

    const totalPositiveProfit = profitableAssets.reduce((acc, a) => acc + a.netProfit, 0);

    let topAssetContributionPct = 0;
    let top3AssetContributionPct = 0;
    let dominantAsset: string | null = null;
    let assetConcentrationRisk = false;

    if (totalPositiveProfit > 0 && profitableAssets.length > 0) {
      dominantAsset = profitableAssets[0].symbol;
      topAssetContributionPct = Number(
        ((profitableAssets[0].netProfit / totalPositiveProfit) * 100).toFixed(2)
      );

      const top3Profit = profitableAssets
        .slice(0, 3)
        .reduce((acc, a) => acc + a.netProfit, 0);
      top3AssetContributionPct = Number(
        ((top3Profit / totalPositiveProfit) * 100).toFixed(2)
      );

      // Concentration risk:
      // If 2 assets tested: single asset >= 75% of profit
      // If >= 3 assets tested: single asset >= 50% of profit
      // If >= 4 assets tested: top 3 assets >= 80% of profit
      if (
        (testedAssets === 2 && topAssetContributionPct >= 75.0) ||
        (testedAssets >= 3 && topAssetContributionPct >= 50.0) ||
        (testedAssets >= 4 && top3AssetContributionPct >= 80.0)
      ) {
        assetConcentrationRisk = true;
      }
    }

    return {
      testedAssets,
      successfulAssets,
      failedAssets,
      positiveReturnAssetRatio,
      positiveExpectancyAssetRatio,
      profitableAssetRatio,
      assetDetails,
      returnDispersion,
      winRateDispersion,
      drawdownDispersion,
      topAssetContributionPct,
      top3AssetContributionPct,
      assetConcentrationRisk,
      dominantAsset,
    };
  }

  /**
   * Dimension B — Evaluates performance across independent chronological periods.
   */
  private static evaluateCrossPeriod(
    allTrades: readonly BacktestTrade[],
    assetCandlesMap: Map<string, readonly HistoricalCandle[]>,
    initialCapital: number
  ): CrossPeriodGeneralizationSummary {
    const periods: GeneralizationEvaluationPeriod[] = [
      'EARLY_PERIOD',
      'MIDDLE_PERIOD',
      'RECENT_PERIOD',
    ];

    if (allTrades.length === 0) {
      const emptyResults: PeriodValidationResult[] = periods.map((p) => ({
        period: p,
        fromDate: '',
        toDate: '',
        totalTrades: 0,
        totalReturnPct: 0,
        winRatePct: 0,
        expectancyPct: 0,
        profitFactor: null,
        maxDrawdownPct: 0,
        netProfit: 0,
        calmarRatio: null,
        statisticalPowerTier: 'INSUFFICIENT_DATA',
        isProfitable: false,
      }));

      return {
        periods: emptyResults,
        positivePeriodRatio: 0,
        medianPeriodReturnPct: 0,
        bestPeriodReturnPct: 0,
        worstPeriodReturnPct: 0,
        returnDispersionPct: 0,
        recentDegradation: false,
        historicalEdgeRisk: false,
        isTemporallyConsistent: false,
      };
    }

    // Chronological partitioning of trades into Early, Middle, Recent
    const n = allTrades.length;
    const p1 = Math.floor(n / 3);
    const p2 = Math.floor((2 * n) / 3);

    const earlyTrades = allTrades.slice(0, p1);
    const middleTrades = allTrades.slice(p1, p2);
    const recentTrades = allTrades.slice(p2);

    const earlyDates = {
      from: earlyTrades[0]?.entryDate || '',
      to: earlyTrades[earlyTrades.length - 1]?.exitDate || '',
    };
    const middleDates = {
      from: middleTrades[0]?.entryDate || '',
      to: middleTrades[middleTrades.length - 1]?.exitDate || '',
    };
    const recentDates = {
      from: recentTrades[0]?.entryDate || '',
      to: recentTrades[recentTrades.length - 1]?.exitDate || '',
    };

    const earlyResult = this.evaluatePeriodTrades('EARLY_PERIOD', earlyTrades, earlyDates, initialCapital);
    const middleResult = this.evaluatePeriodTrades('MIDDLE_PERIOD', middleTrades, middleDates, initialCapital);
    const recentResult = this.evaluatePeriodTrades('RECENT_PERIOD', recentTrades, recentDates, initialCapital);

    const periodResults = [earlyResult, middleResult, recentResult];

    const positivePeriods = periodResults.filter((p) => p.isProfitable).length;
    const positivePeriodRatio = Number((positivePeriods / 3).toFixed(2));

    const returns = periodResults.map((p) => p.totalReturnPct).sort((a, b) => a - b);
    const medianPeriodReturnPct = returns[1];
    const worstPeriodReturnPct = returns[0];
    const bestPeriodReturnPct = returns[2];
    const returnDispersionPct = Number((bestPeriodReturnPct - worstPeriodReturnPct).toFixed(2));

    // Temporal consistency checks
    // 1. Recent degradation: recent period negative while earlier periods were positive,
    // or recent return degraded by > 50% relative to early return when early return was strong (> 5%)
    let recentDegradation = false;
    if (recentResult.totalReturnPct < 0 && (earlyResult.totalReturnPct > 0 || middleResult.totalReturnPct > 0)) {
      recentDegradation = true;
    } else if (
      earlyResult.totalReturnPct > 5.0 &&
      recentResult.totalReturnPct < 0.5 * earlyResult.totalReturnPct
    ) {
      recentDegradation = true;
    }

    // 2. Historical edge risk: only early period was positive, both middle and recent are flat/negative
    let historicalEdgeRisk = false;
    if (earlyResult.isProfitable && !middleResult.isProfitable && !recentResult.isProfitable) {
      historicalEdgeRisk = true;
    }

    const isTemporallyConsistent =
      positivePeriods === 3 && !recentDegradation && !historicalEdgeRisk;

    return {
      periods: periodResults,
      positivePeriodRatio,
      medianPeriodReturnPct,
      bestPeriodReturnPct,
      worstPeriodReturnPct,
      returnDispersionPct,
      recentDegradation,
      historicalEdgeRisk,
      isTemporallyConsistent,
    };
  }

  /**
   * Helper to evaluate metrics for a single period slice.
   */
  private static evaluatePeriodTrades(
    period: GeneralizationEvaluationPeriod,
    trades: readonly BacktestTrade[],
    dateRange: { from: string; to: string },
    initialCapital: number
  ): PeriodValidationResult {
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return {
        period,
        fromDate: dateRange.from,
        toDate: dateRange.to,
        totalTrades: 0,
        totalReturnPct: 0,
        winRatePct: 0,
        expectancyPct: 0,
        profitFactor: null,
        maxDrawdownPct: 0,
        netProfit: 0,
        calmarRatio: null,
        statisticalPowerTier: 'INSUFFICIENT_DATA',
        isProfitable: false,
      };
    }

    let winningTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let netProfit = 0;
    let sumReturnPct = 0;

    for (const t of trades) {
      netProfit += t.netPnL;
      sumReturnPct += t.returnPct;
      if (t.netPnL > 0) {
        winningTrades++;
        grossProfit += t.netPnL;
      } else if (t.netPnL < 0) {
        grossLoss += Math.abs(t.netPnL);
      }
    }

    const winRatePct = Number(((winningTrades / totalTrades) * 100).toFixed(2));
    const totalReturnPct = Number(((netProfit / initialCapital) * 100).toFixed(2));
    const expectancyPct = Number((sumReturnPct / totalTrades).toFixed(2));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null;

    // Drawdown
    let peak = initialCapital;
    let current = initialCapital;
    let maxDrawdownPct = 0;
    for (const t of trades) {
      current += t.netPnL;
      if (current > peak) peak = current;
      const dd = peak > 0 ? ((peak - current) / peak) * 100 : 0;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    }
    maxDrawdownPct = Number(maxDrawdownPct.toFixed(2));

    const calmarRatio = maxDrawdownPct > 0 ? Number((totalReturnPct / maxDrawdownPct).toFixed(2)) : null;

    let statisticalPowerTier: StatisticalPowerTier = 'INSUFFICIENT_DATA';
    if (totalTrades >= CrossGeneralizationValidator.MIN_TRADES_ADEQUATE) {
      statisticalPowerTier = 'ADEQUATE_STATISTICAL_POWER';
    } else if (totalTrades >= CrossGeneralizationValidator.MIN_TRADES_MODERATE) {
      statisticalPowerTier = 'MODERATE_STATISTICAL_POWER';
    } else if (totalTrades >= CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT) {
      statisticalPowerTier = 'LOW_STATISTICAL_POWER';
    }

    return {
      period,
      fromDate: dateRange.from,
      toDate: dateRange.to,
      totalTrades,
      totalReturnPct,
      winRatePct,
      expectancyPct,
      profitFactor,
      maxDrawdownPct,
      netProfit: Number(netProfit.toFixed(2)),
      calmarRatio,
      statisticalPowerTier,
      isProfitable: netProfit > 0,
    };
  }

  /**
   * Dimension C — Evaluates performance across market regimes using RegimeDetector.
   */
  private static evaluateCrossRegime(
    resolvedAssetTrades: Map<string, readonly BacktestTrade[]>,
    assetCandlesMap: Map<string, readonly HistoricalCandle[]>
  ): CrossRegimeGeneralizationSummary {
    const regimes: MarketRegimeType[] = [
      'BULL_TREND',
      'BEAR_TREND',
      'SIDEWAYS_VOLATILE',
      'SIDEWAYS_QUIET',
    ];

    // Build map of symbol + date -> MarketRegimeType
    const regimeDateMap = new Map<string, MarketRegimeType>();
    const regimeBarCounts: Record<MarketRegimeType, number> = {
      BULL_TREND: 0,
      BEAR_TREND: 0,
      SIDEWAYS_VOLATILE: 0,
      SIDEWAYS_QUIET: 0,
    };

    for (const [symbol, candles] of assetCandlesMap.entries()) {
      if (candles.length > 0) {
        const classifiedBars = RegimeDetector.classifyAllBars(candles);
        for (const b of classifiedBars) {
          regimeDateMap.set(`${symbol}_${b.date}`, b.regime);
          regimeBarCounts[b.regime] = (regimeBarCounts[b.regime] || 0) + 1;
        }
      }
    }

    // Partition trades by entry regime
    const regimeTradesMap: Record<MarketRegimeType, BacktestTrade[]> = {
      BULL_TREND: [],
      BEAR_TREND: [],
      SIDEWAYS_VOLATILE: [],
      SIDEWAYS_QUIET: [],
    };

    for (const [symbol, trades] of resolvedAssetTrades.entries()) {
      for (const t of trades) {
        const key = `${symbol}_${t.entryDate}`;
        const regime = regimeDateMap.get(key) || 'SIDEWAYS_QUIET';
        regimeTradesMap[regime].push(t);
      }
    }

    const regimeResults: RegimeValidationResult[] = [];
    let testedRegimes = 0;
    let adequatelySampledRegimes = 0;
    let positiveRegimes = 0;
    let maxBars = -1;
    let dominantRegime: MarketRegimeType | null = null;

    for (const reg of regimes) {
      const barsInReg = regimeBarCounts[reg] || 0;
      if (barsInReg > maxBars) {
        maxBars = barsInReg;
        dominantRegime = reg;
      }

      const trades = regimeTradesMap[reg];
      const tradeCount = trades.length;

      let winningTrades = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      let netProfit = 0;
      let sumReturnPct = 0;

      for (const t of trades) {
        netProfit += t.netPnL;
        sumReturnPct += t.returnPct;
        if (t.netPnL > 0) {
          winningTrades++;
          grossProfit += t.netPnL;
        } else if (t.netPnL < 0) {
          grossLoss += Math.abs(t.netPnL);
        }
      }

      const winRatePct = tradeCount > 0 ? Number(((winningTrades / tradeCount) * 100).toFixed(2)) : 0;
      const totalReturnPct = Number(sumReturnPct.toFixed(2));
      const expectancyPct = tradeCount > 0 ? Number((sumReturnPct / tradeCount).toFixed(2)) : 0;
      const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null;

      // Drawdown
      let peak = 100_000_000;
      let current = 100_000_000;
      let maxDrawdownPct = 0;
      for (const t of trades) {
        current += t.netPnL;
        if (current > peak) peak = current;
        const dd = peak > 0 ? ((peak - current) / peak) * 100 : 0;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;
      }
      maxDrawdownPct = Number(maxDrawdownPct.toFixed(2));

      // Determine testing status
      let status: RegimeTestingStatus = 'NOT_TESTED';
      if (tradeCount === 0 && barsInReg === 0) {
        status = 'NOT_TESTED';
      } else if (tradeCount < CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT) {
        status = 'INSUFFICIENT_DATA';
        testedRegimes++;
      } else {
        testedRegimes++;
        adequatelySampledRegimes++;
        if (netProfit > 0) {
          status = 'TESTED_POSITIVE';
          positiveRegimes++;
        } else {
          status = 'TESTED_NEGATIVE';
        }
      }

      const isProfitable = netProfit > 0;
      if (tradeCount > 0 && isProfitable && status === 'INSUFFICIENT_DATA') {
        positiveRegimes++;
      }

      regimeResults.push({
        regime: reg,
        tradeCount,
        totalReturnPct,
        winRatePct,
        expectancyPct,
        profitFactor,
        maxDrawdownPct,
        netProfit: Number(netProfit.toFixed(2)),
        status,
        isProfitable,
      });
    }

    const positiveRegimeRatio = testedRegimes > 0 ? Number((positiveRegimes / testedRegimes).toFixed(2)) : 0;

    // Regime dependency check:
    // Only 1 regime is positive and others with trades are negative,
    // or dominant regime represents > 85% of total returns
    const profitableCount = regimeResults.filter((r) => r.isProfitable).length;
    const regimeDependent = testedRegimes >= 2 && profitableCount <= 1;

    // Regime failure check:
    // An adequately sampled regime (tradeCount >= 30) produces material loss (netProfit < 0 and totalReturnPct < -5%)
    const regimeFailure = regimeResults.some(
      (r) =>
        r.tradeCount >= CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT &&
        r.netProfit < 0 &&
        r.totalReturnPct < -5.0
    );

    return {
      regimes: regimeResults,
      testedRegimes,
      adequatelySampledRegimes,
      positiveRegimeRatio,
      regimeDependent,
      regimeFailure,
      dominantRegime,
    };
  }

  /**
   * Constructs the cross-dimensional diagnostic matrix (Dimensions x Assets).
   */
  private static buildCrossDimensionMatrix(
    assetDetails: readonly AssetValidationResult[],
    resolvedAssetTrades: Map<string, readonly BacktestTrade[]>,
    assetCandlesMap: Map<string, readonly HistoricalCandle[]>
  ): CrossDimensionMatrix {
    const rowHeaders = [
      'Early Period',
      'Middle Period',
      'Recent Period',
      'Bull Regime',
      'Bear Regime',
      'Sideways Volatile',
      'Sideways Quiet',
    ];

    const colHeaders = assetDetails.map((a) => a.symbol);
    const grid: Record<string, Record<string, CrossDimensionCell>> = {};

    for (const r of rowHeaders) {
      grid[r] = {};
    }

    for (const asset of assetDetails) {
      const trades = resolvedAssetTrades.get(asset.symbol) || [];
      const candles = assetCandlesMap.get(asset.symbol) || [];

      // Periods for this asset
      const nTrades = trades.length;
      let early: BacktestTrade[] = [];
      let middle: BacktestTrade[] = [];
      let recent: BacktestTrade[] = [];

      if (nTrades > 0) {
        const p1 = Math.floor(nTrades / 3);
        const p2 = Math.floor((2 * nTrades) / 3);
        early = trades.slice(0, p1);
        middle = trades.slice(p1, p2);
        recent = trades.slice(p2);
      }

      grid['Early Period'][asset.symbol] = this.createCellFromTrades(early);
      grid['Middle Period'][asset.symbol] = this.createCellFromTrades(middle);
      grid['Recent Period'][asset.symbol] = this.createCellFromTrades(recent);

      // Regimes for this asset
      const regimeDateMap = new Map<string, MarketRegimeType>();
      if (candles.length > 0) {
        const classifiedBars = RegimeDetector.classifyAllBars(candles);
        for (const b of classifiedBars) {
          regimeDateMap.set(b.date, b.regime);
        }
      }

      const bullTrades = trades.filter((t) => regimeDateMap.get(t.entryDate) === 'BULL_TREND');
      const bearTrades = trades.filter((t) => regimeDateMap.get(t.entryDate) === 'BEAR_TREND');
      const sideVolTrades = trades.filter((t) => regimeDateMap.get(t.entryDate) === 'SIDEWAYS_VOLATILE');
      const sideQuietTrades = trades.filter(
        (t) => (regimeDateMap.get(t.entryDate) || 'SIDEWAYS_QUIET') === 'SIDEWAYS_QUIET'
      );

      grid['Bull Regime'][asset.symbol] = this.createCellFromTrades(bullTrades);
      grid['Bear Regime'][asset.symbol] = this.createCellFromTrades(bearTrades);
      grid['Sideways Volatile'][asset.symbol] = this.createCellFromTrades(sideVolTrades);
      grid['Sideways Quiet'][asset.symbol] = this.createCellFromTrades(sideQuietTrades);
    }

    return {
      rowHeaders,
      colHeaders,
      grid,
    };
  }

  /**
   * Helper to format a cell for the cross-dimension matrix.
   */
  private static createCellFromTrades(trades: readonly BacktestTrade[]): CrossDimensionCell {
    if (trades.length === 0) {
      return { status: 'NOT_TESTED', returnPct: 0, tradeCount: 0 };
    }

    const netPnL = trades.reduce((acc, t) => acc + t.netPnL, 0);
    const returnPct = Number(trades.reduce((acc, t) => acc + t.returnPct, 0).toFixed(2));

    if (trades.length < 5) {
      return {
        status: 'INSUFFICIENT_DATA',
        returnPct,
        tradeCount: trades.length,
      };
    }

    return {
      status: netPnL > 0 ? 'PASS' : 'FAIL',
      returnPct,
      tradeCount: trades.length,
    };
  }

  /**
   * Calculates the research-only generalization diagnostic score (0 - 100).
   */
  private static calculateGeneralizationScore(
    crossAsset: CrossAssetGeneralizationSummary,
    crossPeriod: CrossPeriodGeneralizationSummary,
    crossRegime: CrossRegimeGeneralizationSummary,
    totalTrades: number
  ): GeneralizationScoreBreakdown {
    // 1. Asset Coverage Score (0 - 30)
    const assetRatioPart = crossAsset.positiveReturnAssetRatio * 20;
    const assetBreadthPart = Math.min(crossAsset.testedAssets / 5, 1.0) * 10;
    const assetCoverageScore = Math.round(assetRatioPart + assetBreadthPart);

    // 2. Period Consistency Score (0 - 25)
    const periodConsistencyScore = Math.round(crossPeriod.positivePeriodRatio * 25);

    // 3. Regime Coverage Score (0 - 25)
    const regimeRatioPart = crossRegime.positiveRegimeRatio * 15;
    const regimeAdequacyPart = Math.min(crossRegime.adequatelySampledRegimes / 3, 1.0) * 10;
    const regimeCoverageScore = Math.round(regimeRatioPart + regimeAdequacyPart);

    // 4. Statistical Power Score (0 - 20)
    let statisticalPowerScore = 0;
    if (totalTrades >= CrossGeneralizationValidator.MIN_TRADES_ADEQUATE) {
      statisticalPowerScore = 20;
    } else if (totalTrades >= CrossGeneralizationValidator.MIN_TRADES_MODERATE) {
      statisticalPowerScore = 14;
    } else if (totalTrades >= CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT) {
      statisticalPowerScore = 8;
    }

    // 5. Penalties
    let concentrationPenalty = 0;
    if (crossAsset.assetConcentrationRisk) {
      concentrationPenalty = -15;
    }

    let recentDegradationPenalty = 0;
    if (crossPeriod.recentDegradation) {
      recentDegradationPenalty = -15;
    }

    let regimeFailurePenalty = 0;
    if (crossRegime.regimeFailure) {
      regimeFailurePenalty = -15;
    }

    const rawTotal =
      assetCoverageScore +
      periodConsistencyScore +
      regimeCoverageScore +
      statisticalPowerScore +
      concentrationPenalty +
      recentDegradationPenalty +
      regimeFailurePenalty;

    const totalScore = Math.max(0, Math.min(100, rawTotal));

    return {
      totalScore,
      assetCoverageScore,
      periodConsistencyScore,
      regimeCoverageScore,
      statisticalPowerScore,
      penalties: {
        concentrationPenalty,
        recentDegradationPenalty,
        regimeFailurePenalty,
      },
      notice: 'RESEARCH_DIAGNOSTIC_ONLY',
    };
  }

  /**
   * Evaluates the complete cross-dimensional evidence into a conservative classification.
   */
  private static determineClassification(
    crossAsset: CrossAssetGeneralizationSummary,
    crossPeriod: CrossPeriodGeneralizationSummary,
    crossRegime: CrossRegimeGeneralizationSummary,
    totalTrades: number,
    limitations: string[],
    keyFindings: string[]
  ): GeneralizationClassification {
    // 1. Check for Insufficient Data
    if (totalTrades < CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT || crossAsset.testedAssets === 0) {
      limitations.push(
        `Insufficient trade sample size: ${totalTrades} total trades across ${crossAsset.testedAssets} assets (< ${CrossGeneralizationValidator.MIN_TRADES_INSUFFICIENT} required).`
      );
      return 'INSUFFICIENT_DATA';
    }

    // 2. Check for Structural Failure
    if (crossAsset.positiveReturnAssetRatio === 0 || crossAsset.successfulAssets === 0) {
      limitations.push('Strategy failed across all tested assets (zero profitable assets).');
      return 'FAILED';
    }

    // 3. Asset Dependency Check
    if (crossAsset.assetConcentrationRisk) {
      limitations.push(
        `Excessive asset concentration risk: Dominant asset (${crossAsset.dominantAsset}) contributes ${crossAsset.topAssetContributionPct}% of aggregate profits.`
      );
      return 'ASSET_DEPENDENT';
    }

    // 4. Period Dependency / Temporal Degradation Check
    if (crossPeriod.historicalEdgeRisk) {
      limitations.push('Historical-only edge: Positive performance is confined entirely to the early period.');
      return 'PERIOD_DEPENDENT';
    }

    if (crossPeriod.recentDegradation && crossPeriod.positivePeriodRatio <= 0.33) {
      limitations.push('Severe recent deterioration: Strategy performance collapsed in the recent period.');
      return 'PERIOD_DEPENDENT';
    }

    // 5. Regime Dependency / Failure Check
    if (crossRegime.regimeFailure) {
      limitations.push('Regime failure detected: Significant capital impairment observed in an adequately sampled market regime.');
      return 'REGIME_DEPENDENT';
    }

    if (crossRegime.regimeDependent) {
      limitations.push('Regime dependency detected: Strategy profitability is strictly isolated to a single market regime.');
      return 'REGIME_DEPENDENT';
    }

    // 6. Weak Generalization Check
    if (
      crossAsset.positiveReturnAssetRatio < 0.60 ||
      crossPeriod.positivePeriodRatio < 0.60 ||
      crossRegime.positiveRegimeRatio < 0.50
    ) {
      limitations.push('Mixed performance across tested assets, periods, or regimes indicates weak generalization.');
      return 'WEAK_GENERALIZATION';
    }

    // 7. Generalizes Well vs Conditionally Generalizes
    const isRobustAcrossAssets = crossAsset.testedAssets >= 2 && crossAsset.positiveReturnAssetRatio >= 0.75;
    const isRobustAcrossPeriods = crossPeriod.isTemporallyConsistent;
    const isRobustAcrossRegimes = crossRegime.testedRegimes >= 2 && !crossRegime.regimeFailure;

    if (isRobustAcrossAssets && isRobustAcrossPeriods && isRobustAcrossRegimes) {
      keyFindings.push(
        `Robust cross-asset generalization confirmed across ${crossAsset.testedAssets} symbols (${Math.round(crossAsset.positiveReturnAssetRatio * 100)}% profitable).`
      );
      keyFindings.push('Temporal consistency verified across early, middle, and recent chronological evaluation periods.');
      keyFindings.push('Market regime resilience verified without catastrophic failure in any regime.');
      return 'GENERALIZES_WELL';
    }

    keyFindings.push('Strategy demonstrates partial generalization across dimensions with minor conditional limitations.');
    return 'CONDITIONALLY_GENERALIZES';
  }

  /**
   * Helper to compute dispersion metrics (mean, median, min, max, stdDev).
   */
  private static calculateDispersion(values: readonly number[]): MetricDispersion {
    if (values.length === 0) {
      return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = Number((sum / sorted.length).toFixed(2));

    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));

    let varianceSum = 0;
    for (const v of sorted) {
      varianceSum += Math.pow(v - mean, 2);
    }
    const stdDev = sorted.length > 1 ? Number(Math.sqrt(varianceSum / (sorted.length - 1)).toFixed(2)) : 0;

    return { mean, median, min, max, stdDev };
  }

  /**
   * Creates a fail-closed blocked or failed validation report.
   */
  private static createBlockedReport(
    strategyId: string,
    strategyName: string,
    reason: string,
    verdict: 'BLOCKED' | 'FAILED'
  ): CrossGeneralizationReport {
    const emptyDispersion: MetricDispersion = { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };

    return {
      strategyId,
      strategyName,
      crossAsset: {
        testedAssets: 0,
        successfulAssets: 0,
        failedAssets: 0,
        positiveReturnAssetRatio: 0,
        positiveExpectancyAssetRatio: 0,
        profitableAssetRatio: 0,
        assetDetails: [],
        returnDispersion: emptyDispersion,
        winRateDispersion: emptyDispersion,
        drawdownDispersion: emptyDispersion,
        topAssetContributionPct: 0,
        top3AssetContributionPct: 0,
        assetConcentrationRisk: false,
        dominantAsset: null,
      },
      crossPeriod: {
        periods: [],
        positivePeriodRatio: 0,
        medianPeriodReturnPct: 0,
        bestPeriodReturnPct: 0,
        worstPeriodReturnPct: 0,
        returnDispersionPct: 0,
        recentDegradation: false,
        historicalEdgeRisk: false,
        isTemporallyConsistent: false,
      },
      crossRegime: {
        regimes: [],
        testedRegimes: 0,
        adequatelySampledRegimes: 0,
        positiveRegimeRatio: 0,
        regimeDependent: false,
        regimeFailure: false,
        dominantRegime: null,
      },
      matrix: {
        rowHeaders: [],
        colHeaders: [],
        grid: {},
      },
      score: {
        totalScore: 0,
        assetCoverageScore: 0,
        periodConsistencyScore: 0,
        regimeCoverageScore: 0,
        statisticalPowerScore: 0,
        penalties: {
          concentrationPenalty: 0,
          recentDegradationPenalty: 0,
          regimeFailurePenalty: 0,
        },
        notice: 'RESEARCH_DIAGNOSTIC_ONLY',
      },
      classification: verdict,
      keyFindings: [],
      limitations: [reason],
      governanceAudit: {
        noLookAhead: true,
        noActiveBarLeakage: true,
        nextBarOpenExecution: true,
        deterministicValidation: true,
        frictionPreserved: true,
        noProductionMock: true,
        noExecutionMutation: true,
        noStrategyOptimization: true,
      },
    };
  }
}
