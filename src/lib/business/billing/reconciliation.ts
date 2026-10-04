/**
 * BUSINESS-05 — ENTITLEMENT RECONCILIATION
 * =========================================
 * Detect commercial inconsistencies and SURFACE them as explicit states (roadmap §05.7).
 *
 *   "Never silently repair without an auditable event."
 *
 * So this module produces a report and nothing else. It has no write path to a subscription,
 * no write path to a payment, no write path to an entitlement. Repair is a separate,
 * operator-initiated, audited action (not implemented in this phase, and listed as an open
 * item) — which is exactly what "explicit reconciliation states" requires.
 *
 * THE THREE FINDINGS THE ROADMAP NAMES
 *
 *   1. subscription ACTIVE   but payment UNKNOWN      -> SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN
 *   2. payment SUCCEEDED     but entitlement MISSING  -> PAYMENT_SETTLED_ENTITLEMENT_MISSING
 *   3. entitlement ACTIVE    but subscription EXPIRED -> ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED
 *
 * plus four more this implementation found necessary to avoid the same class of silent lie:
 *
 *   4. PAYMENT_FAILED but subscription still ACTIVE without a grace window
 *   5. refund issued but subscription still entitling
 *   6. subscription status is not a member of the closed machine
 *   7. ledger violates its own invariants
 *
 * Findings 4 and 5 are the ones that actually cost money in production: a failed payment that
 * never removes entitlement, and a refunded customer who keeps access.
 */

import type { CommercialLedgerEntry } from './commercialLedger.ts';
import { ledgerInvariantsHold } from './commercialLedger.ts';
import type { PaymentStatus } from './paymentProvider.ts';
import { ENTITLING_STATUSES, type EntitlementVerdict, type Subscription } from '../types.ts';

export type ReconciliationFindingCode =
  | 'SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN'
  | 'PAYMENT_SETTLED_ENTITLEMENT_MISSING'
  | 'ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED'
  | 'PAYMENT_FAILED_SUBSCRIPTION_STILL_ENTITLING'
  | 'REFUNDED_SUBSCRIPTION_STILL_ENTITLING'
  | 'SUBSCRIPTION_STATUS_INVALID'
  | 'LEDGER_INVARIANT_VIOLATION';

export type Severity = 'P0' | 'P1' | 'P2';

export interface ReconciliationFinding {
  readonly code: ReconciliationFindingCode;
  readonly severity: Severity;
  readonly subjectId: string;
  readonly reference: string;
  readonly detail: string;
  readonly observed: Readonly<Record<string, string>>;
  /** What a human must decide. Reconciliation never decides by itself. */
  readonly requiredAction: string;
}

export interface ReconciliationInput {
  readonly subjectId: string;
  readonly subscription: Subscription | null;
  /** Most recent authoritative payment state from the PROVIDER. */
  readonly paymentStatus: PaymentStatus | null;
  /** The last entitlement verdict issued for this subject, if any. */
  readonly lastVerdict: EntitlementVerdict | null;
  /** Ledger entries for this subject. */
  readonly ledger: readonly CommercialLedgerEntry[];
}

export interface ReconciliationReport {
  readonly subjectId: string;
  readonly findings: readonly ReconciliationFinding[];
  /** True only when nothing was found. Never a boolean that hides a P0. */
  readonly consistent: boolean;
  readonly highestSeverity: Severity | null;
  /** The overlay value the entitlement engine should apply. */
  readonly overlay: 'CONSISTENT' | 'PAYMENT_UNKNOWN' | 'ENTITLEMENT_MISSING' | 'ENTITLEMENT_ORPHANED' | 'NOT_APPLICABLE';
  readonly checkedAt: string;
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'INCOMPLETE', 'UNAVAILABLE',
]);

