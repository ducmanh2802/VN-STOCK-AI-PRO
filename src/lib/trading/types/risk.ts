/**
 * PHASE 18.1 — RISK MANAGEMENT & POSITION SIZING TYPES
 * ====================================================
 * Configurable parameters, risk context, and sizing output types.
 */

import type { ValidationErrorCode } from './trading.ts';

export interface RiskConfig {
  /** Maximum risk per trade as fraction of equity (default: 0.01 = 1%) */
  maxRiskPerTradeRate: number;
  /** Maximum portfolio exposure as fraction of equity (default: 0.80 = 80%) */
  maxPortfolioExposureRate: number;
  /** Maximum number of open positions allowed simultaneously */
  maxOpenPositions: number;
  /** Minimum Risk/Reward ratio for trade approval (default: 2.0) */
  minimumRiskReward: number;
  /** Standard Vietnamese board lot size (default: 100 shares) */
  lotSize: number;
  /** Transaction brokerage fee on BUY as fraction (default: 0.0015 = 0.15%) */
  buyFeeRate: number;
  /** Transaction brokerage fee on SELL as fraction (default: 0.0015 = 0.15%) */
  sellFeeRate?: number;
  /** Transaction tax on SELL as fraction (default: 0.0010 = 0.10%) */
  sellTaxRate: number;
  /** Slippage buffer rate for capital requirement (default: 0.0010 = 0.10%) */
  slippageRate: number;
  /** Daily realized loss limit rate as fraction of equity (default: 0.03 = 3%) */
  dailyLossLimitRate: number;
  /** Maximum allowable data staleness in milliseconds (default: 120_000ms = 2 mins) */
  maxStaleTimeMs: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTradeRate: 0.01,
  maxPortfolioExposureRate: 0.80,
  maxOpenPositions: 10,
  minimumRiskReward: 2.0,
  lotSize: 100,
  buyFeeRate: 0.0015,
  sellFeeRate: 0.0015,
  sellTaxRate: 0.0010,
  slippageRate: 0.0010,
  dailyLossLimitRate: 0.03,
  maxStaleTimeMs: 120_000,
};

export interface RiskContext {
  /** Total account equity (Cash + Market Value of open positions) */
  accountEquity: number;
  /** Available cash ready for buying */
  availableCash: number;
  /** Current total exposure in VND (sum of current values of open positions) */
  currentExposure: number;
  /** Count of open positions */
  openPositionsCount: number;
  /** Total realized loss incurred today (positive number) */
  dailyRealizedLoss: number;
  /** Global trading master switch */
  tradingEnabled: boolean;
  /** Emergency stop flag */
  emergencyStop: boolean;
  /** Whether the Vietnamese market is currently open for trading */
  isMarketOpen?: boolean;
  /** List of symbols currently held in portfolio */
  existingSymbols?: string[];
}

export interface RiskCheckResult {
  approved: boolean;
  code: ValidationErrorCode | 'APPROVED';
  reason: string;
  metrics?: {
    riskAmount?: number;
    riskPercent?: number;
    exposurePercent?: number;
    rrRatio?: number;
    /**
     * Canonical risk-approved capital ceiling for this trade.
     * Source of truth is RiskManager's own risk sizing (the approved
     * total capital requirement it derives from its risk policy).
     * It is NOT a client-supplied value, not quantity, not exposure share.
     */
    riskApprovedCapital?: number;
  };
}

export interface PositionSizingInput {
  equity: number;
  availableCash: number;
  entryPrice: number;
  stopLossPrice: number;
  maxRiskPerTradeRate?: number;
  lotSize?: number;
  buyFeeRate?: number;
  slippageRate?: number;
  existingExposure?: number;
  maxPortfolioExposureRate?: number;
  /**
   * Optional capital ceiling (VND) that the computed position's total
   * capital requirement must never exceed. Supplied by the domain layer
   * (e.g. risk-approved capital). PositionSizer enforces it fail-closed.
   */
  capitalCeiling?: number;
}

export interface PositionSizingResult {
  canTrade: boolean;
  quantity: number;
  riskAmount: number;
  riskPerShare: number;
  buyCost: number;
  buyFee: number;
  slippageBuffer: number;
  totalCapitalRequirement: number;
  code: ValidationErrorCode | 'SUCCESS';
  reason?: string;
}

