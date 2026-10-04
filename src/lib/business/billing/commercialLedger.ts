/**
 * BUSINESS-05 — COMMERCIAL BILLING LEDGER
 * =======================================
 * Invoice / payment / refund / credit / platform fee / creator share — and NOTHING else.
 *
 * LEDGER SEPARATION (roadmap §05.6) — the hard requirement
 *
 *   INVESTMENT accounting (trading lane, untouched):   cash, position, NAV, P&L, fees
 *   COMMERCIAL accounting (this file):                 invoice, payment, refund, credit,
 *                                                      platform fee, creator share
 *
 *   These are different domains and they never cross-contaminate. Enforced structurally:
 *
 *   1. `src/lib/business/**` has ZERO imports from `src/lib/trading/**`, so this ledger
 *      cannot reach a position, a NAV or a fill even by accident.
 *   2. `CommercialLedgerEntry` has no position/quantity/price/Nav field. There is no column
 *      in which an investment quantity could be written.
 *   3. `assertLedgerDomain()` refuses any entry whose `kind` is an investment concept.
 *   4. The migration for the ledger has no FK to, and no shared table with, the investment
 *      ledger.
 *
 * MONEY IS NEVER FABRICATED (§2.1)
 *   Every entry carries `moneySource`, which records where the amount came from. It is one of
 *   `PROVIDER_REPORTED | OPERATOR_ADJUSTMENT | NONE`. An entry with `moneySource: 'NONE'`
 *   carries a NULL amount and is a STATE RECORD, not a financial record. There is no way to
 *   write an amount that did not come from somewhere.
 */

import type { Money } from './paymentProvider.ts';

// ============================================================================
// LEDGER ENTRY
// ============================================================================

export type CommercialLedgerKind =
  | 'INVOICE_ISSUED'
  | 'INVOICE_VOID'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_UNKNOWN'
  | 'REFUND_ISSUED'
  | 'CREDIT_ISSUED'
  | 'PLATFORM_FEE'
  | 'CREATOR_SHARE'
  | 'CREATOR_PAYOUT'
  | 'STATE_CHANGE';

export type MoneySource = 'PROVIDER_REPORTED' | 'OPERATOR_ADJUSTMENT' | 'NONE';

export interface CommercialLedgerEntry {
  readonly entryId: string;
  readonly kind: CommercialLedgerKind;
  readonly subjectId: string;
  readonly organizationId: string | null;
  /** The commercial object this entry concerns (subscription, listing, purchase). */
  readonly reference: string;
  /** NULL when moneySource is NONE. Never fabricated. */
  readonly amount: Money | null;
  readonly moneySource: MoneySource;
  /** Provider this amount was reported by, when applicable. */
  readonly provider: string | null;
  readonly providerRef: string | null;
  readonly environment: 'TEST' | 'SANDBOX' | 'PRODUCTION';
  /** The event that caused this entry. Gives idempotency a natural key. */
  readonly causationId: string;
  readonly correlationId: string | null;
  readonly occurredAt: string;
  readonly reason: string;
}

const INVESTMENT_CONCEPTS = new Set([
  'CASH', 'POSITION', 'NAV', 'PNL', 'FILL', 'ORDER', 'TRADE_VALUE', 'EQUITY',
]);

export const COMMERCIAL_KINDS: ReadonlySet<CommercialLedgerKind> = new Set<CommercialLedgerKind>([
  'INVOICE_ISSUED', 'INVOICE_VOID', 'PAYMENT_RECORDED', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN',
  'REFUND_ISSUED', 'CREDIT_ISSUED', 'PLATFORM_FEE', 'CREATOR_SHARE', 'CREATOR_PAYOUT',
  'STATE_CHANGE',
]);

/**
 * Domain guard. Fails closed when an entry claims to be an investment-accounting concept,
 * or when an amount exists without a money source.
 */
export function assertLedgerDomain(e: CommercialLedgerEntry): void {
  if (!COMMERCIAL_KINDS.has(e.kind)) throw new Error(`NOT_A_COMMERCIAL_KIND:${e.kind}`);
  if (INVESTMENT_CONCEPTS.has(e.kind)) throw new Error(`INVESTMENT_CONCEPT_IN_COMMERCIAL_LEDGER:${e.kind}`);
  if (e.amount === null && e.moneySource !== 'NONE') {
    throw new Error('AMOUNT_MISSING_BUT_MONEY_SOURCE_CLAIMED');
  }
  if (e.amount !== null && e.moneySource === 'NONE') {
    throw new Error('AMOUNT_PRESENT_WITHOUT_MONEY_SOURCE');
  }
  if (e.amount !== null && e.provider === null && e.moneySource === 'PROVIDER_REPORTED') {
    throw new Error('PROVIDER_REPORTED_AMOUNT_WITHOUT_PROVIDER');
  }
}

// ============================================================================
// LEDGER — APPEND ONLY
// ============================================================================

/**
 * Append-only commercial ledger. No update, no delete, no correction-in-place. A correction
 * is a new pair of entries, which is what makes the history reconstructable.
 */
export class CommercialLedger {
  private readonly entries: CommercialLedgerEntry[] = [];
  private readonly seenCausation = new Set<string>();

