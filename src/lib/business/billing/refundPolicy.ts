/**
 * BUSINESS-05 — REFUND POLICY
 * ===========================
 * What a refund does to payment, invoice, subscription, entitlement and marketplace
 * economics (roadmap §05.8).
 *
 * THE PRINCIPLED DECISION
 *
 *   A refund does NOT automatically remove historical research ownership.
 *   (§05.8: "Do not automatically remove historical research ownership unless policy
 *   explicitly requires it.")
 *
 *   Removing a user's own research on refund would destroy their work to settle a billing
 *   dispute. Research artifacts the user CREATED remain theirs. What a refund does revoke is
 *   the *commercial* right to consume paid capabilities going forward, plus the entitlement
 *   to the purchased item itself.
 *
 * Every effect is decided explicitly below and applied through the ledger, so the whole
 * refund is reconstructable.
 */

import type { CommercialLedgerKind, MoneySource } from './commercialLedger.ts';
import type { Money } from './paymentProvider.ts';

export type RefundConsequence =
  | 'REVOKE_SUBSCRIPTION_ENTITLEMENT'
  | 'KEEP_ENTITLEMENT_UNTIL_PERIOD_END'
  | 'REVOKE_PURCHASED_LISTING_ACCESS'
  | 'RETAIN_RESEARCH_OWNERSHIP'
  | 'REVERSE_CREATOR_SHARE'
  | 'ISSUE_CREDIT_NOT_REFUND';

export interface RefundDecision {
  readonly consequences: readonly RefundConsequence[];
  readonly ledgerKinds: readonly CommercialLedgerKind[];
  /** Every effect is attributed to one causation id, which makes the refund idempotent. */
  readonly causationId: string;
  readonly reason: string;
}

export interface RefundInput {
  readonly refundId: string;
  readonly paymentId: string;
  readonly subjectId: string;
  readonly amount: Money;
  /** True when the subscription's paid period has not yet elapsed at `at`. */
  readonly withinPaidPeriod: boolean;
  /** True when the refund concerns a marketplace listing rather than a subscription. */
  readonly marketplacePurchase: boolean;
  readonly creatorShareReversal: Money | null;
  readonly at: string;
  readonly reason: string;
}

/**
 * Decide the consequences. Pure — it does not apply anything.
 *
 * The two branches that matter:
 *
 *  - refund WITHIN the paid period → KEEP_ENTITLEMENT_UNTIL_PERIOD_END. The customer paid
 *    for that period; revoking it would be a retroactive charge. Entitlement lapses at period
 *    end via the existing CANCELLED → EXPIRED path, no special case needed.
 *
 *  - refund AFTER the period      → REVOKE_SUBSCRIPTION_ENTITLEMENT immediately. There is
 *    nothing left to honour.
 *
 * RESEARCH_OWNERSHIP is retained in both branches, unconditionally.
 */
export function decideRefund(input: RefundInput): RefundDecision {
  if (input.amount.minorUnits <= 0) throw new Error('INVALID_REFUND_AMOUNT');
  if (input.refundId.trim() === '') throw new Error('INVALID_REFUND_ID');
  if (input.reason.trim() === '') throw new Error('REFUND_REASON_REQUIRED');

  const consequences: RefundConsequence[] = [];

  if (input.marketplacePurchase) {
    consequences.push('REVOKE_PURCHASED_LISTING_ACCESS');
  } else {
    consequences.push(input.withinPaidPeriod ? 'KEEP_ENTITLEMENT_UNTIL_PERIOD_END' : 'REVOKE_SUBSCRIPTION_ENTITLEMENT');
  }

  // Unconditional. Removing a user's research to settle a billing dispute is not acceptable.
  consequences.push('RETAIN_RESEARCH_OWNERSHIP');

  const ledgerKinds: CommercialLedgerKind[] = ['REFUND_ISSUED'];
  if (input.creatorShareReversal !== null && input.creatorShareReversal.minorUnits > 0) {
    consequences.push('REVERSE_CREATOR_SHARE');
    ledgerKinds.push('PLATFORM_FEE', 'CREATOR_SHARE');
  }

  return {
    consequences,
    ledgerKinds,
    // One causation for the whole refund. Re-applying it appends nothing.
    causationId: `refund:${input.refundId}`,
    reason: input.reason,
  };
}

/** The money source a refund entry must carry. Never 'NONE'. */
export function refundMoneySource(input: { readonly provider: string | null }): MoneySource {
  if (input.provider === null) throw new Error('REFUND_WITHOUT_PROVIDER_SOURCE');
  return 'PROVIDER_REPORTED';
}