/**
 * BUSINESS-01 — CENTRALISED ENTITLEMENT ENGINE
 * =============================================
 * The ONE place a commercial capability decision is made (roadmap §01.3, §01.7).
 *
 * Everything that wants to know "may this subject use this capability?" goes through
 * `EntitlementEngine.evaluate`. No application code may compare a plan string.
 *
 * Evaluation order is fixed and total. Each step can only narrow the answer:
 *
 *   1. feature registration        unknown feature        -> DENIED_UNKNOWN_FEATURE
 *   2. feature implementation      not implemented        -> DENIED_FEATURE_NOT_IMPLEMENTED
 *   3. subject ownership           subscription mismatch  -> DENIED_SUBJECT_MISMATCH
 *   4. subscription resolution     none                   -> DENIED_NO_SUBSCRIPTION
 *   5. reconciliation state        requires reconciliation-> REQUIRES_RECONCILIATION
 *   6a. evaluation instant         invalid               -> REQUIRES_RECONCILIATION
 *   6b. cancellation window        window elapsed         -> DENIED_GRACE_EXPIRED
 *   6c. effective status           non-entitling         -> DENIED_SUBSCRIPTION_INACTIVE
 *                                    no settled payment    -> REQUIRES_PAYMENT
 *   7. plan feature membership     absent                 -> DENIED_FEATURE_NOT_IN_PLAN
 *   8. usage limit                 exhausted              -> LIMIT_REACHED
 *
 * Step 2 precedes step 7 on purpose: a plan can name a capability that has no
 * implementation, but the engine will still refuse it. This is what makes the feature
 * registry fail closed rather than aspirational.
 *
 * FAIL CLOSED (roadmap §29): every non-ALLOWED result denies. `EntitlementEngine` has no
 * branch that returns `allowed: true` without an explicit successful check at every step.
 */

import { featureExists, isFeatureImplemented, type FeatureId } from './features.ts';
import { planFeatures, requirePlan } from './plans.ts';
import { accessWindowElapsed, effectiveStatus } from './subscriptionMachine.ts';
import {
  ENTITLING_STATUSES,
  LIMIT_FIELD_BY_RESOURCE,
  type CommercialSubject,
  type EntitlementDecision,
  type EntitlementVerdict,
  type PlanId,
  type Subscription,
  type SubscriptionStatus,
  type UsageResource,
} from './types.ts';

/**
 * Reconciliation overlay (BUSINESS-05 §05.7). Supplied by the caller; when a subject is in a
 * known-inconsistent commercial state the engine refuses to guess and returns
 * REQUIRES_RECONCILIATION instead of ALLOWED.
 */
export type ReconciliationState =
  | 'CONSISTENT'
  | 'PAYMENT_UNKNOWN'
  | 'PAYMENT_FAILED'
  | 'ENTITLEMENT_MISSING'
  | 'ENTITLEMENT_ORPHANED'
  | 'NOT_APPLICABLE';

export interface EntitlementInput {
  readonly subject: CommercialSubject;
  readonly feature: string;
  /** Injected instant, ISO-8601. The engine never reads the wall clock. */
  readonly at: string;
  /** The subject's current subscription, or null when the subject has none. */
  readonly subscription: Subscription | null;
  /**
   * Optional metered resource. When present the engine additionally enforces the plan limit.
   * A feature with no mapped resource is unmetered.
   */
  readonly meter?: UsageResource | null;
  /** Consumption already recorded for the current period. */
  readonly consumed?: number | null;
  /** Reconciliation state for this subject. Defaults to NOT_APPLICABLE. */
  readonly reconciliation?: ReconciliationState;
}

interface Base {
  readonly subject: CommercialSubject;
  readonly at: string;
}

function verdict(
  base: Base,
  decision: EntitlementDecision,
  extra: {
    readonly feature?: FeatureId | null;
    readonly planId?: PlanId | null;
    readonly subscriptionStatus?: SubscriptionStatus | null;
    readonly limit?: UsageResource | null;
    readonly limitValue?: number | null;
    readonly consumed?: number | null;
    readonly remaining?: number | null;
    readonly reason?: string | null;
  } = {},
): EntitlementVerdict {
  return {
    decision,
    allowed: decision === 'ALLOWED',
    feature: extra.feature ?? null,
    subjectId: base.subject.subjectId,
    planId: extra.planId ?? null,
    subscriptionStatus: extra.subscriptionStatus ?? null,
    limit: extra.limit ?? null,
    limitValue: extra.limitValue ?? null,
    consumed: extra.consumed ?? null,
    remaining: extra.remaining ?? null,
    reason: extra.reason ?? (decision === 'ALLOWED' ? null : decision),
    evaluatedAt: base.at,
  };
}

