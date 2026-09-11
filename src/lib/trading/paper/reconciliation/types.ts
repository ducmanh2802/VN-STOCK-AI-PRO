/**
 * PHASE 18.3.1 — PAPER RECONCILIATION ENGINE TYPES
 * =================================================
 * Strongly-typed contracts for independent, read-only reconciliation
 * of PaperBroker / BrokerAccount state against PaperTradeLedger audit trails.
 */

import type { BrokerAccount } from '../../execution/BrokerAdapter.ts';
import type { PaperAuditEntry } from '../PaperTradeLedger.ts';

export type ReconciliationStatus = 'RECONCILED' | 'MISMATCH' | 'INVALID_INPUT';

export type MismatchCategory =
  | 'CASH'
  | 'POSITION'
  | 'ORDER'
  | 'PNL'
  | 'COST'
  | 'INTEGRITY';

export type MismatchSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ReconciliationMismatch {
  category: MismatchCategory;
  field: string;
  expected: number | string;
  actual: number | string;
  difference?: number;
  severity: MismatchSeverity;
  reason: string;
}

export interface ReconciliationTolerance {
  /** Money comparison tolerance in VND (default: 1.0 VND) */
  moneyToleranceVND: number;
  /** Quantity tolerance (board lots must be exact integers: default: 0) */
  quantityTolerance: number;
  /** Price comparison tolerance in VND (default: 1.0 VND) */
  priceToleranceVND: number;
  /** Percentage comparison tolerance (default: 0.01%) */
  percentTolerance: number;
}

export const DEFAULT_RECONCILIATION_TOLERANCE: ReconciliationTolerance = {
  moneyToleranceVND: 1.0,
  quantityTolerance: 0,
  priceToleranceVND: 1.0,
  percentTolerance: 0.01,
};

export interface CashComparison {
  initialCash: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  expectedReservedCash: number;
  actualReservedCash: number;
  expectedAvailableCash: number;
  actualAvailableCash: number;
  matched: boolean;
}

export interface PositionComparisonDetail {
  symbol: string;
  expectedQuantity: number;
  actualQuantity: number;
  quantityMatched: boolean;
  expectedAverageCost: number | null;
  actualAverageCost: number | null;
  costMatched: boolean;
  expectedReservedQuantity: number;
  actualReservedQuantity: number;
  reservedMatched: boolean;
}

export interface PositionComparison {
  symbolsMatched: boolean;
  positionsCountExpected: number;
  positionsCountActual: number;
  matched: boolean;
  details: PositionComparisonDetail[];
}

export interface OrderExecutionComparison {
  totalOrdersExpected: number;
  totalOrdersActual: number;
  filledOrders: number;
  rejectedOrders: number;
  otherOrders: number;
  totalExecutedQuantityExpected: number;
  totalExecutedQuantityActual: number;
  totalTradeValueExpected: number;
  matched: boolean;
}

export interface PnLComparison {
  expectedRealizedPnL: number;
  actualRealizedPnL: number;
  realizedPnLMatched: boolean;
  expectedUnrealizedPnL: number;
  actualUnrealizedPnL: number;
  unrealizedPnLMatched: boolean;
  expectedEquity: number;
  actualEquity: number;
  equityMatched: boolean;
  matched: boolean;
}

export interface CostComparison {
  expectedTotalFees: number;
  actualTotalFees: number;
  feesMatched: boolean;
  expectedTotalTaxes: number;
  actualTotalTaxes: number;
  taxesMatched: boolean;
  expectedTotalSlippage: number;
  actualTotalSlippage: number;
  slippageMatched: boolean;
  matched: boolean;
}

export interface ReconciliationReport {
  status: ReconciliationStatus;
  checkedAt: string;
  accountId?: string;
  cashComparison: CashComparison;
  positionComparison: PositionComparison;
  orderExecutionComparison: OrderExecutionComparison;
  pnlComparison: PnLComparison;
  costComparison: CostComparison;
  mismatches: ReconciliationMismatch[];
  summary: string;
}

export interface PaperReconciliationInput {
  account?: BrokerAccount | null;
  broker?: {
    getAccountSync: () => BrokerAccount;
    getTransactions?: () => Promise<any[]> | any[];
  } | null;
  ledger: PaperAuditEntry[] | { getAllEntries: () => PaperAuditEntry[] } | null | undefined;
  initialCash?: number;
  quotes?: Map<string, { price: number }> | Record<string, { price: number }>;
  tolerance?: Partial<ReconciliationTolerance>;
  now?: number | string;
}
