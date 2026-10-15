/**
 * PHASE 18.1 — TRADING DATA VALIDATOR
 * ====================================
 * Strict, deterministic validation for market data, signals, session states, and recommendations.
 * Enforces strict fail-closed behavior:
 *   - Any inconsistency, missing value, NaN, Infinity, negative price, or illegal bounds
 *     returns isValid = false with a typed reason code and structured error array.
 *   - Never guesses, never substitutes null with 0 or synthetic averages.
 */

import type {
  TradingMarketData,
  TradingSignal,
  StructuredValidationResult,
  ValidationErrorCode,
} from '../types/trading.ts';
import type {
  InvestmentRecommendation,
  InvestmentHorizon,
  RecommendationSignal,
} from '../../../types/recommendation.ts';

export interface MarketDataValidationOptions {
  maxStaleTimeMs?: number;
  now?: number;
}

export interface SignalValidationOptions {
  minimumRiskReward?: number;
  minimumConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  allowedHorizons?: InvestmentHorizon[];
}

export interface RecommendationValidationOptions {
  minimumRiskReward?: number;
  minimumConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  maxPriceDeviationPercent?: number;
  maxStaleTimeMs?: number;
  now?: number;
}

export interface RiskParametersValidationInput {
  accountEquity: number;
  availableCash: number;
  currentExposure: number;
  maxRiskPerTradeRate?: number;
  maxPositionRate?: number;
  maxPortfolioExposureRate?: number;
  quantity?: number;
  entryPrice?: number;
  lotSize?: number;
}

