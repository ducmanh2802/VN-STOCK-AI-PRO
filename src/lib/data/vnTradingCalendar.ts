/**
 * VIETNAM EQUITY TRADING CALENDAR (session-date arithmetic)
 * =========================================================
 * Thin, deterministic helpers over the statutory holiday list in
 * `CorporateActionDateEngine` — this module adds no second holiday list.
 *
 * - Dates are 'YYYY-MM-DD' in exchange-local time (Asia/Ho_Chi_Minh, UTC+7, no DST),
 *   derived with Intl rather than the host's local timezone.
 * - The holiday list only covers the years it lists. `isCalendarCovered` lets callers
 *   refuse to make a trading-day claim for an uncovered year instead of guessing.
 */
import {
  CorporateActionDateEngine,
  STATUTORY_VIETNAM_HOLIDAYS,
} from '../corporate-actions/CorporateActionDateEngine.ts';

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const COVERED_YEARS: ReadonlySet<number> = new Set(
  [...STATUTORY_VIETNAM_HOLIDAYS].map((d) => Number(d.slice(0, 4)))
);

const vnFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Exchange-local calendar date and minutes after midnight for an instant. */
export function vnLocalParts(instant: Date): { date: string; minutesOfDay: number } {
  const parts = Object.fromEntries(vnFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function isCalendarCovered(date: string): boolean {
  return ISO_DATE.test(date) && COVERED_YEARS.has(Number(date.slice(0, 4)));
}

export function isVnTradingDay(date: string): boolean {
  return CorporateActionDateEngine.isTradingDay(date);
}

export function addCalendarDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The most recent trading day on or before `date` (bounded walk; null if none in 31 days). */
export function latestTradingDayOnOrBefore(date: string): string | null {
  let current = date;
  for (let i = 0; i <= 31; i++) {
    if (isVnTradingDay(current)) return current;
    current = addCalendarDays(current, -1);
  }
  return null;
}

/**
 * Minutes after local midnight from which a session's daily bar is treated as final.
 * Continuous trading and ATC end at 14:45 and put-through at 15:00; the extra hour is
 * margin for the provider to publish the closing bar. Before this, today's bar is an
 * in-progress snapshot and must not be stored as a daily bar.
 */
export const SESSION_FINALIZATION_MINUTES = 16 * 60;

/**
 * The latest session whose daily bar is final at `instant`: today once the
 * finalization time has passed on a trading day, otherwise the previous trading day.
 */
export function lastFinalizedSession(
  instant: Date,
  finalizationMinutes: number = SESSION_FINALIZATION_MINUTES
): string | null {
  const { date, minutesOfDay } = vnLocalParts(instant);
  if (isVnTradingDay(date) && minutesOfDay >= finalizationMinutes) return date;
  return latestTradingDayOnOrBefore(addCalendarDays(date, -1));
}

/**
 * Trading sessions in the half-open interval (fromExclusive, toInclusive].
 * Returns 0 when `toInclusive <= fromExclusive`. Bounded to ~1 year of walking.
 */
export function tradingSessionsBetween(fromExclusive: string, toInclusive: string): number {
  if (!ISO_DATE.test(fromExclusive) || !ISO_DATE.test(toInclusive) || toInclusive <= fromExclusive) return 0;
  let count = 0;
  let current = addCalendarDays(fromExclusive, 1);
  for (let i = 0; i < 400 && current <= toInclusive; i++) {
    if (isVnTradingDay(current)) count += 1;
    current = addCalendarDays(current, 1);
  }
  return count;
}
