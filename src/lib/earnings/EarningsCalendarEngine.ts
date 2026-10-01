/**
 * PHASE 24 — EARNINGS CALENDAR ENGINE
 * ===================================
 * Normalizes real, source-backed earnings/report-date records. This engine NEVER
 * derives a date from historical patterns and NEVER converts UNKNOWN into an
 * estimate given statistical certainty.
 *
 * Status semantics:
 *   ANNOUNCED — a confirmed date supplied by an authoritative source
 *   EXPECTED  — a date supplied by a source but not yet confirmed
 *   UNKNOWN   — no authoritative date exists (reportDate = null)
 */

import type {
  DataFreshnessStatus,
  EarningsCalendarEntry,
  EarningsCalendarStatus,
  SourceTier,
} from './types.ts';
import { FinancialPeriodEngine } from './FinancialPeriodEngine.ts';
import { buildLineage } from './lineage.ts';
import { EARNINGS_ENGINE_NAME, EARNINGS_CALCULATION_VERSION } from './helpers.ts';

/** Raw, source-supplied calendar record (before normalization). */
export interface RawCalendarRecord {
  readonly symbol: string;
  /** Raw period string, parsed via FinancialPeriodEngine (fail-closed). */
  readonly period: string;
  readonly reportDate?: string | null;
  /** True only when the source explicitly confirms the date. */
  readonly announced?: boolean;
  readonly source?: string | null;
  readonly sourceTier?: SourceTier | null;
  readonly publicationTimestamp?: string | null;
  readonly freshness?: DataFreshnessStatus;
}

export interface EarningsCalendarResult {
  readonly entries: readonly EarningsCalendarEntry[];
  readonly warnings: readonly string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class EarningsCalendarEngine {
  /** Normalizes raw calendar records into canonical entries (deterministic). */
  public static buildCalendar(symbol: string, records: readonly RawCalendarRecord[]): EarningsCalendarResult {
    const sym = symbol.trim().toUpperCase();
    const warnings: string[] = [];
    const byPeriod = new Map<string, EarningsCalendarEntry>();

    for (const rec of records) {
      const period = FinancialPeriodEngine.parse(rec.period);
      if (!period) {
        warnings.push(`Unparseable calendar period "${rec.period}" for ${sym} — skipped (fail-closed).`);
        continue;
      }

      let status: EarningsCalendarStatus = 'UNKNOWN';
      let reportDate: string | null = null;
      let reason: EarningsCalendarEntry['reason'];

      if (rec.reportDate && ISO_DATE.test(rec.reportDate)) {
        reportDate = rec.reportDate;
        status = rec.announced === true ? 'ANNOUNCED' : 'EXPECTED';
      } else if (rec.reportDate) {
        reason = 'CORRUPTED_DOCUMENT_STRUCTURE';
      } else {
        reason = 'REQUIRED_LINE_ITEM_NOT_FOUND';
      }

      const freshness: DataFreshnessStatus = rec.freshness ?? (reportDate ? 'CURRENT' : 'UNAVAILABLE');

      const entry: EarningsCalendarEntry = Object.freeze({
        symbol: sym,
        period,
        status,
        reportDate,
        source: rec.source ?? null,
        sourceTier: rec.sourceTier ?? null,
        publicationTimestamp: rec.publicationTimestamp ?? null,
        freshness,
        reason,
        lineage: buildLineage([], {
          engine: 'EarningsCalendarEngine',
          extraSources: rec.source ? [rec.source] : [],
        }),
      });

      // Duplicate/amended handling: keep the most recently published record.
      const existing = byPeriod.get(period.id);
      if (!existing || this.isNewer(entry, existing)) {
        byPeriod.set(period.id, entry);
      }
    }

    const entries = Array.from(byPeriod.values()).sort((a, b) => {
      if (a.reportDate && b.reportDate) return a.reportDate.localeCompare(b.reportDate) || a.period.id.localeCompare(b.period.id);
      if (a.reportDate) return -1;
      if (b.reportDate) return 1;
      return a.period.id.localeCompare(b.period.id);
    });

    return { entries, warnings };
  }

  /** True when `candidate` is a later publication than `current`. */
  private static isNewer(candidate: EarningsCalendarEntry, current: EarningsCalendarEntry): boolean {
    const c = candidate.publicationTimestamp ?? '';
    const p = current.publicationTimestamp ?? '';
    if (c !== p) return c > p;
    // Prefer a concrete date over an unknown date.
    return candidate.reportDate !== null && current.reportDate === null;
  }

  /** Stable lineage constants for callers constructing empty calendars. */
  public static readonly ENGINE = EARNINGS_ENGINE_NAME;
  public static readonly CALCULATION_VERSION = EARNINGS_CALCULATION_VERSION;
}
