/**
 * PHASE 17.6 — TREND FOLLOWING STRATEGY BACKTEST
 * ================================================
 * Deterministic Trend Following historical verification model.
 * 
 * LOGIC:
 *   - BUY Candidate: Close > SMA20 && SMA20 > SMA50 && RSI > 50
 *   - EXIT Candidate: Close < SMA20 || SMA20 < SMA50
 * 
 * STRICT RULES:
 *   - Only uses candles provided in HistoricalContext (0...T).
 *   - Strictly zero look-ahead bias.
 */

import { calculateSMA } from '../../../indicators/sma.ts';
import { calculateRSI } from '../../../indicators/rsi.ts';
import { BacktestDataAdapter } from '../BacktestDataAdapter.ts';
import type { HistoricalContext, HistoricalStrategy, BacktestSignal } from '../types.ts';

export interface TrendFollowingConfig {
  readonly fastPeriod: number;  // default 20
  readonly slowPeriod: number;  // default 50
  readonly rsiThreshold: number; // default 50
}

export class TrendFollowingBacktestStrategy implements HistoricalStrategy {
  public readonly id = 'STRATEGY_TREND_FOLLOWING';
  public readonly name = 'Trend Following Strategy (MA20/50 + RSI)';
  public readonly description = 'Enters when price is above MA20 and MA20 > MA50 with positive RSI momentum.';
  public readonly minLookback: number;
  private readonly config: TrendFollowingConfig;

  constructor(config?: Partial<TrendFollowingConfig>) {
    this.config = {
      fastPeriod: config?.fastPeriod ?? 20,
      slowPeriod: config?.slowPeriod ?? 50,
      rsiThreshold: config?.rsiThreshold ?? 50,
    };
    this.minLookback = Math.max(30, this.config.slowPeriod);
  }

  public evaluate(context: HistoricalContext): BacktestSignal {
    const candles = context.candlesToDate;
    if (candles.length < this.minLookback) {
      return {
        action: 'HOLD',
        reason: `Insufficient bars (${candles.length}/${this.minLookback}) for Trend Following indicators`,
        confidence: 0,
      };
    }

    const currentCandle = context.currentCandle;
    const candlePoints = BacktestDataAdapter.toCandlePoints(candles);

    // Calculate fast and slow SMA over past candles
    const fastSMASeries = calculateSMA(candlePoints, this.config.fastPeriod);
    const slowSMASeries = calculateSMA(candlePoints, this.config.slowPeriod);
    const rsiSeries = calculateRSI(candlePoints, 14);

    if (fastSMASeries.length === 0 || slowSMASeries.length === 0) {
      return { action: 'HOLD', reason: 'Moving averages calculation incomplete', confidence: 0 };
    }

    const currentFastSMA = fastSMASeries[fastSMASeries.length - 1].value;
    const currentSlowSMA = slowSMASeries[slowSMASeries.length - 1].value;
    const currentRSI = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : 50;

    const priceAboveFastMA = currentCandle.close > currentFastSMA;
    const fastMAAboveSlowMA = currentFastSMA > currentSlowSMA;
    const rsiPositive = currentRSI >= this.config.rsiThreshold;

    // BUY Condition
    if (priceAboveFastMA && fastMAAboveSlowMA && rsiPositive) {
      const confidence = Math.min(1.0, 0.6 + (currentRSI - this.config.rsiThreshold) * 0.008);
      return {
        action: 'BUY',
        reason: `Trend Following Entry: Close (${currentCandle.close}) > MA${this.config.fastPeriod} (${currentFastSMA}) > MA${this.config.slowPeriod} (${currentSlowSMA}) with RSI ${currentRSI}`,
        confidence: Number(confidence.toFixed(2)),
        stopLoss: Number((currentFastSMA * 0.96).toFixed(2)), // 4% below fast MA
        takeProfit: Number((currentCandle.close * 1.15).toFixed(2)), // 15% target
        metadata: {
          fastPeriod: this.config.fastPeriod,
          slowPeriod: this.config.slowPeriod,
          fastSMA: currentFastSMA,
          slowSMA: currentSlowSMA,
          rsi: currentRSI,
        },
      };
    }

    // EXIT Condition
    if (currentCandle.close < currentFastSMA || currentFastSMA < currentSlowSMA) {
      return {
        action: 'SELL',
        reason: `Trend Following Exit: Close (${currentCandle.close}) < MA${this.config.fastPeriod} (${currentFastSMA}) or MA${this.config.fastPeriod} < MA${this.config.slowPeriod}`,
        confidence: 0.8,
        metadata: {
          fastPeriod: this.config.fastPeriod,
          slowPeriod: this.config.slowPeriod,
          fastSMA: currentFastSMA,
          slowSMA: currentSlowSMA,
          rsi: currentRSI,
        },
      };
    }

    return {
      action: 'HOLD',
      reason: 'Trend conditions neutral',
      confidence: 0.5,
      metadata: {
        fastPeriod: this.config.fastPeriod,
        slowPeriod: this.config.slowPeriod,
        fastSMA: currentFastSMA,
        slowSMA: currentSlowSMA,
        rsi: currentRSI,
      },
    };
  }
}
