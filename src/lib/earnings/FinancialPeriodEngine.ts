/**
 * PHASE 24 — FINANCIAL PERIOD ENGINE
 * ==================================
 * Deterministic construction, parsing, validation, ordering and comparability of
 * canonical fiscal periods. This engine exists to make quarter-vs-YTD confusion
 * (Q1 ≠ H1, Q2 ≠ H1, Q3 ≠ 9M, Q4 ≠ FY, FY ≠ TTM) structurally impossible.
 *
 * Fail-closed: unparseable or ambiguous period strings return `null`; the caller
 * MUST NOT guess a period.
 *
 * Default fiscal calendar = Vietnam standard calendar year (Jan 1 .. Dec 31).
 */

import type {
  FinancialPeriod,
  FinancialPeriodType,
  FiscalCalendarConfig,
  PeriodAccumulation,
  PeriodValidationResult,
} from './types.ts';

export const DEFAULT_FISCAL_CONFIG: FiscalCalendarConfig = { fiscalYearEndMonth: 12 };

const QUARTER_START_MONTH: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };
const QUARTER_END_MONTH: Record<1 | 2 | 3 | 4, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Inclusive day count between two ISO dates (YYYY-MM-DD). */
export function inclusiveDayCount(startIso: string, endIso: string): number {
  const start = Date.UTC(Number(startIso.slice(0, 4)), Number(startIso.slice(5, 7)) - 1, Number(startIso.slice(8, 10)));
  const end = Date.UTC(Number(endIso.slice(0, 4)), Number(endIso.slice(5, 7)) - 1, Number(endIso.slice(8, 10)));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return -1;
  return Math.round((end - start) / 86_400_000) + 1;
}

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function requiresCumulative(type: FinancialPeriodType): boolean {
  return type === 'H1' || type === '9M' || type === 'FY' || type === 'YTD';
}

