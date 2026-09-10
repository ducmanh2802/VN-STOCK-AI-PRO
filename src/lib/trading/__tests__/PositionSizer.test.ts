import { describe, it, expect } from 'vitest';
import { PositionSizer } from '../risk/PositionSizer.ts';

describe('Phase 18.1 — PositionSizer', () => {
  const baseInput = {
    equity: 100_000_000,     // 100 million VND
    availableCash: 50_000_000, // 50 million VND cash
    entryPrice: 50_000,
    stopLossPrice: 47_000,     // Risk = 3,000 VND / share
    maxRiskPerTradeRate: 0.01, // 1% => Risk budget = 1,000,000 VND
    lotSize: 100,
    buyFeeRate: 0.0015,        // 0.15%
    slippageRate: 0.0010,       // 0.10%
    existingExposure: 0,
    maxPortfolioExposureRate: 0.80,
  };

  it('computes normal position size accurately rounded to lot 100', () => {
    // Risk budget = 1,000,000. Risk/share = 3,000. Raw qty = 333.33 => Adjusted qty = 300
    const result = PositionSizer.calculate(baseInput);

    expect(result.canTrade).toBe(true);
    expect(result.quantity).toBe(300);
    expect(result.riskPerShare).toBe(3000);
    expect(result.riskAmount).toBe(900_000); // 300 * 3000 = 900,000 <= 1,000,000 budget
    expect(result.buyCost).toBe(15_000_000); // 300 * 50,000
    expect(result.buyFee).toBe(22_500);      // 15,000,000 * 0.0015
    expect(result.slippageBuffer).toBe(15_000); // 15,000,000 * 0.0010
    expect(result.totalCapitalRequirement).toBe(15_037_500);
    expect(result.code).toBe('SUCCESS');
  });

  describe('Board Lot Enforcements (100 shares)', () => {
    it('rejects when computed raw quantity is less than 100 shares (e.g. 99 shares)', () => {
      // Risk budget = 200,000. Risk/share = 2,500 => Raw qty = 80 (< 100)
      const res = PositionSizer.calculate({
        ...baseInput,
        equity: 20_000_000, // 1% = 200,000 VND
        entryPrice: 30_000,
        stopLossPrice: 27_500, // 2,500 VND
      });

      expect(res.canTrade).toBe(false);
      expect(res.quantity).toBe(0);
      expect(res.code).toBe('INVALID_LOT_SIZE');
    });

    it('sizes exactly 100 shares when raw quantity is between 100 and 199 (e.g. 101 shares)', () => {
      // Risk budget = 1,000,000. Risk/share = 9,500 => Raw = 105.26 => Adjusted = 100
      const res = PositionSizer.calculate({
        ...baseInput,
        entryPrice: 100_000,
        stopLossPrice: 90_500, // Risk = 9,500
      });

      expect(res.canTrade).toBe(true);
      expect(res.quantity).toBe(100);
      expect(res.riskAmount).toBe(950_000);
    });

    it('sizes exactly 200 shares when raw quantity is between 200 and 299', () => {
      // Risk budget = 1,000,000. Risk/share = 4,500 => Raw = 222.22 => Adjusted = 200
      const res = PositionSizer.calculate({
        ...baseInput,
        entryPrice: 50_000,
        stopLossPrice: 45_500, // Risk = 4,500
      });

      expect(res.canTrade).toBe(true);
      expect(res.quantity).toBe(200);
      expect(res.riskAmount).toBe(900_000);
    });
  });

  describe('Capital & Available Cash Enforcements', () => {
    it('rejects when total capital required exceeds available cash without compromising risk policy', () => {
      // Required capital is ~15M VND, but available cash is only 10M VND
      const res = PositionSizer.calculate({
        ...baseInput,
        availableCash: 10_000_000,
      });

      expect(res.canTrade).toBe(false);
      expect(res.code).toBe('INSUFFICIENT_CASH');
      expect(res.quantity).toBe(300); // Preserves calculated size for auditing
    });

    it('rejects when account equity is zero or negative', () => {
      expect(PositionSizer.calculate({ ...baseInput, equity: 0 }).code).toBe('INSUFFICIENT_CASH');
      expect(PositionSizer.calculate({ ...baseInput, equity: -100 }).code).toBe('INSUFFICIENT_CASH');
    });

    it('rejects when available cash is zero or negative', () => {
      expect(PositionSizer.calculate({ ...baseInput, availableCash: 0 }).code).toBe('INSUFFICIENT_CASH');
      expect(PositionSizer.calculate({ ...baseInput, availableCash: -500 }).code).toBe('INSUFFICIENT_CASH');
    });

    it('rejects when risk budget is zero (e.g. maxRiskPerTradeRate = 0)', () => {
      const res = PositionSizer.calculate({
        ...baseInput,
        maxRiskPerTradeRate: 0,
      });
      expect(res.canTrade).toBe(false);
      expect(res.code).toBe('EXCESSIVE_RISK');
    });
  });

  describe('Portfolio Exposure Limit Enforcements', () => {
    it('rejects when new trade pushes portfolio exposure beyond max limit (e.g. 80%)', () => {
      // Equity = 100M, max 80% = 80M. Existing = 70M. New buyCost = 15M => Total = 85M > 80M
      const res = PositionSizer.calculate({
        ...baseInput,
        existingExposure: 70_000_000,
      });

      expect(res.canTrade).toBe(false);
      expect(res.code).toBe('EXCESSIVE_EXPOSURE');
    });

    it('approves when new trade stays within max exposure limit', () => {
      // Existing = 60M. New = 15M => Total = 75M <= 80M
      const res = PositionSizer.calculate({
        ...baseInput,
        existingExposure: 60_000_000,
      });

      expect(res.canTrade).toBe(true);
      expect(res.code).toBe('SUCCESS');
    });
  });

  describe('Price and Distance Anomalies', () => {
    it('rejects when Entry = Stop Loss', () => {
      const res = PositionSizer.calculate({
        ...baseInput,
        entryPrice: 50_000,
        stopLossPrice: 50_000,
      });
      expect(res.canTrade).toBe(false);
      expect(res.code).toBe('INVALID_RISK_REWARD');
    });

    it('rejects when Entry < Stop Loss', () => {
      const res = PositionSizer.calculate({
        ...baseInput,
        entryPrice: 50_000,
        stopLossPrice: 52_000,
      });
      expect(res.canTrade).toBe(false);
      expect(res.code).toBe('INVALID_RISK_REWARD');
    });

    it('rejects when Stop Loss is non-positive', () => {
      const res = PositionSizer.calculate({
        ...baseInput,
        stopLossPrice: 0,
      });
      expect(res.canTrade).toBe(false);
      expect(res.code).toBe('INVALID_PRICE');
    });
  });
});
