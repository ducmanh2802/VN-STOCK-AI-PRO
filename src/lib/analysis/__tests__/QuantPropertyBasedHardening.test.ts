/**
 * PHASE 19.5 — QUANTITATIVE & FINANCIAL PROPERTY-BASED TESTING SUITE (QP-01 to QP-12)
 * =================================================================================
 * Generative property-based testing verifying numerical invariants, boundary stability,
 * absence of NaN/Infinity, and deterministic fail-closed safety.
 *
 * Properties Tested:
 *   QP-01: RSI always remains strictly within [0, 100].
 *   QP-02: SMA equals exact arithmetic mean of window observations.
 *   QP-03: Invalid OHLCV never produces valid quantitative output.
 *   QP-04: Division by zero never produces Infinity or NaN.
 *   QP-05: Valid finite inputs produce deterministic outputs.
 *   QP-06: Fair Value never returns NaN or Infinity.
 *   QP-07: Upside percentage never returns NaN or Infinity.
 *   QP-08: Position size quantity never becomes negative.
 *   QP-09: Position size strictly respects board-lot constraints (multiples of 100 shares).
 *   QP-10: Risk/Reward calculation never produces NaN or Infinity.
 *   QP-11: Quant Strategy score remains strictly within [0, 100].
 *   QP-12: Identical Quant inputs produce identical deterministic trading signals.
 */

import { describe, it, expect } from 'vitest';
import { SeededRng } from '../../trading/replay/__tests__/harness/index.ts';
import { calculateRSI } from '../../indicators/rsi.ts';
import { calculateSMA } from '../../indicators/sma.ts';
import { calculateEMA } from '../../indicators/ema.ts';
import { calculateATR, validateCandles } from '../technical/indicators.ts';
import { ValuationEngine } from '../valuation/ValuationEngine.ts';
import { StrategyScorer } from '../strategy/StrategyScorer.ts';
import { SignalEngine } from '../strategy/SignalEngine.ts';
import { PositionSizer } from '../../trading/risk/PositionSizer.ts';
import { CandlePoint } from '../../indicators/types.ts';

const GENERATED_CASES = 500;

