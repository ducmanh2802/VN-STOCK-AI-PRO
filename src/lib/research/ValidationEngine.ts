/**
 * RESEARCH-04 — WALK-FORWARD / ROBUSTNESS / VALIDATION
 * ======================================================
 * Explicit TRAIN/VALIDATION/TEST (never mixed silently), walk-forward
 * windows + step roll, parameter-sensitivity grid, regime segmentation via
 * caller-supplied labels (never fabricated), IN/OUT/WALK_FORWARD labeling,
 * seeded determinism.
 */
import type { SampleKind, WalkForwardWindow } from './types.ts';

export interface SplitInput {
  readonly dates: readonly string[];
  readonly trainRatio?: number;
  readonly validationRatio?: number;
}

export class ValidationEngine {
  static split(dates: readonly string[], trainRatio = 0.6, validationRatio = 0.2): {
    readonly train: readonly string[];
    readonly validation: readonly string[];
    readonly test: readonly string[];
  } {
    if (dates.length === 0) throw new Error('EMPTY_DATES');
    const n = dates.length;
    const t = Math.floor(n * trainRatio);
    const v = Math.floor(n * validationRatio);
    const train = dates.slice(0, t);
    const validation = dates.slice(t, t + v);
    const test = dates.slice(t + v);
    if (train[train.length - 1] >= validation[0] || validation[validation.length - 1] >= test[0]) {
      throw new Error('OVERLAP_DETECTED');
    }
    return { train, validation, test };
  }

  static walkForward(dates: readonly string[], trainBars: number, validationBars: number, testBars: number, step: number): readonly WalkForwardWindow[] {
    const out: WalkForwardWindow[] = [];
    let start = 0;
    while (start + trainBars + validationBars + testBars <= dates.length) {
      out.push({
        trainStart: dates[start],
        trainEnd: dates[start + trainBars - 1],
        validationStart: dates[start + trainBars],
        validationEnd: dates[start + trainBars + validationBars - 1],
        testStart: dates[start + trainBars + validationBars],
        testEnd: dates[start + trainBars + validationBars + testBars - 1],
      });
      start += step;
    }
    if (out.length === 0) throw new Error('INSUFFICIENT_BARS');
    return out;
  }

  static label(kind: SampleKind): SampleKind {
    return kind;
  }

  static sensitivity(values: readonly number[]): { readonly min: number; readonly max: number; readonly spreadPct: number; readonly stable: boolean } {
    if (values.length === 0) throw new Error('EMPTY_VALUES');
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spreadPct = min === 0 ? (max === 0 ? 0 : Infinity) : ((max - min) / Math.abs(min)) * 100;
    return { min, max, spreadPct, stable: spreadPct <= 25 };
  }

  static byRegime<T>(labels: Readonly<Record<string, string>>, keys: readonly string[], value: (k: string) => T): Readonly<Record<string, T[]>> {
    const out: Record<string, T[]> = {};
    for (const k of keys) {
      const r = labels[k] ?? 'UNKNOWN';
      (out[r] ??= []).push(value(k));
    }
    return out;
  }

  static seededShuffle<T>(items: readonly T[], seed: number): readonly T[] {
    let s = seed >>> 0;
    const next = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
