import { describe, it, expect } from 'vitest';
import { EtfIntelligenceSnapshotBuilder } from '../EtfIntelligenceSnapshotBuilder.ts';
import { VietnamEtfRegistry } from '../VietnamEtfRegistry.ts';
import type {
  EtfBasketHoldings,
  EtfINavData,
  EtfMarketQuote,
  EtfNavData,
  EtfPerformanceMetrics,
  EtfPremiumDiscountResult,
  EtfTrackingMetrics,
} from '../types.ts';

function createValidQuote(): EtfMarketQuote {
  return {
    symbol: 'E1VFVN30',
    price: 34_500,
    open: 34_000,
    high: 34_700,
    low: 33_900,
    close: 34_500,
    referencePrice: 34_200,
    ceilingPrice: 36_590,
    floorPrice: 31_810,
    change: 300,
    changePercent: 0.88,
    volume: 500_000,
    tradingValue: 17_250_000_000,
    foreignBuyVolume: 120_000,
    foreignSellVolume: 40_000,
    foreignRoom: 5_000_000,
    source: 'VPS_ETF',
    sourceTimestamp: 1776000000000,
    fetchedAt: '2026-09-30T10:00:00.000Z',
    dataFreshness: 'CURRENT',
  };
}

function createValidNav(): EtfNavData {
  return {
    symbol: 'E1VFVN30',
    navPerShare: 34_400,
    previousNavPerShare: 34_200,
    navChange: 200,
    navChangePercent: 0.58,
    totalNavVnd: 15_480_000_000_000,
    asOfDate: '2026-09-30',
    source: 'OFFICIAL_REGISTRY',
    sourceTimestamp: 1776000000000,
    dataFreshness: 'CURRENT',
  };
}

