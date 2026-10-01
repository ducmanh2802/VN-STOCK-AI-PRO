/**
 * PHASE 23 — CORPORATE ACTIONS SNAPSHOT BUILDER
 * =============================================
 * Deterministic builder for CorporateActionIntelligenceSnapshot.
 * Adheres strictly to PR-01 freshness semantics, provenance lineage,
 * and fail-closed data completeness rules.
 */

import type { DataFreshnessStatus } from '../../types/stock.ts';
import type {
  CorporateAction,
  CorporateActionAdjustmentFactor,
  CorporateActionDividendSummary,
  CorporateActionIntelligenceSnapshot,
  CorporateActionDataLineage,
} from './types.ts';
import { CorporateActionAdjustmentEngine } from './CorporateActionAdjustmentEngine.ts';

export interface BuildSnapshotInput {
  symbol: string;
  asOfDate: string;
  actions: CorporateAction[];
  historicalQuotes?: Map<string, number>; // Map<exDate, prevClosePrice>
  currentMarketPrice?: number | null;
  fetchedAt?: string;
  dataFreshness?: DataFreshnessStatus;
  sourceTimestamp?: number | null;
  additionalWarnings?: string[];
}

export class CorporateActionSnapshotBuilder {
  public static readonly ENGINE_NAME = 'CorporateActionEngine';
  public static readonly CALCULATION_VERSION = '23.0.0-PROD';

  /**
   * Builds the canonical corporate actions intelligence snapshot.
   */
  public static buildSnapshot(input: BuildSnapshotInput): CorporateActionIntelligenceSnapshot {
    const {
      symbol,
      asOfDate,
      actions,
      historicalQuotes,
      currentMarketPrice,
      fetchedAt = new Date().toISOString(),
      sourceTimestamp = Date.now(),
      additionalWarnings = [],
    } = input;

    const warnings: string[] = [...additionalWarnings];
    const upperSymbol = symbol.trim().toUpperCase();

    // 1. Partition actions into upcoming, historical, and active rights
    const upcomingEvents: CorporateAction[] = [];
    const historicalEvents: CorporateAction[] = [];
    const activeRights: CorporateAction[] = [];

    for (const a of actions) {
      if (a.status === 'CANCELLED') {
        continue;
      }

      if (a.dates.exDate >= asOfDate) {
        upcomingEvents.push(a);
      } else {
        historicalEvents.push(a);
      }

      if (a.actionType === 'RIGHTS_ISSUE') {
        const start = a.dates.rightsStartDate;
        const end = a.dates.rightsEndDate;
        if (start && end && asOfDate >= start && asOfDate <= end) {
          activeRights.push(a);
        }
      }
    }

    upcomingEvents.sort((a, b) => a.dates.exDate.localeCompare(b.dates.exDate));
    historicalEvents.sort((a, b) => b.dates.exDate.localeCompare(a.dates.exDate)); // descending

    // 2. Compute adjustment factors for historical events
    const adjustmentFactors: CorporateActionAdjustmentFactor[] = [];
    for (const a of historicalEvents) {
      if (a.actionType === 'SHAREHOLDER_MEETING' || a.actionType === 'WRITTEN_CONSULTATION') {
        continue;
      }

      const prevClose = historicalQuotes?.get(a.dates.exDate);
      if (prevClose !== undefined && prevClose !== null && prevClose > 0) {
        try {
          const factor = CorporateActionAdjustmentEngine.computeActionAdjustmentFactor(a, prevClose);
          if (factor) {
            adjustmentFactors.push(factor);
          }
        } catch (e) {
          warnings.push(`Failed to calculate adjustment factor for action ${a.id}: ${(e as Error).message}`);
        }
      }
    }

    // 3. Compute Dividend Summary (TTM Cash Dividends & Indicated Yield)
    const dividendSummary = this.calculateDividendSummary({
      actions: historicalEvents,
      asOfDate,
      currentMarketPrice,
    });

    // 4. Determine Data Freshness Status
    let freshness: DataFreshnessStatus = input.dataFreshness || 'CURRENT';
    if (!actions || actions.length === 0) {
      freshness = 'CURRENT'; // No corporate actions is a valid state
    }

    // 5. Lineage metadata
    const sourceSet = new Set<string>(['VSDC', 'HOSE', 'HNX']);
    for (const a of actions) {
      if (a.source) sourceSet.add(a.source);
    }

    const dataLineage: CorporateActionDataLineage = {
      sources: Array.from(sourceSet),
      engine: this.ENGINE_NAME,
      calculationVersion: this.CALCULATION_VERSION,
    };

    return {
      symbol: upperSymbol,
      asOfDate,
      dataFreshness: freshness,
      sourceTimestamp,
      fetchedAt,
      upcomingEvents,
      historicalEvents,
      activeRights,
      adjustmentFactors,
      dividendSummary,
      dataLineage,
      warnings,
    };
  }

  /**
   * Computes trailing-twelve-months (TTM) cash dividends and historical yield.
   */
  private static calculateDividendSummary(params: {
    actions: CorporateAction[];
    asOfDate: string;
    currentMarketPrice?: number | null;
  }): CorporateActionDividendSummary {
    const { actions, asOfDate, currentMarketPrice } = params;

    // Filter historical cash dividends in the trailing 365 days
    const asOfMs = new Date(`${asOfDate}T00:00:00Z`).getTime();
    const oneYearAgoMs = asOfMs - (365 * 86_400_000);

    let ttmCashTotal = 0;
    let lastDividendDate: string | null = null;
    let lastCashAmountVnd: number | null = null;

    // Actions are sorted descending by exDate
    for (const a of actions) {
      if (a.actionType !== 'CASH_DIVIDEND') continue;
      if (a.status === 'CANCELLED') continue;
      if (a.cashAmountVnd === null || a.cashAmountVnd <= 0) continue;

      const exMs = new Date(`${a.dates.exDate}T00:00:00Z`).getTime();

      // Record the most recent dividend
      if (lastDividendDate === null) {
        lastDividendDate = a.dates.exDate;
        lastCashAmountVnd = a.cashAmountVnd;
      }

      // Check if within TTM window
      if (exMs >= oneYearAgoMs && exMs <= asOfMs) {
        ttmCashTotal += a.cashAmountVnd;
      }
    }

    const ttmCashDividendsVnd = ttmCashTotal > 0 ? ttmCashTotal : null;

    let historicalYieldPercent: number | null = null;
    if (ttmCashDividendsVnd !== null && currentMarketPrice && currentMarketPrice > 0) {
      historicalYieldPercent = Number(((ttmCashDividendsVnd / currentMarketPrice) * 100).toFixed(2));
    }

    return {
      ttmCashDividendsVnd,
      indicatedAnnualDividendVnd: ttmCashDividendsVnd,
      historicalYieldPercent,
      lastDividendDate,
      lastCashAmountVnd,
    };
  }
}
