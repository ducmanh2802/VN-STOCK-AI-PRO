/**
 * PHASE 17.6 — STRATEGY EVALUATION & LOGIC TESTS
 * ================================================
 * Verifies signal generation logic for Trend Following, Breakout Confirmation, and Mean Reversion.
 */

import { describe, it, expect } from 'vitest';
import { TrendFollowingBacktestStrategy } from '../strategies/TrendFollowingBacktest.ts';
import { BreakoutConfirmationBacktestStrategy } from '../strategies/BreakoutConfirmationBacktest.ts';
import { MeanReversionBacktestStrategy } from '../strategies/MeanReversionBacktest.ts';
import { LookAheadGuard } from '../LookAheadGuard.ts';
import type { HistoricalCandle } from '../types.ts';

describe('Phase 17.6 — Strategy Implementations', () => {
  // Helper to generate a deterministic synthetic-free linear sequence for testing logic
  function generateTestSeries(
    count: number,
    basePrice: number,
    slope: number,
    vol: number = 100000
  ): HistoricalCandle[] {
    const candles: HistoricalCandle[] = [];
    for (let i = 0; i < count; i++) {
      const price = basePrice + i * slope;
      const dayStr = String(i + 1).padStart(2, '0');
      candles.push({
        symbol: 'TEST',
        timestamp: `2026-01-${dayStr}`,
        open: price,
        high: price + 1000,
        low: price - 500,
        close: price + 500,
        volume: vol,
      });
    }
    return candles;
  }

  describe('TrendFollowingBacktestStrategy', () => {
    const strategy = new TrendFollowingBacktestStrategy();

    it('returns HOLD when lookback bars < minLookback (50)', () => {
      const candles = generateTestSeries(30, 50000, 100);
      const context = LookAheadGuard.createContext(candles, 29);
      const signal = strategy.evaluate(context);

      expect(signal.action).toBe('HOLD');
      expect(signal.reason).toContain('Insufficient bars');
    });

    it('generates BUY when strong upward trend satisfies MA20 > MA50 and RSI > 50', () => {
      // 60 bars of steadily rising prices
      const candles = generateTestSeries(60, 40000, 500);
      const context = LookAheadGuard.createContext(candles, 59);
      const signal = strategy.evaluate(context);

      expect(signal.action).toBe('BUY');
      expect(signal.confidence).toBeGreaterThanOrEqual(0.6);
      expect(signal.stopLoss).toBeDefined();
      expect(signal.takeProfit).toBeDefined();
    });

    it('generates SELL when price breaks below MA20', () => {
      // 55 bars uptrend then 5 bars severe drop
      const upCandles = generateTestSeries(55, 40000, 500);
      const lastPrice = upCandles[54].close;
      const dropCandles: HistoricalCandle[] = [];

      for (let i = 0; i < 5; i++) {
        const p = lastPrice - (i + 1) * 3000;
        dropCandles.push({
          symbol: 'TEST',
          timestamp: `2026-02-${String(i + 1).padStart(2, '0')}`,
          open: p + 500,
          high: p + 800,
          low: p - 1000,
          close: p,
          volume: 150000,
        });
      }

      const combined = [...upCandles, ...dropCandles];
      const context = LookAheadGuard.createContext(combined, combined.length - 1);
      const signal = strategy.evaluate(context);

      expect(signal.action).toBe('SELL');
      expect(signal.reason).toContain('Trend Following Exit');
    });
  });

  describe('BreakoutConfirmationBacktestStrategy', () => {
    const strategy = new BreakoutConfirmationBacktestStrategy({
      consolidationBars: 20,
      volumeMultiplier: 1.3,
    });

    it('identifies resistance breakout with volume expansion and momentum', () => {
      // 30 bars consolidating between 50000 and 52000 with 100k volume
      const baseCandles: HistoricalCandle[] = [];
      for (let i = 0; i < 30; i++) {
        baseCandles.push({
          symbol: 'TEST',
          timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
          open: 50500,
          high: 52000,
          low: 50000,
          close: 51000,
          volume: 100000,
        });
      }

      // Bar 31: Breakout candle! High 55000, Close 54000, Volume 250000 (> 1.3x 100k)
      const breakoutCandle: HistoricalCandle = {
        symbol: 'TEST',
        timestamp: '2026-02-01',
        open: 51500,
        high: 55000,
        low: 51200,
        close: 54000,
        volume: 250000,
      };

      const fullSeries = [...baseCandles, breakoutCandle];
      const context = LookAheadGuard.createContext(fullSeries, fullSeries.length - 1);
      const signal = strategy.evaluate(context);

      expect(signal.action).toBe('BUY');
      expect(signal.reason).toContain('Breakout Confirmed');
      expect(signal.metadata?.resistance).toBe(52000);
      expect(signal.metadata?.volumeRatio).toBe(2.5);
    });

    it('rejects breakout if volume confirmation is missing', () => {
      const baseCandles: HistoricalCandle[] = [];
      for (let i = 0; i < 30; i++) {
        baseCandles.push({
          symbol: 'TEST',
          timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
          open: 50500,
          high: 52000,
          low: 50000,
          close: 51000,
          volume: 100000,
        });
      }

      // Bar 31: Price breakout but low volume (only 80k < 1.3x 100k)
      const lowVolBreakout: HistoricalCandle = {
        symbol: 'TEST',
        timestamp: '2026-02-01',
        open: 51500,
        high: 55000,
        low: 51200,
        close: 54000,
        volume: 80000,
      };

      const fullSeries = [...baseCandles, lowVolBreakout];
      const context = LookAheadGuard.createContext(fullSeries, fullSeries.length - 1);
      const signal = strategy.evaluate(context);

      expect(signal.action).toBe('HOLD');
    });
  });

  describe('MeanReversionBacktestStrategy', () => {
    const strategy = new MeanReversionBacktestStrategy();

    it('generates BUY when price reaches lower Bollinger Band and RSI is oversold', () => {
      // 30 bars stable around 50k
      const baseCandles: HistoricalCandle[] = [];
      for (let i = 0; i < 30; i++) {
        baseCandles.push({
          symbol: 'TEST',
          timestamp: `2026-01-${String(i + 1).padStart(2, '0')}`,
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50000,
          volume: 100000,
        });
      }

      // Sudden sharp dip below lower band triggering oversold RSI
      const dipCandles: HistoricalCandle[] = [
        { symbol: 'TEST', timestamp: '2026-02-01', open: 49000, high: 49200, low: 46000, close: 46500, volume: 200000 },
        { symbol: 'TEST', timestamp: '2026-02-02', open: 46500, high: 46800, low: 44000, close: 44200, volume: 220000 },
      ];

      const fullSeries = [...baseCandles, ...dipCandles];
      const context = LookAheadGuard.createContext(fullSeries, fullSeries.length - 1);
      const signal = strategy.evaluate(context);

      expect(signal.action).toBe('BUY');
      expect(signal.reason).toContain('Mean Reversion Entry');
      expect(signal.takeProfit).toBeDefined();
    });
  });
});
