/**
 * PHASE 30 — REBALANCING DECISION BUILDER (pure orchestrator)
 * =============================================================
 * Assembles a full RebalancingDecision snapshot: constrained weights | INFEASIBLE
 * reasons, turnover, lower-bound cost breakdown, lot-rounded execution steps,
 * provenance (input hash + versions + constraint/cost snapshot) and caveats.
 *
 * Pure: no provider, no database, no system clock. `evaluatedAt` is supplied by
 * the caller (service stamps the wall clock). Same input → byte-identical output.
 *
 * Failure precedence (§8): INVALID input → UNAVAILABLE quotes → INFEASIBLE
 * (constraint contradictions) → INSUFFICIENT_DATA (unevaluated constraints or
 * missing cost truth) → INFEASIBLE (projection / aggregate / turnover / budget)
 * → OK | STALE.
 */

import { createHash } from 'node:crypto';
import { DEFAULT_TRADING_COST_CONFIG } from '../trading/types/trading.ts';
import { ConstraintEngine } from './ConstraintEngine.ts';
import { ConstrainedAllocator } from './ConstrainedAllocator.ts';
import { TurnoverCostEngine } from './TurnoverCostEngine.ts';
import {
  REBALANCING_CAVEATS,
  REBALANCING_ENGINE_VERSION,
  type DataFreshnessStatus,
  type RebalancingDecision,
  type RebalancingDecisionStatus,
  type RebalancingInput,
  type UnevaluatedConstraint,
} from './types.ts';
import type { ConstraintViolation } from './types.ts';
import { PORTFOLIO_CALCULATION_VERSION } from '../portfolio/types.ts';
import { MULTI_ASSET_CALCULATION_VERSION } from '../multi-asset/types.ts';

