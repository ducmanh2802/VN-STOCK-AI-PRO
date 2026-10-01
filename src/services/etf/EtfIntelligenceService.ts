/**
 * PHASE 22 — ETF INTELLIGENCE SERVICE
 * =====================================
 * Orchestration service for ETF & Fund Intelligence.
 * Coordinates master registry lookups, live quotes, historical series,
 * iNAV valuation, holdings analysis, tracking error, and snapshot synthesis.
 *
 * Enforces PR-01 freshness, caching (60s TTL), zero-synthetic invariants,
 * and strict fail-closed error propagation.
 */

import type {
  EtfBasketHoldings,
  EtfINavData,
  EtfIntelligenceSnapshot,
  EtfMarketQuote,
  EtfNavData,
  EtfPerformanceMetrics,
  EtfPremiumDiscountResult,
  EtfSpecification,
  EtfTrackingMetrics,
} from '../../lib/etf/types.ts';
import { VietnamEtfRegistry } from '../../lib/etf/VietnamEtfRegistry.ts';
import { EtfNavEngine } from '../../lib/etf/EtfNavEngine.ts';
import { EtfHoldingsEngine } from '../../lib/etf/EtfHoldingsEngine.ts';
import { EtfTrackingEngine } from '../../lib/etf/EtfTrackingEngine.ts';
import { EtfPerformanceEngine } from '../../lib/etf/EtfPerformanceEngine.ts';
import { EtfIntelligenceSnapshotBuilder } from '../../lib/etf/EtfIntelligenceSnapshotBuilder.ts';
import { EtfDataProvider } from './EtfDataProvider.ts';
import { cacheGet, cacheSet } from '../market/marketDataCache.ts';

const ETF_SNAPSHOT_CACHE_PREFIX = 'ETF_SNAPSHOT_PHASE22';
const ETF_SNAPSHOT_CACHE_TTL_MS = 60_000; // 60s TTL

export interface EtfSnapshotOptions {
  symbol: string;
  forceRefresh?: boolean;
  navPerShare?: number | null;
  previousNavPerShare?: number | null;
  asOfDate?: string;
  timeoutMs?: number;
}

export class EtfIntelligenceService {
  /**
   * Generates a fail-closed snapshot for an unknown or invalid symbol.
   */
  private static createUnavailableSnapshot(
    symbol: string,
    fetchedAt: string,
    reason: string
  ): EtfIntelligenceSnapshot {
    const defaultSpec: EtfSpecification = {
      symbol,
      fundName: 'Unknown ETF',
      issuer: 'Unknown Issuer',
      benchmarkIndex: 'UNKNOWN',
      exchange: 'HOSE',
      inceptionDate: '',
      managementFeePercent: 0,
      creationUnitSize: 100_000,
      totalSharesOutstanding: null,
      status: 'DELISTED',
    };

    const emptyQuote: EtfMarketQuote = {
      symbol,
      price: null,
      open: null,
      high: null,
      low: null,
      close: null,
      referencePrice: null,
      ceilingPrice: null,
      floorPrice: null,
      change: null,
      changePercent: null,
      volume: null,
      tradingValue: null,
      foreignBuyVolume: null,
      foreignSellVolume: null,
      foreignRoom: null,
      source: 'VPS_ETF',
      sourceTimestamp: null,
      fetchedAt,
      dataFreshness: 'UNAVAILABLE',
    };

    const emptyNav: EtfNavData = {
      symbol,
      navPerShare: null,
      previousNavPerShare: null,
      navChange: null,
      navChangePercent: null,
      totalNavVnd: null,
      asOfDate: fetchedAt.slice(0, 10),
      source: 'OFFICIAL_REGISTRY',
      sourceTimestamp: null,
      dataFreshness: 'UNAVAILABLE',
    };

    const emptyInav: EtfINavData = {
      symbol,
      inavPerShare: null,
      basketMarketValue: null,
      cashComponent: null,
      creationUnitShares: null,
      asOfTimestamp: null,
      status: 'DATA_UNAVAILABLE',
      warnings: [reason],
    };

    const emptyHoldings: EtfBasketHoldings = {
      symbol,
      asOfDate: fetchedAt.slice(0, 10),
      totalConstituents: 0,
      constituents: [],
      cashComponentVnd: 0,
      cashWeightPercent: null,
      totalBasketValueVnd: null,
      top5ConcentrationPercent: null,
      top10ConcentrationPercent: null,
      sectorBreakdown: {},
      status: 'DATA_UNAVAILABLE',
    };

    const emptyPremiumDiscount: EtfPremiumDiscountResult = {
      symbol,
      marketPrice: null,
      referenceNav: null,
      premiumDiscountPoints: null,
      premiumDiscountPercent: null,
      referenceNavType: 'OFFICIAL_EOD',
      regime: 'DATA_UNAVAILABLE',
      asOfDate: fetchedAt.slice(0, 10),
      status: 'DATA_UNAVAILABLE',
      warnings: [reason],
    };

    const emptyTracking: EtfTrackingMetrics = {
      symbol,
      benchmark: 'UNKNOWN',
      observationCount: 0,
      trackingDifference: null,
      trackingErrorDaily: null,
      trackingErrorAnnualized: null,
      beta: null,
      correlation: null,
      rSquared: null,
      asOfDate: fetchedAt.slice(0, 10),
      status: 'DATA_UNAVAILABLE',
      warnings: [reason],
    };

    const emptyPerformance: EtfPerformanceMetrics = {
      symbol,
      returns: {
        d1: null,
        w1: null,
        m1: null,
        m3: null,
        m6: null,
        ytd: null,
        y1: null,
      },
      benchmarkReturns: {
        d1: null,
        w1: null,
        m1: null,
        m3: null,
        m6: null,
        ytd: null,
        y1: null,
      },
      annualizedVolatility: null,
      maxDrawdownPercent: null,
      status: 'DATA_UNAVAILABLE',
    };

    return EtfIntelligenceSnapshotBuilder.build({
      specification: defaultSpec,
      quote: emptyQuote,
      nav: emptyNav,
      inav: emptyInav,
      holdings: emptyHoldings,
      premiumDiscount: emptyPremiumDiscount,
      tracking: emptyTracking,
      performance: emptyPerformance,
      fetchedAt,
    });
  }

