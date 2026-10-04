/**
 * PHASE 28 — PORTFOLIO EXPOSURE ENGINE (pure, deterministic)
 * Computes weights, sector exposure, asset-class exposure. No I/O, no clock.
 */

import type {
  ExposureBreakdown,
  PortfolioAssetClass,
  PortfolioPositionInput,
} from './types.ts';

export interface ExposureInput {
  readonly positions: readonly PortfolioPositionInput[];
  readonly cashValue?: number | null;
  readonly asOfDate: string;
}

function finite(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function normSym(s: string): string {
  return (s || '').trim().toUpperCase();
}

export class PortfolioExposureEngine {
  static compute(input: ExposureInput): {
    breakdown: ExposureBreakdown | null;
    invalid: boolean;
  } {
    const positions = input.positions ?? [];
    // Validate: negative quantities invalid; NaN prices invalid.
    for (const p of positions) {
      if (typeof p.quantity !== 'number' || !Number.isFinite(p.quantity) || p.quantity < 0) {
        return { breakdown: null, invalid: true };
      }
      if (p.markPrice !== null && p.markPrice !== undefined) {
        const mp = finite(p.markPrice);
        if (mp === null || mp < 0) return { breakdown: null, invalid: true };
      }
    }
    const cashRaw = input.cashValue ?? null;
    const cash = cashRaw === undefined ? null : cashRaw;
    if (cash !== null && (typeof cash !== 'number' || !Number.isFinite(cash) || cash < 0)) {
      return { breakdown: null, invalid: true };
    }

    const marketValues = new Map<string, number>();
    const sectorValues = new Map<string, number>();
    const classValues: Record<PortfolioAssetClass, number> = {
      EQUITY: 0,
      ETF: 0,
      DERIVATIVE: 0,
      CASH: 0,
    };
    let total = 0;
    let unmapped = 0;

    for (const p of positions) {
      const sym = normSym(p.symbol);
      if (!sym) return { breakdown: null, invalid: true };
      // Derivatives carry notional semantics handled in Phase 29; here count only
      // explicit markPrice-based value. Missing price => zero contributory value but
      // tracked via unmapped weight only when total > 0 and price missing.
      const price = p.markPrice ?? null;
      const mv = price !== null ? p.quantity * price : 0;
      if (p.assetClass === 'CASH') {
        classValues.CASH += p.quantity; // cash quantity IS vnd value
        total += p.quantity;
        marketValues.set(sym, (marketValues.get(sym) ?? 0) + p.quantity);
        continue;
      }
      marketValues.set(sym, (marketValues.get(sym) ?? 0) + mv);
      classValues[p.assetClass] += mv;
      total += mv;
      if (price === null && p.quantity > 0) unmapped += 0; // weight unknown; flagged by caller via freshness
      const sector = (p.sectorId ?? '').trim().toLowerCase();
      if (sector) sectorValues.set(sector, (sectorValues.get(sector) ?? 0) + mv);
      else if (mv > 0) unmapped += mv;
    }

    if (cash !== null && cash > 0) {
      total += cash;
      classValues.CASH += cash;
    }

    if (!(total > 0)) {
      return {
        breakdown: {
          totalMarketValue: 0,
          cashValue: cash ?? 0,
          weights: {},
          sectorExposure: {},
          assetClassExposure: { ...classValues },
          unmappedWeight: 0,
        },
        invalid: false,
      };
    }

    const weights: Record<string, number> = {};
    for (const [s, v] of marketValues) weights[s] = v / total;
    const sectorExposure: Record<string, number> = {};
    for (const [s, v] of sectorValues) sectorExposure[s] = (v / total) * 100;
    const assetClassExposure: Record<PortfolioAssetClass, number> = {
      EQUITY: (classValues.EQUITY / total) * 100,
      ETF: (classValues.ETF / total) * 100,
      DERIVATIVE: (classValues.DERIVATIVE / total) * 100,
      CASH: (classValues.CASH / total) * 100,
    };
    return {
      breakdown: {
        totalMarketValue: total,
        cashValue: (cash ?? 0) + (classValues.CASH - (cash ?? 0)),
        weights,
        sectorExposure,
        assetClassExposure,
        unmappedWeight: (unmapped / total) * 100,
      },
      invalid: false,
    };
  }
}
