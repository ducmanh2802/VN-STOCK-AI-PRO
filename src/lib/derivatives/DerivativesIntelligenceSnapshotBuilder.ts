/**
 * PHASE 21 — DERIVATIVES INTELLIGENCE SNAPSHOT BUILDER
 * =====================================================
 * Composes canonical DerivativesIntelligenceSnapshot from individual quantitative engines.
 * Enforces PR-01 / Phase 20 data freshness, provenance, and fail-closed invariants.
 */

import type {
  UnderlyingIndex,
  ContractSpecification,
  DerivativesQuote,
  SpotIndexQuote,
  BasisResult,
  OpenInterestResult,
  TermStructureResult,
  DerivativesRegimeResult,
  DerivativesIntelligenceSnapshot,
  DataFreshnessStatus,
} from './types.ts';
import { BasisEngine, type BasisCalculationOptions } from './BasisEngine.ts';
import { OpenInterestEngine } from './OpenInterestEngine.ts';
import { TermStructureEngine } from './TermStructureEngine.ts';
import { ExpiryCalendarEngine } from './ExpiryCalendarEngine.ts';

export interface SnapshotBuilderInput {
  underlying: UnderlyingIndex;
  activeContract: ContractSpecification;
  quote: DerivativesQuote;
  spotQuote: SpotIndexQuote;
  allTenorQuotes?: Record<string, DerivativesQuote | null>;
  previousOI?: number | null;
  basisOptions?: BasisCalculationOptions;
  fetchedAt?: string;
}

export class DerivativesIntelligenceSnapshotBuilder {
  public static readonly ENGINE_VERSION = '21.0.0-PROD';

  /**
   * Evaluates aggregate freshness across derivatives and spot feeds.
   */
  public static evaluateAggregateFreshness(
    futuresFreshness: DataFreshnessStatus,
    spotFreshness: DataFreshnessStatus,
    futuresPrice: number | null,
    spotPrice: number | null
  ): DataFreshnessStatus {
    // 1. INVALID takes highest precedence
    if (futuresFreshness === 'INVALID' || spotFreshness === 'INVALID') {
      return 'INVALID';
    }

    // 2. Missing data is UNAVAILABLE
    if (
      futuresFreshness === 'UNAVAILABLE' ||
      spotFreshness === 'UNAVAILABLE' ||
      futuresPrice == null ||
      spotPrice == null ||
      futuresPrice <= 0 ||
      spotPrice <= 0
    ) {
      return 'UNAVAILABLE';
    }

    // 3. Stale if either is STALE
    if (futuresFreshness === 'STALE' || spotFreshness === 'STALE') {
      return 'STALE';
    }

    return 'CURRENT';
  }

  /**
   * Deterministically builds the full DerivativesIntelligenceSnapshot.
   */
  public static build(input: SnapshotBuilderInput): DerivativesIntelligenceSnapshot {
    const fetchedAt = input.fetchedAt || new Date().toISOString();
    const warnings: string[] = [];

    // 1. Calculate Days to Expiry for active contract
    const daysToExpiry = ExpiryCalendarEngine.calculateDaysToExpiry(
      fetchedAt,
      input.activeContract.lastTradingDate
    );

    // 2. Basis Engine
    const basisResult: BasisResult = BasisEngine.calculateBasis(
      input.quote.price,
      input.spotQuote.price,
      daysToExpiry,
      {
        ...input.basisOptions,
        futuresTimestamp: input.quote.sourceTimestamp,
        spotTimestamp: input.spotQuote.sourceTimestamp,
        futuresSource: input.quote.source,
        spotSource: input.spotQuote.source,
      }
    );
    warnings.push(...basisResult.warnings);

    // 3. Open Interest Engine
    const oiResult: OpenInterestResult = OpenInterestEngine.analyze({
      symbol: input.quote.symbol,
      currentOI: input.quote.openInterest,
      previousOI: input.previousOI,
      volume: input.quote.volume,
      priceChange: input.quote.change,
      source: input.quote.source,
      timestamp: fetchedAt,
    });
    warnings.push(...oiResult.warnings);

    // 4. Term Structure Engine
    const tenorQuotes = {
      '1M': input.allTenorQuotes?.['1M'] || (input.activeContract.tenor === '1M' ? input.quote : null),
      '2M': input.allTenorQuotes?.['2M'] || (input.activeContract.tenor === '2M' ? input.quote : null),
      '1Q': input.allTenorQuotes?.['1Q'] || (input.activeContract.tenor === '1Q' ? input.quote : null),
      '2Q': input.allTenorQuotes?.['2Q'] || (input.activeContract.tenor === '2Q' ? input.quote : null),
    };

    const daysMap = {
      '1M': daysToExpiry,
      '2M': daysToExpiry + 30, // approximate or calendar-exact
      '1Q': daysToExpiry + 90,
      '2Q': daysToExpiry + 180,
    };

    const termStructure: TermStructureResult = TermStructureEngine.analyze({
      underlying: input.underlying,
      quotes: tenorQuotes,
      spotPrice: input.spotQuote.price,
      daysToExpiry: daysMap,
      asOf: fetchedAt,
    });
    warnings.push(...termStructure.warnings);

    // 5. Regime Classification
    const regime: DerivativesRegimeResult = TermStructureEngine.classifyRegime(
      basisResult.basis,
      basisResult.basisPct,
      termStructure.curveShape,
      oiResult.positioning,
      fetchedAt
    );
    warnings.push(...regime.warnings);

    // 6. Aggregate Data Freshness
    const aggregateFreshness = this.evaluateAggregateFreshness(
      input.quote.dataFreshness,
      input.spotQuote.dataFreshness,
      input.quote.price,
      input.spotQuote.price
    );

    // 7. Latest source timestamp
    let sourceTimestamp: number | null = null;
    if (input.quote.sourceTimestamp != null) {
      sourceTimestamp = input.quote.sourceTimestamp;
    }
    if (input.spotQuote.sourceTimestamp != null) {
      if (sourceTimestamp === null || input.spotQuote.sourceTimestamp > sourceTimestamp) {
        sourceTimestamp = input.spotQuote.sourceTimestamp;
      }
    }

    const uniqueWarnings = Array.from(new Set(warnings));

    return {
      timestamp: fetchedAt,
      dataFreshness: aggregateFreshness,
      sourceTimestamp,
      fetchedAt,
      underlying: input.underlying,
      activeContract: input.activeContract,
      quote: input.quote,
      spotQuote: input.spotQuote,
      basis: basisResult,
      openInterest: oiResult,
      termStructure,
      regime,
      dataLineage: {
        sources: [input.quote.source, input.spotQuote.source],
        engine: 'DerivativesIntelligenceEngine',
        calculationVersion: this.ENGINE_VERSION,
      },
      warnings: uniqueWarnings,
    };
  }
}
