/**
 * PHASE 18.1 — AUTO TRADING MODULE ENTRYPOINT
 * ============================================
 * Core data validation, risk management, and position sizing.
 */

export * from './types/trading.ts';
export * from './types/risk.ts';
export * from './validation/TradingDataValidator.ts';
export * from './risk/PositionSizer.ts';
export * from './risk/RiskManager.ts';
export * from './backtest/index.ts';
export * from './execution/BrokerAdapter.ts';
export * from './execution/OrderManager.ts';
export * from './paper/PaperBrokerTypes.ts';
export * from './paper/PaperBroker.ts';
export * from './engine/index.ts';
