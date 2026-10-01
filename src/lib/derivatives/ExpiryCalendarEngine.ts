/**
 * PHASE 21 — EXPIRY CALENDAR ENGINE
 * ===================================
 * Deterministic expiration and settlement calendar for Vietnam index futures (HNX).
 *
 * CANONICAL RULES (HNX / VSD):
 * 1. Expiration Date (Last Trading Day): The THIRD THURSDAY of the contract maturity month.
 * 2. Non-Trading Day / Holiday Fallback: If the third Thursday is a public holiday
 *    or exchange closure day, expiration moves to the IMMEDIATELY PRECEDING business day.
 * 3. Final Settlement: Cash settlement based on the average index value in the last
 *    30 minutes of the underlying index session on the expiration date.
 */

export interface ExpiryDateInfo {
  year: number;
  month: number; // 1 - 12
  rawThirdThursday: string; // YYYY-MM-DD
  adjustedExpiryDate: string; // YYYY-MM-DD
  isHolidayAdjusted: boolean;
  settlementDate: string; // YYYY-MM-DD
}

/**
 * Standard known Vietnam public holidays (format: YYYY-MM-DD).
 * Covers statutory holidays: Tet, Hung Kings, Reunification (Apr 30),
 * Labor Day (May 1), National Day (Sep 2), New Year (Jan 1).
 */
const KNOWN_VIETNAM_HOLIDAYS = new Set<string>([
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

export class ExpiryCalendarEngine {
  /**
   * Checks whether a given ISO date (YYYY-MM-DD) is a weekend (Saturday or Sunday).
   */
  public static isWeekend(dateStr: string): boolean {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  }

  /**
   * Checks whether a given ISO date is a statutory Vietnam public holiday.
   */
  public static isPublicHoliday(dateStr: string): boolean {
    return KNOWN_VIETNAM_HOLIDAYS.has(dateStr);
  }

  /**
   * Checks whether a given date is a valid trading day for HNX derivatives.
   */
  public static isTradingDay(dateStr: string): boolean {
    if (this.isWeekend(dateStr)) return false;
    if (this.isPublicHoliday(dateStr)) return false;
    return true;
  }

  /**
   * Adjusts a target date backwards to the immediately preceding valid business day.
   */
  public static adjustPrecedingBusinessDay(dateStr: string): string {
    let current = new Date(`${dateStr}T12:00:00Z`);
    while (true) {
      const iso = current.toISOString().slice(0, 10);
      if (this.isTradingDay(iso)) {
        return iso;
      }
      // Step back 1 calendar day
      current = new Date(current.getTime() - 86_400_000);
    }
  }

  /**
   * Computes the exact 3rd Thursday of a given year and month (1-12).
   */
  public static getRawThirdThursday(year: number, month: number): string {
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month ${month}. Must be between 1 and 12.`);
    }

    const thursdays: number[] = [];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCDay() === 4) { // Thursday is day 4 (Sunday=0, Thursday=4)
        thursdays.push(day);
      }
    }

    if (thursdays.length < 3) {
      throw new Error(`Month ${year}-${month} unexpectedly has fewer than 3 Thursdays.`);
    }

    const thirdThursdayDay = thursdays[2];
    const monthPad = String(month).padStart(2, '0');
    const dayPad = String(thirdThursdayDay).padStart(2, '0');
    return `${year}-${monthPad}-${dayPad}`;
  }

  /**
   * Computes the canonical expiration and settlement schedule for a contract month.
   */
  public static getExpiryInfo(year: number, month: number): ExpiryDateInfo {
    const rawThursday = this.getRawThirdThursday(year, month);
    const adjustedDate = this.adjustPrecedingBusinessDay(rawThursday);

    return {
      year,
      month,
      rawThirdThursday: rawThursday,
      adjustedExpiryDate: adjustedDate,
      isHolidayAdjusted: adjustedDate !== rawThursday,
      settlementDate: adjustedDate,
    };
  }

  /**
   * Calculates calendar days remaining from reference date to expiration date.
   * If reference date is on or past expiry date, returns 0.
   */
  public static calculateDaysToExpiry(asOfDate: string, expiryDate: string): number {
    const asOf = new Date(`${asOfDate.slice(0, 10)}T00:00:00Z`).getTime();
    const exp = new Date(`${expiryDate.slice(0, 10)}T00:00:00Z`).getTime();

    if (isNaN(asOf) || isNaN(exp)) {
      return 0;
    }

    const diffMs = exp - asOf;
    if (diffMs <= 0) {
      return 0;
    }

    return Math.floor(diffMs / 86_400_000);
  }

  /**
   * Checks whether a contract has expired as of a given reference timestamp/date.
   * On expiration day, trading ceases at 14:45 ICT (07:45 UTC).
   */
  public static isContractExpired(contractExpiryDate: string, asOfIsoOrDateStr: string): boolean {
    const expiryMidnight = `${contractExpiryDate.slice(0, 10)}T14:45:00+07:00`;
    const expiryTime = new Date(expiryMidnight).getTime();
    const asOfTime = new Date(asOfIsoOrDateStr).getTime();

    if (isNaN(asOfTime)) {
      // If date string is simple YYYY-MM-DD
      const asOfSimple = new Date(`${asOfIsoOrDateStr.slice(0, 10)}T14:45:00+07:00`).getTime();
      return asOfSimple >= expiryTime;
    }

    return asOfTime >= expiryTime;
  }
}