export class EntitlementReconciler {
  /** Pure. Produces a report. Mutates nothing. */
  static reconcile(input: ReconciliationInput, checkedAt: string): ReconciliationReport {
    const findings: ReconciliationFinding[] = [];
    const add = (f: ReconciliationFinding) => findings.push(f);

    // 6. Persisted status must belong to the closed machine.
    if (input.subscription !== null && !VALID_STATUSES.has(input.subscription.status)) {
      add({
        code: 'SUBSCRIPTION_STATUS_INVALID',
        severity: 'P0',
        subjectId: input.subjectId,
        reference: input.subscription.subscriptionId,
        detail: 'Persisted subscription status is not a member of the lifecycle machine.',
        observed: { status: String(input.subscription.status) },
        requiredAction: 'Repair the persisted status. Until then the subject is REQUIRES_RECONCILIATION.',
      });
    }

    const sub = input.subscription;
    const isEntitling = sub !== null && ENTITLING_STATUSES.has(sub.status);
    const paid = input.paymentStatus === 'PAYMENT_SUCCEEDED';

    // 1. ACTIVE subscription with an unknown payment.
    if (sub !== null && ENTITLING_STATUSES.has(sub.status) && input.paymentStatus === 'PAYMENT_UNKNOWN') {
      add({
        code: 'SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN',
        severity: 'P0',
        subjectId: input.subjectId,
        reference: sub.subscriptionId,
        detail: 'Subscription is entitling while the payment outcome is unknown.',
        observed: { status: sub.status, planId: sub.planId, paymentStatus: 'PAYMENT_UNKNOWN' },
        requiredAction: 'Resolve the payment with the provider, then re-run reconciliation. Do NOT assume success.',
      });
    }

    // 2. Settled payment with no entitlement.
    if (paid && sub === null) {
      add({
        code: 'PAYMENT_SETTLED_ENTITLEMENT_MISSING',
        severity: 'P0',
        subjectId: input.subjectId,
        reference: 'NO_SUBSCRIPTION',
        detail: 'Payment settled but no subscription exists, so nothing was granted.',
        observed: { paymentStatus: 'PAYMENT_SUCCEEDED' },
        requiredAction: 'Create the subscription from the settled ledger entry, with an audit event.',
      });
    }
    if (paid && sub !== null && sub.status === 'INCOMPLETE') {
      add({
        code: 'PAYMENT_SETTLED_ENTITLEMENT_MISSING',
        severity: 'P0',
        subjectId: input.subjectId,
        reference: sub.subscriptionId,
        detail: 'Payment settled but the subscription never left INCOMPLETE.',
        observed: { paymentStatus: 'PAYMENT_SUCCEEDED', status: 'INCOMPLETE' },
        requiredAction: 'Activate the subscription and grant entitlements with an audit event.',
      });
    }

    // 3. Entitlement granted against an expired subscription.
    if (input.lastVerdict !== null && input.lastVerdict.allowed === true) {
      const verdictStatus = input.lastVerdict.subscriptionStatus;
      if (verdictStatus === 'EXPIRED' || verdictStatus === 'PAUSED' || verdictStatus === 'INCOMPLETE') {
        add({
          code: 'ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED',
          severity: 'P0',
          subjectId: input.subjectId,
          reference: input.lastVerdict.feature ?? 'UNKNOWN_FEATURE',
          detail: 'A capability was ALLOWED while the subscription was not entitling.',
          observed: { subscriptionStatus: verdictStatus, feature: String(input.lastVerdict.feature) },
          requiredAction: 'Investigate the entitlement evaluation path. This must never have been possible.',
        });
      }
    }

    // 4. Failed payment, no grace window, still entitling.
    if (input.paymentStatus === 'PAYMENT_FAILED' && isEntitling && sub !== null && sub.gracePeriodEnd === null) {
      add({
        code: 'PAYMENT_FAILED_SUBSCRIPTION_STILL_ENTITLING',
        severity: 'P0',
        subjectId: input.subjectId,
        reference: sub.subscriptionId,
        detail: 'Payment failed with no grace period, yet the subscription still entitles.',
        observed: { paymentStatus: 'PAYMENT_FAILED', status: sub.status, gracePeriodEnd: 'NONE' },
        requiredAction: 'Move the subscription to PAST_DUE with an explicit grace period, or revoke entitlement.',
      });
    }

    // 5. Refunded, still entitling.
    const refunded = input.ledger.some((e) => e.kind === 'REFUND_ISSUED' && e.amount !== null);
    if (refunded && isEntitling && sub !== null && sub.status === 'ACTIVE') {
      add({
        code: 'REFUNDED_SUBSCRIPTION_STILL_ENTITLING',
        severity: 'P1',
        subjectId: input.subjectId,
        reference: sub.subscriptionId,
        detail: 'A refund was issued while the subscription is still ACTIVE.',
        observed: { paymentStatus: String(input.paymentStatus), status: sub.status },
        requiredAction: 'Apply the refund policy (roadmap §05.8). Access may legitimately continue to period end.',
      });
    }

    // 7. Ledger invariants.
    const invariants = ledgerInvariantsHold(input.ledger);
    for (const v of invariants.violations) {
      add({
        code: 'LEDGER_INVARIANT_VIOLATION',
        severity: 'P0',
        subjectId: input.subjectId,
        reference: 'LEDGER',
        detail: v,
        observed: { violation: v },
        requiredAction: 'Halt billing for this subject until the ledger is repaired by an audited correction.',
      });
    }

    const highest = severityOf(findings);
    return {
      subjectId: input.subjectId,
      findings,
      consistent: findings.length === 0,
      highestSeverity: highest,
      overlay: overlayFor(findings),
      checkedAt,
    };
  }
}

function severityOf(findings: readonly ReconciliationFinding[]): Severity | null {
  if (findings.some((f) => f.severity === 'P0')) return 'P0';
  if (findings.some((f) => f.severity === 'P1')) return 'P1';
  if (findings.some((f) => f.severity === 'P2')) return 'P2';
  return null;
}

/**
 * The overlay the entitlement engine consumes. Anything other than CONSISTENT causes
 * REQUIRES_RECONCILIATION rather than ALLOWED — the §29 guarantee.
 */
function overlayFor(findings: readonly ReconciliationFinding[]): ReconciliationReport['overlay'] {
  if (findings.length === 0) return 'CONSISTENT';
  const codes = new Set(findings.map((f) => f.code));
  if (codes.has('SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN')) return 'PAYMENT_UNKNOWN';
  if (codes.has('PAYMENT_SETTLED_ENTITLEMENT_MISSING')) return 'ENTITLEMENT_MISSING';
  if (codes.has('ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED')) return 'ENTITLEMENT_ORPHANED';
  return 'NOT_APPLICABLE';
}

/**
 * Build a reconciliation function for EntitlementService from a source of reports.
 * Kept here so the entitlement engine keeps no knowledge of reconciliation internals.
 */
export function reconciliationOverlayFor(
  reports: ReadonlyMap<string, ReconciliationReport>,
): (subjectId: string) => 'CONSISTENT' | 'PAYMENT_UNKNOWN' | 'ENTITLEMENT_MISSING' | 'ENTITLEMENT_ORPHANED' | 'NOT_APPLICABLE' {
  return (subjectId: string) => reports.get(subjectId)?.overlay ?? 'NOT_APPLICABLE';
}