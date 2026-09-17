/**
 * PHASE 20.6 — VOLUME & FLOW INTELLIGENCE ENGINE
 * ================================================
 * Evaluates relative volume, volume spikes, dry-up states, OBV, A/D trends,
 * price-volume patterns, and enforces fail-closed VWAP policies.
 *
 * REUSED CANONICAL SOURCES:
 *   - Volume SMA & Series: src/lib/indicators/volume.ts
 *   - Money Flow Rules: src/lib/analysis/moneyFlow/MoneyFlowEngine.ts
 */

import { calculateVolumeSeries } from '../../indicators/volume.ts';
import type { CandlePoint } from '../../indicators/types.ts';
import type {
  PriceVolumePatternType,
  VolumeFlowIntelligenceResult,
} from './types.ts';

export interface VolumeFlowInput {
  symbol: string;
  candles: readonly CandlePoint[];
  intradayTicks?: readonly { price: number; volume: number }[];
  asOf?: string;
}

export class VolumeFlowIntelligenceEngine {
  public static readonly VERSION = 'v1.0.0-phase20';

  /**
   * Evaluates volume and flow characteristics from candlestick data.
   */
  public static evaluate(input: VolumeFlowInput): VolumeFlowIntelligenceResult {
    const { symbol, candles, intradayTicks, asOf = new Date().toISOString() } = input;
    const warnings: string[] = [];

    if (!candles || candles.length === 0) {
      warnings.push('NO_DATA: Candlestick series is empty.');
      return {
        symbol,
        currentVolume: 0,
        volumeSMA20: null,
        relativeVolume: null,
        volumeSpike: false,
        volumeDryUp: false,
        obv: null,
        obvTrend: 'UNAVAILABLE',
        accumulationDistribution: null,
        adTrend: 'UNAVAILABLE',
        vwap: null,
        vwapStatus: 'UNAVAILABLE',
        upVolume: 0,
        downVolume: 0,
        breakoutVolumeConfirmed: false,
        priceVolumePattern: 'UNAVAILABLE',
        warnings,
        dataLineage: {
          source: 'VolumeFlowIntelligenceEngine',
          barCount: 0,
          timestamp: asOf,
        },
      };
    }

    const latest = candles[candles.length - 1];
    const currentVolume = latest.volume || 0;

    // 1. Volume SMA20 & Relative Volume
    const volSeries = calculateVolumeSeries(candles as CandlePoint[], 20);
    const latestVolPoint = volSeries.length > 0 ? volSeries[volSeries.length - 1] : null;
    const volumeSMA20 = latestVolPoint?.volumeMA ?? null;

    let relativeVolume: number | null = null;
    let volumeSpike = false;
    let volumeDryUp = false;

    if (volumeSMA20 !== null && volumeSMA20 > 0) {
      relativeVolume = Number((currentVolume / volumeSMA20).toFixed(2));
      volumeSpike = relativeVolume >= 1.5;
      volumeDryUp = relativeVolume <= 0.65;
    }

    // 2. OBV (On-Balance Volume) & Trend
    let obv = 0;
    const obvHistory: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (i > 0) {
        const prev = candles[i - 1];
        if (c.close > prev.close) {
          obv += c.volume;
        } else if (c.close < prev.close) {
          obv -= c.volume;
        }
      }
      obvHistory.push(obv);
    }

    let obvTrend: 'RISING' | 'FALLING' | 'FLAT' | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (obvHistory.length >= 10) {
      const recentOBV = obvHistory.slice(-10);
      const startOBV = recentOBV[0];
      const endOBV = recentOBV[recentOBV.length - 1];
      const diff = endOBV - startOBV;
      if (diff > 0) obvTrend = 'RISING';
      else if (diff < 0) obvTrend = 'FALLING';
      else obvTrend = 'FLAT';
    }

    // 3. Accumulation / Distribution Line & Trend
    let ad = 0;
    const adHistory: number[] = [];

