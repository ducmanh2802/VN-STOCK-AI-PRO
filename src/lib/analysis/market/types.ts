/**
 * PHASE 20 — MARKET INTELLIGENCE FOUNDATION: TYPES & INTERFACES
 * ===============================================================
 * Single Source of Truth contracts for Market Regime, Market Breadth,
 * Sector Intelligence, Relative Strength, Volume/Flow, and Snapshots.
 */

import type { CandlePoint } from '../../indicators/types.ts';

// ------------------------------------------------------------------
// 1. MARKET REGIME TYPES
// ------------------------------------------------------------------

export type MarketRegimeType =
  | 'BULL_TREND'
  | 'BEAR_TREND'
  | 'SIDEWAYS'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'UNKNOWN';

export interface MarketRegimeScores {
  trendScore: number | null;          // 0 - 100: Index trend strength vs MAs
  breadthScore: number | null;        // 0 - 100: Market-wide constituent participation
  volatilityScore: number | null;     // 0 - 100: Volatility regime (0 = extremely low, 100 = crisis level)
  liquidityScore: number | null;      // 0 - 100: Volume relative to 20-day historical mean
  momentumScore: number | null;       // 0 - 100: RSI/MACD oscillator strength
  participationScore: number | null;  // 0 - 100: Up-volume to total-volume participation
}

export interface MarketRegimeResult {
  regime: MarketRegimeType;
  confidence: number;                 // 0 - 100 deterministic composite score (NOT a probability)
  scores: MarketRegimeScores;
  timestamp: string;
  calculationVersion: string;
  dataLineage: {
    source: string;
    universe: string;
    barCount: number;
    constituentsEvaluated: number;
  };
  warnings: string[];
}

// ------------------------------------------------------------------
// 2. MARKET BREADTH TYPES
// ------------------------------------------------------------------

export interface ConstituentCandleData {
  symbol: string;
  sectorId?: string;
  candles: readonly CandlePoint[];
}

export interface MarketBreadthResult {
  asOf: string;
  universe: string;
  totalConstituents: number;
  validConstituents: number;
  coverageRatio: number;              // valid / total (0.0 - 1.0)
  
  advanceCount: number;
  declineCount: number;
  unchangedCount: number;
  advanceDeclineRatio: number | null; // advances / declines (null if declines = 0)
  
  percentAboveMA20: number | null;   // 0.0 - 1.0
  percentAboveMA50: number | null;   // 0.0 - 1.0
  percentAboveMA200: number | null;  // 0.0 - 1.0
  
  newHighCount: number;               // 20-day / 52-week new highs
  newLowCount: number;                // 20-day / 52-week new lows
  
  upVolume: number;                   // Volume of advancing stocks
  downVolume: number;                 // Volume of declining stocks
  upDownVolumeRatio: number | null;   // upVolume / downVolume (null if downVolume = 0)
  
  breadthThrust: number | null;       // 0.0 - 1.0: advanceCount / (advanceCount + declineCount)
  marketParticipation: number | null; // 0.0 - 1.0: upVolume / (upVolume + downVolume)
  
  warnings: string[];
  dataLineage: {
    source: string;
    timestamp: string;
    calculationVersion: string;
  };
  calculationVersion: string;
}

// ------------------------------------------------------------------
// 3. SECTOR INTELLIGENCE TYPES
// ------------------------------------------------------------------

export interface SectorReturns {
  d1: number | null;   // 1-day return in %
  w1: number | null;   // 1-week return in %
  m1: number | null;   // 1-month return in %
  m3: number | null;   // 3-month return in %
  m6: number | null;   // 6-month return in %
}

export interface SectorRelativeStrength {
  vsVnIndex: SectorReturns;
  vsVn30: SectorReturns;
}

export interface SectorMomentum {
  rsi14: number | null;
  macdTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  momentumScore: number | null; // 0 - 100
}

export interface SectorBreadth {
  advanceCount: number;
  declineCount: number;
  unchangedCount: number;
  percentAboveMA20: number | null;
  percentAboveMA50: number | null;
}

export interface SectorMetrics {
  sectorId: string;
  sectorName: string;
  totalConstituents: number;
  validConstituents: number;
  coverageRatio: number;
  returns: SectorReturns;
  relativeStrength: SectorRelativeStrength;
  momentum: SectorMomentum;
  breadth: SectorBreadth;
  compositeScore: number | null; // 0 - 100 deterministic ranking score
  rank: number | null;           // 1-based rank (1 = strongest)
  warnings: string[];
}

export interface SectorIntelligenceResult {
  asOf: string;
  sectors: SectorMetrics[];
  calculationVersion: string;
  dataLineage: {
    source: string;
    timestamp: string;
  };
  warnings: string[];
}

// ------------------------------------------------------------------
// 4. RELATIVE STRENGTH ENGINE TYPES
// ------------------------------------------------------------------

export type RSPeriod = '1W' | '1M' | '3M' | '6M' | '12M';

export interface RSPeriodMetric {
  period: RSPeriod;
  assetReturn: number | null;     // In %
  benchmarkReturn: number | null; // In %
  excessReturn: number | null;    // assetReturn - benchmarkReturn in %
  rsScore: number | null;         // 0 - 100 normalized performance percentile
}

export interface RelativeStrengthMetrics {
  symbol: string;
  benchmark: 'VN-INDEX' | 'VN30';
  periods: Record<RSPeriod, RSPeriodMetric>;
  overallRS: number | null;       // 0 - 100 weighted multi-period score
  asOf: string;
  warnings: string[];
  dataLineage: {
    assetSource: string;
    benchmarkSource: string;
    timestamp: string;
  };
}

