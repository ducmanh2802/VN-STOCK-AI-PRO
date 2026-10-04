/**
 * PHASE 26 — BACKLOG & REVENUE CONVERSION ENGINE
 * ==============================================
 * Deterministic calculation of:
 *   - Book-to-Bill Ratio (New Order Intake / TTM Revenue)
 *   - Backlog Coverage Years (Remaining Backlog / TTM Revenue)
 *   - Multi-year Revenue & Gross Profit Conversion
 *
 * CONSTITUTIONAL INVARIANTS:
 *   - Backlog != Revenue, Contract Value != Profit.
 *   - If TTM revenue is 0 or null -> Book-to-Bill and Coverage are null (never Infinity or NaN).
 *   - If execution schedule is missing -> Falls back to fail-closed straight-line estimate or UNAVAILABLE.
 */

import type {
  BacklogItem,
  CompanyBacklogSummary,
  BacklogRevenueConversionResult,
  BacklogRevenueProjectionYear,
  DataFreshnessStatus,
} from './types.ts';

export class BacklogConversionEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Summarizes company backlog items into high-integrity aggregate metrics.
   */
  public static summarizeBacklog(
    symbol: string,
    items: readonly BacklogItem[],
    ttmRevenueVnd: number | null,
    asOfDate?: string
  ): CompanyBacklogSummary {
    const evaluationDate = asOfDate ?? new Date().toISOString().slice(0, 10);
    const sym = symbol.toUpperCase();

    let totalConfirmedBacklog: number | null = null;
    let totalUnauditedDisclosedBacklog: number | null = null;
    let totalUnverifiedBacklog: number | null = null;

    const filteredItems = items.filter((item) => {
      if (item.symbol.toUpperCase() !== sym) return false;
      // Fail-closed (P26-P3-1): undated records are excluded — never assumed
      // current. The publication date is real evidence; the award date is an
      // acceptable fallback; a missing both means the record cannot be placed
      // in time and must not enter a historical total.
      const pubDate = item.provenance.publicationDate || item.awardDate || null;
      if (!pubDate) return false;
      if (pubDate > evaluationDate) return false;
      // Fail-closed (P26-P3-2): a future award date must not inflate a
      // historical backlog total even when publication predates the snapshot.
      if (item.awardDate && item.awardDate > evaluationDate) return false;
      return true;
    });

    for (const item of filteredItems) {
      const val = item.remainingBacklogVnd ?? item.contractValueVnd;
      if (val === null || isNaN(val) || val < 0) continue;

      if (item.verificationType === 'CONTRACTED_VERIFIED') {
        totalConfirmedBacklog = (totalConfirmedBacklog ?? 0) + val;
      } else if (item.verificationType === 'DISCLOSED_UNAUDITED') {
        // Segregated (P26-P2-4): unaudited IR-deck disclosures are reported
        // separately and NEVER counted as confirmed backlog, coverage, or
        // conversion input.
        totalUnauditedDisclosedBacklog = (totalUnauditedDisclosedBacklog ?? 0) + val;
      } else {
        totalUnverifiedBacklog = (totalUnverifiedBacklog ?? 0) + val;
      }
    }

    // Book-to-bill and Backlog coverage calculations
    let bookToBill: number | null = null;
    let coverageYears: number | null = null;

    if (
      ttmRevenueVnd !== null &&
      !isNaN(ttmRevenueVnd) &&
      ttmRevenueVnd > 0 &&
      totalConfirmedBacklog !== null
    ) {
      coverageYears = Number((totalConfirmedBacklog / ttmRevenueVnd).toFixed(2));

      // Compute new order intake in the last 12 months if awardDate is present
      const oneYearAgo = new Date(evaluationDate);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

      let newOrderIntake: number | null = null;
      for (const item of filteredItems) {
        if (
          item.awardDate &&
          item.awardDate >= oneYearAgoStr &&
          item.awardDate <= evaluationDate
        ) {
          const cVal = item.contractValueVnd ?? 0;
          if (cVal > 0) {
            newOrderIntake = (newOrderIntake ?? 0) + cVal;
          }
        }
      }

      if (newOrderIntake !== null) {
        bookToBill = Number((newOrderIntake / ttmRevenueVnd).toFixed(2));
      }
    }

    const isCurrent = filteredItems.some((i) => i.provenance.freshness === 'CURRENT');
    const freshness: DataFreshnessStatus =
      filteredItems.length === 0 ? 'UNAVAILABLE' : isCurrent ? 'CURRENT' : 'STALE';

    return {
      symbol: sym,
      asOfDate: evaluationDate,
      totalConfirmedBacklogVnd: totalConfirmedBacklog,
      totalUnauditedDisclosedBacklogVnd: totalUnauditedDisclosedBacklog,
      totalUnverifiedBacklogVnd: totalUnverifiedBacklog,
      trailingTwelveMonthsRevenueVnd: ttmRevenueVnd,
      bookToBillRatio: bookToBill,
      backlogCoverageYears: coverageYears,
      items: filteredItems,
      freshness,
    };
  }

  /**
   * Projects annual revenue conversion from confirmed backlog.
   */
  public static projectRevenueConversion(
    summary: CompanyBacklogSummary,
    historicalGrossMarginPercent: number | null = null
  ): BacklogRevenueConversionResult {
    const notes: string[] = [];
    const confirmedBacklog = summary.totalConfirmedBacklogVnd;

    if (!confirmedBacklog || confirmedBacklog <= 0) {
      return {
        symbol: summary.symbol,
        asOfDate: summary.asOfDate,
        confirmedBacklogVnd: null,
        scheduleAvailable: false,
        projectedRevenues: [],
        averageHistoricalGrossMarginPercent: null,
        projectedGrossProfitVnd: null,
        conversionStatus: 'UNAVAILABLE',
        notes: ['No confirmed backlog available for revenue conversion.'],
      };
    }

    const currentYear = parseInt(summary.asOfDate.slice(0, 4), 10);
    const projections: BacklogRevenueProjectionYear[] = [];

    // Check if items have explicit schedule dates
    const itemsWithSchedule = summary.items.filter(
      (i) => i.expectedCompletionDate && (i.remainingBacklogVnd ?? 0) > 0
    );

    if (itemsWithSchedule.length > 0) {
      // Milestone-based conversion
      const yearMap = new Map<number, number>();
      for (const item of itemsWithSchedule) {
        const compYear = parseInt((item.expectedCompletionDate as string).slice(0, 4), 10);
        const startYear = item.expectedStartDate
          ? parseInt(item.expectedStartDate.slice(0, 4), 10)
          : currentYear;
        const remainingVal = item.remainingBacklogVnd ?? item.contractValueVnd ?? 0;

        const durationYears = Math.max(1, compYear - startYear + 1);
        const annualSlice = remainingVal / durationYears;

        for (let y = currentYear; y <= Math.min(currentYear + 4, compYear); y++) {
          yearMap.set(y, (yearMap.get(y) ?? 0) + annualSlice);
        }
      }

      for (let y = currentYear; y <= currentYear + 3; y++) {
        const val = yearMap.get(y) ?? 0;
        if (val > 0) {
          projections.push({
            year: y,
            projectedRevenueFromBacklogVnd: Math.round(val),
            completionPercentExpected: Number(((val / confirmedBacklog) * 100).toFixed(1)),
            confidence: 'HIGH',
          });
        }
      }
      notes.push('Revenue conversion modeled using milestone project completion dates.');
    } else {
      // Straight-line conversion across coverage years (default 2.5 years if coverage unavailable)
      const executionYears = Math.max(1, Math.min(5, Math.round(summary.backlogCoverageYears ?? 2.5)));
      const annualStraightLine = Math.round(confirmedBacklog / executionYears);

      for (let i = 0; i < executionYears; i++) {
        const y = currentYear + i;
        projections.push({
          year: y,
          projectedRevenueFromBacklogVnd: annualStraightLine,
          completionPercentExpected: Number(((1 / executionYears) * 100).toFixed(1)),
          confidence: 'MEDIUM',
        });
      }
      notes.push(`Revenue conversion estimated straight-line over ${executionYears} years.`);
    }

    let projectedGrossProfit: number | null = null;
    if (
      historicalGrossMarginPercent !== null &&
      !isNaN(historicalGrossMarginPercent) &&
      historicalGrossMarginPercent >= 0 &&
      historicalGrossMarginPercent <= 100
    ) {
      projectedGrossProfit = Math.round((confirmedBacklog * historicalGrossMarginPercent) / 100);
    }

    return {
      symbol: summary.symbol,
      asOfDate: summary.asOfDate,
      confirmedBacklogVnd: confirmedBacklog,
      scheduleAvailable: itemsWithSchedule.length > 0,
      projectedRevenues: projections,
      averageHistoricalGrossMarginPercent: historicalGrossMarginPercent,
      projectedGrossProfitVnd: projectedGrossProfit,
      conversionStatus: itemsWithSchedule.length > 0 ? 'SCHEDULE_VERIFIED' : 'ESTIMATED_STRAIGHT_LINE',
      notes,
    };
  }
}
