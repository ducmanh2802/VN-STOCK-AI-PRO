/**
 * PHASE 18.2 — BACKTEST ENGINE TYPES
 * ===================================
 * Complete data contracts for historical backtesting, execution, and metrics.
 */

import type { InvestmentHorizon } from '../../../types/recommendation.ts';
import type { RiskConfig } from '../types/risk.ts';
import type { TradingSignal, ValidationErrorCode } from '../types/trading.ts';

export interface BacktestCandle {
  /** Session date (YYYY-MM-DD) or timestamp */
  timestamp: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Optional trading value in VND */
  value?: number | null;
  /** Exchange reference price */
  referencePrice?: number | null;
  /** Exchange daily ceiling price */
  ceilingPrice?: number | null;
  /** Exchange daily floor price */
  floorPrice?: number | null;
}

export type ExitReason =
  | 'STOP_LOSS'
  | 'TARGET'
  | 'SIGNAL'
  | 'END_OF_BACKTEST'
  | 'RISK';

export interface BacktestConfig {
  symbol: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  timeframe?: string;
  /** Strategy horizon or custom signal generation function */
  strategy?: InvestmentHorizon | ((context: StrategyContext) => TradingSignal | null);
  /** Risk management overrides */
  riskConfig?: Partial<RiskConfig>;
  /** Emergency stop flag (blocks all trading if true) */
  emergencyStop?: boolean;
  /** Automated trading enabled switch */
  tradingEnabled?: boolean;
  /** Brokerage commission fee on BUY (default: 0.0015 = 0.15%) */
  commissionRate?: number;
  /** Brokerage commission fee on SELL (default: 0.0015 = 0.15%) */
  sellFeeRate?: number;
  /** Statutory tax on SELL (default: 0.0010 = 0.10%) */
  taxRate?: number;
  /** Slippage rate on execution (default: 0.0010 = 0.10%) */
  slippageRate?: number;
  /** Allow fractional shares (default: false — strict VN board lot) */
  allowFractionalShares?: boolean;
  /** Standard Vietnamese board lot (default: 100) */
  lotSize?: number;
  /** Execute orders on next bar open (default: true — strictly no lookahead) */
  executeOnNextOpen?: boolean;
  /** Minimum lookback bars needed to warm up technical indicators (default: 25) */
  minWarmupBars?: number;
  /** Whether to force close open positions at final candle (default: false) */
  closeAtEnd?: boolean;
  /** Annual risk-free rate for Sharpe/Sortino ratios (default: 0.04 = 4%) */
  riskFreeRate?: number;
}

export interface StrategyContext {
  symbol: string;
  candles: BacktestCandle[];
  currentIndex: number;
  currentCandle: BacktestCandle;
  portfolio: Readonly<BacktestPortfolioState>;
}

export interface BacktestPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  entryTimestamp: string | number;
  exitTimestamp?: string | number | null;
  realizedPnL: number;
  unrealizedPnL: number;
  fees: number;
  tax: number;
  slippageCost: number;
}

export interface BacktestTrade {
  tradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  signalTimestamp: string | number;
  executionTimestamp: string | number;
  signalPrice: number;
  executionPrice: number;
  quantity: number;
  stopLoss: number;
  targetPrice: number;
  grossValue: number;
  fees: number;
  tax: number;
  slippage: number;
  realizedPnL: number;
  returnPercent: number;
  exitReason?: ExitReason;
}

export interface EquityPoint {
  timestamp: string | number;
  cash: number;
  positionValue: number;
  equity: number;
  drawdown: number;
}

export interface DrawdownPoint {
  timestamp: string | number;
  drawdown: number;
}

export interface BacktestPortfolioState {
  cash: number;
  equity: number;
  marketValue: number;
  positions: BacktestPosition[];
  realizedPnL: number;
  unrealizedPnL: number;
  totalFees: number;
  totalTax: number;
  totalSlippageCost: number;
  dailyRealizedLoss: number;
}

export interface BacktestResult {
  symbol: string;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number;
  annualizedReturn: number | null;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  maxDrawdown: number;
  profitFactor: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  averageHoldingPeriod: number | null;
  fees: number;
  tax: number;
  slippageCost: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  tradeHistory: BacktestTrade[];
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
}

export interface PendingOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  plannedQuantity: number;
  signalPrice: number;
  stopLoss: number;
  targetPrice: number;
  signalTimestamp: string | number;
  reasons?: string[];
  exitReason?: ExitReason;
}

export class BacktestDataError extends Error {
  public readonly code: ValidationErrorCode;

  constructor(message: string, code: ValidationErrorCode = 'DATA_UNAVAILABLE') {
    super(message);
    this.name = 'BacktestDataError';
    this.code = code;
  }
}
