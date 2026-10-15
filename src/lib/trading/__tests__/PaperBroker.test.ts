import { describe, it, expect, beforeEach } from 'vitest';
import { PaperBroker } from '../paper/PaperBroker.ts';
import type { TradingMarketData } from '../types/trading.ts';

describe('Phase 18.3 — PaperBroker Execution Engine', () => {
  let broker: PaperBroker;

  beforeEach(() => {
    broker = new PaperBroker({
      initialCash: 100_000_000, // 100M VND
      skipSessionValidation: true,
    });
  });

  describe('1. Board Lot & Order Validation', () => {
    it('rejects order with non-board lot quantities (must be multiples of 100)', async () => {
      broker.processMarketData({ symbol: 'HPG', price: 28_000 });

      // Quantity < 100
      const res1 = await broker.submitOrder({
        symbol: 'HPG',
        side: 'BUY',
        type: 'MARKET',
        quantity: 50,
      });
      expect(res1.success).toBe(false);
      expect(res1.error?.code).toBe('INVALID_QUANTITY');

      // Quantity not multiple of 100
      const res2 = await broker.submitOrder({
        symbol: 'HPG',
        side: 'BUY',
        type: 'MARKET',
        quantity: 150,
      });
      expect(res2.success).toBe(false);
      expect(res2.error?.code).toBe('INVALID_QUANTITY');

      // Non-integer quantity
      const res3 = await broker.submitOrder({
        symbol: 'HPG',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100.5,
      });
      expect(res3.success).toBe(false);
      expect(res3.error?.code).toBe('INVALID_QUANTITY');

      // Negative quantity
      const res4 = await broker.submitOrder({
        symbol: 'HPG',
        side: 'BUY',
        type: 'MARKET',
        quantity: -100,
      });
      expect(res4.success).toBe(false);
      expect(res4.error?.code).toBe('INVALID_QUANTITY');
    });

    it('rejects invalid or empty stock ticker symbols', async () => {
      const res1 = await broker.submitOrder({
        symbol: '',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      });
      expect(res1.success).toBe(false);
      expect(res1.error?.code).toBe('INVALID_SYMBOL');

      const res2 = await broker.submitOrder({
        symbol: 'TOOLONGTICKER',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      });
      expect(res2.success).toBe(false);
      expect(res2.error?.code).toBe('INVALID_SYMBOL');
    });

    it('enforces market session check when skipSessionValidation is false', async () => {
      const strictBroker = new PaperBroker({
        initialCash: 100_000_000,
        skipSessionValidation: false,
      });

      // Sunday 10:00 AM UTC (5:00 PM ICT) -> Market is definitely closed
      const sundayTimestamp = new Date('2026-09-13T10:00:00Z').getTime();
      strictBroker.processMarketData({
        symbol: 'FPT',
        price: 110_000,
        timestamp: sundayTimestamp,
      });

      const res = await strictBroker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 110_000,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('MARKET_CLOSED');
    });
  });

  describe('2. Price Limits (Ceiling and Floor)', () => {
    it('rejects limit order exceeding exchange daily ceiling price', async () => {
      broker.processMarketData({
        symbol: 'TCB',
        price: 30_000,
        ceilingPrice: 32_100,
        floorPrice: 27_900,
      });

      const res = await broker.submitOrder({
        symbol: 'TCB',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 33_000, // > 32,100
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('PRICE_LIMIT_VIOLATION');
    });

    it('rejects limit order falling below exchange daily floor price', async () => {
      broker.processMarketData({
        symbol: 'TCB',
        price: 30_000,
        ceilingPrice: 32_100,
        floorPrice: 27_900,
      });

      const res = await broker.submitOrder({
        symbol: 'TCB',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 26_000, // < 27,900
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('PRICE_LIMIT_VIOLATION');
    });
  });

  describe('3. Market Order Execution & Cost Modeling', () => {
    it('executes a MARKET BUY with slippage (0.10%) and fee (0.15%)', async () => {
      const marketPrice = 100_000;
      broker.processMarketData({ symbol: 'FPT', price: marketPrice });

      const res = await broker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      });

      expect(res.success).toBe(true);
      expect(res.order.status).toBe('FILLED');

      // Slippage: 100,000 * (1 + 0.0010) = 100,100
      const expectedFillPrice = 100_100;
      expect(res.order.averageFillPrice).toBe(expectedFillPrice);

      // Trade value: 100 * 100,100 = 10,010,000
      // Buy fee: 10,010,000 * 0.0015 = 15,015
      // Total cost: 10,025,015
      const expectedTotalCost = 100 * expectedFillPrice * (1 + 0.0015);
      const account = await broker.getAccount();
      expect(account.cash).toBeCloseTo(100_000_000 - expectedTotalCost, 2);

      const pos = await broker.getPosition('FPT');
      expect(pos).not.toBeNull();
      expect(pos?.quantity).toBe(100);
      expect(pos?.averageCost).toBeCloseTo(expectedTotalCost / 100, 2);

      const txns = await broker.getTransactions();
      expect(txns.length).toBe(1);
      expect(txns[0].side).toBe('BUY');
      expect(txns[0].tax).toBe(0);
      expect(txns[0].fee).toBeCloseTo(15_015, 2);
    });

    it('executes a MARKET SELL with slippage (0.10%), fee (0.15%), and tax (0.10%)', async () => {
      // Seed a position of 200 shares @ 50,000 VND
      broker.seedPosition({ symbol: 'HPG', quantity: 200, averageCost: 50_000 });
      const marketPrice = 60_000;
      broker.processMarketData({ symbol: 'HPG', price: marketPrice });

      const initialCash = (await broker.getAccount()).cash;

      const res = await broker.submitOrder({
        symbol: 'HPG',
        side: 'SELL',
        type: 'MARKET',
        quantity: 100,
      });

      expect(res.success).toBe(true);
      expect(res.order.status).toBe('FILLED');

      // Slippage: 60,000 * (1 - 0.0010) = 59,940
      const expectedFillPrice = 59_940;
      expect(res.order.averageFillPrice).toBe(expectedFillPrice);

      // Gross value: 100 * 59,940 = 5,994,000
      // Fee: 5,994,000 * 0.0015 = 8,991
      // Tax: 5,994,000 * 0.0010 = 5,994
      // Net proceeds: 5,994,000 - 8,991 - 5,994 = 5,979,015
      const gross = 100 * expectedFillPrice;
      const fee = gross * 0.0015;
      const tax = gross * 0.0010;
      const netProceeds = gross - fee - tax;

      const account = await broker.getAccount();
      expect(account.cash).toBeCloseTo(initialCash + netProceeds, 2);

      // Cost basis of 100 shares = 100 * 50,000 = 5,000,000
      // Realized PnL = 5,979,015 - 5,000,000 = 979,015
      expect(account.realizedPnL).toBeCloseTo(netProceeds - 5_000_000, 2);

      // Remaining position average cost must NOT change
      const remainingPos = await broker.getPosition('HPG');
      expect(remainingPos?.quantity).toBe(100);
      expect(remainingPos?.averageCost).toBe(50_000);
    });
  });

  describe('4. Strict Prohibition of Short Selling', () => {
    it('rejects SELL order if position does not exist', async () => {
      broker.processMarketData({ symbol: 'VCB', price: 90_000 });

      const res = await broker.submitOrder({
        symbol: 'VCB',
        side: 'SELL',
        type: 'MARKET',
        quantity: 100,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INSUFFICIENT_POSITION');
    });

    it('rejects SELL order if quantity exceeds owned shares', async () => {
      broker.seedPosition({ symbol: 'VCB', quantity: 100, averageCost: 90_000 });
      broker.processMarketData({ symbol: 'VCB', price: 90_000 });

      const res = await broker.submitOrder({
        symbol: 'VCB',
        side: 'SELL',
        type: 'MARKET',
        quantity: 200, // owns only 100
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INSUFFICIENT_POSITION');
    });
  });

  describe('5. Limit Order Lifecycle & Market Tick Matching', () => {
    it('holds limit BUY in SUBMITTED state until market tick reaches limit price', async () => {
      broker.processMarketData({ symbol: 'MWG', price: 50_000 });

      // Limit BUY at 48,000 (below market 50,000)
      const res = await broker.submitOrder({
        symbol: 'MWG',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 48_000,
      });

      expect(res.success).toBe(true);
      expect(res.order.status).toBe('SUBMITTED');

      let openOrders = await broker.getOpenOrders('MWG');
      expect(openOrders.length).toBe(1);

      // Market price drops to 49,000 -> still does not trigger fill
      broker.processMarketData({ symbol: 'MWG', price: 49_000 });
      openOrders = await broker.getOpenOrders('MWG');
      expect(openOrders.length).toBe(1);

      // Market price drops to 48,000 -> triggers fill!
      broker.processMarketData({ symbol: 'MWG', price: 48_000 });
      openOrders = await broker.getOpenOrders('MWG');
      expect(openOrders.length).toBe(0);

      const order = await broker.getOrder(res.order.id);
      expect(order?.status).toBe('FILLED');
      expect(order?.averageFillPrice).toBe(48_000);

      const pos = await broker.getPosition('MWG');
      expect(pos?.quantity).toBe(100);
    });

    it('holds limit SELL in SUBMITTED state until market tick reaches limit price', async () => {
      broker.seedPosition({ symbol: 'MWG', quantity: 100, averageCost: 45_000 });
      broker.processMarketData({ symbol: 'MWG', price: 50_000 });

      // Limit SELL at 55,000 (above market 50,000)
      const res = await broker.submitOrder({
        symbol: 'MWG',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 55_000,
      });

      expect(res.success).toBe(true);
      expect(res.order.status).toBe('SUBMITTED');

      // Market rises to 52,000 -> not filled
      broker.processMarketData({ symbol: 'MWG', price: 52_000 });
      expect((await broker.getOpenOrders('MWG')).length).toBe(1);

      // Market rises to 55,000 -> filled!
      broker.processMarketData({ symbol: 'MWG', price: 55_000 });
      expect((await broker.getOpenOrders('MWG')).length).toBe(0);

      const order = await broker.getOrder(res.order.id);
      expect(order?.status).toBe('FILLED');
      expect(order?.averageFillPrice).toBe(55_000);
    });
  });

  describe('6. Double-Spend & Cash / Share Reservation Protection', () => {
    it('prevents double-spending cash across multiple pending limit buy orders', async () => {
      // Seed account with 10M VND
      broker.seedCash(10_000_000);
      broker.processMarketData({ symbol: 'FPT', price: 100_000 });

      // Order A needs ~8M VND (80 shares not allowed, so 80 * 100k -> 100 shares = 10M, let's use 80,000 price * 100 shares = 8M)
      const resA = await broker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 80_000, // 8M + 12,000 fee = 8,012,000
      });
      expect(resA.success).toBe(true);
      expect(resA.order.status).toBe('SUBMITTED');

      const account = await broker.getAccount();
      expect(account.reservedCash).toBeCloseTo(8_012_000, 2);
      expect(account.availableCash).toBeCloseTo(10_000_000 - 8_012_000, 2);

      // Order B also needs 8M VND, but available cash is now ~1.98M VND
      const resB = await broker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 80_000,
      });

      expect(resB.success).toBe(false);
      expect(resB.error?.code).toBe('INSUFFICIENT_CASH');

      // Cancelling Order A releases the reserved cash
      await broker.cancelOrder(resA.order.id);
      const accountAfterCancel = await broker.getAccount();
      expect(accountAfterCancel.reservedCash).toBe(0);
      expect(accountAfterCancel.availableCash).toBe(10_000_000);

      // Now Order B can be submitted successfully
      const resBRetry = await broker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 80_000,
      });
      expect(resBRetry.success).toBe(true);
      expect(resBRetry.order.status).toBe('SUBMITTED');
    });

    it('prevents double-selling shares across multiple pending limit sell orders', async () => {
      broker.seedPosition({ symbol: 'HPG', quantity: 200, averageCost: 25_000 });
      broker.processMarketData({ symbol: 'HPG', price: 25_000 });

      // Order A reserves 200 shares
      const resA = await broker.submitOrder({
        symbol: 'HPG',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 200,
        limitPrice: 30_000,
      });
      expect(resA.success).toBe(true);

      // Order B tries to sell 100 shares -> rejected because all 200 are reserved
      const resB = await broker.submitOrder({
        symbol: 'HPG',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 32_000,
      });
      expect(resB.success).toBe(false);
      expect(resB.error?.code).toBe('INSUFFICIENT_POSITION');

      // Cancelling Order A releases the reserved shares
      await broker.cancelOrder(resA.order.id);
      const pos = await broker.getPosition('HPG');
      expect(pos?.availableQuantity).toBe(200);

      // Now Order B succeeds
      const resBRetry = await broker.submitOrder({
        symbol: 'HPG',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 32_000,
      });
      expect(resBRetry.success).toBe(true);
    });
  });

  describe('7. Order Idempotency & Lifecycle Safety', () => {
    it('rejects duplicate order submission with same order ID', async () => {
      broker.processMarketData({ symbol: 'VCB', price: 90_000 });

      const orderRequest = {
        id: 'CUSTOM_ORD_123',
        symbol: 'VCB',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        quantity: 100,
        limitPrice: 80_000,
      };

      const res1 = await broker.submitOrder(orderRequest);
      expect(res1.success).toBe(true);

      const res2 = await broker.submitOrder(orderRequest);
      expect(res2.success).toBe(false);
      expect(res2.error?.code).toBe('DUPLICATE_ORDER');
    });

    it('rejects cancellation of an already filled order', async () => {
      broker.processMarketData({ symbol: 'VCB', price: 90_000 });

      const res = await broker.submitOrder({
        symbol: 'VCB',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      });
      expect(res.order.status).toBe('FILLED');

      const cancelRes = await broker.cancelOrder(res.order.id);
      expect(cancelRes.success).toBe(false);
      expect(cancelRes.error?.code).toBe('ORDER_ALREADY_FILLED');
    });
  });

  describe('8. Emergency Stop & Master Switches', () => {
    it('rejects new orders and cancels open orders without liquidating positions when emergency stop is activated', async () => {
      broker.seedPosition({ symbol: 'FPT', quantity: 100, averageCost: 100_000 });
      broker.processMarketData({ symbol: 'FPT', price: 100_000 });

      // Submit an open limit order
      const openOrderRes = await broker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 90_000,
      });
      expect(openOrderRes.order.status).toBe('SUBMITTED');

      // Trigger Emergency Stop
      broker.setEmergencyStop(true);
      expect(broker.isEmergencyStopActive()).toBe(true);

      // Open orders must be cancelled
      const cancelledOrder = await broker.getOrder(openOrderRes.order.id);
      expect(cancelledOrder?.status).toBe('CANCELLED');

      // Existing positions must remain intact (NO forced liquidation)
      const pos = await broker.getPosition('FPT');
      expect(pos?.quantity).toBe(100);

      // New orders must be rejected
      const newOrderRes = await broker.submitOrder({
        symbol: 'FPT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      });
      expect(newOrderRes.success).toBe(false);
      expect(newOrderRes.error?.code).toBe('EMERGENCY_STOP');
    });

    it('rejects new orders when tradingEnabled is false', async () => {
      broker.processMarketData({ symbol: 'HPG', price: 30_000 });
      broker.setTradingEnabled(false);

      const res = await broker.submitOrder({
        symbol: 'HPG',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('TRADING_DISABLED');
    });
  });

  describe('9. Multi-Tranche Cost Basis (Weighted Average Cost)', () => {
    it('calculates weighted average cost across multiple BUY executions correctly', async () => {
      // 1st BUY: 100 shares @ 50,000 VND
      broker.processMarketData({ symbol: 'SSI', price: 50_000 });
      await broker.submitOrder({
        symbol: 'SSI',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 50_000,
      });

      // Cost 1 = 100 * 50,000 + 100 * 50,000 * 0.0015 = 5,000,000 + 7,500 = 5,007,500
      let pos = await broker.getPosition('SSI');
      expect(pos?.quantity).toBe(100);
      expect(pos?.averageCost).toBeCloseTo(50_075, 2);

      // 2nd BUY: 100 shares @ 60,000 VND
      broker.processMarketData({ symbol: 'SSI', price: 60_000 });
      await broker.submitOrder({
        symbol: 'SSI',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        limitPrice: 60_000,
      });

      // Cost 2 = 100 * 60,000 + 100 * 60,000 * 0.0015 = 6,000,000 + 9,000 = 6,009,000
      // Total cost = 5,007,500 + 6,009,000 = 11,016,500
      // New average cost = 11,016,500 / 200 = 55,082.50
      pos = await broker.getPosition('SSI');
      expect(pos?.quantity).toBe(200);
      expect(pos?.averageCost).toBeCloseTo(55_082.5, 2);
    });
  });
});
