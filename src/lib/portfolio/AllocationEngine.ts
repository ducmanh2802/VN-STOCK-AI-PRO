/**
 * PHASE 28 — ALLOCATION ENGINE (pure, deterministic)
 * Long-only optimizers with documented fallbacks. No randomness, no I/O.
 */

import type { AllocationMethod, AllocationResult } from './types.ts';

export interface AllocationInput {
  readonly symbols: readonly string[];
  /** Annualized or daily vols keyed by UPPER symbol (any consistent basis). */
  readonly volatilities?: Readonly<Record<string, number | null>>;
  readonly covariance?: ReadonlyArray<ReadonlyArray<number>>;
  /** Reference weights for Black-Litterman-lite blending (defaults to inverse-vol). */
  readonly referenceWeights?: Readonly<Record<string, number>>;
  /** View weights (optional); tau in [0,1] blends ref -> view. */
  readonly viewWeights?: Readonly<Record<string, number>>;
  readonly tau?: number;
}

function normalize(w: Record<string, number>, symbols: readonly string[]): Record<string, number> {
  const sum = symbols.reduce((a, s) => a + (w[s] ?? 0), 0);
  if (!(sum > 0)) {
    const eq = 1 / symbols.length;
    return Object.fromEntries(symbols.map((s) => [s, eq]));
  }
  return Object.fromEntries(symbols.map((s) => [s, (w[s] ?? 0) / sum]));
}

function invertMatrix(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col];
    for (let j = 0; j < 2 * n; j++) m[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((row) => row.slice(n));
}

export class AllocationEngine {
  static equalWeight(symbols: readonly string[]): AllocationResult {
    if (symbols.length === 0) throw new Error('AllocationEngine: empty symbol set');
    const w = 1 / symbols.length;
    return {
      method: 'EQUAL_WEIGHT',
      weights: Object.fromEntries(symbols.map((s) => [s, w])),
      fallbackUsed: false,
      notes: ['Equal-weight baseline; no estimation.'],
    };
  }

  static inverseVolatility(input: AllocationInput): AllocationResult {
    const syms = [...input.symbols];
    const inv: Record<string, number> = {};
    let ok = true;
    for (const s of syms) {
      const v = input.volatilities?.[s] ?? null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        ok = false;
        break;
      }
      inv[s] = 1 / v;
    }
    if (!ok) {
      const eq = AllocationEngine.equalWeight(syms);
      return { ...eq, method: 'INVERSE_VOLATILITY', fallbackUsed: true, notes: ['Volatility missing/non-positive — fell back to equal weight.'] };
    }
    return { method: 'INVERSE_VOLATILITY', weights: normalize(inv, syms), fallbackUsed: false, notes: ['Inverse-volatility; lower-vol assets receive higher weight.'] };
  }

  static minVariance(input: AllocationInput): AllocationResult {
    const syms = [...input.symbols];
    const n = syms.length;
    const cov = input.covariance;
    if (!cov || cov.length !== n || cov.some((r) => r.length !== n)) {
      const iv = AllocationEngine.inverseVolatility(input);
      return { ...iv, method: 'MIN_VARIANCE', fallbackUsed: true, notes: [...iv.notes, 'Covariance unavailable — min-variance fell back to inverse-volatility.'] };
    }
    // Ridge guard for near-singular matrices.
    const lambda = 1e-6;
    const guarded = cov.map((row, i) => row.map((v, j) => (i === j ? v + lambda : v)));
    const inv = invertMatrix(guarded.map((r) => [...r]));
    if (!inv) {
      const iv = AllocationEngine.inverseVolatility(input);
      return { ...iv, method: 'MIN_VARIANCE', fallbackUsed: true, notes: [...iv.notes, 'Covariance singular — fell back to inverse-volatility.'] };
    }
    const ones = new Array<number>(n).fill(1);
    const raw = inv.map((row) => row.reduce((a, v, j) => a + v * ones[j], 0));
    // Long-only: clip negatives then renormalize; flag if clipping occurred.
    let clipped = false;
    const clippedW = raw.map((v) => {
      if (!Number.isFinite(v) || v < 0) {
        clipped = true;
        return 0;
      }
      return v;
    });
    const sum = clippedW.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) {
      const iv = AllocationEngine.inverseVolatility(input);
      return { ...iv, method: 'MIN_VARIANCE', fallbackUsed: true, notes: [...iv.notes, 'Min-variance degenerate — fell back to inverse-volatility.'] };
    }
    const weights: Record<string, number> = {};
    syms.forEach((s, i) => {
      weights[s] = clippedW[i] / sum;
    });
    return {
      method: 'MIN_VARIANCE',
      weights,
      fallbackUsed: clipped,
      notes: clipped
        ? ['Closed-form min-variance with ridge 1e-6; negative weights clipped to 0 (long-only).']
        : ['Closed-form min-variance with ridge 1e-6 (long-only, no clipping needed).'],
    };
  }

  static blackLittermanLite(input: AllocationInput): AllocationResult {
    const syms = [...input.symbols];
    const tauRaw = input.tau ?? 0.5;
    const tau = Number.isFinite(tauRaw) ? Math.max(0, Math.min(1, tauRaw)) : 0.5;
    const ref = input.referenceWeights ?? AllocationEngine.inverseVolatility(input).weights;
    const view = input.viewWeights ?? null;
    if (!view) {
      const w = normalize({ ...ref }, syms);
      return { method: 'BLACK_LITTERMAN_LITE', weights: w, fallbackUsed: true, notes: ['No views supplied — returns reference (inverse-volatility) weights.'] };
    }
    const blended: Record<string, number> = {};
    for (const s of syms) blended[s] = (1 - tau) * (ref[s] ?? 0) + tau * (view[s] ?? 0);
    return {
      method: 'BLACK_LITTERMAN_LITE',
      weights: normalize(blended, syms),
      fallbackUsed: false,
      notes: [`View-blended reference with tau=${tau}; weights renormalized to sum 1 (long-only input assumed).`],
    };
  }

  static all(input: AllocationInput): Record<AllocationMethod, AllocationResult> {
    const ref = AllocationEngine.inverseVolatility(input);
    return {
      EQUAL_WEIGHT: AllocationEngine.equalWeight(input.symbols),
      INVERSE_VOLATILITY: ref,
      MIN_VARIANCE: AllocationEngine.minVariance(input),
      BLACK_LITTERMAN_LITE: AllocationEngine.blackLittermanLite({
        ...input,
        referenceWeights: ref.weights,
      }),
    };
  }
}
