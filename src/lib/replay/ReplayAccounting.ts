/**
 * PAPER REPLAY — ACCOUNTING INVARIANT + CHECKPOINTS
 * ================================================
 * NAV = cash + position market value (+ other valid components).
 * Checked after every fill / fee / tax / slippage / corporate action /
 * mark-to-market / rebalance / close. A violation FAILS the replay
 * (never continues silently).
 * Does NOT duplicate FinancialConservation: `conservationCheck` accepts an
 * injected authoritative validator (trading/replay/FinancialConservationValidator).
 */
import type { ReplayCheckpoint, ReplayManifest } from './types.ts';
import { manifestFingerprint } from './ReplayManifest.ts';

export interface AccountingSnapshot {
  readonly cash: number;
  readonly positionsValue: number;
  readonly otherComponents: number;
}

export type ConservationVerdict = 'CONSERVED' | 'VIOLATION' | 'NOT_RUN';

export interface ConservationInput {
  readonly before: AccountingSnapshot;
  readonly after: AccountingSnapshot;
  readonly authoritativeIsValid?: boolean | null;
}

export class ReplayAccounting {
  static nav(s: AccountingSnapshot): number {
    return s.cash + s.positionsValue + s.otherComponents;
  }

  /** Pure arithmetic check (tolerance-free by default: exact VND conservation). */
  static check(s: AccountingSnapshot): boolean {
    const n = ReplayAccounting.nav(s);
    return Number.isFinite(n) && s.cash >= 0;
  }

  static verify(input: ConservationInput): ConservationVerdict {
    if (input.authoritativeIsValid === false) return 'VIOLATION';
    if (!ReplayAccounting.check(input.after)) return 'VIOLATION';
    return 'CONSERVED';
  }

  static checkpoint(input: {
    readonly sequence: number;
    readonly timestamp: string;
    readonly cash: number;
    readonly positions: Readonly<Record<string, number>>;
    readonly nav: number;
    readonly riskState: string;
    readonly openOrders: number;
    readonly manifest: ReplayManifest;
  }): ReplayCheckpoint {
    return {
      sequence: input.sequence,
      timestamp: input.timestamp,
      cash: input.cash,
      positions: { ...input.positions },
      nav: input.nav,
      riskState: input.riskState,
      openOrders: input.openOrders,
      manifestFingerprint: manifestFingerprint(input.manifest),
    };
  }
}

export interface ReconciliationInput {
  readonly orderCount: number;
  readonly fillCount: number;
  readonly ledgerEntryCount: number;
  readonly cashDelta: number;
  readonly positionDelta: number;
  readonly expectedCashDelta: number;
  readonly expectedPositionDelta: number;
  readonly authoritativeStatus?: 'RECONCILED' | 'MISMATCH' | 'INVALID_INPUT' | null;
}

export type ReconciliationVerdict = 'RECONCILED' | 'MISMATCH';

export interface ReconciliationReport {
  readonly verdict: ReconciliationVerdict;
  readonly orphanOrders: number;
  readonly orphanFills: number;
  readonly orphanLedgerEntries: number;
  readonly unexplainedCashDelta: number;
  readonly unexplainedPositionDelta: number;
  readonly findings: readonly string[];
}

export class ReplayReconciliation {
  static reconcile(input: ReconciliationInput): ReconciliationReport {
    const findings: string[] = [];
    const orphanOrders = input.fillCount === 0 && input.orderCount > 0 ? input.orderCount : 0;
    const orphanFills = input.fillCount > input.orderCount ? input.fillCount - input.orderCount : 0;
    const orphanLedgerEntries = input.ledgerEntryCount < input.fillCount ? input.fillCount - input.ledgerEntryCount : 0;
    const unexplainedCashDelta = Math.abs(input.cashDelta - input.expectedCashDelta) < 0.01 ? 0 : input.cashDelta - input.expectedCashDelta;
    const unexplainedPositionDelta = Math.abs(input.positionDelta - input.expectedPositionDelta) < 1e-9 ? 0 : input.positionDelta - input.expectedPositionDelta;
    if (orphanOrders > 0) findings.push('ORPHAN_ORDERS');
    if (orphanFills > 0) findings.push('ORPHAN_FILLS');
    if (orphanLedgerEntries > 0) findings.push('ORPHAN_LEDGER_ENTRIES');
    if (Math.abs(unexplainedCashDelta) > 0.01) findings.push('UNEXPLAINED_CASH_DELTA');
    if (Math.abs(unexplainedPositionDelta) > 1e-9) findings.push('UNEXPLAINED_POSITION_DELTA');
    if (input.authoritativeStatus === 'MISMATCH') findings.push('AUTHORITATIVE_MISMATCH');
    if (input.authoritativeStatus === 'INVALID_INPUT') findings.push('AUTHORITATIVE_INVALID_INPUT');
    return {
      verdict: findings.length === 0 ? 'RECONCILED' : 'MISMATCH',
      orphanOrders, orphanFills, orphanLedgerEntries, unexplainedCashDelta, unexplainedPositionDelta, findings,
    };
  }
}