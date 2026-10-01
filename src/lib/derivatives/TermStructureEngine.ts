/**
 * PHASE 21 — TERM STRUCTURE & REGIME ENGINE
 * ===========================================
 * Analyzes the multi-tenor futures curve (1M, 2M, 1Q, 2Q),
 * curve slope, calendar spreads, and derivatives regime (Contango vs Backwardation).
 */

import type {
  UnderlyingIndex,
  ContractTenor,
  DerivativesQuote,
  TenorPoint,
  TermStructureResult,
  CurveShape,
  DerivativesRegimeType,
  DerivativesRegimeResult,
  PositioningInterpretation,
} from './types.ts';

export interface TermStructureInput {
  underlying: UnderlyingIndex;
  quotes: Record<ContractTenor, DerivativesQuote | null>;
  spotPrice: number | null;
  daysToExpiry: Record<ContractTenor, number>;
  asOf?: string;
}

export class TermStructureEngine {
  /**
   * Evaluates curve shape from tenor prices.
   */
  public static evaluateCurveShape(
    p1M: number | null | undefined,
    p2M: number | null | undefined,
    p1Q: number | null | undefined,
    p2Q: number | null | undefined
  ): CurveShape {
    if (p1M == null || p2M == null || isNaN(p1M) || isNaN(p2M)) {
      return 'DATA_UNAVAILABLE';
    }

    const diff2M1M = p2M - p1M;

    // Check Flat
    if (Math.abs(diff2M1M) < 0.2) {
      return 'FLAT';
    }

    if (diff2M1M > 0) {
      // Upward sloping in front months
      if (p1Q != null && p1Q < p2M) {
        return 'HUMPTED';
      }
      return 'CONTANGO';
    } else {
      // Downward sloping in front months
      if (p1Q != null && p1Q > p2M) {
        return 'INVERTED';
      }
      return 'BACKWARDATION';
    }
  }

  /**
   * Classifies the derivatives market regime using canonical thresholds:
   * - STRONG_CONTANGO:       basisPct >= +0.8%
   * - MILD_CONTANGO:         +0.2% <= basisPct < +0.8%
   * - FLAT_NEUTRAL:          -0.2% <= basisPct < +0.2%
   * - MILD_BACKWARDATION:    -0.8% < basisPct <= -0.2%
   * - STRONG_BACKWARDATION:  basisPct <= -0.8%
   * - UNKNOWN:               missing basis
   */
  public static classifyRegime(
    basisPoints: number | null,
    basisPct: number | null,
    curveShape: CurveShape,
    positioning: PositioningInterpretation = 'NEUTRAL',
    timestamp?: string
  ): DerivativesRegimeResult {
    const warnings: string[] = [];
    const ts = timestamp || new Date().toISOString();

    if (basisPct == null || isNaN(basisPct)) {
      warnings.push('Basis percentage is unavailable; regime cannot be classified.');
      return {
        regime: 'UNKNOWN',
        confidence: 0,
        basisPoints: null,
        basisPct: null,
        curveShape,
        positioning,
        timestamp: ts,
        warnings,
      };
    }

    let regime: DerivativesRegimeType;
    let confidence = 85;

    if (basisPct >= 0.8) {
      regime = 'STRONG_CONTANGO';
    } else if (basisPct >= 0.2) {
      regime = 'MILD_CONTANGO';
    } else if (basisPct > -0.2) {
      regime = 'FLAT_NEUTRAL';
      confidence = 90;
    } else if (basisPct > -0.8) {
      regime = 'MILD_BACKWARDATION';
    } else {
      regime = 'STRONG_BACKWARDATION';
    }

    // Adjust confidence if curve shape contradicts spot basis
    if (
      (regime.includes('CONTANGO') && curveShape === 'BACKWARDATION') ||
      (regime.includes('BACKWARDATION') && curveShape === 'CONTANGO')
    ) {
      confidence = 65;
      warnings.push('Spot-futures basis divergence detected against term structure shape.');
    }

    return {
      regime,
      confidence,
      basisPoints,
      basisPct,
      curveShape,
      positioning,
      timestamp: ts,
      warnings,
    };
  }

  /**
   * Builds the comprehensive TermStructureResult across all tenors.
   */
  public static analyze(input: TermStructureInput): TermStructureResult {
    const warnings: string[] = [];
    const asOf = input.asOf || new Date().toISOString();
    const tenors: Record<ContractTenor, TenorPoint | null> = {
      '1M': null,
      '2M': null,
      '1Q': null,
      '2Q': null,
    };

    const tenorKeys: ContractTenor[] = ['1M', '2M', '1Q', '2Q'];

    for (const tenor of tenorKeys) {
      const q = input.quotes[tenor];
      const days = input.daysToExpiry[tenor] ?? 0;

      if (q && q.price != null && !isNaN(q.price)) {
        let basis: number | null = null;
        let basisPct: number | null = null;

        if (input.spotPrice != null && input.spotPrice > 0) {
          basis = +(q.price - input.spotPrice).toFixed(4);
          basisPct = +((basis / input.spotPrice) * 100).toFixed(4);
        }

        tenors[tenor] = {
          tenor,
          contractCode: q.contractCode,
          price: q.price,
          daysToExpiry: days,
          openInterest: q.openInterest,
          volume: q.volume,
          basis,
          basisPct,
        };
      } else {
        warnings.push(`Tenor ${tenor} quote is missing or invalid.`);
      }
    }

    const p1M = tenors['1M']?.price;
    const p2M = tenors['2M']?.price;
    const p1Q = tenors['1Q']?.price;
    const p2Q = tenors['2Q']?.price;

    let spread2M1M: number | null = null;
    let spread1Q1M: number | null = null;
    let curveSlope: number | null = null;

    if (p1M != null && p2M != null) {
      spread2M1M = +(p2M - p1M).toFixed(4);
      const days1M = tenors['1M']?.daysToExpiry ?? 0;
      const days2M = tenors['2M']?.daysToExpiry ?? 30;
      const deltaDays = Math.max(1, days2M - days1M);

      // Annualized percentage slope between 1M and 2M
      curveSlope = +(((p2M - p1M) / p1M) * (365 / deltaDays) * 100).toFixed(4);
    }

    if (p1M != null && p1Q != null) {
      spread1Q1M = +(p1Q - p1M).toFixed(4);
    }

    const curveShape = this.evaluateCurveShape(p1M, p2M, p1Q, p2Q);
    const status = p1M != null && p2M != null ? 'COMPUTED' : 'DATA_UNAVAILABLE';

    return {
      underlying: input.underlying,
      asOf,
      tenors,
      spread2M1M,
      spread1Q1M,
      curveSlope,
      curveShape,
      status,
      warnings,
    };
  }
}
