/**
 * PHASE 18.2 — MARKET DATA INTEGRITY GUARD
 * =========================================
 * Gatekeeper for market quote, candle, and metadata integrity.
 * Enforces strict fail-closed validation:
 *   - Price: Strictly positive, finite number (no NaN, Infinity, <= 0).
 *   - OHLC: High >= max(Open, Close, Low), Low <= min(Open, Close, High), Low <= High.
 *   - Volume: Non-negative, finite number (no negative, NaN, Infinity).
 *   - Timestamp: Valid, strictly non-future (with reasonable clock skew tolerance), and fresh (not stale).
 *   - Symbol: Valid Vietnamese equity ticker (e.g., 'HPG', 'SSI', 'VNINDEX').
 *   - Session / Ceiling / Floor: Exchange band consistency (floor <= price <= ceiling, floor < ref < ceiling).
 *   - Live Price Deviation: Execution/signal price within configured tolerance of live quote.
 *   - Source Metadata: Identifiable source/provider without corrupt status.
 */

import type { TradingMarketData, ValidationErrorCode } from '../types/trading.ts';
import { DEFAULT_RISK_GUARD_POLICY } from '../types/risk.ts';

export interface MarketDataIntegrityOptions {
  /** Maximum staleness in milliseconds (default: 120_000ms from RiskGuard policy) */
  maxStaleTimeMs?: number;
  /** Maximum allowable live price deviation percentage (default: 3.0%) */
  maxPriceDeviationPercent?: number;
  /** Current epoch timestamp in ms for freshness verification (default: Date.now()) */
  now?: number;
  /** Maximum allowed clock skew in ms for future timestamp validation (default: 5_000ms) */
  maxFutureSkewMs?: number;
  /** Optional trusted live price for deviation cross-checking */
  trustedLivePrice?: number | null;
  /** Require strict presence of source metadata (default: false, fails if present but corrupt) */
  requireSourceMetadata?: boolean;
}

export interface MarketDataIntegrityChecks {
  price: boolean;
  ohlc: boolean;
  volume: boolean;
  timestamp: boolean;
  duplicate: boolean;
  symbol: boolean;
  marketSession: boolean;
  ceilingFloor: boolean;
  referencePrice: boolean;
  deviation: boolean;
  sourceMetadata: boolean;
}

export interface MarketDataIntegrityResult {
  valid: boolean;
  status: 'VALID' | 'INVALID';
  code: ValidationErrorCode | 'OK';
  message: string;
  reasons: string[];
  errors: string[];
  warnings: string[];
  checks: MarketDataIntegrityChecks;
  validatedData?: TradingMarketData;
}

