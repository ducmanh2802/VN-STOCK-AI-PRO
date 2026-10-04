/**
 * RESEARCH-03 — REALISTIC EXECUTION / TRANSACTION COST MODEL
 * ============================================================
 * Explicit costModelVersion + fee/slippage/spread/impact config.
 * Only models with valid domain assumptions: FIXED | BPS | SPREAD
 * (volume-participation + lot guards for liquidity; futures multiplier/tick
 * preserved). No infinite liquidity. No invented impact curves without data.
 */
import type { CostModel } from './types.ts';
import { COST_MODEL_VERSION } from './types.ts';

export interface FillCostInput {
  readonly gross: number;
  readonly side: 'BUY' | 'SELL';
  readonly price: number;
  readonly quantity: number;
  readonly barVolume?: number;
  readonly spreadBps?: number;
}

export const DEFAULT_RESEARCH_COST: CostModel = {
  costModelVersion: COST_MODEL_VERSION,
  feeSchedule: 'VN_RETAIL_0.15_PCT',
  slippageModel: 'BPS',
  spreadModel: null,
  impactModel: null,
  buyFeeRate: 0.0015,
  sellFeeRate: 0.0015,
  sellTaxRate: 0.001,
  slippageRate: 0.001,
  maxParticipationRate: 0.1,
  boardLot: 100,
};

export const FUTURES_MULTIPLIER_VND = 100000;
export const FUTURES_TICK_POINTS = 0.1;
export const EQUITY_BOARD_LOT = 100;

export class CostEngine {
  static feeFor(model: CostModel, gross: number, side: 'BUY' | 'SELL'): { readonly fee: number; readonly tax: number } {
    if (!(gross > 0)) return { fee: 0, tax: 0 };
    const fee = gross * (side === 'BUY' ? model.buyFeeRate : model.sellFeeRate);
    const tax = side === 'SELL' ? gross * model.sellTaxRate : 0;
    return { fee, tax };
  }

  static slippagePrice(model: CostModel, price: number, side: 'BUY' | 'SELL', spreadBps?: number): number {
    if (model.slippageModel === 'FIXED') {
      return side === 'BUY' ? price * (1 + model.slippageRate) : price * (1 - model.slippageRate);
    }
    if (model.slippageModel === 'SPREAD' && spreadBps !== undefined && spreadBps > 0) {
      const half = (spreadBps / 10000) / 2;
      return side === 'BUY' ? price * (1 + half) : price * (1 - half);
    }
    return side === 'BUY' ? price * (1 + model.slippageRate) : price * (1 - model.slippageRate);
  }

  static roundLot(qty: number, lot: number = EQUITY_BOARD_LOT): number {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return Math.floor(qty / lot) * lot;
  }

  static liquidityCap(quantity: number, barVolume: number | undefined, model: CostModel): number {
    if (barVolume === undefined || !(barVolume > 0)) return quantity;
    return Math.min(quantity, Math.floor(barVolume * model.maxParticipationRate));
  }

  static futuresNotional(contracts: number, pricePoints: number): number {
    return contracts * pricePoints * FUTURES_MULTIPLIER_VND;
  }

  static roundTick(points: number): number {
    return Math.round(points / FUTURES_TICK_POINTS) * FUTURES_TICK_POINTS;
  }
}
