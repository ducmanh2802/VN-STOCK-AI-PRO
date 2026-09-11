/**
 * PHASE 18.1 — RISK GUARD (FIRST LINE OF DEFENSE)
 * ===============================================
 * Deterministic, fail-closed safety gate for paper trading authorization.
 *
 * Safety Contract:
 *   Recommendation / Signal + Market Data
 *                   ↓
 *         TradingDataValidator
 *                   ↓
 *              RiskGuard
 *                   ↓
 *   AUTHORIZED_FOR_PAPER_TRADING  |  BLOCKED  |  INVALID
 *
 * STRICT GOVERNANCE:
 *   - 100% Stateless & Deterministic.
 *   - Fail-Closed: If any parameter or condition is ambiguous, incomplete, or violated => BLOCK.
 *   - No order execution, no real broker connections, no synthetic/mock data.
 */

import type {
  RiskGuardPolicy,
  RiskGuardEvaluationInput,
  RiskGuardResult,
} from '../types/risk.ts';
import { DEFAULT_RISK_GUARD_POLICY } from '../types/risk.ts';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';
import { VietnamLotRule } from './VietnamLotRule.ts';
import type {
  InvestmentRecommendation,
} from '../../../types/recommendation.ts';
import type {
  TradingMarketData,
  TradingSignal,
} from '../types/trading.ts';

export class RiskGuard {
  private policy: RiskGuardPolicy;

  constructor(policy: Partial<RiskGuardPolicy> = {}) {
    this.policy = { ...DEFAULT_RISK_GUARD_POLICY, ...policy };
  }

  /**
   * Updates risk guard policy dynamically.
   */
  updatePolicy(newPolicy: Partial<RiskGuardPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  /**
   * Retrieves active risk guard policy.
   */
  getPolicy(): Readonly<RiskGuardPolicy> {
    return this.policy;
  }

  /**
   * Static convenience method to evaluate input with an optional policy.
   */
  static evaluate(input: RiskGuardEvaluationInput, policy?: Partial<RiskGuardPolicy>): RiskGuardResult {
    return new RiskGuard(policy).evaluate(input);
  }

  /**
   * Primary entry point: Evaluates trading proposal against full risk guard rules.
   */
  evaluate(input: RiskGuardEvaluationInput): RiskGuardResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 0. Null / Undefined input guard (Fail-Closed)
    if (!input || typeof input !== 'object') {
      return {
        status: 'INVALID',
        authorization: 'INVALID',
        approved: false,
        code: 'INVALID_SIGNAL',
        reason: 'Risk evaluation input is null or invalid',
        errors: ['Input object is missing'],
        warnings: [],
      };
    }

    // 0.5 Symbol validation
    const symbol = input.symbol ? String(input.symbol).trim().toUpperCase() : '';
    if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return {
        status: 'INVALID',
        authorization: 'INVALID',
        approved: false,
        code: 'INVALID_SYMBOL',
        reason: `Invalid or missing stock symbol: "${input.symbol}"`,
        errors: [`Invalid stock symbol: "${input.symbol}"`],
        warnings: [],
      };
    }

