/**
 * PHASE 24 — EARNINGS SNAPSHOT BUILDER
 * ====================================
 * Deterministic assembly of the aggregate EarningsSnapshot. No accounting logic
 * lives here — the builder only aggregates already-computed, fail-closed parts
 * and derives freshness/lineage/warnings.
 */

import type {
  BalanceSheet,
  CashFlowStatement,
  DataFreshnessStatus,
  EarningsCalendarEntry,
  EarningsLineage,
  EarningsQualityResult,
  EarningsReportType,
  EarningsSnapshot,
  EpsResult,
  FinancialPeriod,
  GrowthResult,
  IncomeStatement,
  MarginResult,
  RestatementSelection,
} from './types.ts';
import { EARNINGS_CALCULATION_VERSION, EARNINGS_ENGINE_NAME } from './helpers.ts';
import { mergeLineages } from './lineage.ts';

export interface BuildSnapshotInput {
  readonly symbol: string;
  readonly asOfDate: string;
  readonly fetchedAt?: string;
  readonly sourceTimestamp?: number | null;
  readonly reportType?: EarningsReportType;
  readonly period?: FinancialPeriod | null;
  readonly income?: IncomeStatement | null;
  readonly balanceSheet?: BalanceSheet | null;
  readonly cashFlow?: CashFlowStatement | null;
  readonly eps?: EpsResult | null;
  readonly growth?: GrowthResult | null;
  readonly margins?: MarginResult | null;
  readonly earningsQuality?: EarningsQualityResult | null;
  readonly restatements?: readonly RestatementSelection[];
  readonly calendar?: readonly EarningsCalendarEntry[];
  readonly additionalWarnings?: readonly string[];
  readonly dataFreshness?: DataFreshnessStatus;
}

export class EarningsSnapshotBuilder {
  public static readonly ENGINE_NAME = EARNINGS_ENGINE_NAME;
  public static readonly CALCULATION_VERSION = EARNINGS_CALCULATION_VERSION;

  /** Builds the canonical aggregate earnings snapshot. */
  public static buildSnapshot(input: BuildSnapshotInput): EarningsSnapshot {
    const parts = [
      input.income,
      input.balanceSheet,
      input.cashFlow,
      input.eps,
      input.growth,
      input.margins,
      input.earningsQuality,
    ];
    const hasAnyData = parts.some((p) => p !== null && p !== undefined);

    const warnings: string[] = [...(input.additionalWarnings ?? [])];
    if (!hasAnyData) {
      warnings.push('No canonical financial facts were available for the requested symbol/period.');
    }
    for (const rs of input.restatements ?? []) {
      if (rs.versions.length > 1 && rs.status && rs.status !== 'ORIGINAL') {
        warnings.push(`Statement ${rs.periodId} has ${rs.versions.length} versions (latest: ${rs.status}).`);
      }
    }

    const freshness: DataFreshnessStatus = input.dataFreshness ?? (hasAnyData ? 'CURRENT' : 'UNAVAILABLE');

    // P24-D7/D12: enrich snapshot provenance from already-computed parts
    // (statement IDs, report IDs, publication dates, audit status) instead of
    // shipping sources-only lineage.
    const enrichedLineage: EarningsLineage = mergeLineages(
      [
        ...parts.map((p) => (p as { lineage?: EarningsLineage } | null | undefined)?.lineage),
        ...(input.restatements ?? []).map((rs) => rs.latest?.lineage),
      ],
      this.ENGINE_NAME,
      this.CALCULATION_VERSION
    );
    const lineage: EarningsLineage = {
      ...enrichedLineage,
      periodStart: input.period?.periodStart ?? enrichedLineage.periodStart,
      periodEnd: input.period?.periodEnd ?? enrichedLineage.periodEnd,
    };

    return Object.freeze({
      symbol: input.symbol.trim().toUpperCase(),
      asOfDate: input.asOfDate,
      dataFreshness: freshness,
      fetchedAt: input.fetchedAt ?? new Date().toISOString(),
      sourceTimestamp: input.sourceTimestamp ?? null,
      reportType: input.reportType ?? 'CONSOLIDATED',
      period: input.period ?? null,
      incomeStatement: input.income ?? null,
      balanceSheet: input.balanceSheet ?? null,
      cashFlow: input.cashFlow ?? null,
      eps: input.eps ?? null,
      growth: input.growth ?? null,
      margins: input.margins ?? null,
      earningsQuality: input.earningsQuality ?? null,
      restatements: Object.freeze([...(input.restatements ?? [])]),
      calendar: Object.freeze([...(input.calendar ?? [])]),
      warnings: Object.freeze(warnings),
      lineage,
      // PR-01 canonical key (P24-D7); alias of the enriched lineage above.
      dataLineage: lineage,
    });
  }
}
