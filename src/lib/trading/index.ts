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
export * from './risk/RiskGuard.ts';
export * from './risk/VietnamLotRule.ts';
export * from './backtest/index.ts';
export * from './execution/BrokerAdapter.ts';
export * from './execution/OrderManager.ts';
export * from './paper/PaperBrokerTypes.ts';
export * from './paper/PaperBroker.ts';
export * from './engine/index.ts';
export * from './api/index.ts';
export * from './capitalAllocation/index.ts';
export * from './paper/index.ts';
export * from './snapshot/index.ts';
export * from './replay/index.ts';
