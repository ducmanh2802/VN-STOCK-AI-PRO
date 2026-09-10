/**
 * PHASE 18.1 — AUTO TRADING TYPES
 * ================================
 * Core data contracts for trading data, signals, validation, and decisions.
 */

export type TradingSignalType = 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';

export type ValidationErrorCode =
  | 'DATA_UNAVAILABLE'
  | 'STALE_DATA'
  | 'INVALID_PRICE'
  | 'INVALID_SIGNAL'
  | 'INVALID_RISK_REWARD'
  | 'MARKET_CLOSED'
  | 'PRICE_LIMIT_VIOLATION'
  | 'INSUFFICIENT_CASH'
  | 'POSITION_LIMIT'
  | 'DAILY_LOSS_LIMIT'
  | 'EMERGENCY_STOP'
  | 'TRADING_DISABLED'
  | 'EXCESSIVE_RISK'
  | 'EXCESSIVE_EXPOSURE'
  | 'INVALID_LOT_SIZE'
  | 'INVALID_ORDER'
  | 'INVALID_SYMBOL'
  | 'INVALID_QUANTITY'
  | 'INVALID_CAPITAL'
  | 'INSUFFICIENT_POSITION'
  | 'SHORT_SELL_NOT_SUPPORTED'
  | 'DUPLICATE_ORDER'
  | 'ORDER_ALREADY_FILLED'
  | 'ORDER_ALREADY_CANCELLED'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_SUBMITTED';

export interface TradingMarketData {
  symbol: string;
  price: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  referencePrice?: number | null;
  ceilingPrice?: number | null;
  floorPrice?: number | null;
  timestamp?: string | number | null;
  dataSource?: string;
}

export interface TradingSignal {
  symbol: string;
  signal: TradingSignalType;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | number | null;
  score?: number | null;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskReward?: number | null;
  strategy?: string | null;
  timestamp?: string | number | null;
  reasons?: string[];
  dataSource?: string;
}

export interface ValidationResult {
  isValid: boolean;
  code: ValidationErrorCode | 'OK';
  message: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export type TradeDecisionType = 'APPROVED_TRADE' | 'NO_TRADE';

export interface TradeDecision {
  decision: TradeDecisionType;
  symbol: string;
  signal: TradingSignalType;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  riskRewardRatio: number;
  totalCapitalRequirement: number;
  /**
   * Canonical risk-approved capital ceiling for this trade, owned by
   * RiskManager and derived from its own risk sizing policy.
   */
  riskApprovedCapital?: number;
  rejectionCode?: ValidationErrorCode;
  rejectionReason?: string;
  timestamp: string;
}

// ==========================================
// PHASE 18.3 — ORDER & EXECUTION DATA MODELS
// ==========================================

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export type OrderStatus =
  | 'NEW'
  | 'VALIDATED'
  | 'SUBMITTED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number | null;
  status: OrderStatus;
  createdAt: string;
  submittedAt?: string | null;
  filledAt?: string | null;
  averageFillPrice?: number | null;
  filledQuantity?: number | null;
  rejectedReason?: string | null;
  rejectionCode?: ValidationErrorCode | null;
  cancelledAt?: string | null;
  expiresAt?: string | null;
  clientOrderId?: string | null;
  tradeValue?: number | null;
  fee?: number | null;
  tax?: number | null;
  slippage?: number | null;
  reservedCashAmount?: number | null;
}

export interface TradingCostConfig {
  /** Brokerage fee rate on BUY as fraction (default: 0.0015 = 0.15%) */
  buyFeeRate: number;
  /** Brokerage fee rate on SELL as fraction (default: 0.0015 = 0.15%) */
  sellFeeRate: number;
  /** Statutory transaction tax on SELL as fraction (default: 0.0010 = 0.10%) */
  sellTaxRate: number;
  /** Slippage buffer rate on execution (default: 0.0010 = 0.10%) */
  slippageRate: number;
}

export const DEFAULT_TRADING_COST_CONFIG: TradingCostConfig = {
  buyFeeRate: 0.0015,
  sellFeeRate: 0.0015,
  sellTaxRate: 0.0010,
  slippageRate: 0.0010,
};