export class FinancialPeriodEngine {
  /**
   * Builds a canonical period for a quarterly window (Q1..Q4).
   */
  public static quarter(fiscalYear: number, quarter: 1 | 2 | 3 | 4): FinancialPeriod {
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
      throw new Error(`FinancialPeriodEngine.quarter: invalid fiscalYear "${fiscalYear}".`);
    }
    const startMonth = QUARTER_START_MONTH[quarter];
    const endMonth = QUARTER_END_MONTH[quarter];
    const periodStart = iso(fiscalYear, startMonth, 1);
    const periodEnd = iso(fiscalYear, endMonth, lastDayOfMonth(fiscalYear, endMonth));
    return Object.freeze({
      id: `Q${quarter}-${fiscalYear}`,
      type: `Q${quarter}` as FinancialPeriodType,
      fiscalYear,
      quarter,
      periodStart,
      periodEnd,
      durationDays: inclusiveDayCount(periodStart, periodEnd),
      accumulation: 'DISCRETE' as PeriodAccumulation,
    });
  }

  /** Calendar-year start/end anchors for a fiscal year. */
  private static yearBounds(fiscalYear: number): { start: string; end: string } {
    return {
      start: iso(fiscalYear, 1, 1),
      end: iso(fiscalYear, 12, 31),
    };
  }

  /**
   * Builds a cumulative period (H1, 9M, FY, YTD) for a fiscal year.
   * `upToMonth` (1..12) is required for `YTD`; ignored otherwise.
   */
  public static cumulative(
    fiscalYear: number,
    type: 'H1' | '9M' | 'FY' | 'YTD',
    upToMonth?: number
  ): FinancialPeriod {
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
      throw new Error(`FinancialPeriodEngine.cumulative: invalid fiscalYear "${fiscalYear}".`);
    }
    const bounds = this.yearBounds(fiscalYear);
    let periodEnd: string;
    let quarter: 1 | 2 | 3 | 4 | null = null;
    let id: string;

    switch (type) {
      case 'H1':
        periodEnd = iso(fiscalYear, 6, 30);
        quarter = 2;
        id = `H1-${fiscalYear}`;
        break;
      case '9M':
        periodEnd = iso(fiscalYear, 9, 30);
        quarter = 3;
        id = `9M-${fiscalYear}`;
        break;
      case 'FY':
        periodEnd = bounds.end;
        quarter = 4;
        id = `FY${fiscalYear}`;
        break;
      case 'YTD': {
        const month = upToMonth ?? 12;
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          throw new Error(`FinancialPeriodEngine.cumulative: invalid YTD month "${upToMonth}".`);
        }
        periodEnd = iso(fiscalYear, month, lastDayOfMonth(fiscalYear, month));
        quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
        id = `YTD-${fiscalYear}-${pad2(month)}`;
        break;
      }
    }

    return Object.freeze({
      id,
      type,
      fiscalYear,
      quarter,
      periodStart: bounds.start,
      periodEnd,
      durationDays: inclusiveDayCount(bounds.start, periodEnd),
      accumulation: 'CUMULATIVE' as PeriodAccumulation,
    });
  }

  /**
   * Builds a rolling twelve-month (TTM) window from exactly four consecutive
   * quarters. Returns `null` when the quarters are not exactly four consecutive
   * discrete quarterly windows (fail-closed).
   */
  public static buildTTM(quarters: readonly FinancialPeriod[]): FinancialPeriod | null {
    if (quarters.length !== 4) return null;
    for (const q of quarters) {
      if (q.accumulation !== 'DISCRETE' || q.quarter === null || !/^Q[1-4]$/.test(q.type)) {
        return null;
      }
    }
    const indices = quarters
      .map((q) => q.fiscalYear * 4 + (q.quarter as number) - 1)
      .sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) return null; // must be consecutive
    }
    const sorted = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    const first = sorted[0];
    const last = sorted[3];
    return Object.freeze({
      id: `TTM-${last.fiscalYear}-Q${last.quarter}`,
      type: 'TTM' as FinancialPeriodType,
      fiscalYear: last.fiscalYear,
      quarter: last.quarter,
      periodStart: first.periodStart,
      periodEnd: last.periodEnd,
      durationDays: inclusiveDayCount(first.periodStart, last.periodEnd),
      accumulation: 'DISCRETE' as PeriodAccumulation,
    });
  }

  /**
   * Parses a raw period string into a canonical period. Accepts forms such as
   * `FY_2024`, `FY2024`, `Q1-2024`, `Q1_2024`, `2024Q1`, `H1-2024`, `9M_2024`,
   * `TTM-2024-Q4`. Returns `null` when the string is unmappable or ambiguous.
   * NEVER guesses a quarter from an unqualified year.
   */
  public static parse(raw: string): FinancialPeriod | null {
    if (typeof raw !== 'string') return null;
    const s = raw.trim().toUpperCase().replace(/_/g, '-').replace(/\s+/g, '');
    if (!s) return null;

    let m = /^TTM-(\d{4})-Q([1-4])$/.exec(s);
    if (m) {
      const fy = Number(m[1]);
      const q = Number(m[2]) as 1 | 2 | 3 | 4;
      const endIndex = fy * 4 + q - 1;
      const quarters: FinancialPeriod[] = [];
      for (let i = endIndex - 3; i <= endIndex; i++) {
        const y = Math.floor(i / 4);
        const qq = (i % 4) + 1;
        quarters.push(this.quarter(y, qq as 1 | 2 | 3 | 4));
      }
      return this.buildTTM(quarters);
    }

    m = /^Q([1-4])-?(\d{4})$/.exec(s);
    if (m) return this.quarter(Number(m[2]), Number(m[1]) as 1 | 2 | 3 | 4);

    m = /^(\d{4})-?Q([1-4])$/.exec(s);
    if (m) return this.quarter(Number(m[1]), Number(m[2]) as 1 | 2 | 3 | 4);

    m = /^FY-?(\d{4})$/.exec(s);
    if (m) return this.cumulative(Number(m[1]), 'FY');

    m = /^H1-?(\d{4})$/.exec(s);
    if (m) return this.cumulative(Number(m[1]), 'H1');

    m = /^9M-?(\d{4})$/.exec(s);
    if (m) return this.cumulative(Number(m[1]), '9M');

    m = /^YTD-?(\d{4})-?(\d{2})$/.exec(s);
    if (m) return this.cumulative(Number(m[1]), 'YTD', Number(m[2]));

    return null;
  }

  /**
   * Deterministic structural validation of a period.
   */
  public static validate(period: FinancialPeriod | null | undefined): PeriodValidationResult {
    const errors: string[] = [];
    if (!period) {
      return { isValid: false, errors: ['Period is null/undefined.'] };
    }
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRe.test(period.periodStart)) errors.push(`Invalid periodStart "${period.periodStart}".`);
    if (!isoRe.test(period.periodEnd)) errors.push(`Invalid periodEnd "${period.periodEnd}".`);
    if (errors.length > 0) return { isValid: false, errors };

    if (period.periodStart > period.periodEnd) {
      errors.push(`periodStart (${period.periodStart}) must be <= periodEnd (${period.periodEnd}).`);
    }
    const expectedDuration = inclusiveDayCount(period.periodStart, period.periodEnd);
    if (expectedDuration <= 0) errors.push('Period duration must be strictly positive.');
    if (period.durationDays !== expectedDuration) {
      errors.push(`durationDays (${period.durationDays}) inconsistent with start/end (${expectedDuration}).`);
    }
    if (requiresCumulative(period.type) && period.accumulation !== 'CUMULATIVE') {
      errors.push(`Period type ${period.type} must be CUMULATIVE.`);
    }
    if (period.type.startsWith('Q') && period.accumulation !== 'DISCRETE') {
      errors.push(`Period type ${period.type} must be DISCRETE.`);
    }
    if (period.type === 'FY' && period.periodEnd.slice(5) !== '12-31') {
      errors.push('FY period must end on a fiscal-year end (default 12-31).');
    }
    return { isValid: errors.length === 0, errors };
  }

  /** Total ordering: earlier periodEnd first; ties broken by shorter duration first. */
  public static compare(a: FinancialPeriod, b: FinancialPeriod): number {
    if (a.periodEnd !== b.periodEnd) return a.periodEnd < b.periodEnd ? -1 : 1;
    if (a.durationDays !== b.durationDays) return a.durationDays - b.durationDays;
    return a.id.localeCompare(b.id);
  }

  /** True when two periods are the exact same canonical identity. */
  public static isSameIdentity(a: FinancialPeriod, b: FinancialPeriod): boolean {
    return a.id === b.id;
  }

  /**
   * True when two periods are directly comparable (same type, accumulation,
   * duration and quarter) — a growth comparison is valid without a transform.
   */
  public static isComparable(a: FinancialPeriod | null, b: FinancialPeriod | null): boolean {
    if (!a || !b) return false;
    if (a.id === b.id) return false;
    return (
      a.type === b.type &&
      a.accumulation === b.accumulation &&
      a.durationDays === b.durationDays &&
      a.quarter === b.quarter
    );
  }

  /** True when `a` and `b` are comparable windows in adjacent fiscal years (YoY). */
  public static isYearOverYearPair(a: FinancialPeriod, b: FinancialPeriod): boolean {
    return this.isComparable(a, b) && b.fiscalYear === a.fiscalYear - 1;
  }

  /** True when `b` is the immediately preceding discrete quarter of `a` (QoQ). */
  public static isQuarterOverQuarterPair(a: FinancialPeriod | null, b: FinancialPeriod | null): boolean {
    if (!a || !b) return false;
    if (a.accumulation !== 'DISCRETE' || b.accumulation !== 'DISCRETE') return false;
    if (a.quarter === null || b.quarter === null) return false;
    if (!/^Q[1-4]$/.test(a.type) || !/^Q[1-4]$/.test(b.type)) return false;
    const ai = a.fiscalYear * 4 + (a.quarter - 1);
    const bi = b.fiscalYear * 4 + (b.quarter - 1);
    return ai - bi === 1;
  }
}
