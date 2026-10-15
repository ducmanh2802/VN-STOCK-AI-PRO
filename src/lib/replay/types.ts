/**
 * PAPER REPLAY / LIVE-SIMULATION VALIDATION — TYPES
 * ==================================================
 * PAPER ONLY. This namespace can never reach a real broker: the only
 * execution port is a simulation adapter (asserted `isSimulation === true`
 * by PaperReplayEngine before any order is created).
 */

export type ReplayMode = 'HISTORICAL_REPLAY' | 'FORWARD_PAPER_SIMULATION' | 'DETERMINISTIC_REPLAY';

export type ReplayState =
  | 'CREATED' | 'VALIDATING' | 'READY' | 'RUNNING' | 'PAUSED'
  | 'COMPLETED' | 'INVALID' | 'DATA_UNAVAILABLE' | 'DATA_INVALID'
  | 'RISK_BLOCKED' | 'EXECUTION_BLOCKED' | 'FAILED' | 'CANCELLED';

export interface ReplayManifest {
  readonly replayId: string;
  readonly createdAt: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly decisionVersion: string;
  readonly riskModelVersion: string;
  readonly positionSizingVersion: string;
  readonly executionModelVersion: string;
  readonly costModelVersion: string;
  readonly universe: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly initialCapital: number;
  readonly currency: 'VND';
  readonly seed: number | null;
  readonly mode: ReplayMode;
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
  readonly codeVersion: string;
  readonly schemaVersion: string;
  readonly provider: string;
  readonly dataQuality: string;
  readonly corporateActionPolicy: string;
  readonly pointInTimePolicy: string;
}

export type ReplayEventType =
  | 'SESSION_START' | 'MARKET_DATA' | 'CORPORATE_ACTION' | 'SIGNAL' | 'DECISION'
  | 'RISK_CHECK' | 'ORDER_CREATED' | 'ORDER_ACCEPTED' | 'ORDER_REJECTED' | 'FILL'
  | 'FEE' | 'SLIPPAGE' | 'MARGIN' | 'POSITION_UPDATE' | 'MARK_TO_MARKET'
  | 'REBALANCE' | 'SESSION_CLOSE' | 'REPLAY_COMPLETE';

export interface ReplayEvent {
  readonly eventId: string;
  readonly replayId: string;
  readonly sequence: number;
  readonly effectiveDate: string;
  readonly eventType: ReplayEventType;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
  readonly provenance: string;
}

export type PaperOrderStatus =
  | 'CREATED' | 'RISK_REJECTED' | 'EXECUTION_REJECTED'
  | 'ACCEPTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'ZERO_FILL';

export type ZeroCause =
  | 'ZERO_BY_STRATEGY' | 'ZERO_BY_RISK' | 'ZERO_BY_SIZING'
  | 'ZERO_BY_LIQUIDITY' | 'ZERO_BY_DATA';

export interface PaperOrderRecord {
  readonly orderId: string;
  readonly replayId: string;
  readonly decisionId: string | null;
  readonly instrumentId: string;
  readonly side: 'BUY' | 'SELL';
  readonly orderType: 'MARKET' | 'LIMIT' | 'STOP';
  readonly quantity: number;
  readonly limitPrice: number | null;
  readonly status: PaperOrderStatus;
  readonly rejectionReason: string | null;
  readonly zeroCause: ZeroCause | null;
  readonly date: string;
  readonly eventId: string;
}

export interface PaperFillRecord {
  readonly fillId: string;
  readonly orderId: string;
  readonly eventId: string;
  readonly price: number;
  readonly quantity: number;
  readonly fee: number;
  readonly tax: number;
  readonly slippage: number;
  readonly date: string;
}

export interface ReplayPortfolioState {
  readonly cash: number;
  readonly realizedPnl: number;
  readonly fees: number;
  readonly tax: number;
  readonly slippage: number;
  readonly marketValue: number;
  readonly nav: number;
  readonly exposure: number;
}

export interface ReplayCheckpoint {
  readonly sequence: number;
  readonly timestamp: string;
  readonly cash: number;
  readonly positions: Readonly<Record<string, number>>;
  readonly nav: number;
  readonly riskState: string;
  readonly openOrders: number;
  readonly manifestFingerprint: string;
}

export type DivergenceKind =
  | 'DATA' | 'EXECUTION' | 'SLIPPAGE' | 'FEES' | 'TAX' | 'LIQUIDITY'
  | 'RISK' | 'POSITION SIZING' | 'CORPORATE ACTION' | 'TIMING' | 'STRATEGY' | 'ACCOUNTING';

export interface DivergenceItem {
  readonly kind: DivergenceKind;
  readonly metric: string;
  readonly backtestValue: number | null;
  readonly replayValue: number | null;
  readonly explanation: string;
}

export interface ReplayResult {
  readonly replayId: string;
  readonly status: ReplayState;
  readonly manifest: ReplayManifest;
  readonly fingerprint: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly initialCapital: number;
  readonly finalNAV: number;
  readonly returnPct: number | null;
  readonly orders: readonly PaperOrderRecord[];
  readonly fills: readonly PaperFillRecord[];
  readonly strategyTradeCount: number;
  readonly riskRejectionCount: number;
  readonly executionRejectionCount: number;
  readonly filledQuantity: number;
  readonly accountingStatus: 'CONSERVED' | 'VIOLATION';
  readonly reconciliationStatus: 'RECONCILED' | 'MISMATCH' | 'NOT_RUN';
  readonly dataWarnings: readonly string[];
  readonly limitations: readonly string[];
  readonly events: readonly ReplayEvent[];
  readonly checkpoints: readonly ReplayCheckpoint[];
}

export const REPLAY_VERSION = 'v1.0.0-paper-replay';