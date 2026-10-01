/**
 * PHASE 21 — VIETNAM DERIVATIVES REGISTRY
 * ========================================
 * Authoritative master registry for Vietnam index futures specifications (HNX).
 */

import type { UnderlyingIndex, ContractTenor, ContractSpecification } from './types.ts';
import { ExpiryCalendarEngine } from './ExpiryCalendarEngine.ts';

export interface UnderlyingSpecification {
  underlying: UnderlyingIndex;
  name: string;
  exchange: 'HNX';
  multiplier: number;
  tickSize: number;
  settlementCurrency: 'VND';
  tradingHours: {
    morning: { start: '08:45'; end: '11:30' };
    afternoon: { start: '13:00'; end: '14:45' };
  };
}

export const UNDERLYING_SPECS: Record<UnderlyingIndex, UnderlyingSpecification> = {
  VN30: {
    underlying: 'VN30',
    name: 'Hợp đồng tương lai chỉ số VN30',
    exchange: 'HNX',
    multiplier: 100_000,
    tickSize: 0.1,
    settlementCurrency: 'VND',
    tradingHours: {
      morning: { start: '08:45', end: '11:30' },
      afternoon: { start: '13:00', end: '14:45' },
    },
  },
  VN100: {
    underlying: 'VN100',
    name: 'Hợp đồng tương lai chỉ số VN100',
    exchange: 'HNX',
    multiplier: 100_000,
    tickSize: 0.1,
    settlementCurrency: 'VND',
    tradingHours: {
      morning: { start: '08:45', end: '11:30' },
      afternoon: { start: '13:00', end: '14:45' },
    },
  },
};

export class VietnamDerivativesRegistry {
  /**
   * Retrieves the underlying specification.
   */
  public static getUnderlyingSpec(underlying: UnderlyingIndex): UnderlyingSpecification {
    const spec = UNDERLYING_SPECS[underlying];
    if (!spec) {
      throw new Error(`Unsupported derivatives underlying index: "${underlying}"`);
    }
    return spec;
  }

  /**
   * Builds standardized contract code: e.g. "VN30F2604" for VN30 April 2026.
   */
  public static formatContractCode(underlying: UnderlyingIndex, year: number, month: number): string {
    const yy = String(year).slice(-2);
    const mm = String(month).padStart(2, '0');
    return `${underlying}F${yy}${mm}`;
  }

  /**
   * Parses contract symbol string.
   * Accepts "VN30F2604", "VN100F2606", or alias "VN30F1M".
   */
  public static parseContractSymbol(
    symbol: string
  ): { underlying: UnderlyingIndex; year?: number; month?: number; tenorAlias?: ContractTenor } | null {
    if (!symbol) return null;
    const clean = symbol.trim().toUpperCase();

    // Check alias format: VN30F1M, VN100F2M, etc.
    const aliasMatch = clean.match(/^(VN30|VN100)F(1M|2M|1Q|2Q)$/);
    if (aliasMatch) {
      return {
        underlying: aliasMatch[1] as UnderlyingIndex,
        tenorAlias: aliasMatch[2] as ContractTenor,
      };
    }

    // Check standard maturity code format: VN30F2604 (year 2026, month 04)
    const stdMatch = clean.match(/^(VN30|VN100)F(\d{2})(\d{2})$/);
    if (stdMatch) {
      const underlying = stdMatch[1] as UnderlyingIndex;
      const yy = parseInt(stdMatch[2], 10);
      const mm = parseInt(stdMatch[3], 10);

      // Assume 2000s century
      const fullYear = 2000 + yy;
      if (mm < 1 || mm > 12) return null;

      return {
        underlying,
        year: fullYear,
        month: mm,
      };
    }

    return null;
  }

  /**
   * Creates a full ContractSpecification from explicit year and month.
   */
  public static createSpecification(
    underlying: UnderlyingIndex,
    tenor: ContractTenor,
    year: number,
    month: number,
    asOfDate?: string
  ): ContractSpecification {
    const spec = this.getUnderlyingSpec(underlying);
    const contractCode = this.formatContractCode(underlying, year, month);
    const expiryInfo = ExpiryCalendarEngine.getExpiryInfo(year, month);
    const contractMonth = `${year}-${String(month).padStart(2, '0')}`;

    // First trading day is typically the business day after the prior contract month expired
    // or ~3-6 months prior for quarterly tenors. We compute standard inception.
    const priorMonth = month === 1 ? 12 : month - 1;
    const priorYear = month === 1 ? year - 1 : year;
    const priorExpiry = ExpiryCalendarEngine.getExpiryInfo(priorYear, priorMonth);
    const firstTradingDate = priorExpiry.adjustedExpiryDate;

    const referenceDate = asOfDate || new Date().toISOString().slice(0, 10);
    const isExpired = ExpiryCalendarEngine.isContractExpired(expiryInfo.adjustedExpiryDate, referenceDate);

    return {
      symbol: `${underlying}F${tenor}`,
      contractCode,
      underlying,
      tenor,
      contractMonth,
      multiplier: spec.multiplier,
      tickSize: spec.tickSize,
      firstTradingDate,
      lastTradingDate: expiryInfo.adjustedExpiryDate,
      settlementDate: expiryInfo.settlementDate,
      exchange: 'HNX',
      status: isExpired ? 'EXPIRED' : 'ACTIVE',
    };
  }
}
