/**
 * PHASE 22 — ETF & FUND INTELLIGENCE DOMAIN CONTRACTS
 * ====================================================
 * Authoritative types and schemas for Vietnamese Exchange-Traded Funds (ETFs)
 * and Investment Funds listed on the Ho Chi Minh Stock Exchange (HOSE).
 *
 * Invariants:
 * - PR-01 Freshness lifecycle: CURRENT | STALE | UNAVAILABLE | INVALID
 * - Strict separation between Official EOD NAV and Intraday Indicative NAV (iNAV)
 * - Explicit fail-closed semantics: Missing or invalid financial metrics return null
 * - Provenance tracking: Source timestamps distinct from ingestion timestamps
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';
import type { CandlePoint } from '../indicators/types.ts';

export type { DataFreshnessStatus, CandlePoint };

export type EtfExchange = 'HOSE' | 'HNX';
export type EtfStatus = 'ACTIVE' | 'DELISTED';
export type EtfNavReferenceType = 'OFFICIAL_EOD' | 'INTRADAY_INAV';

export type EtfPremiumDiscountRegime =
  | 'PREMIUM'
  | 'DISCOUNT'
  | 'PAR'
  | 'DATA_UNAVAILABLE';

export interface EtfSpecification {
  symbol: string;
  fundName: string;
  issuer: string;
  benchmarkIndex: string;
  exchange: EtfExchange;
  inceptionDate: string;
  managementFeePercent: number; // Annual TER/management fee %
  creationUnitSize: number; // Number of fund certificates per lot (e.g. 100,000)
  totalSharesOutstanding: number | null;
  status: EtfStatus;
}

export interface EtfMarketQuote {
  symbol: string;
  price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  referencePrice: number | null;
  ceilingPrice: number | null;
  floorPrice: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  tradingValue: number | null;
  foreignBuyVolume: number | null;
  foreignSellVolume: number | null;
  foreignRoom: number | null;
  source: string;
  sourceTimestamp: number | null;
  fetchedAt: string;
  dataFreshness: DataFreshnessStatus;
}

export interface EtfNavData {
  symbol: string;
  navPerShare: number | null;
  previousNavPerShare: number | null;
  navChange: number | null;
  navChangePercent: number | null;
  totalNavVnd: number | null;
  asOfDate: string;
  source: string;
  sourceTimestamp: number | null;
  dataFreshness: DataFreshnessStatus;
}

export interface EtfINavData {
  symbol: string;
  inavPerShare: number | null;
  basketMarketValue: number | null;
  cashComponent: number | null;
  creationUnitShares: number | null;
  asOfTimestamp: number | null;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
  warnings: string[];
}

export interface EtfConstituentHolding {
  symbol: string;
  companyName: string;
  sharesInBasket: number;
  marketPrice: number | null;
  marketValue: number | null;
  weightPercent: number | null;
  sectorId: string;
  benchmarkWeightPercent?: number | null;
  weightDifference?: number | null;
}

export interface EtfBasketHoldings {
  symbol: string;
  asOfDate: string;
  totalConstituents: number;
  constituents: EtfConstituentHolding[];
  cashComponentVnd: number;
  cashWeightPercent: number | null;
  totalBasketValueVnd: number | null;
  top5ConcentrationPercent: number | null;
  top10ConcentrationPercent: number | null;
  sectorBreakdown: Record<string, number>;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
}

export interface EtfPremiumDiscountResult {
  symbol: string;
  marketPrice: number | null;
  referenceNav: number | null;
  premiumDiscountPoints: number | null;
  premiumDiscountPercent: number | null;
  referenceNavType: EtfNavReferenceType;
  regime: EtfPremiumDiscountRegime;
  asOfDate: string;
  status: 'LIVE' | 'STALE' | 'DATA_UNAVAILABLE';
  warnings: string[];
}

export interface EtfTrackingMetrics {
  symbol: string;
  benchmark: string;
  observationCount: number;
  trackingDifference: number | null; // Cumulative return spread in %
  trackingErrorDaily: number | null; // Sample std dev of daily excess return in %
  trackingErrorAnnualized: number | null; // Daily * sqrt(252) in %
  beta: number | null;
  correlation: number | null;
  rSquared: number | null;
  asOfDate: string;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
  warnings: string[];
}

export interface EtfPerformanceMetrics {
  symbol: string;
  returns: {
    d1: number | null;
    w1: number | null;
    m1: number | null;
    m3: number | null;
    m6: number | null;
    ytd: number | null;
    y1: number | null;
  };
  benchmarkReturns: {
    d1: number | null;
    w1: number | null;
    m1: number | null;
    m3: number | null;
    m6: number | null;
    ytd: number | null;
    y1: number | null;
  };
  annualizedVolatility: number | null;
  maxDrawdownPercent: number | null;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
}

export interface EtfAumMetrics {
  symbol: string;
  aumVnd: number | null;
  sharesOutstanding: number | null;
  secondaryTurnoverRatio: number | null; // (Daily Traded Value / AUM) * 100%
  asOfDate: string;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
}

export interface EtfForeignFlowMetrics {
  symbol: string;
  foreignBuyVolume: number | null;
  foreignSellVolume: number | null;
  netForeignVolume: number | null;
  foreignBuyValueVnd: number | null;
  foreignSellValueVnd: number | null;
  netForeignValueVnd: number | null;
  foreignRoomShares: number | null;
  asOfDate: string;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
}

export interface EtfIntelligenceSnapshot {
  timestamp: string;
  dataFreshness: DataFreshnessStatus;
  sourceTimestamp: number | null;
  fetchedAt: string;
  specification: EtfSpecification;
  quote: EtfMarketQuote;
  nav: EtfNavData;
  inav: EtfINavData;
  holdings: EtfBasketHoldings;
  premiumDiscount: EtfPremiumDiscountResult;
  tracking: EtfTrackingMetrics;
  performance: EtfPerformanceMetrics;
  aum: EtfAumMetrics;
  foreignFlow: EtfForeignFlowMetrics;
  dataLineage: {
    sources: string[];
    engine: string;
    calculationVersion: string;
  };
  warnings: string[];
}

export interface EtfHistoricalBarsQuery {
  symbol: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export type EtfHistoricalBarsResult = {
  symbol: string;
  bars: CandlePoint[];
  dataFreshness: DataFreshnessStatus;
};
