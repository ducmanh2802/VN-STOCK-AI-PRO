/**
 * PHASE 28 — PORTFOLIO DATA PROVIDER CONTRACT
 * Abstraction over historical returns / benchmark / factors / quotes.
 * Implementations map provider failures to explicit freshness — never throw
 * synthetic data into the pure engines.
 */

import type { FactorVector, PortfolioPositionInput } from '../../lib/portfolio/types.ts';

export type QuoteFreshness = 'FRESH' | 'STALE' | 'UNAVAILABLE';

export interface PortfolioMarketInputs {
  readonly historicalReturns: Readonly<Record<string, readonly number[]>>;
  readonly benchmarkReturns: readonly number[];
  readonly benchmarkSymbol: string;
  readonly benchmarkPeriodReturn: number | null;
  readonly portfolioPeriodReturn: number | null;
  readonly factorScores: Readonly<Record<string, FactorVector>>;
  readonly quoteFreshness: Readonly<Record<string, QuoteFreshness>>;
  readonly partial: boolean;
  readonly warnings: readonly string[];
}

export interface PortfolioDataProvider {
  getMarketInputs(
    positions: readonly PortfolioPositionInput[],
    asOfDate: string
  ): Promise<PortfolioMarketInputs>;
}
