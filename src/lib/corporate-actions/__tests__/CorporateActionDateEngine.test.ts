import { describe, it, expect } from 'vitest';
import { CorporateActionDateEngine } from '../CorporateActionDateEngine.ts';
import type { CorporateActionDates } from '../types.ts';

describe('Phase 23 — CorporateActionDateEngine', () => {
  it('correctly detects weekends', () => {
    expect(CorporateActionDateEngine.isWeekend('2024-05-18')).toBe(true); // Saturday
    expect(CorporateActionDateEngine.isWeekend('2024-05-19')).toBe(true); // Sunday
    expect(CorporateActionDateEngine.isWeekend('2024-05-20')).toBe(false); // Monday
  });

  it('correctly detects statutory Vietnam public holidays', () => {
    expect(CorporateActionDateEngine.isPublicHoliday('2024-04-30')).toBe(true); // Reunification Day
    expect(CorporateActionDateEngine.isPublicHoliday('2024-05-01')).toBe(true); // Labor Day
    expect(CorporateActionDateEngine.isPublicHoliday('2024-09-02')).toBe(true); // National Day
    expect(CorporateActionDateEngine.isPublicHoliday('2024-06-15')).toBe(false);
  });

  it('derives Ex-Date from Record Date skipping weekends (T+2)', () => {
    // If Record Date is Monday 2024-05-20, Ex-Date is Friday 2024-05-17
    const exDate = CorporateActionDateEngine.deriveExDateFromRecordDate('2024-05-20');
    expect(exDate).toBe('2024-05-17');
  });

  it('derives Ex-Date skipping holidays and weekends', () => {
    // 2024-05-02 is Thursday. 2024-05-01 is Labor Day (Holiday). 2024-04-30 is Reunification Day (Holiday).
    // Preceding trading day before 2024-05-02 is Monday 2024-04-29.
    const exDate = CorporateActionDateEngine.deriveExDateFromRecordDate('2024-05-02');
    expect(exDate).toBe('2024-04-29');
  });

  it('validates a valid corporate action date schedule', () => {
    const dates: CorporateActionDates = {
      announcementDate: '2024-04-25',
      exDate: '2024-05-22',
      recordDate: '2024-05-23',
      paymentDate: '2024-06-05',
      tradingDate: null,
      rightsStartDate: null,
      rightsEndDate: null,
    };

    const res = CorporateActionDateEngine.validateDates(dates);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects schedule where exDate is on or after recordDate', () => {
    const dates: CorporateActionDates = {
      announcementDate: '2024-04-25',
      exDate: '2024-05-24', // Invalid: after recordDate
      recordDate: '2024-05-23',
      paymentDate: '2024-06-05',
      tradingDate: null,
      rightsStartDate: null,
      rightsEndDate: null,
    };

    const res = CorporateActionDateEngine.validateDates(dates);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes('exDate'))).toBe(true);
  });

  it('rejects schedule where rightsStartDate is after rightsEndDate', () => {
    const dates: CorporateActionDates = {
      announcementDate: '2024-04-25',
      exDate: '2024-05-22',
      recordDate: '2024-05-23',
      paymentDate: '2024-06-05',
      tradingDate: null,
      rightsStartDate: '2024-06-20',
      rightsEndDate: '2024-06-10', // Invalid: earlier than start
    };

    const res = CorporateActionDateEngine.validateDates(dates);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes('rightsStartDate'))).toBe(true);
  });
});
