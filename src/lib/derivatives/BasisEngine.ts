/**
 * PHASE 21 — BASIS ENGINE
 * =========================
 * Quantitative computation of spot-futures basis (F - S), basis percentage,
 * annualized basis, theoretical fair value (Cost of Carry), and mispricing.
 *
 * STRICT INVARIANTS:
 * 1. Fail closed: If futures or spot price is null, <= 0, or unavailable,
 *    all basis calculations return null with status DATA_UNAVAILABLE.
 * 2. Zero synthetic data: No default interest rates or synthetic prices.
 * 3. Division by zero protection: guards on spotPrice == 0 and daysToExpiry <= 0.
 */

import type { BasisResult, BasisStatus } from './types.ts';

export interface BasisCalculationOptions {
  /** Annualized risk-free rate, e.g. 0.05 for 5% (optional, no default invented) */
  riskFreeRate?: number;
  /** Expected annualized dividend yield, e.g. 0.015 for 1.5% (optional) */
  dividendYield?: number;
  /** Futures quote timestamp (epoch ms) */
  futuresTimestamp?: number | null;
  /** Spot index timestamp (epoch ms) */
  spotTimestamp?: number | null;
  /** Max allowable timestamp divergence before marking STALE (default: 300,000 ms = 5 min) */
  maxTimestampDeltaMs?: number;
  futuresSource?: string;
  spotSource?: string;
}

export class BasisEngine {
  public static readonly DEFAULT_MAX_TIMESTAMP_DELTA_MS = 300_000; // 5 minutes

  /**
   * Computes the deterministic spot-futures basis and related metrics.
   */
  public static calculateBasis(
    futuresPrice: number | null | undefined,
    spotPrice: number | null | undefined,
    daysToExpiry: number,
    options?: BasisCalculationOptions
  ): BasisResult {
    const warnings: string[] = [];
    const futuresSource = options?.futuresSource || 'DERIVATIVES_FEED';
    const spotSource = options?.spotSource || 'SPOT_FEED';
    const timestamp = new Date().toISOString();

    // 1. Guard against missing or non-positive inputs
    if (
      futuresPrice == null ||
      spotPrice == null ||
      isNaN(futuresPrice) ||
      isNaN(spotPrice) ||
      futuresPrice <= 0 ||
      spotPrice <= 0
    ) {
      if (futuresPrice == null || futuresPrice <= 0) {
        warnings.push('Futures price is missing or non-positive.');
      }
      if (spotPrice == null || spotPrice <= 0) {
        warnings.push('Spot index price is missing or non-positive.');
      }

      return {
        futuresPrice: futuresPrice ?? null,
        spotPrice: spotPrice ?? null,
        basis: null,
        basisPct: null,
        annualizedBasis: null,
        daysToExpiry: Math.max(0, daysToExpiry),
        fairBasis: null,
        fairPrice: null,
        mispricing: null,
        status: 'DATA_UNAVAILABLE',
        warnings,
        dataLineage: {
          futuresSource,
          spotSource,
          timestamp,
        },
      };
    }

    // 2. Check timestamp alignment
    let status: BasisStatus = 'LIVE';
    const maxDelta = options?.maxTimestampDeltaMs ?? this.DEFAULT_MAX_TIMESTAMP_DELTA_MS;
    if (
      options?.futuresTimestamp != null &&
      options?.spotTimestamp != null &&
      !isNaN(options.futuresTimestamp) &&
      !isNaN(options.spotTimestamp)
    ) {
      const delta = Math.abs(options.futuresTimestamp - options.spotTimestamp);
      if (delta > maxDelta) {
        status = 'STALE';
        warnings.push(
          `Timestamp delta (${Math.round(delta / 1000)}s) exceeds max threshold (${Math.round(maxDelta / 1000)}s).`
        );
      }
    }

    // 3. Absolute basis: F - S
    const basis = +(futuresPrice - spotPrice).toFixed(4);

    // 4. Basis percentage: (F - S) / S * 100
    const basisPct = +((basis / spotPrice) * 100).toFixed(4);

    // 5. Annualized basis: basisPct * (365 / daysToExpiry)
    let annualizedBasis: number | null = null;
    const safeDays = Math.max(0, daysToExpiry);
    if (safeDays > 0) {
      annualizedBasis = +((basisPct * (365 / safeDays))).toFixed(4);
    } else {
      warnings.push('Contract is at or past expiration day; annualized basis is undefined.');
    }

    // 6. Theoretical Fair Value (Cost of Carry Model)
    // Fair Basis = S * (r - q) * (daysToExpiry / 365)
    let fairBasis: number | null = null;
    let fairPrice: number | null = null;
    let mispricing: number | null = null;

    if (options?.riskFreeRate != null && !isNaN(options.riskFreeRate)) {
      const r = options.riskFreeRate;
      const q = options.dividendYield ?? 0;
      fairBasis = +(spotPrice * (r - q) * (safeDays / 365)).toFixed(4);
      fairPrice = +(spotPrice + fairBasis).toFixed(4);
      mispricing = +(futuresPrice - fairPrice).toFixed(4);
    }

    return {
      futuresPrice,
      spotPrice,
      basis,
      basisPct,
      annualizedBasis,
      daysToExpiry: safeDays,
      fairBasis,
      fairPrice,
      mispricing,
      status,
      warnings,
      dataLineage: {
        futuresSource,
        spotSource,
        timestamp,
      },
    };
  }
}