export class EntitlementEngine {
  /**
   * Total, deterministic, fail-closed. Never throws for a business decision — an
   * unregistered feature is a DENIAL, not an exception, so that a typo can never escalate
   * to an allow.
   */
  static evaluate(input: EntitlementInput): EntitlementVerdict {
    const base: Base = { subject: input.subject, at: input.at };

    // 1. feature registration ---------------------------------------------------
    if (!featureExists(input.feature)) {
      return verdict(base, 'DENIED_UNKNOWN_FEATURE', { reason: `UNKNOWN_FEATURE:${input.feature}` });
    }
    const feature: FeatureId = input.feature;

    // 2. implementation status -------------------------------------------------
    if (!isFeatureImplemented(feature)) {
      return verdict(base, 'DENIED_FEATURE_NOT_IMPLEMENTED', {
        feature,
        reason: `FEATURE_NOT_IMPLEMENTED:${feature}`,
      });
    }

    // 3. subscription ownership ------------------------------------------------
    const sub = input.subscription;
    if (sub === null) {
      return verdict(base, 'DENIED_NO_SUBSCRIPTION', {
        feature,
        reason: 'NO_SUBSCRIPTION_FOR_SUBJECT',
      });
    }
    if (sub.subjectId !== input.subject.subjectId) {
      return verdict(base, 'DENIED_SUBJECT_MISMATCH', {
        feature,
        subscriptionStatus: sub.status,
        reason: `SUBSCRIPTION_BELONGS_TO_OTHER_SUBJECT:${sub.subjectId}`,
      });
    }

    // 4. plan resolution -------------------------------------------------------
    let plan;
    try {
      plan = requirePlan(sub.planId);
    } catch {
      // An unknown persisted plan id is a data-integrity failure. Fail closed.
      return verdict(base, 'REQUIRES_RECONCILIATION', {
        feature,
        subscriptionStatus: sub.status,
        reason: `UNKNOWN_PLAN:${sub.planId}`,
      });
    }

    // 5. reconciliation overlay ------------------------------------------------
    const recon = input.reconciliation ?? 'NOT_APPLICABLE';
    if (recon === 'PAYMENT_UNKNOWN' || recon === 'ENTITLEMENT_ORPHANED' || recon === 'ENTITLEMENT_MISSING') {
      // §29: ENTITLEMENT_UNKNOWN must never become ALLOWED.
      return verdict(base, 'REQUIRES_RECONCILIATION', {
        feature,
        planId: plan.id,
        subscriptionStatus: sub.status,
        reason: `RECONCILIATION:${recon}`,
      });
    }

    // 6a. evaluation instant validity --------------------------------------------------
    const atMs = Date.parse(input.at);
    if (Number.isNaN(atMs)) {
      return verdict(base, 'REQUIRES_RECONCILIATION', {
        feature,
        planId: plan.id,
        reason: 'INVALID_EVALUATION_INSTANT',
      });
    }
    // 6b. access window (cancellation grace) -------------------------------------
    // Roadmap §01.2: cancelling does NOT immediately delete access. Access runs until the
    // paid period ends and then through the grace window; only after both have elapsed is
    // the capability denied.
    //
    // This is evaluated against the RAW status, before the derived effective status, so
    // that a lapsed cancellation yields the specific DENIED_GRACE_EXPIRED decision rather
    // than the generic inactive-subscription denial.
    if (sub.status === 'CANCELLED' && accessWindowElapsed(sub, atMs)) {
      return verdict(base, 'DENIED_GRACE_EXPIRED', {
        feature,
        planId: plan.id,
        subscriptionStatus: 'CANCELLED',
        reason: 'PAID_PERIOD_AND_GRACE_ELAPSED',
      });
    }

    // 6c. effective subscription status ---------------------------------------------------
    const status = effectiveStatus(sub, atMs);
    if (status === 'INCOMPLETE') {
      // A subscription that has never had a settled payment grants nothing, and says so
      // explicitly rather than reporting a generic denial (roadmap §29 PAYMENT_REQUIRED).
      return verdict(base, 'REQUIRES_PAYMENT', {
        feature,
        planId: plan.id,
        subscriptionStatus: status,
        reason: 'PAYMENT_REQUIRED:NO_SETTLED_PAYMENT',
      });
    }
    if (!ENTITLING_STATUSES.has(status) && status !== 'CANCELLED') {
      return verdict(base, 'DENIED_SUBSCRIPTION_INACTIVE', {
        feature,
        planId: plan.id,
        subscriptionStatus: status,
        reason: `SUBSCRIPTION_${status}`,
      });
    }

    // 7. plan feature membership ----------------------------------------------
    if (!planFeatures(plan).includes(feature)) {
      return verdict(base, 'DENIED_FEATURE_NOT_IN_PLAN', {
        feature,
        planId: plan.id,
        subscriptionStatus: status,
        reason: `FEATURE_NOT_INCLUDED_IN_PLAN:${plan.id}`,
      });
    }

    // 8. usage limit -----------------------------------------------------------
    const meter = input.meter ?? null;
    if (meter === null) {
      return verdict(base, 'ALLOWED', { feature, planId: plan.id, subscriptionStatus: status });
    }

    const field = LIMIT_FIELD_BY_RESOURCE[meter];
    const limitValue = plan.limits[field];
    const consumed = input.consumed ?? 0;

    if (limitValue === null) {
      // Unlimited. Record the observed consumption, no cap.
      return verdict(base, 'ALLOWED', {
        feature,
        planId: plan.id,
        subscriptionStatus: status,
        limit: meter,
        limitValue: null,
        consumed,
        remaining: null,
      });
    }

    if (consumed >= limitValue) {
      return verdict(base, 'LIMIT_REACHED', {
        feature,
        planId: plan.id,
        subscriptionStatus: status,
        limit: meter,
        limitValue,
        consumed,
        remaining: 0,
        reason: `LIMIT_REACHED:${meter} ${consumed}/${limitValue}`,
      });
    }

    return verdict(base, 'ALLOWED', {
      feature,
      planId: plan.id,
      subscriptionStatus: status,
      limit: meter,
      limitValue,
      consumed,
      remaining: limitValue - consumed,
    });
  }

  /** Convenience wrapper: boolean-only projection of `evaluate`. */
  static canAccess(input: EntitlementInput): boolean {
    return EntitlementEngine.evaluate(input).allowed;
  }

  /** True only when a paid (non-free) subscription backs the capability. */
  static requiresPayment(verdict: EntitlementVerdict): boolean {
    return verdict.decision === 'REQUIRES_PAYMENT';
  }
}