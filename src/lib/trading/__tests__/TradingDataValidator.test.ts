import { describe, it, expect } from 'vitest';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';
import type { TradingMarketData, TradingSignal } from '../types/trading.ts';

describe('Phase 18.1 — TradingDataValidator', () => {
  const validMarketData: TradingMarketData = {
    symbol: 'HPG',
    price: 28500,
    open: 28200,
    high: 28900,
    low: 28100,
    close: 28500,
    volume: 15_000_000,
    ceilingPrice: 30000,
    floorPrice: 26000,
    timestamp: Date.now() - 5000,
    dataSource: 'KBS',
  };

  const validSignal: TradingSignal = {
    symbol: 'HPG',
    signal: 'BUY',
    entryPrice: 28500,
    stopLoss: 27000,   // Risk = 1,500
    targetPrice: 31500, // Reward = 3,000 => R:R = 2.0
    riskReward: 2.0,
    confidence: 'HIGH',
    score: 82,
  };

  describe('Market Data Validation', () => {
    it('passes for fully valid market data', () => {
      const res = TradingDataValidator.validateMarketData(validMarketData);
      expect(res.isValid).toBe(true);
      expect(res.code).toBe('OK');
    });

    it('rejects null or non-object market data', () => {
      const res = TradingDataValidator.validateMarketData(null as any);
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('DATA_UNAVAILABLE');
    });

    it('rejects invalid or empty symbols', () => {
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, symbol: '' }).isValid).toBe(false);
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, symbol: '   ' }).isValid).toBe(false);
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, symbol: 'HPG@#$' }).isValid).toBe(false);
    });

    it('rejects zero or negative prices', () => {
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, price: 0 }).code).toBe('INVALID_PRICE');
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, price: -500 }).code).toBe('INVALID_PRICE');
    });

    it('rejects NaN or Infinite prices', () => {
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, price: NaN }).code).toBe('INVALID_PRICE');
      expect(TradingDataValidator.validateMarketData({ ...validMarketData, price: Infinity }).code).toBe('INVALID_PRICE');
    });

    it('rejects stale data exceeding max allowable age', () => {
      const staleTime = Date.now() - 300_000; // 5 mins ago
      const res = TradingDataValidator.validateMarketData(
        { ...validMarketData, timestamp: staleTime },
        { maxStaleTimeMs: 120_000 }
      );
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('STALE_DATA');
    });

    it('rejects data with timestamp far in the future', () => {
      const futureTime = Date.now() + 120_000; // 2 mins in the future
      const res = TradingDataValidator.validateMarketData({ ...validMarketData, timestamp: futureTime });
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('STALE_DATA');
    });

    it('rejects invalid OHLC when high < low', () => {
      const res = TradingDataValidator.validateMarketData({
        ...validMarketData,
        high: 25000,
        low: 26000,
      });
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('INVALID_PRICE');
    });

    it('rejects invalid OHLC when close is outside high-low range', () => {
      const resHigh = TradingDataValidator.validateMarketData({ ...validMarketData, close: 30000 });
      expect(resHigh.isValid).toBe(false);
      expect(resHigh.code).toBe('INVALID_PRICE');

      const resLow = TradingDataValidator.validateMarketData({ ...validMarketData, close: 27000 });
      expect(resLow.isValid).toBe(false);
      expect(resLow.code).toBe('INVALID_PRICE');
    });

    it('rejects negative volume', () => {
      const res = TradingDataValidator.validateMarketData({ ...validMarketData, volume: -100 });
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('INVALID_PRICE');
    });

    it('enforces ceiling price limit: price = ceiling passes, price > ceiling fails', () => {
      const passAtCeiling = TradingDataValidator.validateMarketData({
        ...validMarketData,
        price: 30000,
        high: 30000,
        close: 30000,
        ceilingPrice: 30000,
      });
      expect(passAtCeiling.isValid).toBe(true);

      const failAboveCeiling = TradingDataValidator.validateMarketData({
        ...validMarketData,
        price: 30050,
        ceilingPrice: 30000,
      });
      expect(failAboveCeiling.isValid).toBe(false);
      expect(failAboveCeiling.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('enforces floor price limit: price = floor passes, price < floor fails', () => {
      const passAtFloor = TradingDataValidator.validateMarketData({
        ...validMarketData,
        price: 26000,
        low: 26000,
        close: 26000,
        floorPrice: 26000,
      });
      expect(passAtFloor.isValid).toBe(true);

      const failBelowFloor = TradingDataValidator.validateMarketData({
        ...validMarketData,
        price: 25900,
        floorPrice: 26000,
      });
      expect(failBelowFloor.isValid).toBe(false);
      expect(failBelowFloor.code).toBe('PRICE_LIMIT_VIOLATION');
    });
  });

  describe('Signal Validation', () => {
    it('passes for valid BUY signal with R:R = 2.0', () => {
      const res = TradingDataValidator.validateSignal(validSignal);
      expect(res.isValid).toBe(true);
      expect(res.code).toBe('OK');
    });

    it('passes for non-BUY signals without requiring entry/target', () => {
      const holdRes = TradingDataValidator.validateSignal({
        symbol: 'HPG',
        signal: 'HOLD',
        entryPrice: 0,
        stopLoss: 0,
        targetPrice: 0,
      });
      expect(holdRes.isValid).toBe(true);
    });

    it('rejects unrecognized signal actions', () => {
      const res = TradingDataValidator.validateSignal({ ...validSignal, signal: 'INVALID' as any });
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('INVALID_SIGNAL');
    });

    it('rejects non-positive entry, stop loss, or target prices on BUY', () => {
      expect(TradingDataValidator.validateSignal({ ...validSignal, entryPrice: 0 }).code).toBe('INVALID_PRICE');
      expect(TradingDataValidator.validateSignal({ ...validSignal, stopLoss: -100 }).code).toBe('INVALID_PRICE');
      expect(TradingDataValidator.validateSignal({ ...validSignal, targetPrice: NaN }).code).toBe('INVALID_PRICE');
    });

    it('rejects if stop loss >= entry price (Entry = Stop or Stop > Entry)', () => {
      const equalRes = TradingDataValidator.validateSignal({
        ...validSignal,
        entryPrice: 28000,
        stopLoss: 28000,
      });
      expect(equalRes.isValid).toBe(false);
      expect(equalRes.code).toBe('INVALID_RISK_REWARD');

      const stopHigherRes = TradingDataValidator.validateSignal({
        ...validSignal,
        entryPrice: 28000,
        stopLoss: 29000,
      });
      expect(stopHigherRes.isValid).toBe(false);
      expect(stopHigherRes.code).toBe('INVALID_RISK_REWARD');
    });

    it('rejects if target price <= entry price', () => {
      const equalRes = TradingDataValidator.validateSignal({
        ...validSignal,
        entryPrice: 28000,
        targetPrice: 28000,
      });
      expect(equalRes.isValid).toBe(false);
      expect(equalRes.code).toBe('INVALID_RISK_REWARD');

      const targetLowerRes = TradingDataValidator.validateSignal({
        ...validSignal,
        entryPrice: 28000,
        targetPrice: 27500,
      });
      expect(targetLowerRes.isValid).toBe(false);
      expect(targetLowerRes.code).toBe('INVALID_RISK_REWARD');
    });

    it('rejects R:R < 2.0 (e.g. 1.99)', () => {
      // Entry = 100, Stop = 95 (Risk = 5), Target = 109.95 (Reward = 9.95) => R:R = 1.99
      const res = TradingDataValidator.validateSignal({
        ...validSignal,
        entryPrice: 100,
        stopLoss: 95,
        targetPrice: 109.95,
      });
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('INVALID_RISK_REWARD');
    });

    it('accepts exact R:R = 2.0', () => {
      // Entry = 100, Stop = 95 (Risk = 5), Target = 110 (Reward = 10) => R:R = 2.0
      const res = TradingDataValidator.validateSignal({
        ...validSignal,
        entryPrice: 100,
        stopLoss: 95,
        targetPrice: 110,
      });
      expect(res.isValid).toBe(true);
      expect(res.code).toBe('OK');
    });
  });

  describe('Market Session & Candidate Validation', () => {
    it('rejects trade candidate when market is closed', () => {
      const res = TradingDataValidator.validateMarketSession(false);
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('MARKET_CLOSED');
    });

    it('accepts candidate trade when market is open', () => {
      const res = TradingDataValidator.validateMarketSession(true);
      expect(res.isValid).toBe(true);
      expect(res.code).toBe('OK');
    });

    it('validates candidate end-to-end', () => {
      const candidateRes = TradingDataValidator.validateCandidate(
        validMarketData,
        validSignal,
        { isMarketOpen: true }
      );
      expect(candidateRes.isValid).toBe(true);
      expect(candidateRes.code).toBe('OK');
    });

    it('rejects candidate if symbols mismatch', () => {
      const candidateRes = TradingDataValidator.validateCandidate(
        validMarketData,
        { ...validSignal, symbol: 'SSI' },
        { isMarketOpen: true }
      );
      expect(candidateRes.isValid).toBe(false);
      expect(candidateRes.code).toBe('INVALID_SIGNAL');
    });

    it('rejects candidate if entry price deviates excessively from live market price', () => {
      const candidateRes = TradingDataValidator.validateCandidate(
        validMarketData, // price = 28500
        { ...validSignal, entryPrice: 32000, stopLoss: 29000, targetPrice: 38000 }, // > 12% deviation
        { isMarketOpen: true, maxPriceDeviationPercent: 3.0 }
      );
      expect(candidateRes.isValid).toBe(false);
      expect(candidateRes.code).toBe('INVALID_PRICE');
    });
  });

  describe('Recommendation Validation', () => {
    it('validates structured investment recommendation', () => {
      const rec = {
        symbol: 'HPG',
        strategy: 'SHORT_TERM' as const,
        signal: 'BUY' as const,
        score: 85,
        confidence: 'HIGH' as const,
        entryPrice: 28500,
        stopLoss: 27000,
        targetPrice: 31500,
        riskReward: 2.0,
        expectedReturn: 10.5,
        holdingPeriod: 15,
        reasons: ['Uptrend confirmed'],
        warnings: [],
        scoreBreakdown: { technical: 85, fundamental: 80, momentum: 90, moneyFlow: 80, valuation: 75, risk: 20 },
        evidence: [],
        generatedAt: new Date().toISOString(),
        asOfDate: '2026-03-10',
        currency: 'VND' as const,
      };

      const res = TradingDataValidator.validateRecommendation(rec, validMarketData);
      expect(res.isValid).toBe(true);
      expect(res.code).toBe('OK');
      expect(res.errors).toHaveLength(0);
    });

    it('rejects recommendation with missing prices or stopLoss >= entry', () => {
      const badRec = {
        symbol: 'HPG',
        strategy: 'SHORT_TERM' as const,
        signal: 'BUY' as const,
        score: 85,
        confidence: 'HIGH' as const,
        entryPrice: 28500,
        stopLoss: 28500,
        targetPrice: 31500,
        riskReward: 2.0,
        expectedReturn: 10.5,
        holdingPeriod: 15,
        reasons: [],
        warnings: [],
        scoreBreakdown: { technical: null, fundamental: null, momentum: null, moneyFlow: null, valuation: null, risk: null },
        evidence: [],
        generatedAt: new Date().toISOString(),
        asOfDate: null,
        currency: 'VND' as const,
      };

      const res = TradingDataValidator.validateRecommendation(badRec);
      expect(res.isValid).toBe(false);
      expect(res.code).toBe('INVALID_STOP_LOSS');
    });
  });

  describe('Risk Parameters Validation', () => {
    it('validates clean account parameters', () => {
      const res = TradingDataValidator.validateRiskParameters({
        accountEquity: 500_000_000,
        availableCash: 200_000_000,
        currentExposure: 150_000_000,
        quantity: 1000,
        lotSize: 100,
      });
      expect(res.isValid).toBe(true);
      expect(res.code).toBe('OK');
    });

    it('rejects non-positive equity or non-lot quantities', () => {
      expect(TradingDataValidator.validateRiskParameters({
        accountEquity: 0,
        availableCash: 100_000,
        currentExposure: 0,
      }).isValid).toBe(false);

      expect(TradingDataValidator.validateRiskParameters({
        accountEquity: 100_000_000,
        availableCash: 100_000_000,
        currentExposure: 0,
        quantity: 150, // not multiple of 100
        lotSize: 100,
      }).code).toBe('INVALID_LOT_SIZE');
    });
  });
});
