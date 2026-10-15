/**
 * PHASE 30 — CONSTRAINED ALLOCATOR (pure, deterministic)
 * =======================================================
 * Projects a Phase 28 reference allocation onto the bounded simplex defined by
 * per-asset weight bands + cash floor. Deterministic bounded-simplex projection:
 * alternating clip (box) and renormalize (simplex) until a point that satisfies
 * BOTH is reached. Fixed iteration cap and tolerance; non-convergence at the cap
 * is reported as NON_CONVERGED → INFEASIBLE (never a silently-clipped guess).
 *
 * Projection enforces per-asset bands only. Aggregate bands (sector / class /
 * factor / leverage) are enforced afterwards by ConstraintEngine.evaluateConstraints
 * and reported as INFEASIBLE with exact reasons — they are never silently clipped.
 */

import type { RebalancingConstraints } from './types.ts';
import { readPerAssetBounds } from './ConstraintEngine.ts';

export interface ProjectInput {
  /** Reference (unconstrained) weights over UPPER symbols, incl. CASH. */
  readonly referenceWeights: Readonly<Record<string, number>>;
  readonly constraints?: RebalancingConstraints;
  readonly tolerance?: number;
  readonly maxIterations?: number;
  readonly maxSymbols?: number;
}

export type ProjectionResult =
  | { readonly ok: true; readonly weights: Readonly<Record<string, number>>; readonly iterations: number }
  | { readonly ok: false; readonly reason: 'EMPTY_FEASIBLE' | 'NON_CONVERGED' | 'INVALID_INPUT'; readonly detail: string };

const DEFAULT_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITERATIONS = 1000;
const MAX_SYMBOLS_GUARD = 1000;

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

export class ConstrainedAllocator {
  static project(input: ProjectInput): ProjectionResult {
    const symbols = Object.keys(input.referenceWeights);
    if (symbols.length === 0) {
      return { ok: false, reason: 'INVALID_INPUT', detail: 'referenceWeights is empty' };
    }
    if (symbols.length > MAX_SYMBOLS_GUARD) {
      return {
        ok: false,
        reason: 'INVALID_INPUT',
        detail: `symbol count ${symbols.length} exceeds the ${MAX_SYMBOLS_GUARD} N×N guard`,
      };
    }
    for (const s of symbols) {
      if (!isFiniteNonNegative(input.referenceWeights[s])) {
        return { ok: false, reason: 'INVALID_INPUT', detail: `reference weight for ${s} is not a finite number ≥ 0` };
      }
    }

    const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
    const maxIterations = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    const { lo, hi } = readPerAssetBounds(input.constraints);
    const loArr = symbols.map((s) => lo[s] ?? 0);
    const hiArr = symbols.map((s) => hi[s] ?? 1);

    // Empty feasible set detection: max sum below 1, or every cap at 0.
    const sumMax = hiArr.reduce((a, b) => a + b, 0);
    if (sumMax < 1 - tolerance) {
      return { ok: false, reason: 'EMPTY_FEASIBLE', detail: `sum of per-asset maxima (${sumMax.toFixed(4)}) below 1` };
    }
    if (hiArr.every((h) => h <= 0)) {
      return { ok: false, reason: 'EMPTY_FEASIBLE', detail: 'every per-asset maximum is 0' };
    }

    // Deterministic seed: clip negatives, else equal weight over positive caps.
    let w = symbols.map((s) => Math.max(input.referenceWeights[s], 0));
    const refSum = w.reduce((a, b) => a + b, 0);
    if (!(refSum > 0)) {
      w = symbols.map((_, i) => (hiArr[i] > 0 ? 1 : 0));
    }

    const clamp = (x: number, loB: number, hiB: number): number => {
      if (!Number.isFinite(x)) return loB;
      return Math.min(Math.max(x, loB), hiB);
    };

    let converged = false;
    let iterations = 0;
    for (iterations = 0; iterations < maxIterations; iterations++) {
      // Box projection.
      let boxed = w.map((x, i) => clamp(x, loArr[i], hiArr[i]));
      const s = boxed.reduce((a, b) => a + b, 0);
      if (!(s > 0)) {
        return { ok: false, reason: 'EMPTY_FEASIBLE', detail: 'projection collapsed to zero weight' };
      }
      // Simplex projection.
      boxed = boxed.map((x) => x / s);

      // Feasibility check (both box and simplex within tolerance).
      const inBox = boxed.every((x, i) => x >= loArr[i] - tolerance && x <= hiArr[i] + tolerance);
      const sumsToOne = Math.abs(boxed.reduce((a, b) => a + b, 0) - 1) <= tolerance;
      if (inBox && sumsToOne) {
        w = boxed;
        converged = true;
        break;
      }
      const maxMove = boxed.reduce((a, x, i) => Math.max(a, Math.abs(x - w[i])), 0);
      w = boxed;
      if (maxMove <= tolerance) {
        // No further movement but still infeasible borders → empty in practice.
        return {
          ok: false,
          reason: 'EMPTY_FEASIBLE',
          detail: 'projection stopped moving without reaching a feasible point',
        };
      }
    }

    if (!converged) {
      return {
        ok: false,
        reason: 'NON_CONVERGED',
        detail: `projection did not converge within ${maxIterations} iterations (tolerance ${tolerance})`,
      };
    }

    const weights: Record<string, number> = {};
    symbols.forEach((s, i) => {
      weights[s] = w[i];
    });
    return { ok: true, weights, iterations };
  }
}