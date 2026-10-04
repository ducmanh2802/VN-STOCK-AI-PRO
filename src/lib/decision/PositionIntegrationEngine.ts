/**
 * DECISION-04 — POSITION SIZING & DECISION INTEGRATION
 * =====================================================
 * Thin, non-bypassable wrapper around the existing PositionSizer.
 * The function is injected (stable contract) so this engine never
 * reimplements sizing math, lot rounding, or futures semantics.
 * Lot 100 / multiplier 100_000 / tick 0.1 preserved by the injected engine.
 */
import type { SizingDecision, SizeState, ZeroReason } from './types.ts';

export interface SizerInput {
  readonly equity: number;
  readonly availableCash: number;
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly maxRiskPerTradeRate: number;
  readonly lotSize: number;
  readonly buyFeeRate: number;
  readonly slippageRate: number;
  readonly existingExposure: number;
  readonly maxPortfolioExposureRate: number;
  readonly capitalCeiling: number;
}

export interface SizerResult {
  readonly canTrade: boolean;
  readonly quantity: number;
  readonly code: string;
  readonly reason: string;
}

export type SizerFn = (input: SizerInput) => SizerResult;

export interface SizingIntegrationInput extends SizerInput {
  readonly strategyDirection: 'LONG' | 'SHORT' | 'FLAT' | 'HOLD' | 'CLOSE' | 'REBALANCE';
  readonly riskBlocked: boolean;
  readonly dataUnavailable: boolean;
  readonly portfolioLimitHit: boolean;
}

const CODE_TO_ZERO: Record<string, ZeroReason> = {
  INSUFFICIENT_CASH: 'ZERO_BY_PORTFOLIO_LIMIT',
  EXCESSIVE_EXPOSURE: 'ZERO_BY_PORTFOLIO_LIMIT',
  INVALID_CAPITAL: 'ZERO_BY_CONSTRAINT',
  INVALID_PRICE: 'ZERO_BY_DATA_UNAVAILABLE',
  INVALID_RISK_REWARD: 'ZERO_BY_CONSTRAINT',
  EXCESSIVE_RISK: 'ZERO_BY_RISK',
  INVALID_LOT_SIZE: 'ZERO_BY_CONSTRAINT',
};

export class PositionIntegrationEngine {
  static integrate(input: SizingIntegrationInput, sizer: SizerFn): SizingDecision {
    if (input.strategyDirection === 'HOLD' || input.strategyDirection === 'FLAT') {
      return {
        state: 'ZERO',
        quantity: 0,
        zeroReason: 'ZERO_BY_NO_SIGNAL',
        lotRounded: true,
        warnings: [`strategy ${input.strategyDirection} preserves no-trade`],
      };
    }
    if (input.dataUnavailable) {
      return { state: 'BLOCKED', quantity: 0, zeroReason: 'ZERO_BY_DATA_UNAVAILABLE', lotRounded: true, warnings: ['data unavailable'] };
    }
    if (input.riskBlocked) {
      return { state: 'BLOCKED', quantity: 0, zeroReason: 'ZERO_BY_RISK', lotRounded: true, warnings: ['risk blocked'] };
    }
    if (input.portfolioLimitHit) {
      return { state: 'ZERO', quantity: 0, zeroReason: 'ZERO_BY_PORTFOLIO_LIMIT', lotRounded: true, warnings: ['portfolio limit'] };
    }
    const r = sizer(input);
    if (!r.canTrade || r.quantity <= 0) {
      const zeroReason: ZeroReason = CODE_TO_ZERO[r.code] ?? 'ZERO_BY_CONSTRAINT';
      const state: SizeState = zeroReason === 'ZERO_BY_RISK' || zeroReason === 'ZERO_BY_DATA_UNAVAILABLE' ? 'BLOCKED' : 'ZERO';
      return { state, quantity: 0, zeroReason, lotRounded: true, warnings: [r.reason] };
    }
    const lotOk = r.quantity % input.lotSize === 0;
    const state: SizeState = 'FULL';
    return {
      state,
      quantity: r.quantity,
      zeroReason: null,
      lotRounded: lotOk,
      warnings: lotOk ? [] : ['quantity not lot-rounded by sizer'],
    };
  }
}
