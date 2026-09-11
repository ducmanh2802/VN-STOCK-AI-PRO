/**
 * PHASE 18.3 — PAPER BROKER IMPLEMENTATION
 * ========================================
 * Deterministic, offline simulated execution engine for Vietnamese stock trading.
 *
 * Implements:
 * - Strict Vietnamese board lot rules (100 shares, multiples of 100).
 * - No short selling (positions strictly non-negative).
 * - Atomic cash and position state transitions.
 * - Double-spend protection via pre-trade cash/share reservations.
 * - Exact cost modeling (0.15% buy fee, 0.15% sell fee, 0.10% sell tax, 0.10% slippage).
 * - Deterministic market and limit order matching against supplied market quotes.
 * - Vietnamese stock exchange market session hours validation (ATO, continuous, ATC).
 * - Safety guards: Emergency Stop and Trading Enabled master switches.
 * - Comprehensive transaction ledger and event telemetry.
 */

import type {
  Order,
  OrderSide,
  OrderType,
  TradingCostConfig,
  TradingMarketData,
  ValidationErrorCode,
} from '../types/trading.ts';
import { DEFAULT_TRADING_COST_CONFIG } from '../types/trading.ts';
import { TradingDataValidator } from '../validation/TradingDataValidator.ts';
import type {
  BrokerAccount,
  BrokerAdapter,
  BrokerPosition,
  BrokerTransaction,
  CancelOrderResult,
  OrderResult,
  SubmitOrderRequest,
} from '../execution/BrokerAdapter.ts';
import type {
  PaperBrokerConfig,
  PaperBrokerEvent,
  PaperBrokerEventListener,
  SimulationMarketTick,
} from './PaperBrokerTypes.ts';

export class PaperBroker implements BrokerAdapter {
  readonly name = 'PaperBroker';
  readonly isSimulation = true;

  private accountId: string;
  private currency: string;
  private cash: number;
  private reservedCash: number;
  private realizedPnL: number;
  private tradingCosts: TradingCostConfig;
  private tradingEnabled: boolean;
  private emergencyStop: boolean;
  private skipSessionValidation: boolean;
  private lotSize: number;

  private positions: Map<string, BrokerPosition> = new Map();
  private orders: Map<string, Order> = new Map();
  private transactions: BrokerTransaction[] = [];
  private latestQuotes: Map<string, TradingMarketData> = new Map();
  private listeners: Set<PaperBrokerEventListener> = new Set();

  constructor(config: PaperBrokerConfig = {}) {
    this.accountId = config.accountId ?? 'PAPER_ACCOUNT_1';
    this.currency = config.currency ?? 'VND';
    this.cash = config.initialCash ?? 100_000_000; // 100M VND default
    this.reservedCash = 0;
    this.realizedPnL = 0;
    this.tradingEnabled = config.tradingEnabled ?? true;
    this.emergencyStop = config.emergencyStop ?? false;
    this.skipSessionValidation = config.skipSessionValidation ?? false;
    this.lotSize = config.lotSize ?? 100;

    this.tradingCosts = {
      buyFeeRate: config.tradingCosts?.buyFeeRate ?? DEFAULT_TRADING_COST_CONFIG.buyFeeRate,
      sellFeeRate: config.tradingCosts?.sellFeeRate ?? DEFAULT_TRADING_COST_CONFIG.sellFeeRate,
      sellTaxRate: config.tradingCosts?.sellTaxRate ?? DEFAULT_TRADING_COST_CONFIG.sellTaxRate,
      slippageRate: config.tradingCosts?.slippageRate ?? DEFAULT_TRADING_COST_CONFIG.slippageRate,
    };
  }

  // ==========================================
  // EVENT LISTENER SUBSCRIPTION
  // ==========================================