// ------------------------------------------------------------------
// 5. VOLUME / FLOW INTELLIGENCE TYPES
// ------------------------------------------------------------------

export type PriceVolumePatternType =
  | 'BULLISH_CONFIRMATION'  // Price up, volume surging above average
  | 'BEARISH_DISTRIBUTION'  // Price down, volume surging above average
  | 'BULLISH_DIVERGENCE'    // Price down, volume drying up (absorption/no supply)
  | 'BEARISH_DIVERGENCE'    // Price up, volume drying up (exhaustion/lack of demand)
  | 'NEUTRAL'
  | 'UNAVAILABLE';

export interface VolumeFlowIntelligenceResult {
  symbol: string;
  currentVolume: number;
  volumeSMA20: number | null;
  relativeVolume: number | null;    // currentVolume / volumeSMA20
  volumeSpike: boolean;             // relativeVolume >= 1.5
  volumeDryUp: boolean;             // relativeVolume <= 0.65
  obv: number | null;               // On-Balance Volume
  obvTrend: 'RISING' | 'FALLING' | 'FLAT' | 'UNAVAILABLE';
  accumulationDistribution: number | null; // A/D line
  adTrend: 'RISING' | 'FALLING' | 'FLAT' | 'UNAVAILABLE';
  vwap: number | null;              // Session/intraday VWAP (fail closed if unavailable)
  vwapStatus: 'COMPUTED' | 'UNAVAILABLE';
  upVolume: number;
  downVolume: number;
  breakoutVolumeConfirmed: boolean;
  priceVolumePattern: PriceVolumePatternType;
  warnings: string[];
  dataLineage: {
    source: string;
    barCount: number;
    timestamp: string;
  };
}

// ------------------------------------------------------------------
// 6. MARKET INTELLIGENCE SNAPSHOT
// ------------------------------------------------------------------

export interface MarketIntelligenceSnapshot {
  timestamp: string;
  market: 'VIETNAM_EQUITIES';
  regime: MarketRegimeResult;
  breadth: MarketBreadthResult;
  sectors: SectorMetrics[];
  topRelativeStrength: {
    stocksVsVnIndex: RelativeStrengthMetrics[];
    sectorsVsVnIndex: SectorMetrics[];
  };
  volumeFlow: {
    marketVolumeSpikeCount: number;
    marketDryUpCount: number;
    marketAdvancingVolumeRatio: number | null;
  };
  dataQuality: {
    totalUniverseSymbols: number;
    validSymbols: number;
    coveragePercent: number;
    isFailClosed: boolean;
  };
  dataLineage: {
    sources: string[];
    calculationVersion: string;
    engine: string;
  };
  calculationVersion: string;
  warnings: string[];
  // Phase 20 Step 1 Dashboard Additions
  supportResistance?: MarketSupportResistanceResult;
  breakdownRisk?: MarketBreakdownRiskResult;
  recoveryStrength?: MarketRecoveryStrengthResult;
}

// ------------------------------------------------------------------
// 7. STEP 1 DASHBOARD CONTRACTS: S/R, BREAKDOWN RISK, RECOVERY STRENGTH
// ------------------------------------------------------------------

export interface MarketSupportResistanceLevel {
  price: number;
  strength: number;
}

export interface MarketSupportResistanceResult {
  currentPrice: number | null;
  nearestSupport: MarketSupportResistanceLevel | null;
  secondarySupport: MarketSupportResistanceLevel | null;
  distanceToSupportPct: number | null;
  nearestResistance: MarketSupportResistanceLevel | null;
  secondaryResistance: MarketSupportResistanceLevel | null;
  distanceToResistancePct: number | null;
  status: 'LIVE' | 'STALE' | 'DATA_UNAVAILABLE';
  reason?: string;
}

export type BreakdownRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'DATA_UNAVAILABLE';

export interface MarketBreakdownRiskResult {
  riskLevel: BreakdownRiskLevel;
  nearestSupportPrice: number | null;
  distanceToSupportPct: number | null;
  downsideVolumeCondition: string;
  marketBreadthCondition: string;
  trendCondition: string;
  volatilityCondition: string;
  supportingMetrics: {
    volatilityScore: number | null;
    breadthScore: number | null;
    trendScore: number | null;
    liquidityScore: number | null;
  };
  why: string[];
  confirmationConditions: string[];
  invalidationConditions: string[];
  status: 'LIVE' | 'STALE' | 'DATA_UNAVAILABLE';
  reason?: string;
}

export type RecoveryStrengthStage = 'WEAK' | 'DEVELOPING' | 'CONFIRMED' | 'DATA_UNAVAILABLE';

export interface MarketRecoveryStrengthResult {
  recoveryState: RecoveryStrengthStage;
  supportHoldStatus: boolean | null;
  resistanceReclaimStatus: boolean | null;
  breadthImprovement: boolean | null;
  volumeConfirmation: boolean | null;
  momentumCondition: string;
  trendCondition: string;
  leadershipCondition: string;
  resistanceRange: string;
  supportingMetrics: {
    advanceDeclineRatio: number | null;
    marketParticipation: number | null;
    momentumScore: number | null;
    trendScore: number | null;
  };
  why: string[];
  confirmationConditions: string[];
  invalidationConditions: string[];
  status: 'LIVE' | 'STALE' | 'DATA_UNAVAILABLE';
  reason?: string;
}
