/**
 * PHASE 17.7 — DETERMINISTIC MARKET REGIME DETECTOR
 * ===================================================
 * Classifies market conditions using ONLY strictly historical candlestick data up to bar T.
 * 
 * QUANTITATIVE INVARIANTS:
 *   - Strictly backward-looking: Context [0...T]. Zero look-ahead bias.
 *   - Deterministic classification: Identical bars produce identical regime labels.
 *   - Classifies into: BULL_TREND, BEAR_TREND, SIDEWAYS_VOLATILE, SIDEWAYS_QUIET.
 */

import { calculateSMA } from '../../../indicators/sma.ts';
import { BacktestDataAdapter } from '../BacktestDataAdapter.ts';
import type { HistoricalCandle } from '../types.ts';
import type { MarketRegimeType } from './types.ts';

export class RegimeDetector {
  public static readonly MIN_LOOKBACK = 50;
  public static readonly VOLATILITY_THRESHOLD = 0.025; // 2.5% daily average high-low range

  /**
   * Classifies the market regime at a specific bar index T using strictly candles [0...T].
   */
  public static detectRegimeAt(
    candles: readonly HistoricalCandle[],
    targetIndex: number
  ): MarketRegimeType {
    if (targetIndex < 0 || targetIndex >= candles.length) {
      return 'SIDEWAYS_QUIET';
    }

    // Defensive slice up to targetIndex (inclusive)
    const candlesToDate = candles.slice(0, targetIndex + 1);
    if (candlesToDate.length < RegimeDetector.MIN_LOOKBACK) {
      return 'SIDEWAYS_QUIET';
    }

    const currentCandle = candlesToDate[candlesToDate.length - 1];
    const candlePoints = BacktestDataAdapter.toCandlePoints(candlesToDate);

    const sma20 = calculateSMA(candlePoints, 20);
    const sma50 = calculateSMA(candlePoints, 50);

    if (sma20.length === 0 || sma50.length === 0) {
      return 'SIDEWAYS_QUIET';
    }

    const currentSMA20 = sma20[sma20.length - 1].value;
    const currentSMA50 = sma50[sma50.length - 1].value;

    // Measure recent volatility (past 14 bars average true range / price)
    const recentBars = candlesToDate.slice(-14);
    let rangeSum = 0;
    for (const bar of recentBars) {
      rangeSum += (bar.high - bar.low) / (bar.close > 0 ? bar.close : 1);
    }
    const avgNormalizedRange = rangeSum / recentBars.length;
    const isHighVolatility = avgNormalizedRange >= RegimeDetector.VOLATILITY_THRESHOLD;

    // Trend Classifications
    if (currentCandle.close > currentSMA50 && currentSMA20 > currentSMA50) {
      return 'BULL_TREND';
    }

    if (currentCandle.close < currentSMA50 && currentSMA20 < currentSMA50) {
      return 'BEAR_TREND';
    }

    // Sideways Classifications
    if (isHighVolatility) {
      return 'SIDEWAYS_VOLATILE';
    }

    return 'SIDEWAYS_QUIET';
  }

  /**
   * Classifies every bar in the candlestick series.
   */
  public static classifyAllBars(
    candles: readonly HistoricalCandle[]
  ): readonly { readonly date: string; readonly regime: MarketRegimeType }[] {
    const results: { date: string; regime: MarketRegimeType }[] = [];
    for (let i = 0; i < candles.length; i++) {
      results.push({
        date: candles[i].timestamp,
        regime: RegimeDetector.detectRegimeAt(candles, i),
      });
    }
    return results;
  }
}
