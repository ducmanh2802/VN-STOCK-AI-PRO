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

    const sources = new Set<string>();
    for (const p of parts) {
      const l = (p as { lineage?: EarningsLineage } | null | undefined)?.lineage;
      if (l?.sources) for (const s of l.sources) sources.add(s);
    }
    for (const rs of input.restatements ?? []) {
      if (rs.latest?.source) sources.add(rs.latest.source);
    }

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

    const lineage: EarningsLineage = {
      sources: Array.from(sources).sort(),
      engine: this.ENGINE_NAME,
      calculationVersion: this.CALCULATION_VERSION,
      periodStart: input.period?.periodStart ?? null,
      periodEnd: input.period?.periodEnd ?? null,
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
    });
  }
}
