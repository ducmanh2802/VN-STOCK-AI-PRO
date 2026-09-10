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
