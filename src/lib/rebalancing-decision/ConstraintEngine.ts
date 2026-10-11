/**
 * PHASE 30 — CONSTRAINT ENGINE (pure, deterministic)
 * ==================================================
 * Validates / normalizes a constraint set and detects algebraic contradictions
 * BEFORE any solver runs. Then evaluates a candidate weight vector against
 * aggregate bands (sector / asset-class / factor / benchmark / leverage /
 * margin / derivative-notional).
 *
 * Failure model (§8): a contradictory proposal returns typed violations and no
 * weights; a constraint whose required data is absent is marked UNEVALUATED and
 * the builder fails closed (INSUFFICIENT_DATA) — never defaulted to zero.
 */

import type {
  ConstraintKind,
  ConstraintViolation,
  RebalancingConstraints,
  RebalancingInput,
  UnevaluatedConstraint,
} from './types.ts';

const TOL = 1e-9;

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function bandViolation(
  kind: ConstraintKind,
  constraintId: string,
  detail: string
): ConstraintViolation {
  return { constraintId, kind, detail };
}

function checkWeightBand(
  kind: ConstraintKind,
  prefix: string,
  key: string,
  band: { readonly min?: number; readonly max?: number },
  errors: ConstraintViolation[]
): void {
  if (band.min !== undefined && !isFiniteNum(band.min)) {
    errors.push(bandViolation(kind, `${prefix}.${key}`, `${prefix}.${key}: min is not a finite number`));
  }
  if (band.max !== undefined && !isFiniteNum(band.max)) {
    errors.push(bandViolation(kind, `${prefix}.${key}`, `${prefix}.${key}: max is not a finite number`));
  }
  const lo = band.min ?? 0;
  const hi = band.max ?? 1;
  if (isFiniteNum(lo) && (lo < 0 || lo > 1)) {
    errors.push(bandViolation(kind, `${prefix}.${key}`, `${prefix}.${key}: min must be in [0,1]`));
  }
  if (isFiniteNum(hi) && (hi < 0 || hi > 1)) {
    errors.push(bandViolation(kind, `${prefix}.${key}`, `${prefix}.${key}: max must be in [0,1]`));
  }
  if (isFiniteNum(lo) && isFiniteNum(hi) && lo > hi) {
    errors.push(bandViolation(kind, `${prefix}.${key}`, `${prefix}.${key}: min (${lo}) exceeds max (${hi})`));
  }
}

/**
 * Per-asset minima / maxima including the CASH pseudo-symbol's implicit band.
 * Public so the allocator reuses the same reading of the constraint set.
 */
export function readPerAssetBounds(
  constraints: RebalancingConstraints | undefined
): { lo: Readonly<Record<string, number>>; hi: Readonly<Record<string, number>> } {
  const lo: Record<string, number> = {};
  const hi: Record<string, number> = {};
  if (constraints?.assetBands) {
    for (const [sym, band] of Object.entries(constraints.assetBands)) {
      lo[sym.toUpperCase()] = band.min ?? 0;
      hi[sym.toUpperCase()] = band.max ?? 1;
    }
  }
  if (constraints?.cashFloor !== undefined && isFiniteNum(constraints.cashFloor)) {
    lo['CASH'] = Math.max(lo['CASH'] ?? 0, constraints.cashFloor);
  }
  return { lo, hi };
}

