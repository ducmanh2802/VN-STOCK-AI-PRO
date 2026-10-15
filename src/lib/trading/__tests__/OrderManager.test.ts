import { describe, it, expect, beforeEach } from 'vitest';
import { PaperBroker } from '../paper/PaperBroker.ts';
import { OrderManager } from '../execution/OrderManager.ts';
import type { TradeDecision } from '../types/trading.ts';

describe('Phase 18.3 — OrderManager', () => {
  let broker: PaperBroker;
  let orderManager: OrderManager;

  beforeEach(() => {
    broker = new PaperBroker({
      initialCash: 100_000_000,
      skipSessionValidation: true,
    });
    orderManager = new OrderManager({ broker });
  });

  it('submits an approved trade decision as a MARKET order', async () => {
    // Provide market quote for FPT
    broker.processMarketData({
      symbol: 'FPT',
      price: 100_000,
      timestamp: Date.now(),
    });

    const approvedDecision: TradeDecision = {
      decision: 'APPROVED_TRADE',
      symbol: 'FPT',
      signal: 'BUY',
      quantity: 200,
      entryPrice: 100_000,
      stopLossPrice: 95_000,
      targetPrice: 112_000,
      riskRewardRatio: 2.4,
      totalCapitalRequirement: 20_050_000,
      timestamp: new Date().toISOString(),
    };

    const result = await orderManager.submitDecision(approvedDecision);
    expect(result.success).toBe(true);
    expect(result.order.status).toBe('FILLED');
    expect(result.order.symbol).toBe('FPT');
    expect(result.order.side).toBe('BUY');
    expect(result.order.quantity).toBe(200);

    const position = await orderManager.getPosition('FPT');
    expect(position).not.toBeNull();
    expect(position?.quantity).toBe(200);
  });

  it('submits an approved trade decision as a LIMIT order', async () => {
    broker.processMarketData({
      symbol: 'HPG',
      price: 30_000,
      timestamp: Date.now(),
    });

    const approvedDecision: TradeDecision = {
      decision: 'APPROVED_TRADE',
      symbol: 'HPG',
      signal: 'BUY',
      quantity: 500,
      entryPrice: 28_000, // lower than market price 30,000 -> remains open
      stopLossPrice: 26_000,
      targetPrice: 33_000,
      riskRewardRatio: 2.5,
      totalCapitalRequirement: 14_050_000,
      timestamp: new Date().toISOString(),
    };

    const result = await orderManager.submitDecision(approvedDecision, {
      orderType: 'LIMIT',
      limitPrice: 28_000,
    });

    expect(result.success).toBe(true);
    expect(result.order.status).toBe('SUBMITTED');
    expect(result.order.type).toBe('LIMIT');
    expect(result.order.limitPrice).toBe(28_000);

    const openOrders = await orderManager.getOpenOrders('HPG');
    expect(openOrders.length).toBe(1);
    expect(openOrders[0].id).toBe(result.order.id);
  });

  it('rejects an unapproved trade decision early without sending to broker', async () => {
    const unapprovedDecision: TradeDecision = {
      decision: 'NO_TRADE',
      symbol: 'VCB',
      signal: 'NO_TRADE',
      quantity: 100,
      entryPrice: 90_000,
      stopLossPrice: 85_000,
      targetPrice: 100_000,
      riskRewardRatio: 2.0,
      totalCapitalRequirement: 9_000_000,
      rejectionCode: 'INSUFFICIENT_CASH',
      rejectionReason: 'Not enough cash for position',
      timestamp: new Date().toISOString(),
    };

    const result = await orderManager.submitDecision(unapprovedDecision);
    expect(result.success).toBe(false);
    expect(result.order.status).toBe('REJECTED');
    expect(result.error?.code).toBe('INSUFFICIENT_CASH');
  });

  it('cancels an open order by ID and cancels all open orders by symbol', async () => {
    broker.processMarketData({
      symbol: 'MWG',
      price: 60_000,
      timestamp: Date.now(),
    });

    const res1 = await orderManager.submitOrder({
      symbol: 'MWG',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 100,
      limitPrice: 55_000,
    });
    const res2 = await orderManager.submitOrder({
      symbol: 'MWG',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 200,
      limitPrice: 54_000,
    });

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    let open = await orderManager.getOpenOrders('MWG');
    expect(open.length).toBe(2);

    // Cancel first order
    const cancelRes = await orderManager.cancelOrder(res1.order.id);
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.order?.status).toBe('CANCELLED');

    open = await orderManager.getOpenOrders('MWG');
    expect(open.length).toBe(1);
    expect(open[0].id).toBe(res2.order.id);

    // Cancel all remaining open orders for MWG
    const cancelAll = await orderManager.cancelAllOpenOrders('MWG');
    expect(cancelAll.length).toBe(1);
    expect(cancelAll[0].success).toBe(true);

    open = await orderManager.getOpenOrders('MWG');
    expect(open.length).toBe(0);
  });
});
