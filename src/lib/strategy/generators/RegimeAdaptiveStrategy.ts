/**
 * PHASE 25 — STRATEGY #4: REGIME ADAPTIVE CROSS-ASSET STRATEGY
 * ==============================================================
 * Cross-Asset strategy consuming Phase 20 Market Intelligence (Market Regime,
 * Breadth, and Volume Flow) to dynamically adjust risk posture, equity allocation,
 * and hedging.
 *
 * Recognized Phase 20 Regimes:
 *   - BULL_TREND: Risk-on aggressive long equity exposure
 *   - BEAR_TREND: Defensive risk-off / short hedge or rebalance
 *   - HIGH_VOLATILITY: Dynamic rebalance / reduced position size
 *   - ACCUMULATION / LOW_VOLATILITY: Accumulate quality positions
 *   - DISTRIBUTION: Defensive close / hedge
 *   - SIDEWAYS: Neutral hold
 *   - UNKNOWN: Fail-closed to HOLD with MARKET_REGIME_UNAVAILABLE
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

export interface RegimeAdaptiveParams extends StrategyParameters {
  readonly bullTrendMinConfidence: number;      // Default: 50
  readonly targetUpsidePercent: number;         // Default: 10.0 (%)
  readonly stopLossPercent: number;             // Default: 5.0 (%)
}

export const DEFAULT_REGIME_ADAPTIVE_PARAMS: RegimeAdaptiveParams = {
  bullTrendMinConfidence: 50.0,
  targetUpsidePercent: 10.0,
  stopLossPercent: 5.0,
};

export class RegimeAdaptiveStrategy
  implements MultiAssetStrategy<RegimeAdaptiveParams>
{
  public readonly id = 'STRATEGY_CROSS_ASSET_REGIME_ADAPTIVE';
  public readonly name = 'Market Regime Adaptive Dynamic Strategy';
  public readonly description =
    'Cross-asset strategy dynamically tuning equity exposure and futures hedging based on Phase 20 Market Regime classification.';
  public readonly assetClass = 'CROSS_ASSET' as const;
  public readonly defaultParameters = DEFAULT_REGIME_ADAPTIVE_PARAMS;

  public validateParameters(params: unknown): ParameterValidationResult {
    if (!params || typeof params !== 'object') {
      return { valid: false, errors: ['Parameters must be an object'] };
    }
    const p = params as Partial<RegimeAdaptiveParams>;
    const errors: string[] = [];

    if (p.bullTrendMinConfidence !== undefined && (!Number.isFinite(p.bullTrendMinConfidence) || p.bullTrendMinConfidence < 0 || p.bullTrendMinConfidence > 100)) {
      errors.push('bullTrendMinConfidence must be between 0 and 100');
    }
    if (p.targetUpsidePercent !== undefined && (!Number.isFinite(p.targetUpsidePercent) || p.targetUpsidePercent <= 0)) {
      errors.push('targetUpsidePercent must be a positive number');
    }
    if (p.stopLossPercent !== undefined && (!Number.isFinite(p.stopLossPercent) || p.stopLossPercent <= 0)) {
      errors.push('stopLossPercent must be a positive number');
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  public evaluate(context: StrategyContext, params?: RegimeAdaptiveParams): StrategySignal {
    const config = { ...this.defaultParameters, ...params };
    const lineage: StrategySignalLineage = {
      strategyId: this.id,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyFactory',
      evaluatedAt: context.evaluatedAt,
      asOfDate: context.asOfDate,
      assetClass: this.assetClass,
      sourceSnapshots: {
        market: context.marketSnapshot?.timestamp,
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

    // 2. Upstream Market Intelligence Guard
    const market = context.marketSnapshot;
    if (
      !market ||
      market.dataFreshness === 'UNAVAILABLE' ||
      market.dataFreshness === 'INVALID' ||
      market.regime.regime === 'UNKNOWN'
    ) {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'MARKET_REGIME_UNAVAILABLE',
        lineage,
        ['Missing or unavailable Phase 20 MarketIntelligenceSnapshot / UNKNOWN regime']
      );
    }

    const regime = market.regime.regime;
    const confidence = market.regime.confidence;
    const currentPrice = context.currentPrice ?? null;
    const notes: string[] = [
      `Regime: ${regime}`,
      `Confidence: ${confidence.toFixed(1)}/100`,
      `Breadth Adv/Dec: ${market.breadth.advanceDeclineRatio?.toFixed(2) ?? 'N/A'}`,
    ];

    if (regime === 'BULL_TREND') {
      const conviction = Math.max(config.bullTrendMinConfidence, Math.min(100, Math.round(confidence)));
      const targetPrice = currentPrice !== null ? currentPrice * (1 + config.targetUpsidePercent / 100) : null;
      const stopLoss = currentPrice !== null ? currentPrice * (1 - config.stopLossPercent / 100) : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'LONG',
        conviction,
        targetPrice,
        stopLoss,
        timeInForce: 'SWING',
        dataFreshness: market.dataFreshness,
        notes,
        lineage,
      });
    }

    if (regime === 'BEAR_TREND') {
      const conviction = Math.min(100, Math.round(confidence));
      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'SHORT',
        conviction,
        timeInForce: 'SWING',
        dataFreshness: market.dataFreshness,
        notes,
        lineage,
      });
    }

    if (regime === 'HIGH_VOLATILITY') {
      notes.push('HIGH_VOLATILITY_DEFENSIVE_REBALANCE');
      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'REBALANCE',
        conviction: 50,
        timeInForce: 'INTRADAY',
        dataFreshness: market.dataFreshness,
        notes,
        lineage,
      });
    }

    if (regime === 'ACCUMULATION' || regime === 'LOW_VOLATILITY') {
      const targetPrice = currentPrice !== null ? currentPrice * (1 + (config.targetUpsidePercent * 0.8) / 100) : null;
      const stopLoss = currentPrice !== null ? currentPrice * (1 - config.stopLossPercent / 100) : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'LONG',
        conviction: 55,
        targetPrice,
        stopLoss,
        timeInForce: 'POSITION',
        dataFreshness: market.dataFreshness,
        notes,
        lineage,
      });
    }

    if (regime === 'DISTRIBUTION') {
      notes.push('INSTITUTIONAL_DISTRIBUTION_DETECTED');
      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'REBALANCE',
        conviction: 60,
        timeInForce: 'SWING',
        dataFreshness: market.dataFreshness,
        notes,
        lineage,
      });
    }

    // SIDEWAYS / neutral
    return UniversalSignalNormalizer.normalize({
      strategyId: this.id,
      assetClass: this.assetClass,
      symbol: context.symbol,
      direction: 'HOLD',
      conviction: 0,
      timeInForce: 'SWING',
      dataFreshness: market.dataFreshness,
      reasonCode: 'SIDEWAYS_REGIME_NO_DIRECTIONAL_EDGE',
      notes,
      lineage,
    });
  }
}
