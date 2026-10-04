/**
 * PHASE 28 — PORTFOLIO INTELLIGENCE SERVICE (orchestration, fail-closed)
 * Owns async wiring; pure math stays in src/lib/portfolio.
 */

import { PortfolioIntelligenceSnapshotBuilder } from '../../lib/portfolio/PortfolioIntelligenceSnapshotBuilder.ts';
import type {
  PortfolioIntelligenceSnapshot,
  PortfolioPolicy,
  PortfolioPositionInput,
} from '../../lib/portfolio/types.ts';
import type { PortfolioDataProvider } from './PortfolioDataProvider.ts';

export interface PortfolioAnalysisRequest {
  readonly positions: readonly PortfolioPositionInput[];
  readonly cashValue?: number | null;
  readonly policy?: PortfolioPolicy;
  readonly shocks?: Readonly<Record<string, number>>;
  readonly asOfDate: string;
  readonly benchmarkSymbol?: string;
  readonly minObservations?: number;
}

export class PortfolioIntelligenceService {
  constructor(private readonly provider: PortfolioDataProvider) {}

  async analyze(request: PortfolioAnalysisRequest): Promise<PortfolioIntelligenceSnapshot> {
    const evaluatedAt = new Date().toISOString();
    let market;
    try {
      market = await this.provider.getMarketInputs(request.positions, request.asOfDate);
    } catch {
      // Provider failure => explicit UNAVAILABLE snapshot, never fabricated series.
      return PortfolioIntelligenceSnapshotBuilder.build({
        positions: request.positions,
        cashValue: request.cashValue ?? null,
        historicalReturns: {},
        benchmarkReturns: [],
        benchmarkSymbol: request.benchmarkSymbol ?? 'VN-INDEX',
        factorScores: {},
        policy: request.policy,
        shocks: request.shocks ?? {},
        quoteFreshness: { __provider__: 'UNAVAILABLE' } as never,
        asOfDate: request.asOfDate,
        evaluatedAt,
        minObservations: request.minObservations ?? 30,
      });
    }
    return PortfolioIntelligenceSnapshotBuilder.build({
      positions: request.positions,
      cashValue: request.cashValue ?? null,
      historicalReturns: market.historicalReturns,
      benchmarkReturns: market.benchmarkReturns,
      benchmarkSymbol: market.benchmarkSymbol || request.benchmarkSymbol || 'VN-INDEX',
      benchmarkPeriodReturn: market.benchmarkPeriodReturn,
      portfolioPeriodReturn: market.portfolioPeriodReturn,
      factorScores: market.factorScores,
      policy: request.policy,
      shocks: request.shocks ?? {},
      quoteFreshness: market.quoteFreshness as never,
      asOfDate: request.asOfDate,
      evaluatedAt,
      minObservations: request.minObservations ?? 30,
    });
  }
}
