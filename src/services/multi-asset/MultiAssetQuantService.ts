/**
 * PHASE 29 — MULTI-ASSET DATA PROVIDER + QUANT SERVICE (orchestration)
 */

import { QuantPlatformIntegrationEngine } from '../../lib/multi-asset/QuantPlatformIntegrationEngine.ts';
import type {
  MultiAssetPosition,
  QuantPlatformSnapshot,
} from '../../lib/multi-asset/types.ts';
import type { StrategySignalLike } from '../../lib/multi-asset/QuantPlatformIntegrationEngine.ts';

export interface MultiAssetMarketInputs {
  readonly markPrices: Readonly<Record<string, number | null>>;
  readonly quoteFreshness: Readonly<Record<string, 'FRESH' | 'STALE' | 'UNAVAILABLE'>>;
  readonly signals: readonly StrategySignalLike[];
  readonly portfolioReference: string | null;
  readonly warnings: readonly string[];
}

export interface MultiAssetDataProvider {
  getInputs(
    positions: readonly MultiAssetPosition[],
    asOfDate: string
  ): Promise<MultiAssetMarketInputs>;
}

export interface QuantAnalysisRequest {
  readonly positions: readonly MultiAssetPosition[];
  readonly cashBalance?: number | null;
  readonly targetWeights?: Readonly<Record<string, number>>;
  readonly leverageCap?: number;
  readonly derivativeNotionalCap?: number | null;
  readonly cashFloorPercent?: number;
  readonly asOfDate: string;
}

export class MultiAssetQuantService {
  constructor(private readonly provider: MultiAssetDataProvider) {}

  async analyze(request: QuantAnalysisRequest): Promise<QuantPlatformSnapshot> {
    const evaluatedAt = new Date().toISOString();
    let market: MultiAssetMarketInputs;
    try {
      market = await this.provider.getInputs(request.positions, request.asOfDate);
    } catch {
      return QuantPlatformIntegrationEngine.build({
        positions: request.positions,
        cashBalance: request.cashBalance ?? null,
        targetWeights: request.targetWeights,
        markPrices: {},
        signals: [],
        portfolioReference: null,
        leverageCap: request.leverageCap,
        derivativeNotionalCap: request.derivativeNotionalCap,
        cashFloorPercent: request.cashFloorPercent,
        quoteFreshness: { __provider__: 'UNAVAILABLE' } as never,
        asOfDate: request.asOfDate,
        evaluatedAt,
      });
    }
    return QuantPlatformIntegrationEngine.build({
      positions: request.positions,
      cashBalance: request.cashBalance ?? null,
      targetWeights: request.targetWeights,
      markPrices: market.markPrices,
      signals: market.signals,
      portfolioReference: market.portfolioReference,
      leverageCap: request.leverageCap,
      derivativeNotionalCap: request.derivativeNotionalCap,
      cashFloorPercent: request.cashFloorPercent,
      quoteFreshness: market.quoteFreshness,
      asOfDate: request.asOfDate,
      evaluatedAt,
    });
  }
}
