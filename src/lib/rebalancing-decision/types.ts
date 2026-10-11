/**
 * PHASE 30 — REBALANCING DECISION: DOMAIN CONTRACTS
 * ==================================================
 * Constraint-aware, cost-aware rebalancing decision lane (v1.0.0-phase30,
 * docs/PHASE_30_ARCHITECTURE.md). Follows the Phase 28/29 invariants:
 *
 * - `null` ALWAYS means unavailable/insufficient — NEVER 0, NEVER a guess.
 * - Pure engines accept explicit inputs and never read the system clock;
 *   `evaluatedAt` exists only at the service boundary.
 * - `INFEASIBLE` is a first-class success outcome (a correct refusal with the
 *   exact violated-constraint list), not an error.
 * - No silent substitution anywhere. Missing data => UNEVALUATED / insufficient.
 *
 * The lane is ADVISORY ONLY: a decision can never place an order and never
 * mutates strategy intent or bypasses RiskGuard / TradingEngine / PositionSizer.
 */

import type { AllocationMethod, FactorKey, PortfolioAssetClass } from '../portfolio/types.ts';
import type { DataFreshnessStatus } from '../../types/stock.ts';
import type { TradingCostConfig } from '../trading/types/trading.ts';

export type { AllocationMethod, FactorKey, PortfolioAssetClass, DataFreshnessStatus, TradingCostConfig };

export const REBALANCING_ENGINE_VERSION = 'v1.0.0-phase30';

export type RebalancingDecisionStatus =
  | 'OK'
  | 'INFEASIBLE'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE'
  | 'INVALID'
  | 'STALE';

export type ConstraintKind =
  | 'ASSET_MIN_WEIGHT'
  | 'ASSET_MAX_WEIGHT'
  | 'SECTOR_MIN_WEIGHT'
  | 'SECTOR_MAX_WEIGHT'
  | 'ASSET_CLASS_MIN_WEIGHT'
  | 'ASSET_CLASS_MAX_WEIGHT'
  | 'FACTOR_MIN_EXPOSURE'
  | 'FACTOR_MAX_EXPOSURE'
  | 'CASH_FLOOR'
  | 'LEVERAGE_CAP'
  | 'MARGIN_COVERAGE_FLOOR'
  | 'DERIVATIVE_NOTIONAL_CAP'
  | 'BENCHMARK_MAX_DEVIATION'
  | 'TURNOVER_CAP'
  | 'COST_BUDGET';

/** A binary yes/no band constraint. */
export interface WeightBand<KeyT extends string = string> {
  readonly key: KeyT;
  readonly min?: number;
  readonly max?: number;
}

export interface RebalancingConstraints {
  /** Per-symbol weight bands, keyed by UPPER symbol. CASH is a valid key. */
  readonly assetBands?: Readonly<Record<string, { readonly min?: number; readonly max?: number }>>;
  /** Sector weight bands, keyed by sectorId (ICB-aligned). */
  readonly sectorBands?: Readonly<Record<string, { readonly min?: number; readonly max?: number }>>;
  /** Asset-class weight bands, keyed by PortfolioAssetClass. */
  readonly assetClassBands?: Readonly<Record<PortfolioAssetClass, { readonly min?: number; readonly max?: number }>>;
  /** Factor exposure bands, keyed by FactorKey. */
  readonly factorBands?: Readonly<Record<FactorKey, { readonly min?: number; readonly max?: number }>>;
  /** Minimum cash weight (0..1). A CASH pseudo-symbol must exist in weights. */
  readonly cashFloor?: number;
  /** Max gross exposure / net assets (0..N). Below 1 implies deleveraging. */
  readonly leverageCap?: number;
  /** Minimum acceptable margin coverage ratio (0..1). Effective only if margin data present. */
  readonly marginCoverageFloor?: number;
  /** Max derivative notional as a fraction of net assets (0..N). */
  readonly derivativeNotionalCap?: number;
  /** Max absolute weight deviation vs an explicit benchmark portfolio. */
  readonly benchmarkMaxDeviation?: WeightBand<'benchmark'>;
  /** Max one-sided turnover Σ|Δw|/2 (0..1). 0 with off-target weights is a contradiction. */
  readonly turnoverCap?: number;
  /** Max estimated lower-bound cost in VND. Exceeding it makes the decision INFEASIBLE. */
  readonly costBudgetVnd?: number;
}

export interface ConstraintViolation {
  readonly constraintId: string;
  readonly kind: ConstraintKind;
  readonly detail: string;
}

export interface UnevaluatedConstraint {
  readonly constraintId: string;
  readonly kind: ConstraintKind;
  readonly reason: string;
}

