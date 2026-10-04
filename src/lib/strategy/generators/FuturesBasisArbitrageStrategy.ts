/**
 * PHASE 25 — STRATEGY #2: FUTURES BASIS ARBITRAGE
 * =================================================
 * Multi-Asset Strategy for Vietnam Index Futures (VN30F/VN100F) consuming
 * Phase 21 Derivatives Intelligence (Basis F - S, Term Structure, Contango/Backwardation,
 * and Open Interest dynamics).
 *
 * CRITICAL UNIT RULE:
 *   VN30F / VN100F index points MUST NOT be treated as equity VND/kVND share prices.
 *   Target prices and stop losses are strictly in index points.
 *
 * Invariants:
 *   - Strictly fails closed with SPOT_INDEX_UNAVAILABLE when spot index is missing.
 *   - Zero synthetic basis or fabricated futures levels.
 */

import type {
  MultiAssetStrategy,
  ParameterValidationResult,
  StrategyContext,
  StrategyParameters,
  StrategySignal,
  StrategySignalLineage,
} from '../types.ts';
import { UniversalSignalNormalizer } from '../UniversalSignalNormalizer.ts';

export interface FuturesBasisArbitrageParams extends StrategyParameters {
  readonly minBasisPoints: number;              // Default: 5.0 (index points)
  readonly maxBasisPoints: number;              // Default: 30.0 (index points)
  readonly targetProfitPoints: number;          // Default: 6.0 (index points)
  readonly stopLossPoints: number;              // Default: 4.0 (index points)
}

export const DEFAULT_FUTURES_BASIS_PARAMS: FuturesBasisArbitrageParams = {
  minBasisPoints: 5.0,
  maxBasisPoints: 30.0,
  targetProfitPoints: 6.0,
  stopLossPoints: 4.0,
};

export class FuturesBasisArbitrageStrategy
  implements MultiAssetStrategy<FuturesBasisArbitrageParams>
{
  public readonly id = 'STRATEGY_DERIVATIVES_BASIS_ARBITRAGE';
  public readonly name = 'Futures Basis & Term Structure Arbitrage Strategy';
  public readonly description =
    'Derivatives strategy exploiting spot-futures basis divergence and term-structure mispricing on VN30 index futures.';
  public readonly assetClass = 'DERIVATIVE' as const;
  public readonly defaultParameters = DEFAULT_FUTURES_BASIS_PARAMS;

  public validateParameters(params: unknown): ParameterValidationResult {
    if (!params || typeof params !== 'object') {
      return { valid: false, errors: ['Parameters must be an object'] };
    }
    const p = params as Partial<FuturesBasisArbitrageParams>;
    const errors: string[] = [];

    if (p.minBasisPoints !== undefined && (!Number.isFinite(p.minBasisPoints) || p.minBasisPoints <= 0)) {
      errors.push('minBasisPoints must be a positive finite number');
    }
    if (p.maxBasisPoints !== undefined && (!Number.isFinite(p.maxBasisPoints) || p.maxBasisPoints <= 0)) {
      errors.push('maxBasisPoints must be a positive finite number');
    }
    if (p.targetProfitPoints !== undefined && (!Number.isFinite(p.targetProfitPoints) || p.targetProfitPoints <= 0)) {
      errors.push('targetProfitPoints must be a positive finite number');
    }
    if (p.stopLossPoints !== undefined && (!Number.isFinite(p.stopLossPoints) || p.stopLossPoints <= 0)) {
      errors.push('stopLossPoints must be a positive finite number');
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  public evaluate(context: StrategyContext, params?: FuturesBasisArbitrageParams): StrategySignal {
    const config = { ...this.defaultParameters, ...params };
    const lineage: StrategySignalLineage = {
      strategyId: this.id,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyFactory',
      evaluatedAt: context.evaluatedAt,
      asOfDate: context.asOfDate,
      assetClass: this.assetClass,
      sourceSnapshots: {
        derivatives: context.derivativesSnapshot?.activeContract.symbol,
      },
    };

    // 1. Lookahead Guard
    if (context.lookaheadRejected) {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'LOOKAHEAD_DATA_REJECTED',
        lineage,
        context.lookaheadDetails
      );
    }

    // 2. Upstream Derivatives Intelligence Guard
    const deriv = context.derivativesSnapshot;
    if (!deriv || deriv.dataFreshness === 'UNAVAILABLE' || deriv.dataFreshness === 'INVALID') {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'SPOT_INDEX_UNAVAILABLE',
        lineage,
        ['Missing or unavailable Phase 21 DerivativesIntelligenceSnapshot']
      );
    }

    const basis = deriv.basis.basis; // F - S (index points)
    const spotPrice = deriv.spotQuote.price;
    const futuresPrice = deriv.quote.price ?? context.currentPrice ?? null;
    const oiInterpretation = deriv.openInterest.positioning;
    const termRegime = deriv.termStructure.curveShape;

    // Fail closed if basis cannot be computed or spot is null
    if (basis === null || spotPrice === null) {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'SPOT_INDEX_UNAVAILABLE',
        lineage,
        ['Spot index price or basis is null']
      );
    }

    const notes: string[] = [
      `Basis: ${basis.toFixed(2)} pts`,
      `Spot: ${spotPrice.toFixed(2)} pts`,
      `Term Structure: ${termRegime}`,
      `OI: ${oiInterpretation}`,
    ];

    // High positive basis: Futures is rich compared to Spot (Contango extreme)
    // Strategy: Short Futures leg (Cash-and-Carry hedge or outright mean-reversion)
    if (basis >= config.minBasisPoints && basis <= config.maxBasisPoints) {
      let conviction = Math.min(
        95,
        Math.round(55 + (basis / config.minBasisPoints) * 15)
      );
      if (oiInterpretation === 'SHORT_ACCUMULATION') conviction += 10;
      conviction = Math.min(100, conviction);

      const targetPrice =
        futuresPrice !== null ? futuresPrice - config.targetProfitPoints : null;
      const stopLoss =
        futuresPrice !== null ? futuresPrice + config.stopLossPoints : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'SHORT',
        conviction,
        targetPrice,
        stopLoss,
        timeInForce: 'INTRADAY',
        dataFreshness: deriv.dataFreshness,
        notes,
        lineage,
      });
    }

    // High negative basis: Futures is cheap compared to Spot (Backwardation extreme)
    // Strategy: Long Futures leg (Reverse Cash-and-Carry)
    if (basis <= -config.minBasisPoints && Math.abs(basis) <= config.maxBasisPoints) {
      let conviction = Math.min(
        95,
        Math.round(55 + (Math.abs(basis) / config.minBasisPoints) * 15)
      );
      if (oiInterpretation === 'LONG_ACCUMULATION') conviction += 10;
      conviction = Math.min(100, conviction);

      const targetPrice =
        futuresPrice !== null ? futuresPrice + config.targetProfitPoints : null;
      const stopLoss =
        futuresPrice !== null ? futuresPrice - config.stopLossPoints : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'LONG',
        conviction,
        targetPrice,
        stopLoss,
        timeInForce: 'INTRADAY',
        dataFreshness: deriv.dataFreshness,
        notes,
        lineage,
      });
    }

    // Normal / neutral basis within thresholds
    return UniversalSignalNormalizer.normalize({
      strategyId: this.id,
      assetClass: this.assetClass,
      symbol: context.symbol,
      direction: 'FLAT',
      conviction: 0,
      timeInForce: 'INTRADAY',
      dataFreshness: deriv.dataFreshness,
      reasonCode: 'BASIS_WITHIN_NORMAL_BOUNDS',
      notes,
      lineage,
    });
  }
}
