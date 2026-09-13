import type { MarketSnapshot } from '../snapshot/types.ts';
import type { OrderSide, OrderType, OrderStatus, ValidationErrorCode, TradingCostConfig } from '../types/trading.ts';
import type { RiskGuardPolicy } from '../types/risk.ts';
import type { BrokerAccount } from '../execution/BrokerAdapter.ts';
import type { InvestmentRecommendation } from '../../../types/recommendation.ts';
import type { ConfidenceLevel } from '../../../types/enterpriseIntelligence.ts';
import type { PaperExecutionResult } from '../paper/PaperExecutionEngine.ts';
import type { PaperAuditEntry } from '../paper/PaperTradeLedger.ts';

/**
 * Execution Context Binding
 * Binds an order/decision directly to the immutable market snapshot and versioning.
 */
export interface ExecutionContextBinding {
  readonly marketDataSnapshotId: string;
  readonly recommendationId?: string;
  readonly strategyVersion?: string;
  readonly riskPolicyVersion?: string;
}

/**
 * Order Intent submitted for execution or replay.
 */
export interface OrderIntent {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly orderType?: OrderType;
  readonly limitPrice?: number | null;
  readonly stopLoss?: number | null;
  readonly targetPrice?: number | null;
  readonly confidence?: ConfidenceLevel | number | string | null;
  readonly score?: number | null;
  readonly recommendationId?: string;
  readonly marketDataSnapshotId?: string;
  readonly strategyVersion?: string;
  readonly riskPolicyVersion?: string;
  readonly recommendation?: InvestmentRecommendation;
}

/**
 * Status of a replay run.
 */
export type ReplayStatus = 'REPLAYED' | 'REPLAY_INVALID' | 'REPLAY_MISMATCH';

/**
 * Mismatch categorization codes.
 */
export type ReplayMismatchCode =
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_HASH_INVALID'
  | 'SNAPSHOT_ID_MISMATCH'
  | 'ORDER_SNAPSHOT_MISMATCH'
  | 'RECOMMENDATION_MISMATCH'
  | 'STRATEGY_VERSION_MISMATCH'
  | 'RISK_POLICY_VERSION_MISMATCH'
  | 'EXECUTION_MISMATCH'
  | 'INPUT_INVALID'
  | 'NON_DETERMINISTIC'
  | 'INVALID_STATE_TRANSITION'
  | 'SEQUENCE_OUT_OF_ORDER'
  | 'DUPLICATE_EVENT'
  | 'MISSING_EVENT'
  | 'SEQUENCE_NUMBER_INVALID'
  | 'TIMESTAMP_OUT_OF_ORDER'
  | 'ORDER_BINDING_MISMATCH'
  | 'OVERFILL_VIOLATION'
  | 'TERMINAL_STATE_MUTATION'
  | 'NEGATIVE_EXECUTION_PARAM'
  | 'CASH_CONSERVATION_FAILED'
  | 'POSITION_CONSERVATION_FAILED'
  | 'FEE_CONSERVATION_FAILED'
  | 'TAX_CONSERVATION_FAILED'
  | 'TRADE_VALUE_CONSERVATION_FAILED'
  | 'PNL_CONSERVATION_FAILED'
  | 'EQUITY_CONSERVATION_FAILED'
  | 'DOUBLE_COUNT_DETECTED'
  | 'PARTIAL_FILL_CONSERVATION_FAILED'
  | 'LOT_SIZE_CONSERVATION_FAILED';

/**
 * Event type for order execution & state transition replay.
 */
export type ReplayEventType =
  | 'ORDER_CREATED'
  | 'ORDER_VALIDATED'
  | 'ORDER_AUTHORIZED'
  | 'ORDER_SUBMITTED'
  | 'ORDER_PARTIALLY_FILLED'
  | 'ORDER_FILLED'
  | 'ORDER_SETTLED'
  | 'ORDER_REJECTED'
  | 'ORDER_CANCELLED'
  | 'ORDER_EXPIRED'
  | 'ORDER_FAILED';

/**
 * Individual lifecycle event in a replay sequence.
 */
export interface ReplayEvent {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly timestamp: string | number;
  readonly orderId: string;
  readonly snapshotId?: string;
  readonly previousState: OrderStatus;
  readonly nextState: OrderStatus;
  readonly eventType: ReplayEventType | string;
  readonly quantity?: number;
  readonly price?: number;
  readonly fee?: number;
  readonly tax?: number;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Granular mismatch detail.
 */
export interface ReplayMismatch {
  readonly code: ReplayMismatchCode;
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message: string;
}

/**
 * Normalized summary of an execution (either original or replayed).
 */
export interface ReplayExecutionSummary {
  readonly orderId?: string;
  readonly status: OrderStatus;
  readonly side: OrderSide;
  readonly symbol: string;
  readonly requestedQuantity: number;
  readonly executedQuantity: number;
  readonly requestedPrice: number;
  readonly executedPrice: number | null;
  readonly fee: number;
  readonly tax: number;
  readonly slippage: number;
  readonly code: string;
  readonly success: boolean;
  readonly realizedPnL?: number;
  readonly cashAfter?: number;
  readonly positionAfter?: number;
}

/**
 * Replay invocation request.
 */
export interface ReplayRequest {
  readonly snapshot: MarketSnapshot;
  readonly executionContext: ExecutionContextBinding;
  readonly orderIntent: OrderIntent;
  readonly originalExecution?: PaperExecutionResult | PaperAuditEntry | ReplayExecutionSummary;
  readonly initialAccount?: BrokerAccount;
  readonly policy?: Partial<RiskGuardPolicy>;
  readonly tradingCosts?: Partial<TradingCostConfig>;
  readonly customNow?: number;
  readonly eventSequence?: readonly ReplayEvent[];
}

/**
 * Complete Replay outcome.
 */
export interface ReplayResult {
  readonly status: ReplayStatus;
  readonly marketDataSnapshotId: string;
  readonly originalExecution?: ReplayExecutionSummary;
  readonly replayExecution?: ReplayExecutionSummary;
  readonly mismatches: readonly ReplayMismatch[];
  readonly deterministic: boolean;
  readonly error?: string;
  readonly replayedAt: string;
  readonly stateHistory?: readonly OrderStatus[];
  readonly eventHistory?: readonly ReplayEvent[];
}

/**
 * Pre-execution validation outcome.
 */
export interface ReplayValidationResult {
  readonly isValid: boolean;
  readonly mismatches: readonly ReplayMismatch[];
  readonly error?: string;
}