const TOL = 1e-9;
const ISODATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function hashInput(input: RebalancingInput, reference: Readonly<Record<string, number>>): string {
  const payload = JSON.stringify({
    asOfDate: input.asOfDate,
    currentWeights: input.currentWeights,
    referenceTargets: reference,
    constraints: input.constraints ?? null,
    costConfig: input.costConfig ?? null,
    allocationMethod: input.allocationMethod ?? null,
    options: input.options ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function failure(
  status: RebalancingDecisionStatus,
  input: RebalancingInput,
  reference: Readonly<Record<string, number>>,
  violations: readonly ConstraintViolation[],
  unevaluated: readonly UnevaluatedConstraint[],
  warnings: readonly string[],
  freshness: DataFreshnessStatus
): RebalancingDecision {
  return {
    status,
    weights: null,
    violations,
    unevaluated,
    turnover: null,
    cost: null,
    executionSteps: [],
    freshness,
    lineage: {
      inputHash: hashInput(input, reference),
      asOfDate: input.asOfDate,
      evaluatedAt: input.evaluatedAt ?? 'UNSTAMPED',
      allocationMethod: input.allocationMethod ?? null,
      benchmarkId: input.benchmarkId ?? null,
      engineVersions: [REBALANCING_ENGINE_VERSION, PORTFOLIO_CALCULATION_VERSION, MULTI_ASSET_CALCULATION_VERSION],
      constraintIds: input.constraints ? Object.keys(input.constraints) : [],
      costSource: input.costConfig ? 'caller-supplied' : 'canonical DEFAULT_TRADING_COST_CONFIG',
      currentWeightsSource: 'caller-supplied currentWeights',
      sources: ['Phase 28 AllocationEngine (reference)', 'Phase 29 multi-asset valuation (weights/margin semantics)', 'Phase 30 (constraints/cost/turnover)'],
    },
    caveats: REBALANCING_CAVEATS,
    warnings,
  };
}

export function buildRebalancingDecision(input: RebalancingInput): RebalancingDecision {
  const warnings: string[] = [];
  const evaluatedAt = input.evaluatedAt ?? 'UNSTAMPED';

  // ---- INVALID: malformed anchors -----------------------------------------------
  if (!ISODATE_RE.test(input.asOfDate)) {
    return failure('INVALID', input, Object.freeze({}), [], [], ['asOfDate must be YYYY-MM-DD'], 'INVALID');
  }

  // ---- normalize current weights (CASH as the residual pseudo-symbol)
  const rawSymbols = Object.keys(input.currentWeights).map((s) => s.toUpperCase());
  if (rawSymbols.length === 0) {
    return failure('INVALID', input, Object.freeze({}), [], [], ['currentWeights is empty'], 'INVALID');
  }
  const current: Record<string, number> = {};
  let sumRaw = 0;
  for (const s of rawSymbols) {
    if (!isFiniteNum(input.currentWeights[s]) || input.currentWeights[s] < 0) {
      return failure('INVALID', input, Object.freeze({}), [], [], [`current weight for ${s} is not a finite number ≥ 0`], 'INVALID');
    }
    current[s] = input.currentWeights[s];
    sumRaw += current[s];
  }
  if (Math.abs(sumRaw - 1) > 1e-6) {
    // Interpret the residual as cash; refuse if weights already exceed 1.
    const cashResidual = 1 - sumRaw;
    if (cashResidual < -1e-6) {
      return failure('INVALID', input, Object.freeze({}), [], [], [`currentWeights sum to ${sumRaw.toFixed(4)} (> 1)`], 'INVALID');
    }
    current['CASH'] = (current['CASH'] ?? 0) + cashResidual;
    warnings.push(`currentWeights summed to ${sumRaw.toFixed(4)} — residual assigned to the CASH pseudo-symbol`);
  } else if (!('CASH' in current)) {
    current['CASH'] = 0;
  }
  const symbols = Object.keys(current);

  // ---- freshness gate ------------------------------------------------------------
  let freshStatus: DataFreshnessStatus = 'CURRENT';
  if (input.quoteFreshness) {
    const statuses = Object.values(input.quoteFreshness);
    if (statuses.includes('UNAVAILABLE')) {
      return failure('UNAVAILABLE', input, Object.freeze({}), [], [], ['quote freshness UNAVAILABLE — weights not computed'], 'UNAVAILABLE');
    }
    if (statuses.includes('STALE')) {
      freshStatus = 'STALE';
      warnings.push('quote freshness STALE — values kept, flagged');
    }
  }

  // ---- reference targets (Phase 28 or equal-weight fallback) ----------------------
  let reference: Record<string, number> = {};
  const targets = input.referenceTargets;
  if (targets) {
    let sum = 0;
    for (const [s, v] of Object.entries(targets)) {
      const key = s.toUpperCase();
      if (!isFiniteNum(v) || v < 0) {
        return failure('INVALID', input, Object.freeze({}), [], [], [`reference target for ${key} is not a finite number ≥ 0`], 'INVALID');
      }
      reference[key] = v;
      sum += v;
    }
    if (!(sum > 0)) {
      return failure('INVALID', input, Object.freeze({}), [], [], ['referenceTargets sum to 0'], 'INVALID');
    }
    if (!('CASH' in reference)) reference['CASH'] = current['CASH'] ?? 0;
  } else {
    const investable = symbols.filter((s) => s !== 'CASH');
    if (investable.length === 0) {
      return failure('INVALID', input, Object.freeze({}), [], [], ['no investable symbols beyond CASH'], 'INVALID');
    }
    const eq = 1 / investable.length;
    for (const s of investable) reference[s] = eq;
    reference['CASH'] = current['CASH'] ?? 0;
    warnings.push('referenceTargets absent — equal-weight reference over the investable sleeve');
  }
  const referenceRef = Object.freeze({ ...reference });

  // ---- constraint validation -------------------------------------------------------
  let violations: ConstraintViolation[] = [...ConstraintEngine.validateConstraints(input.constraints, symbols)];
  if (violations.length > 0) {
    return failure('INFEASIBLE', input, referenceRef, violations, [], warnings, freshStatus);
  }

  // ---- unevaluated constraints ⇒ fail closed (no imputation) -----------------------
  const unevaluated = ConstraintEngine.unevaluatedConstraints(input, input.constraints);
  if (unevaluated.length > 0) {
    return failure('INSUFFICIENT_DATA', input, referenceRef, [], unevaluated, warnings, freshStatus);
  }

  // ---- bounded simplex projection --------------------------------------------------
  const projection = ConstrainedAllocator.project({ referenceWeights: reference, constraints: input.constraints });
  if (projection.ok === false) {
    violations = [
      {
        constraintId: 'projection',
        kind: 'ASSET_MAX_WEIGHT',
        detail: `projection failed: ${projection.reason} — ${projection.detail}`,
      },
    ];
    return failure('INFEASIBLE', input, referenceRef, violations, [], warnings, freshStatus);
  }
  const weights = projection.weights;

  // ---- aggregate bands (sector / class / factor / leverage / margin / derivative) --
  const aggregateViolations = ConstraintEngine.evaluateConstraints(
    { ...input },
    weights,
    input.constraints
  );
  if (aggregateViolations.length > 0) {
    return failure('INFEASIBLE', input, referenceRef, aggregateViolations, [], warnings, freshStatus);
  }

  // ---- turnover ---------------------------------------------------------------------
  const turnover = TurnoverCostEngine.turnover(Object.freeze({ ...current }), weights);
  const turnoverCap = input.constraints?.turnoverCap;
  if (turnoverCap !== undefined) {
    if (turnoverCap === 0 && turnover > 1e-6) {
      return failure('INFEASIBLE', input, referenceRef, [{ constraintId: 'turnover.cap', kind: 'TURNOVER_CAP', detail: `turnover cap is 0 but off-target turnover is ${turnover.toFixed(6)}` }], [], warnings, freshStatus);
    }
    if (turnover - 1e-9 > turnoverCap) {
      return failure('INFEASIBLE', input, referenceRef, [{ constraintId: 'turnover.cap', kind: 'TURNOVER_CAP', detail: `turnover ${turnover.toFixed(4)} exceeds cap ${turnoverCap}` }], [], warnings, freshStatus);
    }
  }

  // ---- cost lower bound (canonical cost truth; never zero-cost) ----------------------
  const costConfig = input.costConfig ?? DEFAULT_TRADING_COST_CONFIG;
  const costSource = input.costConfig ? 'caller-supplied' : 'canonical DEFAULT_TRADING_COST_CONFIG';
  const costResult = TurnoverCostEngine.lowerBoundCost({
    currentWeights: Object.freeze({ ...current }),
    newWeights: weights,
    totalValueVnd: input.totalValueVnd ?? null,
    costConfig,
  });
  if (costResult.ok === false) {
    return failure('INSUFFICIENT_DATA', input, referenceRef, [], [], [...warnings, costResult.detail], freshStatus);
  }
  const costBudget = input.constraints?.costBudgetVnd;
  if (costBudget !== undefined && costResult.breakdown.totalVnd - 1e-6 > costBudget) {
    return failure('INFEASIBLE', input, referenceRef, [{ constraintId: 'cost.budget', kind: 'COST_BUDGET', detail: `lower-bound cost ${costResult.breakdown.totalVnd} VND exceeds budget ${costBudget} VND` }], [], warnings, freshStatus);
  }

  // ---- execution hints ----------------------------------------------------------------
  const stepsResult = TurnoverCostEngine.executionSteps({
    currentWeights: Object.freeze({ ...current }),
    newWeights: weights,
    totalValueVnd: input.totalValueVnd ?? null,
    costConfig,
    markPrices: input.markPrices,
  });
  if (stepsResult.warning) warnings.push(stepsResult.warning);

  const status: RebalancingDecisionStatus = freshStatus === 'STALE' ? 'STALE' : 'OK';

  return {
    status,
    weights,
    violations: [],
    unevaluated: [],
    turnover,
    cost: costResult.breakdown,
    executionSteps: stepsResult.steps,
    freshness: freshStatus,
    lineage: {
      inputHash: hashInput(input, referenceRef),
      asOfDate: input.asOfDate,
      evaluatedAt,
      allocationMethod: input.allocationMethod ?? null,
      benchmarkId: input.benchmarkId ?? null,
      engineVersions: [REBALANCING_ENGINE_VERSION, PORTFOLIO_CALCULATION_VERSION, MULTI_ASSET_CALCULATION_VERSION],
      constraintIds: input.constraints ? Object.keys(input.constraints) : [],
      costSource,
      currentWeightsSource: 'caller-supplied currentWeights',
      sources: ['Phase 28 AllocationEngine (reference)', 'Phase 29 multi-asset valuation (weights/margin semantics)', 'Phase 30 (constraints/cost/turnover)'],
    },
    caveats: REBALANCING_CAVEATS,
    warnings,
  };
}

/** Exported for services/tests that need the canonical default cost ref with provenance. */
export { DEFAULT_TRADING_COST_CONFIG };

/**
 * Fail-closed decision for service boundaries (provider throw, unavailable
 * downstream data). Never fabricates a series; weights stay null.
 */
export function failureDecision(
  status: RebalancingDecisionStatus,
  input: RebalancingInput,
  warnings: readonly string[],
  freshness: DataFreshnessStatus
): RebalancingDecision {
  return failure(status, input, Object.freeze({}), [], [], warnings, freshness);
}