export class ConstraintEngine {
  /** Validate + normalize a constraint set. Returns violations (empty when OK). */
  static validateConstraints(
    constraints: RebalancingConstraints | undefined,
    symbols: readonly string[]
  ): readonly ConstraintViolation[] {
    if (!constraints) return [];
    const errors: ConstraintViolation[] = [];

    if (constraints.assetBands) {
      for (const [sym, band] of Object.entries(constraints.assetBands)) {
        checkWeightBand('ASSET_MIN_WEIGHT', 'asset.min', sym.toUpperCase(), band, errors);
        checkWeightBand('ASSET_MAX_WEIGHT', 'asset.max', sym.toUpperCase(), band, errors);
      }
    }
    if (constraints.sectorBands) {
      for (const [id, band] of Object.entries(constraints.sectorBands)) {
        checkWeightBand('SECTOR_MIN_WEIGHT', 'sector.min', id, band, errors);
        checkWeightBand('SECTOR_MAX_WEIGHT', 'sector.max', id, band, errors);
      }
    }
    if (constraints.assetClassBands) {
      for (const [cls, band] of Object.entries(constraints.assetClassBands)) {
        checkWeightBand('ASSET_CLASS_MIN_WEIGHT', 'class.min', cls, band, errors);
        checkWeightBand('ASSET_CLASS_MAX_WEIGHT', 'class.max', cls, band, errors);
      }
    }
    if (constraints.factorBands) {
      for (const [key, band] of Object.entries(constraints.factorBands)) {
        checkWeightBand('FACTOR_MIN_EXPOSURE', 'factor.min', key, band, errors);
        checkWeightBand('FACTOR_MAX_EXPOSURE', 'factor.max', key, band, errors);
      }
    }
    if (constraints.benchmarkMaxDeviation) {
      if (constraints.benchmarkMaxDeviation.max !== undefined && !isFiniteNum(constraints.benchmarkMaxDeviation.max)) {
        errors.push(bandViolation('BENCHMARK_MAX_DEVIATION', 'benchmark.maxdev', 'benchmark.maxdev must be a finite number'));
      }
    }

    if (constraints.cashFloor !== undefined) {
      if (!isFiniteNum(constraints.cashFloor) || constraints.cashFloor < 0 || constraints.cashFloor > 1) {
        errors.push(bandViolation('CASH_FLOOR', 'cash.floor', 'cashFloor must be a finite number in [0,1]'));
      }
    }
    if (constraints.leverageCap !== undefined) {
      if (!isFiniteNum(constraints.leverageCap) || constraints.leverageCap <= 0) {
        errors.push(bandViolation('LEVERAGE_CAP', 'leverage.cap', 'leverageCap must be a finite number > 0'));
      }
    }
    if (constraints.marginCoverageFloor !== undefined) {
      if (!isFiniteNum(constraints.marginCoverageFloor) || constraints.marginCoverageFloor < 0 || constraints.marginCoverageFloor > 1) {
        errors.push(bandViolation('MARGIN_COVERAGE_FLOOR', 'margin.floor', 'marginCoverageFloor must be in [0,1]'));
      }
    }
    if (constraints.derivativeNotionalCap !== undefined) {
      if (!isFiniteNum(constraints.derivativeNotionalCap) || constraints.derivativeNotionalCap < 0) {
        errors.push(bandViolation('DERIVATIVE_NOTIONAL_CAP', 'derivative.cap', 'derivativeNotionalCap must be a finite number >= 0'));
      }
    }
    if (constraints.turnoverCap !== undefined) {
      if (!isFiniteNum(constraints.turnoverCap) || constraints.turnoverCap < 0 || constraints.turnoverCap > 1) {
        errors.push(bandViolation('TURNOVER_CAP', 'turnover.cap', 'turnoverCap must be in [0,1]'));
      }
    }
    if (constraints.costBudgetVnd !== undefined) {
      if (!isFiniteNum(constraints.costBudgetVnd) || constraints.costBudgetVnd < 0) {
        errors.push(bandViolation('COST_BUDGET', 'cost.budget', 'costBudgetVnd must be a finite number >= 0'));
      }
    }

    // Algebraic contradiction detection, before any solver runs.
    const { lo, hi } = readPerAssetBounds(constraints);
    let sumMin = 0;
    let sumMax = 0;
    for (const s of symbols) {
      sumMin += lo[s] ?? 0;
      sumMax += hi[s] ?? 1;
    }
    if (sumMin > 1 + 1e-6) {
      errors.push(
        bandViolation(
          'ASSET_MIN_WEIGHT',
          'conflict.min-sum',
          `sum of per-asset minima exceeds 1 (${sumMin.toFixed(4)}): no portfolio can satisfy all floors simultaneously (e.g. cash-floor + full-investment)` 
        )
      );
    }
    if (sumMax < 1 - 1e-6) {
      errors.push(
        bandViolation(
          'ASSET_MAX_WEIGHT',
          'conflict.max-sum',
          `sum of per-asset maxima is below 1 (${sumMax.toFixed(4)}): the feasible set is empty`
        )
      );
    }

    return errors;
  }