  addEventListener(listener: PaperBrokerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: PaperBrokerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in PaperBroker listener:', err);
      }
    }
  }

  // ==========================================
  // MARKET DATA INGESTION & MATCHING
  // ==========================================

  /**
   * Feed real market quotes or simulation ticks into the Paper Broker.
   * Updates position mark-to-market prices and triggers limit order evaluations.
   */
  processMarketData(tick: SimulationMarketTick): void {
    if (!tick || !tick.symbol || typeof tick.price !== 'number' || tick.price <= 0) {
      return;
    }

    const symbol = tick.symbol.toUpperCase();
    this.latestQuotes.set(symbol, {
      ...tick,
      symbol,
    });

    // Update mark-to-market metrics on open positions
    const pos = this.positions.get(symbol);
    if (pos) {
      pos.currentPrice = tick.price;
      pos.marketValue = pos.quantity * tick.price;
      pos.unrealizedPnL = pos.marketValue - (pos.quantity * pos.averageCost);
      pos.unrealizedPnLPercent = pos.averageCost > 0
        ? (pos.unrealizedPnL / (pos.quantity * pos.averageCost)) * 100
        : 0;
      pos.updatedAt = new Date().toISOString();
    }

    // Evaluate open pending LIMIT orders for this symbol
    this.evaluateOpenLimitOrders(symbol, tick.price);
  }

  private evaluateOpenLimitOrders(symbol: string, currentMarketPrice: number): void {
    for (const order of this.orders.values()) {
      if (order.status !== 'SUBMITTED' || order.symbol !== symbol || order.type !== 'LIMIT') {
        continue;
      }

      if (order.limitPrice == null) {
        continue;
      }

      if (order.side === 'BUY' && currentMarketPrice <= order.limitPrice) {
        this.executeFill(order, order.limitPrice);
      } else if (order.side === 'SELL' && currentMarketPrice >= order.limitPrice) {
        this.executeFill(order, order.limitPrice);
      }
    }
  }

  // ==========================================
  // ORDER SUBMISSION LIFECYCLE
  // ==========================================

  submitOrderSync(request: SubmitOrderRequest | Order): OrderResult {
    const timestamp = new Date().toISOString();
    const orderId = request.id || `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const symbol = request.symbol ? request.symbol.trim().toUpperCase() : '';

    // 1. Idempotency Check: prevent duplicate submission
    const existingOrder = this.orders.get(orderId);
    if (existingOrder) {
      if (existingOrder.status === 'FILLED') {
        return {
          success: false,
          order: existingOrder,
          error: {
            code: 'ORDER_ALREADY_FILLED',
            message: `Order ${orderId} has already been filled`,
          },
        };
      }
      if (existingOrder.status === 'CANCELLED') {
        return {
          success: false,
          order: existingOrder,
          error: {
            code: 'ORDER_ALREADY_CANCELLED',
            message: `Order ${orderId} has already been cancelled`,
          },
        };
      }
      return {
        success: false,
        order: existingOrder,
        error: {
          code: 'DUPLICATE_ORDER',
          message: `Order ${orderId} already exists`,
        },
      };
    }

    // Create Initial Order Object in 'NEW' State
    const order: Order = {
      id: orderId,
      clientOrderId: request.clientOrderId ?? null,
      symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      limitPrice: request.limitPrice ?? null,
      status: 'NEW',
      createdAt: (request as Order).createdAt || timestamp,
      submittedAt: null,
      filledAt: null,
      averageFillPrice: null,
      filledQuantity: null,
      rejectedReason: null,
      rejectionCode: null,
      cancelledAt: null,
      expiresAt: request.expiresAt ?? null,
      reservedCashAmount: 0,
      marketDataSnapshotId: request.marketDataSnapshotId,
      recommendationId: request.recommendationId,
      strategyVersion: request.strategyVersion,
      riskPolicyVersion: request.riskPolicyVersion,
    };

    // 2. Emergency Stop Guard
    if (this.emergencyStop) {
      return this.rejectOrder(order, 'EMERGENCY_STOP', 'Trading halted due to Emergency Stop');
    }

    // 3. Trading Enabled Switch
    if (!this.tradingEnabled) {
      return this.rejectOrder(order, 'TRADING_DISABLED', 'Trading is currently disabled');
    }

    // 4. Symbol Validation
    if (!symbol || symbol.length < 3 || symbol.length > 5) {
      return this.rejectOrder(order, 'INVALID_SYMBOL', `Invalid stock ticker symbol: '${symbol}'`);
    }

    // 5. Order Side & Type Validation
    if (order.side !== 'BUY' && order.side !== 'SELL') {
      return this.rejectOrder(order, 'INVALID_ORDER', `Unsupported order side: '${order.side}'`);
    }
    if (order.type !== 'MARKET' && order.type !== 'LIMIT') {
      return this.rejectOrder(order, 'INVALID_ORDER', `Unsupported order type: '${order.type}'`);
    }

    // 6. Quantity Validation: Strict Vietnamese Board Lot (100 shares)
    if (
      !Number.isInteger(order.quantity) ||
      order.quantity <= 0 ||
      order.quantity < this.lotSize ||
      order.quantity % this.lotSize !== 0
    ) {
      return this.rejectOrder(
        order,
        'INVALID_QUANTITY',
        `Order quantity must be an integer multiple of board lot ${this.lotSize} (minimum ${this.lotSize}). Received: ${order.quantity}`
      );
    }

    // 7. Market Session Validation (unless explicitly skipped for simulation/testing)
    if (!this.skipSessionValidation) {
      const quoteTimestamp = this.latestQuotes.get(symbol)?.timestamp ?? Date.now();
      const session = TradingDataValidator.checkVnMarketSession(quoteTimestamp);
      if (!session.isOpen) {
        return this.rejectOrder(
          order,
          'MARKET_CLOSED',
          `Vietnamese stock exchange is currently closed (${session.sessionName})`
        );
      }
    }

    // 8. Retrieve Latest Market Data
    const quote = this.latestQuotes.get(symbol);

    // 9. Price Limit Validation (Floor / Ceiling check)
    if (quote) {
      if (order.type === 'LIMIT') {
        if (order.limitPrice == null || !Number.isFinite(order.limitPrice) || order.limitPrice <= 0) {
          return this.rejectOrder(order, 'INVALID_PRICE', 'LIMIT order requires a positive finite limit price');
        }
        if (quote.ceilingPrice != null && order.limitPrice > quote.ceilingPrice) {
          return this.rejectOrder(
            order,
            'PRICE_LIMIT_VIOLATION',
            `Limit price ${order.limitPrice} exceeds exchange ceiling price ${quote.ceilingPrice}`
          );
        }
        if (quote.floorPrice != null && order.limitPrice < quote.floorPrice) {
          return this.rejectOrder(
            order,
            'PRICE_LIMIT_VIOLATION',
            `Limit price ${order.limitPrice} falls below exchange floor price ${quote.floorPrice}`
          );
        }
      } else if (order.type === 'MARKET') {
        if (quote.price == null || !Number.isFinite(quote.price) || quote.price <= 0) {
          return this.rejectOrder(order, 'DATA_UNAVAILABLE', 'Market price unavailable for market order');
        }
        if (quote.ceilingPrice != null && quote.price > quote.ceilingPrice) {
          return this.rejectOrder(
            order,
            'PRICE_LIMIT_VIOLATION',
            `Current price ${quote.price} exceeds ceiling price ${quote.ceilingPrice}`
          );
        }
        if (quote.floorPrice != null && quote.price < quote.floorPrice) {
          return this.rejectOrder(
            order,
            'PRICE_LIMIT_VIOLATION',
            `Current price ${quote.price} is below floor price ${quote.floorPrice}`
          );
        }
      }
    } else if (order.type === 'MARKET') {
      // Market order without any quote fails closed immediately
      return this.rejectOrder(order, 'DATA_UNAVAILABLE', `No market data available to price MARKET order for ${symbol}`);
    } else if (order.type === 'LIMIT') {
      if (order.limitPrice == null || !Number.isFinite(order.limitPrice) || order.limitPrice <= 0) {
        return this.rejectOrder(order, 'INVALID_PRICE', 'LIMIT order requires a positive finite limit price');
      }
    }

    // 10. Capital & Position Feasibility Checks + Reservation
    const availableCash = this.cash - this.reservedCash;

    if (order.side === 'BUY') {
      let estimatedFillPrice = 0;
      if (order.type === 'MARKET') {
        const rawPrice = quote!.price * (1 + this.tradingCosts.slippageRate);
        estimatedFillPrice = Math.round(rawPrice * 100) / 100;
      } else {
        estimatedFillPrice = order.limitPrice!;
      }

      const tradeValue = order.quantity * estimatedFillPrice;
      const estimatedFee = tradeValue * this.tradingCosts.buyFeeRate;
      const totalCashRequired = tradeValue + estimatedFee;

      if (totalCashRequired > availableCash) {
        return this.rejectOrder(
          order,
          'INSUFFICIENT_CASH',
          `Insufficient available cash. Required: ${Math.round(totalCashRequired).toLocaleString()} VND, Available: ${Math.round(availableCash).toLocaleString()} VND`
        );
      }

      // Reserve Cash to prevent Double-Spending across concurrent orders
      this.reservedCash += totalCashRequired;
      order.reservedCashAmount = totalCashRequired;
    } else {
      // SELL ORDER: Validate Position (Strictly NO Short Selling)
      const position = this.positions.get(symbol);
      const availableShares = position ? (position.quantity - position.reservedQuantity) : 0;

      if (!position || availableShares < order.quantity) {
        return this.rejectOrder(
          order,
          'INSUFFICIENT_POSITION',
          `Insufficient shares to sell. Required: ${order.quantity}, Available: ${availableShares}. Short selling is not permitted.`
        );
      }

      // Reserve Shares to prevent double-selling
      position.reservedQuantity += order.quantity;
      position.availableQuantity = position.quantity - position.reservedQuantity;
    }

    // 11. Transition: VALIDATED -> SUBMITTED
    order.status = 'SUBMITTED';
    order.submittedAt = new Date().toISOString();
    this.orders.set(order.id, order);

    this.emitEvent({
      type: 'ORDER_SUBMITTED',
      timestamp: order.submittedAt,
      data: { orderId: order.id, symbol: order.symbol, side: order.side, quantity: order.quantity },
    });

    // 12. Immediate Execution Check
    if (order.type === 'MARKET' && quote) {
      const rawPrice = order.side === 'BUY'
        ? quote.price * (1 + this.tradingCosts.slippageRate)
        : quote.price * (1 - this.tradingCosts.slippageRate);
      const fillPrice = Math.round(rawPrice * 100) / 100;
      this.executeFill(order, fillPrice);
    } else if (order.type === 'LIMIT' && quote) {
      if (order.side === 'BUY' && quote.price <= order.limitPrice!) {
        this.executeFill(order, order.limitPrice!);
      } else if (order.side === 'SELL' && quote.price >= order.limitPrice!) {
        this.executeFill(order, order.limitPrice!);
      }
    }

    return {
      success: true,
      order,
    };
  }

  submitOrder(request: SubmitOrderRequest | Order): OrderResult & Promise<OrderResult> {
    const res = this.submitOrderSync(request);
    return Object.assign(Promise.resolve(res), res);
  }

  private rejectOrder(order: Order, code: ValidationErrorCode, message: string): OrderResult {
    order.status = 'REJECTED';
    order.rejectedReason = message;
    order.rejectionCode = code;
    this.orders.set(order.id, order);

    this.emitEvent({
      type: 'ORDER_REJECTED',
      timestamp: new Date().toISOString(),
      data: { orderId: order.id, code, message },
    });

    return {
      success: false,
      order,
      error: { code, message },
    };
  }

  // ==========================================
  // ATOMIC FILL EXECUTION
  // ==========================================

  private executeFill(order: Order, fillPrice: number): void {
    if (order.status !== 'SUBMITTED') {
      return;
    }

    const quantity = order.quantity;
    const grossValue = quantity * fillPrice;
    const fillTimestamp = new Date().toISOString();

    if (order.side === 'BUY') {
      const fee = grossValue * this.tradingCosts.buyFeeRate;
      const totalCost = grossValue + fee;

      // 1. Release reserved cash and deduct actual cash
      const reserved = order.reservedCashAmount ?? totalCost;
      this.reservedCash = Math.max(0, this.reservedCash - reserved);
      order.reservedCashAmount = 0;
      this.cash -= totalCost;

      // 2. Update position
      const existing = this.positions.get(order.symbol);
      if (existing) {
        const oldQty = existing.quantity;
        const oldCostBasis = oldQty * existing.averageCost;
        const newQty = oldQty + quantity;
        const newAverageCost = (oldCostBasis + totalCost) / newQty;

        existing.quantity = newQty;
        existing.availableQuantity = existing.quantity - existing.reservedQuantity;
        existing.averageCost = newAverageCost;
        existing.updatedAt = fillTimestamp;
      } else {
        const newPos: BrokerPosition = {
          symbol: order.symbol,
          quantity,
          reservedQuantity: 0,
          availableQuantity: quantity,
          averageCost: totalCost / quantity,
          currentPrice: fillPrice,
          marketValue: grossValue,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          updatedAt: fillTimestamp,
        };
        this.positions.set(order.symbol, newPos);
      }

      // 3. Record transaction in ledger
      const quotePrice = this.latestQuotes.get(order.symbol)?.price ?? fillPrice;
      const slippage = Math.abs(fillPrice - quotePrice) * quantity;

      const txn: BrokerTransaction = {
        id: `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orderId: order.id,
        symbol: order.symbol,
        side: 'BUY',
        quantity,
        price: fillPrice,
        fee,
        tax: 0,
        slippage,
        totalAmount: totalCost,
        transactionDate: fillTimestamp,
      };
      this.transactions.push(txn);

      // 4. Update order record
      order.status = 'FILLED';
      order.filledAt = fillTimestamp;
      order.averageFillPrice = fillPrice;
      order.filledQuantity = quantity;
      order.tradeValue = grossValue;
      order.fee = fee;
      order.tax = 0;
      order.slippage = slippage;
    } else {
      // SELL ORDER
      const fee = grossValue * this.tradingCosts.sellFeeRate;
      const tax = grossValue * this.tradingCosts.sellTaxRate;
      const netProceeds = grossValue - fee - tax;

      // 1. Release position reservation and deduct sold shares
      const position = this.positions.get(order.symbol)!;
      position.reservedQuantity = Math.max(0, position.reservedQuantity - quantity);
      position.quantity -= quantity;
      position.availableQuantity = position.quantity - position.reservedQuantity;

      // 2. Realized PnL calculation: remaining shares' averageCost does NOT change
      const costBasisOfSoldShares = quantity * position.averageCost;
      const tradeRealizedPnL = netProceeds - costBasisOfSoldShares;
      this.realizedPnL += tradeRealizedPnL;

      if (position.quantity <= 0) {
        this.positions.delete(order.symbol);
      } else {
        position.updatedAt = fillTimestamp;
      }

      // 3. Credit net proceeds to cash
      this.cash += netProceeds;

      // 4. Record transaction in ledger
      const quotePrice = this.latestQuotes.get(order.symbol)?.price ?? fillPrice;
      const slippage = Math.abs(quotePrice - fillPrice) * quantity;

      const txn: BrokerTransaction = {
        id: `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orderId: order.id,
        symbol: order.symbol,
        side: 'SELL',
        quantity,
        price: fillPrice,
        fee,
        tax,
        slippage,
        totalAmount: netProceeds,
        transactionDate: fillTimestamp,
      };
      this.transactions.push(txn);

      // 5. Update order record
      order.status = 'FILLED';
      order.filledAt = fillTimestamp;
      order.averageFillPrice = fillPrice;
      order.filledQuantity = quantity;
      order.tradeValue = grossValue;
      order.fee = fee;
      order.tax = tax;
      order.slippage = slippage;
    }

    this.emitEvent({
      type: 'ORDER_FILLED',
      timestamp: fillTimestamp,
      data: {
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        fillPrice,
        quantity,
      },
    });
  }

  // ==========================================
  // ORDER CANCELLATION
  // ==========================================

  async cancelOrder(orderId: string): Promise<CancelOrderResult> {
    const order = this.orders.get(orderId);
    if (!order) {
      return {
        success: false,
        orderId,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found`,
        },
      };
    }

    if (order.status === 'FILLED') {
      return {
        success: false,
        orderId,
        order,
        error: {
          code: 'ORDER_ALREADY_FILLED',
          message: `Cannot cancel filled order ${orderId}`,
        },
      };
    }

    if (order.status === 'CANCELLED') {
      return {
        success: false,
        orderId,
        order,
        error: {
          code: 'ORDER_ALREADY_CANCELLED',
          message: `Order ${orderId} has already been cancelled`,
        },
      };
    }

    if (order.status === 'SUBMITTED') {
      // Release reservations
      if (order.side === 'BUY') {
        const reserved = order.reservedCashAmount ?? 0;
        this.reservedCash = Math.max(0, this.reservedCash - reserved);
        order.reservedCashAmount = 0;
      } else {
        const position = this.positions.get(order.symbol);
        if (position) {
          position.reservedQuantity = Math.max(0, position.reservedQuantity - order.quantity);
          position.availableQuantity = position.quantity - position.reservedQuantity;
        }
      }

      order.status = 'CANCELLED';
      order.cancelledAt = new Date().toISOString();

      this.emitEvent({
        type: 'ORDER_CANCELLED',
        timestamp: order.cancelledAt,
        data: { orderId: order.id, symbol: order.symbol },
      });

      return {
        success: true,
        orderId,
        order,
      };
    }

    return {
      success: false,
      orderId,
      order,
      error: {
        code: 'INVALID_ORDER',
        message: `Cannot cancel order in status '${order.status}'`,
      },
    };
  }

  // ==========================================
  // SAFETY SWITCHES
  // ==========================================

  setEmergencyStop(enabled: boolean): void {
    this.emergencyStop = enabled;

    if (enabled) {
      // Cancel all open pending orders and release reservations immediately
      for (const order of this.orders.values()) {
        if (order.status === 'SUBMITTED') {
          this.cancelOrder(order.id);
        }
      }

      this.emitEvent({
        type: 'EMERGENCY_STOP_TRIGGERED',
        timestamp: new Date().toISOString(),
        data: { message: 'Emergency stop activated. All open orders cancelled. Existing positions preserved.' },
      });
    }
  }

  setTradingEnabled(enabled: boolean): void {
    this.tradingEnabled = enabled;
  }

  isEmergencyStopActive(): boolean {
    return this.emergencyStop;
  }

  isTradingEnabled(): boolean {
    return this.tradingEnabled;
  }

  // ==========================================
  // QUERY METHODS (BROKER ADAPTER IMPLEMENTATION)
  // ==========================================

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) ?? null;
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const list: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.status === 'SUBMITTED') {
        if (!symbol || order.symbol === symbol.toUpperCase()) {
          list.push(order);
        }
      }
    }
    return list;
  }

  async getAllOrders(symbol?: string): Promise<Order[]> {
    const list: Order[] = [];
    for (const order of this.orders.values()) {
      if (!symbol || order.symbol === symbol.toUpperCase()) {
        list.push(order);
      }
    }
    return list;
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const pos = this.positions.get(symbol.toUpperCase());
    return pos ? { ...pos } : null;
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return Array.from(this.positions.values()).map(p => ({ ...p }));
  }

  async getTransactions(): Promise<BrokerTransaction[]> {
    return [...this.transactions];
  }

  getAccountSync(): BrokerAccount {
    let totalMarketValue = 0;
    let totalUnrealizedPnL = 0;

    const positionsList: BrokerPosition[] = [];
    for (const pos of this.positions.values()) {
      const quote = this.latestQuotes.get(pos.symbol);
      const currentPrice = quote?.price ?? pos.currentPrice ?? null;
      let marketValue: number | null = null;
      let unrealizedPnL: number | null = null;
      let unrealizedPnLPercent: number | null = null;

      if (currentPrice != null && currentPrice > 0) {
        marketValue = pos.quantity * currentPrice;
        unrealizedPnL = marketValue - (pos.quantity * pos.averageCost);
        unrealizedPnLPercent = pos.averageCost > 0
          ? (unrealizedPnL / (pos.quantity * pos.averageCost)) * 100
          : 0;
        totalMarketValue += marketValue;
        totalUnrealizedPnL += unrealizedPnL;
      }

      positionsList.push({
        ...pos,
        currentPrice,
        marketValue,
        unrealizedPnL,
        unrealizedPnLPercent,
      });
    }

    const availableCash = Math.max(0, this.cash - this.reservedCash);
    const equity = this.cash + totalMarketValue;
    const openOrders: Order[] = [];
    for (const order of this.orders.values()) {
      if (order.status === 'SUBMITTED') {
        openOrders.push(order);
      }
    }

    return {
      accountId: this.accountId,
      currency: this.currency,
      cash: this.cash,
      reservedCash: this.reservedCash,
      availableCash,
      marketValue: totalMarketValue,
      equity,
      realizedPnL: this.realizedPnL,
      unrealizedPnL: totalUnrealizedPnL,
      positions: positionsList,
      openOrders,
      updatedAt: new Date().toISOString(),
    };
  }

  getAccount(): BrokerAccount & Promise<BrokerAccount> {
    const acc = this.getAccountSync();
    return Object.assign(Promise.resolve(acc), acc);
  }

  // ==========================================
  // SEED & RESET (TESTING & DEV UTILITIES)
  // ==========================================

  seedCash(amount: number): void {
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) {
      this.cash = amount;
    }
  }

  seedPosition(pos: { symbol: string; quantity: number; averageCost: number }): void {
    const symbol = pos.symbol.toUpperCase();
    this.positions.set(symbol, {
      symbol,
      quantity: pos.quantity,
      reservedQuantity: 0,
      availableQuantity: pos.quantity,
      averageCost: pos.averageCost,
      currentPrice: pos.averageCost,
      marketValue: pos.quantity * pos.averageCost,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  reset(): void {
    this.cash = 100_000_000;
    this.reservedCash = 0;
    this.realizedPnL = 0;
    this.positions.clear();
    this.orders.clear();
    this.transactions = [];
    this.latestQuotes.clear();
    this.emergencyStop = false;
    this.tradingEnabled = true;
  }
}
