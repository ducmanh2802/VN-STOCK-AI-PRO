/**
 * PHASE 17.6 — QUANT GOVERNANCE ENFORCEMENT & INTEGRITY AUDIT TEST SUITE
 * =======================================================================
 * Executable verification of all 10 Quantitative Governance Invariants (QG-01 to QG-10)
 * specified in .clinerules/.
 */

import { describe, it, expect } from 'vitest';
import { LookAheadGuard, LookAheadGuardError } from '../LookAheadGuard.ts';
import { BacktestDataAdapter } from '../BacktestDataAdapter.ts';
import { BacktestEngine } from '../BacktestEngine.ts';
import { TradeSimulator } from '../TradeSimulator.ts';
import { TrendFollowingBacktestStrategy } from '../strategies/TrendFollowingBacktest.ts';
import { BreakoutConfirmationBacktestStrategy } from '../strategies/BreakoutConfirmationBacktest.ts';
import { MeanReversionBacktestStrategy } from '../strategies/MeanReversionBacktest.ts';
import { StrategyScorer } from '../../strategy/StrategyScorer.ts';
import { SignalEngine } from '../../strategy/SignalEngine.ts';
import { PaperBroker } from '../../../trading/paper/PaperBroker.ts';
import { PaperTradeLedger } from '../../../trading/paper/PaperTradeLedger.ts';
import type { HistoricalCandle, BacktestConfig } from '../types.ts';

