import { describe, it, expect } from 'vitest';
import { RiskGuard } from '../risk/RiskGuard.ts';
import { DEFAULT_RISK_GUARD_POLICY } from '../types/risk.ts';
import type { RiskGuardEvaluationInput } from '../types/risk.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';

describe('Phase 18.1 — RiskGuard (Safety Guardian & Fail-Closed Gate)', () => {
  const baseInput: RiskGuardEvaluationInput = {
    symbol: 'HPG',
    signal: 'BUY',
    entryPrice: 28_000,
    stopLoss: 26_500,     // Risk/share = 1,500
    targetPrice: 31_500,  // Reward/share = 3,500 => R:R = 2.33
    confidence: 'HIGH',
    score: 80,
    currentPrice: 28_000,
    accountEquity: 500_000_000, // 500M VND
    availableCash: 300_000_000, // 300M VND
    currentExposure: 100_000_000, // 100M VND (20% exposure)
    openPositionsCount: 2,
    dailyRealizedLoss: 0,
    emergencyStop: false,
    tradingEnabled: true,
    isMarketOpen: true,
  };

  const guard = new RiskGuard();

  describe('1. Valid Data & Authorization', () => {
    it('authorizes valid trade proposal for paper trading', () => {
      const res = guard.evaluate(baseInput);
      expect(res.status).toBe('VALID');
      expect(res.authorization).toBe('AUTHORIZED_FOR_PAPER_TRADING');
      expect(res.approved).toBe(true);
      expect(res.code).toBe('APPROVED');
      expect(res.metrics).toBeDefined();
      expect(res.metrics?.approvedQuantity).toBeGreaterThanOrEqual(100);
      expect(res.metrics?.approvedQuantity % 100).toBe(0);
      expect(res.metrics?.rrRatio).toBeCloseTo(2.33, 1);
      expect(res.errors).toHaveLength(0);
    });

    it('authorizes non-BUY signals (HOLD, SELL) as valid for tracking/exit', () => {
      const holdRes = guard.evaluate({ ...baseInput, signal: 'HOLD' });
      expect(holdRes.status).toBe('VALID');
      expect(holdRes.approved).toBe(true);

      const sellRes = guard.evaluate({ ...baseInput, signal: 'SELL' });
      expect(sellRes.status).toBe('VALID');
      expect(sellRes.approved).toBe(true);
    });
  });

  describe('2. Fail-Closed on Corrupted / Invalid Inputs', () => {
    it('rejects null and undefined input payloads', () => {
      const nullRes = guard.evaluate(null as any);
      expect(nullRes.status).toBe('INVALID');
      expect(nullRes.authorization).toBe('INVALID');
      expect(nullRes.approved).toBe(false);

      const undefRes = guard.evaluate(undefined as any);
      expect(undefRes.status).toBe('INVALID');
      expect(undefRes.approved).toBe(false);
    });

    it('rejects invalid or empty symbols', () => {
      const emptySym = guard.evaluate({ ...baseInput, symbol: '' });
      expect(emptySym.approved).toBe(false);
      expect(emptySym.authorization).toBe('INVALID');

      const badSym = guard.evaluate({ ...baseInput, symbol: 'HPG@#$' });
      expect(badSym.approved).toBe(false);
      expect(badSym.authorization).toBe('INVALID');
    });

    it('rejects non-positive entry, stop loss, and target prices', () => {
      expect(guard.evaluate({ ...baseInput, entryPrice: 0 }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, entryPrice: -100 }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, stopLoss: 0 }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, stopLoss: -500 }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, targetPrice: 0 }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, targetPrice: -1000 }).approved).toBe(false);
    });

    it('rejects NaN and Infinity price values', () => {
      expect(guard.evaluate({ ...baseInput, entryPrice: NaN }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, stopLoss: NaN }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, targetPrice: NaN }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, entryPrice: Infinity }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, accountEquity: NaN }).approved).toBe(false);
      expect(guard.evaluate({ ...baseInput, availableCash: Infinity }).approved).toBe(false);
    });

    it('rejects invalid stop loss (stopLoss >= entryPrice)', () => {
      const equalRes = guard.evaluate({ ...baseInput, entryPrice: 28_000, stopLoss: 28_000 });
      expect(equalRes.approved).toBe(false);
      expect(equalRes.code).toBe('INVALID_RISK_REWARD');

      const higherRes = guard.evaluate({ ...baseInput, entryPrice: 28_000, stopLoss: 29_000 });
      expect(higherRes.approved).toBe(false);
      expect(higherRes.code).toBe('INVALID_RISK_REWARD');
    });

    it('rejects invalid target (targetPrice <= entryPrice)', () => {
      const equalRes = guard.evaluate({ ...baseInput, entryPrice: 28_000, targetPrice: 28_000 });
      expect(equalRes.approved).toBe(false);
      expect(equalRes.code).toBe('INVALID_RISK_REWARD');

      const lowerRes = guard.evaluate({ ...baseInput, entryPrice: 28_000, targetPrice: 27_000 });
      expect(lowerRes.approved).toBe(false);
      expect(lowerRes.code).toBe('INVALID_RISK_REWARD');
    });
  });

  describe('3. Risk/Reward (R:R) Boundaries', () => {
    it('blocks trades with R:R below minimum (e.g. 1.8 < 2.0)', () => {
      // Entry 28,000, Stop 26,500 (Risk = 1,500), Target 30,700 (Reward = 2,700) => R:R = 1.8
      const res = guard.evaluate({
        ...baseInput,
        entryPrice: 28_000,
        stopLoss: 26_500,
        targetPrice: 30_700,
      });
      expect(res.approved).toBe(false);
      expect(res.status).toBe('INVALID');
      expect(res.code).toBe('INVALID_RISK_REWARD');
    });

    it('authorizes trade with exact boundary R:R = 2.0', () => {
      // Entry 28,000, Stop 26,500 (Risk = 1,500), Target 31,000 (Reward = 3,000) => R:R = 2.0
      const res = guard.evaluate({
        ...baseInput,
        entryPrice: 28_000,
        stopLoss: 26_500,
        targetPrice: 31_000,
      });
      expect(res.approved).toBe(true);
      expect(res.code).toBe('APPROVED');
      expect(res.metrics?.rrRatio).toBe(2.0);
    });
  });

  describe('4. Confidence Policy', () => {
    it('blocks trades with confidence below policy minimum', () => {
      const strictGuard = new RiskGuard({ minimumConfidence: 'HIGH' });
      const medRes = strictGuard.evaluate({ ...baseInput, confidence: 'MEDIUM' });
      expect(medRes.approved).toBe(false);
      expect(medRes.code).toBe('INSUFFICIENT_CONFIDENCE');

      const lowRes = strictGuard.evaluate({ ...baseInput, confidence: 'LOW' });
      expect(lowRes.approved).toBe(false);
      expect(lowRes.code).toBe('INSUFFICIENT_CONFIDENCE');
    });

    it('accepts trades meeting or exceeding required confidence level', () => {
      const medGuard = new RiskGuard({ minimumConfidence: 'MEDIUM' });
      expect(medGuard.evaluate({ ...baseInput, confidence: 'HIGH' }).approved).toBe(true);
      expect(medGuard.evaluate({ ...baseInput, confidence: 'MEDIUM' }).approved).toBe(true);
    });
  });

  describe('5. Risk Limits & Exposure Guards', () => {
    it('blocks when risk budget produces quantity below minimum board lot of 100 shares', () => {
      // Small equity (10M VND), 1% risk = 100,000 VND. Risk/share = 1,500 VND => 66 shares (< 100)
      const res = guard.evaluate({
        ...baseInput,
        accountEquity: 10_000_000,
        availableCash: 10_000_000,
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('INVALID_LOT_SIZE');
    });

    it('blocks when required cash exceeds available cash', () => {
      const res = guard.evaluate({
        ...baseInput,
        accountEquity: 500_000_000,
        availableCash: 5_000_000, // Only 5M VND cash available
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('INSUFFICIENT_CASH');
    });

    it('blocks when new exposure breaches max portfolio exposure limit (e.g. 80%)', () => {
      const res = guard.evaluate({
        ...baseInput,
        accountEquity: 500_000_000,
        currentExposure: 395_000_000, // 79% exposure already
        availableCash: 100_000_000,
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('EXPOSURE_LIMIT_EXCEEDED');
    });

    it('blocks when daily realized loss limit is reached', () => {
      // 3% of 500M = 15M VND
      const res = guard.evaluate({
        ...baseInput,
        dailyRealizedLoss: 15_000_000,
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('DAILY_LOSS_LIMIT');
    });

    it('blocks when max concurrent open positions is reached', () => {
      const res = guard.evaluate({
        ...baseInput,
        openPositionsCount: 10,
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('POSITION_LIMIT');
    });

    it('blocks duplicate symbol / pyramiding in portfolio', () => {
      const res = guard.evaluate({
        ...baseInput,
        symbol: 'HPG',
        existingSymbols: ['VCB', 'HPG', 'FPT'],
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('POSITION_LIMIT_EXCEEDED');
    });
  });

  describe('6. Kill Switches & Market Sessions', () => {
    it('blocks immediately when emergency stop is active', () => {
      const res = guard.evaluate({ ...baseInput, emergencyStop: true });
      expect(res.status).toBe('BLOCKED');
      expect(res.approved).toBe(false);
      expect(res.code).toBe('EMERGENCY_STOP');
    });

    it('blocks immediately when trading is disabled', () => {
      const res = guard.evaluate({ ...baseInput, tradingEnabled: false });
      expect(res.status).toBe('BLOCKED');
      expect(res.approved).toBe(false);
      expect(res.code).toBe('TRADING_DISABLED');
    });

    it('blocks when market is closed and session enforcement is active', () => {
      const strictSessionGuard = new RiskGuard({ enforceMarketHours: true });
      const res = strictSessionGuard.evaluate({ ...baseInput, isMarketOpen: false });
      expect(res.status).toBe('BLOCKED');
      expect(res.approved).toBe(false);
      expect(res.code).toBe('MARKET_CLOSED');
    });
  });

  describe('7. Price Limit Violations (Ceiling / Floor / Deviation)', () => {
    it('blocks if entry price exceeds daily ceiling price', () => {
      const res = guard.evaluate({
        ...baseInput,
        entryPrice: 30_500,
        ceilingPrice: 30_000,
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('blocks if entry price is below daily floor price', () => {
      const res = guard.evaluate({
        ...baseInput,
        entryPrice: 25_500,
        floorPrice: 26_000,
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('blocks if entry price deviates excessively from live price', () => {
      const res = guard.evaluate({
        ...baseInput,
        entryPrice: 30_000,
        currentPrice: 28_000, // ~7.14% deviation > 3% tolerance
      });
      expect(res.approved).toBe(false);
      expect(res.code).toBe('INVALID_PRICE');
    });
  });

  describe('8. Direct Phase 17 InvestmentRecommendation Evaluation', () => {
    const validRec: InvestmentRecommendation = {
      symbol: 'SSI',
      strategy: 'SHORT_TERM',
      signal: 'BUY',
      score: 78,
      confidence: 'HIGH',
      entryPrice: 35_000,
      stopLoss: 33_000,   // Risk = 2,000
      targetPrice: 40_000, // Reward = 5,000 => R:R = 2.5
      riskReward: 2.5,
      expectedReturn: 14.28,
      holdingPeriod: 10,
      reasons: ['Breakout above MA20', 'Strong foreign accumulation'],
      warnings: [],
      scoreBreakdown: {
        technical: 80,
        fundamental: 75,
        momentum: 82,
        moneyFlow: 76,
        valuation: 70,
        risk: 25,
      },
      evidence: [],
      generatedAt: new Date().toISOString(),
      asOfDate: '2026-03-10',
      currency: 'VND',
    };

    it('authorizes a clean Phase 17 recommendation', () => {
      const res = guard.evaluateRecommendation(
        validRec,
        { symbol: 'SSI', price: 35_000, ceilingPrice: 37_450, floorPrice: 32_550 },
        {
          accountEquity: 500_000_000,
          availableCash: 250_000_000,
          currentExposure: 100_000_000,
          openPositionsCount: 1,
        }
      );

      expect(res.status).toBe('VALID');
      expect(res.authorization).toBe('AUTHORIZED_FOR_PAPER_TRADING');
      expect(res.approved).toBe(true);
      expect(res.code).toBe('APPROVED');
      expect(res.metrics?.approvedQuantity).toBeGreaterThan(0);
      expect(res.metrics?.approvedQuantity! % 100).toBe(0);
    });

    it('rejects recommendation with missing prices (Fail-Closed)', () => {
      const invalidRec = { ...validRec, stopLoss: null };
      const res = guard.evaluateRecommendation(
        invalidRec,
        { symbol: 'SSI', price: 35_000 },
        {
          accountEquity: 500_000_000,
          availableCash: 250_000_000,
          currentExposure: 100_000_000,
        }
      );

      expect(res.approved).toBe(false);
      expect(res.authorization).toBe('INVALID');
      expect(res.code).toBe('INVALID_STOP_LOSS');
    });
  });
});
