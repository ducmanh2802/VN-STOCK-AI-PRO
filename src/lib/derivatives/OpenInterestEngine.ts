/**
 * PHASE 21 — OPEN INTEREST (OI) DYNAMICS ENGINE
 * ===============================================
 * Deterministic quantitative analysis of Open Interest (OI) changes,
 * Volume-to-OI ratios, and market positioning interpretations.
 *
 * POSITIONING MATRIX:
 * 1. Price UP   + OI UP   => LONG_ACCUMULATION (Aggressive new buyers entering)
 * 2. Price DOWN + OI UP   => SHORT_ACCUMULATION (Aggressive new short sellers entering)
 * 3. Price UP   + OI DOWN => SHORT_COVERING (Shorts closing out, rally on forced buyback)
 * 4. Price DOWN + OI DOWN => LONG_LIQUIDATION (Longs stopping out, selloff on forced liquidation)
 * 5. Flat / Unchanged     => NEUTRAL
 */

import type { OpenInterestResult, PositioningInterpretation } from './types.ts';

export interface OpenInterestEngineInput {
  symbol: string;
  currentOI: number | null | undefined;
  previousOI?: number | null | undefined;
  volume?: number | null | undefined;
  priceChange?: number | null | undefined;
  source?: string;
  timestamp?: string;
}

export class OpenInterestEngine {
  /**
   * Evaluates market positioning from Price Change and OI Change.
   */
  public static interpretPositioning(
    priceChange: number | null | undefined,
    oiChange: number | null | undefined
  ): PositioningInterpretation {
    if (priceChange == null || oiChange == null || isNaN(priceChange) || isNaN(oiChange)) {
      return 'DATA_UNAVAILABLE';
    }

    if (priceChange > 0 && oiChange > 0) {
      return 'LONG_ACCUMULATION';
    }
    if (priceChange < 0 && oiChange > 0) {
      return 'SHORT_ACCUMULATION';
    }
    if (priceChange > 0 && oiChange < 0) {
      return 'SHORT_COVERING';
    }
    if (priceChange < 0 && oiChange < 0) {
      return 'LONG_LIQUIDATION';
    }

    return 'NEUTRAL';
  }

  /**
   * Computes open interest dynamics and liquidity ratios.
   */
  public static analyze(input: OpenInterestEngineInput): OpenInterestResult {
    const warnings: string[] = [];
    const source = input.source || 'DERIVATIVES_FEED';
    const timestamp = input.timestamp || new Date().toISOString();

    // 1. Guard against missing or negative current OI
    if (input.currentOI == null || isNaN(input.currentOI) || input.currentOI < 0) {
      warnings.push('Current Open Interest is missing or invalid.');
      return {
        symbol: input.symbol,
        openInterest: null,
        previousOpenInterest: input.previousOI ?? null,
        openInterestChange: null,
        openInterestChangePct: null,
        volume: input.volume ?? null,
        volumeToOIRatio: null,
        positioning: 'DATA_UNAVAILABLE',
        status: 'DATA_UNAVAILABLE',
        warnings,
        dataLineage: { source, timestamp },
      };
    }

    const currentOI = input.currentOI;
    let oiChange: number | null = null;
    let oiChangePct: number | null = null;

    // 2. Compute absolute and relative OI changes
    if (input.previousOI != null && !isNaN(input.previousOI) && input.previousOI >= 0) {
      oiChange = currentOI - input.previousOI;
      if (input.previousOI > 0) {
        oiChangePct = +((oiChange / input.previousOI) * 100).toFixed(2);
      } else {
        warnings.push('Previous Open Interest was zero; relative change percent is undefined.');
      }
    } else {
      warnings.push('Previous Open Interest is unavailable; changes cannot be calculated.');
    }

    // 3. Volume to OI ratio
    let volumeToOIRatio: number | null = null;
    if (input.volume != null && !isNaN(input.volume) && input.volume >= 0) {
      if (currentOI > 0) {
        volumeToOIRatio = +(input.volume / currentOI).toFixed(4);
      } else {
        warnings.push('Current Open Interest is zero; Volume-to-OI ratio is undefined.');
      }
    }

    // 4. Derive positioning interpretation
    const positioning = this.interpretPositioning(input.priceChange, oiChange);

    return {
      symbol: input.symbol,
      openInterest: currentOI,
      previousOpenInterest: input.previousOI ?? null,
      openInterestChange: oiChange,
      openInterestChangePct: oiChangePct,
      volume: input.volume ?? null,
      volumeToOIRatio,
      positioning,
      status: 'COMPUTED',
      warnings,
      dataLineage: { source, timestamp },
    };
  }
}
