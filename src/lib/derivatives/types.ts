/**
 * PHASE 21 — DERIVATIVES INTELLIGENCE: TYPES & CONTRACTS
 * =======================================================
 * Canonical contracts for Vietnam index futures (VN30F, VN100F),
 * contract registry, expiration calendars, basis engine,
 * Open Interest (OI) dynamics, term structure, and derivatives regime.
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';
import type { CandlePoint } from '../indicators/types.ts';

export type { DataFreshnessStatus, CandlePoint };

// ------------------------------------------------------------------
// 1. CONTRACT SPECIFICATIONS & IDENTIFIERS
// ------------------------------------------------------------------

export type UnderlyingIndex = 'VN30' | 'VN100';

export type ContractTenor = '1M' | '2M' | '1Q' | '2Q';

export type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'PENDING';

export interface ContractSpecification {
  /** Canonical ticker, e.g. "VN30F2604" or alias "VN30F1M" */
  symbol: string;
  /** Full standardized contract code, e.g. "VN30F2604" */
  contractCode: string;
  /** Underlying index instrument */
  underlying: UnderlyingIndex;
  /** Tenor classification */
  tenor: ContractTenor;
  /** Delivery month in YYYY-MM format */
  contractMonth: string;
  /** Trading multiplier in VND per point (HNX standard: 100,000 VND) */
  multiplier: number;
  /** Minimum price fluctuation (HNX standard: 0.1 pt) */
  tickSize: number;
  /** First trading session, YYYY-MM-DD */
  firstTradingDate: string;
  /** Last trading session / expiration date (3rd Thursday), YYYY-MM-DD */
  lastTradingDate: string;
  /** Final cash settlement date, YYYY-MM-DD */
  settlementDate: string;
  /** Exchange venue (HNX) */
  exchange: 'HNX';
  /** Current trading status */
  status: ContractStatus;
}

// ------------------------------------------------------------------
// 2. DERIVATIVES MARKET DATA & QUOTES
// ------------------------------------------------------------------

export interface DerivativesQuote {
  symbol: string;
  contractCode: string;
  underlying: UnderlyingIndex;
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
  openInterest: number | null;
  source: string;
  sourceTimestamp: number | null;
  fetchedAt: string;
  dataFreshness: DataFreshnessStatus;
}

export interface SpotIndexQuote {
  symbol: UnderlyingIndex;
  price: number | null;
  referencePrice: number | null;
  change: number | null;
  changePercent: number | null;
  source: string;
  sourceTimestamp: number | null;
  fetchedAt: string;
  dataFreshness: DataFreshnessStatus;
}

// ------------------------------------------------------------------
// 3. BASIS ENGINE CONTRACTS
// ------------------------------------------------------------------

export type BasisStatus = 'LIVE' | 'STALE' | 'DATA_UNAVAILABLE';

export interface BasisResult {
  /** Futures price used */
  futuresPrice: number | null;
  /** Spot price used */
  spotPrice: number | null;
  /** Absolute basis: F - S (index points) */
  basis: number | null;
  /** Basis percentage: (F - S) / S * 100 (%) */
  basisPct: number | null;
  /** Annualized basis: basisPct * (365 / daysToExpiry) (%) */
  annualizedBasis: number | null;
  /** Days remaining until contract expiration */
  daysToExpiry: number;
  /** Theoretical fair basis from Cost of Carry model */
  fairBasis: number | null;
  /** Theoretical fair futures price: S + fairBasis */
  fairPrice: number | null;
  /** Arbitrage spread / mispricing: F - fairPrice */
  mispricing: number | null;
  /** Valuation status */
  status: BasisStatus;
  /** Warnings and fail-closed notes */
  warnings: string[];
  dataLineage: {
    futuresSource: string;
    spotSource: string;
    timestamp: string;
  };
}

// ------------------------------------------------------------------
// 4. OPEN INTEREST (OI) DYNAMICS
// ------------------------------------------------------------------

export type PositioningInterpretation =
  | 'LONG_ACCUMULATION'  // Price up, OI up
  | 'SHORT_ACCUMULATION' // Price down, OI up
  | 'SHORT_COVERING'     // Price up, OI down
  | 'LONG_LIQUIDATION'   // Price down, OI down
  | 'NEUTRAL'
  | 'DATA_UNAVAILABLE';