export class TradingDataValidator {
  /**
   * Validates raw market quote / bar data before any trading logic.
   */
  static validateMarketData(
    data: TradingMarketData,
    options: MarketDataValidationOptions = {}
  ): StructuredValidationResult<TradingMarketData> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Structure validation
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        code: 'DATA_UNAVAILABLE',
        message: 'Market data object is missing or null',
        reason: 'DATA_IS_NULL',
        errors: ['Market data payload is null or undefined'],
        warnings: [],
      };
    }

    // 2. Symbol validation
    const symbol = data.symbol ? String(data.symbol).trim().toUpperCase() : '';
    if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      errors.push(`Invalid or missing stock symbol: "${data.symbol}"`);
      return {
        isValid: false,
        code: 'INVALID_SYMBOL',
        message: `Invalid or missing stock symbol: "${data.symbol}"`,
        reason: 'INVALID_SYMBOL',
        errors,
        warnings,
      };
    }

    // 3. Price validation (strictly positive finite number)
    if (
      typeof data.price !== 'number' ||
      !Number.isFinite(data.price) ||
      Number.isNaN(data.price) ||
      data.price <= 0
    ) {
      errors.push(`Current market price for ${symbol} must be a positive finite number, got: ${data.price}`);
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `Current market price for ${symbol} must be a positive finite number, got: ${data.price}`,
        reason: 'PRICE_NOT_POSITIVE_FINITE',
        errors,
        warnings,
      };
    }

    // 4. Timestamp / Staleness validation
    const now = options.now ?? Date.now();
    const maxStaleMs = options.maxStaleTimeMs ?? 120_000;

    if (data.timestamp !== undefined && data.timestamp !== null) {
      const ts =
        typeof data.timestamp === 'number'
          ? data.timestamp
          : new Date(data.timestamp).getTime();

      if (!Number.isFinite(ts) || Number.isNaN(ts)) {
        errors.push(`Timestamp for ${symbol} is invalid: ${data.timestamp}`);
        return {
          isValid: false,
          code: 'STALE_DATA',
          message: `Timestamp for ${symbol} is invalid: ${data.timestamp}`,
          reason: 'INVALID_TIMESTAMP',
          errors,
          warnings,
        };
      }

      // Check future timestamp (+60s tolerance for clock drift)
      if (ts > now + 60_000) {
        errors.push(`Timestamp for ${symbol} is in the future: ${new Date(ts).toISOString()}`);
        return {
          isValid: false,
          code: 'STALE_DATA',
          message: `Timestamp for ${symbol} is in the future: ${new Date(ts).toISOString()}`,
          reason: 'FUTURE_TIMESTAMP',
          errors,
          warnings,
        };
      }

      if (now - ts > maxStaleMs) {
        errors.push(`Market data for ${symbol} is stale: age ${Math.round((now - ts) / 1000)}s exceeds limit of ${Math.round(maxStaleMs / 1000)}s`);
        return {
          isValid: false,
          code: 'STALE_DATA',
          message: `Market data for ${symbol} is stale: age ${Math.round((now - ts) / 1000)}s exceeds limit of ${Math.round(maxStaleMs / 1000)}s`,
          reason: 'DATA_EXCEEDS_MAX_STALENESS',
          errors,
          warnings,
        };
      }
    }

    // 5. OHLC Consistency check
    const hasHigh = typeof data.high === 'number' && Number.isFinite(data.high);
    const hasLow = typeof data.low === 'number' && Number.isFinite(data.low);
    const hasClose = typeof data.close === 'number' && Number.isFinite(data.close);
    const hasOpen = typeof data.open === 'number' && Number.isFinite(data.open);

    if (hasHigh && hasLow) {
      if (data.high! < data.low!) {
        errors.push(`Bar high (${data.high}) is lower than low (${data.low}) for ${symbol}`);
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Bar high (${data.high}) is lower than low (${data.low}) for ${symbol}`,
          reason: 'HIGH_LESS_THAN_LOW',
          errors,
          warnings,
        };
      }
    }

    if (hasClose && hasHigh && hasLow) {
      if (data.close! > data.high! || data.close! < data.low!) {
        errors.push(`Bar close (${data.close}) is outside high-low range [${data.low}, ${data.high}] for ${symbol}`);
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Bar close (${data.close}) is outside high-low range [${data.low}, ${data.high}] for ${symbol}`,
          reason: 'CLOSE_OUT_OF_BOUNDS',
          errors,
          warnings,
        };
      }
    }

    if (hasOpen && hasHigh && hasLow) {
      if (data.open! > data.high! || data.open! < data.low!) {
        errors.push(`Bar open (${data.open}) is outside high-low range [${data.low}, ${data.high}] for ${symbol}`);
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Bar open (${data.open}) is outside high-low range [${data.low}, ${data.high}] for ${symbol}`,
          reason: 'OPEN_OUT_OF_BOUNDS',
          errors,
          warnings,
        };
      }
    }

    // 6. Volume check
    if (data.volume !== undefined && data.volume !== null) {
      if (typeof data.volume !== 'number' || !Number.isFinite(data.volume) || data.volume < 0) {
        errors.push(`Volume for ${symbol} must be a non-negative number, got: ${data.volume}`);
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `Volume for ${symbol} must be a non-negative number, got: ${data.volume}`,
          reason: 'VOLUME_NEGATIVE_OR_INVALID',
          errors,
          warnings,
        };
      }
    }

    // 7. Ceiling and Floor price limit enforcement (HSX/HNX rules)
    if (typeof data.ceilingPrice === 'number' && Number.isFinite(data.ceilingPrice) && data.ceilingPrice > 0) {
      if (data.price > data.ceilingPrice) {
        errors.push(`Current price (${data.price}) exceeds ceiling price (${data.ceilingPrice}) for ${symbol}`);
        return {
          isValid: false,
          code: 'PRICE_LIMIT_VIOLATION',
          message: `Current price (${data.price}) exceeds ceiling price (${data.ceilingPrice}) for ${symbol}`,
          reason: 'PRICE_EXCEEDS_CEILING',
          errors,
          warnings,
        };
      }
    }

    if (typeof data.floorPrice === 'number' && Number.isFinite(data.floorPrice) && data.floorPrice > 0) {
      if (data.price < data.floorPrice) {
        errors.push(`Current price (${data.price}) is below floor price (${data.floorPrice}) for ${symbol}`);
        return {
          isValid: false,
          code: 'PRICE_LIMIT_VIOLATION',
          message: `Current price (${data.price}) is below floor price (${data.floorPrice}) for ${symbol}`,
          reason: 'PRICE_BELOW_FLOOR',
          errors,
          warnings,
        };
      }
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Market data is valid',
      errors: [],
      warnings,
      validatedData: data,
    };
  }

  /**
   * Validates an investment/trading signal before passing to RiskGuard.
   */
  static validateSignal(
    signal: TradingSignal,
    options: SignalValidationOptions = {}
  ): StructuredValidationResult<TradingSignal> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!signal || typeof signal !== 'object') {
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: 'Signal object is missing or null',
        reason: 'SIGNAL_IS_NULL',
        errors: ['Signal payload is null or undefined'],
        warnings: [],
      };
    }

    // Symbol validation
    const symbol = signal.symbol ? String(signal.symbol).trim().toUpperCase() : '';
    if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      errors.push(`Invalid or missing stock symbol in signal: "${signal.symbol}"`);
      return {
        isValid: false,
        code: 'INVALID_SYMBOL',
        message: `Invalid or missing stock symbol in signal: "${signal.symbol}"`,
        reason: 'INVALID_SYMBOL',
        errors,
        warnings,
      };
    }

    const minRR = options.minimumRiskReward ?? 2.0;

    // Check valid signal actions
    if (!['BUY', 'SELL', 'HOLD'].includes(signal.signal)) {
      errors.push(`Signal action "${signal.signal}" is not actionable or recognized`);
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: `Signal action "${signal.signal}" is not actionable or recognized`,
        reason: 'UNRECOGNIZED_SIGNAL_ACTION',
        errors,
        warnings,
      };
    }

    // Check confidence if required
    if (options.minimumConfidence) {
      const confRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const minVal = confRank[options.minimumConfidence] ?? 1;
      const sigVal = typeof signal.confidence === 'string' ? confRank[signal.confidence] ?? 0 : 0;
      if (sigVal < minVal) {
        errors.push(`Signal confidence "${signal.confidence}" is lower than required "${options.minimumConfidence}"`);
        return {
          isValid: false,
          code: 'INSUFFICIENT_CONFIDENCE',
          message: `Signal confidence "${signal.confidence}" is lower than required "${options.minimumConfidence}"`,
          reason: 'INSUFFICIENT_CONFIDENCE',
          errors,
          warnings,
        };
      }
    }

    // Check score validity if present
    if (signal.score !== undefined && signal.score !== null) {
      if (typeof signal.score !== 'number' || !Number.isFinite(signal.score) || signal.score < 0 || signal.score > 100) {
        errors.push(`Signal score (${signal.score}) must be a finite number between 0 and 100`);
        return {
          isValid: false,
          code: 'INVALID_SIGNAL',
          message: `Signal score (${signal.score}) must be a finite number between 0 and 100`,
          reason: 'SCORE_OUT_OF_BOUNDS',
          errors,
          warnings,
        };
      }
    }

    // For non-BUY signals (HOLD, SELL), basic validation
    if (signal.signal !== 'BUY') {
      return {
        isValid: true,
        code: 'OK',
        message: `Non-BUY signal (${signal.signal}) is valid for monitoring/exit`,
        errors: [],
        warnings,
        validatedData: signal,
      };
    }

    // BUY Signal requires positive entry, stop loss, and target prices
    if (
      typeof signal.entryPrice !== 'number' ||
      !Number.isFinite(signal.entryPrice) ||
      signal.entryPrice <= 0
    ) {
      errors.push(`BUY signal entry price must be a positive number, got: ${signal.entryPrice}`);
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `BUY signal entry price must be a positive number, got: ${signal.entryPrice}`,
        reason: 'ENTRY_PRICE_NOT_POSITIVE',
        errors,
        warnings,
      };
    }

    if (
      typeof signal.stopLoss !== 'number' ||
      !Number.isFinite(signal.stopLoss) ||
      signal.stopLoss <= 0
    ) {
      errors.push(`BUY signal stop loss must be a positive number, got: ${signal.stopLoss}`);
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `BUY signal stop loss must be a positive number, got: ${signal.stopLoss}`,
        reason: 'STOP_LOSS_NOT_POSITIVE',
        errors,
        warnings,
      };
    }

    if (
      typeof signal.targetPrice !== 'number' ||
      !Number.isFinite(signal.targetPrice) ||
      signal.targetPrice <= 0
    ) {
      errors.push(`BUY signal target price must be a positive number, got: ${signal.targetPrice}`);
      return {
        isValid: false,
        code: 'INVALID_PRICE',
        message: `BUY signal target price must be a positive number, got: ${signal.targetPrice}`,
        reason: 'TARGET_PRICE_NOT_POSITIVE',
        errors,
        warnings,
      };
    }

    // Long position directional rules: Stop Loss < Entry Price < Target Price
    if (signal.stopLoss >= signal.entryPrice) {
      errors.push(`Stop loss (${signal.stopLoss}) must be strictly lower than entry price (${signal.entryPrice})`);
      return {
        isValid: false,
        code: 'INVALID_RISK_REWARD',
        message: `Stop loss (${signal.stopLoss}) must be strictly lower than entry price (${signal.entryPrice})`,
        reason: 'STOP_LOSS_GE_ENTRY',
        errors,
        warnings,
      };
    }

    if (signal.targetPrice <= signal.entryPrice) {
      errors.push(`Target price (${signal.targetPrice}) must be strictly higher than entry price (${signal.entryPrice})`);
      return {
        isValid: false,
        code: 'INVALID_RISK_REWARD',
        message: `Target price (${signal.targetPrice}) must be strictly higher than entry price (${signal.entryPrice})`,
        reason: 'TARGET_PRICE_LE_ENTRY',
        errors,
        warnings,
      };
    }

    // Risk / Reward ratio calculation
    const riskDistance = signal.entryPrice - signal.stopLoss;
    const rewardDistance = signal.targetPrice - signal.entryPrice;
    const computedRR = Number((rewardDistance / riskDistance).toFixed(4));

    if (computedRR < minRR) {
      errors.push(`Risk/Reward ratio (${computedRR.toFixed(2)}) is below the required threshold of ${minRR.toFixed(1)}`);
      return {
        isValid: false,
        code: 'INVALID_RISK_REWARD',
        message: `Risk/Reward ratio (${computedRR.toFixed(2)}) is below the required threshold of ${minRR.toFixed(1)}`,
        reason: 'RR_BELOW_MINIMUM',
        errors,
        warnings,
        details: { computedRR, minimumRequired: minRR },
      };
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Signal is valid',
      errors: [],
      warnings,
      details: { computedRR },
      validatedData: signal,
    };
  }

  /**
   * Validates an entire InvestmentRecommendation generated by Phase 17 engine.
   */
  static validateRecommendation(
    rec: InvestmentRecommendation,
    marketData?: TradingMarketData,
    options: RecommendationValidationOptions = {}
  ): StructuredValidationResult<InvestmentRecommendation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rec || typeof rec !== 'object') {
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: 'Recommendation object is null or invalid',
        reason: 'RECOMMENDATION_NULL',
        errors: ['Recommendation object is missing'],
        warnings: [],
      };
    }

    // 1. Symbol check
    const symbol = rec.symbol ? String(rec.symbol).trim().toUpperCase() : '';
    if (!symbol || !/^[A-Z0-9_.]{1,20}$/.test(symbol)) {
      errors.push(`Invalid symbol in recommendation: "${rec.symbol}"`);
      return {
        isValid: false,
        code: 'INVALID_SYMBOL',
        message: `Invalid symbol in recommendation: "${rec.symbol}"`,
        reason: 'INVALID_SYMBOL',
        errors,
        warnings,
      };
    }

    // 2. Signal check
    if (!['BUY', 'SELL', 'HOLD'].includes(rec.signal)) {
      errors.push(`Invalid signal: "${rec.signal}"`);
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: `Invalid signal: "${rec.signal}"`,
        reason: 'INVALID_SIGNAL',
        errors,
        warnings,
      };
    }

    // 3. Minimum Confidence check
    if (options.minimumConfidence) {
      const confRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const minVal = confRank[options.minimumConfidence] ?? 1;
      const recVal = confRank[rec.confidence] ?? 0;
      if (recVal < minVal) {
        errors.push(`Recommendation confidence "${rec.confidence}" is below required "${options.minimumConfidence}"`);
        return {
          isValid: false,
          code: 'INSUFFICIENT_CONFIDENCE',
          message: `Recommendation confidence "${rec.confidence}" is below required "${options.minimumConfidence}"`,
          reason: 'INSUFFICIENT_CONFIDENCE',
          errors,
          warnings,
        };
      }
    }

    // 4. BUY Recommendation Specific Checks
    if (rec.signal === 'BUY') {
      if (rec.entryPrice === null || typeof rec.entryPrice !== 'number' || !Number.isFinite(rec.entryPrice) || rec.entryPrice <= 0) {
        errors.push(`BUY recommendation missing or invalid entry price: ${rec.entryPrice}`);
        return {
          isValid: false,
          code: 'INVALID_PRICE',
          message: `BUY recommendation missing or invalid entry price: ${rec.entryPrice}`,
          reason: 'INVALID_ENTRY_PRICE',
          errors,
          warnings,
        };
      }

      if (rec.stopLoss === null || typeof rec.stopLoss !== 'number' || !Number.isFinite(rec.stopLoss) || rec.stopLoss <= 0) {
        errors.push(`BUY recommendation missing or invalid stop loss: ${rec.stopLoss}`);
        return {
          isValid: false,
          code: 'INVALID_STOP_LOSS',
          message: `BUY recommendation missing or invalid stop loss: ${rec.stopLoss}`,
          reason: 'INVALID_STOP_LOSS',
          errors,
          warnings,
        };
      }

      if (rec.targetPrice === null || typeof rec.targetPrice !== 'number' || !Number.isFinite(rec.targetPrice) || rec.targetPrice <= 0) {
        errors.push(`BUY recommendation missing or invalid target price: ${rec.targetPrice}`);
        return {
          isValid: false,
          code: 'INVALID_TARGET',
          message: `BUY recommendation missing or invalid target price: ${rec.targetPrice}`,
          reason: 'INVALID_TARGET_PRICE',
          errors,
          warnings,
        };
      }

      if (rec.stopLoss >= rec.entryPrice) {
        errors.push(`Stop loss (${rec.stopLoss}) must be lower than entry price (${rec.entryPrice})`);
        return {
          isValid: false,
          code: 'INVALID_STOP_LOSS',
          message: `Stop loss (${rec.stopLoss}) must be lower than entry price (${rec.entryPrice})`,
          reason: 'STOP_LOSS_GE_ENTRY',
          errors,
          warnings,
        };
      }

      if (rec.targetPrice <= rec.entryPrice) {
        errors.push(`Target price (${rec.targetPrice}) must be higher than entry price (${rec.entryPrice})`);
        return {
          isValid: false,
          code: 'INVALID_TARGET',
          message: `Target price (${rec.targetPrice}) must be higher than entry price (${rec.entryPrice})`,
          reason: 'TARGET_PRICE_LE_ENTRY',
          errors,
          warnings,
        };
      }

      const minRR = options.minimumRiskReward ?? 2.0;
      const computedRR = rec.riskReward ?? ((rec.targetPrice - rec.entryPrice) / (rec.entryPrice - rec.stopLoss));
      if (computedRR < minRR) {
        errors.push(`Risk:Reward ratio (${computedRR.toFixed(2)}) is below minimum required ${minRR.toFixed(1)}`);
        return {
          isValid: false,
          code: 'RR_TOO_LOW',
          message: `Risk:Reward ratio (${computedRR.toFixed(2)}) is below minimum required ${minRR.toFixed(1)}`,
          reason: 'RR_BELOW_MINIMUM',
          errors,
          warnings,
        };
      }
    }

    // 5. Cross-validation against market data if provided
    if (marketData) {
      const marketVal = this.validateMarketData(marketData, {
        now: options.now,
        maxStaleTimeMs: options.maxStaleTimeMs,
      });
      if (!marketVal.isValid) {
        return {
          isValid: false,
          code: marketVal.code,
          message: `Market data validation failed for ${symbol}: ${marketVal.message}`,
          reason: marketVal.reason,
          errors: [...errors, ...marketVal.errors],
          warnings: [...warnings, ...marketVal.warnings],
        };
      }

      if (marketData.symbol.toUpperCase() !== symbol) {
        errors.push(`Symbol mismatch between market data (${marketData.symbol}) and recommendation (${symbol})`);
        return {
          isValid: false,
          code: 'INVALID_SIGNAL',
          message: `Symbol mismatch: ${marketData.symbol} vs ${symbol}`,
          reason: 'SYMBOL_MISMATCH',
          errors,
          warnings,
        };
      }

      if (rec.signal === 'BUY' && rec.entryPrice !== null) {
        const maxDev = options.maxPriceDeviationPercent ?? 3.0;
        const devPct = Math.abs(marketData.price - rec.entryPrice) / marketData.price * 100;
        if (devPct > maxDev) {
          errors.push(`Recommendation entry price (${rec.entryPrice}) deviates by ${devPct.toFixed(2)}% from live price (${marketData.price}), exceeding tolerance of ${maxDev}%`);
          return {
            isValid: false,
            code: 'INVALID_PRICE',
            message: `Entry price deviates by ${devPct.toFixed(2)}% from live price`,
            reason: 'EXCESSIVE_PRICE_DEVIATION',
            errors,
            warnings,
            details: { livePrice: marketData.price, entryPrice: rec.entryPrice, deviationPercent: devPct },
          };
        }
      }
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Recommendation validated successfully',
      errors: [],
      warnings,
      validatedData: rec,
    };
  }

  /**
   * Validates risk parameters (account equity, cash, exposure, limits).
   */
  static validateRiskParameters(
    input: RiskParametersValidationInput
  ): StructuredValidationResult<RiskParametersValidationInput> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (input.accountEquity <= 0 || !Number.isFinite(input.accountEquity) || Number.isNaN(input.accountEquity)) {
      errors.push(`Account equity must be a positive finite number, got: ${input.accountEquity}`);
      return {
        isValid: false,
        code: 'INSUFFICIENT_CASH',
        message: `Account equity must be a positive finite number, got: ${input.accountEquity}`,
        reason: 'INVALID_EQUITY',
        errors,
        warnings,
      };
    }

    if (input.availableCash < 0 || !Number.isFinite(input.availableCash) || Number.isNaN(input.availableCash)) {
      errors.push(`Available cash must be a non-negative finite number, got: ${input.availableCash}`);
      return {
        isValid: false,
        code: 'INSUFFICIENT_CASH',
        message: `Available cash must be a non-negative finite number, got: ${input.availableCash}`,
        reason: 'INVALID_CASH',
        errors,
        warnings,
      };
    }

    if (input.currentExposure < 0 || !Number.isFinite(input.currentExposure) || Number.isNaN(input.currentExposure)) {
      errors.push(`Current exposure must be a non-negative finite number, got: ${input.currentExposure}`);
      return {
        isValid: false,
        code: 'EXPOSURE_LIMIT_EXCEEDED',
        message: `Current exposure must be a non-negative finite number, got: ${input.currentExposure}`,
        reason: 'INVALID_EXPOSURE',
        errors,
        warnings,
      };
    }

    if (input.quantity !== undefined) {
      const lot = input.lotSize ?? 100;
      if (input.quantity <= 0 || !Number.isInteger(input.quantity) || input.quantity % lot !== 0) {
        errors.push(`Order quantity (${input.quantity}) must be a positive integer multiple of ${lot}`);
        return {
          isValid: false,
          code: 'INVALID_LOT_SIZE',
          message: `Order quantity (${input.quantity}) must be a positive integer multiple of ${lot}`,
          reason: 'INVALID_QUANTITY_LOT',
          errors,
          warnings,
        };
      }
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Risk parameters are valid',
      errors: [],
      warnings,
      validatedData: input,
    };
  }

  /**
   * Validates if the market session permits opening new orders.
   */
  static validateMarketSession(isMarketOpen: boolean | undefined): StructuredValidationResult<boolean> {
    if (isMarketOpen === false) {
      return {
        isValid: false,
        code: 'MARKET_CLOSED',
        message: 'Vietnamese stock market is currently closed',
        reason: 'MARKET_SESSION_CLOSED',
        errors: ['Market session is closed'],
        warnings: [],
      };
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Market is open',
      errors: [],
      warnings: [],
      validatedData: true,
    };
  }

  /**
   * Computes Vietnamese market session state for a given date/time according to standard HOSE/HNX hours (UTC+7).
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
  ): StructuredValidationResult<{ marketData: TradingMarketData; signal: TradingSignal }> {
    // 1. Validate Market Data
    const marketValidation = this.validateMarketData(marketData, {
      maxStaleTimeMs: options.maxStaleTimeMs,
    });
    if (!marketValidation.isValid) {
      return {
        isValid: false,
        code: marketValidation.code,
        message: marketValidation.message,
        reason: marketValidation.reason,
        errors: marketValidation.errors,
        warnings: marketValidation.warnings,
      };
    }

    // 2. Validate Market Session
    const sessionValidation = this.validateMarketSession(options.isMarketOpen);
    if (!sessionValidation.isValid) {
      return {
        isValid: false,
        code: sessionValidation.code,
        message: sessionValidation.message,
        reason: sessionValidation.reason,
        errors: sessionValidation.errors,
        warnings: sessionValidation.warnings,
      };
    }

    // 3. Validate Signal
    const signalValidation = this.validateSignal(signal, {
      minimumRiskReward: options.minimumRiskReward,
    });
    if (!signalValidation.isValid) {
      return {
        isValid: false,
        code: signalValidation.code,
        message: signalValidation.message,
        reason: signalValidation.reason,
        errors: signalValidation.errors,
        warnings: signalValidation.warnings,
      };
    }

    // 4. Symbol match
    if (marketData.symbol.toUpperCase() !== signal.symbol.toUpperCase()) {
      return {
        isValid: false,
        code: 'INVALID_SIGNAL',
        message: `Symbol mismatch between market data (${marketData.symbol}) and signal (${signal.symbol})`,
        reason: 'SYMBOL_MISMATCH',
        errors: [`Symbol mismatch: ${marketData.symbol} vs ${signal.symbol}`],
        warnings: [],
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
        errors: [`Price deviation ${deviationPercent.toFixed(2)}% exceeds limit of ${maxDeviation}%`],
        warnings: [],
        details: { livePrice: marketData.price, entryPrice: signal.entryPrice, deviationPercent },
      };
    }

    return {
      isValid: true,
      code: 'OK',
      message: 'Candidate validated successfully',
      errors: [],
      warnings: [],
      validatedData: { marketData, signal },
    };
  }
}
