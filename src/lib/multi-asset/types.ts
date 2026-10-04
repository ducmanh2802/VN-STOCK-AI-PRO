/**
 * PHASE 29 — MULTI-ASSET DOMAIN CONTRACTS
 * Canonical, deterministic, fail-closed. Preserves Phase 21/22/25 semantics.
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';

export type { DataFreshnessStatus };

export type MultiAssetClass = 'EQUITY' | 'ETF' | 'DERIVATIVE' | 'CASH';

export type MultiAssetStatus =
  | 'OK'
  | 'STALE'
  | 'DATA_UNAVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'INVALID';

/** HNX standard (Phase 21): 100,000 VND per index point, tick 0.1 pt. */
export const FUTURES_MULTIPLIER_VND_PER_POINT = 100_000;
export const FUTURES_TICK_SIZE_POINTS = 0.1;
export const EQUITY_STANDARD_LOT = 100;

export type DerivativeDirection = 'LONG' | 'SHORT' | 'FLAT';

export interface MultiAssetPosition {
  readonly symbol: string;
  readonly assetClass: MultiAssetClass;
  /** Shares for equity/ETF; signed contracts for derivatives (+long/−short); VND for cash. */
  readonly quantity: number;
  /** Mark price: VND/share (equity/ETF), index points (derivatives), ignored for cash. */
  readonly markPrice: number | null;
  /** Entry reference: cost/share (equity/ETF), entry points (derivatives). */
  readonly entryPrice?: number | null;
  /** Margin required per contract in VND (derivatives only, supplied — never estimated). */
  readonly marginPerContract?: number | null;
  /** Unrealized P&L in VND (derivatives only, supplied — never synthesized). */
  readonly unrealizedPnl?: number | null;
  /** Contract expiry YYYY-MM-DD (derivatives only; expiry <= asOfDate => EXPIRED). */
  readonly expiryDate?: string | null;
  readonly sectorId?: string | null;
}

export interface ValuedPosition {
  readonly symbol: string;
  readonly assetClass: MultiAssetClass;
  /** Signed market value / notional in VND (short futures negative). */
  readonly marketValue: number | null;
  /** Absolute exposure in VND. */
  readonly absoluteExposure: number | null;
  readonly status: MultiAssetStatus;
  readonly direction: DerivativeDirection | 'N/A';
  readonly marginRequired: number | null;
  readonly unrealizedPnl: number | null;
  readonly warnings: readonly string[];
}

export interface MultiAssetPortfolioSummary {
  readonly netAssets: number | null;
  readonly grossExposure: number | null;
  readonly netExposure: number | null;
  readonly leverage: number | null;
  readonly cashBalance: number | null;
  readonly totalMarginRequired: number | null;
  readonly marginCoverage: number | null;
  readonly byClass: Readonly<Record<MultiAssetClass, number | null>>;
  readonly positionCount: number;
}

export interface RebalanceDelta {
  readonly symbol: string;
  readonly currentWeight: number;
  readonly targetWeight: number;
  readonly deltaValue: number | null;
  /** Execution hint only (lot/contract rounding); null when market value unknown. */
  readonly hintedQuantityDelta: number | null;
}

export interface StrategySignalSummary {
  readonly total: number;
  readonly byDirection: Readonly<Record<string, number>>;
  readonly meanConviction: number | null;
  readonly hasNonHoldSignal: boolean;
}

export interface QuantLimitCheck {
  readonly limit: string;
  readonly passed: boolean | null;
  readonly detail: string;
}

export interface QuantPlatformSnapshot {
  readonly snapshotId: string;
  readonly asOfDate: string;
  readonly evaluatedAt: string;
  readonly dataFreshness: DataFreshnessStatus;
  readonly positions: readonly ValuedPosition[];
  readonly summary: MultiAssetPortfolioSummary;
  readonly rebalance: readonly RebalanceDelta[];
  readonly strategy: StrategySignalSummary;
  readonly limits: readonly QuantLimitCheck[];
  /** Reference to the Phase-28 equity/ETF analytics snapshot id (informational link). */
  readonly portfolioReference: string | null;
  readonly dataLineage: {
    readonly sources: readonly string[];
    readonly engine: string;
    readonly calculationVersion: string;
  };
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
}

export const MULTI_ASSET_CALCULATION_VERSION = 'v1.0.0-phase29';

export const MULTI_ASSET_LIMITATIONS: readonly string[] = [
  'Derivatives notional uses HNX multiplier 100,000 VND/pt and tick 0.1; margin and unrealized P&L are caller-supplied and never estimated.',
  'ETF market value uses traded price; NAV/iNAV are informational and never substituted for price.',
  'Static symbol universe — historical constituents unavailable (survivorship bias possible).',
  'Missing prices/margin/history fail closed as UNAVAILABLE; expired derivatives are INVALID.',
] as const;
