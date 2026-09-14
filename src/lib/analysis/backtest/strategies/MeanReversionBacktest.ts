/**
 * PHASE 17.6 — MEAN REVERSION STRATEGY BACKTEST
 * ===============================================
 * Deterministic Mean Reversion Historical Verification Model.
 * 
 * QUANTITATIVE LOGIC:
 *   - BUY: Price <= Lower Bollinger Band (or %b <= 0.10) and RSI <= 35 (Oversold).
 *   - EXIT: Price >= Middle Bollinger Band (SMA20) or RSI >= 55 or Stop Loss.
 * 
 * STRICT RULES:
 *   - Only uses past candlestick data up to current bar.
 *   - Zero look-ahead bias.
 */

import { calculateBollingerBands } from '../../../indicators/bollinger.ts';
import { calculateRSI } from '../../../indicators/rsi.ts';
import { BacktestDataAdapter } from '../BacktestDataAdapter.ts';
import type { HistoricalContext, HistoricalStrategy, BacktestSignal } from '../types.ts';

export interface MeanReversionConfig {
  readonly bbPeriod: number;        // default 20
  readonly bbMultiplier: number;    // default 2.0
  readonly rsiOversold: number;     // default 35
  readonly rsiExit: number;         // default 55
}

export class MeanReversionBacktestStrategy implements HistoricalStrategy {
  public readonly id = 'STRATEGY_MEAN_REVERSION';
  public readonly name = 'Mean Reversion Strategy (Bollinger Bands + RSI)';
  public readonly description = 'Enters when price is oversold at lower Bollinger Band with RSI < 35, exiting at mean reversion to SMA20.';
  public readonly minLookback: number;
  private readonly config: MeanReversionConfig;

  constructor(config?: Partial<MeanReversionConfig>) {
    this.config = {
      bbPeriod: config?.bbPeriod ?? 20,
      bbMultiplier: config?.bbMultiplier ?? 2.0,
      rsiOversold: config?.rsiOversold ?? 35,
      rsiExit: config?.rsiExit ?? 55,
    };
    this.minLookback = Math.max(30, this.config.bbPeriod + 5);
  }

  public evaluate(context: HistoricalContext): BacktestSignal {
    const candles = context.candlesToDate;
    if (candles.length < this.minLookback) {
      return {
        action: 'HOLD',
        reason: `Insufficient bars (${candles.length}/${this.minLookback}) for Mean Reversion`,
        confidence: 0,
      };
    }

    const currentCandle = context.currentCandle;
    const candlePoints = BacktestDataAdapter.toCandlePoints(candles);

    const bbSeries = calculateBollingerBands(
      candlePoints,
      this.config.bbPeriod,
      this.config.bbMultiplier
    );
    const rsiSeries = calculateRSI(candlePoints, 14);

    if (bbSeries.length === 0 || rsiSeries.length === 0) {
      return { action: 'HOLD', reason: 'Indicator calculation incomplete', confidence: 0 };
    }

    const currentBB = bbSeries[bbSeries.length - 1];
    const currentRSI = rsiSeries[rsiSeries.length - 1].value;

    const atOrBelowLowerBand = currentCandle.close <= currentBB.lower * 1.01 || currentBB.pb <= 0.15;
    const isRsiOversold = currentRSI <= this.config.rsiOversold;

    // BUY Condition: Oversold at lower band with low RSI
    if (atOrBelowLowerBand && isRsiOversold) {
      const confidence = Math.min(1.0, 0.65 + (this.config.rsiOversold - currentRSI) * 0.01);
      return {
        action: 'BUY',
        reason: `Mean Reversion Entry: Close (${currentCandle.close}) near Lower Band (${currentBB.lower}) with RSI ${currentRSI} (Oversold)`,
        confidence: Number(confidence.toFixed(2)),
        stopLoss: Number((currentBB.lower * 0.95).toFixed(2)), // 5% below lower band
        takeProfit: Number(currentBB.middle.toFixed(2)),       // Mean target (SMA20)
        metadata: {
          bbUpper: currentBB.upper,
          bbMiddle: currentBB.middle,
          bbLower: currentBB.lower,
          pb: currentBB.pb,
          rsi: currentRSI,
        },
      };
    }

    // EXIT Condition: Reverted back to Mean (Middle Band) or RSI Normalized
    if (currentCandle.close >= currentBB.middle || currentRSI >= this.config.rsiExit) {
      return {
        action: 'SELL',
        reason: `Mean Reversion Exit: Target reached at Middle Band (${currentBB.middle}) or RSI ${currentRSI} >= ${this.config.rsiExit}`,
        confidence: 0.8,
        metadata: {
          bbMiddle: currentBB.middle,
          rsi: currentRSI,
        },
      };
    }

    return {
      action: 'HOLD',
      reason: 'Mean reversion conditions neutral',
      confidence: 0.5,
      metadata: {
        bbMiddle: currentBB.middle,
        pb: currentBB.pb,
        rsi: currentRSI,
      },
    };
  }
}
