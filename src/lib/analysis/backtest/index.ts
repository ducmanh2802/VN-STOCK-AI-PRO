/**
 * PHASE 17.6 — STRATEGY BACKTEST & HISTORICAL VERIFICATION MODULE
 * ================================================================
 * Production-ready deterministic historical backtesting subsystem for Phase 17 strategies.
 */

export * from './types.ts';
export * from './LookAheadGuard.ts';
export * from './BacktestDataAdapter.ts';
export * from './PerformanceMetrics.ts';
export * from './TradeSimulator.ts';
export * from './BacktestEngine.ts';
export * from './HistoricalSignalVerifier.ts';
export * from './strategies/TrendFollowingBacktest.ts';
export * from './strategies/BreakoutConfirmationBacktest.ts';
export * from './strategies/MeanReversionBacktest.ts';
export * from './validation/index.ts';
