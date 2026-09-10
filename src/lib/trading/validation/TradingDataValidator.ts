/**
 * PHASE 18.1 — TRADING DATA VALIDATOR
 * ====================================
 * Strict, deterministic validation for market data, signals, and session states.
 * Enforces fail-closed behavior: any inconsistency returns NO_TRADE with clear code.
 */

import type {
  TradingMarketData,
  TradingSignal,
  ValidationResult,
  ValidationErrorCode,
} from '../types/trading.ts';

export interface MarketDataValidationOptions {
  maxStaleTimeMs?: number;
  now?: number;
}

export interface SignalValidationOptions {
  minimumRiskReward?: number;
}

export class TradingDataValidator {
  /**
   * Validates raw market quote/bar data before any trading logic.
   */
  static validateMarketData(
    data: TradingMarketData,
    options: MarketDataValidationOptions = {}
  ): ValidationResult {
    // 1. Symbol validation
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        code: 'DATA_UNAVAILABLE',
        message: 'Market data object is missing or null',
        reason: 'DATA_IS_NULL',
      };
    }

    const symbol = data.symbol ? String(data.symbol).trim().toUpperCase() : '';
    if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      return {
        isValid: false,
        code: 'DATA_UNAVAILABLE',
        message: `Invalid or missing stock symbol: "${data.symbol}"`,
        reason: 'INVALID_SYMBOL',
      };
    }

    // 2. Price validation
    if (
      typeof data.price !== 'number' ||
      !Number.isFinite(data.price) ||
      Number.isNaN(data.price) ||
      data.price <= 0
    ) {
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `Current market price for ${symbol} must be a positive finite number, got: ${data.price}`,
        reason: 'PRICE_NOT_POSITIVE_FINITE',
      };
    }

    // 3. Timestamp / Staleness validation
    const now = options.now ?? Date.now();
    const maxStaleMs = options.maxStaleTimeMs ?? 120_000;

    if (data.timestamp !== undefined && data.timestamp !== null) {
      const ts =
        typeof data.timestamp === 'number'
          ? data.timestamp
          : new Date(data.timestamp).getTime();

      if (!Number.isFinite(ts) || Number.isNaN(ts)) {
        return {
          isValid: false,
          code: 'STALE_DATA',
          message: `Timestamp for ${symbol} is invalid: ${data.timestamp}`,
          reason: 'INVALID_TIMESTAMP',
        };
      }

      // Check future timestamp (+60s tolerance for clock drift)
      if (ts > now + 60_000) {
        return {
          isValid: false,
          code: 'STALE_DATA',
          message: `Timestamp for ${symbol} is in the future: ${new Date(ts).toISOString()}`,
          reason: 'FUTURE_TIMESTAMP',
        };
      }

      if (now - ts > maxStaleMs) {
        return {
          isValid: false,
          code: 'STALE_DATA',
          message: `Market data for ${symbol} is stale: age ${Math.round((now - ts) / 1000)}s exceeds limit of ${Math.round(maxStaleMs / 1000)}s`,
          reason: 'DATA_EXCEEDS_MAX_STALENESS',
        };
      }
    }

    // 4. OHLC Consistency check
    const hasHigh = typeof data.high === 'number' && Number.isFinite(data.high);
    const hasLow = typeof data.low === 'number' && Number.isFinite(data.low);
    const hasClose = typeof data.close === 'number' && Number.isFinite(data.close);
    const hasOpen = typeof data.open === 'number' && Number.isFinite(data.open);

    if (hasHigh && hasLow) {
      if (data.high! < data.low!) {
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Bar high (${data.high}) is lower than low (${data.low}) for ${symbol}`,
          reason: 'HIGH_LESS_THAN_LOW',
        };
      }
    }

    if (hasClose && hasHigh && hasLow) {
      if (data.close! > data.high! || data.close! < data.low!) {
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Bar close (${data.close}) is outside high-low range [${data.low}, ${data.high}] for ${symbol}`,
          reason: 'CLOSE_OUT_OF_BOUNDS',
        };
      }
    }

    if (hasOpen && hasHigh && hasLow) {
      if (data.open! > data.high! || data.open! < data.low!) {
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Bar open (${data.open}) is outside high-low range [${data.low}, ${data.high}] for ${symbol}`,
          reason: 'OPEN_OUT_OF_BOUNDS',
        };
      }
    }

    // 5. Volume check
    if (data.volume !== undefined && data.volume !== null) {
      if (typeof data.volume !== 'number' || !Number.isFinite(data.volume) || data.volume < 0) {
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Volume for ${symbol} must be a non-negative number, got: ${data.volume}`,
          reason: 'VOLUME_NEGATIVE_OR_INVALID',
        };
      }
    }

    // 6. Ceiling and Floor price limit enforcement (HSX/HNX rules)
    if (typeof data.ceilingPrice === 'number' && Number.isFinite(data.ceilingPrice) && data.ceilingPrice > 0) {
      if (data.price > data.ceilingPrice) {
        return {
          isValid: false,
          code: 'PRICE_LIMIT_VIOLATION',
          message: `Current price (${data.price}) exceeds ceiling price (${data.ceilingPrice}) for ${symbol}`,
          reason: 'PRICE_EXCEEDS_CEILING',
        };
      }
    }

    if (typeof data.floorPrice === 'number' && Number.isFinite(data.floorPrice) && data.floorPrice > 0) {
      if (data.price < data.floorPrice) {
        return {
          isValid: false,
          code: 'PRICE_LIMIT_VIOLATION',
          message: `Current price (${data.price}) is below floor price (${data.floorPrice}) for ${symbol}`,
          reason: 'PRICE_BELOW_FLOOR',
        };
      }
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Market data is valid',
    };
  }

  /**
   * Validates an investment/trading signal before passing to RiskManager.
   */
  static validateSignal(
    signal: TradingSignal,
    options: SignalValidationOptions = {}
  ): ValidationResult {
    if (!signal || typeof signal !== 'object') {
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: 'Signal object is missing or null',
        reason: 'SIGNAL_IS_NULL',
      };
    }

    const minRR = options.minimumRiskReward ?? 2.0;

    // Check valid signal actions
    if (!['BUY', 'SELL', 'HOLD'].includes(signal.signal)) {
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: `Signal action "${signal.signal}" is not actionable or recognized`,
        reason: 'UNRECOGNIZED_SIGNAL_ACTION',
      };
    }

    // For non-BUY signals (HOLD, SELL), basic validation
    if (signal.signal !== 'BUY') {
      return {
        isValid: true,
        code: 'OK',
        message: `Non-BUY signal (${signal.signal}) is valid for monitoring/exit`,
      };
    }

    // BUY Signal requires positive entry, stop loss, and target prices
    if (
      typeof signal.entryPrice !== 'number' ||
      !Number.isFinite(signal.entryPrice) ||
      signal.entryPrice <= 0
    ) {
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `BUY signal entry price must be a positive number, got: ${signal.entryPrice}`,
        reason: 'ENTRY_PRICE_NOT_POSITIVE',
      };
    }

    if (
      typeof signal.stopLoss !== 'number' ||
      !Number.isFinite(signal.stopLoss) ||
      signal.stopLoss <= 0
    ) {
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `BUY signal stop loss must be a positive number, got: ${signal.stopLoss}`,
        reason: 'STOP_LOSS_NOT_POSITIVE',
      };
    }

    if (
      typeof signal.targetPrice !== 'number' ||
      !Number.isFinite(signal.targetPrice) ||
      signal.targetPrice <= 0
    ) {
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `BUY signal target price must be a positive number, got: ${signal.targetPrice}`,
        reason: 'TARGET_PRICE_NOT_POSITIVE',
      };
    }

    // Long position directional rules: Stop Loss < Entry Price < Target Price
    if (signal.stopLoss >= signal.entryPrice) {
      return {
        isValid: false,
        code: 'INVALID_RISK_REWARD',
        message: `Stop loss (${signal.stopLoss}) must be strictly lower than entry price (${signal.entryPrice})`,
        reason: 'STOP_LOSS_GE_ENTRY',
      };
    }

    if (signal.targetPrice <= signal.entryPrice) {
      return {
        isValid: false,
        code: 'INVALID_RISK_REWARD',
        message: `Target price (${signal.targetPrice}) must be strictly higher than entry price (${signal.entryPrice})`,
        reason: 'TARGET_PRICE_LE_ENTRY',
      };
    }

    // Risk / Reward ratio calculation
    const riskDistance = signal.entryPrice - signal.stopLoss;
    const rewardDistance = signal.targetPrice - signal.entryPrice;
    const computedRR = Number((rewardDistance / riskDistance).toFixed(4));

    if (computedRR < minRR) {
      return {
        isValid: false,
        code: 'INVALID_RISK_REWARD',
        message: `Risk/Reward ratio (${computedRR.toFixed(2)}) is below the required threshold of ${minRR.toFixed(1)}`,
        reason: 'RR_BELOW_MINIMUM',
        details: { computedRR, minimumRequired: minRR },
      };
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Signal is valid',
      details: { computedRR },
    };
  }

  /**
   * Validates if the market session permits opening new orders.
   */
  static validateMarketSession(isMarketOpen: boolean | undefined): ValidationResult {
    if (isMarketOpen === false) {
      return {
        isValid: false,
        code: 'MARKET_CLOSED',
        message: 'Vietnamese stock market is currently closed',
        reason: 'MARKET_SESSION_CLOSED',
      };
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Market is open',
    };
  }

  /**
   * Computes Vietnamese market session state for a given date/time according to standard HOSE/HNX hours (UTC+7):
   * - Mon-Fri only
   * - 09:00 - 09:15: ATO (Call Auction)
   * - 09:15 - 11:30: Continuous Morning Session
   * - 11:30 - 13:00: Lunch Break (Closed)
   * - 13:00 - 14:30: Continuous Afternoon Session
   * - 14:30 - 14:45: ATC (Closing Auction)
   * - After 14:45 / Before 09:00 / Weekends: Closed
   */
  static checkVnMarketSession(dateOrTimestamp?: Date | number | string): {
    isOpen: boolean;
    state: 'TRADING' | 'CLOSED';
    sessionName: string;
    reason?: string;
  } {
    const now = dateOrTimestamp ? new Date(dateOrTimestamp) : new Date();
    const vnOffset = 7 * 60; // UTC+7 in minutes
    const localOffset = now.getTimezoneOffset();
    const vnTime = new Date(now.getTime() + (vnOffset + localOffset) * 60 * 1000);

    const day = vnTime.getDay();
    const hours = vnTime.getHours();
    const minutes = vnTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    const isTradingDay = day >= 1 && day <= 5;

    if (!isTradingDay) {
      return { isOpen: false, state: 'CLOSED', sessionName: 'Đã đóng cửa', reason: 'WEEKEND' };
    }

    if (totalMinutes < 540) { // Before 09:00
      return { isOpen: false, state: 'CLOSED', sessionName: 'Đã đóng cửa', reason: 'BEFORE_OPEN' };
    } else if (totalMinutes <= 555) { // 09:00 - 09:15
      return { isOpen: true, state: 'TRADING', sessionName: 'Phiên sáng (ATO)' };
    } else if (totalMinutes <= 690) { // 09:15 - 11:30
      return { isOpen: true, state: 'TRADING', sessionName: 'Khớp lệnh liên tục' };
    } else if (totalMinutes < 780) { // 11:30 - 13:00
      return { isOpen: false, state: 'CLOSED', sessionName: 'Nghỉ trưa', reason: 'LUNCH_BREAK' };
    } else if (totalMinutes <= 870) { // 13:00 - 14:30
      return { isOpen: true, state: 'TRADING', sessionName: 'Phiên chiều' };
    } else if (totalMinutes <= 885) { // 14:30 - 14:45
      return { isOpen: true, state: 'TRADING', sessionName: 'Phiên ATC' };
    } else {
      return { isOpen: false, state: 'CLOSED', sessionName: 'Đã đóng cửa', reason: 'AFTER_CLOSE' };
    }
  }

  /**
   * Validates candidate trade consistency across market data, signal, and market session.
   */
  static validateCandidate(
    marketData: TradingMarketData,
    signal: TradingSignal,
    options: {
      isMarketOpen?: boolean;
      maxStaleTimeMs?: number;
      minimumRiskReward?: number;
      maxPriceDeviationPercent?: number;
    } = {}
  ): ValidationResult {
    // 1. Validate Market Data
    const marketValidation = this.validateMarketData(marketData, {
      maxStaleTimeMs: options.maxStaleTimeMs,
    });
    if (!marketValidation.isValid) {
      return marketValidation;
    }

    // 2. Validate Market Session
    const sessionValidation = this.validateMarketSession(options.isMarketOpen);
    if (!sessionValidation.isValid) {
      return sessionValidation;
    }

    // 3. Validate Signal
    const signalValidation = this.validateSignal(signal, {
      minimumRiskReward: options.minimumRiskReward,
    });
    if (!signalValidation.isValid) {
      return signalValidation;
    }

    // 4. Symbol match
    if (marketData.symbol.toUpperCase() !== signal.symbol.toUpperCase()) {
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: `Symbol mismatch between market data (${marketData.symbol}) and signal (${signal.symbol})`,
        reason: 'SYMBOL_MISMATCH',
      };
    }

    // 5. Price discrepancy check between live market price and signal entry price
    const maxDeviation = options.maxPriceDeviationPercent ?? 3.0; // 3% tolerance
    const deviationPercent =
      Math.abs(marketData.price - signal.entryPrice) / marketData.price * 100;

    if (deviationPercent > maxDeviation) {
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `Signal entry price (${signal.entryPrice}) deviates by ${deviationPercent.toFixed(2)}% from live price (${marketData.price}), exceeding tolerance of ${maxDeviation}%`,
        reason: 'EXCESSIVE_PRICE_DEVIATION',
        details: { livePrice: marketData.price, entryPrice: signal.entryPrice, deviationPercent },
      };
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Candidate validated successfully',
    };
  }
}
