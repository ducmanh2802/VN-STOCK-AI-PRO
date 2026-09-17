/**
 * PHASE 20.1 — CANONICAL MARKET REGIME ENGINE
 * =============================================
 * Deterministic multi-factor market regime classification combining trend,
 * breadth, volatility, liquidity, momentum, and volume participation.
 *
 * REGIMES:
 *   - BULL_TREND: Strong upward moving average alignment, positive momentum & breadth.
 *   - BEAR_TREND: Downward moving average breakdown, negative momentum & breadth.
 *   - ACCUMULATION: Sideways price action with rising smart accumulation & volume dry-up.
 *   - DISTRIBUTION: Stalling prices with heavy selling volume and deteriorating breadth.
 *   - HIGH_VOLATILITY: Elevated ATR / price range expansion exceeding crisis thresholds.
 *   - LOW_VOLATILITY: Compressed ATR / tight range contraction.
 *   - SIDEWAYS: Neutral moving averages and balanced breadth.
 *   - UNKNOWN: Insufficient history or low constituent coverage.
 *
 * REUSED CANONICAL SOURCES:
 *   - Indicators: src/lib/indicators/ (sma, rsi, macd)
 *   - Breadth Engine: src/lib/analysis/market/MarketBreadthEngine.ts
 */

import { calculateSMA } from '../../indicators/sma.ts';
import { calculateRSI } from '../../indicators/rsi.ts';
import { calculateMACD } from '../../indicators/macd.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type {
  MarketBreadthResult,
  MarketRegimeResult,
  MarketRegimeScores,
  MarketRegimeType,
} from './types.ts';

export interface MarketRegimeInput {
  indexCandles: readonly CandlePoint[];
  breadth?: MarketBreadthResult | null;
  universeName?: string;
  asOf?: string;
}

export class MarketRegimeEngine {
  public static readonly VERSION = 'v1.0.0-phase20';
  public static readonly MIN_LOOKBACK = 50;

  /**
   * Classifies the overall market regime using index candles and market breadth.
   */
  public static evaluate(input: MarketRegimeInput): MarketRegimeResult {
    const {
      indexCandles,
      breadth,
      universeName = 'VN-INDEX',
      asOf = new Date().toISOString(),
    } = input;

    const warnings: string[] = [];

    if (!indexCandles || indexCandles.length < 20) {
      warnings.push('INSUFFICIENT_INDEX_DATA: Index candle history is under 20 bars.');
      return {
        regime: 'UNKNOWN',
        confidence: 0,
        scores: {
          trendScore: null,
          breadthScore: null,
          volatilityScore: null,
          liquidityScore: null,
          momentumScore: null,
          participationScore: null,
        },
        timestamp: asOf,
        calculationVersion: MarketRegimeEngine.VERSION,
        dataLineage: {
          source: 'MarketRegimeEngine',
          universe: universeName,
          barCount: indexCandles?.length ?? 0,
          constituentsEvaluated: breadth?.validConstituents ?? 0,
        },
        warnings,
      };
    }

    const latest = indexCandles[indexCandles.length - 1];
    const currentPrice = latest.close;

    // 1. Trend Score (0 - 100)
    let trendScore = 50;
    const indexCandlesMut = indexCandles as CandlePoint[];
    const sma20Series = calculateSMA(indexCandlesMut, 20);
    const sma50Series = calculateSMA(indexCandlesMut, 50);
    const sma200Series = calculateSMA(indexCandlesMut, 200);

    const lastSMA20 = sma20Series.length > 0 ? sma20Series[sma20Series.length - 1].value : null;
    const lastSMA50 = sma50Series.length > 0 ? sma50Series[sma50Series.length - 1].value : null;
    const lastSMA200 = sma200Series.length > 0 ? sma200Series[sma200Series.length - 1].value : null;

    let trendPoints = 0;
    let maxTrendPoints = 0;

    if (lastSMA20 !== null) {
      maxTrendPoints += 25;
      if (currentPrice > lastSMA20) trendPoints += 25;
    }
    if (lastSMA50 !== null) {
      maxTrendPoints += 35;
      if (currentPrice > lastSMA50) trendPoints += 35;
      if (lastSMA20 !== null && lastSMA20 > lastSMA50) trendPoints += 10;
      maxTrendPoints += 10;
    }
    if (lastSMA200 !== null) {
      maxTrendPoints += 30;
      if (currentPrice > lastSMA200) trendPoints += 30;
    }

    if (maxTrendPoints > 0) {
      trendScore = Math.round((trendPoints / maxTrendPoints) * 100);
    }

    // 2. Breadth Score (0 - 100)
    let breadthScore: number | null = null;
    if (breadth && breadth.validConstituents > 0) {
      let bScore = 50;
      if (breadth.percentAboveMA20 !== null) {
        bScore = breadth.percentAboveMA20 * 100;
      } else if (breadth.breadthThrust !== null) {
        bScore = breadth.breadthThrust * 100;
      }
      breadthScore = Math.round(Math.min(Math.max(bScore, 0), 100));
    }

    // 3. Volatility Score (0 - 100: normalized 14-day high-low range)
    let volatilityScore = 50;
    const recent14 = indexCandles.slice(-14);
    let totalPctRange = 0;
    for (const bar of recent14) {
      const barRange = (bar.high - bar.low) / (bar.close > 0 ? bar.close : 1);
      totalPctRange += barRange;
    }
    const avgDailyRange = totalPctRange / recent14.length;
    // VN-INDEX normal daily range is ~1.0% (0.010). High volatility is >= 2.5% (0.025).
    volatilityScore = Math.round(Math.min(Math.max((avgDailyRange / 0.025) * 50, 0), 100));

    // 4. Liquidity Score (0 - 100: volume relative to 20-day SMA volume)
    let liquidityScore = 50;
    if (indexCandles.length >= 20) {
      const recent20Volumes = indexCandles.slice(-20).map((c) => c.volume);
      const avgVol20 = recent20Volumes.reduce((a, b) => a + b, 0) / 20;
      if (avgVol20 > 0) {
        const ratio = latest.volume / avgVol20;
        liquidityScore = Math.round(Math.min(Math.max(ratio * 50, 0), 100));
      }
    }

    // 5. Momentum Score (0 - 100: RSI-14 + MACD)
    let momentumScore = 50;
    const rsiSeries = calculateRSI(indexCandlesMut, 14);
    const macdSeries = calculateMACD(indexCandlesMut, 12, 26, 9);

    const lastRSI = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1].value : 50;
    let macdBonus = 0;
    if (macdSeries.length > 0) {
      const lastMACD = macdSeries[macdSeries.length - 1];
      if (lastMACD.macd > lastMACD.signal) macdBonus += 10;
      if (lastMACD.histogram > 0) macdBonus += 5;
    }
    momentumScore = Math.round(Math.min(Math.max(lastRSI * 0.85 + macdBonus, 0), 100));

