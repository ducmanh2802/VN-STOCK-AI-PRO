/**
 * PHASE 18.1 — RISK MANAGEMENT ENGINE
 * ====================================
 * Gatekeeper for all automated trading actions.
 * Enforces:
 *   1. Master kill switch (EMERGENCY_STOP, TRADING_ENABLED)
 *   2. Market session constraints (ATO, ATC, continuous, closed)
 *   3. Daily loss limits (e.g. 3% equity)
 *   4. Maximum concurrent open positions (e.g. 10)
 *   5. Duplicate position conflict prevention
 *   6. Minimum Risk/Reward ratio (>= 2.0)
 *   7. Price ceiling/floor limits
 *   8. Capital, fee, and exposure constraints via PositionSizer
 */

import type {
  TradingSignal,
  TradingMarketData,
  TradeDecision,
} from '../types/trading.ts';
import type {
  RiskConfig,
  RiskContext,
  RiskCheckResult,
} from '../types/risk.ts';
import { DEFAULT_RISK_CONFIG } from '../types/risk.ts';
import { PositionSizer } from './PositionSizer.ts';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';

export class RiskManager {
  private config: RiskConfig;

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
  }

  /**
   * Updates risk parameters dynamically.
   */
  updateConfig(newConfig: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Retrieves current risk parameters.
   */
  getConfig(): Readonly<RiskConfig> {
    return this.config;
  }

  /**
   * Evaluates if a proposed trade passes all portfolio-level and trade-level risk checks.
   */
  checkRisk(
    signal: TradingSignal,
    marketData: TradingMarketData,
    context: RiskContext
  ): RiskCheckResult {
    // 1. Emergency Stop Check (Top Priority)
    if (context.emergencyStop) {
      return {
        approved: false,
        code: 'EMERGENCY_STOP',
        reason: 'Emergency stop is active: all new orders are strictly blocked.',
      };
    }

    // 2. Global Trading Enabled Master Switch
    if (!context.tradingEnabled) {
      return {
        approved: false,
        code: 'TRADING_DISABLED',
        reason: 'Automated trading is currently disabled.',
      };
    }

    // 3. Market Session Check
    if (context.isMarketOpen === false) {
      return {
        approved: false,
        code: 'MARKET_CLOSED',
        reason: 'Vietnamese market is closed. Orders cannot be created outside trading sessions.',
      };
    }

    // 4. Daily Realized Loss Limit Check
    const maxDailyLoss = context.accountEquity * this.config.dailyLossLimitRate;
    if (context.dailyRealizedLoss >= maxDailyLoss) {
      return {
        approved: false,
        code: 'DAILY_LOSS_LIMIT',
        reason: `Daily loss limit reached: accumulated loss (${context.dailyRealizedLoss.toLocaleString('vi-VN')} VND) >= ${(this.config.dailyLossLimitRate * 100).toFixed(0)}% equity limit (${maxDailyLoss.toLocaleString('vi-VN')} VND).`,
      };
    }

    // 5. Maximum Concurrent Open Positions Check
    if (context.openPositionsCount >= this.config.maxOpenPositions) {
      return {
        approved: false,
        code: 'POSITION_LIMIT',
        reason: `Max open positions reached (${context.openPositionsCount}/${this.config.maxOpenPositions}). Cannot open new position.`,
      };
    }

    // 6. Existing Position Conflict Check
    if (context.existingSymbols && context.existingSymbols.includes(signal.symbol.toUpperCase())) {
      return {
        approved: false,
        code: 'POSITION_LIMIT',
        reason: `Position already exists for symbol ${signal.symbol}. Pyramiding / duplicate positions are restricted.`,
      };
    }

    // 7. Market Data Integrity & Staleness Validation
    const marketValidation = TradingDataValidator.validateMarketData(marketData, {
      maxStaleTimeMs: this.config.maxStaleTimeMs,
    });
    if (!marketValidation.isValid) {
      return {
        approved: false,
        code: marketValidation.code === 'OK' ? 'DATA_UNAVAILABLE' : marketValidation.code,
        reason: marketValidation.message,
      };
    }

    // 8. Ceiling & Floor Price Limit Violation Check (Exchange Hard Limits)
    if (marketData.ceilingPrice && signal.entryPrice > marketData.ceilingPrice) {
      return {
        approved: false,
        code: 'PRICE_LIMIT_VIOLATION',
        reason: `Entry price (${signal.entryPrice}) exceeds daily ceiling price (${marketData.ceilingPrice}).`,
      };
    }

    if (marketData.floorPrice && signal.entryPrice < marketData.floorPrice) {
      return {
        approved: false,
        code: 'PRICE_LIMIT_VIOLATION',
        reason: `Entry price (${signal.entryPrice}) is below daily floor price (${marketData.floorPrice}).`,
      };
    }

    // 9. Signal Direction & Parameters Validation
    const signalValidation = TradingDataValidator.validateSignal(signal, {
      minimumRiskReward: this.config.minimumRiskReward,
    });
    if (!signalValidation.isValid) {
      return {
        approved: false,
        code: signalValidation.code === 'OK' ? 'INVALID_SIGNAL' : signalValidation.code,
        reason: signalValidation.message,
      };
    }

    // 10. Position Sizing & Capital Allocation Check
    const sizingResult = PositionSizer.calculate({
      equity: context.accountEquity,
      availableCash: context.availableCash,
      entryPrice: signal.entryPrice,
      stopLossPrice: signal.stopLoss,
      maxRiskPerTradeRate: this.config.maxRiskPerTradeRate,
      lotSize: this.config.lotSize,
      buyFeeRate: this.config.buyFeeRate,
      slippageRate: this.config.slippageRate,
      existingExposure: context.currentExposure,
      maxPortfolioExposureRate: this.config.maxPortfolioExposureRate,
    });

    if (!sizingResult.canTrade) {
      return {
        approved: false,
        code: sizingResult.code === 'SUCCESS' ? 'INSUFFICIENT_CASH' : sizingResult.code,
        reason: sizingResult.reason || 'Position sizing rejected trade',
      };
    }

    // 11. All Checks Passed
    const rrRatio = Number(
      ((signal.targetPrice - signal.entryPrice) / (signal.entryPrice - signal.stopLoss)).toFixed(2)
    );

    return {
      approved: true,
      code: 'APPROVED',
      reason: 'Trade passed all risk validation policies',
      metrics: {
        riskAmount: sizingResult.riskAmount,
        riskPercent: Number(((sizingResult.riskAmount / context.accountEquity) * 100).toFixed(2)),
        exposurePercent: Number(
          (((context.currentExposure + sizingResult.buyCost) / context.accountEquity) * 100).toFixed(1)
        ),
        rrRatio,
      },
    };
  }

  /**
   * Evaluates candidate signal into a final TradeDecision.
   */
  evaluateTrade(
    signal: TradingSignal,
    marketData: TradingMarketData,
    context: RiskContext
  ): TradeDecision {
    const riskCheck = this.checkRisk(signal, marketData, context);
    const nowIso = new Date().toISOString();

    const rrRatio =
      signal.entryPrice > signal.stopLoss && signal.stopLoss > 0
        ? Number(((signal.targetPrice - signal.entryPrice) / (signal.entryPrice - signal.stopLoss)).toFixed(2))
        : 0;

    if (!riskCheck.approved) {
      return {
        decision: 'NO_TRADE',
        symbol: signal.symbol,
        signal: signal.signal,
        quantity: 0,
        entryPrice: signal.entryPrice,
        stopLossPrice: signal.stopLoss,
        targetPrice: signal.targetPrice,
        riskRewardRatio: rrRatio,
        totalCapitalRequirement: 0,
        rejectionCode: riskCheck.code === 'APPROVED' ? undefined : riskCheck.code,
        rejectionReason: riskCheck.reason,
        timestamp: nowIso,
      };
    }

    // Calculate approved position size
    const sizing = PositionSizer.calculate({
      equity: context.accountEquity,
      availableCash: context.availableCash,
      entryPrice: signal.entryPrice,
      stopLossPrice: signal.stopLoss,
      maxRiskPerTradeRate: this.config.maxRiskPerTradeRate,
      lotSize: this.config.lotSize,
      buyFeeRate: this.config.buyFeeRate,
      slippageRate: this.config.slippageRate,
      existingExposure: context.currentExposure,
      maxPortfolioExposureRate: this.config.maxPortfolioExposureRate,
    });

    return {
      decision: 'APPROVED_TRADE',
      symbol: signal.symbol,
      signal: signal.signal,
      quantity: sizing.quantity,
      entryPrice: signal.entryPrice,
      stopLossPrice: signal.stopLoss,
      targetPrice: signal.targetPrice,
      riskRewardRatio: rrRatio,
      totalCapitalRequirement: sizing.totalCapitalRequirement,
      timestamp: nowIso,
    };
  }
}
