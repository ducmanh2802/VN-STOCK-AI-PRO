/**
 * PHASE 24 — EPS INTELLIGENCE ENGINE
 * ==================================
 * Canonical EPS resolution + share-count normalization for historical
 * comparability.
 *
 * SOURCE PRECEDENCE (canonical):
 *   1. Parent-attributable net profit (when available), else total net profit.
 *   2. Weighted / outstanding share count supplied by the caller.
 *   3. Basic EPS = attributionProfit / weightedShares.
 *   4. Diluted EPS  = attributionProfit / dilutedShares (only when supplied).
 *
 * Phase 23 read-only integration: share-count changes (stock split, reverse
 * split, bonus issue, stock dividend, rights issue) are consumed through the
 * existing `CorporateActionEntitlementEngine.parseRatio` API — Phase 24 does NOT
 * re-implement ratio parsing or a second corporate-action engine.
 */

import type {
  CanonicalFinancialFact,
  DataUnavailableReasonCode,
  EarningsLineage,
  EarningsReportType,
  EpsResult,
  FinancialPeriod,
} from './types.ts';
import { CorporateActionEntitlementEngine } from '../corporate-actions/CorporateActionEntitlementEngine.ts';
import { buildLineage } from './lineage.ts';
import { finite, round, safeDivide } from './helpers.ts';

/** A share-count-affecting corporate action, expressed on the Phase 23 ratio model. */
export interface ShareAdjustmentEvent {
  readonly exDate: string;
  readonly actionType: string;
  /** Phase 23 raw ratio expression, e.g. "10:1" (newShares per oldShares). */
  readonly rawRatioExpression: string;
  readonly effect: 'INCREASE' | 'DECREASE';
}

export interface EpsComputeParams {
  readonly symbol: string;
  readonly period: FinancialPeriod;
  readonly reportType: EarningsReportType;
  readonly netProfit: number | null;
  readonly parentNetProfit: number | null;
  readonly weightedShares: number | null;
  readonly dilutedShares?: number | null;
  readonly corporateActions?: readonly ShareAdjustmentEvent[];
}

export class EpsEngine {
  /**
   * Computes the cumulative share-count multiplier from Phase 23 corporate
   * actions whose ex-date is strictly AFTER `afterDate` (i.e. adjustments needed
   * to bring a historical share base onto today's base).
   *
   * Deterministic; returns `null` if any ratio is unparseable (fail-closed).
   */
  public static cumulativeShareMultiplier(
    events: readonly ShareAdjustmentEvent[],
    afterDate: string
  ): number | null {
    const relevant = events
      .filter((e) => e.exDate > afterDate)
      .sort((a, b) => a.exDate.localeCompare(b.exDate));
    let multiplier = 1;
    for (const e of relevant) {
      const ratio = CorporateActionEntitlementEngine.parseRatio(e.rawRatioExpression);
      const per = 1 + ratio.ratioDecimal;
      const m = e.effect === 'INCREASE' ? per : 1 / per;
      if (!Number.isFinite(m) || m <= 0) return null;
      multiplier *= m;
    }
    return Number(multiplier.toFixed(6));
  }

  /** Canonical EPS computation. Fail-closed on missing/invalid share counts. */
  public static compute(params: EpsComputeParams, facts: readonly CanonicalFinancialFact[] = []): EpsResult {
    const { symbol, period, reportType } = params;
    const netProfit = finite(params.netProfit);
    const parentNetProfit = finite(params.parentNetProfit);
    const weightedShares = finite(params.weightedShares);
    const dilutedShares = finite(params.dilutedShares);

    const attributionProfit = parentNetProfit !== null ? parentNetProfit : netProfit;

    let reason: DataUnavailableReasonCode | undefined;
    if (attributionProfit === null) reason = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    else if (weightedShares === null) reason = 'REQUIRED_LINE_ITEM_NOT_FOUND';
    else if (weightedShares <= 0) reason = 'VALUE_NON_FINITE';

    const basicEps = reason ? null : round(safeDivide(attributionProfit, weightedShares), 2);
    const dilutedEps =
      dilutedShares !== null && dilutedShares > 0 && attributionProfit !== null
        ? round(safeDivide(attributionProfit, dilutedShares), 2)
        : null;

    let comparableShares: number | null = weightedShares;
    let adjustedBasicEps: number | null = null;
    if (params.corporateActions && params.corporateActions.length > 0 && weightedShares !== null && weightedShares > 0) {
      const multiplier = this.cumulativeShareMultiplier(params.corporateActions, period.periodEnd);
      if (multiplier === null) {
        comparableShares = weightedShares;
        adjustedBasicEps = basicEps;
      } else {
        comparableShares = round(weightedShares * multiplier, 0);
        adjustedBasicEps =
          attributionProfit !== null && comparableShares !== null && comparableShares > 0
            ? round(safeDivide(attributionProfit, comparableShares), 2)
            : null;
      }
    } else {
      adjustedBasicEps = basicEps;
    }

    const lineage: EarningsLineage = buildLineage(facts, { engine: 'EpsEngine' });

    return Object.freeze({
      symbol: symbol.trim().toUpperCase(),
      period,
      reportType,
      netProfit,
      parentNetProfit,
      weightedShares,
      comparableShares,
      basicEps,
      dilutedEps,
      adjustedBasicEps,
      reason,
      lineage,
    });
  }
}