export interface OpenInterestResult {
  symbol: string;
  openInterest: number | null;
  previousOpenInterest: number | null;
  openInterestChange: number | null;     // ΔOI = OI_t - OI_{t-1}
  openInterestChangePct: number | null;  // ΔOI% = (ΔOI / OI_{t-1}) * 100
  volume: number | null;
  volumeToOIRatio: number | null;        // Volume / OI
  positioning: PositioningInterpretation;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
  warnings: string[];
  dataLineage: {
    source: string;
    timestamp: string;
  };
}

// ------------------------------------------------------------------
// 5. TERM STRUCTURE CONTRACTS
// ------------------------------------------------------------------

export type CurveShape =
  | 'CONTANGO'
  | 'BACKWARDATION'
  | 'FLAT'
  | 'HUMPTED'
  | 'INVERTED'
  | 'DATA_UNAVAILABLE';

export interface TenorPoint {
  tenor: ContractTenor;
  contractCode: string;
  price: number | null;
  daysToExpiry: number;
  openInterest: number | null;
  volume: number | null;
  basis: number | null;
  basisPct: number | null;
}

export interface TermStructureResult {
  underlying: UnderlyingIndex;
  asOf: string;
  tenors: Record<ContractTenor, TenorPoint | null>;
  /** Points spread between 2M and 1M contracts: F_2M - F_1M */
  spread2M1M: number | null;
  /** Points spread between 1Q and 1M contracts: F_1Q - F_1M */
  spread1Q1M: number | null;
  /** Annualized curve slope (%) */
  curveSlope: number | null;
  curveShape: CurveShape;
  status: 'COMPUTED' | 'DATA_UNAVAILABLE';
  warnings: string[];
}

// ------------------------------------------------------------------
// 6. DERIVATIVES REGIME CLASSIFICATION
// ------------------------------------------------------------------

export type DerivativesRegimeType =
  | 'STRONG_CONTANGO'      // basisPct >= +0.8%
  | 'MILD_CONTANGO'        // +0.2% <= basisPct < +0.8%
  | 'FLAT_NEUTRAL'          // -0.2% <= basisPct < +0.2%
  | 'MILD_BACKWARDATION'   // -0.8% < basisPct <= -0.2%
  | 'STRONG_BACKWARDATION' // basisPct <= -0.8%
  | 'UNKNOWN';

export interface DerivativesRegimeResult {
  regime: DerivativesRegimeType;
  confidence: number; // 0 - 100 deterministic score
  basisPoints: number | null;
  basisPct: number | null;
  curveShape: CurveShape;
  positioning: PositioningInterpretation;
  timestamp: string;
  warnings: string[];
}

// ------------------------------------------------------------------
// 7. CONTINUOUS FUTURES SERIES CONTRACTS
// ------------------------------------------------------------------

export type ContinuousAdjustmentMethod =
  | 'UNADJUSTED'
  | 'PROPORTIONAL_RATIO'
  | 'BACKWARD_DIFFERENCE';

export interface ContinuousFuturesBar extends CandlePoint {
  openInterest: number | null;
  contractCode: string;
  unadjustedClose: number;
}

export interface ContinuousFuturesSeries {
  underlying: UnderlyingIndex;
  method: ContinuousAdjustmentMethod;
  bars: ContinuousFuturesBar[];
  rollDates: string[];
  count: number;
}

// ------------------------------------------------------------------
// 8. DERIVATIVES INTELLIGENCE SNAPSHOT
// ------------------------------------------------------------------

export interface DerivativesIntelligenceSnapshot {
  timestamp: string;
  dataFreshness: DataFreshnessStatus;
  sourceTimestamp: number | null;
  fetchedAt: string;
  underlying: UnderlyingIndex;
  activeContract: ContractSpecification;
  quote: DerivativesQuote;
  spotQuote: SpotIndexQuote;
  basis: BasisResult;
  openInterest: OpenInterestResult;
  termStructure: TermStructureResult;
  regime: DerivativesRegimeResult;
  dataLineage: {
    sources: string[];
    engine: string;
    calculationVersion: string;
  };
  warnings: string[];
}
