/**
 * PHASE 25 — UNIVERSAL MULTI-ASSET STRATEGY CONTRACTS
 * ====================================================
 * Authoritative types and interfaces for the Universal Strategy Factory.
 *
 * Supported asset classes:
 *   - EQUITY: Vietnamese equities (HOSE, HNX, UPCOM)
 *   - DERIVATIVE: Index futures (VN30F, VN100F)
 *   - ETF: Exchange-Traded Funds (HOSE)
 *   - CROSS_ASSET: Multi-asset combinations / dynamic hedging
 *
 * Invariants:
 *   - PR-01 Freshness semantics (CURRENT | STALE | UNAVAILABLE | INVALID)
 *   - Bounded conviction: 0 <= conviction <= 100 (never NaN, never Infinity)
 *   - Fail-closed dominance: missing upstream data -> HOLD/FLAT with explicit reasonCode
 *   - Lookahead protection: temporal validation ensures no future data is consumed
 *   - Full provenance: immutable lineage on every emitted signal
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';
import type { MarketIntelligenceSnapshot } from '../analysis/market/types.ts';
import type { DerivativesIntelligenceSnapshot } from '../derivatives/types.ts';
import type { EtfIntelligenceSnapshot } from '../etf/types.ts';
import type { CorporateActionIntelligenceSnapshot } from '../corporate-actions/types.ts';
import type { EarningsSnapshot } from '../earnings/types.ts';

export type { DataFreshnessStatus };

/**
 * Universal asset classes supported across the multi-asset quant platform.
 */
export type AssetClass = 'EQUITY' | 'DERIVATIVE' | 'ETF' | 'CROSS_ASSET';

/**
 * Canonical multi-asset trade and position direction signals.
 */
export type SignalDirection =
  | 'LONG'        // Enter or increase long exposure
  | 'SHORT'       // Enter or increase short / short-hedge exposure
  | 'FLAT'        // Neutral / cash / close derivative position
  | 'HOLD'        // Maintain current allocation without trading
  | 'CLOSE'       // Liquidate / close existing position
  | 'REBALANCE';  // Dynamic cross-asset rebalance

/**
 * Categorical signal strength derived from bounded conviction.
 */
export type SignalStrength =
  | 'STRONG'      // Conviction >= 80
  | 'MODERATE'    // Conviction >= 50
  | 'WEAK'        // Conviction > 0
  | 'NEUTRAL';    // Conviction == 0

/**
 * Expected strategy investment horizon / execution style.
 */
export type TimeInForce =
  | 'INTRADAY'    // 1-session horizon (derivatives basis / intraday momentum)
  | 'SWING'       // 2-20 sessions (ETF NAV arbitrage / momentum swing)
  | 'POSITION';   // Multi-week to quarterly (Earnings quality / dividend capture)

/**
 * Strongly typed, immutable strategy parameters dictionary.
 */
export type StrategyParameters = Readonly<Record<string, unknown>>;

/**
 * Audit lineage attached to every strategy signal.
 */
export interface StrategySignalLineage {
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly engine: string;
  readonly evaluatedAt: string;
  readonly asOfDate: string;
  readonly assetClass: AssetClass;
  readonly sourceSnapshots: Readonly<{
    market?: string;
    derivatives?: string;
    etf?: string;
    corporateAction?: string;
    earnings?: string;
  }>;
}

/**
 * Canonical Strategy Signal emitted by any Phase 25 strategy generator.
 */
export interface StrategySignal {
  readonly strategyId: string;
  readonly assetClass: AssetClass;
  readonly symbol: string;
  readonly direction: SignalDirection;
  readonly conviction: number; // 0 <= conviction <= 100
  readonly strength: SignalStrength;
  readonly targetPrice: number | null;
  readonly stopLoss: number | null;
  readonly timeInForce: TimeInForce;
  readonly dataFreshness: DataFreshnessStatus;
  readonly reasonCode?: string;
  readonly notes?: readonly string[];
  readonly lineage: StrategySignalLineage;
}

/**
 * Aggregated multi-snapshot context consumed by strategy generators.
 */
export interface StrategyContext {
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly asOfDate: string; // YYYY-MM-DD
  readonly evaluatedAt: string; // ISO-8601
  readonly currentPrice?: number | null;
  readonly marketSnapshot?: MarketIntelligenceSnapshot | null;
  readonly derivativesSnapshot?: DerivativesIntelligenceSnapshot | null;
  readonly etfSnapshot?: EtfIntelligenceSnapshot | null;
  readonly corporateActionSnapshot?: CorporateActionIntelligenceSnapshot | null;
  readonly earningsSnapshot?: EarningsSnapshot | null;
  readonly lookaheadRejected?: boolean;
  readonly lookaheadDetails?: readonly string[];
}

/**
 * Parameter validation output.
 */
export interface ParameterValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
}

/**
 * Universal Multi-Asset Strategy Interface.
 */
export interface MultiAssetStrategy<P extends StrategyParameters = StrategyParameters> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly assetClass: AssetClass;
  readonly defaultParameters: P;
  validateParameters(params: unknown): ParameterValidationResult;
  evaluate(context: StrategyContext, params?: P): StrategySignal;
}
