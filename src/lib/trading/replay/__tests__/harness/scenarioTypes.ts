/**
 * Types & Contracts for Deterministic Scenario Test Harness
 * =========================================================
 * Defines strongly-typed scenario structures, classification tags,
 * step execution results, and failure diagnostic reports.
 */

import type { MarketSnapshot } from '../../../snapshot/types.ts';
import type { BrokerAccount } from '../../../execution/BrokerAdapter.ts';
import type { OrderIntent, ExecutionContextBinding, ReplayResult } from '../../types.ts';
import type { OrderStatus, TradingCostConfig } from '../../../types/trading.ts';
import type { RiskGuardPolicy } from '../../../types/risk.ts';
import type { PaperAuditEntry } from '../../../paper/PaperTradeLedger.ts';
import type { ReconciliationReport } from '../../../paper/reconciliation/types.ts';

/**
 * Three-tier classification for property testing scenarios:
 * 1. VALID_EXECUTABLE: Valid structure, authorized, sufficient cash/positions, within market price bands.
 * 2. VALID_NON_EXECUTABLE: Valid structure but expected to be rejected by risk/capital/state rules.
 * 3. INVALID_INPUT: Corrupted snapshot, tampered hash, non-board lot, missing binding, etc.
 */
export type ScenarioClassification =
  | 'VALID_EXECUTABLE'
  | 'VALID_NON_EXECUTABLE'
  | 'INVALID_INPUT';

/**
 * Specific reason code for non-executable or invalid classification.
 */
export type ScenarioSubCategory =
  | 'CLEAN_FILL'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_POSITION'
  | 'NON_BOARD_LOT'
  | 'STALE_MARKET_DATA'
  | 'CORRUPTED_SNAPSHOT_HASH'
  | 'PRICE_CEILING_EXCEEDED'
  | 'PRICE_FLOOR_VIOLATED'
  | 'SNAPSHOT_ID_MISMATCH'
  | 'NEGATIVE_QUANTITY'
  | 'ZERO_PRICE'
  | 'UNAUTHORIZED_RISK_GUARD'
  | 'CUSTOM_SYNTHETIC';

/**
 * A single discrete event inside a multi-event scenario sequence.
 */
export interface ReplayScenarioEvent {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly timestamp: number;
  readonly snapshot: MarketSnapshot;
  readonly orderIntent: OrderIntent;
  readonly executionContext: ExecutionContextBinding;
  readonly classification: ScenarioClassification;
  readonly subCategory: ScenarioSubCategory;
  readonly expectedReplayStatus?: 'REPLAYED' | 'REPLAY_INVALID' | 'REPLAY_MISMATCH';
  readonly expectedOrderStatus?: OrderStatus;
  readonly expectedRejectionCode?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * A full deterministic scenario consisting of initial account state and sequential events.
 */
export interface ReplayScenario {
  readonly scenarioId: string;
  readonly seed: number;
  readonly name?: string;
  readonly initialAccount: BrokerAccount;
  readonly events: readonly ReplayScenarioEvent[];
  readonly policy?: Partial<RiskGuardPolicy>;
  readonly tradingCosts?: Partial<TradingCostConfig>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of executing a single step in the scenario runner.
 */
export interface ScenarioStepResult {
  readonly stepIndex: number;
  readonly event: ReplayScenarioEvent;
  readonly accountBefore: BrokerAccount;
  readonly replayResult: ReplayResult;
  readonly accountAfter: BrokerAccount;
  readonly auditEntry?: PaperAuditEntry;
  readonly isConsistent: boolean;
  readonly stepError?: string;
}

/**
 * Aggregate result of running an entire scenario through single-event ReplayEngine and PaperReconciliationEngine.
 */
export interface ScenarioExecutionResult {
  readonly scenarioId: string;
  readonly seed: number;
  readonly initialAccount: BrokerAccount;
  readonly finalAccount: BrokerAccount;
  readonly stepResults: readonly ScenarioStepResult[];
  readonly syntheticLedger: readonly PaperAuditEntry[];
  readonly reconciliationReport: ReconciliationReport;
  readonly success: boolean;
  readonly executionErrors: readonly string[];
  readonly diagnostics?: ScenarioFailureDiagnostics;
}

/**
 * Detailed diagnostic information emitted when a property-based test invariant fails.
 */
export interface ScenarioFailureDiagnostics {
  readonly propertyId: string;
  readonly seed: number;
  readonly scenarioId: string;
  readonly stepIndex?: number;
  readonly expectedInvariant: string;
  readonly actualResult: unknown;
  readonly initialAccount: BrokerAccount;
  readonly currentAccount?: BrokerAccount;
  readonly event?: ReplayScenarioEvent;
  readonly snapshotId?: string;
  readonly replayResult?: ReplayResult;
  readonly reconciliationMismatches?: readonly unknown[];
  readonly message: string;
}
