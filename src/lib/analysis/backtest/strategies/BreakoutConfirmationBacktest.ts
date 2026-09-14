/**
 * PHASE 17.6 — BREAKOUT CONFIRMATION / BOTTOM REVERSAL STRATEGY
 * ==============================================================
 * Deterministic Breakout & Reversal Verification Model.
 * 
 * QUANTITATIVE INVARIANTS:
 *   - Resistance is calculated STRICTLY from previous N candles (excluding current candle).
 *   - Volume expansion > 1.3x 20-day Volume MA.
 *   - Trend confirmation: Close > MA20.
 *   - Momentum confirmation: RSI > 50.
 *   - Exit: Close < MA20 or trailing stop loss.
 */

import { calculateSMA } from '../../../indicators/sma.ts';
import { calculateRSI } from '../../../indicators/rsi.ts';
import { BacktestDataAdapter } from '../BacktestDataAdapter.ts';
import type { HistoricalContext, HistoricalStrategy, BacktestSignal } from '../types.ts';

export interface BreakoutConfig {
  readonly consolidationBars: number; // default 20
  readonly volumeMultiplier: number;  // default 1.3
}

export class BreakoutConfirmationBacktestStrategy implements HistoricalStrategy {
  public readonly id = 'STRATEGY_BREAKOUT_CONFIRMATION';
  public readonly name = 'Breakout Confirmation Strategy (Base Resistance + Volume + RSI)';
  public readonly description = 'Enters on confirmed breakout above prior N-day resistance with volume and momentum confirmation.';
  public readonly minLookback: number;
  private readonly config: BreakoutConfig;

  constructor(config?: Partial<BreakoutConfig>) {
    this.config = {
      consolidationBars: config?.consolidationBars ?? 20,
      volumeMultiplier: config?.volumeMultiplier ?? 1.3,
    };
    this.minLookback = Math.max(30, this.config.consolidationBars + 5);
  }

  public evaluate(context: HistoricalContext): BacktestSignal {
    const candles = context.candlesToDate;
    if (candles.length < this.minLookback) {
      return {
        action: 'HOLD',
        reason: `Insufficient bars (${candles.length}/${this.minLookback}) for Breakout Confirmation`,
        confidence: 0,
      };
    }

    const currentCandle = context.currentCandle;
    const currentIndex = context.currentIndex;

    // 1. Calculate Prior Resistance (STRICTLY EXCLUDING CURRENT CANDLE)
    // Slices from [currentIndex - consolidationBars] to [currentIndex - 1]
    const lookbackStart = currentIndex - this.config.consolidationBars;
    const priorBars = candles.slice(lookbackStart, currentIndex);

    if (priorBars.length < this.config.consolidationBars) {
      return { action: 'HOLD', reason: 'Consolidation window incomplete', confidence: 0 };
    }

    let priorResistanceHigh = -Infinity;
    let priorSupportLow = Infinity;
    let priorVolumeSum = 0;

    for (const bar of priorBars) {
      if (bar.high > priorResistanceHigh) {
        priorResistanceHigh = bar.high;
      }
      if (bar.low < priorSupportLow) {
        priorSupportLow = bar.low;
      }
      priorVolumeSum += bar.volume;
    }

    const avgPriorVolume = priorVolumeSum / priorBars.length;

    // 2. Breakout Condition
    const isPriceBreakout = currentCandle.close > priorResistanceHigh;

    // 3. Volume Confirmation
    const isVolumeConfirmed = avgPriorVolume > 0 && currentCandle.volume >= avgPriorVolume * this.config.volumeMultiplier;
    const volumeRatio = avgPriorVolume > 0 ? currentCandle.volume / avgPriorVolume : 1;

    // 4. Trend & Moving Average Check
    const candlePoints = BacktestDataAdapter.toCandlePoints(candles);
    const sma20Series = calculateSMA(candlePoints, 20);
    const currentSMA20 = sma20Series.length > 0 ? sma20Series[sma20Series.length - 1].value : priorResistanceHigh;
    const trendConfirmed = currentCandle.close >= currentSMA20;

    // 5. Momentum Confirmation
    const rsiSeries = calculateRSI(candlePoints, 14);
    const currentRSI = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : 50;
    const momentumConfirmed = currentRSI >= 50;

    // BUY Condition: Breakout + Volume + Trend + Momentum
    if (isPriceBreakout && isVolumeConfirmed && trendConfirmed && momentumConfirmed) {
      const confidence = Math.min(1.0, 0.7 + Math.min(0.2, (volumeRatio - 1) * 0.1));
      return {
        action: 'BUY',
        reason: `Breakout Confirmed: Close (${currentCandle.close}) broke resistance (${priorResistanceHigh}) with volume ratio ${volumeRatio.toFixed(2)}x and RSI ${currentRSI}`,
        confidence: Number(confidence.toFixed(2)),
        stopLoss: Number(priorResistanceHigh.toFixed(2)), // Prior resistance becomes support
        takeProfit: Number((currentCandle.close + (priorResistanceHigh - priorSupportLow)).toFixed(2)), // Measured move
        metadata: {
          resistance: priorResistanceHigh,
          support: priorSupportLow,
          volumeRatio: Number(volumeRatio.toFixed(2)),
          rsi: currentRSI,
          sma20: currentSMA20,
        },
      };
    }

    // EXIT Condition: Close drops below SMA20 or breaks down from support
    if (currentCandle.close < currentSMA20) {
      return {
        action: 'SELL',
        reason: `Breakout Exit: Close (${currentCandle.close}) dropped below SMA20 (${currentSMA20})`,
        confidence: 0.75,
        metadata: {
          sma20: currentSMA20,
          rsi: currentRSI,
        },
      };
    }

    return {
      action: 'HOLD',
      reason: 'No breakout confirmation detected',
      confidence: 0.5,
      metadata: {
        resistance: priorResistanceHigh,
        volumeRatio: Number(volumeRatio.toFixed(2)),
        rsi: currentRSI,
      },
    };
  }
}