describe('Phase 17.6 — Quantitative Governance Enforcement (QG-01 to QG-10)', () => {
  // Canonical sample series
  const buildCandles = (count: number): HistoricalCandle[] => {
    const candles: HistoricalCandle[] = [];
    let price = 50000;
    for (let i = 0; i < count; i++) {
      const d = String((i % 28) + 1).padStart(2, '0');
      const m = String(Math.floor(i / 28) + 1).padStart(2, '0');
      price += (i % 2 === 0 ? 200 : -50);
      candles.push({
        symbol: 'FPT',
        timestamp: `2026-${m}-${d}`,
        open: price - 100,
        high: price + 300,
        low: price - 200,
        close: price,
        volume: 100000 + (i % 5) * 10000,
      });
    }
    return candles;
  };

  // ---------------------------------------------------------------------------
  // QG-01: No Look-Ahead Bias
  // ---------------------------------------------------------------------------
  describe('QG-01: No Look-Ahead Bias', () => {
    it('guarantees context at step T exposes strictly candles [0...T] and isolates future bars', () => {
      const candles = buildCandles(50);
      const evalIndex = 25;
      const context = LookAheadGuard.createContext(candles, evalIndex);

      expect(context.currentIndex).toBe(evalIndex);
      expect(context.candlesToDate.length).toBe(evalIndex + 1);
      expect(context.currentCandle.timestamp).toBe(candles[evalIndex].timestamp);

      // Future bars (index 26 to 49) MUST NOT be present in context
      const evaluatedTimestamps = context.candlesToDate.map((c) => c.timestamp);
      for (let i = evalIndex + 1; i < candles.length; i++) {
        expect(evaluatedTimestamps).not.toContain(candles[i].timestamp);
      }
      expect(LookAheadGuard.verifyNoFutureLeakage(context.candlesToDate, candles[evalIndex].timestamp)).toBe(true);
    });

    it('freezes context.candlesToDate to prevent in-place future mutation', () => {
      const candles = buildCandles(30);
      const context = LookAheadGuard.createContext(candles, 15);

      // Attempting to mutate context.candlesToDate in strict mode throws TypeError
      expect(() => {
        (context.candlesToDate as any)[0] = { ...candles[20] };
      }).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // QG-02: Active-Bar Isolation & Resistance Boundary
  // ---------------------------------------------------------------------------
  describe('QG-02: Active-Bar Isolation & Resistance Calculation', () => {
    it('calculates resistance strictly excluding the active candle T', () => {
      // Create a 25-bar series where bar 24 breaks out to 80000, while prior 20 bars stayed under 52000
      const candles: HistoricalCandle[] = [];
      for (let i = 0; i < 24; i++) {
        candles.push({
          symbol: 'SSI',
          timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
          open: 50000,
          high: 51500,
          low: 49500,
          close: 51000,
          volume: 100000,
        });
      }
      // Active bar (index 24): Spikes to high 85000, close 84000
      candles.push({
        symbol: 'SSI',
        timestamp: '2026-01-25',
        open: 52000,
        high: 85000,
        low: 51800,
        close: 84000,
        volume: 300000,
      });

      const context = LookAheadGuard.createContext(candles, 24);
      const priorSlice = LookAheadGuard.validateLookbackSlice(context, 20, true);

      // Slices must contain exactly 20 bars and max high must be 51500, NOT 85000
      expect(priorSlice.length).toBe(20);
      const maxPriorHigh = Math.max(...priorSlice.map((b) => b.high));
      expect(maxPriorHigh).toBe(51500);
      expect(maxPriorHigh).toBeLessThan(candles[24].high);
    });
  });

  // ---------------------------------------------------------------------------
  // QG-03: Next-Bar Execution Timing
  // ---------------------------------------------------------------------------
  describe('QG-03: Next-Bar Execution Timing (T Close Signal -> T+1 Open Fill)', () => {
    it('executes queued signal at candle T+1 Open with slippage, never at candle T Close', () => {
      const config: BacktestConfig = {
        symbol: 'VNM',
        initialCapital: 100000000,
        commissionRate: 0.0015,
        slippageRate: 0.0010, // 0.10%
        sellTaxRate: 0.0010,
        positionSizePct: 1.0,
        boardLot: 100,
      };

      const simulator = new TradeSimulator(config);

      const candleT0: HistoricalCandle = {
        symbol: 'VNM',
        timestamp: '2026-01-01',
        open: 70000,
        high: 71000,
        low: 69000,
        close: 70500,
        volume: 100000,
      };

      const candleT1: HistoricalCandle = {
        symbol: 'VNM',
        timestamp: '2026-01-02',
        open: 72000, // Entry must execute at 72000 * 1.001 = 72072
        high: 73000,
        low: 71500,
        close: 72500,
        volume: 120000,
      };

      // Bar 0: BUY signal emitted at close
      simulator.processBar(candleT0, 0, {
        action: 'BUY',
        reason: 'Test signal at close',
        confidence: 0.9,
      });

      // At bar 0, no trades are completed yet and position was not opened during bar 0
      // Bar 1: Process bar 1. The BUY order is executed at candleT1.open
      simulator.processBar(candleT1, 1, null);

      const result = simulator.finalize(candleT1, 2);
      expect(result.trades.length).toBe(1);

      const trade = result.trades[0];
      expect(trade.entryDate).toBe('2026-01-02'); // Executed at T+1, NOT T0
      expect(trade.entryPrice).toBe(72072);       // 72000 * 1.001
      expect(trade.entryPrice).not.toBe(candleT0.close);
    });
  });

  // ---------------------------------------------------------------------------
  // QG-04: Breakout Confirmation Sequencing
  // ---------------------------------------------------------------------------
  describe('QG-04: Breakout Confirmation Sequencing', () => {
    it('rejects breakout without volume confirmation (false breakout)', () => {
      const strategy = new BreakoutConfirmationBacktestStrategy({
        consolidationBars: 20,
        volumeMultiplier: 1.3,
      });

      // 25 bars consolidating with 100k volume
      const candles: HistoricalCandle[] = [];
      for (let i = 0; i < 24; i++) {
        candles.push({
          symbol: 'MWG',
          timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
          open: 50000,
          high: 52000,
          low: 49000,
          close: 51000,
          volume: 100000,
        });
      }

      // Bar 24: Price breaks 52000 to 53000, BUT volume is weak (50000 < 1.3 * 100k)
      candles.push({
        symbol: 'MWG',
        timestamp: '2026-01-25',
        open: 51500,
        high: 53500,
        low: 51000,
        close: 53000,
        volume: 50000, // Low volume!
      });

      const context = LookAheadGuard.createContext(candles, 24);
      const signal = strategy.evaluate(context);

      // Must NOT be BUY because volume is unconfirmed
      expect(signal.action).not.toBe('BUY');
    });
  });

  // ---------------------------------------------------------------------------
  // QG-05: Determinism Verification
  // ---------------------------------------------------------------------------
  describe('QG-05: 100% Mathematical Determinism', () => {
    it('produces identical signals, scores, and backtest results across repeated runs', () => {
      const candles = buildCandles(60);
      const config: BacktestConfig = {
        symbol: 'FPT',
        initialCapital: 100000000,
        boardLot: 100,
      };

      const stratTrend = new TrendFollowingBacktestStrategy();
      const stratBreak = new BreakoutConfirmationBacktestStrategy();
      const stratMean = new MeanReversionBacktestStrategy();

      const runTrend1 = BacktestEngine.run(stratTrend, candles, config);
      const runTrend2 = BacktestEngine.run(stratTrend, candles, config);
      expect(runTrend1).toEqual(runTrend2);

      const runBreak1 = BacktestEngine.run(stratBreak, candles, config);
      const runBreak2 = BacktestEngine.run(stratBreak, candles, config);
      expect(runBreak1).toEqual(runBreak2);

      const runMean1 = BacktestEngine.run(stratMean, candles, config);
      const runMean2 = BacktestEngine.run(stratMean, candles, config);
      expect(runMean1).toEqual(runMean2);
    });
  });

  // ---------------------------------------------------------------------------
  // QG-06: Strategy Contract Invariants
  // ---------------------------------------------------------------------------
  describe('QG-06: Strategy Contract Bounds & Fail-Closed Behavior', () => {
    it('enforces confidence bounded in [0, 1] and valid actions', () => {
      const candles = buildCandles(60);
      const context = LookAheadGuard.createContext(candles, 55);
      const strategy = new TrendFollowingBacktestStrategy();
      const signal = strategy.evaluate(context);

      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.action);
      expect(signal.confidence).toBeGreaterThanOrEqual(0.0);
      expect(signal.confidence).toBeLessThanOrEqual(1.0);
      expect(typeof signal.reason).toBe('string');
      expect(signal.reason.length).toBeGreaterThan(0);
    });

    it('StrategyScorer clamps scores strictly to [0, 100] and handles nulls safely', () => {
      const result = StrategyScorer.score(
        {
          technicalScore: 85,
          fundamentalScore: null,
          momentumScore: 90,
          moneyFlowScore: null,
          valuationScore: 70,
          riskScore: 20,
        },
        'MEDIUM_TERM'
      );

      expect(result.score).toBeDefined();
      expect(result.score!).toBeGreaterThanOrEqual(0);
      expect(result.score!).toBeLessThanOrEqual(100);
      expect(result.availableComponents).toBe(4);
    });

    it('SignalEngine produces fail-closed safe signals for null scores', () => {
      const rec = SignalEngine.generate({
        strategy: 'SHORT_TERM',
        score: null,
      });

      expect(rec.signal).toBe('SELL'); // Conservative fallback on missing/corrupt score
      expect(rec.isValid).toBe(false);
      expect(rec.reason).toContain('null');
    });
  });

  // ---------------------------------------------------------------------------
  // QG-07: Backtest Isolation from Paper Trading
  // ---------------------------------------------------------------------------
  describe('QG-07: Backtest State Isolation', () => {
    it('guarantees backtests do not mutate PaperBroker or PaperTradeLedger state', async () => {
      const broker = new PaperBroker({ initialCash: 100000000 });
      const initialCash = broker.getAccount().cash;
      const initialOrders = await broker.getAllOrders();
      const initialOrdersCount = initialOrders.length;

      const ledger = new PaperTradeLedger();
      const initialLedgerCount = ledger.getAllEntries().length;

      // Run intense backtests on multiple strategies
      const candles = buildCandles(80);
      const config: BacktestConfig = {
        symbol: 'FPT',
        initialCapital: 500000000,
        boardLot: 100,
      };

      BacktestEngine.run(new TrendFollowingBacktestStrategy(), candles, config);
      BacktestEngine.run(new BreakoutConfirmationBacktestStrategy(), candles, config);
      BacktestEngine.run(new MeanReversionBacktestStrategy(), candles, config);

      // Verify PaperBroker and PaperTradeLedger instances remain 100% untouched
      expect(broker.getAccount().cash).toBe(initialCash);
      const currentOrders = await broker.getAllOrders();
      expect(currentOrders.length).toBe(initialOrdersCount);
      expect(ledger.getAllEntries().length).toBe(initialLedgerCount);
    });
  });

  // ---------------------------------------------------------------------------
  // QG-08: No Mock Contamination in Analysis Pathways
  // ---------------------------------------------------------------------------
  describe('QG-08: Zero Mock Contamination', () => {
    it('rejects unnormalized or synthetic objects lacking required OHLCV numerical fields', () => {
      const invalidCandles: any[] = [
        { symbol: 'FAKE', timestamp: '2026-01-01', open: 'invalid', high: 50000, low: 40000, close: 45000 },
      ];

      const validation = BacktestDataAdapter.validateAndNormalize(invalidCandles, 'FAKE');
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // QG-09: Risk Pipeline Invariants
  // ---------------------------------------------------------------------------
  describe('QG-09: Risk Pipeline & Solvency Invariants', () => {
    it('guarantees cash solvency and forbids unbacked negative balances', () => {
      const config: BacktestConfig = {
        symbol: 'VCB',
        initialCapital: 10000000, // 10M VND
        positionSizePct: 1.0,
        boardLot: 100,
      };

      const simulator = new TradeSimulator(config);
      const highPricedCandle: HistoricalCandle = {
        symbol: 'VCB',
        timestamp: '2026-01-01',
        open: 100000, // 100k VND per share -> 100 shares = 10M + commission > 10M
        high: 102000,
        low: 99000,
        close: 101000,
        volume: 50000,
      };

      simulator.processBar(highPricedCandle, 0, { action: 'BUY', reason: 'Test', confidence: 0.9 });
      const nextCandle: HistoricalCandle = {
        symbol: 'VCB',
        timestamp: '2026-01-02',
        open: 100500,
        high: 103000,
        low: 100000,
        close: 102000,
        volume: 60000,
      };
      simulator.processBar(nextCandle, 1, null);

      const result = simulator.finalize(nextCandle, 2);
      expect(result.finalCapital).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // QG-10: Data Integrity & Geometric Sanity Checks
  // ---------------------------------------------------------------------------
  describe('QG-10: Market Data Validation & Geometric Invariants', () => {
    it('fails closed on inverted prices (High < Low) or negative volumes', () => {
      const malformedCandles: HistoricalCandle[] = [
        {
          symbol: 'TCB',
          timestamp: '2026-01-01',
          open: 50000,
          high: 45000, // High < Low! Geometric breach!
          low: 48000,
          close: 47000,
          volume: 100000,
        },
      ];

      const validation = BacktestDataAdapter.validateAndNormalize(malformedCandles, 'TCB');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((err) => err.includes('High (45000) is strictly less than Low (48000)'))).toBe(true);
    });

    it('fails closed on non-chronological / unsorted timestamps', () => {
      const unsortedCandles: HistoricalCandle[] = [
        { symbol: 'TCB', timestamp: '2026-01-05', open: 50000, high: 52000, low: 49000, close: 51000, volume: 100000 },
        { symbol: 'TCB', timestamp: '2026-01-02', open: 50000, high: 52000, low: 49000, close: 51000, volume: 100000 },
      ];

      const validation = BacktestDataAdapter.validateAndNormalize(unsortedCandles, 'TCB');
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((err) => err.includes('Unsorted timestamp'))).toBe(true);
    });
  });
});
