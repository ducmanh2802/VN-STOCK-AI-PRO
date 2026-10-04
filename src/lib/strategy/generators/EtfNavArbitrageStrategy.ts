/**
 * PHASE 25 — STRATEGY #3: ETF NAV ARBITRAGE
 * ==========================================
 * Multi-Asset Strategy for Vietnamese ETFs (HOSE) consuming Phase 22 ETF & Fund
 * Intelligence (Official EOD NAV, iNAV, Premium/Discount, and Tracking Error).
 *
 * Invariants:
 *   - Mandatory division safety: if NAV <= 0 or missing, fails closed to HOLD.
 *   - Fails closed with ETF_NAV_UNAVAILABLE if ETF intelligence is missing.
 *   - Strictly preserves audit lineage and lookahead protection.
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

export interface EtfNavArbitrageParams extends StrategyParameters {
  readonly discountBuyThresholdPercent: number;  // Default: -1.0 (%)
  readonly premiumSellThresholdPercent: number; // Default: 1.5 (%)
  readonly maxTrackingErrorPercent: number;     // Default: 3.0 (%)
  readonly stopLossPercent: number;             // Default: 2.5 (%)
}

export const DEFAULT_ETF_NAV_PARAMS: EtfNavArbitrageParams = {
  discountBuyThresholdPercent: -1.0,
  premiumSellThresholdPercent: 1.5,
  maxTrackingErrorPercent: 3.0,
  stopLossPercent: 2.5,
};

export class EtfNavArbitrageStrategy
  implements MultiAssetStrategy<EtfNavArbitrageParams>
{
  public readonly id = 'STRATEGY_ETF_NAV_ARBITRAGE';
  public readonly name = 'ETF NAV Arbitrage & Tracking Strategy';
  public readonly description =
    'Quantitative ETF strategy exploiting premium/discount spreads relative to Net Asset Value (NAV) on Vietnamese ETFs.';
  public readonly assetClass = 'ETF' as const;
  public readonly defaultParameters = DEFAULT_ETF_NAV_PARAMS;

  public validateParameters(params: unknown): ParameterValidationResult {
    if (!params || typeof params !== 'object') {
      return { valid: false, errors: ['Parameters must be an object'] };
    }
    const p = params as Partial<EtfNavArbitrageParams>;
    const errors: string[] = [];

    if (p.discountBuyThresholdPercent !== undefined && !Number.isFinite(p.discountBuyThresholdPercent)) {
      errors.push('discountBuyThresholdPercent must be a finite number');
    }
    if (p.premiumSellThresholdPercent !== undefined && !Number.isFinite(p.premiumSellThresholdPercent)) {
      errors.push('premiumSellThresholdPercent must be a finite number');
    }
    if (p.maxTrackingErrorPercent !== undefined && (!Number.isFinite(p.maxTrackingErrorPercent) || p.maxTrackingErrorPercent <= 0)) {
      errors.push('maxTrackingErrorPercent must be a positive finite number');
    }
    if (p.stopLossPercent !== undefined && (!Number.isFinite(p.stopLossPercent) || p.stopLossPercent <= 0)) {
      errors.push('stopLossPercent must be a positive finite number');
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  public evaluate(context: StrategyContext, params?: EtfNavArbitrageParams): StrategySignal {
    const config = { ...this.defaultParameters, ...params };
    const lineage: StrategySignalLineage = {
      strategyId: this.id,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyFactory',
      evaluatedAt: context.evaluatedAt,
      asOfDate: context.asOfDate,
      assetClass: this.assetClass,
      sourceSnapshots: {
        etf: context.etfSnapshot?.specification.symbol,
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

    // 2. Upstream ETF Intelligence Guard
    const etf = context.etfSnapshot;
    if (!etf || etf.dataFreshness === 'UNAVAILABLE' || etf.dataFreshness === 'INVALID') {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'ETF_NAV_UNAVAILABLE',
        lineage,
        ['Missing or unavailable Phase 22 EtfIntelligenceSnapshot']
      );
    }

    // 2b. Stale upstream guard (P25-P1-1): stale NAV never drives arbitrage.
    if (etf.dataFreshness === 'STALE') {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'ETF_DATA_STALE',
        lineage,
        ['Phase 22 EtfIntelligenceSnapshot is STALE — NAV signal withheld (fail-closed)'],
        'STALE'
      );
    }

    const nav = etf.nav.navPerShare;
    const premiumDiscount = etf.premiumDiscount.premiumDiscountPercent;
    const currentPrice = etf.quote.price ?? context.currentPrice ?? null;
    const trackingError = etf.tracking?.trackingErrorAnnualized ?? null;

    // Fail closed if NAV <= 0 or invalid
    if (nav === null || nav <= 0 || premiumDiscount === null) {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'ETF_NAV_UNAVAILABLE',
        lineage,
        ['NAV per share is non-positive or null']
      );
    }

    const notes: string[] = [
      `NAV: ${nav.toLocaleString()} VND`,
      `Prem/Disc: ${premiumDiscount.toFixed(2)}%`,
      `Regime: ${etf.premiumDiscount.regime}`,
    ];

    if (trackingError !== null) {
      notes.push(`Tracking Error: ${trackingError.toFixed(2)}%`);
      // Tracking error safety check
      if (trackingError > config.maxTrackingErrorPercent) {
        notes.push('EXCESSIVE_TRACKING_ERROR_DEFENSIVE_HOLD');
        return UniversalSignalNormalizer.normalize({
          strategyId: this.id,
          assetClass: this.assetClass,
          symbol: context.symbol,
          direction: 'HOLD',
          // P25-P3-2: defensive no-edge HOLD carries zero conviction, consistent
          // with every other no-edge HOLD in the factory.
          conviction: 0,
          timeInForce: 'SWING',
          dataFreshness: etf.dataFreshness,
          reasonCode: 'EXCESSIVE_TRACKING_ERROR',
          notes,
          lineage,
        });
      }
    }

    // Deep Discount: Market price is below NAV -> Buy ETF, expect convergence to NAV
    if (premiumDiscount <= config.discountBuyThresholdPercent) {
      const discountDepth = Math.abs(premiumDiscount);
      const conviction = Math.min(95, Math.round(50 + discountDepth * 15));
      const targetPrice = nav;
      const stopLoss =
        currentPrice !== null
          ? currentPrice * (1 - config.stopLossPercent / 100)
          : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'LONG',
        conviction,
        targetPrice,
        stopLoss,
        timeInForce: 'SWING',
        dataFreshness: etf.dataFreshness,
        notes,
        lineage,
      });
    }

    // High Premium: Market price is above NAV -> Close or avoid
    if (premiumDiscount >= config.premiumSellThresholdPercent) {
      const conviction = Math.min(90, Math.round(50 + premiumDiscount * 12));
      const targetPrice = nav;
      const stopLoss =
        currentPrice !== null
          ? currentPrice * (1 + config.stopLossPercent / 100)
          : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'CLOSE',
        conviction,
        targetPrice,
        stopLoss,
        timeInForce: 'SWING',
        dataFreshness: etf.dataFreshness,
        notes,
        lineage,
      });
    }

    // Par / normal pricing
    return UniversalSignalNormalizer.normalize({
      strategyId: this.id,
      assetClass: this.assetClass,
      symbol: context.symbol,
      direction: 'HOLD',
      conviction: 0,
      timeInForce: 'SWING',
      dataFreshness: etf.dataFreshness,
      reasonCode: 'PAR_NO_ARBITRAGE_SPREAD',
      notes,
      lineage,
    });
  }
}
