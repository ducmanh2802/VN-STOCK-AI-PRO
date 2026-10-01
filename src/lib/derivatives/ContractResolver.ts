/**
 * PHASE 21 — CONTRACT RESOLVER
 * ==============================
 * Deterministic resolution of active futures contracts (1M, 2M, 1Q, 2Q)
 * as of any reference date according to Vietnam exchange rollover rules.
 */

import type { UnderlyingIndex, ContractTenor, ContractSpecification } from './types.ts';
import { ExpiryCalendarEngine } from './ExpiryCalendarEngine.ts';
import { VietnamDerivativesRegistry } from './VietnamDerivativesRegistry.ts';

export interface ActiveContractsUniverse {
  underlying: UnderlyingIndex;
  asOfDate: string;
  frontMonth: ContractSpecification;
  nextMonth: ContractSpecification;
  quarter1: ContractSpecification;
  quarter2: ContractSpecification;
  contracts: Record<ContractTenor, ContractSpecification>;
}

export class ContractResolver {
  /**
   * Adds N months to a year/month pair, returning [newYear, newMonth].
   */
  private static addMonths(year: number, month: number, count: number): [number, number] {
    const totalMonths = year * 12 + (month - 1) + count;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    return [newYear, newMonth];
  }

  /**
   * Finds the nearest quarter-end month (3, 6, 9, 12) strictly after a given [year, month].
   */
  private static findNextQuarterMonth(year: number, month: number): [number, number] {
    let [y, m] = this.addMonths(year, month, 1);
    while (m % 3 !== 0) {
      [y, m] = this.addMonths(y, m, 1);
    }
    return [y, m];
  }

  /**
   * Resolves the 4 active maturity months [year, month] for a given date.
   * Takes into account whether the current month's contract has already reached expiration.
   */
  public static resolveActiveMonths(asOfDateStr?: string): {
    '1M': [number, number];
    '2M': [number, number];
    '1Q': [number, number];
    '2Q': [number, number];
  } {
    const ref = asOfDateStr ? new Date(asOfDateStr) : new Date();
    const isoDate = ref.toISOString().slice(0, 10);
    const curYear = ref.getUTCFullYear();
    const curMonth = ref.getUTCMonth() + 1; // 1-12

    // Check expiration of current month's contract
    const curExpiryInfo = ExpiryCalendarEngine.getExpiryInfo(curYear, curMonth);
    const hasExpired = ExpiryCalendarEngine.isContractExpired(curExpiryInfo.adjustedExpiryDate, asOfDateStr || isoDate);

    // If current month has expired, rollover: 1M is curMonth + 1
    const [m1Year, m1Month] = hasExpired
      ? this.addMonths(curYear, curMonth, 1)
      : [curYear, curMonth];

    // 2M is m1 + 1 month
    const [m2Year, m2Month] = this.addMonths(m1Year, m1Month, 1);

    // 1Q is nearest quarter-end month strictly after 2M
    const [q1Year, q1Month] = this.findNextQuarterMonth(m2Year, m2Month);

    // 2Q is next quarter-end month after 1Q (+3 months)
    const [q2Year, q2Month] = this.addMonths(q1Year, q1Month, 3);

    return {
      '1M': [m1Year, m1Month],
      '2M': [m2Year, m2Month],
      '1Q': [q1Year, q1Month],
      '2Q': [q2Year, q2Month],
    };
  }

  /**
   * Resolves the active contract universe (1M, 2M, 1Q, 2Q) for an underlying index.
   */
  public static resolveActiveUniverse(
    underlying: UnderlyingIndex = 'VN30',
    asOfDateStr?: string
  ): ActiveContractsUniverse {
    const months = this.resolveActiveMonths(asOfDateStr);
    const asOf = asOfDateStr || new Date().toISOString().slice(0, 10);

    const c1M = VietnamDerivativesRegistry.createSpecification(
      underlying,
      '1M',
      months['1M'][0],
      months['1M'][1],
      asOf
    );
    const c2M = VietnamDerivativesRegistry.createSpecification(
      underlying,
      '2M',
      months['2M'][0],
      months['2M'][1],
      asOf
    );
    const c1Q = VietnamDerivativesRegistry.createSpecification(
      underlying,
      '1Q',
      months['1Q'][0],
      months['1Q'][1],
      asOf
    );
    const c2Q = VietnamDerivativesRegistry.createSpecification(
      underlying,
      '2Q',
      months['2Q'][0],
      months['2Q'][1],
      asOf
    );

    return {
      underlying,
      asOfDate: asOf,
      frontMonth: c1M,
      nextMonth: c2M,
      quarter1: c1Q,
      quarter2: c2Q,
      contracts: {
        '1M': c1M,
        '2M': c2M,
        '1Q': c1Q,
        '2Q': c2Q,
      },
    };
  }

  /**
   * Resolves the front-month active contract specification.
   */
  public static resolveFrontMonthContract(
    underlying: UnderlyingIndex = 'VN30',
    asOfDateStr?: string
  ): ContractSpecification {
    const universe = this.resolveActiveUniverse(underlying, asOfDateStr);
    return universe.frontMonth;
  }

  /**
   * Resolves a symbol (alias like "VN30F1M" or full code like "VN30F2604") into a ContractSpecification.
   */
  public static resolveContract(
    symbol: string,
    asOfDateStr?: string
  ): ContractSpecification | null {
    const parsed = VietnamDerivativesRegistry.parseContractSymbol(symbol);
    if (!parsed) return null;

    const asOf = asOfDateStr || new Date().toISOString().slice(0, 10);

    if (parsed.tenorAlias) {
      const universe = this.resolveActiveUniverse(parsed.underlying, asOf);
      return universe.contracts[parsed.tenorAlias];
    }

    if (parsed.year && parsed.month) {
      // Find matching tenor or default to custom
      const months = this.resolveActiveMonths(asOf);
      let tenor: ContractTenor = '1M';
      if (months['2M'][0] === parsed.year && months['2M'][1] === parsed.month) {
        tenor = '2M';
      } else if (months['1Q'][0] === parsed.year && months['1Q'][1] === parsed.month) {
        tenor = '1Q';
      } else if (months['2Q'][0] === parsed.year && months['2Q'][1] === parsed.month) {
        tenor = '2Q';
      }

      return VietnamDerivativesRegistry.createSpecification(
        parsed.underlying,
        tenor,
        parsed.year,
        parsed.month,
        asOf
      );
    }

    return null;
  }
}
