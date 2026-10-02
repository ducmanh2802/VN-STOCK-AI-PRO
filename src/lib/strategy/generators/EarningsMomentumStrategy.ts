/**
 * PHASE 25 — STRATEGY #1: EARNINGS MOMENTUM QUALITY
 * ===================================================
 * Multi-Asset Strategy for Vietnamese Equities combining Phase 24 Earnings
 * Intelligence (YoY Growth, Quality, Accruals, CFO-to-Net-Income conversion)
 * with Phase 20 Market/Sector Intelligence.
 *
 * Invariants:
 *   - Consumes certified Phase 24 facts, never recalculating statements.
 *   - Fails closed to HOLD when required financial facts are unavailable.
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

export interface EarningsMomentumParams extends StrategyParameters {
  readonly minRevenueGrowthYoY: number;      // Default: 10 (%)
  readonly minNetProfitGrowthYoY: number;    // Default: 15 (%)
  readonly minCfoToNetIncomeRatio: number;   // Default: 0.8
  readonly maxAccrualsRatio: number;         // Default: 0.15
  readonly targetUpsidePercent: number;      // Default: 15 (%)
  readonly stopLossPercent: number;          // Default: 7 (%)
}

export const DEFAULT_EARNINGS_MOMENTUM_PARAMS: EarningsMomentumParams = {
  minRevenueGrowthYoY: 10.0,
  minNetProfitGrowthYoY: 15.0,
  minCfoToNetIncomeRatio: 0.8,
  maxAccrualsRatio: 0.15,
  targetUpsidePercent: 15.0,
  stopLossPercent: 7.0,
};

export class EarningsMomentumStrategy
  implements MultiAssetStrategy<EarningsMomentumParams>
{
  public readonly id = 'STRATEGY_EQUITY_EARNINGS_MOMENTUM';
  public readonly name = 'Earnings Momentum & Quality Strategy';
  public readonly description =
    'Fundamental equity strategy selecting high-growth, high-accrual-quality Vietnamese stocks.';
  public readonly assetClass = 'EQUITY' as const;
  public readonly defaultParameters = DEFAULT_EARNINGS_MOMENTUM_PARAMS;

  public validateParameters(params: unknown): ParameterValidationResult {
    if (!params || typeof params !== 'object') {
      return { valid: false, errors: ['Parameters must be an object'] };
    }
    const p = params as Partial<EarningsMomentumParams>;
    const errors: string[] = [];

    if (p.minRevenueGrowthYoY !== undefined && (!Number.isFinite(p.minRevenueGrowthYoY))) {
      errors.push('minRevenueGrowthYoY must be a finite number');
    }
    if (p.minNetProfitGrowthYoY !== undefined && (!Number.isFinite(p.minNetProfitGrowthYoY))) {
      errors.push('minNetProfitGrowthYoY must be a finite number');
    }
    if (p.minCfoToNetIncomeRatio !== undefined && (!Number.isFinite(p.minCfoToNetIncomeRatio) || p.minCfoToNetIncomeRatio < 0)) {
      errors.push('minCfoToNetIncomeRatio must be a non-negative finite number');
    }
    if (p.maxAccrualsRatio !== undefined && (!Number.isFinite(p.maxAccrualsRatio) || p.maxAccrualsRatio < 0)) {
      errors.push('maxAccrualsRatio must be a non-negative finite number');
    }
    if (p.targetUpsidePercent !== undefined && (!Number.isFinite(p.targetUpsidePercent) || p.targetUpsidePercent <= 0)) {
      errors.push('targetUpsidePercent must be a positive number');
    }
    if (p.stopLossPercent !== undefined && (!Number.isFinite(p.stopLossPercent) || p.stopLossPercent <= 0)) {
      errors.push('stopLossPercent must be a positive number');
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  public evaluate(context: StrategyContext, params?: EarningsMomentumParams): StrategySignal {
    const config = { ...this.defaultParameters, ...params };
    const lineage: StrategySignalLineage = {
      strategyId: this.id,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyFactory',
      evaluatedAt: context.evaluatedAt,
      asOfDate: context.asOfDate,
      assetClass: this.assetClass,
      sourceSnapshots: {
        earnings: context.earningsSnapshot?.period.id,
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

    // 2. Upstream Earnings Intelligence Guard
    const earnings = context.earningsSnapshot;
    if (!earnings || earnings.freshness === 'UNAVAILABLE' || earnings.freshness === 'INVALID') {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'REQUIRED_EARNINGS_FACTS_UNAVAILABLE',
        lineage,
        ['Missing or unavailable Phase 24 EarningsSnapshot']
      );
    }

    const revGrowth = earnings.growth.revenueGrowthYoY;
    const profitGrowth = earnings.growth.netProfitGrowthYoY;
    const cfoRatio = earnings.quality.cfoToNetIncomeRatio;
    const accruals = earnings.quality.accrualsBalanceSheet;
    const redFlags = earnings.quality.redFlags;

    // Fail closed if primary growth metrics are unavailable
    if (revGrowth === null || profitGrowth === null) {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'REQUIRED_EARNINGS_FACTS_UNAVAILABLE',
        lineage,
        ['YoY Revenue or Profit growth unavailable for period ' + earnings.period.id]
      );
    }

    const currentPrice = context.currentPrice ?? null;
    const notes: string[] = [
      `Revenue YoY: ${revGrowth.toFixed(1)}%`,
      `Profit YoY: ${profitGrowth.toFixed(1)}%`,
    ];

    if (cfoRatio !== null) notes.push(`CFO/NetIncome: ${cfoRatio.toFixed(2)}`);
    if (accruals !== null) notes.push(`Accruals: ${accruals.toFixed(3)}`);
    if (redFlags.length > 0) notes.push(`Red Flags: ${redFlags.join(', ')}`);

    // Decision Logic
    const meetsGrowth =
      revGrowth >= config.minRevenueGrowthYoY &&
      profitGrowth >= config.minNetProfitGrowthYoY;

    // Quality check: High CFO conversion or low accruals, with no severe red flags
    const hasCleanQuality =
      (cfoRatio === null || cfoRatio >= config.minCfoToNetIncomeRatio) &&
      (accruals === null || Math.abs(accruals) <= config.maxAccrualsRatio) &&
      redFlags.length === 0;

    if (meetsGrowth && hasCleanQuality) {
      // Calculate conviction: base 60 + bonuses for extraordinary growth and cash conversion
      let conviction = 60;
      if (profitGrowth >= config.minNetProfitGrowthYoY * 1.5) conviction += 15;
      if (cfoRatio !== null && cfoRatio >= 1.0) conviction += 15;
      if (revGrowth >= config.minRevenueGrowthYoY * 1.5) conviction += 10;
      conviction = Math.min(100, conviction);

      const targetPrice =
        currentPrice !== null
          ? currentPrice * (1 + config.targetUpsidePercent / 100)
          : null;
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
        timeInForce: 'POSITION',
        dataFreshness: earnings.freshness,
        notes,
        lineage,
      });
    }

    // If growth is present but red flags exist, emit HOLD with caution
    if (meetsGrowth && !hasCleanQuality) {
      notes.push('GROWTH_WITHOUT_CASH_CONVERSION_CAUTION');
      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'HOLD',
        conviction: 25,
        timeInForce: 'POSITION',
        dataFreshness: earnings.freshness,
        reasonCode: 'POOR_EARNINGS_QUALITY_DIVERGENCE',
        notes,
        lineage,
      });
    }

    // Default neutral / hold
    return UniversalSignalNormalizer.normalize({
      strategyId: this.id,
      assetClass: this.assetClass,
      symbol: context.symbol,
      direction: 'HOLD',
      conviction: 0,
      timeInForce: 'POSITION',
      dataFreshness: earnings.freshness,
      reasonCode: 'CRITERIA_NOT_MET',
      notes,
      lineage,
    });
  }
}