describe('Phase 22.6 — ETF Intelligence Snapshot Builder', () => {
  it('builds a complete deterministic snapshot with CURRENT freshness and computed metrics', () => {
    const spec = VietnamEtfRegistry.getSpecification('E1VFVN30')!;
    const quote = createValidQuote();
    const nav = createValidNav();

    const inav: EtfINavData = {
      symbol: 'E1VFVN30',
      inavPerShare: 34_450,
      basketMarketValue: 3_440_000_000,
      cashComponent: 5_000_000,
      creationUnitShares: 100_000,
      asOfTimestamp: 1776000000000,
      status: 'COMPUTED',
      warnings: [],
    };

    const holdings: EtfBasketHoldings = {
      symbol: 'E1VFVN30',
      asOfDate: '2026-09-30',
      totalConstituents: 30,
      constituents: [],
      cashComponentVnd: 5_000_000,
      cashWeightPercent: 0.15,
      totalBasketValueVnd: 3_445_000_000,
      top5ConcentrationPercent: 42.5,
      top10ConcentrationPercent: 68.2,
      sectorBreakdown: { banking: 45.0, materials: 15.0 },
      status: 'COMPUTED',
    };

    const premiumDiscount: EtfPremiumDiscountResult = {
      symbol: 'E1VFVN30',
      marketPrice: 34_500,
      referenceNav: 34_400,
      premiumDiscountPoints: 100,
      premiumDiscountPercent: 0.29,
      referenceNavType: 'OFFICIAL_EOD',
      regime: 'PREMIUM',
      asOfDate: '2026-09-30',
      status: 'LIVE',
      warnings: [],
    };

    const tracking: EtfTrackingMetrics = {
      symbol: 'E1VFVN30',
      benchmark: 'VN30',
      observationCount: 60,
      trackingDifference: 0.45,
      trackingErrorDaily: 0.12,
      trackingErrorAnnualized: 1.9,
      beta: 0.995,
      correlation: 0.998,
      rSquared: 0.996,
      asOfDate: '2026-09-30',
      status: 'COMPUTED',
      warnings: [],
    };

    const performance: EtfPerformanceMetrics = {
      symbol: 'E1VFVN30',
      returns: { d1: 0.88, w1: 1.5, m1: 4.2, m3: 8.5, m6: 12.0, ytd: 15.4, y1: 22.1 },
      benchmarkReturns: { d1: 0.82, w1: 1.4, m1: 4.0, m3: 8.2, m6: 11.5, ytd: 14.8, y1: 21.0 },
      annualizedVolatility: 14.2,
      maxDrawdownPercent: 6.8,
      status: 'COMPUTED',
    };

    const snapshot = EtfIntelligenceSnapshotBuilder.build({
      specification: spec,
      quote,
      nav,
      inav,
      holdings,
      premiumDiscount,
      tracking,
      performance,
      fetchedAt: '2026-09-30T10:00:00.000Z',
    });

    expect(snapshot.dataFreshness).toBe('CURRENT');
    expect(snapshot.specification.symbol).toBe('E1VFVN30');
    expect(snapshot.quote.price).toBe(34_500);
    expect(snapshot.premiumDiscount.regime).toBe('PREMIUM');
    expect(snapshot.aum.status).toBe('COMPUTED');
    // AUM = 450,000,000 shares * 34,400 = 15,480,000,000,000 VND
    expect(snapshot.aum.aumVnd).toBe(15_480_000_000_000);
    expect(snapshot.foreignFlow.netForeignVolume).toBe(80_000); // 120,000 - 40,000
    expect(snapshot.dataLineage.calculationVersion).toBe('22.0.0-PROD');
  });

  describe('Freshness Hierarchy', () => {
    it('sets freshness to INVALID when quote or nav is INVALID', () => {
      const spec = VietnamEtfRegistry.getSpecification('E1VFVN30')!;
      const quote = createValidQuote();
      quote.dataFreshness = 'INVALID';
      const nav = createValidNav();

      const snapshot = EtfIntelligenceSnapshotBuilder.build({
        specification: spec,
        quote,
        nav,
        inav: { symbol: 'E1VFVN30', inavPerShare: null, basketMarketValue: null, cashComponent: null, creationUnitShares: null, asOfTimestamp: null, status: 'DATA_UNAVAILABLE', warnings: [] },
        holdings: { symbol: 'E1VFVN30', asOfDate: '2026-09-30', totalConstituents: 0, constituents: [], cashComponentVnd: 0, cashWeightPercent: null, totalBasketValueVnd: null, top5ConcentrationPercent: null, top10ConcentrationPercent: null, sectorBreakdown: {}, status: 'DATA_UNAVAILABLE' },
        premiumDiscount: { symbol: 'E1VFVN30', marketPrice: null, referenceNav: null, premiumDiscountPoints: null, premiumDiscountPercent: null, referenceNavType: 'OFFICIAL_EOD', regime: 'DATA_UNAVAILABLE', asOfDate: '2026-09-30', status: 'DATA_UNAVAILABLE', warnings: [] },
        tracking: { symbol: 'E1VFVN30', benchmark: 'VN30', observationCount: 0, trackingDifference: null, trackingErrorDaily: null, trackingErrorAnnualized: null, beta: null, correlation: null, rSquared: null, asOfDate: '2026-09-30', status: 'DATA_UNAVAILABLE', warnings: [] },
        performance: { symbol: 'E1VFVN30', returns: { d1: null, w1: null, m1: null, m3: null, m6: null, ytd: null, y1: null }, benchmarkReturns: { d1: null, w1: null, m1: null, m3: null, m6: null, ytd: null, y1: null }, annualizedVolatility: null, maxDrawdownPercent: null, status: 'DATA_UNAVAILABLE' },
      });

      expect(snapshot.dataFreshness).toBe('INVALID');
    });

    it('sets freshness to UNAVAILABLE when price is null', () => {
      const spec = VietnamEtfRegistry.getSpecification('E1VFVN30')!;
      const quote = createValidQuote();
      quote.price = null;
      quote.dataFreshness = 'UNAVAILABLE';
      const nav = createValidNav();

      const snapshot = EtfIntelligenceSnapshotBuilder.build({
        specification: spec,
        quote,
        nav,
        inav: { symbol: 'E1VFVN30', inavPerShare: null, basketMarketValue: null, cashComponent: null, creationUnitShares: null, asOfTimestamp: null, status: 'DATA_UNAVAILABLE', warnings: [] },
        holdings: { symbol: 'E1VFVN30', asOfDate: '2026-09-30', totalConstituents: 0, constituents: [], cashComponentVnd: 0, cashWeightPercent: null, totalBasketValueVnd: null, top5ConcentrationPercent: null, top10ConcentrationPercent: null, sectorBreakdown: {}, status: 'DATA_UNAVAILABLE' },
        premiumDiscount: { symbol: 'E1VFVN30', marketPrice: null, referenceNav: null, premiumDiscountPoints: null, premiumDiscountPercent: null, referenceNavType: 'OFFICIAL_EOD', regime: 'DATA_UNAVAILABLE', asOfDate: '2026-09-30', status: 'DATA_UNAVAILABLE', warnings: [] },
        tracking: { symbol: 'E1VFVN30', benchmark: 'VN30', observationCount: 0, trackingDifference: null, trackingErrorDaily: null, trackingErrorAnnualized: null, beta: null, correlation: null, rSquared: null, asOfDate: '2026-09-30', status: 'DATA_UNAVAILABLE', warnings: [] },
        performance: { symbol: 'E1VFVN30', returns: { d1: null, w1: null, m1: null, m3: null, m6: null, ytd: null, y1: null }, benchmarkReturns: { d1: null, w1: null, m1: null, m3: null, m6: null, ytd: null, y1: null }, annualizedVolatility: null, maxDrawdownPercent: null, status: 'DATA_UNAVAILABLE' },
      });

      expect(snapshot.dataFreshness).toBe('UNAVAILABLE');
    });
  });
});
