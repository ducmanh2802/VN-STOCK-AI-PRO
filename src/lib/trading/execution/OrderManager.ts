/**
 * PHASE 18.3 — ORDER MANAGER
 * ===========================
 * Order orchestration and lifecycle management layer.
 * Bridges RiskManager decisions to execution via BrokerAdapter.
 *
 * Architecture Position:
 * RecommendationEngine -> RiskManager -> PositionSizer -> OrderManager -> BrokerAdapter
 */

import type {
  Order,
  OrderSide,
  OrderType,
  TradeDecision,
  ValidationErrorCode,
} from '../types/trading.ts';
import type {
  BrokerAccount,
  BrokerAdapter,
  BrokerPosition,
  BrokerTransaction,
  CancelOrderResult,
  OrderResult,
  SubmitOrderRequest,
} from './BrokerAdapter.ts';

export interface OrderManagerOptions {
  broker: BrokerAdapter;
}

export class OrderManager {
  private broker: BrokerAdapter;
  private managedOrders: Map<string, Order> = new Map();

  constructor(options: OrderManagerOptions) {
    this.broker = options.broker;
  }

  /**
   * Get the underlying broker adapter instance
   */
  getBroker(): BrokerAdapter {
    return this.broker;
  }

  /**
   * Submits a trade decision produced by RiskManager (or Strategy/PositionSizer).
   */
  async submitDecision(
    decision: TradeDecision,
    options: {
      orderType?: OrderType;
      limitPrice?: number;
      clientOrderId?: string;
    } = {}
  ): Promise<OrderResult> {
    // 1. Verify decision approval
    if (decision.decision !== 'APPROVED_TRADE') {
      const code: ValidationErrorCode = decision.rejectionCode || 'INVALID_SIGNAL';
      const message = decision.rejectionReason || 'Trade decision was not approved by RiskManager';

      const unapprovedOrder: Order = {
        id: `REJ_${Date.now()}`,
        clientOrderId: options.clientOrderId ?? null,
        symbol: decision.symbol,
        side: (decision.signal === 'BUY' ? 'BUY' : 'SELL'),
        type: options.orderType ?? 'MARKET',
        quantity: decision.quantity,
        limitPrice: options.limitPrice ?? null,
        status: 'REJECTED',
        createdAt: new Date().toISOString(),
        rejectedReason: message,
        rejectionCode: code,
      };

      return {
        success: false,
        order: unapprovedOrder,
        error: { code, message },
      };
    }

    // 2. Validate signal mapping
    if (decision.signal !== 'BUY' && decision.signal !== 'SELL') {
      const code: ValidationErrorCode = 'INVALID_SIGNAL';
      const message = `Cannot submit order for signal type '${decision.signal}'`;

      const rejectedOrder: Order = {
        id: `REJ_${Date.now()}`,
        clientOrderId: options.clientOrderId ?? null,
        symbol: decision.symbol,
        side: 'BUY',
        type: options.orderType ?? 'MARKET',
        quantity: decision.quantity,
        limitPrice: options.limitPrice ?? null,
        status: 'REJECTED',
        createdAt: new Date().toISOString(),
        rejectedReason: message,
        rejectionCode: code,
      };

      return {
        success: false,
        order: rejectedOrder,
        error: { code, message },
      };
    }

    const side: OrderSide = decision.signal;
    const type: OrderType = options.orderType ?? (options.limitPrice != null ? 'LIMIT' : 'MARKET');
    const limitPrice = options.limitPrice ?? (type === 'LIMIT' ? decision.entryPrice : null);

    const request: SubmitOrderRequest = {
      clientOrderId: options.clientOrderId,
      symbol: decision.symbol,
      side,
      type,
      quantity: decision.quantity,
      limitPrice,
    };

    return this.submitOrder(request);
  }

  /**
   * Submits a direct order request to the broker.
   */
  async submitOrder(request: SubmitOrderRequest | Order): Promise<OrderResult> {
    const result = await this.broker.submitOrder(request);
    this.managedOrders.set(result.order.id, result.order);
    return result;
  }

  /**
   * Cancels an order through the broker.
   */
  async cancelOrder(orderId: string): Promise<CancelOrderResult> {
    const result = await this.broker.cancelOrder(orderId);
    if (result.order) {
      this.managedOrders.set(orderId, result.order);
    }
    return result;
  }

  /**
   * Cancels all currently open orders, optionally filtered by symbol.
   */
  async cancelAllOpenOrders(symbol?: string): Promise<CancelOrderResult[]> {
    const openOrders = await this.broker.getOpenOrders(symbol);
    const results: CancelOrderResult[] = [];

    for (const order of openOrders) {
      const res = await this.broker.cancelOrder(order.id);
      results.push(res);
      if (res.order) {
        this.managedOrders.set(res.order.id, res.order);
      }
    }

    return results;
  }

  /**
   * Retrieves an order by ID from broker or local cache.
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const brokerOrder = await this.broker.getOrder(orderId);
    if (brokerOrder) {
      this.managedOrders.set(orderId, brokerOrder);
      return brokerOrder;
    }
    return this.managedOrders.get(orderId) ?? null;
  }

  /**
   * Retrieves all open orders.
   */
  async getOpenOrders(symbol?: string): Promise<Order[]> {
    return this.broker.getOpenOrders(symbol);
  }

  /**
   * Retrieves all orders known to the broker or manager.
   */
  async getAllOrders(symbol?: string): Promise<Order[]> {
    if (this.broker.getAllOrders) {
      return this.broker.getAllOrders(symbol);
    }
    const open = await this.broker.getOpenOrders(symbol);
    const combined = new Map<string, Order>();
    for (const o of this.managedOrders.values()) {
      if (!symbol || o.symbol === symbol.toUpperCase()) {
        combined.set(o.id, o);
      }
    }
    for (const o of open) {
      combined.set(o.id, o);
    }
    return Array.from(combined.values());
  }

  /**
   * Gets position for a specific symbol.
   */
  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    return this.broker.getPosition(symbol);
  }

  /**
   * Gets all active positions.
   */
  async getPositions(): Promise<BrokerPosition[]> {
    return this.broker.getPositions();
  }

  /**
   * Gets account status and balances.
   */
  async getAccount(): Promise<BrokerAccount> {
    return this.broker.getAccount();
  }

  /**
   * Gets execution transactions.
   */
  async getTransactions(): Promise<BrokerTransaction[]> {
    if (this.broker.getTransactions) {
      return this.broker.getTransactions();
    }
    return [];
  }
}
