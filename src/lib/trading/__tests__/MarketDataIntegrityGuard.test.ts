/**
 * PHASE 18.2 — MARKET DATA INTEGRITY GUARD TEST SUITE
 * ====================================================
 * Comprehensive safety and data integrity tests covering all invalid, corrupted,
 * stale, future, and out-of-band market data scenarios.
 */

import { describe, it, expect } from 'vitest';
import { MarketDataIntegrityGuard } from '../integrity/MarketDataIntegrityGuard.ts';
import type { TradingMarketData } from '../types/trading.ts';

describe('MarketDataIntegrityGuard', () => {
  const baseNow = 1710000000000; // Fixed baseline time for deterministic tests

  const validQuote: TradingMarketData = {
    symbol: 'HPG',
    price: 30000,
    open: 29800,
    high: 30500,
    low: 29500,
    close: 30000,
    volume: 1500000,
    referencePrice: 29800,
    ceilingPrice: 31800,
    floorPrice: 27800,
    timestamp: baseNow - 10_000, // 10 seconds ago
    dataSource: 'VPS_LIVE',
  };

  // 1. Valid Market Data
  it('1. accepts fully valid market data', () => {
    const result = MarketDataIntegrityGuard.validate(validQuote, { now: baseNow });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('VALID');
    expect(result.code).toBe('OK');
    expect(result.errors).toHaveLength(0);
    expect(result.checks.price).toBe(true);
    expect(result.checks.ohlc).toBe(true);
    expect(result.checks.volume).toBe(true);
    expect(result.checks.timestamp).toBe(true);
  });

  // 2. Missing Price / Null Payload
  it('2. rejects null or missing payload', () => {
    const result = MarketDataIntegrityGuard.validate(null, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('INVALID');
    expect(result.code).toBe('DATA_UNAVAILABLE');
    expect(result.reasons).toContain('DATA_IS_NULL');
  });

  // 3. NaN Price
  it('3. rejects NaN price', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, price: NaN }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.price).toBe(false);
    expect(result.reasons).toContain('INVALID_PRICE');
  });

  // 4. Infinity Price
  it('4. rejects Infinity and -Infinity price', () => {
    const res1 = MarketDataIntegrityGuard.validate({ ...validQuote, price: Infinity }, { now: baseNow });
    expect(res1.valid).toBe(false);
    expect(res1.checks.price).toBe(false);

    const res2 = MarketDataIntegrityGuard.validate({ ...validQuote, price: -Infinity }, { now: baseNow });
    expect(res2.valid).toBe(false);
    expect(res2.checks.price).toBe(false);
  });

  // 5. Negative Price
  it('5. rejects negative price', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, price: -30000 }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.price).toBe(false);
    expect(result.reasons).toContain('INVALID_PRICE');
  });

  // 6. Zero Price
  it('6. rejects zero price', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, price: 0 }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.price).toBe(false);
    expect(result.reasons).toContain('INVALID_PRICE');
  });

  // 7. Invalid OHLC
  it('7. rejects invalid OHLC where Low > High or Open outside range', () => {
    // Low > High
    const res1 = MarketDataIntegrityGuard.validate({
      ...validQuote,
      high: 29000,
      low: 31000,
    }, { now: baseNow });
    expect(res1.valid).toBe(false);
    expect(res1.checks.ohlc).toBe(false);
    expect(res1.reasons).toContain('INVALID_OHLC');

    // Open > High
    const res2 = MarketDataIntegrityGuard.validate({
      ...validQuote,
      open: 32000,
      high: 31000,
      low: 29000,
    }, { now: baseNow });
    expect(res2.valid).toBe(false);
    expect(res2.checks.ohlc).toBe(false);

    // Close < Low
    const res3 = MarketDataIntegrityGuard.validate({
      ...validQuote,
      close: 28000,
      high: 31000,
      low: 29000,
    }, { now: baseNow });
    expect(res3.valid).toBe(false);
    expect(res3.checks.ohlc).toBe(false);
  });

  // 8. Negative Volume
  it('8. rejects negative volume', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, volume: -500 }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.volume).toBe(false);
    expect(result.reasons).toContain('INVALID_VOLUME');
  });

  // 9. NaN Volume
  it('9. rejects NaN volume', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, volume: NaN }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.volume).toBe(false);
    expect(result.reasons).toContain('INVALID_VOLUME');
  });

  // 10. Future Timestamp
  it('10. rejects future timestamps exceeding allowable skew', () => {
    const futureTime = baseNow + 60_000; // 1 minute into future
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, timestamp: futureTime }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.timestamp).toBe(false);
    expect(result.reasons).toContain('FUTURE_TIMESTAMP');
  });

  // 11. Stale Timestamp
  it('11. rejects stale market data exceeding maxStaleTimeMs', () => {
    const staleTime = baseNow - 200_000; // 200s old (limit is 120s)
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, timestamp: staleTime }, { now: baseNow, maxStaleTimeMs: 120_000 });
    expect(result.valid).toBe(false);
    expect(result.checks.timestamp).toBe(false);
    expect(result.reasons).toContain('STALE_DATA');
    expect(result.code).toBe('STALE_DATA');
  });

  // 12. Duplicate Candle Check
  it('12. detects duplicate sequential candles', () => {
    const candle1: TradingMarketData = { ...validQuote, timestamp: baseNow - 5000 };
    const candle2: TradingMarketData = { ...validQuote, timestamp: baseNow - 5000 };

    const dupCheck = MarketDataIntegrityGuard.checkDuplicateCandle(candle2, candle1);
    expect(dupCheck.isDuplicate).toBe(true);

    const candle3: TradingMarketData = { ...validQuote, timestamp: baseNow - 4000 };
    const nonDup = MarketDataIntegrityGuard.checkDuplicateCandle(candle3, candle1);
    expect(nonDup.isDuplicate).toBe(false);
  });

  // 13. Invalid Symbol
  it('13. rejects invalid or empty symbols', () => {
    const resEmpty = MarketDataIntegrityGuard.validate({ ...validQuote, symbol: '' }, { now: baseNow });
    expect(resEmpty.valid).toBe(false);
    expect(resEmpty.checks.symbol).toBe(false);

    const resSpecial = MarketDataIntegrityGuard.validate({ ...validQuote, symbol: 'HPG$$$#@' }, { now: baseNow });
    expect(resSpecial.valid).toBe(false);
    expect(resSpecial.checks.symbol).toBe(false);
  });

  // 14. Invalid Reference Price
  it('14. rejects invalid reference price (NaN or <= 0)', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, referencePrice: -100 }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.referencePrice).toBe(false);
    expect(result.reasons).toContain('INVALID_REFERENCE_PRICE');
  });

  // 15. Invalid Ceiling
  it('15. rejects invalid ceiling price', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, ceilingPrice: -500 }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.ceilingFloor).toBe(false);
  });

  // 16. Invalid Floor
  it('16. rejects invalid floor price or floor > ceiling', () => {
    const result = MarketDataIntegrityGuard.validate({
      ...validQuote,
      ceilingPrice: 28000,
      floorPrice: 32000,
    }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.ceilingFloor).toBe(false);
    expect(result.reasons).toContain('INVALID_CEILING_FLOOR');
  });

  // 17. Price Outside Ceiling
  it('17. rejects current price exceeding exchange ceiling', () => {
    const result = MarketDataIntegrityGuard.validate({
      ...validQuote,
      price: 33000,
      ceilingPrice: 31800,
      floorPrice: 27800,
    }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.ceilingFloor).toBe(false);
    expect(result.reasons).toContain('PRICE_LIMIT_VIOLATION');
  });

  // 18. Price Outside Floor
  it('18. rejects current price breaching exchange floor', () => {
    const result = MarketDataIntegrityGuard.validate({
      ...validQuote,
      price: 25000,
      ceilingPrice: 31800,
      floorPrice: 27800,
    }, { now: baseNow });
    expect(result.valid).toBe(false);
    expect(result.checks.ceilingFloor).toBe(false);
    expect(result.reasons).toContain('PRICE_LIMIT_VIOLATION');
  });

  // 19. Excessive Live-Price Deviation
  it('19. rejects excessive price deviation from trusted live price', () => {
    const result = MarketDataIntegrityGuard.validate(validQuote, {
      now: baseNow,
      trustedLivePrice: 32000, // 30,000 vs 32,000 is 6.25% deviation (limit: 3.0%)
      maxPriceDeviationPercent: 3.0,
    });
    expect(result.valid).toBe(false);
    expect(result.checks.deviation).toBe(false);
    expect(result.reasons).toContain('EXCESSIVE_PRICE_DEVIATION');
  });

  // 20. Missing Source Metadata
  it('20. rejects missing source metadata when strictly required', () => {
    const result = MarketDataIntegrityGuard.validate({ ...validQuote, dataSource: undefined }, {
      now: baseNow,
      requireSourceMetadata: true,
    });
    expect(result.valid).toBe(false);
    expect(result.checks.sourceMetadata).toBe(false);
    expect(result.reasons).toContain('MISSING_SOURCE_METADATA');
  });
});
