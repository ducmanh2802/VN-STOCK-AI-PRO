/**
 * PHASE 17.6 — DETERMINISTIC BACKTEST ENGINE
 * ============================================
 * Production-grade historical backtesting engine for quantitative strategy verification.
 * 
 * CORE RESPONSIBILITIES:
 *   1. Accepts validated historical OHLCV series.
 *   2. Iterates chronologically without look-ahead bias (via LookAheadGuard).
 *   3. Evaluates strategy at bar T close.
 *   4. Executes trades conservatively at bar T+1 open (via TradeSimulator).
 *   5. Calculates comprehensive, deterministic performance metrics.
 *   6. Produces verified BacktestResult.
 */

import { LookAheadGuard } from './LookAheadGuard.ts';
import { BacktestDataAdapter } from './BacktestDataAdapter.ts';
import { TradeSimulator } from './TradeSimulator.ts';
import { PerformanceMetricsCalculator } from './PerformanceMetrics.ts';
import type {
  BacktestConfig,
  BacktestResult,
  HistoricalCandle,
  HistoricalStrategy,
} from './types.ts';

export class BacktestEngine {
  /**
   * Runs a complete, deterministic backtest of a strategy on historical candles.
   *
   * @param strategy The historical strategy implementation to evaluate
   * @param candles Validated chronological candlestick series
   * @param config Backtesting configuration parameters
   * @returns Complete BacktestResult with metrics, trades, equity curve, and validation audit
   */
  public static run(
    strategy: HistoricalStrategy,
    candles: readonly HistoricalCandle[],
    config: BacktestConfig
  ): BacktestResult {
    const errorMessages: string[] = [];
    const warningMessages: string[] = [];

    // 1. Data Validation Check
    const validation = BacktestDataAdapter.validateAndNormalize(candles, config.symbol);
    if (!validation.valid || validation.candles.length === 0) {
      const emptyMetrics = PerformanceMetricsCalculator.calculate(
        config.initialCapital,
        config.initialCapital,
        [],
        []
      );

      return {
        symbol: config.symbol,
        strategyId: strategy.id,
        strategyName: strategy.name,
        timeframe: config.timeframe ?? '1D',
        startDate: '',
        endDate: '',
        totalBars: 0,
        metrics: emptyMetrics,
        trades: [],
        equityCurve: [],
        validation: {
          lookAheadBiasDetected: false,
          invalidDataDetected: true,
          deterministic: true,
          errorMessages: validation.errors,
          warningMessages: validation.warnings,
        },
      };
    }

    const validatedCandles = validation.candles;
    const totalBars = validatedCandles.length;
    const startDate = validatedCandles[0].timestamp;
    const endDate = validatedCandles[totalBars - 1].timestamp;

    // 2. Initialize Simulator
    const simulator = new TradeSimulator(config);

    // 3. Sequential Chronological Simulation
    for (let i = 0; i < totalBars; i++) {
      const currentCandle = validatedCandles[i];

      // Build isolated historical context (strictly prevents future bar access)
      const context = LookAheadGuard.createContext(validatedCandles, i);

      // Evaluate strategy at candle close
      let signal = null;
      try {
        signal = strategy.evaluate(context);
      } catch (err: any) {
        errorMessages.push(`Bar[${i}] ${currentCandle.timestamp}: Strategy evaluation threw: ${err?.message}`);
      }

      // Process bar and execute queued trades
      simulator.processBar(currentCandle, i, signal);
    }

    // 4. Finalize Simulator (close any open trade at last bar)
    const { trades, equityCurve, finalCapital } = simulator.finalize(
      validatedCandles[totalBars - 1],
      totalBars
    );

    // 5. Compute Performance Metrics
    const metrics = PerformanceMetricsCalculator.calculate(
      config.initialCapital,
      finalCapital,
      trades,
      equityCurve
    );

    return {
      symbol: config.symbol,
      strategyId: strategy.id,
      strategyName: strategy.name,
      timeframe: config.timeframe ?? '1D',
      startDate,
      endDate,
      totalBars,
      metrics,
      trades,
      equityCurve,
      validation: {
        lookAheadBiasDetected: false,
        invalidDataDetected: false,
        deterministic: true,
        errorMessages: Object.freeze(errorMessages),
        warningMessages: Object.freeze(warningMessages),
      },
    };
  }
}
