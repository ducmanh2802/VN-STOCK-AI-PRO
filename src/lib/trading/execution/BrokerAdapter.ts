/**
 * PHASE 18.3 — BROKER ADAPTER INTERFACE
 * =====================================
 * Abstract broker gateway contract for order routing, execution,
 * position tracking, and account telemetry.
 *
 * Designed to decouple high-level trading strategy and order management
 * from broker implementations (PaperBroker now, live broker adapters later).
 */

import type {
  Order,
  OrderSide,
  OrderType,
  ValidationErrorCode,
} from '../types/trading.ts';

export interface SubmitOrderRequest {
  /** Optional custom or client-specified order ID */
  id?: string;
  /** Optional client tracking ID */
  clientOrderId?: string | null;
  /** Stock ticker symbol (e.g., 'HPG', 'FPT') */
  symbol: string;
  /** Order side: BUY or SELL */
  side: OrderSide;
  /** Order type: MARKET or LIMIT */
  type: OrderType;
  /** Share quantity (must be multiple of 100, minimum 100) */
  quantity: number;
  /** Limit price in VND (required for LIMIT orders) */
  limitPrice?: number | null;
  /** Optional expiration date/time string */
  expiresAt?: string | null;
  /** Phase 18.3.3 Context Binding Metadata */
  marketDataSnapshotId?: string;
  recommendationId?: string;
  strategyVersion?: string;
  riskPolicyVersion?: string;
}

export interface OrderResult {
  success: boolean;
  order: Order;
  error?: {
    code: ValidationErrorCode;
    message: string;
    reason?: string;
  };
}

export interface CancelOrderResult {
  success: boolean;
  orderId: string;
  order?: Order;
  error?: {
    code: ValidationErrorCode;
    message: string;
    reason?: string;
  };
}

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  averageCost: number;
  currentPrice?: number | null;
  marketValue?: number | null;
  unrealizedPnL?: number | null;
  unrealizedPnLPercent?: number | null;
  updatedAt: string;
}

export interface BrokerTransaction {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  slippage: number;
  totalAmount: number;
  transactionDate: string;
  notes?: string;
}

export interface BrokerAccount {
  accountId: string;
  currency: string;
  cash: number;
  reservedCash: number;
  availableCash: number;
  marketValue: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: BrokerPosition[];
  openOrders: Order[];
  updatedAt: string;
}

/**
 * Common Broker Gateway Adapter interface.
 * Any execution broker (Paper, or future live broker) implements this interface.
 */
export interface BrokerAdapter {
  /** Human-readable identifier of the broker adapter */
  readonly name: string;
  /** Indicates whether this adapter is a paper simulation or live connection */
  readonly isSimulation: boolean;

  /**
   * Submits a new order to the broker.
   */
  submitOrder(request: SubmitOrderRequest | Order): Promise<OrderResult>;

  /**
   * Cancels an existing pending or open order by its ID.
   */
  cancelOrder(orderId: string): Promise<CancelOrderResult>;

  /**
   * Retrieves an order by its unique ID.
   */
  getOrder(orderId: string): Promise<Order | null>;

  /**
   * Retrieves all open/pending orders, optionally filtered by symbol.
   */
  getOpenOrders(symbol?: string): Promise<Order[]>;

  /**
   * Retrieves all orders (open, filled, cancelled, rejected), optionally filtered by symbol.
   */
  getAllOrders?(symbol?: string): Promise<Order[]>;

  /**
   * Retrieves position for a specific symbol.
   */
  getPosition(symbol: string): Promise<BrokerPosition | null>;

  /**
   * Retrieves all active portfolio positions.
   */
  getPositions(): Promise<BrokerPosition[]>;

  /**
   * Retrieves full account state including balances, equity, and open orders.
   */
  getAccount(): Promise<BrokerAccount>;

  /**
   * Retrieves historical execution transactions recorded by the broker.
   */
  getTransactions?(): Promise<BrokerTransaction[]>;
}
