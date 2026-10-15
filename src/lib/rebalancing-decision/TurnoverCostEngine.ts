/**
 * PHASE 30 — TURNOVER & TRANSACTION-COST ENGINE (pure, deterministic)
 * ====================================================================
 * Turnover = Σ|w_new − w_current| / 2 (one-sided; long-only). Cost is a strict
 * LOWER BOUND derived from the canonical repo cost truth DEFAULT_TRADING_COST_CONFIG
 * (buyFee 0.15% + sellFee 0.15% + sellTax 0.10% + slippage 0.10%) applied on
 * turnover notional, rounded to integer VND (Math.round) to match paper/replay
 * conservation. Lot-100 / contract truncation reuses VietnamLotRule math.
 *
 * No spread/impact curves are ever invented. A missing cost config or missing
 * total value ⇒ INSUFFICIENT_DATA — zero cost is NEVER silently assumed.
 */

import { VietnamLotRule } from '../trading/risk/VietnamLotRule.ts';
import type { ExecutionStep, TurnoverCostBreakdown } from './types.ts';

export interface CostInput {
  readonly currentWeights: Readonly<Record<string, number>>;
  readonly newWeights: Readonly<Record<string, number>>;
  /** Total portfolio value in VND; null ⇒ cost cannot be estimated. */
  readonly totalValueVnd: number | null;
  /** Canonical cost truth; absent ⇒ INSUFFICIENT_DATA (never zero-cost). */
  readonly costConfig?:
    | {
        readonly buyFeeRate: number;
        readonly sellFeeRate: number;
        readonly sellTaxRate: number;
        readonly slippageRate: number;
      }
    | null;
  readonly markPrices?: Readonly<Record<string, number | null>>;
  readonly lotSize?: number;
}

export type CostResult = { readonly ok: true; readonly breakdown: TurnoverCostBreakdown } | {
  readonly ok: false;
  readonly status: 'INSUFFICIENT_DATA';
  readonly detail: string;
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export class TurnoverCostEngine {
  /** One-sided turnover Σ|Δw|/2 between current and target weights. */
  static turnover(current: Readonly<Record<string, number>>, next: Readonly<Record<string, number>>): number {
    const symbols = new Set([...Object.keys(current), ...Object.keys(next)]);
    let half = 0;
    for (const s of symbols) {
      half += Math.abs((next[s] ?? 0) - (current[s] ?? 0));
    }
    return half / 2;
  }

  /**
   * Lower-bound cost estimate. Fees are one-sided (buy fee on buys, sell fee +
   * tax on sells); slippage applies to both directions. Each component is
   * Math.round'ed to integer VND (paper/replay conservation convention).
   */
  static lowerBoundCost(input: CostInput): CostResult {
    if (!isFiniteNum(input.totalValueVnd) || input.totalValueVnd <= 0) {
      return { ok: false, status: 'INSUFFICIENT_DATA', detail: 'totalValueVnd is required to estimate cost' };
    }
    if (!input.costConfig) {
      return { ok: false, status: 'INSUFFICIENT_DATA', detail: 'costConfig is missing; zero cost is never assumed' };
    }
    const cfg = input.costConfig;
    const symbols = new Set([...Object.keys(input.currentWeights), ...Object.keys(input.newWeights)]);
    let buyFees = 0;
    let sellFees = 0;
    let sellTax = 0;
    let slippage = 0;
    for (const s of symbols) {
      const delta = ((input.newWeights[s] ?? 0) - (input.currentWeights[s] ?? 0)) * input.totalValueVnd;
      const buyVtx = Math.max(delta, 0);
      const sellVtx = Math.max(-delta, 0);
      buyFees += buyVtx * cfg.buyFeeRate;
      sellFees += sellVtx * cfg.sellFeeRate;
      sellTax += sellVtx * cfg.sellTaxRate;
      slippage += (buyVtx + sellVtx) * cfg.slippageRate;
    }
    const breakdown: TurnoverCostBreakdown = {
      buyFeesVnd: Math.round(buyFees),
      sellFeesVnd: Math.round(sellFees),
      sellTaxVnd: Math.round(sellTax),
      slippageVnd: Math.round(slippage),
      totalVnd: Math.round(buyFees + sellFees + sellTax + slippage),
      lowerBound: true,
    };
    return { ok: true, breakdown };
  }

  /**
   * Actionable execution steps with lot-rounded quantities (VietnamLotRule
   * math, lot-100 default). Round-lot truncation is confined to these steps;
   * pure weights stay unrounded. Symbols whose price is unknown yield a null
   * notional and warn (partial hints are not fabricated prices).
   */
  static executionSteps(input: CostInput): { readonly steps: readonly ExecutionStep[]; readonly warning: string | null } {
    if (!isFiniteNum(input.totalValueVnd) || input.totalValueVnd <= 0) {
      return { steps: [], warning: 'totalValueVnd missing — no execution steps can be hinted' };
    }
    const lotSize = input.lotSize ?? VietnamLotRule.LOT_SIZE;
    const steps: ExecutionStep[] = [];
    let missingPrice = false;
    const symbols = new Set([...Object.keys(input.currentWeights), ...Object.keys(input.newWeights)]);
    for (const s of symbols) {
      const delta = ((input.newWeights[s] ?? 0) - (input.currentWeights[s] ?? 0)) * input.totalValueVnd;
      if (Math.abs(delta) < 1e-6) continue;
      const price = input.markPrices?.[s] ?? null;
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        missingPrice = true;
        continue;
      }
      const rawShares = Math.abs(delta) / price;
      const lots = Math.floor(rawShares / lotSize);
      const quantity = lots * lotSize;
      if (quantity <= 0) continue;
      steps.push({
        symbol: s,
        side: delta > 0 ? 'BUY' : 'SELL',
        roundLotQuantity: quantity,
        notionalVnd: Math.round(quantity * price),
      });
    }
    return {
      steps,
      warning: missingPrice ? 'some symbols lacked a mark price — their execution hints are omitted, prices are never fabricated' : null,
    };
  }
}