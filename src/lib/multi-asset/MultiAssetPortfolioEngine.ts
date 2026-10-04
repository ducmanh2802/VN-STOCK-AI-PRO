/**
 * PHASE 29 — MULTI-ASSET PORTFOLIO ENGINE (pure, deterministic)
 * Aggregation, leverage, margin coverage, rebalancing deltas.
 */

import { EQUITY_STANDARD_LOT, type MultiAssetClass, type MultiAssetPortfolioSummary, type MultiAssetStatus, type RebalanceDelta, type ValuedPosition } from './types.ts';

export interface MultiAssetAggregateInput {
  readonly valued: readonly ValuedPosition[];
  readonly cashBalance?: number | null;
  readonly targetWeights?: Readonly<Record<string, number>>;
}

export class MultiAssetPortfolioEngine {
  static summarize(input: MultiAssetAggregateInput): { summary: MultiAssetPortfolioSummary; status: MultiAssetStatus } {
    const valued = input.valued ?? [];
    if (valued.some((v) => v.status === 'INVALID')) {
      return {
        summary: {
          netAssets: null, grossExposure: null, netExposure: null, leverage: null,
          cashBalance: input.cashBalance ?? null, totalMarginRequired: null, marginCoverage: null,
          byClass: { EQUITY: null, ETF: null, DERIVATIVE: null, CASH: null },
          positionCount: valued.length,
        },
        status: 'INVALID',
      };
    }
    if (valued.some((v) => v.status === 'DATA_UNAVAILABLE' || v.marketValue === null)) {
      const byClassPartial: Record<MultiAssetClass, number | null> = { EQUITY: null, ETF: null, DERIVATIVE: null, CASH: null };
      return {
        summary: {
          netAssets: null, grossExposure: null, netExposure: null, leverage: null,
          cashBalance: input.cashBalance ?? null, totalMarginRequired: null, marginCoverage: null,
          byClass: byClassPartial, positionCount: valued.length,
        },
        status: 'DATA_UNAVAILABLE',
      };
    }
    const byClass: Record<MultiAssetClass, number> = { EQUITY: 0, ETF: 0, DERIVATIVE: 0, CASH: 0 };
    let gross = 0;
    let net = 0;
    let margin = 0;
    let pnl = 0;
    for (const v of valued) {
      const mv = v.marketValue ?? 0;
      if (v.assetClass === 'DERIVATIVE') {
        byClass.DERIVATIVE += mv;
        margin += v.marginRequired ?? 0;
        pnl += v.unrealizedPnl ?? 0;
      } else if (v.assetClass === 'CASH') {
        byClass.CASH += mv;
      } else {
        byClass[v.assetClass] += mv;
      }
      gross += Math.abs(mv);
      net += mv;
    }
    const cash = (input.cashBalance ?? 0) + byClass.CASH;
    // Net assets = securities + ETF + cash + futures unrealized (notional excluded — standard futures accounting).
    const securities = byClass.EQUITY + byClass.ETF;
    const netAssets = securities + cash + pnl;
    const leverage = netAssets > 0 ? gross / netAssets : null;
    const marginCoverage = margin > 0 ? cash / margin : margin === 0 ? null : null;
    return {
      summary: {
        netAssets,
        grossExposure: gross,
        netExposure: net,
        leverage,
        cashBalance: cash,
        totalMarginRequired: margin,
        marginCoverage,
        byClass: { ...byClass, CASH: cash },
        positionCount: valued.length,
      },
      status: 'OK',
    };
  }

  static rebalance(
    valued: readonly ValuedPosition[],
    targetWeights: Readonly<Record<string, number>>,
    netAssets: number | null,
    markPrices: Readonly<Record<string, number | null>>
  ): RebalanceDelta[] | null {
    if (netAssets === null || !(netAssets > 0)) return null;
    const current: Record<string, number> = {};
    for (const v of valued) {
      if (v.marketValue === null) return null;
      current[v.symbol] = (v.marketValue ?? 0) / netAssets;
    }
    const out: RebalanceDelta[] = [];
    for (const [symbol, tw] of Object.entries(targetWeights)) {
      if (typeof tw !== 'number' || !Number.isFinite(tw) || tw < 0) return null;
      const cw = current[symbol] ?? 0;
      const deltaValue = (tw - cw) * netAssets;
      const px = markPrices[symbol] ?? null;
      let hinted: number | null = null;
      const pos = valued.find((v) => v.symbol === symbol);
      if (px !== null && px > 0 && pos) {
        if (pos.assetClass === 'DERIVATIVE') {
          hinted = Math.trunc(deltaValue / (px * 100_000));
        } else if (pos.assetClass === 'CASH') {
          hinted = Math.trunc(deltaValue);
        } else {
          hinted = Math.trunc(deltaValue / px / EQUITY_STANDARD_LOT) * EQUITY_STANDARD_LOT;
        }
      } else if (px !== null && px > 0 && !pos) {
        hinted = Math.trunc(deltaValue / px / EQUITY_STANDARD_LOT) * EQUITY_STANDARD_LOT;
      }
      out.push({ symbol, currentWeight: cw, targetWeight: tw, deltaValue, hintedQuantityDelta: hinted });
    }
    return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
}