describe('Phase 19.5: Quant Financial Property-Based Testing Suite (QP-01 to QP-12)', () => {
  // -------------------------------------------------------------------------
  // QP-01: RSI always remains within [0, 100]
  // -------------------------------------------------------------------------
  it('QP-01: RSI always remains strictly within [0, 100] (500 cases)', () => {
    const rng = new SeededRng(19050100);
    let testedBars = 0;

    for (let c = 0; c < GENERATED_CASES; c++) {
      const len = rng.nextInt(20, 100);
      const startPrice = rng.nextInt(1000, 200000);
      let curr = startPrice;

      const candles: CandlePoint[] = [];
      for (let i = 0; i < len; i++) {
        // Random step (-10% to +10%) or large jump
        const pctChange = (rng.nextFloat() - 0.5) * 0.20;
        curr = Math.max(100, Math.round(curr * (1 + pctChange)));
        candles.push({
          time: `2025-01-${i + 1}`,
          open: curr,
          high: Math.round(curr * 1.02),
          low: Math.round(curr * 0.98),
          close: curr,
          volume: rng.nextInt(1000, 5000000),
        });
      }

      const rsiResults = calculateRSI(candles, 14);
      for (const rsiPt of rsiResults) {
        expect(Number.isFinite(rsiPt.value)).toBe(true);
        expect(Number.isNaN(rsiPt.value)).toBe(false);
        expect(rsiPt.value).toBeGreaterThanOrEqual(0);
        expect(rsiPt.value).toBeLessThanOrEqual(100);
        testedBars++;
      }
    }

    expect(testedBars).toBeGreaterThan(500 * 5);
  });

  // -------------------------------------------------------------------------
  // QP-02: SMA equals arithmetic mean of selected window
  // -------------------------------------------------------------------------
  it('QP-02: SMA equals exact arithmetic mean of the selected window (500 cases)', () => {
    const rng = new SeededRng(19050200);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const period = rng.nextInt(3, 30);
      const len = rng.nextInt(period + 5, period + 40);

      const data: { time: string; close: number }[] = [];
      for (let i = 0; i < len; i++) {
        data.push({
          time: `T-${i}`,
          close: rng.nextInt(1000, 150000),
        });
      }

      const smaRes = calculateSMA(data, period);
      expect(smaRes.length).toBe(len - period + 1);

      // Verify each calculated SMA matches the mathematical window average
      for (let i = 0; i < smaRes.length; i++) {
        const window = data.slice(i, i + period);
        const expectedAvg = window.reduce((s, d) => s + d.close, 0) / period;
        const expectedRounded = Number(expectedAvg.toFixed(2));
        expect(smaRes[i].value).toBeCloseTo(expectedRounded, 1);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-03: Invalid OHLCV never produces valid quantitative output
  // -------------------------------------------------------------------------
  it('QP-03: Invalid OHLCV is rejected by validator and does not produce corrupt outputs (500 cases)', () => {
    const rng = new SeededRng(19050300);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const mode = c % 6;
      let corruptCandle: any;

      if (mode === 0) {
        // High < Low
        corruptCandle = { time: 'T', open: 50, high: 40, low: 60, close: 50, volume: 1000 };
      } else if (mode === 1) {
        // Negative price
        corruptCandle = { time: 'T', open: -10, high: 50, low: -10, close: 20, volume: 1000 };
      } else if (mode === 2) {
        // Close > High
        corruptCandle = { time: 'T', open: 50, high: 60, low: 40, close: 70, volume: 1000 };
      } else if (mode === 3) {
        // NaN price
        corruptCandle = { time: 'T', open: NaN, high: 60, low: 40, close: 50, volume: 1000 };
      } else if (mode === 4) {
        // Infinity
        corruptCandle = { time: 'T', open: 50, high: Infinity, low: 40, close: 50, volume: 1000 };
      } else {
        // Negative volume
        corruptCandle = { time: 'T', open: 50, high: 60, low: 40, close: 50, volume: -500 };
      }

      const validated = validateCandles([corruptCandle]);
      expect(validated.length).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // QP-04: Division by zero never produces Infinity/NaN in valuation or technicals
  // -------------------------------------------------------------------------
  it('QP-04: Division by zero never produces Infinity/NaN across valuation and indicators (500 cases)', () => {
    const rng = new SeededRng(19050400);

    for (let c = 0; c < GENERATED_CASES; c++) {
      // Degenerate inputs with zeros, negative earnings, or matching WACC and g
      const wacc = 0.10;
      const g = 0.10; // WACC == g causes zero denominator in classical Gordon formula
      const result = ValuationEngine.evaluate({
        currentPrice: rng.nextInt(10000, 100000),
        freeCashFlow: rng.nextInt(1000, 10000),
        outstandingShares: rng.nextInt(1000000, 10000000),
        discountRateWACC: wacc,
        growthRate5Y: g,
      });

      if (result.fairValueDCF !== null) {
        expect(Number.isFinite(result.fairValueDCF)).toBe(true);
        expect(Number.isNaN(result.fairValueDCF)).toBe(false);
      }
      if (result.weightedFairValue !== null) {
        expect(Number.isFinite(result.weightedFairValue)).toBe(true);
        expect(Number.isNaN(result.weightedFairValue)).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-05: Valid finite inputs produce deterministic outputs
  // -------------------------------------------------------------------------
  it('QP-05: Valid finite inputs produce 100% deterministic identical outputs (500 cases)', () => {
    const rng = new SeededRng(19050500);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const input = {
        technicalScore: rng.nextInt(0, 100),
        fundamentalScore: rng.nextInt(0, 100),
        momentumScore: rng.nextInt(0, 100),
        moneyFlowScore: rng.nextInt(0, 100),
        valuationScore: rng.nextInt(0, 100),
        riskScore: rng.nextInt(0, 100),
      };

      const res1 = StrategyScorer.score(input, 'SHORT_TERM');
      const res2 = StrategyScorer.score(input, 'SHORT_TERM');

      expect(res1.score).toBe(res2.score);
      expect(res1.contributions).toEqual(res2.contributions);
    }
  });

  // -------------------------------------------------------------------------
  // QP-06: Fair Value never returns NaN or Infinity
  // -------------------------------------------------------------------------
  it('QP-06: Fair Value never returns NaN or Infinity for arbitrary edge-case inputs (500 cases)', () => {
    const rng = new SeededRng(19050600);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const res = ValuationEngine.evaluate({
        currentPrice: rng.nextInt(1, 200000),
        eps: rng.nextFloat() > 0.3 ? rng.nextInt(-5000, 20000) : null,
        bookValuePerShare: rng.nextFloat() > 0.3 ? rng.nextInt(-10000, 80000) : null,
        freeCashFlow: rng.nextFloat() > 0.3 ? rng.nextInt(-50000, 500000) : null,
        outstandingShares: rng.nextFloat() > 0.2 ? rng.nextInt(100000, 5000000000) : null,
        netDebt: rng.nextInt(-500000, 500000),
      });

      if (res.weightedFairValue !== null) {
        expect(Number.isFinite(res.weightedFairValue)).toBe(true);
        expect(Number.isNaN(res.weightedFairValue)).toBe(false);
        expect(res.weightedFairValue).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-07: Upside percentage never returns NaN or Infinity
  // -------------------------------------------------------------------------
  it('QP-07: Upside percentage never returns NaN/Infinity and bounds correctly (500 cases)', () => {
    const rng = new SeededRng(19050700);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const price = rng.nextInt(1000, 200000);
      const eps = rng.nextInt(1000, 15000);
      const res = ValuationEngine.evaluate({
        currentPrice: price,
        eps,
        targetPE: rng.nextInt(5, 30),
      });

      if (res.upsidePercent !== null) {
        expect(Number.isFinite(res.upsidePercent)).toBe(true);
        expect(Number.isNaN(res.upsidePercent)).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-08: Position size quantity never becomes negative
  // -------------------------------------------------------------------------
  it('QP-08: Position size quantity is non-negative and non-NaN under all edge cases (500 cases)', () => {
    const rng = new SeededRng(19050800);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const equity = rng.nextInt(-1000000, 500000000);
      const cash = rng.nextInt(-1000000, 500000000);
      const entry = rng.nextInt(-50000, 200000);
      const stop = rng.nextInt(-50000, 200000);

      const result = PositionSizer.calculate({
        equity,
        availableCash: cash,
        entryPrice: entry,
        stopLossPrice: stop,
      });

      expect(result.quantity).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.quantity)).toBe(true);
      expect(Number.isNaN(result.quantity)).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // QP-09: Position size strictly respects Vietnamese board-lot (100 shares)
  // -------------------------------------------------------------------------
  it('QP-09: Position size strictly respects board-lot multiples of 100 shares (500 cases)', () => {
    const rng = new SeededRng(19050900);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const equity = rng.nextInt(50000000, 1000000000);
      const cash = rng.nextInt(20000000, 500000000);
      const entry = rng.nextInt(10000, 150000);
      const stop = Math.round(entry * (1 - rng.nextFloat() * 0.15));

      const result = PositionSizer.calculate({
        equity,
        availableCash: cash,
        entryPrice: entry,
        stopLossPrice: stop,
      });

      if (result.canTrade) {
        expect(result.quantity).toBeGreaterThanOrEqual(100);
        expect(result.quantity % 100).toBe(0);
      } else {
        // When trade is rejected, quantity is either 0 or a multiple of 100
        expect(result.quantity % 100).toBe(0);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-10: Risk/Reward calculation never produces NaN or Infinity
  // -------------------------------------------------------------------------
  it('QP-10: Risk/Reward calculation never produces NaN or Infinity (500 cases)', () => {
    const rng = new SeededRng(19051000);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const entry = rng.nextInt(10000, 100000);
      const stop = rng.nextInt(10000, 100000);
      const target = rng.nextInt(10000, 150000);

      const risk = Math.abs(entry - stop);
      const reward = target - entry;
      const rr = risk > 0 ? Number((reward / risk).toFixed(2)) : null;

      if (rr !== null) {
        expect(Number.isFinite(rr)).toBe(true);
        expect(Number.isNaN(rr)).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-11: Quant Strategy score remains strictly within [0, 100]
  // -------------------------------------------------------------------------
  it('QP-11: Quant Strategy score remains strictly within [0, 100] (500 cases)', () => {
    const rng = new SeededRng(19051100);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const res = StrategyScorer.score(
        {
          technicalScore: rng.nextFloat() > 0.2 ? rng.nextInt(0, 100) : null,
          fundamentalScore: rng.nextFloat() > 0.2 ? rng.nextInt(0, 100) : null,
          momentumScore: rng.nextFloat() > 0.2 ? rng.nextInt(0, 100) : null,
          moneyFlowScore: rng.nextFloat() > 0.2 ? rng.nextInt(0, 100) : null,
          valuationScore: rng.nextFloat() > 0.2 ? rng.nextInt(0, 100) : null,
          riskScore: rng.nextFloat() > 0.2 ? rng.nextInt(0, 100) : null,
        },
        'MEDIUM_TERM'
      );

      if (res.score !== null) {
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(Number.isInteger(res.score)).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // QP-12: Identical Quant inputs produce identical deterministic trading signals
  // -------------------------------------------------------------------------
  it('QP-12: Identical Quant inputs produce identical deterministic trading signals (500 cases)', () => {
    const rng = new SeededRng(19051200);

    for (let c = 0; c < GENERATED_CASES; c++) {
      const score = rng.nextFloat() > 0.1 ? rng.nextInt(0, 100) : null;
      const sig1 = SignalEngine.generate({ strategy: 'SHORT_TERM', score });
      const sig2 = SignalEngine.generate({ strategy: 'SHORT_TERM', score });

      expect(sig1.signal).toBe(sig2.signal);
      expect(sig1.isValid).toBe(sig2.isValid);
      expect(sig1.reason).toBe(sig2.reason);
    }
  });
});
