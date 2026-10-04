/**
 * PHASE 25 — STRATEGY #5: DIVIDEND CAPTURE STRATEGY
 * ===================================================
 * Event-driven strategy for Vietnamese Equities consuming Phase 23 Corporate
 * Actions Intelligence (Declared cash dividends, VSDC ex-dates, and adjustment factors).
 *
 * Invariants:
 *   - Directly consumes certified Phase 23 dates and entitlements without duplicating mathematics.
 *   - Never infers or fabricates corporate actions.
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

export interface DividendCaptureParams extends StrategyParameters {
  readonly minDividendYieldPercent: number;     // Default: 3.5 (%)
  readonly maxDaysBeforeExDate: number;         // Default: 15 (calendar days)
  readonly stopLossPercent: number;             // Default: 5.0 (%)
}

export const DEFAULT_DIVIDEND_CAPTURE_PARAMS: DividendCaptureParams = {
  minDividendYieldPercent: 3.5,
  maxDaysBeforeExDate: 15,
  stopLossPercent: 5.0,
};

export class DividendCaptureStrategy
  implements MultiAssetStrategy<DividendCaptureParams>
{
  public readonly id = 'STRATEGY_EQUITY_DIVIDEND_CAPTURE';
  public readonly name = 'Dividend Capture Event-Driven Strategy';
  public readonly description =
    'Event-driven equity strategy targeting high-yield cash dividend announcements prior to VSDC Ex-Dividend dates.';
  public readonly assetClass = 'EQUITY' as const;
  public readonly defaultParameters = DEFAULT_DIVIDEND_CAPTURE_PARAMS;

  public validateParameters(params: unknown): ParameterValidationResult {
    if (!params || typeof params !== 'object') {
      return { valid: false, errors: ['Parameters must be an object'] };
    }
    const p = params as Partial<DividendCaptureParams>;
    const errors: string[] = [];

    if (p.minDividendYieldPercent !== undefined && (!Number.isFinite(p.minDividendYieldPercent) || p.minDividendYieldPercent <= 0)) {
      errors.push('minDividendYieldPercent must be a positive number');
    }
    if (p.maxDaysBeforeExDate !== undefined && (!Number.isFinite(p.maxDaysBeforeExDate) || p.maxDaysBeforeExDate <= 0)) {
      errors.push('maxDaysBeforeExDate must be a positive number');
    }
    if (p.stopLossPercent !== undefined && (!Number.isFinite(p.stopLossPercent) || p.stopLossPercent <= 0)) {
      errors.push('stopLossPercent must be a positive number');
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  public evaluate(context: StrategyContext, params?: DividendCaptureParams): StrategySignal {
    const config = { ...this.defaultParameters, ...params };
    const lineage: StrategySignalLineage = {
      strategyId: this.id,
      strategyVersion: '25.0.0-PROD',
      engine: 'StrategyFactory',
      evaluatedAt: context.evaluatedAt,
      asOfDate: context.asOfDate,
      assetClass: this.assetClass,
      sourceSnapshots: {
        corporateAction: context.corporateActionSnapshot?.symbol,
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

    // 2. Upstream Corporate Actions Intelligence Guard
    const corp = context.corporateActionSnapshot;
    if (!corp || corp.dataFreshness === 'UNAVAILABLE' || corp.dataFreshness === 'INVALID') {
      return UniversalSignalNormalizer.failClosed(
        this.id,
        this.assetClass,
        context.symbol,
        'CORPORATE_ACTIONS_UNAVAILABLE',
        lineage,
        ['Missing or unavailable Phase 23 CorporateActionIntelligenceSnapshot']
      );
    }

    const currentPrice = context.currentPrice ?? null;
    const actions = [...(corp.upcomingEvents ?? []), ...(corp.historicalEvents ?? [])];

    // Filter for upcoming CASH_DIVIDEND actions
    const cashActions = actions.filter((a) => a.actionType === 'CASH_DIVIDEND' && a.cashAmountVnd && a.cashAmountVnd > 0);

    if (cashActions.length === 0) {
      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'HOLD',
        conviction: 0,
        timeInForce: 'POSITION',
        dataFreshness: corp.dataFreshness,
        reasonCode: 'NO_ELIGIBLE_DIVIDEND_EVENTS',
        notes: ['No announced cash dividend corporate actions found for symbol'],
        lineage,
      });
    }

    // Select the nearest upcoming cash dividend event
    let eligibleAction = null;
    let daysToExDate = Infinity;
    const evalTime = new Date(context.asOfDate).getTime();

    for (const action of cashActions) {
      const exTime = new Date(action.dates.exDate).getTime();
      const diffDays = Math.round((exTime - evalTime) / (1000 * 60 * 60 * 24));

      // Must be upcoming (diffDays >= 0) and within maxDaysBeforeExDate
      if (diffDays >= 0 && diffDays <= config.maxDaysBeforeExDate && diffDays < daysToExDate) {
        daysToExDate = diffDays;
        eligibleAction = action;
      }
    }

    if (!eligibleAction || !eligibleAction.cashAmountVnd) {
      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'HOLD',
        conviction: 0,
        timeInForce: 'POSITION',
        dataFreshness: corp.dataFreshness,
        reasonCode: 'NO_UPCOMING_DIVIDENDS_IN_WINDOW',
        notes: [`Announced dividends fall outside the ${config.maxDaysBeforeExDate}-day pre-ex-date window`],
        lineage,
      });
    }

    const cashAmount = eligibleAction.cashAmountVnd;
    const dividendYield =
      currentPrice !== null && currentPrice > 0
        ? (cashAmount / currentPrice) * 100
        : (cashAmount / 10_000) * 100;

    const notes: string[] = [
      `Dividend: ${cashAmount.toLocaleString()} VND/share`,
      `Yield: ${dividendYield.toFixed(2)}%`,
      `Ex-Date: ${eligibleAction.dates.exDate} (in ${daysToExDate} days)`,
      `Record Date: ${eligibleAction.dates.recordDate}`,
    ];

    if (dividendYield >= config.minDividendYieldPercent) {
      const conviction = Math.min(90, Math.round(50 + dividendYield * 5));
      const targetPrice = currentPrice !== null ? currentPrice + cashAmount : null;
      const stopLoss = currentPrice !== null ? currentPrice * (1 - config.stopLossPercent / 100) : null;

      return UniversalSignalNormalizer.normalize({
        strategyId: this.id,
        assetClass: this.assetClass,
        symbol: context.symbol,
        direction: 'LONG',
        conviction,
        targetPrice,
        stopLoss,
        timeInForce: 'POSITION',
        dataFreshness: corp.dataFreshness,
        notes,
        lineage,
      });
    }

    return UniversalSignalNormalizer.normalize({
      strategyId: this.id,
      assetClass: this.assetClass,
      symbol: context.symbol,
      direction: 'HOLD',
      conviction: 20,
      timeInForce: 'POSITION',
      dataFreshness: corp.dataFreshness,
      reasonCode: 'DIVIDEND_YIELD_BELOW_THRESHOLD',
      notes,
      lineage,
    });
  }
}