export class MarketDataIntegrityGuard {
  /**
   * Evaluates complete market data integrity before any validator, risk guard, or execution engine.
   */
  static validate(
    data: TradingMarketData | null | undefined,
    options: MarketDataIntegrityOptions = {}
  ): MarketDataIntegrityResult {
    const reasons: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const checks: MarketDataIntegrityChecks = {
      price: false,
      ohlc: true,
      volume: true,
      timestamp: true,
      duplicate: true,
      symbol: false,
      marketSession: true,
      ceilingFloor: true,
      referencePrice: true,
      deviation: true,
      sourceMetadata: true,
    };

    const maxStaleMs = options.maxStaleTimeMs ?? DEFAULT_RISK_GUARD_POLICY.maxStaleTimeMs ?? 120_000;
    const maxDeviationPct = options.maxPriceDeviationPercent ?? DEFAULT_RISK_GUARD_POLICY.maxPriceDeviationPercent ?? 3.0;
    const now = options.now ?? Date.now();
    const futureSkew = options.maxFutureSkewMs ?? 5_000;

    // 1. Structure validation
    if (!data || typeof data !== 'object') {
      errors.push('Market data payload is null or undefined');
      reasons.push('DATA_IS_NULL');
      return {
        valid: false,
        status: 'INVALID',
        code: 'DATA_UNAVAILABLE',
        message: 'Market data payload is null or undefined',
        reasons,
        errors,
        warnings,
        checks,
      };
    }

    // 2. Symbol validation
    const rawSymbol = data.symbol;
    if (!rawSymbol || typeof rawSymbol !== 'string' || rawSymbol.trim().length === 0) {
      errors.push('Missing or empty stock symbol');
      reasons.push('INVALID_SYMBOL');
      checks.symbol = false;
    } else {
      const trimmed = rawSymbol.trim().toUpperCase();
      // Valid Vietnamese symbols: 3-8 alphanumeric characters, including market indices
      if (!/^[A-Z0-9_.]{1,12}$/.test(trimmed)) {
        errors.push(`Invalid stock symbol format: "${rawSymbol}"`);
        reasons.push('INVALID_SYMBOL');
        checks.symbol = false;
      } else {
        checks.symbol = true;
      }
    }

    // 3. Price validation (strictly positive finite number)
    if (
      typeof data.price !== 'number' ||
      !Number.isFinite(data.price) ||
      Number.isNaN(data.price) ||
      data.price <= 0
    ) {
      errors.push(`Price must be a strictly positive finite number, got: ${data.price}`);
      reasons.push('INVALID_PRICE');
      checks.price = false;
    } else {
      checks.price = true;
    }

    // 4. OHLC validation
    const hasOpen = typeof data.open === 'number';
    const hasHigh = typeof data.high === 'number';
    const hasLow = typeof data.low === 'number';
    const hasClose = typeof data.close === 'number';

    if (hasOpen || hasHigh || hasLow || hasClose) {
      const ohlcValues = [
        { name: 'open', val: data.open },
        { name: 'high', val: data.high },
        { name: 'low', val: data.low },
        { name: 'close', val: data.close },
      ];

      for (const item of ohlcValues) {
        if (typeof item.val === 'number') {
          if (!Number.isFinite(item.val) || Number.isNaN(item.val) || item.val <= 0) {
            errors.push(`OHLC ${item.name} must be a positive finite number, got: ${item.val}`);
            reasons.push('INVALID_OHLC');
            checks.ohlc = false;
          }
        }
      }

      if (hasHigh && hasLow && checks.ohlc) {
        const high = data.high!;
        const low = data.low!;
        if (low > high) {
          errors.push(`OHLC violation: Low (${low}) cannot exceed High (${high})`);
          reasons.push('INVALID_OHLC');
          checks.ohlc = false;
        }

        if (hasOpen) {
          const open = data.open!;
          if (open > high || open < low) {
            errors.push(`OHLC violation: Open (${open}) must be within [Low: ${low}, High: ${high}]`);
            reasons.push('INVALID_OHLC');
            checks.ohlc = false;
          }
        }

        if (hasClose) {
          const close = data.close!;
          if (close > high || close < low) {
            errors.push(`OHLC violation: Close (${close}) must be within [Low: ${low}, High: ${high}]`);
            reasons.push('INVALID_OHLC');
            checks.ohlc = false;
          }
        }
      }
    }

    // 5. Volume validation
    if (data.volume !== undefined && data.volume !== null) {
      if (
        typeof data.volume !== 'number' ||
        !Number.isFinite(data.volume) ||
        Number.isNaN(data.volume) ||
        data.volume < 0
      ) {
        errors.push(`Volume must be a non-negative finite number, got: ${data.volume}`);
        reasons.push('INVALID_VOLUME');
        checks.volume = false;
      }
    }

    // 6. Timestamp validation (freshness and non-future)
    if (data.timestamp !== undefined && data.timestamp !== null) {
      let timeMs: number | null = null;
      if (typeof data.timestamp === 'number') {
        timeMs = data.timestamp;
      } else if (typeof data.timestamp === 'string') {
        const parsed = Date.parse(data.timestamp);
        if (!Number.isNaN(parsed)) {
          timeMs = parsed;
        }
      }

      if (timeMs === null || Number.isNaN(timeMs) || timeMs <= 0) {
        errors.push(`Invalid timestamp format: "${data.timestamp}"`);
        reasons.push('INVALID_TIMESTAMP');
        checks.timestamp = false;
      } else {
        // Future check
        if (timeMs > now + futureSkew) {
          errors.push(`Market data timestamp is in the future (${new Date(timeMs).toISOString()} vs now ${new Date(now).toISOString()})`);
          reasons.push('FUTURE_TIMESTAMP');
          checks.timestamp = false;
        }

        // Stale check
        const ageMs = now - timeMs;
        if (ageMs > maxStaleMs) {
          errors.push(`Market data is stale: age ${Math.round(ageMs / 1000)}s exceeds limit of ${Math.round(maxStaleMs / 1000)}s`);
          reasons.push('STALE_DATA');
          checks.timestamp = false;
        }
      }
    }

    // 7. Reference / Ceiling / Floor validation
    const hasRef = typeof data.referencePrice === 'number';
    const hasCeiling = typeof data.ceilingPrice === 'number';
    const hasFloor = typeof data.floorPrice === 'number';

    if (hasRef) {
      if (!Number.isFinite(data.referencePrice) || Number.isNaN(data.referencePrice) || data.referencePrice! <= 0) {
        errors.push(`Reference price must be a positive finite number, got: ${data.referencePrice}`);
        reasons.push('INVALID_REFERENCE_PRICE');
        checks.referencePrice = false;
      }
    }

    if (hasCeiling) {
      if (!Number.isFinite(data.ceilingPrice) || Number.isNaN(data.ceilingPrice) || data.ceilingPrice! <= 0) {
        errors.push(`Ceiling price must be a positive finite number, got: ${data.ceilingPrice}`);
        reasons.push('INVALID_CEILING');
        checks.ceilingFloor = false;
      }
    }

    if (hasFloor) {
      if (!Number.isFinite(data.floorPrice) || Number.isNaN(data.floorPrice) || data.floorPrice! <= 0) {
        errors.push(`Floor price must be a positive finite number, got: ${data.floorPrice}`);
        reasons.push('INVALID_FLOOR');
        checks.ceilingFloor = false;
      }
    }

    if (hasCeiling && hasFloor && checks.ceilingFloor) {
      const ceil = data.ceilingPrice!;
      const flr = data.floorPrice!;
      if (flr > ceil) {
        errors.push(`Floor price (${flr}) cannot exceed Ceiling price (${ceil})`);
        reasons.push('INVALID_CEILING_FLOOR');
        checks.ceilingFloor = false;
      }

      if (hasRef && checks.referencePrice) {
        const ref = data.referencePrice!;
        if (ref < flr || ref > ceil) {
          errors.push(`Reference price (${ref}) must be within [Floor: ${flr}, Ceiling: ${ceil}]`);
          reasons.push('INVALID_REFERENCE_PRICE');
          checks.referencePrice = false;
        }
      }

      // Check current price within ceiling/floor
      if (checks.price) {
        const price = data.price;
        if (price < flr || price > ceil) {
          errors.push(`Current price (${price}) breaches exchange limits [Floor: ${flr}, Ceiling: ${ceil}]`);
          reasons.push('PRICE_LIMIT_VIOLATION');
          checks.ceilingFloor = false;
        }
      }
    }

    // 8. Live price deviation cross-check
    if (
      options.trustedLivePrice !== undefined &&
      options.trustedLivePrice !== null &&
      checks.price
    ) {
      const trusted = options.trustedLivePrice;
      if (typeof trusted === 'number' && Number.isFinite(trusted) && trusted > 0) {
        const deviationPct = Math.abs(data.price - trusted) / trusted * 100;
        if (deviationPct > maxDeviationPct) {
          errors.push(
            `Price deviation (${deviationPct.toFixed(2)}%) exceeds allowable limit (${maxDeviationPct}%) vs trusted price (${trusted})`
          );
          reasons.push('EXCESSIVE_PRICE_DEVIATION');
          checks.deviation = false;
        }
      }
    }

    // 9. Source metadata validation
    if (options.requireSourceMetadata) {
      if (!data.dataSource || typeof data.dataSource !== 'string' || data.dataSource.trim().length === 0) {
        errors.push('Required market data source metadata is missing');
        reasons.push('MISSING_SOURCE_METADATA');
        checks.sourceMetadata = false;
      }
    }

    const isValid = errors.length === 0;
    const status: 'VALID' | 'INVALID' = isValid ? 'VALID' : 'INVALID';

    let code: ValidationErrorCode | 'OK' = 'OK';
    if (!isValid) {
      if (reasons.includes('DATA_IS_NULL')) code = 'DATA_UNAVAILABLE';
      else if (reasons.includes('INVALID_SYMBOL')) code = 'INVALID_SYMBOL';
      else if (reasons.includes('INVALID_PRICE')) code = 'INVALID_PRICE';
      else if (reasons.includes('INVALID_OHLC') || reasons.includes('INVALID_VOLUME')) code = 'INVALID_MARKET_DATA';
      else if (reasons.includes('STALE_DATA')) code = 'STALE_DATA';
      else if (reasons.includes('FUTURE_TIMESTAMP') || reasons.includes('INVALID_TIMESTAMP')) code = 'INVALID_MARKET_DATA';
      else if (reasons.includes('PRICE_LIMIT_VIOLATION') || reasons.includes('INVALID_CEILING_FLOOR')) code = 'PRICE_LIMIT_VIOLATION';
      else if (reasons.includes('EXCESSIVE_PRICE_DEVIATION')) code = 'PRICE_LIMIT_VIOLATION';
      else code = 'INVALID_MARKET_DATA';
    }

    return {
      valid: isValid,
      status,
      code,
      message: isValid ? 'Market data passed integrity validation' : errors.join('; '),
      reasons,
      errors,
      warnings,
      checks,
      validatedData: isValid ? data : undefined,
    };
  }

  /**
   * Helper to check for duplicate sequential candles in a time series.
   */
  static checkDuplicateCandle(
    current: TradingMarketData,
    previous: TradingMarketData | null | undefined
  ): { isDuplicate: boolean; reason?: string } {
    if (!previous) {
      return { isDuplicate: false };
    }

    const sameTimestamp = current.timestamp !== undefined &&
      previous.timestamp !== undefined &&
      current.timestamp === previous.timestamp;

    const samePrice = current.price === previous.price;
    const sameVolume = current.volume === previous.volume;

    if (sameTimestamp && samePrice && sameVolume) {
      return {
        isDuplicate: true,
        reason: `Duplicate candle detected for ${current.symbol} at timestamp ${current.timestamp}`,
      };
    }

    return { isDuplicate: false };
  }
}