  /** Mark constraints whose required data is absent. Builder fails closed on any. */
  static unevaluatedConstraints(
    input: RebalancingInput,
    constraints: RebalancingConstraints | undefined
  ): readonly UnevaluatedConstraint[] {
    if (!constraints) return [];
    const out: UnevaluatedConstraint[] = [];
    const isCash = (sym: string) => sym === 'CASH';

    const factorKeys = constraints.factorBands ? Object.keys(constraints.factorBands) : [];
    for (const key of factorKeys) {
      const missingSymbols: string[] = [];
      for (const sym of Object.keys(input.currentWeights)) {
        if (isCash(sym)) continue;
        const score = input.factorScores?.[sym]?.[key as keyof NonNullable<RebalancingInput['factorScores']>[string]];
        if (typeof score !== 'number' || !Number.isFinite(score)) missingSymbols.push(sym);
      }
      for (const sym of missingSymbols) {
        out.push({
          constraintId: `factor.${key}`,
          kind: 'FACTOR_MAX_EXPOSURE',
          reason: `factor '${key}' score missing for ${sym} — no imputation is performed`,
        });
      }
    }

    if (constraints.sectorBands && !input.sectorMap) {
      out.push({
        constraintId: 'sector.bands',
        kind: 'SECTOR_MAX_WEIGHT',
        reason: 'sector bands require a sectorMap, which is not supplied',
      });
    }

    if (constraints.assetClassBands && !input.assetClassMap) {
      out.push({
        constraintId: 'class.bands',
        kind: 'ASSET_CLASS_MAX_WEIGHT',
        reason: 'asset-class bands require an assetClassMap, which is not supplied',
      });
    }

    if (constraints.benchmarkMaxDeviation) {
      out.push({
        constraintId: 'benchmark.maxdev',
        kind: 'BENCHMARK_MAX_DEVIATION',
        reason: 'no in-repo provider supplies explicit benchmark weights; the lane refuses to synthesize an index',
      });
    }

    if (constraints.marginCoverageFloor !== undefined && (input.marginCoverage === null || input.marginCoverage === undefined)) {
      out.push({
        constraintId: 'margin.floor',
        kind: 'MARGIN_COVERAGE_FLOOR',
        reason: 'marginCoverageFloor requires a caller-supplied margin coverage ratio',
      });
    }

    if (constraints.derivativeNotionalCap !== undefined && (input.derivativeNotional === null || input.derivativeNotional === undefined)) {
      out.push({
        constraintId: 'derivative.cap',
        kind: 'DERIVATIVE_NOTIONAL_CAP',
        reason: 'derivativeNotionalCap requires a caller-supplied derivative notional fraction',
      });
    }

    return out;
  }

