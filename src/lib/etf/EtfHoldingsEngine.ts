/**
 * PHASE 22 — ETF HOLDINGS & BASKET ENGINE
 * =========================================
 * Mathematical engine for analyzing ETF constituent baskets, portfolio weights,
 * cash drag, concentration ratios, and sector allocations.
 *
 * Invariants:
 * - Mathematical integrity: Sum(weights) + CashWeight = 100%
 * - Zero denominator protection on basket value
 * - Top-N concentration and sector allocation aggregation
 * - Fails closed to DATA_UNAVAILABLE if basket is empty or prices are missing
 */

import type { EtfBasketHoldings, EtfConstituentHolding } from './types.ts';

export interface RawConstituentItem {
  symbol: string;
  companyName: string;
  sharesInBasket: number;
  marketPrice: number | null;
  sectorId: string;
  benchmarkWeightPercent?: number | null;
}

export interface HoldingsAnalysisInput {
  symbol: string;
  asOfDate: string;
  constituents: RawConstituentItem[];
  cashComponentVnd: number;
}

export class EtfHoldingsEngine {
  /**
   * Analyzes an ETF basket, calculating exact constituent weights, cash drag,
   * concentration metrics (Top 5, Top 10), and sector breakdown.
   */
  public static analyze(input: HoldingsAnalysisInput): EtfBasketHoldings {
    const { symbol, asOfDate, constituents, cashComponentVnd } = input;

    if (!constituents || constituents.length === 0) {
      return {
        symbol,
        asOfDate,
        totalConstituents: 0,
        constituents: [],
        cashComponentVnd,
        cashWeightPercent: null,
        totalBasketValueVnd: null,
        top5ConcentrationPercent: null,
        top10ConcentrationPercent: null,
        sectorBreakdown: {},
        status: 'DATA_UNAVAILABLE',
      };
    }

    let basketEquityValue = 0;
    const computedConstituents: EtfConstituentHolding[] = [];

    // First pass: compute market values and total equity value
    for (const raw of constituents) {
      const price = raw.marketPrice;
      const shares = raw.sharesInBasket;

      if (price === null || price <= 0 || !Number.isFinite(price) || shares < 0) {
        // Missing or invalid constituent price fails closed
        return {
          symbol,
          asOfDate,
          totalConstituents: constituents.length,
          constituents: [],
          cashComponentVnd,
          cashWeightPercent: null,
          totalBasketValueVnd: null,
          top5ConcentrationPercent: null,
          top10ConcentrationPercent: null,
          sectorBreakdown: {},
          status: 'DATA_UNAVAILABLE',
        };
      }

      const marketValue = shares * price;
      basketEquityValue += marketValue;

      computedConstituents.push({
        symbol: raw.symbol,
        companyName: raw.companyName,
        sharesInBasket: shares,
        marketPrice: price,
        marketValue,
        weightPercent: null, // calculated in second pass
        sectorId: raw.sectorId || 'other',
        benchmarkWeightPercent: raw.benchmarkWeightPercent ?? null,
      });
    }

    const totalBasketValue = basketEquityValue + cashComponentVnd;
    if (totalBasketValue <= 0) {
      return {
        symbol,
        asOfDate,
        totalConstituents: constituents.length,
        constituents: [],
        cashComponentVnd,
        cashWeightPercent: null,
        totalBasketValueVnd: null,
        top5ConcentrationPercent: null,
        top10ConcentrationPercent: null,
        sectorBreakdown: {},
        status: 'DATA_UNAVAILABLE',
      };
    }

    // Second pass: compute weights and differences
    const sectorBreakdown: Record<string, number> = {};

    for (const c of computedConstituents) {
      const weight = Math.round(((c.marketValue! / totalBasketValue) * 100) * 100) / 100;
      c.weightPercent = weight;

      if (c.benchmarkWeightPercent !== null && c.benchmarkWeightPercent !== undefined) {
        c.weightDifference = Math.round((weight - c.benchmarkWeightPercent) * 100) / 100;
      }

      const sector = c.sectorId;
      sectorBreakdown[sector] = Math.round(((sectorBreakdown[sector] || 0) + weight) * 100) / 100;
    }

    const cashWeightPercent =
      Math.round(((cashComponentVnd / totalBasketValue) * 100) * 100) / 100;

    // Sort descending by weight for concentration calculations
    const sortedWeights = computedConstituents
      .map((c) => c.weightPercent ?? 0)
      .sort((a, b) => b - a);

    const top5Concentration =
      Math.round(sortedWeights.slice(0, 5).reduce((acc, w) => acc + w, 0) * 100) / 100;
    const top10Concentration =
      Math.round(sortedWeights.slice(0, 10).reduce((acc, w) => acc + w, 0) * 100) / 100;

    return {
      symbol,
      asOfDate,
      totalConstituents: computedConstituents.length,
      constituents: computedConstituents,
      cashComponentVnd,
      cashWeightPercent,
      totalBasketValueVnd: Math.round(totalBasketValue),
      top5ConcentrationPercent: top5Concentration,
      top10ConcentrationPercent: top10Concentration,
      sectorBreakdown,
      status: 'COMPUTED',
    };
  }
}