export type QuoteStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE';

export interface RebalancingInput {
  /** YYYY-MM-DD trade date the decision is anchored to. */
  readonly asOfDate: string;
  /** Wall-clock stamp; set ONLY by the service boundary, never by a pure engine. */
  readonly evaluatedAt?: string;
  /** Current weights keyed by UPPER symbol; must include CASH (or an explicit cash weight). */
  readonly currentWeights: Readonly<Record<string, number>>;
  /** Current total portfolio value in VND used for notional / cost math. Null => cost unavailable. */
  readonly totalValueVnd?: number | null;
  /** Mark prices per UPPER symbol (VND/share, index points for derivatives) for execution hints. */
  readonly markPrices?: Readonly<Record<string, number | null>>;
  /** Reference (unconstrained) target weights — typically a Phase 28 AllocationEngine output. */
  readonly referenceTargets?: Readonly<Record<string, number>>;
  /** Tag naming the reference generator (EQUAL_WEIGHT | INVERSE_VOLATILITY | MIN_VARIANCE | BLACK_LITTERMAN_LITE). */
  readonly allocationMethod?: AllocationMethod;
  readonly constraints?: RebalancingConstraints;
  /** Canonical cost truth; defaulted to DEFAULT_TRADING_COST_CONFIG with provenance when omitted. */
  readonly costConfig?: TradingCostConfig;
  readonly sectorMap?: Readonly<Record<string, string>>;
  readonly assetClassMap?: Readonly<Record<string, PortfolioAssetClass>>;
  readonly factorScores?: Readonly<Record<string, Readonly<Record<FactorKey, number | null>>>>;
  /** Margin coverage ratio (0..1) when available (derivatives lane). */
  readonly marginCoverage?: number | null;
  /** Derivative notional as fraction of net assets (0..N) when available. */
  readonly derivativeNotional?: number | null;
  readonly quoteFreshness?: Readonly<Record<string, QuoteStatus>>;
  readonly benchmarkId?: string;
  readonly options?: {
    readonly projectionIterations?: number;
    readonly tolerance?: number;
  };
}

export interface ExecutionStep {
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL' | 'HOLD';
  /** Lot-rounded (100-share / contract) quantity for the whole order. */
  readonly roundLotQuantity: number;
  /** Notional VND of the round-lot quantity; null when price unknown. */
  readonly notionalVnd: number | null;
}

export interface TurnoverCostBreakdown {
  readonly buyFeesVnd: number;
  readonly sellFeesVnd: number;
  readonly sellTaxVnd: number;
  readonly slippageVnd: number;
  readonly totalVnd: number;
  /** The estimate is a strict lower bound: no spread/impact curve is ever invented. */
  readonly lowerBound: true;
}

export interface RebalancingDecision {
  readonly status: RebalancingDecisionStatus;
  /** Constrained weights summing to 1 ±1e-9; null unless status is OK (or STALE). */
  readonly weights: Readonly<Record<string, number>> | null;
  readonly violations: readonly ConstraintViolation[];
  readonly unevaluated: readonly UnevaluatedConstraint[];
  /** One-sided turnover Σ|Δw|/2 over the projected move. */
  readonly turnover: number | null;
  readonly cost: TurnoverCostBreakdown | null;
  readonly executionSteps: readonly ExecutionStep[];
  readonly freshness: DataFreshnessStatus;
  readonly lineage: {
    readonly inputHash: string;
    readonly asOfDate: string;
    readonly evaluatedAt: string;
    readonly allocationMethod: AllocationMethod | null;
    readonly benchmarkId: string | null;
    readonly engineVersions: readonly string[];
    readonly constraintIds: readonly string[];
    readonly costSource: string;
    readonly currentWeightsSource: string;
    readonly sources: readonly string[];
  };
  readonly caveats: readonly string[];
  readonly warnings: readonly string[];
}

/** Common caveats attached to every decision (documented limitations, never hidden). */
export const REBALANCING_CAVEATS: readonly string[] = [
  'Survivorship bias: the universe is static; historical constituents are unavailable.',
  'Return history window is ≤355 days; long-horizon conclusions are not supported.',
  'Cost figures are STRICT LOWER BOUNDS (fees + tax + slippage on turnover notional); no spread/impact curve is ever synthesized.',
  'Factor exposure is partial where factor scores are missing; no imputation is performed.',
  'Black-Litterman output remains a lite blend of reference and views, not a full BL posterior.',
  'Covariance math follows the Phase 28 simplified estimator (ridge 1e-6, long-only clip).',
] as const;