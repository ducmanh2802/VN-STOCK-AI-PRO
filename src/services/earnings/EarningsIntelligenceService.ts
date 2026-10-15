/**
 * PHASE 24 — EARNINGS INTELLIGENCE SERVICE
 * ========================================
 * Orchestrates the Phase 24 domain engines into a deterministic, cached
 * EarningsSnapshot. Mirrors the Phase 20/22/23 service pattern:
 *   - in-memory TTL cache (60 s), keyed by symbol + asOfDate + reportType
 *   - forceRefresh support
 *   - strict fail-closed: never returns fabricated data; UNAVAILABLE is explicit
 */

import { cacheGet, cacheSet } from '../market/marketDataCache.ts';
import { EarningsDataProvider, combineFreshness, type EarningsFactRequest } from './EarningsDataProvider.ts';
import { RestatementEngine } from '../../lib/earnings/RestatementEngine.ts';
import { IncomeStatementEngine } from '../../lib/earnings/IncomeStatementEngine.ts';
import { BalanceSheetEngine } from '../../lib/earnings/BalanceSheetEngine.ts';
import { CashFlowEngine, type CashFlowPresentation } from '../../lib/earnings/CashFlowEngine.ts';
import { EpsEngine, type ShareAdjustmentEvent } from '../../lib/earnings/EpsEngine.ts';
import { EarningsGrowthEngine, type PeriodValue } from '../../lib/earnings/EarningsGrowthEngine.ts';
import { MarginEngine } from '../../lib/earnings/MarginEngine.ts';
import { EarningsQualityEngine } from '../../lib/earnings/EarningsQualityEngine.ts';
import { EarningsCalendarEngine, type RawCalendarRecord } from '../../lib/earnings/EarningsCalendarEngine.ts';
import { EarningsSnapshotBuilder } from '../../lib/earnings/EarningsSnapshotBuilder.ts';
import { FinancialPeriodEngine } from '../../lib/earnings/FinancialPeriodEngine.ts';
import type {
  CanonicalFinancialFact,
  EarningsReportType,
  EarningsSnapshot,
  FinancialPeriod,
} from '../../lib/earnings/types.ts';

const SNAPSHOT_CACHE_PREFIX = 'EARNINGS_SNAPSHOT_';
const SNAPSHOT_CACHE_TTL_MS = 60_000; // 60 seconds (matches market / corporate-actions convention)

export interface GetEarningsSnapshotOptions {
  readonly asOfDate?: string;
  readonly forceRefresh?: boolean;
  readonly reportType?: EarningsReportType;
  /** Real authoritative payload requests (one per reporting period). */
  readonly payloads?: readonly EarningsFactRequest[];
  readonly weightedShares?: number | null;
  readonly dilutedShares?: number | null;
  readonly corporateActions?: readonly ShareAdjustmentEvent[];
  readonly calendarRecords?: readonly RawCalendarRecord[];
}

export class EarningsIntelligenceService {
  private static readonly provider = new EarningsDataProvider();

  /** Retrieves or computes the cached earnings snapshot. */
  public static async getSnapshot(
    symbol: string,
    options?: GetEarningsSnapshotOptions
  ): Promise<EarningsSnapshot> {
    const sym = symbol.trim().toUpperCase();
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const reportType: EarningsReportType = options?.reportType ?? 'CONSOLIDATED';
    const cacheKey = `${SNAPSHOT_CACHE_PREFIX}${sym}_${asOfDate}_${reportType}`;

    if (!options?.forceRefresh) {
      const cached = cacheGet<EarningsSnapshot>(cacheKey);
      if (cached) return cached;
    }

    const snapshot = await this.compute(sym, asOfDate, reportType, options);
    cacheSet(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_MS);
    return snapshot;
  }

