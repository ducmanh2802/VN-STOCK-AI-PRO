/**
 * PHASE 28 — CONCENTRATION ENGINE (pure, deterministic)
 * max-position / top-N / sector / asset-class / HHI + limit enforcement.
 */

import type {
  ConcentrationReport,
  ExposureBreakdown,
  PortfolioAssetClass,
  PortfolioPolicy,
} from './types.ts';
import { DEFAULT_PORTFOLIO_POLICY } from './types.ts';

export interface ConcentrationInput {
  readonly exposure: ExposureBreakdown;
  readonly policy?: PortfolioPolicy;
}

export class ConcentrationEngine {
  static compute(input: ConcentrationInput): ConcentrationReport | null {
    const exp = input.exposure;
    if (!exp) return null;
    const weights = exp.weights ?? {};
    const symbols = Object.keys(weights);
    if (symbols.length === 0) {
      return {
        maxPositionPercent: 0,
        maxPositionSymbol: null,
        topNPercent: 0,
        topNSymbols: [],
        maxSectorPercent: 0,
        maxSectorId: null,
        maxAssetClassPercent: 0,
        maxAssetClass: null,
        hhi: 0,
        breaches: [],
        withinLimits: true,
      };
    }
    const policy = { ...DEFAULT_PORTFOLIO_POLICY, ...(input.policy ?? {}) };
    const topN = Math.max(1, Math.floor(policy.topN ?? 3));

    let maxSym: string | null = null;
    let maxPct = 0;
    for (const s of symbols) {
      const pct = weights[s] * 100;
      if (pct > maxPct) {
        maxPct = pct;
        maxSym = s;
      }
    }
    const ranked = [...symbols].sort((a, b) => weights[b] - weights[a]);
    const topSymbols = ranked.slice(0, topN);
    const topPct = topSymbols.reduce((a, s) => a + weights[s] * 100, 0);

    let maxSector: string | null = null;
    let maxSectorPct = 0;
    for (const [k, v] of Object.entries(exp.sectorExposure ?? {})) {
      if (v > maxSectorPct) {
        maxSectorPct = v;
        maxSector = k;
      }
    }
    let maxClass: PortfolioAssetClass | null = null;
    let maxClassPct = 0;
    for (const [k, v] of Object.entries(exp.assetClassExposure ?? {})) {
      if ((v as number) > maxClassPct) {
        maxClassPct = v as number;
        maxClass = k as PortfolioAssetClass;
      }
    }
    let hhi = 0;
    for (const s of symbols) hhi += Math.pow(weights[s] * 100, 2);

    const breaches: string[] = [];
    if (maxPct > (policy.maxPositionPercent ?? 20)) {
      breaches.push(
        `MAX_POSITION: ${maxSym} ${maxPct.toFixed(2)}% exceeds ${policy.maxPositionPercent}%`
      );
    }
    if (maxSectorPct > (policy.maxSectorPercent ?? 30)) {
      breaches.push(
        `SECTOR_CONCENTRATION: ${maxSector} ${maxSectorPct.toFixed(2)}% exceeds ${policy.maxSectorPercent}%`
      );
    }
    const classLimits = policy.maxAssetClassPercent;
    if (classLimits && maxClass) {
      const limit = classLimits[maxClass];
      if (typeof limit === 'number' && Number.isFinite(limit) && maxClassPct > limit) {
        breaches.push(`ASSET_CLASS_CONCENTRATION: ${maxClass} ${maxClassPct.toFixed(2)}% exceeds ${limit}%`);
      }
    }

    return {
      maxPositionPercent: maxPct,
      maxPositionSymbol: maxSym,
      topNPercent: topPct,
      topNSymbols: topSymbols,
      maxSectorPercent: maxSectorPct,
      maxSectorId: maxSector,
      maxAssetClassPercent: maxClassPct,
      maxAssetClass: maxClass,
      hhi,
      breaches,
      withinLimits: breaches.length === 0,
    };
  }
}
