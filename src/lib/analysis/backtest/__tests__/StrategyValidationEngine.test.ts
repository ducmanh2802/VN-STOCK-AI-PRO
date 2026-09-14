/**
 * PHASE 17.7 — STRATEGY VALIDATION & ANTI-OVERFITTING TESTS
 * ==========================================================
 * Tests for chronological splitting, walk-forward analysis, friction stress,
 * parameter sensitivity, regime detection, concentration risk, and
 * conservative robustness classification.
 */

import { describe, it, expect } from 'vitest';
import { StrategyValidationEngine } from '../validation/StrategyValidationEngine.ts';
import { RegimeDetector } from '../validation/RegimeDetector.ts';
import { TrendFollowingBacktestStrategy } from '../strategies/TrendFollowingBacktest.ts';
import { BreakoutConfirmationBacktestStrategy } from '../strategies/BreakoutConfirmationBacktest.ts';
import { MeanReversionBacktestStrategy } from '../strategies/MeanReversionBacktest.ts';
import type { BacktestConfig, HistoricalCandle } from '../types.ts';

describe('Phase 17.7 — Advanced Strategy Validation & Anti-Overfitting', () => {
  const baseConfig: BacktestConfig = {
    symbol: 'HPG',
    initialCapital: 100_000_000,
    commissionRate: 0.0015,
    sellTaxRate: 0.0010,
    slippageRate: 0.0010,
    positionSizePct: 1.0,
    boardLot: 100,
    timeframe: '1D',
  };

  function generateDeterministicCandles(count: number, startPrice: number = 25000): HistoricalCandle[] {
    const candles: HistoricalCandle[] = [];
    let price = startPrice;

    for (let i = 0; i < count; i++) {
      // Deterministic pseudo-cyclical sequence
      const cycle = Math.sin(i / 10) * 800 + (i * 50);
      const close = Math.max(10000, Math.round(startPrice + cycle));
      const open = Math.round(close * 0.995);
      const high = Math.round(Math.max(open, close) * 1.015);
      const low = Math.round(Math.min(open, close) * 0.985);
      const volume = 150_000 + ((i % 5) * 50_000);

      // Deterministic date string YYYY-MM-DD
      const date = new Date(2024, 0, 1 + i);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const timestamp = `${yyyy}-${mm}-${dd}`;

      candles.push({
        symbol: 'HPG',
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });
      price = close;
    }
    return candles;
  }

  describe('1. Chronological Dataset Partitioning', () => {
    it('enforces minimum bar requirements (fails closed if < 60 bars)', () => {
      const candles = generateDeterministicCandles(40);
      const split = StrategyValidationEngine.splitChronologically(candles);

      expect(split.isChronologicallyValid).toBe(false);
      expect(split.trainCandles.length).toBe(0);
      expect(split.testCandles.length).toBe(0);
    });

    it('partitions candles strictly chronologically into Train < Validation < Test with zero overlap', () => {
      const candles = generateDeterministicCandles(100);
      const split = StrategyValidationEngine.splitChronologically(candles, {
        trainRatio: 0.60,
        validationRatio: 0.20,
        testRatio: 0.20,
      });

      expect(split.isChronologicallyValid).toBe(true);
      expect(split.trainCandles.length).toBe(60);
      expect(split.validationCandles.length).toBe(20);
      expect(split.testCandles.length).toBe(20);

      // Verify strict temporal ordering: Train < Validation < Test
      const lastTrainTime = split.trainCandles[split.trainCandles.length - 1].timestamp;
      const firstValTime = split.validationCandles[0].timestamp;
      const lastValTime = split.validationCandles[split.validationCandles.length - 1].timestamp;
      const firstTestTime = split.testCandles[0].timestamp;

      expect(lastTrainTime < firstValTime).toBe(true);
      expect(lastValTime < firstTestTime).toBe(true);
    });
  });

  describe('2. In-Sample vs Out-of-Sample (OOS) Verification', () => {
    it('compares performance metrics between train and test datasets', () => {
      const candles = generateDeterministicCandles(120);
      const strategy = new TrendFollowingBacktestStrategy();
      const oos = StrategyValidationEngine.runOOSValidation(strategy, candles, baseConfig);

      expect(oos.inSampleMetrics).toBeDefined();
      expect(oos.outOfSampleMetrics).toBeDefined();
      expect(typeof oos.returnDegradationPct).toBe('number');
      expect(typeof oos.winRateDeltaPct).toBe('number');
      expect(typeof oos.isOosProfitable).toBe('boolean');
    });

    it('handles invalid or empty split gracefully', () => {
      const candles = generateDeterministicCandles(30); // Below min lookback
      const strategy = new TrendFollowingBacktestStrategy();
      const oos = StrategyValidationEngine.runOOSValidation(strategy, candles, baseConfig);

      expect(oos.isOosDegraded).toBe(true);
      expect(oos.isOosProfitable).toBe(false);
    });
  });

  describe('3. Walk-Forward Rolling Windows', () => {
    it('executes rolling chronological windows with isolated test periods', () => {
      const candles = generateDeterministicCandles(140);
      const strategy = new TrendFollowingBacktestStrategy();
      const wf = StrategyValidationEngine.runWalkForwardValidation(strategy, candles, baseConfig, {
        windowCount: 3,
        trainBars: 60,
        testBars: 20,
      });

      expect(wf.windows.length).toBe(3);
      expect(typeof wf.aggregateOosReturnPct).toBe('number');
      expect(typeof wf.profitableWindowRatio).toBe('number');

      // Verify each window has test period strictly following train period
      for (const w of wf.windows) {
        expect(w.trainDateRange.to < w.testDateRange.from).toBe(true);
      }
    });
  });

  describe('4. Realistic Friction Stress Testing', () => {
    it('evaluates BASE, BASE_PLUS_SLIPPAGE, and HIGH_SLIPPAGE scenarios', () => {
      const candles = generateDeterministicCandles(100);
      const strategy = new TrendFollowingBacktestStrategy();
      const stress = StrategyValidationEngine.runFrictionStressTest(strategy, candles, baseConfig);

      expect(stress.scenarios.length).toBe(3);
      expect(stress.scenarios[0].scenario).toBe('BASE');
      expect(stress.scenarios[1].scenario).toBe('BASE_PLUS_SLIPPAGE');
      expect(stress.scenarios[2].scenario).toBe('HIGH_SLIPPAGE');

      // Friction drag increases with slippage
      const baseDrag = stress.scenarios[0].frictionDragPct;
      const highDrag = stress.scenarios[2].frictionDragPct;
      expect(highDrag).toBeGreaterThanOrEqual(baseDrag);
    });
  });

  describe('5. Parameter Sensitivity Perturbation', () => {
    it('evaluates parameter perturbations for Trend Following strategy', () => {
      const candles = generateDeterministicCandles(100);
      const sens = StrategyValidationEngine.runParameterSensitivity('STRATEGY_TREND_FOLLOWING', candles, baseConfig);

      expect(sens.perturbations.length).toBe(2);
      expect(sens.perturbations[0].parameterName).toBe('fastPeriod');
      expect(sens.perturbations[1].parameterName).toBe('slowPeriod');
      expect(sens.perturbations[0].testedValues).toEqual([18, 20, 22]);
      expect(sens.perturbations[1].testedValues).toEqual([45, 50, 55]);
    });

    it('evaluates parameter perturbations for Breakout Confirmation strategy', () => {
      const candles = generateDeterministicCandles(100);
      const sens = StrategyValidationEngine.runParameterSensitivity('STRATEGY_BREAKOUT_CONFIRMATION', candles, baseConfig);

      expect(sens.perturbations.length).toBe(2);
      expect(sens.perturbations[0].parameterName).toBe('consolidationBars');
      expect(sens.perturbations[1].parameterName).toBe('volumeMultiplier');
    });

    it('evaluates parameter perturbations for Mean Reversion strategy', () => {
      const candles = generateDeterministicCandles(100);
      const sens = StrategyValidationEngine.runParameterSensitivity('STRATEGY_MEAN_REVERSION', candles, baseConfig);

      expect(sens.perturbations.length).toBe(2);
      expect(sens.perturbations[0].parameterName).toBe('bbPeriod');
      expect(sens.perturbations[1].parameterName).toBe('rsiOversold');
    });
  });

  describe('6. Market Regime Detector & Robustness', () => {
    it('detects regime without look-ahead bias using strictly candles up to T', () => {
      const candles = generateDeterministicCandles(80);
      const regimeAt60 = RegimeDetector.detectRegimeAt(candles, 60);
      expect(['BULL_TREND', 'BEAR_TREND', 'SIDEWAYS_VOLATILE', 'SIDEWAYS_QUIET']).toContain(regimeAt60);

      // Adding future candles must not change regime classification at bar 60
      const longerCandles = generateDeterministicCandles(120);
      const regimeAt60After = RegimeDetector.detectRegimeAt(longerCandles, 60);
      expect(regimeAt60After).toBe(regimeAt60);
    });

    it('evaluates performance categorized by market regime', () => {
      const candles = generateDeterministicCandles(100);
      const strategy = new TrendFollowingBacktestStrategy();
      const regimeSummary = StrategyValidationEngine.runRegimeAnalysis(strategy, candles, baseConfig);

      expect(regimeSummary.regimes.length).toBe(4);
      expect(regimeSummary.dominantRegime).toBeDefined();
      expect(typeof regimeSummary.isRegimeDependent).toBe('boolean');
    });
  });

  describe('7. Trade Concentration & Distribution Analysis', () => {
    it('calculates trade distribution and detects concentration risk', () => {
      const trades = [
        {
          id: '1',
          symbol: 'HPG',
          side: 'LONG' as const,
          entryDate: '2024-01-01',
          entryPrice: 25000,
          entryGrossValue: 25000000,
          entryCommission: 37500,
          exitDate: '2024-01-10',
          exitPrice: 30000,
          exitGrossValue: 30000000,
          exitCommission: 45000,
          exitTax: 30000,
          quantity: 1000,
          grossPnL: 5000000,
          netPnL: 4887500, // Dominant win
          returnPct: 19.55,
          holdingDays: 7,
          exitReason: 'TAKE_PROFIT' as const,
        },
        {
          id: '2',
          symbol: 'HPG',
          side: 'LONG' as const,
          entryDate: '2024-01-15',
          entryPrice: 26000,
          entryGrossValue: 26000000,
          entryCommission: 39000,
          exitDate: '2024-01-20',
          exitPrice: 26200,
          exitGrossValue: 26200000,
          exitCommission: 39300,
          exitTax: 26200,
          quantity: 1000,
          grossPnL: 200000,
          netPnL: 95500,
          returnPct: 0.37,
          holdingDays: 4,
          exitReason: 'STRATEGY_SIGNAL' as const,
        },
        {
          id: '3',
          symbol: 'HPG',
          side: 'LONG' as const,
          entryDate: '2024-02-01',
          entryPrice: 27000,
          entryGrossValue: 27000000,
          entryCommission: 40500,
          exitDate: '2024-02-05',
          exitPrice: 26500,
          exitGrossValue: 26500000,
          exitCommission: 39750,
          exitTax: 26500,
          quantity: 1000,
          grossPnL: -500000,
          netPnL: -606750,
          returnPct: -2.25,
          holdingDays: 4,
          exitReason: 'STOP_LOSS' as const,
        },
        {
          id: '4',
          symbol: 'HPG',
          side: 'LONG' as const,
          entryDate: '2024-02-10',
          entryPrice: 26000,
          entryGrossValue: 26000000,
          entryCommission: 39000,
          exitDate: '2024-02-15',
          exitPrice: 26100,
          exitGrossValue: 26100000,
          exitCommission: 39150,
          exitTax: 26100,
          quantity: 1000,
          grossPnL: 100000,
          netPnL: -4250,
          returnPct: -0.02,
          holdingDays: 4,
          exitReason: 'STRATEGY_SIGNAL' as const,
        },
        {
          id: '5',
          symbol: 'HPG',
          side: 'LONG' as const,
          entryDate: '2024-02-20',
          entryPrice: 26500,
          entryGrossValue: 26500000,
          entryCommission: 39750,
          exitDate: '2024-02-25',
          exitPrice: 26600,
          exitGrossValue: 26600000,
          exitCommission: 39900,
          exitTax: 26600,
          quantity: 1000,
          grossPnL: 100000,
          netPnL: -6250,
          returnPct: -0.02,
          holdingDays: 4,
          exitReason: 'STRATEGY_SIGNAL' as const,
        },
      ];

      const analysis = StrategyValidationEngine.analyzeTradeDistribution(trades);
      expect(analysis.totalTrades).toBe(5);
      expect(analysis.winningTrades).toBe(2);
      expect(analysis.concentrationRiskFlag).toBe(true); // Single trade accounts for vast majority of profit
      expect(analysis.top3ProfitSharePct).toBeGreaterThanOrEqual(80.0);
    });
  });

  describe('8. Sample Size Assessment', () => {
    it('classifies trade counts into confidence tiers', () => {
      expect(StrategyValidationEngine.assessSampleSize(35).classification).toBe('HIGH_CONFIDENCE');
      expect(StrategyValidationEngine.assessSampleSize(20).classification).toBe('MODERATE_CONFIDENCE');
      expect(StrategyValidationEngine.assessSampleSize(8).classification).toBe('LOW_CONFIDENCE');
      expect(StrategyValidationEngine.assessSampleSize(3).classification).toBe('INSUFFICIENT_SAMPLE');
    });
  });

  describe('9. Complete Strategy Robustness Report', () => {
    it('synthesizes a complete deterministic research report conforming to Phase 17.7 contract', () => {
      const candles = generateDeterministicCandles(120);
      const strategy = new TrendFollowingBacktestStrategy();
      const report = StrategyValidationEngine.validateStrategy(strategy, candles, baseConfig);

      expect(report.strategyId).toBe('STRATEGY_TREND_FOLLOWING');
      expect(report.symbol).toBe('HPG');
      expect(report.datasetSummary.totalBars).toBe(120);
      expect(report.chronologicalSplit.isChronologicallyValid).toBe(true);
      expect(report.oosComparison).toBeDefined();
      expect(report.walkForward).toBeDefined();
      expect(report.frictionStress).toBeDefined();
      expect(report.parameterSensitivity).toBeDefined();
      expect(report.regimeRobustness).toBeDefined();
      expect(report.distributionAnalysis).toBeDefined();
      expect(report.sampleSize).toBeDefined();
      expect(['ROBUST', 'CONDITIONALLY_ROBUST', 'FRAGILE', 'INSUFFICIENT_DATA', 'FAILED']).toContain(report.verdict);
      expect(Array.isArray(report.warnings)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.deterministicAudit.isolationVerified).toBe(true);
      expect(report.deterministicAudit.executionTimingVerified).toBe(true);
    });
  });
});