  /** Deterministic, fail-closed snapshot computation. */
  private static async compute(
    sym: string,
    asOfDate: string,
    reportType: EarningsReportType,
    options?: GetEarningsSnapshotOptions
  ): Promise<EarningsSnapshot> {
    const fetchedAt = new Date().toISOString();
    const issues: string[] = [];

    // 1. Gather canonical facts from real authoritative payloads.
    const store = new RestatementEngine();
    let presentation: CashFlowPresentation = 'UNKNOWN';

    for (const req of options?.payloads ?? []) {
      const res = await this.provider.getFacts({ ...req, symbol: sym, reportType });
      store.appendMany(res.facts);
      if (res.presentation !== 'UNKNOWN') presentation = res.presentation;
      for (const issue of res.issues) issues.push(issue);
    }

    const allFacts = store.getAll();
    if (allFacts.length === 0) {
      return this.emptySnapshot(sym, asOfDate, reportType, fetchedAt, [
        ...issues,
        `No authoritative financial facts supplied for ${sym} (fail-closed).`,
      ]);
    }

    // 2. Determine the latest period present for the requested report type.
    const periods = this.distinctPeriods(allFacts, sym, reportType);
    const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
    if (!latestPeriod) {
      return this.emptySnapshot(sym, asOfDate, reportType, fetchedAt, [
        ...issues,
        `No facts found for report type ${reportType}.`,
      ]);
    }

    const latestFacts = this.latestFactsFor(sym, reportType, latestPeriod.id, store);
    const priorPeriod = this.previousPeriod(periods, latestPeriod);

    // 3. Statements
    const income = IncomeStatementEngine.normalize(latestFacts, latestPeriod, reportType);
    const balanceSheet = BalanceSheetEngine.normalize(latestFacts, latestPeriod, reportType);
    const cashFlow = CashFlowEngine.normalize(latestFacts, latestPeriod, reportType, presentation);

    const prevFacts = priorPeriod ? this.latestFactsFor(sym, reportType, priorPeriod.id, store) : [];
    const priorIncome = priorPeriod ? IncomeStatementEngine.normalize(prevFacts, priorPeriod, reportType) : null;
    const priorBalance = priorPeriod ? BalanceSheetEngine.normalize(prevFacts, priorPeriod, reportType) : null;

    // 4. EPS (read-only Phase 23 corporate-action comparability)
    const eps = EpsEngine.compute(
      {
        symbol: sym,
        period: latestPeriod,
        reportType,
        netProfit: income.netProfit,
        parentNetProfit: income.parentNetProfit,
        weightedShares: options?.weightedShares ?? null,
        dilutedShares: options?.dilutedShares ?? null,
        corporateActions: options?.corporateActions,
      },
      latestFacts
    );

    // 5. Growth (YoY primary + TTM)
    const growth = EarningsGrowthEngine.evaluate(
      {
        symbol: sym,
        currentPeriod: latestPeriod,
        revenueSeries: this.seriesFor(store, sym, reportType, ['NET_REVENUE', 'REVENUE']),
        netProfitSeries: this.seriesFor(store, sym, reportType, ['NET_PROFIT']),
        parentNetProfitSeries: this.seriesFor(store, sym, reportType, ['PARENT_NET_PROFIT', 'NET_PROFIT_ATTRIBUTABLE_TO_PARENT']),
        epsSeries: this.epsSeries(store, sym, reportType, periods, options?.weightedShares ?? null),
      },
      latestFacts
    );

    // 6. Margins + quality
    const margins = MarginEngine.normalize(income, cashFlow);
    const earningsQuality = EarningsQualityEngine.evaluate({
      income,
      cashFlow,
      balanceSheet,
      previousBalanceSheet: priorBalance,
      previousIncome: priorIncome,
      adjustedForRestatement: this.anyRestated(latestFacts),
    });

    // 7. Restatements (one selection per statement type for the latest period)
    const restatements = (['INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW'] as const).map((st) =>
      store.selectLatest(sym, st, reportType, latestPeriod.id)
    );

    // 8. Calendar
    const calendarResult = EarningsCalendarEngine.buildCalendar(sym, options?.calendarRecords ?? []);

    const freshness = combineFreshness([
      ...allFacts.map((f) => f.freshness),
      ...calendarResult.entries.map((e) => e.freshness),
    ]);

    return EarningsSnapshotBuilder.buildSnapshot({
      symbol: sym,
      asOfDate,
      fetchedAt,
      sourceTimestamp: maxSourceTimestamp(allFacts),
      reportType,
      period: latestPeriod,
      income,
      balanceSheet,
      cashFlow,
      eps,
      growth,
      margins,
      earningsQuality,
      restatements,
      calendar: calendarResult.entries,
      additionalWarnings: [...issues, ...calendarResult.warnings],
      dataFreshness: freshness,
    });
  }

  private static distinctPeriods(
    facts: readonly CanonicalFinancialFact[],
    sym: string,
    reportType: EarningsReportType
  ): FinancialPeriod[] {
    const upper = sym.trim().toUpperCase();
    const map = new Map<string, FinancialPeriod>();
    for (const f of facts) {
      // Fail-closed (P24-D3): never mix facts across symbols.
      if (f.symbol.toUpperCase() !== upper) continue;
      if (f.reportType !== reportType) continue;
      map.set(f.period.id, f.period);
    }
    return Array.from(map.values()).sort((a, b) => FinancialPeriodEngine.compare(a, b));
  }