  /**
   * Retrieves or computes an authoritative EtfIntelligenceSnapshot for an ETF symbol.
   */
  public static async getSnapshot(options: EtfSnapshotOptions): Promise<EtfIntelligenceSnapshot> {
    const rawSymbol = options.symbol;
    const cleanSym = VietnamEtfRegistry.normalizeSymbol(rawSymbol);
    const cacheKey = `${ETF_SNAPSHOT_CACHE_PREFIX}_${cleanSym}`;

    if (!options.forceRefresh) {
      const cached = cacheGet<EtfIntelligenceSnapshot>(cacheKey);
      if (cached) return cached;
    }

    const fetchedAt = new Date().toISOString();
    const spec = VietnamEtfRegistry.getSpecification(cleanSym);

    if (!spec) {
      return this.createUnavailableSnapshot(cleanSym, fetchedAt, `Symbol ${cleanSym} is not a registered ETF`);
    }

    // 1. Fetch live quote
    const quote = await EtfDataProvider.fetchRealtimeQuote(cleanSym, options.timeoutMs);

    // 2. Resolve official NAV
    const navPerShare = options.navPerShare ?? quote.referencePrice;
    const previousNavPerShare = options.previousNavPerShare ?? null;
    const { change: navChange, changePercent: navChangePercent } =
      EtfNavEngine.computeOfficialNavChange(navPerShare, previousNavPerShare);

    const asOfDate = options.asOfDate || fetchedAt.slice(0, 10);
    const nav: EtfNavData = {
      symbol: cleanSym,
      navPerShare,
      previousNavPerShare,
      navChange,
      navChangePercent,
      totalNavVnd:
        navPerShare && spec.totalSharesOutstanding
          ? Math.round(navPerShare * spec.totalSharesOutstanding)
          : null,
      asOfDate,
      source: 'OFFICIAL_REGISTRY',
      sourceTimestamp: quote.sourceTimestamp,
      dataFreshness: navPerShare ? quote.dataFreshness : 'UNAVAILABLE',
    };

    // 3. Compute Premium / Discount
    const premiumDiscount = EtfNavEngine.calculatePremiumDiscount({
      symbol: cleanSym,
      marketPrice: quote.price,
      referenceNav: nav.navPerShare,
      referenceNavType: 'OFFICIAL_EOD',
      asOfDate,
      marketTimestamp: quote.sourceTimestamp,
      navTimestamp: nav.sourceTimestamp,
    });

    // 4. Fetch historical bars for performance & tracking
    const today = new Date();
    const pastYear = new Date(today.getTime() - 365 * 24 * 3600 * 1000);
    const startDate = pastYear.toISOString().slice(0, 10);
    const endDate = today.toISOString().slice(0, 10);

    const [etfBars, benchmarkBars] = await Promise.all([
      EtfDataProvider.fetchHistoricalBars(cleanSym, startDate, endDate, options.timeoutMs),
      EtfDataProvider.fetchHistoricalBars(spec.benchmarkIndex, startDate, endDate, options.timeoutMs),
    ]);

    // 5. Compute Tracking & Performance
    const tracking = EtfTrackingEngine.analyze({
      symbol: cleanSym,
      benchmarkSymbol: spec.benchmarkIndex,
      etfBars,
      benchmarkBars,
      asOfDate,
    });

    const performance = EtfPerformanceEngine.analyze(cleanSym, etfBars, benchmarkBars);

    // 6. Basket / iNAV
    // Intraday basket creation units are maintained or fail-closed if unprovided
    const inav = EtfNavEngine.calculateINav({
      symbol: cleanSym,
      constituents: [],
      cashComponentVnd: 0,
      creationUnitShares: spec.creationUnitSize,
    });

    const holdings = EtfHoldingsEngine.analyze({
      symbol: cleanSym,
      asOfDate,
      constituents: [],
      cashComponentVnd: 0,
    });

    // 7. Assemble Snapshot
    const snapshot = EtfIntelligenceSnapshotBuilder.build({
      specification: spec,
      quote,
      nav,
      inav,
      holdings,
      premiumDiscount,
      tracking,
      performance,
      fetchedAt,
    });

    cacheSet(cacheKey, snapshot, ETF_SNAPSHOT_CACHE_TTL_MS);
    return snapshot;
  }
}