    // 1. Emergency Stop Check (Top Priority)
    if (input.emergencyStop) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'EMERGENCY_STOP',
        reason: 'Emergency stop is active: all paper orders are strictly blocked.',
        errors: ['Emergency stop active'],
        warnings: [],
      };
    }

    // 2. Global Trading Enabled Master Switch
    if (input.tradingEnabled === false) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'TRADING_DISABLED',
        reason: 'Automated trading master switch is disabled.',
        errors: ['Trading master switch is disabled'],
        warnings: [],
      };
    }

    // 3. Market Session Enforcement (if configured)
    if (this.policy.enforceMarketHours && input.isMarketOpen === false) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'MARKET_CLOSED',
        reason: 'Vietnamese market is currently closed. Paper orders cannot be authorized outside trading hours.',
        errors: ['Market session is closed'],
        warnings: [],
      };
    }

    // 4. Validate Account Capital & Cash
    const equity = input.accountEquity;
    const cash = input.availableCash;
    const exposure = input.currentExposure ?? 0;

    const riskParamVal = TradingDataValidator.validateRiskParameters({
      accountEquity: equity,
      availableCash: cash,
      currentExposure: exposure,
    });
    if (!riskParamVal.isValid) {
      return {
        status: 'INVALID',
        authorization: 'INVALID',
        approved: false,
        code: riskParamVal.code === 'OK' ? 'INSUFFICIENT_CASH' : riskParamVal.code,
        reason: riskParamVal.message,
        errors: riskParamVal.errors,
        warnings: riskParamVal.warnings,
      };
    }

    // 5. Daily Realized Loss Limit Check
    const maxDailyLoss = equity * (this.policy.dailyLossLimitPercent / 100);
    const dailyLoss = input.dailyRealizedLoss ?? 0;
    if (dailyLoss >= maxDailyLoss) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'DAILY_LOSS_LIMIT',
        reason: `Daily realized loss (${dailyLoss.toLocaleString('vi-VN')} VND) reached or exceeded limit of ${this.policy.dailyLossLimitPercent}% equity (${maxDailyLoss.toLocaleString('vi-VN')} VND)`,
        errors: [`Daily loss limit exceeded: ${dailyLoss} >= ${maxDailyLoss}`],
        warnings: [],
      };
    }

    // 6. Maximum Concurrent Open Positions Check (New positions only)
    const openCount = input.openPositionsCount ?? 0;
    if (input.signal === 'BUY' && openCount >= this.policy.maxOpenPositions) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'POSITION_LIMIT',
        reason: `Maximum concurrent open positions reached (${openCount}/${this.policy.maxOpenPositions}). Cannot open new position.`,
        errors: [`Open position count ${openCount} reached limit of ${this.policy.maxOpenPositions}`],
        warnings: [],
      };
    }

    // 7. Duplicate Position / Pyramiding Conflict Check (BUY only)
    if (input.signal === 'BUY' && input.existingSymbols && input.existingSymbols.map((s) => s.toUpperCase()).includes(symbol)) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'POSITION_LIMIT_EXCEEDED',
        reason: `Position already exists for symbol ${symbol}. Pyramiding / duplicate positions are restricted.`,
        errors: [`Symbol ${symbol} already present in active portfolio`],
        warnings: [],
      };
    }

    // 8. Ceiling & Floor Hard Limit Checks (Exchange Limits)
    if (input.ceilingPrice && input.entryPrice > input.ceilingPrice) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'PRICE_LIMIT_VIOLATION',
        reason: `Entry price (${input.entryPrice}) exceeds exchange ceiling price (${input.ceilingPrice})`,
        errors: [`Entry price ${input.entryPrice} > ceiling ${input.ceilingPrice}`],
        warnings: [],
      };
    }

    if (input.floorPrice && input.entryPrice < input.floorPrice) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'PRICE_LIMIT_VIOLATION',
        reason: `Entry price (${input.entryPrice}) is below exchange floor price (${input.floorPrice})`,
        errors: [`Entry price ${input.entryPrice} < floor ${input.floorPrice}`],
        warnings: [],
      };
    }

    // 9. Live Price Deviation Check (if currentPrice is supplied)
    if (input.currentPrice !== undefined && input.currentPrice !== null) {
      if (input.currentPrice <= 0 || !Number.isFinite(input.currentPrice) || Number.isNaN(input.currentPrice)) {
        return {
          status: 'INVALID',
          authorization: 'INVALID',
          approved: false,
          code: 'INVALID_PRICE',
          reason: `Current market price is invalid: ${input.currentPrice}`,
          errors: [`Invalid current price: ${input.currentPrice}`],
          warnings: [],
        };
      }

      const devPct = Math.abs(input.currentPrice - input.entryPrice) / input.currentPrice * 100;
      if (devPct > this.policy.maxPriceDeviationPercent) {
        return {
          status: 'BLOCKED',
          authorization: 'BLOCKED',
          approved: false,
          code: 'INVALID_PRICE',
          reason: `Signal entry price (${input.entryPrice}) deviates by ${devPct.toFixed(2)}% from live price (${input.currentPrice}), exceeding tolerance of ${this.policy.maxPriceDeviationPercent}%`,
          errors: [`Price deviation ${devPct.toFixed(2)}% > tolerance ${this.policy.maxPriceDeviationPercent}%`],
          warnings: [],
        };
      }
    }

    // 10. Validate Signal & Price Directional Sanity
    const signalObj: TradingSignal = {
      symbol,
      signal: input.signal,
      confidence: input.confidence,
      score: input.score,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      targetPrice: input.targetPrice,
      timestamp: input.timestamp,
    };

    const signalVal = TradingDataValidator.validateSignal(signalObj, {
      minimumRiskReward: this.policy.minimumRiskReward,
      minimumConfidence: this.policy.minimumConfidence,
    });
    if (!signalVal.isValid) {
      return {
        status: 'INVALID',
        authorization: 'INVALID',
        approved: false,
        code: signalVal.code === 'OK' ? 'INVALID_SIGNAL' : signalVal.code,
        reason: signalVal.message,
        errors: signalVal.errors,
        warnings: signalVal.warnings,
      };
    }

    // If signal is non-BUY (HOLD / SELL), authorize as valid monitor/exit
    if (input.signal !== 'BUY') {
      return {
        status: 'VALID',
        authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
        approved: true,
        code: 'APPROVED',
        reason: `Non-BUY signal (${input.signal}) approved for tracking/exit`,
        errors: [],
        warnings,
      };
    }

    // 11. Position Sizing & Quantitative Risk Calculations
    const maxRiskBudget = equity * (this.policy.maxRiskPerTradePercent / 100);
    const riskPerShare = input.entryPrice - input.stopLoss;

    if (riskPerShare <= 0) {
      return {
        status: 'INVALID',
        authorization: 'INVALID',
        approved: false,
        code: 'INVALID_STOP_LOSS',
        reason: `Risk per share must be positive, got ${riskPerShare} (entry: ${input.entryPrice}, stopLoss: ${input.stopLoss})`,
        errors: [`Invalid risk per share: ${riskPerShare}`],
        warnings: [],
      };
    }

    // Theoretical shares from risk budget
    const rawSharesFromRisk = maxRiskBudget / riskPerShare;
    let approvedQuantity = VietnamLotRule.roundDownToLot(rawSharesFromRisk, this.policy.lotSize);

    // Ensure rounding didn't breach risk budget
    while (approvedQuantity * riskPerShare > maxRiskBudget && approvedQuantity >= this.policy.lotSize) {
      approvedQuantity -= this.policy.lotSize;
    }

    // Minimum capital check for buying
    const minOrderCost = this.policy.minimumOrderQuantity * input.entryPrice;
    if (cash < minOrderCost) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'INSUFFICIENT_CASH',
        reason: `Available cash (${cash.toLocaleString('vi-VN')} VND) is insufficient for minimum order of ${this.policy.minimumOrderQuantity} shares (${minOrderCost.toLocaleString('vi-VN')} VND)`,
        errors: [`Available cash ${cash} < minimum order cost ${minOrderCost}`],
        warnings: [],
      };
    }

    // Minimum lot check
    if (approvedQuantity < this.policy.minimumOrderQuantity) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'INVALID_LOT_SIZE',
        reason: `Computed position quantity (${approvedQuantity}) is below minimum order size (${this.policy.minimumOrderQuantity} shares). Risk budget: ${maxRiskBudget.toLocaleString('vi-VN')} VND, Risk/share: ${riskPerShare.toLocaleString('vi-VN')} VND.`,
        errors: [`Position size ${approvedQuantity} < minimum lot ${this.policy.minimumOrderQuantity}`],
        warnings: [],
      };
    }

    // Capital calculations
    const buyCost = approvedQuantity * input.entryPrice;
    const buyFee = Math.round(buyCost * this.policy.buyFeeRate);
    const slippageBuffer = Math.round(buyCost * this.policy.slippageRate);
    const totalCapitalRequirement = buyCost + buyFee + slippageBuffer;

    // Single Position Allocation Check (% of Equity)
    const maxSinglePositionCapital = equity * (this.policy.maxPositionPercent / 100);
    if (buyCost > maxSinglePositionCapital) {
      // Down-scale to fit maxPositionPercent if possible, or reject
      const maxSharesByPosition = Math.floor(maxSinglePositionCapital / input.entryPrice / this.policy.lotSize) * this.policy.lotSize;
      if (maxSharesByPosition < this.policy.minimumOrderQuantity) {
        return {
          status: 'BLOCKED',
          authorization: 'BLOCKED',
          approved: false,
          code: 'POSITION_LIMIT_EXCEEDED',
          reason: `Position cost (${buyCost.toLocaleString('vi-VN')} VND) exceeds maximum single position limit of ${this.policy.maxPositionPercent}% equity (${maxSinglePositionCapital.toLocaleString('vi-VN')} VND)`,
          errors: [`Position cost ${buyCost} > max position capital ${maxSinglePositionCapital}`],
          warnings: [],
        };
      }
      // Re-adjust down to max allowable
      approvedQuantity = Math.min(approvedQuantity, maxSharesByPosition);
    }

    // Available Cash Check
    if (totalCapitalRequirement > cash) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'INSUFFICIENT_CASH',
        reason: `Total required capital (${totalCapitalRequirement.toLocaleString('vi-VN')} VND) exceeds available cash (${cash.toLocaleString('vi-VN')} VND)`,
        errors: [`Capital required ${totalCapitalRequirement} > available cash ${cash}`],
        warnings: [],
      };
    }

    // Total Portfolio Exposure Check
    const maxAllowedExposure = equity * (this.policy.maxPortfolioExposurePercent / 100);
    const newTotalExposure = exposure + buyCost;
    if (newTotalExposure > maxAllowedExposure) {
      return {
        status: 'BLOCKED',
        authorization: 'BLOCKED',
        approved: false,
        code: 'EXPOSURE_LIMIT_EXCEEDED',
        reason: `New portfolio exposure (${newTotalExposure.toLocaleString('vi-VN')} VND, ${(newTotalExposure / equity * 100).toFixed(1)}%) exceeds maximum portfolio exposure limit of ${this.policy.maxPortfolioExposurePercent}% equity (${maxAllowedExposure.toLocaleString('vi-VN')} VND)`,
        errors: [`New exposure ${newTotalExposure} > max exposure ${maxAllowedExposure}`],
        warnings: [],
      };
    }

    // 12. Risk / Reward Calculation
    const rewardDistance = input.targetPrice - input.entryPrice;
    const computedRR = Number((rewardDistance / riskPerShare).toFixed(2));
    const actualRiskAmount = approvedQuantity * riskPerShare;
    const actualRiskPercent = Number(((actualRiskAmount / equity) * 100).toFixed(2));
    const positionPercent = Number(((buyCost / equity) * 100).toFixed(2));
    const exposurePercent = Number(((newTotalExposure / equity) * 100).toFixed(2));

    return {
      status: 'VALID',
      authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      approved: true,
      code: 'APPROVED',
      reason: 'Trade passed all risk guard policies and is authorized for paper trading',
      errors: [],
      warnings,
      metrics: {
        approvedQuantity,
        riskAmount: actualRiskAmount,
        riskPercent: actualRiskPercent,
        positionPercent,
        exposurePercent,
        rrRatio: computedRR,
        totalCapitalRequirement,
        riskApprovedCapital: totalCapitalRequirement,
        buyCost,
        buyFee,
        slippageBuffer,
      },
    };
  }

  /**
   * Direct bridge: Evaluates an InvestmentRecommendation from Phase 17 alongside market quote & account context.
   */
  evaluateRecommendation(
    rec: InvestmentRecommendation,
    marketData: TradingMarketData | undefined,
    context: {
      accountEquity: number;
      availableCash: number;
      currentExposure: number;
      openPositionsCount?: number;
      dailyRealizedLoss?: number;
      existingSymbols?: string[];
      emergencyStop?: boolean;
      tradingEnabled?: boolean;
      isMarketOpen?: boolean;
    }
  ): RiskGuardResult {
    // 1. Validate Recommendation structure first
    const recVal = TradingDataValidator.validateRecommendation(rec, marketData, {
      minimumRiskReward: this.policy.minimumRiskReward,
      minimumConfidence: this.policy.minimumConfidence,
      maxPriceDeviationPercent: this.policy.maxPriceDeviationPercent,
      maxStaleTimeMs: this.policy.maxStaleTimeMs,
    });

    if (!recVal.isValid) {
      return {
        status: 'INVALID',
        authorization: 'INVALID',
        approved: false,
        code: recVal.code === 'OK' ? 'INVALID_SIGNAL' : recVal.code,
        reason: recVal.message,
        errors: recVal.errors,
        warnings: recVal.warnings,
      };
    }

    // 2. Map into RiskGuardEvaluationInput
    return this.evaluate({
      symbol: rec.symbol,
      signal: rec.signal,
      entryPrice: rec.entryPrice ?? marketData?.price ?? 0,
      stopLoss: rec.stopLoss ?? 0,
      targetPrice: rec.targetPrice ?? 0,
      confidence: rec.confidence,
      score: rec.score,
      currentPrice: marketData?.price,
      ceilingPrice: marketData?.ceilingPrice,
      floorPrice: marketData?.floorPrice,
      timestamp: rec.generatedAt,
      accountEquity: context.accountEquity,
      availableCash: context.availableCash,
      currentExposure: context.currentExposure,
      openPositionsCount: context.openPositionsCount,
      dailyRealizedLoss: context.dailyRealizedLoss,
      existingSymbols: context.existingSymbols,
      emergencyStop: context.emergencyStop,
      tradingEnabled: context.tradingEnabled,
      isMarketOpen: context.isMarketOpen,
    });
  }
}
