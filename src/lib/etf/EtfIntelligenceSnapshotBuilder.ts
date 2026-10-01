/**
 * PHASE 22 — ETF INTELLIGENCE SNAPSHOT BUILDER
 * ==============================================
 * Deterministic, pure builder that aggregates all ETF dimensions into an
 * authoritative EtfIntelligenceSnapshot adhering to PR-01 freshness contracts.
 *
 * Invariants:
 * - Freshness hierarchy: INVALID > UNAVAILABLE > STALE > CURRENT
 * - Source timestamps preserved independently from system ingestion time
 * - Explicit fail-closed semantics on missing or invalid inputs
 * - Lineage tracking with calculation engine version
 */

import type {
  DataFreshnessStatus,
  EtfAumMetrics,
  EtfBasketHoldings,
  EtfForeignFlowMetrics,
  EtfINavData,
  EtfIntelligenceSnapshot,
  EtfMarketQuote,
  EtfNavData,
  EtfPerformanceMetrics,
  EtfPremiumDiscountResult,
  EtfSpecification,
  EtfTrackingMetrics,
} from './types.ts';

export interface SnapshotBuilderInput {
  specification: EtfSpecification;
  quote: EtfMarketQuote;
  nav: EtfNavData;
  inav: EtfINavData;
  holdings: EtfBasketHoldings;
  premiumDiscount: EtfPremiumDiscountResult;
  tracking: EtfTrackingMetrics;
  performance: EtfPerformanceMetrics;
  fetchedAt?: string;
}

export class EtfIntelligenceSnapshotBuilder {
  public static readonly VERSION = '22.0.0-PROD';

  /**
   * Resolves aggregate data freshness according to the PR-01 hierarchy.
   */
  private static resolveAggregateFreshness(
    quoteFreshness: DataFreshnessStatus,
    navFreshness: DataFreshnessStatus,
    quotePrice: number | null
  ): DataFreshnessStatus {
    if (quoteFreshness === 'INVALID' || navFreshness === 'INVALID') {
      return 'INVALID';
    }
    if (quoteFreshness === 'UNAVAILABLE' || quotePrice === null || quotePrice <= 0) {
      return 'UNAVAILABLE';
    }
    if (quoteFreshness === 'STALE' || navFreshness === 'STALE') {
      return 'STALE';
    }
    return 'CURRENT';
  }

  /**
   * Computes AUM and secondary market turnover ratio.
   */
  private static computeAum(
    specification: EtfSpecification,
    nav: EtfNavData,
    quote: EtfMarketQuote,
    asOfDate: string
  ): EtfAumMetrics {
    const sharesOutstanding = specification.totalSharesOutstanding;
    const navPerShare = nav.navPerShare;

    if (
      sharesOutstanding === null ||
      sharesOutstanding <= 0 ||
      navPerShare === null ||
      navPerShare <= 0
    ) {
      return {
        symbol: specification.symbol,
        aumVnd: null,
        sharesOutstanding,
        secondaryTurnoverRatio: null,
        asOfDate,
        status: 'DATA_UNAVAILABLE',
      };
    }

    const aumVnd = Math.round(sharesOutstanding * navPerShare);

    let secondaryTurnoverRatio: number | null = null;
    if (quote.tradingValue !== null && quote.tradingValue > 0 && aumVnd > 0) {
      secondaryTurnoverRatio = Math.round((quote.tradingValue / aumVnd) * 10000) / 100;
    }

    return {
      symbol: specification.symbol,
      aumVnd,
      sharesOutstanding,
      secondaryTurnoverRatio,
      asOfDate,
      status: 'COMPUTED',
    };
  }

  /**
   * Computes foreign flow dynamics from the live quote feed.
   */
  private static computeForeignFlow(
    symbol: string,
    quote: EtfMarketQuote,
    asOfDate: string
  ): EtfForeignFlowMetrics {
    const buyVol = quote.foreignBuyVolume;
    const sellVol = quote.foreignSellVolume;

    const netVol =
      buyVol !== null && sellVol !== null ? buyVol - sellVol : null;

    // Approximate foreign values if available
    let buyVal: number | null = null;
    let sellVal: number | null = null;
    let netVal: number | null = null;

    if (quote.price !== null && quote.price > 0) {
      if (buyVol !== null) buyVal = buyVol * quote.price;
      if (sellVol !== null) sellVal = sellVol * quote.price;
      if (buyVal !== null && sellVal !== null) netVal = buyVal - sellVal;
    }

    const status =
      buyVol !== null || sellVol !== null || quote.foreignRoom !== null
        ? 'COMPUTED'
        : 'DATA_UNAVAILABLE';

    return {
      symbol,
      foreignBuyVolume: buyVol,
      foreignSellVolume: sellVol,
      netForeignVolume: netVol,
      foreignBuyValueVnd: buyVal,
      foreignSellValueVnd: sellVal,
      netForeignValueVnd: netVal,
      foreignRoomShares: quote.foreignRoom,
      asOfDate,
      status,
    };
  }

  /**
   * Builds an authoritative, deterministic EtfIntelligenceSnapshot.
   */
  public static build(input: SnapshotBuilderInput): EtfIntelligenceSnapshot {
    const {
      specification,
      quote,
      nav,
      inav,
      holdings,
      premiumDiscount,
      tracking,
      performance,
      fetchedAt = new Date().toISOString(),
    } = input;

    const asOfDate = nav.asOfDate || new Date().toISOString().slice(0, 10);
    const dataFreshness = this.resolveAggregateFreshness(
      quote.dataFreshness,
      nav.dataFreshness,
      quote.price
    );

    const aum = this.computeAum(specification, nav, quote, asOfDate);
    const foreignFlow = this.computeForeignFlow(specification.symbol, quote, asOfDate);

    const sourceTimestamp = quote.sourceTimestamp ?? nav.sourceTimestamp ?? null;

    const warnings: string[] = [];
    if (inav.warnings) warnings.push(...inav.warnings);
    if (premiumDiscount.warnings) warnings.push(...premiumDiscount.warnings);
    if (tracking.warnings) warnings.push(...tracking.warnings);

    return {
      timestamp: fetchedAt,
      dataFreshness,
      sourceTimestamp,
      fetchedAt,
      specification,
      quote,
      nav,
      inav,
      holdings,
      premiumDiscount,
      tracking,
      performance,
      aum,
      foreignFlow,
      dataLineage: {
        sources: ['VPS_ETF', 'KBS_HISTORICAL', 'HOSE_REGISTRY'],
        engine: 'EtfIntelligenceEngine',
        calculationVersion: this.VERSION,
      },
      warnings,
    };
  }
}