    // 6. Participation Score (0 - 100: Up-volume / total volume)
    let participationScore: number | null = null;
    if (breadth?.marketParticipation !== null && breadth?.marketParticipation !== undefined) {
      participationScore = Math.round(breadth.marketParticipation * 100);
    }

    const scores: MarketRegimeScores = {
      trendScore,
      breadthScore,
      volatilityScore,
      liquidityScore,
      momentumScore,
      participationScore,
    };

    // 7. Deterministic Regime Classification
    let regime: MarketRegimeType = 'SIDEWAYS';

    const effectiveBreadth = breadthScore ?? trendScore;
    const isBullTrend = trendScore >= 65 && momentumScore >= 50 && effectiveBreadth >= 50;
    const isBearTrend = trendScore <= 35 && momentumScore <= 45 && effectiveBreadth <= 45;

    if (isBullTrend) {
      // Check for distribution (price high, but breadth/participation deteriorating with high volume)
      if (effectiveBreadth < 40 && liquidityScore > 65) {
        regime = 'DISTRIBUTION';
      } else {
        regime = 'BULL_TREND';
      }
    } else if (isBearTrend) {
      // Check for accumulation (price low/down, but participation rising and volatility cooling)
      if (participationScore !== null && participationScore > 60 && volatilityScore < 40) {
        regime = 'ACCUMULATION';
      } else {
        regime = 'BEAR_TREND';
      }
    } else {
      // Sideways or Volatility-dominated
      if (volatilityScore >= 75) {
        regime = 'HIGH_VOLATILITY';
      } else if (volatilityScore <= 25) {
        regime = 'LOW_VOLATILITY';
      } else if (participationScore !== null && participationScore >= 65 && liquidityScore > 50) {
        regime = 'ACCUMULATION';
      } else if (participationScore !== null && participationScore <= 35 && liquidityScore > 50) {
        regime = 'DISTRIBUTION';
      } else {
        regime = 'SIDEWAYS';
      }
    }

    // 8. Deterministic Confidence Score (0 - 100)
    // Measures data coverage and agreement between trend, momentum, and breadth
    let dataCompleteness = 0.5;
    if (indexCandles.length >= 200) dataCompleteness += 0.3;
    else if (indexCandles.length >= 50) dataCompleteness += 0.2;
    if (breadth && breadth.coverageRatio >= 0.8) dataCompleteness += 0.2;

    const signalAlignment =
      1.0 - Math.abs(trendScore - momentumScore) / 100.0 * 0.5;

    const confidence = Math.round(
      Math.min(Math.max(dataCompleteness * signalAlignment * 100, 10), 100)
    );

    return {
      regime,
      confidence,
      scores,
      timestamp: asOf,
      calculationVersion: MarketRegimeEngine.VERSION,
      dataLineage: {
        source: 'MarketRegimeEngine',
        universe: universeName,
        barCount: indexCandles.length,
        constituentsEvaluated: breadth?.validConstituents ?? 0,
      },
      warnings,
    };
  }
}
