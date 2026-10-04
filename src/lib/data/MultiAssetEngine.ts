/**
 * DATA-05 — MULTI-ASSET DATA FOUNDATION
 * ======================================
 * Unified foundation without destroying asset-specific semantics.
 * Preserves Phase 29 exactly: multiplier 100_000 VND/pt, tick 0.1,
 * lot 100 (equity/ETF), futures expiry required, margin+pnl required,
 * cash face-value (never a price series), NAV/iNAV informational only.
 */

import type { DataAssetClass, ExtendedAssetClass } from './types.ts';

export const FUTURES_MULTIPLIER_VND = 100000;
export const FUTURES_TICK_POINTS = 0.1;
export const EQUITY_STANDARD_LOT = 100;

const SUPPORTED_LIVE: readonly DataAssetClass[] = ['EQUITY', 'ETF', 'INDEX', 'FUTURE', 'CASH'];

export interface ContractMetadata {
  readonly contractCode: string;
  readonly underlying: 'VN30' | 'VN100';
  readonly expiryDate: string;
  readonly multiplier: number;
  readonly tickSize: number;
  readonly marginPerContract?: number | null;
}

export class MultiAssetEngine {
  static isSupported(assetClass: ExtendedAssetClass): boolean {
    return (SUPPORTED_LIVE as readonly string[]).includes(assetClass);
  }

  static requireSupported(assetClass: ExtendedAssetClass): DataAssetClass {
    if (!MultiAssetEngine.isSupported(assetClass)) {
      throw new Error(`UNSUPPORTED_ASSET_CLASS:${assetClass}`);
    }
    return assetClass as DataAssetClass;
  }

  static validateContract(meta: ContractMetadata, asOf: string): { readonly valid: boolean; readonly reason: string } {
    if (!meta.contractCode) return { valid: false, reason: 'MISSING_CONTRACT_CODE' };
    if (meta.multiplier !== FUTURES_MULTIPLIER_VND) return { valid: false, reason: 'MULTIPLIER_MISMATCH' };
    if (meta.tickSize !== FUTURES_TICK_POINTS) return { valid: false, reason: 'TICK_MISMATCH' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.expiryDate)) return { valid: false, reason: 'INVALID_EXPIRY' };
    if (meta.expiryDate <= asOf) return { valid: false, reason: 'EXPIRED' };
    return { valid: true, reason: 'OK' };
  }

  static validateEquityQuantity(qty: number): boolean {
    return Number.isInteger(qty) && qty >= 0;
  }

  static validateCashRecord(hasPriceSeries: boolean): { readonly valid: boolean; readonly reason: string } {
    if (hasPriceSeries) return { valid: false, reason: 'CASH_MUST_NOT_BE_PRICE_SERIES' };
    return { valid: true, reason: 'OK' };
  }
}

const VN_HOLIDAYS: readonly string[] = [
  '2024-01-01', '2024-02-08', '2024-02-09', '2024-02-12', '2024-02-13', '2024-02-14',
  '2024-04-18', '2024-04-30', '2024-05-01', '2024-09-02',
  '2025-01-01', '2025-01-27', '2025-01-28', '2025-01-29', '2025-04-30', '2025-05-01', '2025-09-02',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-04-30', '2026-05-01', '2026-09-02',
  '2027-01-01',
];

export interface VnSession {
  readonly name: string;
  readonly startMin: number;
  readonly endMin: number;
}

export const VN_SESSIONS: readonly VnSession[] = [
  { name: 'ATO', startMin: 540, endMin: 555 },
  { name: 'CONTINUOUS_AM', startMin: 555, endMin: 690 },
  { name: 'LUNCH', startMin: 690, endMin: 780 },
  { name: 'CONTINUOUS_PM', startMin: 780, endMin: 870 },
  { name: 'ATC', startMin: 870, endMin: 885 },
];

export class MarketCalendar {
  static isWeekend(date: string): boolean {
    const day = new Date(date + 'T00:00:00Z').getUTCDay();
    return day === 0 || day === 6;
  }

  static isHoliday(date: string): boolean {
    return (VN_HOLIDAYS as readonly string[]).includes(date);
  }

  static isTradingDay(date: string): boolean {
    return !MarketCalendar.isWeekend(date) && !MarketCalendar.isHoliday(date);
  }

  static sessionAt(minutesSinceMidnight: number): string {
    for (const s of VN_SESSIONS) {
      if (minutesSinceMidnight >= s.startMin && minutesSinceMidnight < s.endMin) return s.name;
    }
    return 'CLOSED';
  }

  static timezone(): string {
    return 'Asia/Ho_Chi_Minh';
  }
}

export class NormalizationEngine {
  static vpsPriceToVnd(kvnd: number): number {
    return kvnd * 1000;
  }

  static vpsLotsToShares(lots: number): number {
    return lots * 10;
  }

  static futuresPointsToNotional(points: number, contracts: number): number {
    return contracts * points * FUTURES_MULTIPLIER_VND;
  }

  static roundToTick(points: number): number {
    return Math.round(points / FUTURES_TICK_POINTS) * FUTURES_TICK_POINTS;
  }

  static normalizeTimestamp(input: string): string {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) throw new Error('INVALID_TIMESTAMP');
    return d.toISOString();
  }
}
