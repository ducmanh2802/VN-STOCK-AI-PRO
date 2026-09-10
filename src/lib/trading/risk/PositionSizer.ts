/**
 * PHASE 18.1 — POSITION SIZING ENGINE
 * ====================================
 * Computes exact position size strictly respecting:
 *   - Risk budget (% of equity)
 *   - Distance to Stop Loss (Risk per share)
 *   - Standard Vietnamese Board Lot (multiples of 100 shares)
 *   - Trading fees (0.15%) and slippage buffer (0.10%)
 *   - Available cash and portfolio exposure limits
 *
 * Enforces fail-closed rules: never forces a trade with fractional lots
 * or reduces size below 100 shares.
 */

import type { PositionSizingInput, PositionSizingResult } from '../types/risk.ts';
import { DEFAULT_RISK_CONFIG } from '../types/risk.ts';

export class PositionSizer {
  /**
   * Calculates position size and capital requirements for a proposed trade.
   */
  static calculate(input: PositionSizingInput): PositionSizingResult {
    const {
      equity,
      availableCash,
      entryPrice,
      stopLossPrice,
      maxRiskPerTradeRate = DEFAULT_RISK_CONFIG.maxRiskPerTradeRate,
      lotSize = DEFAULT_RISK_CONFIG.lotSize,
      buyFeeRate = DEFAULT_RISK_CONFIG.buyFeeRate,
      slippageRate = DEFAULT_RISK_CONFIG.slippageRate,
      existingExposure = 0,
      maxPortfolioExposureRate = DEFAULT_RISK_CONFIG.maxPortfolioExposureRate,
      capitalCeiling,
    } = input;

    // 0. Capital ceiling validation (fail-closed)
    if (capitalCeiling !== undefined) {
      if (!Number.isFinite(capitalCeiling) || capitalCeiling <= 0) {
        return {
          canTrade: false,
          quantity: 0,
          riskAmount: 0,
          riskPerShare: 0,
          buyCost: 0,
          buyFee: 0,
          slippageBuffer: 0,
          totalCapitalRequirement: 0,
          code: 'INVALID_CAPITAL',
          reason: `Capital ceiling must be a positive finite value, got: ${capitalCeiling}`,
        };
      }
    }

    // 1. Validation of capital and account values
    if (equity <= 0 || !Number.isFinite(equity)) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare: 0,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'INSUFFICIENT_CASH',
        reason: `Account equity must be positive finite value, got: ${equity}`,
      };
    }

    if (availableCash <= 0 || !Number.isFinite(availableCash)) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare: 0,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'INSUFFICIENT_CASH',
        reason: `Available cash must be positive finite value, got: ${availableCash}`,
      };
    }

    // 2. Validation of price parameters
    if (entryPrice <= 0 || !Number.isFinite(entryPrice)) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare: 0,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'INVALID_PRICE',
        reason: `Entry price must be positive, got: ${entryPrice}`,
      };
    }

    if (stopLossPrice <= 0 || !Number.isFinite(stopLossPrice)) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare: 0,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'INVALID_PRICE',
        reason: `Stop loss price must be positive, got: ${stopLossPrice}`,
      };
    }

    if (entryPrice <= stopLossPrice) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare: 0,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'INVALID_RISK_REWARD',
        reason: `Entry price (${entryPrice}) must be strictly higher than stop loss (${stopLossPrice})`,
      };
    }

    // 3. Compute Risk Budget and Risk Per Share
    const riskBudget = equity * maxRiskPerTradeRate;
    if (riskBudget <= 0) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare: 0,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'EXCESSIVE_RISK',
        reason: 'Risk budget is zero or negative',
      };
    }

    const riskPerShare = entryPrice - stopLossPrice;
    const rawQuantity = riskBudget / riskPerShare;

    // 4. Board lot adjustment (must be exact multiples of lotSize, e.g. 100)
    let adjustedQuantity = Math.floor(rawQuantity / lotSize) * lotSize;

    // Ensure rounding did not exceed risk budget
    while (adjustedQuantity * riskPerShare > riskBudget && adjustedQuantity >= lotSize) {
      adjustedQuantity -= lotSize;
    }

    // 5. Minimum lot check
    if (adjustedQuantity < lotSize) {
      return {
        canTrade: false,
        quantity: 0,
        riskAmount: 0,
        riskPerShare,
        buyCost: 0,
        buyFee: 0,
        slippageBuffer: 0,
        totalCapitalRequirement: 0,
        code: 'INVALID_LOT_SIZE',
        reason: `Computed position size (${adjustedQuantity}) is below minimum board lot of ${lotSize} shares (raw: ${rawQuantity.toFixed(2)})`,
      };
    }

    // 6. Compute Total Capital Requirement (Buy Cost + Brokerage Fee + Slippage Buffer)
    const buyCost = adjustedQuantity * entryPrice;
    const buyFee = Math.round(buyCost * buyFeeRate);
    const slippageBuffer = Math.round(buyCost * slippageRate);
    const totalCapitalRequirement = buyCost + buyFee + slippageBuffer;

    // 6b. Capital ceiling enforcement (fail-closed: never exceed the approved ceiling)
    if (capitalCeiling !== undefined && totalCapitalRequirement > capitalCeiling) {
      return {
        canTrade: false,
        quantity: adjustedQuantity,
        riskAmount: adjustedQuantity * riskPerShare,
        riskPerShare,
        buyCost,
        buyFee,
        slippageBuffer,
        totalCapitalRequirement,
        code: 'INVALID_CAPITAL',
        reason: `Total capital required (${totalCapitalRequirement.toLocaleString('vi-VN')} VND) exceeds the approved capital ceiling (${capitalCeiling.toLocaleString('vi-VN')} VND)`,
      };
    }

    // 7. Available Cash check (Fail-closed: do not force arbitrary down-sizing)
    if (totalCapitalRequirement > availableCash) {
      return {
        canTrade: false,
        quantity: adjustedQuantity,
        riskAmount: adjustedQuantity * riskPerShare,
        riskPerShare,
        buyCost,
        buyFee,
        slippageBuffer,
        totalCapitalRequirement,
        code: 'INSUFFICIENT_CASH',
        reason: `Total capital required (${totalCapitalRequirement.toLocaleString('vi-VN')} VND) exceeds available cash (${availableCash.toLocaleString('vi-VN')} VND)`,
      };
    }

    // 8. Portfolio Exposure check
    const maxAllowedExposure = equity * maxPortfolioExposureRate;
    const newExposure = existingExposure + buyCost;

    if (newExposure > maxAllowedExposure) {
      return {
        canTrade: false,
        quantity: adjustedQuantity,
        riskAmount: adjustedQuantity * riskPerShare,
        riskPerShare,
        buyCost,
        buyFee,
        slippageBuffer,
        totalCapitalRequirement,
        code: 'EXCESSIVE_EXPOSURE',
        reason: `New portfolio exposure (${newExposure.toLocaleString('vi-VN')} VND, ${(newExposure / equity * 100).toFixed(1)}%) exceeds maximum allowed exposure of ${(maxPortfolioExposureRate * 100).toFixed(0)}% (${maxAllowedExposure.toLocaleString('vi-VN')} VND)`,
      };
    }

    return {
      canTrade: true,
      quantity: adjustedQuantity,
      riskAmount: adjustedQuantity * riskPerShare,
      riskPerShare,
      buyCost,
      buyFee,
      slippageBuffer,
      totalCapitalRequirement,
      code: 'SUCCESS',
      reason: 'Position sizing approved',
    };
  }
}
