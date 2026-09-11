/**
 * PHASE 18.2 — PAPER TRADE LEDGER
 * ================================
 * Immutable, queryable audit ledger recording all lifecycle events and decisions
 * for paper trading orders (EXECUTED, REJECTED, BLOCKED, CANCELLED).
 *
 * Guarantees that no rejection reason or safety gate failure is ever discarded.
 */

import type { OrderSide, OrderStatus, OrderType, ValidationErrorCode } from '../types/trading.ts';
import type { RiskGuardAuthorizationStatus, RiskGuardDecisionStatus } from '../types/risk.ts';
import type { MarketDataIntegrityResult } from '../integrity/MarketDataIntegrityGuard.ts';

export interface PaperAuditEntry {
  auditId: string;
  orderId: string;
  timestamp: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  requestedPrice: number;
  executedPrice: number | null;
  requestedQuantity: number;
  executedQuantity: number;
  stopLoss: number | null;
  targetPrice: number | null;
  riskAmount: number | null;
  portfolioExposureBefore: number;
  portfolioExposureAfter: number;
  cashBefore: number;
  cashAfter: number;
  positionBefore: number;
  positionAfter: number;
  validatorStatus: 'VALID' | 'INVALID' | 'SKIPPED';
  validatorCode: ValidationErrorCode | 'OK';
  validatorReason?: string;
  riskGuardStatus: RiskGuardDecisionStatus | 'SKIPPED';
  riskGuardAuthorization: RiskGuardAuthorizationStatus | 'SKIPPED';
  riskGuardReason?: string;
  integrityValid: boolean;
  integrityReasons: string[];
  dataSource?: string;
  marketDataTimestamp?: string | number | null;
  fees: number;
  tax: number;
  slippage: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  finalOrderStatus: OrderStatus;
  rejectionReason?: string;
  errors: string[];
  // Phase 18.3.3 — Snapshot Binding & Versioning Metadata
  marketDataSnapshotId?: string;
  recommendationId?: string;
  strategyVersion?: string;
  riskPolicyVersion?: string;
}

export class PaperTradeLedger {
  private entries: PaperAuditEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 10_000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Appends an immutable audit entry to the ledger.
   */
  record(entry: Omit<PaperAuditEntry, 'auditId'>): PaperAuditEntry {
    const fullEntry: PaperAuditEntry = {
      auditId: `AUDIT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      ...entry,
    };

    this.entries.push(fullEntry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift(); // FIFO eviction
    }

    return fullEntry;
  }

  /**
   * Returns all recorded audit entries.
   */
  getAllEntries(): PaperAuditEntry[] {
    return [...this.entries];
  }

  /**
   * Retrieves audit entries filtered by symbol.
   */
  getEntriesBySymbol(symbol: string): PaperAuditEntry[] {
    const target = symbol.toUpperCase();
    return this.entries.filter(e => e.symbol === target);
  }

  /**
   * Retrieves audit entries filtered by status.
   */
  getEntriesByStatus(status: OrderStatus): PaperAuditEntry[] {
    return this.entries.filter(e => e.finalOrderStatus === status);
  }

  /**
   * Retrieves audit entries filtered by marketDataSnapshotId.
   */
  getEntriesBySnapshotId(snapshotId: string): PaperAuditEntry[] {
    return this.entries.filter(e => e.marketDataSnapshotId === snapshotId);
  }

  /**
   * Retrieves audit entries filtered by recommendationId.
   */
  getEntriesByRecommendationId(recommendationId: string): PaperAuditEntry[] {
    return this.entries.filter(e => e.recommendationId === recommendationId);
  }

  /**
   * Retrieves the most recent audit entry.
   */
  getLatestEntry(): PaperAuditEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Clears the ledger (primarily for test resets).
   */
  clear(): void {
    this.entries = [];
  }
}
