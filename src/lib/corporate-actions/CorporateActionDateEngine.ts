/**
 * PHASE 23 — CORPORATE ACTIONS DATE ENGINE
 * ========================================
 * Deterministic settlement calendar and event date validator for Vietnam equity markets.
 *
 * CANONICAL RULES (VSDC / HOSE / HNX):
 * 1. Settlement Cycle: T+2 clearing model.
 * 2. Ex-Right Date (Ngày giao dịch không hưởng quyền - GDKHQ):
 *    Exactly ONE valid trading business day immediately preceding the Record Date (Ngày ĐKCC).
 * 3. Holiday Awareness: Skips weekends and statutory Vietnam public holidays
 *    (Tet, Hung Kings, Reunification Apr 30, Labor Day May 1, National Day Sep 2, New Year Jan 1).
 * 4. Date Chronology: announcementDate <= exDate < recordDate <= paymentDate <= tradingDate.
 */

import type { CorporateActionDates } from './types.ts';

/**
 * Standard authoritative Vietnam public holidays (format: YYYY-MM-DD).
 * Verified official government schedule 2024–2027.
 */
export const STATUTORY_VIETNAM_HOLIDAYS = new Set<string>([
  // 2024
  '2024-01-01',
  '2024-02-08', '2024-02-09', '2024-02-12', '2024-02-13', '2024-02-14',
  '2024-04-18', '2024-04-30', '2024-05-01',
  '2024-09-02', '2024-09-03',
  // 2025
  '2025-01-01',
  '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-04-07', '2025-04-30', '2025-05-01', '2025-05-02',
  '2025-09-01', '2025-09-02',
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-26', '2026-04-30', '2026-05-01',
  '2026-09-01', '2026-09-02',
  // 2027
  '2027-01-01',
  '2027-02-05', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11',
  '2027-04-16', '2027-04-30', '2027-05-03',
  '2027-09-02', '2027-09-03',
]);

export interface DateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class CorporateActionDateEngine {
  /**
   * Checks whether a given ISO date (YYYY-MM-DD) falls on a weekend (Saturday/Sunday).
   */
  public static isWeekend(dateStr: string): boolean {
    const d = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return false;
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  }

  /**
   * Checks whether a given ISO date is a statutory Vietnam public holiday.
   */
  public static isPublicHoliday(dateStr: string): boolean {
    return STATUTORY_VIETNAM_HOLIDAYS.has(dateStr);
  }

  /**
   * Checks whether a given ISO date is an active equity trading session (HOSE/HNX).
   */
  public static isTradingDay(dateStr: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    if (this.isWeekend(dateStr)) return false;
    if (this.isPublicHoliday(dateStr)) return false;
    return true;
  }

  /**
   * Computes the immediately preceding trading day before the target date.
   */
  public static getPrecedingTradingDay(dateStr: string): string {
    let current = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(current.getTime())) {
      throw new Error(`Invalid date string: "${dateStr}"`);
    }

    while (true) {
      // Step back 1 calendar day
      current = new Date(current.getTime() - 86_400_000);
      const iso = current.toISOString().slice(0, 10);
      if (this.isTradingDay(iso)) {
        return iso;
      }
    }
  }

  /**
   * Computes the immediately succeeding trading day following the target date.
   */
  public static getNextTradingDay(dateStr: string): string {
    let current = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(current.getTime())) {
      throw new Error(`Invalid date string: "${dateStr}"`);
    }

    while (true) {
      // Step forward 1 calendar day
      current = new Date(current.getTime() + 86_400_000);
      const iso = current.toISOString().slice(0, 10);
      if (this.isTradingDay(iso)) {
        return iso;
      }
    }
  }

  /**
   * Derives the official Ex-Right Date (Ngày GDKHQ) from the Record Date (Ngày ĐKCC).
   * In Vietnam (T+2), Ex-Date is exactly 1 trading business day before Record Date.
   */
  public static deriveExDateFromRecordDate(recordDate: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
      throw new Error(`Invalid recordDate format: "${recordDate}". Expected YYYY-MM-DD.`);
    }
    return this.getPrecedingTradingDay(recordDate);
  }

  /**
   * Validates chronological and legal validity of a corporate action date schedule.
   */
  public static validateDates(dates: CorporateActionDates): DateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Format checks
    if (!dates.recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(dates.recordDate)) {
      errors.push(`Invalid or missing recordDate: "${dates.recordDate}".`);
    }
    if (!dates.exDate || !/^\d{4}-\d{2}-\d{2}$/.test(dates.exDate)) {
      errors.push(`Invalid or missing exDate: "${dates.exDate}".`);
    }

    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // 2. Ex-Date must precede Record Date
    if (dates.exDate >= dates.recordDate) {
      errors.push(`exDate (${dates.exDate}) must be strictly earlier than recordDate (${dates.recordDate}).`);
    }

    // 3. Expected T+2 relationship
    try {
      const expectedExDate = this.deriveExDateFromRecordDate(dates.recordDate);
      if (dates.exDate !== expectedExDate) {
        warnings.push(
          `exDate (${dates.exDate}) deviates from standard T+2 trading calendar derivation (${expectedExDate}).`
        );
      }
    } catch (e) {
      errors.push(`Failed to calculate expected exDate from recordDate: ${(e as Error).message}`);
    }

    // 4. Announcement date ordering
    if (dates.announcementDate) {
      if (dates.announcementDate > dates.exDate) {
        errors.push(`announcementDate (${dates.announcementDate}) cannot be after exDate (${dates.exDate}).`);
      }
    }

    // 5. Payment date ordering
    if (dates.paymentDate) {
      if (dates.paymentDate < dates.recordDate) {
        errors.push(`paymentDate (${dates.paymentDate}) cannot be earlier than recordDate (${dates.recordDate}).`);
      }
    }

    // 6. Trading date ordering
    if (dates.tradingDate) {
      if (dates.tradingDate < dates.recordDate) {
        errors.push(`tradingDate (${dates.tradingDate}) cannot be earlier than recordDate (${dates.recordDate}).`);
      }
    }

    // 7. Rights subscription period ordering
    if (dates.rightsStartDate && dates.rightsEndDate) {
      if (dates.rightsStartDate > dates.rightsEndDate) {
        errors.push(
          `rightsStartDate (${dates.rightsStartDate}) cannot be after rightsEndDate (${dates.rightsEndDate}).`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
