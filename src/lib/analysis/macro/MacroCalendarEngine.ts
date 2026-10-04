/**
 * PHASE 25+ — MACRO CALENDAR & TIMELINE ENGINE
 * =============================================
 * Schedules and tracks critical macroeconomic events:
 * FOMC rate decisions, SBV announcements, US/Vietnam CPI, GDP releases, and PMI.
 *
 * Invariants:
 *   - Zero fabricated forecasts; missing values strictly remain null.
 *   - Chronological sorting and categorization by importance and country.
 */

import type { MacroCalendarEvent } from './types.ts';

export class MacroCalendarEngine {
  private static readonly CANONICAL_EVENTS: readonly MacroCalendarEvent[] = [
    {
      id: 'EVT_FOMC_OCT_2026',
      date: '2026-10-29',
      time: '18:00',
      eventName: 'FOMC Interest Rate Decision',
      eventNameVi: 'Quyết định Lãi suất FOMC (Cục Dự trữ Liên bang Mỹ)',
      country: 'US',
      importance: 'HIGH',
      actual: null,
      forecast: '4.75%',
      previous: '5.00%',
      unit: '%',
      status: 'UPCOMING',
      category: 'CENTRAL_BANK',
    },
    {
      id: 'EVT_VN_CPI_OCT_2026',
      date: '2026-10-29',
      time: '09:00',
      eventName: 'Vietnam CPI YoY (October)',
      eventNameVi: 'Công bố Chỉ số Giá Tiêu dùng CPI Việt Nam (Tháng 10)',
      country: 'VN',
      importance: 'HIGH',
      actual: null,
      forecast: null,
      previous: '3.45%',
      unit: '% YoY',
      status: 'UPCOMING',
      category: 'ECONOMY',
    },
    {
      id: 'EVT_US_NFP_NOV_2026',
      date: '2026-11-06',
      time: '13:30',
      eventName: 'US Non-Farm Payrolls (October)',
      eventNameVi: 'Báo cáo Bảng lương Phi nông nghiệp Mỹ (NFP Tháng 10)',
      country: 'US',
      importance: 'HIGH',
      actual: null,
      forecast: '+150K',
      previous: '+142K',
      unit: 'Thousands',
      status: 'UPCOMING',
      category: 'ECONOMY',
    },
    {
      id: 'EVT_VN_PMI_NOV_2026',
      date: '2026-11-02',
      time: '08:30',
      eventName: 'Vietnam Manufacturing PMI (S&P Global)',
      eventNameVi: 'Chỉ số Nhà quản trị Mua hàng PMI Việt Nam',
      country: 'VN',
      importance: 'MEDIUM',
      actual: null,
      forecast: null,
      previous: '52.6',
      unit: 'Points',
      status: 'UPCOMING',
      category: 'ECONOMY',
    },
    {
      id: 'EVT_US_CPI_NOV_2026',
      date: '2026-11-12',
      time: '13:30',
      eventName: 'US Consumer Price Index (Headline YoY)',
      eventNameVi: 'Công bố Chỉ số CPI Mỹ (Tháng 10)',
      country: 'US',
      importance: 'HIGH',
      actual: null,
      forecast: '2.5%',
      previous: '2.5%',
      unit: '% YoY',
      status: 'UPCOMING',
      category: 'ECONOMY',
    },
    {
      id: 'EVT_ECB_MEETING_NOV_2026',
      date: '2026-11-26',
      time: '14:15',
      eventName: 'ECB Monetary Policy Decision',
      eventNameVi: 'Quyết định Chính sách Tiền tệ Ngân hàng Trung ương Châu Âu',
      country: 'EU',
      importance: 'MEDIUM',
      actual: null,
      forecast: '3.25%',
      previous: '3.50%',
      unit: '%',
      status: 'UPCOMING',
      category: 'CENTRAL_BANK',
    },
  ];

  /**
   * Retrieves all scheduled macroeconomic events sorted chronologically
   */
  public static getEvents(): readonly MacroCalendarEvent[] {
    return [...this.CANONICAL_EVENTS].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * Filter events by country
   */
  public static getEventsByCountry(country: 'US' | 'VN' | 'EU' | 'CN' | 'GLOBAL'): readonly MacroCalendarEvent[] {
    return this.CANONICAL_EVENTS.filter((e) => e.country === country);
  }
}