  private static previousPeriod(
    periods: readonly FinancialPeriod[],
    current: FinancialPeriod
  ): FinancialPeriod | null {
    const idx = periods.findIndex((p) => p.id === current.id);
    if (idx <= 0) return null;
    return periods[idx - 1];
  }

  /** Latest authoritative fact per metric for one period/report type (append-only safe). */
  private static latestFactsFor(
    sym: string,
    reportType: EarningsReportType,
    periodId: string,
    store: RestatementEngine
  ): CanonicalFinancialFact[] {
    const upper = sym.trim().toUpperCase();
    const scoped = store
      .getAll()
      // Fail-closed (P24-D3): the symbol parameter is authoritative; facts from
      // any other symbol are excluded to prevent cross-symbol contamination.
      .filter((f) => f.symbol.toUpperCase() === upper && f.reportType === reportType && f.period.id === periodId);
    const byMetric = new Map<string, CanonicalFinancialFact[]>();
    for (const f of scoped) {
      const list = byMetric.get(f.metric) ?? [];
      list.push(f);
      byMetric.set(f.metric, list);
    }
    const result: CanonicalFinancialFact[] = [];
    for (const list of byMetric.values()) {
      const pick = RestatementEngine.pickLatest(list);
      if (pick) result.push(pick);
    }
    return result;
  }

  /** Deterministic period-value series across the first available metric alias. */
  private static seriesFor(
    store: RestatementEngine,
    sym: string,
    reportType: EarningsReportType,
    metrics: readonly string[]
  ): PeriodValue[] {
    const upper = sym.trim().toUpperCase();
    const points: PeriodValue[] = [];
    const seen = new Set<string>();
    for (const metric of metrics) {
      const scoped = store.getAll().filter(
        (f) => f.symbol.toUpperCase() === upper && f.reportType === reportType && f.metric === metric
      );
      const byPeriod = new Map<string, CanonicalFinancialFact>();
      for (const f of scoped) {
        const prev = byPeriod.get(f.period.id);
        const picked = RestatementEngine.pickLatest(prev ? [prev, f] : [f]);
        if (picked) byPeriod.set(f.period.id, picked);
      }
      for (const f of byPeriod.values()) {
        if (seen.has(f.period.id)) continue;
        seen.add(f.period.id);
        points.push({ period: f.period, value: f.value });
      }
    }
    return points.sort((a, b) => FinancialPeriodEngine.compare(a.period, b.period));
  }

  private static epsSeries(
    store: RestatementEngine,
    sym: string,
    reportType: EarningsReportType,
    periods: readonly FinancialPeriod[],
    weightedShares: number | null
  ): PeriodValue[] {
    if (weightedShares === null || weightedShares <= 0) return [];
    return periods.map((period) => {
      const facts = this.latestFactsFor(sym, reportType, period.id, store);
      const income = IncomeStatementEngine.normalize(facts, period, reportType);
      const profit = income.parentNetProfit ?? income.netProfit;
      return { period, value: profit === null ? null : Number((profit / weightedShares).toFixed(2)) };
    });
  }

  private static anyRestated(facts: readonly CanonicalFinancialFact[]): boolean {
    return facts.some((f) => f.restatementStatus !== 'ORIGINAL' || (f.restatementVersion ?? 0) > 0);
  }

  private static emptySnapshot(
    sym: string,
    asOfDate: string,
    reportType: EarningsReportType,
    fetchedAt: string,
    warnings: readonly string[]
  ): EarningsSnapshot {
    return EarningsSnapshotBuilder.buildSnapshot({
      symbol: sym,
      asOfDate,
      fetchedAt,
      reportType,
      additionalWarnings: warnings,
      dataFreshness: 'UNAVAILABLE',
    });
  }
}

/**
 * Latest source publication instant across facts, as epoch millis.
 * Fail-closed (P24-D6): null when no fact carries a parseable publication date.
 */
function maxSourceTimestamp(facts: readonly CanonicalFinancialFact[]): number | null {
  let max: number | null = null;
  for (const f of facts) {
    if (!f.publicationDate) continue;
    const t = Date.parse(f.publicationDate);
    if (!Number.isFinite(t)) continue;
    if (max === null || t > max) max = t;
  }
  return max;
}