  /**
   * Evaluate a candidate weight vector against aggregate bands. Sector/class
   * weights derive from the maps; factor exposure is Σ w·score. Returns the
   * violated constraints with exact deltas — never silently clips them.
   */
  static evaluateConstraints(
    input: RebalancingInput,
    weights: Readonly<Record<string, number>>,
    constraints: RebalancingConstraints | undefined
  ): readonly ConstraintViolation[] {
    if (!constraints) return [];
    const violations: ConstraintViolation[] = [];

    const add = (kind: ConstraintKind, constraintId: string, detail: string) => {
      violations.push(bandViolation(kind, constraintId, detail));
    };

    const aggregate = (reduce: (sym: string) => number): number =>
      Object.entries(weights).reduce((acc, [sym, w]) => acc + w * reduce(sym), 0);

    if (constraints.sectorBands && input.sectorMap) {
      const perSector = Object.entries(weights).reduce((acc, [sym, w]) => {
        if (sym === 'CASH') return acc;
        const sector = input.sectorMap[sym];
        if (!sector) return acc;
        acc[sector] = (acc[sector] ?? 0) + w;
        return acc;
      }, {} as Record<string, number>);
      for (const [id, band] of Object.entries(constraints.sectorBands)) {
        const w = perSector[id] ?? 0;
        if (band.min !== undefined && w + TOL < band.min) {
          add('SECTOR_MIN_WEIGHT', `sector.min.${id}`, `sector ${id} weight ${w.toFixed(4)} < floor ${band.min}`);
        }
        if (band.max !== undefined && w - TOL > band.max) {
          add('SECTOR_MAX_WEIGHT', `sector.max.${id}`, `sector ${id} weight ${w.toFixed(4)} > cap ${band.max}`);
        }
      }
    }

    if (constraints.assetClassBands && input.assetClassMap) {
      const perClass = Object.entries(weights).reduce((acc, [sym, w]) => {
        const cls = sym === 'CASH' ? 'CASH' : (input.assetClassMap[sym] ?? 'CASH');
        acc[cls] = (acc[cls] ?? 0) + w;
        return acc;
      }, {} as Record<string, number>);
      for (const [cls, band] of Object.entries(constraints.assetClassBands) as Array<
        [string, { readonly min?: number; readonly max?: number }]
      >) {
        const w = perClass[cls] ?? 0;
        if (band.min !== undefined && w + TOL < band.min) {
          add('ASSET_CLASS_MIN_WEIGHT', `class.min.${cls}`, `asset-class ${cls} weight ${w.toFixed(4)} < floor ${band.min}`);
        }
        if (band.max !== undefined && w - TOL > band.max) {
          add('ASSET_CLASS_MAX_WEIGHT', `class.max.${cls}`, `asset-class ${cls} weight ${w.toFixed(4)} > cap ${band.max}`);
        }
      }
    }

    if (constraints.factorBands && input.factorScores) {
      for (const [key, band] of Object.entries(constraints.factorBands)) {
        const exposure = aggregate((sym) => {
          if (sym === 'CASH') return 0;
          const score = input.factorScores[sym]?.[key as keyof NonNullable<RebalancingInput['factorScores']>[string]];
          return typeof score === 'number' && Number.isFinite(score) ? score : 0;
        });
        if (band.min !== undefined && exposure + TOL < band.min) {
          add('FACTOR_MIN_EXPOSURE', `factor.min.${key}`, `factor '${key}' exposure ${exposure.toFixed(4)} < floor ${band.min}`);
        }
        if (band.max !== undefined && exposure - TOL > band.max) {
          add('FACTOR_MAX_EXPOSURE', `factor.max.${key}`, `factor '${key}' exposure ${exposure.toFixed(4)} > cap ${band.max}`);
        }
      }
    }

    if (constraints.leverageCap !== undefined) {
      const gross = aggregate((sym) => (sym === 'CASH' ? 0 : 1));
      if (gross - TOL > constraints.leverageCap) {
        add('LEVERAGE_CAP', 'leverage.cap', `gross exposure ${gross.toFixed(4)} exceeds leverage cap ${constraints.leverageCap}`);
      }
    }

    if (constraints.marginCoverageFloor !== undefined && input.marginCoverage !== null && input.marginCoverage !== undefined) {
      if (input.marginCoverage + TOL < constraints.marginCoverageFloor) {
        add('MARGIN_COVERAGE_FLOOR', 'margin.floor', `margin coverage ${input.marginCoverage} < floor ${constraints.marginCoverageFloor}`);
      }
    }

    if (constraints.derivativeNotionalCap !== undefined && input.derivativeNotional !== null && input.derivativeNotional !== undefined) {
      if (input.derivativeNotional - TOL > constraints.derivativeNotionalCap) {
        add('DERIVATIVE_NOTIONAL_CAP', 'derivative.cap', `derivative notional ${input.derivativeNotional} exceeds cap ${constraints.derivativeNotionalCap}`);
      }
    }

    return violations;
  }
}