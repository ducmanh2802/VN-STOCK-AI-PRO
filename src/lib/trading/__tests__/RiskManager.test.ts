import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager } from '../risk/RiskManager.ts';
import type { TradingMarketData, TradingSignal } from '../types/trading.ts';
import type { RiskContext } from '../types/risk.ts';

describe('Phase 18.1 — RiskManager', () => {
  let riskManager: RiskManager;

  const validMarketData: TradingMarketData = {
    symbol: 'FPT',
    price: 110_000,
    open: 109_000,
    high: 112_000,
    low: 108_500,
    close: 110_000,
    volume: 5_000_000,
    ceilingPrice: 117_700,
    floorPrice: 102_300,
    timestamp: Date.now() - 5000,
    dataSource: 'VPS',
  };

  const validSignal: TradingSignal = {
    symbol: 'FPT',
    signal: 'BUY',
    entryPrice: 110_000,
    stopLoss: 105_000,    // Risk = 5,000 VND
    targetPrice: 121_000, // Reward = 11,000 VND => R:R = 2.2 >= 2.0
    riskReward: 2.2,
    confidence: 'HIGH',
    score: 85,
  };

  let validContext: RiskContext;

  beforeEach(() => {
    riskManager = new RiskManager();
    validContext = {
      accountEquity: 100_000_000,     // 100M VND
      availableCash: 50_000_000,      // 50M VND
      currentExposure: 30_000_000,    // 30M VND (30%)
      openPositionsCount: 3,          // 3 / 10
      dailyRealizedLoss: 500_000,     // 500k VND (0.5% < 3% limit)
      tradingEnabled: true,
      emergencyStop: false,
      isMarketOpen: true,
      existingSymbols: ['HPG', 'MBB', 'MWG'],
    };
  });

  it('approves a valid trade meeting all safety and risk criteria', () => {
    const check = riskManager.checkRisk(validSignal, validMarketData, validContext);
    expect(check.approved).toBe(true);
    expect(check.code).toBe('APPROVED');
    expect(check.metrics?.rrRatio).toBe(2.2);

    const decision = riskManager.evaluateTrade(validSignal, validMarketData, validContext);
    expect(decision.decision).toBe('APPROVED_TRADE');
    expect(decision.quantity).toBe(200); // 1M risk / 5k risk/share = 200 shares
    expect(decision.totalCapitalRequirement).toBeGreaterThan(0);
  });

  describe('Master Kill Switches', () => {
    it('rejects trade immediately when emergency stop is active', () => {
      const context = { ...validContext, emergencyStop: true };
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('EMERGENCY_STOP');

      const decision = riskManager.evaluateTrade(validSignal, validMarketData, context);
      expect(decision.decision).toBe('NO_TRADE');
      expect(decision.rejectionCode).toBe('EMERGENCY_STOP');
    });

    it('rejects trade when trading is globally disabled', () => {
      const context = { ...validContext, tradingEnabled: false };
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('TRADING_DISABLED');
    });

    it('rejects trade when market is closed', () => {
      const context = { ...validContext, isMarketOpen: false };
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('MARKET_CLOSED');
    });
  });

  describe('Portfolio Level Limits', () => {
    it('rejects trade when daily realized loss reaches limit (e.g. 3% equity)', () => {
      // 3% of 100M = 3M VND limit
      const context = { ...validContext, dailyRealizedLoss: 3_000_000 };
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('DAILY_LOSS_LIMIT');
    });

    it('rejects trade when maximum open positions limit is reached (e.g. 10)', () => {
      const context = { ...validContext, openPositionsCount: 10 };
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('POSITION_LIMIT');
    });

    it('rejects trade if portfolio already holds the same symbol', () => {
      const context = { ...validContext, existingSymbols: ['HPG', 'FPT', 'MBB'] };
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('POSITION_LIMIT');
    });

    it('rejects trade if total capital exceeds available cash', () => {
      const context = { ...validContext, availableCash: 5_000_000 }; // Needs ~22M for 200 shares
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('INSUFFICIENT_CASH');
    });

    it('rejects trade if new trade exceeds maximum portfolio exposure (80%)', () => {
      const context = { ...validContext, currentExposure: 75_000_000 }; // 75M + 22M = 97M > 80M
      const check = riskManager.checkRisk(validSignal, validMarketData, context);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('EXCESSIVE_EXPOSURE');
    });
  });

  describe('Price and Exchange Limit Enforcements', () => {
    it('rejects entry price above ceiling price', () => {
      const signalAboveCeiling: TradingSignal = {
        ...validSignal,
        entryPrice: 118_000, // Ceiling = 117,700
        stopLoss: 112_000,   // Risk = 6,000
        targetPrice: 130_000, // Reward = 12,000 => R:R = 2.0
      };
      const check = riskManager.checkRisk(signalAboveCeiling, validMarketData, validContext);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('rejects entry price below floor price', () => {
      const signalBelowFloor: TradingSignal = {
        ...validSignal,
        entryPrice: 102_000, // Floor = 102,300
        stopLoss: 98_000,    // Risk = 4,000
        targetPrice: 110_000, // Reward = 8,000 => R:R = 2.0
      };
      const check = riskManager.checkRisk(signalBelowFloor, validMarketData, validContext);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('rejects signal with R:R < 2.0 (e.g. 1.8)', () => {
      const lowRRSignal: TradingSignal = {
        ...validSignal,
        entryPrice: 110_000,
        stopLoss: 105_000,    // Risk = 5,000
        targetPrice: 119_000, // Reward = 9,000 => R:R = 1.8 < 2.0
      };
      const check = riskManager.checkRisk(lowRRSignal, validMarketData, validContext);

      expect(check.approved).toBe(false);
      expect(check.code).toBe('INVALID_RISK_REWARD');
    });
  });
});