    for (const c of candles) {
      const range = c.high - c.low;
      if (range > 0) {
        const clv = ((c.close - c.low) - (c.high - c.close)) / range; // Close Location Value (-1 to +1)
        ad += clv * c.volume;
      }
      adHistory.push(ad);
    }

    let adTrend: 'RISING' | 'FALLING' | 'FLAT' | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (adHistory.length >= 10) {
      const recentAD = adHistory.slice(-10);
      const startAD = recentAD[0];
      const endAD = recentAD[recentAD.length - 1];
      const diff = endAD - startAD;
      if (diff > 0) adTrend = 'RISING';
      else if (diff < 0) adTrend = 'FALLING';
      else adTrend = 'FLAT';
    }

    // 4. VWAP Handling (FAIL CLOSED: Daily bars cannot synthesize intraday VWAP)
    let vwap: number | null = null;
    let vwapStatus: 'COMPUTED' | 'UNAVAILABLE' = 'UNAVAILABLE';

    if (intradayTicks && intradayTicks.length > 0) {
      let cumulativeValue = 0;
      let cumulativeVolume = 0;
      for (const tick of intradayTicks) {
        if (tick.price > 0 && tick.volume > 0) {
          cumulativeValue += tick.price * tick.volume;
          cumulativeVolume += tick.volume;
        }
      }
      if (cumulativeVolume > 0) {
        vwap = Number((cumulativeValue / cumulativeVolume).toFixed(2));
        vwapStatus = 'COMPUTED';
      }
    } else {
      warnings.push(
        'VWAP_UNAVAILABLE: Intraday tick feed is required for authoritative VWAP calculation.'
      );
    }

    // 5. Up / Down Volume accumulation over past 20 bars
    let upVolume = 0;
    let downVolume = 0;
    const recent20 = candles.slice(-20);
    for (let i = 1; i < recent20.length; i++) {
      const bar = recent20[i];
      const prevBar = recent20[i - 1];
      if (bar.close > prevBar.close) {
        upVolume += bar.volume;
      } else if (bar.close < prevBar.close) {
        downVolume += bar.volume;
      }
    }

    // 6. Breakout Volume Confirmation
    let breakoutVolumeConfirmed = false;
    if (candles.length >= 20) {
      const prior20 = candles.slice(-21, -1);
      const maxHigh20 = Math.max(...prior20.map((c) => c.high));
      if (latest.close > maxHigh20 && volumeSpike) {
        breakoutVolumeConfirmed = true;
      }
    }

    // 7. Price-Volume Relationship Pattern
    let priceVolumePattern: PriceVolumePatternType = 'NEUTRAL';
    if (candles.length >= 2) {
      const prev = candles[candles.length - 2];
      const priceUp = latest.close > prev.close;
      const priceDown = latest.close < prev.close;

      if (priceUp && volumeSpike) {
        priceVolumePattern = 'BULLISH_CONFIRMATION';
      } else if (priceDown && volumeSpike) {
        priceVolumePattern = 'BEARISH_DISTRIBUTION';
      } else if (priceDown && volumeDryUp) {
        priceVolumePattern = 'BULLISH_DIVERGENCE';
      } else if (priceUp && volumeDryUp) {
        priceVolumePattern = 'BEARISH_DIVERGENCE';
      }
    }

    return {
      symbol,
      currentVolume,
      volumeSMA20,
      relativeVolume,
      volumeSpike,
      volumeDryUp,
      obv: Number(obv.toFixed(0)),
      obvTrend,
      accumulationDistribution: Number(ad.toFixed(0)),
      adTrend,
      vwap,
      vwapStatus,
      upVolume,
      downVolume,
      breakoutVolumeConfirmed,
      priceVolumePattern,
      warnings,
      dataLineage: {
        source: 'VolumeFlowIntelligenceEngine',
        barCount: candles.length,
        timestamp: asOf,
      },
    };
  }
}