  /**
   * Append. Idempotent on `causationId`: replaying the same causation produces no second
   * entry. This is what makes a duplicate webhook a no-op (§05.4).
   */
  append(e: CommercialLedgerEntry): { readonly entry: CommercialLedgerEntry; readonly duplicate: boolean } {
    assertLedgerDomain(e);
    if (this.seenCausation.has(e.causationId)) {
      const existing = this.entries.find((x) => x.causationId === e.causationId)!;
      return { entry: existing, duplicate: true };
    }
    if (!Number.isNaN(Date.parse(e.occurredAt)) === false) throw new Error('INVALID_OCCURRED_AT');
    this.seenCausation.add(e.causationId);
    this.entries.push(Object.freeze(e));
    return { entry: e, duplicate: false };
  }

  all(): readonly CommercialLedgerEntry[] {
    return [...this.entries];
  }

  forSubject(subjectId: string): readonly CommercialLedgerEntry[] {
    return this.entries.filter((e) => e.subjectId === subjectId);
  }

  forReference(reference: string): readonly CommercialLedgerEntry[] {
    return this.entries.filter((e) => e.reference === reference);
  }

  ofKind(kind: CommercialLedgerKind): readonly CommercialLedgerEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  count(): number {
    return this.entries.length;
  }
}

// ============================================================================
// BALANCES — DERIVED, NEVER STORED
// ============================================================================

export interface CommercialBalance {
  readonly subjectId: string;
  readonly currency: string;
  readonly invoiced: number;
  readonly paid: number;
  readonly refunded: number;
  readonly credited: number;
  readonly platformFees: number;
  readonly creatorShares: number;
  readonly creatorPaidOut: number;
  readonly net: number;
}

/**
 * Derive a balance from the entry list.
 *
 * SIGN CONVENTION (stated because getting it wrong is how a ledger starts lying):
 *   invoiced  +  (positive: money owed)
 *   paid       +  (positive: money received)
 *   refunded   +  (positive: money returned, reduces net)
 *   credited   +  (positive: goodwill credit, reduces net)
 *   fees/shares  (positive: money leaving the platform or owed to a creator)
 *   net = paid - refunded - credited - platformFees + creatorPaidOut
 *
 * Every component is derived from entries with a real `amount`. Entries with
 * `moneySource: 'NONE'` contribute nothing, so a state record can never move a balance.
 */
export function deriveBalance(entries: readonly CommercialLedgerEntry[], subjectId: string, currency: string): CommercialBalance {
  const mine = entries.filter((e) => e.subjectId === subjectId && e.amount !== null && e.amount.currency === currency);

  let invoiced = 0, paid = 0, refunded = 0, credited = 0, platformFees = 0, creatorShares = 0, creatorPaidOut = 0;
  for (const e of mine) {
    const v = e.amount!.minorUnits;
    switch (e.kind) {
      case 'INVOICE_ISSUED': invoiced += v; break;
      case 'PAYMENT_RECORDED': paid += v; break;
      case 'REFUND_ISSUED': refunded += v; break;
      case 'CREDIT_ISSUED': credited += v; break;
      case 'PLATFORM_FEE': platformFees += v; break;
      case 'CREATOR_SHARE': creatorShares += v; break;
      case 'CREATOR_PAYOUT': creatorPaidOut += v; break;
      // PAYMENT_FAILED, PAYMENT_UNKNOWN, INVOICE_VOID, STATE_CHANGE carry no money effect.
      default: break;
    }
  }

  return {
    subjectId,
    currency,
    invoiced,
    paid,
    refunded,
    credited,
    platformFees,
    creatorShares,
    creatorPaidOut,
    net: paid - refunded - credited - platformFees + creatorPaidOut,
  };
}

/**
 * Ledger invariant. Asserted after every mutation by the billing service.
 *
 * A failure here means the ledger is inconsistent and must not be used to grant anything.
 */
export function ledgerInvariantsHold(entries: readonly CommercialLedgerEntry[]): {
  readonly hold: boolean;
  readonly violations: readonly string[];
} {
  const violations: string[] = [];
  for (const e of entries) {
    try {
      assertLedgerDomain(e);
    } catch (err) {
      violations.push(err instanceof Error ? err.message : 'UNKNOWN_VIOLATION');
    }
  }
  // A refund must never exceed what was actually received for the same reference.
  const byRef = new Map<string, { paid: number; refunded: number; currency: string }>();
  for (const e of entries) {
    if (e.amount === null) continue;
    const k = e.reference;
    const acc = byRef.get(k) ?? { paid: 0, refunded: 0, currency: e.amount.currency };
    if (e.kind === 'PAYMENT_RECORDED') acc.paid += e.amount.minorUnits;
    if (e.kind === 'REFUND_ISSUED') acc.refunded += e.amount.minorUnits;
    byRef.set(k, acc);
  }
  for (const [ref, acc] of byRef) {
    if (acc.refunded > acc.paid) {
      violations.push(`REFUND_EXCEEDS_PAYMENT:${ref}:${acc.refunded}>${acc.paid}`);
    }
  }
  return { hold: violations.length === 0, violations };
}