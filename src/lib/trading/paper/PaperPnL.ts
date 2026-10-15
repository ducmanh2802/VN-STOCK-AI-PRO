/**
 * PHASE 18.2 — PAPER P&L CALCULATOR
 * =================================
 * Pure deterministic accounting utilities for paper portfolio positions, cash, and P&L.
 * Adheres to standard Vietnamese equity settlement principles:
 *   - No short selling (positions >= 0).
 *   - Realized PnL realized upon sell: (executedPrice - averageCost) * quantity - sellFee - sellTax.
 *   - Unrealized PnL: (currentPrice - averageCost) * quantity.
 *   - Market Value: sum(currentPrice * quantity).
 *   - Portfolio Equity: availableCash + reservedCash + marketValue.
 *   - Portfolio Exposure: marketValue / equity.
 */

import type { BrokerPosition } from '../execution/BrokerAdapter.ts';
import type { TradingCostConfig } from '../types/trading.ts';
import { DEFAULT_TRADING_COST_CONFIG } from '../types/trading.ts';

export interface PositionPnLMetrics {
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface PortfolioPnLMetrics {
  totalMarketValue: number;
  equity: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPercent: number;
  portfolioExposureRate: number;
  availableCash: number;
  reservedCash: number;
}

export interface RealizedPnLCalculationInput {
  sellPrice: number;
  averageCost: number;
  quantity: number;
  sellFeeRate?: number;
  sellTaxRate?: number;
}

export interface RealizedPnLResult {
  grossProceeds: number;
  costBasis: number;
  grossPnL: number;
  sellFee: number;
  sellTax: number;
  netProceeds: number;
  netPnL: number;
  returnPercent: number;
}

export class PaperPnL {
  /**
   * Calculates position market value and unrealized P&L against current market price.
   */
  static calculatePositionPnL(
    position: Pick<BrokerPosition, 'quantity' | 'averageCost'>,
    currentPrice: number
  ): PositionPnLMetrics {
    if (position.quantity <= 0 || currentPrice <= 0 || position.averageCost <= 0) {
      return {
        marketValue: 0,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
      };
    }

    const marketValue = position.quantity * currentPrice;
    const costBasis = position.quantity * position.averageCost;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    return {
      marketValue,
      unrealizedPnL,
      unrealizedPnLPercent,
    };
  }

  /**
   * Calculates total portfolio equity, exposure, and unrealized P&L across all positions.
   */
  static calculatePortfolioMetrics(
    cash: number,
    reservedCash: number,
    positions: Iterable<BrokerPosition>,
    quotes?: Map<string, { price: number }>
  ): PortfolioPnLMetrics {
    let totalMarketValue = 0;
    let totalCostBasis = 0;

    for (const pos of positions) {
      if (pos.quantity > 0) {
        const markPrice = quotes?.get(pos.symbol.toUpperCase())?.price ?? pos.currentPrice ?? pos.averageCost;
        const posMarketVal = pos.quantity * markPrice;
        const posCost = pos.quantity * pos.averageCost;

        totalMarketValue += posMarketVal;
        totalCostBasis += posCost;
      }
    }

    const totalCash = cash + reservedCash;
    const equity = totalCash + totalMarketValue;
    const totalUnrealizedPnL = totalMarketValue - totalCostBasis;
    const totalUnrealizedPnLPercent = totalCostBasis > 0 ? (totalUnrealizedPnL / totalCostBasis) * 100 : 0;
    const portfolioExposureRate = equity > 0 ? totalMarketValue / equity : 0;

    return {
      totalMarketValue,
      equity,
      totalUnrealizedPnL,
      totalUnrealizedPnLPercent,
      portfolioExposureRate,
      availableCash: cash,
      reservedCash,
    };
  }

  /**
   * Calculates realized P&L on a SELL transaction, accounting for brokerage fees and Vietnamese capital gains tax.
   */
  static calculateRealizedPnL(input: RealizedPnLCalculationInput): RealizedPnLResult {
    const feeRate = input.sellFeeRate ?? DEFAULT_TRADING_COST_CONFIG.sellFeeRate;
    const taxRate = input.sellTaxRate ?? DEFAULT_TRADING_COST_CONFIG.sellTaxRate;

    const grossProceeds = input.sellPrice * input.quantity;
    const costBasis = input.averageCost * input.quantity;
    const grossPnL = grossProceeds - costBasis;

    const sellFee = Math.round(grossProceeds * feeRate);
    const sellTax = Math.round(grossProceeds * taxRate);

    const netProceeds = grossProceeds - sellFee - sellTax;
    const netPnL = grossPnL - sellFee - sellTax;
    const returnPercent = costBasis > 0 ? (netPnL / costBasis) * 100 : 0;

    return {
      grossProceeds,
      costBasis,
      grossPnL,
      sellFee,
      sellTax,
      netProceeds,
      netPnL,
      returnPercent,
    };
  }
}
