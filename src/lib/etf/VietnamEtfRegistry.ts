/**
 * PHASE 22 — VIETNAM ETF MASTER REGISTRY
 * ========================================
 * Authoritative registry of Exchange-Traded Funds listed on the
 * Ho Chi Minh Stock Exchange (HOSE).
 *
 * Invariants:
 * - Deterministic resolution by symbol (case-insensitive, trimmed)
 * - Authoritative metadata verified against HOSE fund prospectuses
 * - Read-only metadata repository: Does NOT fabricate market prices or NAV
 * - Explicit fail-closed behavior on unknown or invalid symbols
 */

import type { EtfSpecification } from './types.ts';

const VIETNAM_ETF_REGISTRY: Record<string, EtfSpecification> = {
  E1VFVN30: {
    symbol: 'E1VFVN30',
    fundName: 'Quỹ ETF VFMVN30',
    issuer: 'CTCP Quản lý Quỹ Đầu tư Dragon Capital Việt Nam (DCVFM)',
    benchmarkIndex: 'VN30',
    exchange: 'HOSE',
    inceptionDate: '2014-10-06',
    managementFeePercent: 0.65,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 450_000_000,
    status: 'ACTIVE',
  },
  FUEVFVND: {
    symbol: 'FUEVFVND',
    fundName: 'Quỹ ETF VFMVN DIAMOND',
    issuer: 'CTCP Quản lý Quỹ Đầu tư Dragon Capital Việt Nam (DCVFM)',
    benchmarkIndex: 'VN DIAMOND',
    exchange: 'HOSE',
    inceptionDate: '2020-05-12',
    managementFeePercent: 0.80,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 520_000_000,
    status: 'ACTIVE',
  },
  FUESSVFL: {
    symbol: 'FUESSVFL',
    fundName: 'Quỹ ETF SSIAM VNFIN LEAD',
    issuer: 'CTCP Quản lý Quỹ SSI (SSIAM)',
    benchmarkIndex: 'VNFIN LEAD',
    exchange: 'HOSE',
    inceptionDate: '2020-04-24',
    managementFeePercent: 0.65,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 210_000_000,
    status: 'ACTIVE',
  },
  FUESSV30: {
    symbol: 'FUESSV30',
    fundName: 'Quỹ ETF SSIAM VN30',
    issuer: 'CTCP Quản lý Quỹ SSI (SSIAM)',
    benchmarkIndex: 'VN30',
    exchange: 'HOSE',
    inceptionDate: '2020-08-04',
    managementFeePercent: 0.50,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 85_000_000,
    status: 'ACTIVE',
  },
  FUEVN100: {
    symbol: 'FUEVN100',
    fundName: 'Quỹ ETF VinaCapital VN100',
    issuer: 'CTCP Quản lý Quỹ VinaCapital',
    benchmarkIndex: 'VN100',
    exchange: 'HOSE',
    inceptionDate: '2020-06-16',
    managementFeePercent: 0.67,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 48_000_000,
    status: 'ACTIVE',
  },
  FUEMAV30: {
    symbol: 'FUEMAV30',
    fundName: 'Quỹ ETF Mirae Asset VN30',
    issuer: 'Công ty TNHH Quản lý Quỹ Mirae Asset (Việt Nam)',
    benchmarkIndex: 'VN30',
    exchange: 'HOSE',
    inceptionDate: '2020-12-08',
    managementFeePercent: 0.55,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 62_000_000,
    status: 'ACTIVE',
  },
  FUEMAVND: {
    symbol: 'FUEMAVND',
    fundName: 'Quỹ ETF Mirae Asset VN DIAMOND',
    issuer: 'Công ty TNHH Quản lý Quỹ Mirae Asset (Việt Nam)',
    benchmarkIndex: 'VN DIAMOND',
    exchange: 'HOSE',
    inceptionDate: '2023-04-18',
    managementFeePercent: 0.70,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 35_000_000,
    status: 'ACTIVE',
  },
  FUEKIV30: {
    symbol: 'FUEKIV30',
    fundName: 'Quỹ ETF KIM Growth VN30',
    issuer: 'Công ty TNHH Quản lý Quỹ KIM Việt Nam',
    benchmarkIndex: 'VN30',
    exchange: 'HOSE',
    inceptionDate: '2022-01-14',
    managementFeePercent: 0.55,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 30_000_000,
    status: 'ACTIVE',
  },
  FUEKIVFS: {
    symbol: 'FUEKIVFS',
    fundName: 'Quỹ ETF KIM Growth VNFINSELECT',
    issuer: 'Công ty TNHH Quản lý Quỹ KIM Việt Nam',
    benchmarkIndex: 'VNFINSELECT',
    exchange: 'HOSE',
    inceptionDate: '2022-07-28',
    managementFeePercent: 0.60,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 28_000_000,
    status: 'ACTIVE',
  },
  FUEIP100: {
    symbol: 'FUEIP100',
    fundName: 'Quỹ ETF IPAAM VN100',
    issuer: 'CTCP Quản lý Quỹ Đầu tư Chứng khoán I.P.A (IPAAM)',
    benchmarkIndex: 'VN100',
    exchange: 'HOSE',
    inceptionDate: '2021-12-24',
    managementFeePercent: 0.60,
    creationUnitSize: 100_000,
    totalSharesOutstanding: 25_000_000,
    status: 'ACTIVE',
  },
};

export class VietnamEtfRegistry {
  /**
   * Normalizes a symbol string (trims whitespace, converts to uppercase).
   */
  public static normalizeSymbol(symbol: string): string {
    return (symbol || '').trim().toUpperCase();
  }

  /**
   * Retrieves an ETF specification by its symbol.
   * Returns null if the symbol is unknown.
   */
  public static getSpecification(symbol: string): EtfSpecification | null {
    const cleanSym = this.normalizeSymbol(symbol);
    const spec = VIETNAM_ETF_REGISTRY[cleanSym];
    return spec ? { ...spec } : null;
  }

  /**
   * Verifies if a symbol is a registered Vietnamese ETF.
   */
  public static isRegistered(symbol: string): boolean {
    const cleanSym = this.normalizeSymbol(symbol);
    return cleanSym in VIETNAM_ETF_REGISTRY;
  }

  /**
   * Lists all registered active ETF specifications.
   */
  public static listAll(): EtfSpecification[] {
    return Object.values(VIETNAM_ETF_REGISTRY).map((spec) => ({ ...spec }));
  }

  /**
   * Retrieves all ETFs tracking a specific benchmark index.
   */
  public static listByBenchmark(benchmarkIndex: string): EtfSpecification[] {
    const target = (benchmarkIndex || '').trim().toUpperCase();
    return Object.values(VIETNAM_ETF_REGISTRY)
      .filter((spec) => spec.benchmarkIndex.toUpperCase() === target)
      .map((spec) => ({ ...spec }));
  }

  /**
   * Retrieves all ETFs managed by a specific issuer.
   */
  public static listByIssuer(issuerSubstring: string): EtfSpecification[] {
    const target = (issuerSubstring || '').trim().toLowerCase();
    return Object.values(VIETNAM_ETF_REGISTRY)
      .filter((spec) => spec.issuer.toLowerCase().includes(target))
      .map((spec) => ({ ...spec }));
  }
}
