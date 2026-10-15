/**
 * PHASE 28 — FACTOR EXPOSURE ENGINE (pure, deterministic)
 * Value-weighted aggregation of explicit per-symbol factor vectors. No imputation.
 */

import type { FactorExposureReport, FactorKey, FactorVector } from './types.ts';

export interface FactorInput {
  readonly weights: Readonly<Record<string, number>>;
  readonly factorsBySymbol: Readonly<Record<string, FactorVector>>;
}

const KEYS: FactorKey[] = ['value', 'quality', 'momentum', 'growth', 'size', 'lowVol'];

export class FactorExposureEngine {
  static compute(input: FactorInput): FactorExposureReport | null {
    const symbols = Object.keys(input.weights ?? {}).filter((s) => (input.weights[s] ?? 0) > 0);
    if (symbols.length === 0) return null;
    const total = symbols.reduce((a, s) => a + (input.weights[s] ?? 0), 0);
    if (!(total > 0)) return null;

    let covered = 0;
    const uncovered: string[] = [];
    const acc: Record<FactorKey, number> = {
      value: 0,
      quality: 0,
      momentum: 0,
      growth: 0,
      size: 0,
      lowVol: 0,
    };
    const covW: Record<FactorKey, number> = { ...acc };

    for (const s of symbols) {
      const key = s.trim().toUpperCase();
      const w = (input.weights[s] ?? 0) / total;
      const fv = input.factorsBySymbol[key] ?? input.factorsBySymbol[s];
      if (!fv) {
        uncovered.push(key);
        continue;
      }
      let hasAny = false;
      for (const k of KEYS) {
        const v = fv[k];
        if (typeof v === 'number' && Number.isFinite(v)) {
          acc[k] += w * v;
          covW[k] += w;
          hasAny = true;
        }
      }
      if (hasAny) covered += w;
      else uncovered.push(key);
    }

    if (covered <= 0) {
      return {
        exposure: { value: null, quality: null, momentum: null, growth: null, size: null, lowVol: null },
        coverage: 0,
        uncoveredSymbols: [...new Set(uncovered)].sort(),
      };
    }
    const exposure: Record<FactorKey, number | null> = {
      value: null,
      quality: null,
      momentum: null,
      growth: null,
      size: null,
      lowVol: null,
    };
    // Renormalize each factor over its own covered weight (documented partial-coverage semantics).
    for (const k of KEYS) {
      exposure[k] = covW[k] > 0 ? acc[k] / covW[k] : null;
    }
    return {
      exposure,
      coverage: covered,
      uncoveredSymbols: [...new Set(uncovered)].sort(),
    };
  }
}
