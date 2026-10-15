/**
 * PHASE 18.3 — PAPER BROKER TYPES
 * ================================
 * Configuration, events, and telemetry contracts for the Paper Broker simulation.
 */

import type { TradingCostConfig, TradingMarketData } from '../types/trading.ts';

export interface PaperBrokerConfig {
  /** Unique paper account identifier (default: 'PAPER_ACCOUNT_1') */
  accountId?: string;
  /** Initial cash endowment in VND (default: 100_000_000 = 100M VND) */
  initialCash?: number;
  /** Account base currency (default: 'VND') */
  currency?: string;
  /** Trading fee, tax, and slippage rate configuration */
  tradingCosts?: Partial<TradingCostConfig>;
  /** Global trading master switch (default: true) */
  tradingEnabled?: boolean;
  /** Emergency stop flag (default: false) */
  emergencyStop?: boolean;
  /**
   * If true, bypasses real-time market session hours check.
   * Useful for unit tests or off-hours simulated backtests.
   * Default: false (enforces strict VN 09:00 - 14:45 session).
   */
  skipSessionValidation?: boolean;
  /** Minimum trading board lot size (default: 100 shares) */
  lotSize?: number;
}

export type PaperBrokerEventType =
  | 'ORDER_SUBMITTED'
  | 'ORDER_FILLED'
  | 'ORDER_REJECTED'
  | 'ORDER_CANCELLED'
  | 'ORDER_EXPIRED'
  | 'POSITION_UPDATED'
  | 'ACCOUNT_UPDATED'
  | 'EMERGENCY_STOP_TRIGGERED';

export interface PaperBrokerEvent {
  type: PaperBrokerEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export type PaperBrokerEventListener = (event: PaperBrokerEvent) => void;

export type SimulationMarketTick = TradingMarketData;