// ==========================================
// PHASE 18.1 — RISK GUARD TYPES & CONTRACTS
// ==========================================

export type RiskGuardDecisionStatus = 'VALID' | 'BLOCKED' | 'INVALID';

export type RiskGuardAuthorizationStatus =
  | 'AUTHORIZED_FOR_PAPER_TRADING'
  | 'BLOCKED'
  | 'INVALID';

export interface RiskGuardPolicy {
  /** Maximum risk per trade as percentage of equity (e.g. 1.0 = 1%) */
  maxRiskPerTradePercent: number;
  /** Maximum single position allocation as percentage of equity (e.g. 20.0 = 20%) */
  maxPositionPercent: number;
  /** Maximum total portfolio exposure as percentage of equity (e.g. 80.0 = 80%) */
  maxPortfolioExposurePercent: number;
  /** Minimum Risk/Reward ratio for trade authorization (default: 2.0) */
  minimumRiskReward: number;
  /** Minimum required confidence level for signal approval */
  minimumConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Minimum order quantity in shares (default: 100) */
  minimumOrderQuantity: number;
  /** Standard Vietnamese board lot size in shares (default: 100) */
  lotSize: number;
  /** Maximum concurrent open positions allowed (default: 10) */
  maxOpenPositions: number;
  /** Daily realized loss limit as percentage of equity (e.g. 3.0 = 3%) */
  dailyLossLimitPercent: number;
  /** Maximum allowable data staleness in milliseconds (default: 120_000ms = 2 mins) */
  maxStaleTimeMs: number;
  /** Maximum price deviation allowed between signal and live price (default: 3.0 = 3%) */
  maxPriceDeviationPercent: number;
  /** Transaction brokerage fee on BUY (default: 0.0015 = 0.15%) */
  buyFeeRate: number;
  /** Slippage buffer rate (default: 0.0010 = 0.10%) */
  slippageRate: number;
  /** Enforce market session hours (default: false to allow pre-market planning, true in strict live modes) */
  enforceMarketHours?: boolean;
}

export const DEFAULT_RISK_GUARD_POLICY: RiskGuardPolicy = {
  maxRiskPerTradePercent: 1.0,
  maxPositionPercent: 20.0,
  maxPortfolioExposurePercent: 80.0,
  minimumRiskReward: 2.0,
  minimumConfidence: 'MEDIUM',
  minimumOrderQuantity: 100,
  lotSize: 100,
  maxOpenPositions: 10,
  dailyLossLimitPercent: 3.0,
  maxStaleTimeMs: 120_000,
  maxPriceDeviationPercent: 3.0,
  buyFeeRate: 0.0015,
  slippageRate: 0.0010,
  enforceMarketHours: false,
};

export interface RiskGuardEvaluationInput {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  score?: number | null;
  currentPrice?: number;
  accountEquity: number;
  availableCash: number;
  currentExposure: number;
  openPositionsCount?: number;
  dailyRealizedLoss?: number;
  existingSymbols?: string[];
  emergencyStop?: boolean;
  tradingEnabled?: boolean;
  isMarketOpen?: boolean;
  ceilingPrice?: number | null;
  floorPrice?: number | null;
  timestamp?: string | number | null;
}

export interface RiskGuardResult {
  /** Overall validity / guard decision status: VALID, BLOCKED, or INVALID */
  status: RiskGuardDecisionStatus;
  /** Explicit paper trading authorization status */
  authorization: RiskGuardAuthorizationStatus;
  /** Boolean shorthand: true only if fully AUTHORIZED_FOR_PAPER_TRADING */
  approved: boolean;
  /** Standardized reason code */
  code: ValidationErrorCode | 'APPROVED';
  /** Human-readable explanation */
  reason: string;
  /** List of distinct validation / policy errors */
  errors: string[];
  /** List of non-fatal warnings */
  warnings: string[];
  /** Quantified metrics when evaluation is valid/approved */
  metrics?: {
    approvedQuantity: number;
    riskAmount: number;
    riskPercent: number;
    positionPercent: number;
    exposurePercent: number;
    rrRatio: number;
    totalCapitalRequirement: number;
    riskApprovedCapital: number;
    buyCost: number;
    buyFee: number;
    slippageBuffer: number;
  };
}
