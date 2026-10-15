/**
 * PHASE 18.2 — PAPER EXECUTION ENGINE TEST SUITE
 * ===============================================
 * Verifies the complete mandatory pipeline:
 * Phase 17 Recommendation -> MarketDataIntegrityGuard -> TradingDataValidator
 * -> RiskGuard (AUTHORIZED_FOR_PAPER_TRADING) -> VietnamLotRule -> Execution -> Ledger.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaperExecutionEngine } from '../paper/PaperExecutionEngine.ts';
import { PaperBroker } from '../paper/PaperBroker.ts';
import { PaperPnL } from '../paper/PaperPnL.ts';
import type { TradingMarketData } from '../types/trading.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';
import type { BrokerAccount } from '../execution/BrokerAdapter.ts';

describe('PaperExecutionEngine', () => {
  const baseNow = 1710000000000;

  const validMarketData: TradingMarketData = {
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
    timestamp: baseNow - 1000,
    dataSource: 'VPS_LIVE',
  };

  const validBuyRec: InvestmentRecommendation = {
    symbol: 'HPG',
    strategy: 'SHORT_TERM',
    signal: 'BUY',
    confidence: 'HIGH',
    score: 85,
    entryPrice: 30000,
    stopLoss: 28500, // 5% risk
    targetPrice: 33500, // ~11.6% reward -> RR > 2.3
    riskReward: 2.33,
    expectedReturn: 11.67,
    holdingPeriod: 14,
    reasons: ['Strong bullish momentum'],
    warnings: [],
    scoreBreakdown: {
      technical: 85,
      fundamental: 80,
      valuation: 85,
      risk: 90,
      momentum: 85,
      moneyFlow: 80,
    },
    evidence: [],
    generatedAt: new Date(baseNow).toISOString(),
    asOfDate: '2026-03-10',
    currency: 'VND',
  };

  let engine: PaperExecutionEngine;

  beforeEach(() => {
    engine = new PaperExecutionEngine({
      policy: {
        enforceMarketHours: false, // keep false for pure algorithmic testing
      },
    });
  });

  // 21. Valid BUY Execution
  it('21. successfully executes valid BUY order and logs to ledger', () => {
    const broker = new PaperBroker({
      initialCash: 100_000_000,
      skipSessionValidation: true,
    });

    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('FILLED');
    expect(result.code).toBe('EXECUTED');
    expect(result.executedQuantity).toBeGreaterThan(0);
    expect(result.executedQuantity % 100).toBe(0);
    expect(result.executedPrice).toBeGreaterThanOrEqual(validMarketData.price);
    expect(result.fee).toBeGreaterThan(0);

    const account = broker.getAccount();
    const position = account.positions.find(p => p.symbol === 'HPG');
    expect(position).toBeDefined();
    expect(position?.quantity).toBe(result.executedQuantity);

    const ledger = engine.getLedger();
    const latest = ledger.getLatestEntry();
    expect(latest?.finalOrderStatus).toBe('FILLED');
    expect(latest?.executedQuantity).toBe(result.executedQuantity);
  });

  // 22. Valid SELL Execution
  it('22. successfully executes valid SELL order and computes realized PnL', () => {
    const broker = new PaperBroker({
      initialCash: 50_000_000,
      skipSessionValidation: true,
    });

    // Seed position: 1,000 shares of HPG @ 28,000 VND
    broker.processMarketData({ symbol: 'HPG', price: 28000, timestamp: baseNow - 5000 });
    broker.submitOrder({ symbol: 'HPG', side: 'BUY', type: 'MARKET', quantity: 1000, limitPrice: 28000 });

    const sellRec: InvestmentRecommendation = {
      ...validBuyRec,
      signal: 'SELL',
      entryPrice: 30000,
      stopLoss: 31000,
      targetPrice: 27000,
    };

    const result = engine.execute({
      recommendation: sellRec,
      marketData: validMarketData,
      broker,
      customQuantity: 500,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('FILLED');
    expect(result.side).toBe('SELL');
    expect(result.executedQuantity).toBe(500);
    expect(result.realizedPnL).toBeDefined();
    expect(result.tax).toBeGreaterThan(0);
  });

  // 23. Invalid Phase 17 Recommendation
  it('23. rejects invalid recommendation with missing stop-loss', () => {
    const invalidRec: InvestmentRecommendation = {
      ...validBuyRec,
      stopLoss: null,
    };

    const result = engine.execute({
      recommendation: invalidRec,
      marketData: validMarketData,
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toContain('Recommendation validation failed');
  });

  // 24. TradingDataValidator INVALID
  it('24. rejects when signal risk-reward is below minimum required', () => {
    const poorRRRec: InvestmentRecommendation = {
      ...validBuyRec,
      entryPrice: 30000,
      stopLoss: 29000, // 1000 risk
      targetPrice: 30500, // 500 reward -> RR = 0.5 (must be >= 2.0)
      riskReward: 0.5,
    };

    const result = engine.execute({
      recommendation: poorRRRec,
      marketData: validMarketData,
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.code).toBe('INVALID_RISK_REWARD');
  });

  // 25. RiskGuard BLOCKED
  it('25. rejects when RiskGuard blocks due to max risk per trade limit', () => {
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      account: {
        accountId: 'TEST',
        currency: 'VND',
        cash: 10_000_000,
        reservedCash: 0,
        availableCash: 10_000_000,
        marketValue: 0,
        equity: 10_000_000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        positions: [],
        openOrders: [],
        updatedAt: new Date(baseNow).toISOString(),
      },
      policy: {
        maxRiskPerTradePercent: 0.01, // extremely tight risk limit: 0.01%
      },
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 26. RiskGuard INVALID (e.g. emergency stop)
  it('26. rejects when emergency stop is active', () => {
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      policy: {
        emergencyStop: true,
      } as any,
      now: baseNow,
    });

    // Emergency stop inside policy/guard evaluation
    const result2 = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker: new PaperBroker({ emergencyStop: true }),
      now: baseNow,
    });

    expect(result2.success).toBe(false);
    expect(result2.status).toBe('REJECTED');
  });

  // 27. Authorization not AUTHORIZED_FOR_PAPER_TRADING
  it('27. rejects if confidence is below minimum required', () => {
    const lowConfRec: InvestmentRecommendation = {
      ...validBuyRec,
      confidence: 'LOW',
    };

    const result = engine.execute({
      recommendation: lowConfRec,
      marketData: validMarketData,
      policy: {
        minimumConfidence: 'MEDIUM',
      },
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 28. Valid Lot Size
  it('28. accepts valid 100-share multiples', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 300,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    expect(result.executedQuantity).toBe(300);
  });

  // 29. Non-lot Quantity Truncation
  it('29. rounds 150 shares down to 100 shares without upward rounding', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 150,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    expect(result.executedQuantity).toBe(100);
  });

  // 30. Quantity Rounded Downward
  it('30. rounds 299 shares down to 200 shares', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 299,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    expect(result.executedQuantity).toBe(200);
  });

  // 31. Rounded Quantity Becomes Zero
  it('31. rejects order when raw quantity is < 100 shares (rounds to 0)', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 50,
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.code).toBe('INVALID_QUANTITY');
    expect(result.executedQuantity).toBe(0);
  });

  // 32. Insufficient Cash
  it('32. rejects BUY when required capital exceeds available cash', () => {
    const broker = new PaperBroker({ initialCash: 1_000_000, skipSessionValidation: true }); // Only 1M cash
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 1000, // 1000 * 30,000 = 30M VND
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.code).toBe('INSUFFICIENT_CASH');
  });

  // 33. Insufficient Position for SELL
  it('33. rejects SELL when position quantity is 0 or less than requested', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });
    const sellRec: InvestmentRecommendation = {
      ...validBuyRec,
      signal: 'SELL',
    };

    const result = engine.execute({
      recommendation: sellRec,
      marketData: validMarketData,
      broker,
      customQuantity: 100,
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.code).toBe('INSUFFICIENT_POSITION');
  });

  // 34. Excessive Portfolio Exposure
  it('34. rejects trade when portfolio exposure would exceed limit', () => {
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      account: {
        accountId: 'TEST',
        currency: 'VND',
        cash: 10_000_000,
        reservedCash: 0,
        availableCash: 10_000_000,
        marketValue: 85_000_000,
        equity: 95_000_000, // Exposure already 89.4% (limit: 80%)
        realizedPnL: 0,
        unrealizedPnL: 0,
        positions: [{
          symbol: 'VNM',
          quantity: 1000,
          reservedQuantity: 0,
          availableQuantity: 1000,
          averageCost: 85000,
          currentPrice: 85000,
          marketValue: 85000000,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          updatedAt: new Date(baseNow).toISOString(),
        }],
        openOrders: [],
        updatedAt: new Date(baseNow).toISOString(),
      },
      policy: {
        maxPortfolioExposurePercent: 80,
      },
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 35. Excessive Risk Per Trade
  it('35. rejects trade when risk per trade exceeds configured threshold', () => {
    const highRiskRec: InvestmentRecommendation = {
      ...validBuyRec,
      entryPrice: 30000,
      stopLoss: 20000, // 33% stop-loss risk
      targetPrice: 60000,
      riskReward: 3.0,
    };

    const result = engine.execute({
      recommendation: highRiskRec,
      marketData: validMarketData,
      account: {
        accountId: 'TEST',
        currency: 'VND',
        cash: 10_000_000,
        reservedCash: 0,
        availableCash: 10_000_000,
        marketValue: 0,
        equity: 10_000_000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        positions: [],
        openOrders: [],
        updatedAt: new Date(baseNow).toISOString(),
      },
      policy: {
        maxRiskPerTradePercent: 1.0, // 1% limit (100k VND)
      },
      customQuantity: 500, // Risk = 500 * 10,000 = 5M VND (50% of equity)
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 36. Daily Loss Limit
  it('36. rejects trading when daily loss limit is breached', () => {
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      account: {
        accountId: 'TEST',
        currency: 'VND',
        cash: 95_000_000,
        reservedCash: 0,
        availableCash: 95_000_000,
        marketValue: 0,
        equity: 100_000_000,
        realizedPnL: -5_000_000, // -5% daily loss (limit is 3%)
        unrealizedPnL: 0,
        positions: [],
        openOrders: [],
        updatedAt: new Date(baseNow).toISOString(),
      },
      policy: {
        dailyLossLimitPercent: 3.0,
      },
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 37. Emergency Stop Flag
  it('37. rejects execution when master emergency stop is enabled', () => {
    const broker = new PaperBroker({ emergencyStop: true });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 38. Trading Disabled Flag
  it('38. rejects execution when trading is disabled', () => {
    const broker = new PaperBroker({ tradingEnabled: false });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 39. Outside Market Session
  it('39. rejects execution outside trading hours when session validation is enforced', () => {
    const weekendTime = Date.parse('2026-03-08T03:00:00.000Z'); // Sunday
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: { ...validMarketData, timestamp: weekendTime },
      policy: {
        enforceMarketHours: true,
      },
      now: weekendTime,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('REJECTED');
  });

  // 40. Ceiling / Floor Violation
  it('40. rejects execution when current price exceeds ceiling or falls below floor', () => {
    const resCeil = engine.execute({
      recommendation: validBuyRec,
      marketData: { ...validMarketData, price: 35000, ceilingPrice: 32000, floorPrice: 28000 },
      now: baseNow,
    });
    expect(resCeil.success).toBe(false);
    expect(resCeil.status).toBe('REJECTED');

    const resFlr = engine.execute({
      recommendation: validBuyRec,
      marketData: { ...validMarketData, price: 25000, ceilingPrice: 32000, floorPrice: 28000 },
      now: baseNow,
    });
    expect(resFlr.success).toBe(false);
    expect(resFlr.status).toBe('REJECTED');
  });

  // 41. Deterministic Repeated Execution
  it('41. produces identical execution results for identical inputs', () => {
    const account1: BrokerAccount = {
      accountId: 'ACC_1',
      currency: 'VND',
      cash: 100_000_000,
      reservedCash: 0,
      availableCash: 100_000_000,
      marketValue: 0,
      equity: 100_000_000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      positions: [],
      openOrders: [],
      updatedAt: new Date(baseNow).toISOString(),
    };

    const account2: BrokerAccount = JSON.parse(JSON.stringify(account1));

    const res1 = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      account: account1,
      customQuantity: 500,
      now: baseNow,
    });

    const res2 = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      account: account2,
      customQuantity: 500,
      now: baseNow,
    });

    expect(res1.executedPrice).toBe(res2.executedPrice);
    expect(res1.executedQuantity).toBe(res2.executedQuantity);
    expect(res1.fee).toBe(res2.fee);
    expect(res1.tax).toBe(res2.tax);
    expect(res1.slippage).toBe(res2.slippage);
    expect(res1.accountAfter?.cash).toBe(res2.accountAfter?.cash);
  });

  // 42. Fee Calculation (0.15% BUY)
  it('42. accurately calculates 0.15% buy fee', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 1000,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    const expectedFee = Math.round(result.executedPrice! * 1000 * 0.0015);
    expect(result.fee).toBe(expectedFee);
  });

  // 43. Sell Tax Calculation (0.10% SELL)
  it('43. accurately calculates 0.10% Vietnamese equity sell tax', () => {
    const broker = new PaperBroker({ initialCash: 50_000_000, skipSessionValidation: true });
    broker.processMarketData({ symbol: 'HPG', price: 30000, timestamp: baseNow - 5000 });
    broker.submitOrder({ symbol: 'HPG', side: 'BUY', type: 'MARKET', quantity: 1000, limitPrice: 30000 });

    const sellRec: InvestmentRecommendation = { ...validBuyRec, signal: 'SELL' };
    const result = engine.execute({
      recommendation: sellRec,
      marketData: validMarketData,
      broker,
      customQuantity: 1000,
      now: baseNow,
    });

    expect(result.success).toBe(true);
    const expectedTax = Math.round(result.executedPrice! * 1000 * 0.0010);
    expect(result.tax).toBe(expectedTax);
  });

  // 44. Slippage Calculation
  it('44. applies positive slippage to BUY and negative slippage to SELL', () => {
    const broker = new PaperBroker({ initialCash: 100_000_000, skipSessionValidation: true });

    // BUY Slippage: price * (1 + 0.0010)
    const buyRes = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 100,
      now: baseNow,
    });
    expect(buyRes.executedPrice).toBe(Math.round(30000 * 1.001));

    // SELL Slippage: price * (1 - 0.0010)
    const sellRec: InvestmentRecommendation = { ...validBuyRec, signal: 'SELL' };
    const sellRes = engine.execute({
      recommendation: sellRec,
      marketData: validMarketData,
      broker,
      customQuantity: 100,
      now: baseNow,
    });
    expect(sellRes.executedPrice).toBe(Math.round(30000 * 0.999));
  });

  // 45. Realized P&L Calculation
  it('45. computes realized P&L taking costs into account', () => {
    const pnl = PaperPnL.calculateRealizedPnL({
      sellPrice: 35000,
      averageCost: 30000,
      quantity: 1000,
      sellFeeRate: 0.0015,
      sellTaxRate: 0.0010,
    });

    expect(pnl.grossProceeds).toBe(35_000_000);
    expect(pnl.costBasis).toBe(30_000_000);
    expect(pnl.grossPnL).toBe(5_000_000);
    expect(pnl.sellFee).toBe(52500); // 35M * 0.15%
    expect(pnl.sellTax).toBe(35000); // 35M * 0.10%
    expect(pnl.netPnL).toBe(5_000_000 - 52500 - 35000);
  });

  // 46. Unrealized P&L Calculation
  it('46. computes position and portfolio unrealized P&L', () => {
    const posPnL = PaperPnL.calculatePositionPnL(
      { quantity: 1000, averageCost: 28000 },
      30000
    );

    expect(posPnL.marketValue).toBe(30_000_000);
    expect(posPnL.unrealizedPnL).toBe(2_000_000);
    expect(posPnL.unrealizedPnLPercent).toBeCloseTo(7.14, 2);
  });

  // 47. Atomic State Update
  it('47. ensures account state remains intact if order execution fails', () => {
    const broker = new PaperBroker({ initialCash: 10_000_000, skipSessionValidation: true });
    const cashBefore = broker.getAccount().cash;

    // Fail execution due to insufficient cash
    const result = engine.execute({
      recommendation: validBuyRec,
      marketData: validMarketData,
      broker,
      customQuantity: 5000, // 5000 * 30,000 = 150M VND > 10M cash
      now: baseNow,
    });

    expect(result.success).toBe(false);
    expect(broker.getAccount().cash).toBe(cashBefore);
    expect(broker.getAccount().positions).toHaveLength(0);
  });

  // 48. Rejected Order Audit Trail Completeness
  it('48. preserves all rejection reasons in PaperTradeLedger without losing telemetry', () => {
    const broker = new PaperBroker({ initialCash: 10_000_000, skipSessionValidation: true });

    engine.execute({
      recommendation: validBuyRec,
      marketData: { ...validMarketData, price: -500 }, // Invalid price
      broker,
      now: baseNow,
    });

    const ledger = engine.getLedger();
    const entry = ledger.getLatestEntry();
    expect(entry).toBeDefined();
    expect(entry?.finalOrderStatus).toBe('REJECTED');
    expect(entry?.rejectionReason).toContain('Market data integrity check failed');
    expect(entry?.validatorCode).toBe('INVALID_PRICE');
  });
});
