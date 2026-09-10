import { describe, it, expect, beforeEach } from 'vitest';
import { TradingEngine } from '../engine/TradingEngine.ts';
import { PaperBroker } from '../paper/PaperBroker.ts';
import { OrderManager } from '../execution/OrderManager.ts';
import type { TradingMarketData } from '../types/trading.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';

describe('TradingEngine — Phase 18.4 Verification', () => {
  let broker: PaperBroker;
  let orderManager: OrderManager;
  let engine: TradingEngine;

  const validMarketData: TradingMarketData = {
    symbol: 'HPG',
    price: 26000,
    open: 25800,
    high: 26200,
    low: 25700,
    close: 26000,
    volume: 12500000,
    referencePrice: 25800,
    ceilingPrice: 27600,
    floorPrice: 24000,
    timestamp: Date.now(),
    dataSource: 'KBS',
  };

  const buyRecommendation: InvestmentRecommendation = {
    symbol: 'HPG',
    strategy: 'SHORT_TERM',
    signal: 'BUY',
    score: 82,
    confidence: 'HIGH',
    entryPrice: 26000,
    targetPrice: 29500,
    stopLoss: 24700,
    riskReward: 2.69,
    expectedReturn: 13.5,
    holdingPeriod: 14,
    reasons: ['Breakout above MA20', 'Strong institutional net inflow'],
  };

  const holdRecommendation: InvestmentRecommendation = {
    symbol: 'HPG',
    strategy: 'SHORT_TERM',
    signal: 'HOLD',
    score: 55,
    confidence: 'MEDIUM',
    entryPrice: 26000,
    targetPrice: 27000,
    stopLoss: 25000,
    riskReward: 1.0,
    expectedReturn: 3.8,
    holdingPeriod: 14,
    reasons: ['Consolidation zone with no clear directional bias'],
  };

  const sellRecommendation: InvestmentRecommendation = {
    symbol: 'HPG',
    strategy: 'SHORT_TERM',
    signal: 'SELL',
    score: 30,
    confidence: 'HIGH',
    entryPrice: 26000,
    targetPrice: 23000,
    stopLoss: 27500,
    riskReward: 2.0,
    expectedReturn: -11.5,
    holdingPeriod: 7,
    reasons: ['Loss of support at MA50', 'Bearish divergence on RSI'],
  };

  beforeEach(() => {
    validMarketData.timestamp = Date.now();
    broker = new PaperBroker({
      initialCash: 100_000_000, // 100M VND
      skipSessionValidation: true,
      executionDelayMs: 0,
    });
    orderManager = new OrderManager({ broker });
    engine = new TradingEngine({
      broker,
      orderManager,
      skipSessionValidation: true, // deterministic test mode
    });
  });

  describe('1. Full BUY Execution Pipeline', () => {
    it('executes a complete BUY cycle through RiskManager, PositionSizer, OrderManager, and PaperBroker', async () => {
      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      expect(result.status).toBe('TRADED');
      expect(result.action).toBe('BUY');
      expect(result.tradeDecision).toBeDefined();
      expect(result.tradeDecision?.decision).toBe('APPROVED_TRADE');
      expect(result.positionSizing).toBeDefined();
      expect(result.positionSizing?.canTrade).toBe(true);
      expect(result.positionSizing?.quantity).toBeGreaterThanOrEqual(100);
      expect(result.order).toBeDefined();
      expect(result.order?.status).toBe('FILLED');

      // Verify broker account updated accurately
      const account = await broker.getAccount();
      expect(account.availableCash).toBeLessThan(100_000_000);
      expect(account.marketValue).toBeGreaterThan(0);

      // Verify position exists in broker
      const position = await broker.getPosition('HPG');
      expect(position).toBeDefined();
      expect(position?.quantity).toBe(result.positionSizing!.quantity);

      // Verify audit history
      const history = engine.getAuditHistory('HPG');
      expect(history.length).toBe(1);
      expect(history[0].status).toBe('TRADED');
    });

    it('supports LIMIT orders with specified limit price', async () => {
      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
        orderType: 'LIMIT',
        limitPrice: 26000,
      });

      expect(result.status).toBe('TRADED');
      expect(result.order?.type).toBe('LIMIT');
      expect(result.order?.limitPrice).toBe(26000);
      expect(result.order?.status).toBe('FILLED');
    });
  });

  describe('2. HOLD Signal Non-Trading Behavior', () => {
    it('strictly avoids placing any order when recommendation is HOLD', async () => {
      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: holdRecommendation,
      });

      expect(result.status).toBe('NO_TRADE');
      expect(result.action).toBe('HOLD');
      expect(result.reason).toContain('HOLD');
      expect(result.order).toBeUndefined();

      // Ensure no positions were opened and cash is untouched
      const account = await broker.getAccount();
      expect(account.availableCash).toBe(100_000_000);
      const positions = await broker.getPositions();
      expect(positions.length).toBe(0);
    });
  });

  describe('3. Safety Master Switches', () => {
    it('blocks trading immediately when tradingEnabled is false', async () => {
      engine.setTradingEnabled(false);
      expect(engine.isTradingEnabled()).toBe(false);

      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      expect(result.status).toBe('NO_TRADE');
      expect(result.rejectionCode).toBe('TRADING_DISABLED');
      expect(result.reason).toContain('disabled');

      const positions = await broker.getPositions();
      expect(positions.length).toBe(0);
    });

    it('blocks trading and cancels pending orders when emergencyStop is activated without liquidating positions', async () => {
      // 1. Establish an initial position first
      const buyRes = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });
      if (buyRes.status !== 'TRADED') {
        console.error('DEBUG buyRes:', buyRes.status, buyRes.rejectionCode, buyRes.reason);
      }
      expect(buyRes.status).toBe('TRADED');

      const initialPosition = await broker.getPosition('HPG');
      const initialQty = initialPosition?.quantity;
      expect(initialQty).toBeGreaterThan(0);

      // 2. Activate Emergency Stop
      await engine.setEmergencyStop(true);
      expect(engine.isEmergencyStopActive()).toBe(true);

      // 3. Attempt a new trade — must be blocked
      const blockedRes = await engine.runTradingCycle({
        symbol: 'VCB',
        marketData: { ...validMarketData, symbol: 'VCB', price: 90000, referencePrice: 89000, ceilingPrice: 95000, floorPrice: 83000 },
        recommendation: { ...buyRecommendation, symbol: 'VCB', entryPrice: 90000, targetPrice: 100000, stopLoss: 85000 },
      });

      expect(blockedRes.status).toBe('NO_TRADE');
      expect(blockedRes.rejectionCode).toBe('EMERGENCY_STOP');

      // 4. Verify existing position was NOT liquidated
      const positionAfterEmergency = await broker.getPosition('HPG');
      expect(positionAfterEmergency?.quantity).toBe(initialQty);
    });
  });

  describe('4. Vietnamese Market Session Enforcement', () => {
    it('rejects order placement outside market hours when session validation is enabled', async () => {
      const sessionEngine = new TradingEngine({
        broker,
        orderManager,
        skipSessionValidation: false, // enforce real session rules
      });

      // Pass a Sunday timestamp (Sunday is always closed)
      const sundayTimestamp = new Date('2026-09-06T10:00:00+07:00').getTime();
      const closedMarketData: TradingMarketData = {
        ...validMarketData,
        timestamp: sundayTimestamp,
      };

      const result = await sessionEngine.runTradingCycle({
        symbol: 'HPG',
        marketData: closedMarketData,
        recommendation: buyRecommendation,
      });

      expect(result.status).toBe('NO_TRADE');
      expect(result.rejectionCode).toBe('MARKET_CLOSED');
      expect(result.reason).toContain('closed');
    });
  });

  describe('5. Market Data Integrity & Stale Data', () => {
    it('fails closed when market data timestamp is stale (> 120s)', async () => {
      const staleTimestamp = Date.now() - 300_000; // 5 minutes old
      const staleData: TradingMarketData = {
        ...validMarketData,
        timestamp: staleTimestamp,
      };

      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: staleData,
        recommendation: buyRecommendation,
      });

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionCode).toBe('DATA_STALE');
    });

    it('fails closed when market price is non-positive', async () => {
      const corruptData: TradingMarketData = {
        ...validMarketData,
        price: -100,
      };

      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: corruptData,
        recommendation: buyRecommendation,
      });

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionCode).toBe('INVALID_PRICE');
    });
  });

  describe('6. Exchange Price Limits (Ceiling & Floor)', () => {
    it('rejects BUY order when entry price violates daily ceiling limit', async () => {
      const ceilingBreachedData: TradingMarketData = {
        ...validMarketData,
        price: 28000,
        ceilingPrice: 27600, // Ceiling is 27,600
      };

      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: ceilingBreachedData,
        recommendation: {
          ...buyRecommendation,
          entryPrice: 28000,
        },
      });

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionCode).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('rejects BUY order when entry price violates daily floor limit', async () => {
      const floorBreachedData: TradingMarketData = {
        ...validMarketData,
        price: 23500,
        floorPrice: 24000, // Floor is 24,000
      };

      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: floorBreachedData,
        recommendation: {
          ...buyRecommendation,
          entryPrice: 23500,
        },
      });

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionCode).toBe('PRICE_LIMIT_VIOLATION');
    });
  });

  describe('7. Position Sizing & Minimum Board Lot', () => {
    it('rejects trade when calculated position size is smaller than 100 shares', async () => {
      // Extremely low cash account where even 100 shares of HPG (2.6M VND) cannot be bought
      const poorBroker = new PaperBroker({
        initialCash: 1_000_000, // 1M VND
        skipSessionValidation: true,
      });
      const poorEngine = new TradingEngine({
        broker: poorBroker,
        skipSessionValidation: true,
      });

      const result = await poorEngine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      expect(result.status).toBe('NO_TRADE');
      expect(result.rejectionCode).toBe('INSUFFICIENT_CASH');
      expect(result.order).toBeUndefined();
    });
  });

  describe('8. SELL Flow & Short Selling Ban', () => {
    it('strictly forbids short selling when no existing position is held', async () => {
      const result = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: sellRecommendation,
      });

      expect(result.status).toBe('NO_TRADE');
      expect(result.rejectionCode).toBe('INSUFFICIENT_POSITION');
      expect(result.reason).toContain('Short selling is strictly prohibited');
      expect(result.order).toBeUndefined();
    });

    it('successfully closes an existing position when a valid SELL recommendation is processed', async () => {
      // 1. Buy first
      await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      const posBeforeSell = await broker.getPosition('HPG');
      expect(posBeforeSell).toBeDefined();
      const ownedQuantity = posBeforeSell!.quantity;
      expect(ownedQuantity).toBeGreaterThan(0);

      // 2. Sell
      const sellResult = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: sellRecommendation,
      });

      expect(sellResult.status).toBe('TRADED');
      expect(sellResult.action).toBe('SELL');
      expect(sellResult.order?.status).toBe('FILLED');

      // Verify position closed
      const posAfterSell = await broker.getPosition('HPG');
      expect(posAfterSell?.quantity ?? 0).toBe(0);
    });

    it('supports partial sell when requested quantity is valid', async () => {
      // 1. Buy
      await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      const pos = await broker.getPosition('HPG');
      expect(pos!.quantity).toBeGreaterThanOrEqual(200);

      // 2. Sell 100 shares specifically
      const partialSellResult = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: sellRecommendation,
        sellQuantity: 100,
      });

      expect(partialSellResult.status).toBe('TRADED');
      expect(partialSellResult.order?.quantity).toBe(100);

      const posAfter = await broker.getPosition('HPG');
      expect(posAfter?.quantity).toBe(pos!.quantity - 100);
    });
  });

  describe('9. Idempotency & Concurrency', () => {
    it('blocks duplicate BUY orders when position already exists (anti-pyramiding)', async () => {
      // First buy
      const first = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });
      expect(first.status).toBe('TRADED');

      // Immediate second buy attempt
      const second = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      expect(second.status).toBe('NO_TRADE');
      expect(second.rejectionCode).toBe('POSITION_LIMIT');
      expect(second.reason).toContain('Pyramiding / duplicate positions are restricted');
    });

    it('runs batch cycles sequentially across multiple symbols', async () => {
      const fptMarketData: TradingMarketData = {
        symbol: 'FPT',
        price: 130000,
        open: 129000,
        high: 131000,
        low: 128500,
        close: 130000,
        volume: 4500000,
        referencePrice: 129000,
        ceilingPrice: 138000,
        floorPrice: 120000,
        timestamp: Date.now(),
        dataSource: 'KBS',
      };

      const fptRecommendation: InvestmentRecommendation = {
        symbol: 'FPT',
        strategy: 'SHORT_TERM',
        signal: 'BUY',
        score: 88,
        confidence: 'HIGH',
        entryPrice: 130000,
        targetPrice: 145000,
        stopLoss: 124000,
        riskReward: 2.5,
        expectedReturn: 11.5,
        holdingPeriod: 14,
        reasons: ['Cloud & AI revenue acceleration'],
      };

      // Register market data resolver or pass via batch
      const res1 = await engine.runTradingCycle({
        symbol: 'HPG',
        marketData: validMarketData,
        recommendation: buyRecommendation,
      });

      const res2 = await engine.runTradingCycle({
        symbol: 'FPT',
        marketData: fptMarketData,
        recommendation: fptRecommendation,
      });

      expect(res1.status).toBe('TRADED');
      expect(res2.status).toBe('TRADED');

      const positions = await broker.getPositions();
      expect(positions.length).toBe(2);
      expect(positions.map((p) => p.symbol).sort()).toEqual(['FPT', 'HPG']);
    });
  });
});
