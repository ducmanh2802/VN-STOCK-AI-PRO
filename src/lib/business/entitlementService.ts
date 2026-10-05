/**
 * BUSINESS-01 — MONETIZATION FOUNDATION SERVICE
 * ==============================================
 * Orchestrates plan resolution, subscription lifecycle, entitlement evaluation, usage
 * metering and the commercial audit trail into the single surface the rest of the platform
 * (and the API router) consumes.
 *
 * This service is the ONLY thing the application layer may call. It enforces the invariants
 * that cannot be expressed by the pure engines alone:
 *
 *   - metering happens only AFTER an entitlement check succeeds
 *   - every mutation appends exactly one audit event
 *   - duplicate usage events append a distinct audit event and change nothing
 *   - no commercial decision is ever made from a wall clock
 *
 * Dependencies are injected, so the service is fully testable without a database and without
 * a payment provider.
 */

import { actorFromPrincipal, type BusinessActor } from './actor.ts';
import type { CommercialAuditLog } from './auditLog.ts';
import { EntitlementEngine, type ReconciliationState } from './entitlementEngine.ts';
import { isFeatureImplemented, isFeatureReachable, type FeatureId } from './features.ts';
import { FREE_PLAN_ID, freePlan, planAllowsSubjectKind, planFeatures, requirePlan } from './plans.ts';
import { effectiveStatus, startFreeSubscription, transition } from './subscriptionMachine.ts';
import type {
  CommercialSubject,
  EntitlementVerdict,
  PlanId,
  SubscriptionStatus,
  Subscription,
  UsageResource,
} from './types.ts';
import { LIMIT_FIELD_BY_RESOURCE as LIMIT_FIELD_BY_RESOURCE_IMPORT } from './types.ts';
import type { UsageMeter } from './usageMeter.ts';

/**
 * Storage seam. Backed by drizzle in production, by a Map in tests.
 *
 * ASYNC BY DESIGN (roadmap §6: modular monolith on top of the existing repository
 * convention, where every repository method is `static async`). Making the seam async means
 * ONE contract serves both the in-memory and the SQL implementation, so every behavioural
 * test written against the in-memory pair is meaningful for the SQL pair. No caller ever has
 * to know which implementation it holds.
 */
export interface SubscriptionStore {
  findBySubject(subjectId: string): Promise<Subscription | null>;
  save(sub: Subscription): Promise<void>;
  list(): Promise<readonly Subscription[]>;
}

export class InMemorySubscriptionStore implements SubscriptionStore {
  private readonly bySubject = new Map<string, Subscription>();
  async findBySubject(subjectId: string): Promise<Subscription | null> {
    return this.bySubject.get(subjectId) ?? null;
  }
  async save(sub: Subscription): Promise<void> {
    this.bySubject.set(sub.subjectId, sub);
  }
  async list(): Promise<readonly Subscription[]> {
    return [...this.bySubject.values()];
  }
}

export interface EntitlementServiceDeps {
  readonly subscriptions: SubscriptionStore;
  readonly usage: UsageMeter;
  readonly audit: CommercialAuditLog;
  /** Reconciliation overlay source. Returns NOT_APPLICABLE when nothing is pending. */
  readonly reconciliation?: (subjectId: string) => ReconciliationState;
}

/** The result of a capability probe, including the usage charge that followed it. */
export interface CapabilityResult {
  readonly verdict: EntitlementVerdict;
  /** Present when a usage charge was attempted. */
  readonly usageEventId: string | null;
  readonly usageDuplicate: boolean;
  readonly bucketConsumedAfter: number | null;
}

export class EntitlementService {
  private readonly subscriptions: SubscriptionStore;
  private readonly usage: UsageMeter;
  private readonly audit: CommercialAuditLog;
  private readonly reconciliation: (subjectId: string) => ReconciliationState;

  constructor(deps: EntitlementServiceDeps) {
    this.subscriptions = deps.subscriptions;
    this.usage = deps.usage;
    this.audit = deps.audit;
    this.reconciliation = deps.reconciliation ?? (() => 'NOT_APPLICABLE');
  }

  // ---------------------------------------------------------------- resolution

  /** Total plan resolution. Never returns undefined. */
  async resolvePlan(subjectId: string): Promise<PlanId> {
    const sub = await this.subscriptions.findBySubject(subjectId);
    if (sub === null) return freePlan().id;
    return sub.planId;
  }

  /** Every feature the subject's plan names, with implementation status attached. */
  async describePlan(subjectId: string): Promise<{
    readonly planId: PlanId;
    readonly label: string;
    readonly features: readonly { readonly id: FeatureId; readonly implemented: boolean }[];
  }> {
    const planId = await this.resolvePlan(subjectId);
    const plan = requirePlan(planId);
    return {
      planId,
      label: plan.label,
      features: planFeatures(plan).map((id) => ({
        id,
        implemented: isFeatureImplemented(id),
        reachable: isFeatureReachable(id),
      })),
    };
  }

  // ------------------------------------------------------------- free tier

  /**
   * Ensure the subject has an explicit subscription. The FREE plan is data-driven
   * (roadmap §01.6) — there is no implicit branch anywhere else in the codebase.
   * Idempotent: calling twice does not create a second subscription.
   */
  async ensureFreeSubscription(subjectId: string, at: string): Promise<Subscription> {
    const existing = await this.subscriptions.findBySubject(subjectId);
    if (existing !== null) return existing;
    const sub = startFreeSubscription({
      subscriptionId: `sub_free_${subjectId}`,
      subjectId,
      at,
    });
    await this.subscriptions.save(sub);
    await this.audit.record({
      action: 'subscription_created',
      outcome: 'SUCCESS',
      subjectId,
      occurredAt: at,
      reason: 'FREE_TIER_ASSIGNED',
      metadata: { planId: 'FREE', subscriptionId: sub.subscriptionId },
    });
    return sub;
  }

  /**
   * Open a paid subscription, upgrading a subject that currently holds FREE.
   *
   * This is the only path that creates a non-FREE subscription, and it exists because
   * `ensureFreeSubscription` deliberately cannot be widened into one: silently flipping a
   * plan on an existing subscription would let a plan change grant paid entitlements with no
   * settled payment behind it.
   *
   * Three cases, all explicit:
   *   - no subscription        -> create the paid one
   *   - holds FREE             -> replace it (this is the ordinary upgrade)
   *   - holds a non-FREE plan  -> REFUSED. Replacing an active paid subscription would be a
   *                               second charge for the same subject; the caller must go
   *                               through changePlan + a settled payment instead.
   *
   * `status` is the caller's assertion about the money behind it. Passing 'ACTIVE' with no
   * payment reference is refused — that is the "commercial state with no money behind it"
   * case, and it is exactly what this guard exists to stop.
   */
  async openPaidSubscription(input: {
    readonly subjectId: string;
    readonly planId: PlanId;
    readonly status: SubscriptionStatus;
    readonly currentPeriodStart: string | null;
    readonly currentPeriodEnd: string | null;
    readonly trialEndsAt: string | null;
    readonly providerRef: string | null;
    readonly at: string;
    readonly actorUserId: string | null;
    readonly actorSessionId: string | null;
    readonly correlationId: string | null;
    readonly reason: string;
  }): Promise<Subscription> {
    const plan = requirePlan(input.planId);
    if (plan.id === FREE_PLAN_ID) throw new Error('USE_ENSURE_FREE_SUBSCRIPTION_FOR_FREE');
    if (input.status === 'ACTIVE' && input.providerRef === null) {
      throw new Error('ACTIVE_SUBSCRIPTION_REQUIRES_PAYMENT_REFERENCE');
    }

    const existing = await this.subscriptions.findBySubject(input.subjectId);
    if (existing !== null && existing.planId !== FREE_PLAN_ID) {
      throw new Error('PAID_SUBSCRIPTION_ALREADY_EXISTS');
    }

    const sub: Subscription = {
      subscriptionId: existing?.subscriptionId ?? `sub_${input.subjectId}`,
      subjectId: input.subjectId,
      planId: input.planId,
      status: input.status,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      gracePeriodEnd: null,
      trialEndsAt: input.trialEndsAt,
      createdAt: existing?.createdAt ?? input.at,
      updatedAt: input.at,
      providerRef: input.providerRef,
    };
    await this.subscriptions.save(sub);
    await this.audit.record({
      action: existing === null ? 'subscription_started' : 'plan_changed',
      outcome: 'SUCCESS',
      subjectId: input.subjectId,
      actorUserId: input.actorUserId,
      actorSessionId: input.actorSessionId,
      correlationId: input.correlationId,
      occurredAt: input.at,
      reason: input.reason,
      metadata: {
        planId: input.planId,
        status: input.status,
        providerRef: input.providerRef ?? 'NONE',
        from: existing?.planId ?? 'NONE',
      },
    });
    return sub;
  }

  // ------------------------------------------------------------- lifecycle

  /** Apply a subscription status transition. Rejects illegal transitions. */
  async changeStatus(input: {
    readonly subjectId: string;
    readonly to: SubscriptionStatus;
    readonly at: string;
    readonly actorUserId: string | null;
    readonly actorSessionId: string | null;
    readonly correlationId: string | null;
    readonly reason: string;
  }): Promise<Subscription> {
    const sub = await this.subscriptions.findBySubject(input.subjectId);
    if (sub === null) throw new Error('NO_SUBSCRIPTION_FOR_SUBJECT');

    const next = transition(sub, input.to, input.at);
    await this.subscriptions.save(next);

    const action = statusAction(next.status);
    await this.audit.record({
      action,
      outcome: 'SUCCESS',
      subjectId: input.subjectId,
      actorUserId: input.actorUserId,
      actorSessionId: input.actorSessionId,
      correlationId: input.correlationId,
      occurredAt: input.at,
      reason: input.reason,
      metadata: { from: sub.status, to: next.status, planId: next.planId },
    });
    return next;
  }

  /** Change plan. The plan must permit the subject's kind (individual vs organization). */
  async changePlan(input: {
    readonly subjectId: string;
    readonly to: PlanId;
    readonly at: string;
    readonly actorUserId: string | null;
    readonly actorSessionId: string | null;
    readonly correlationId: string | null;
    readonly reason: string;
  }): Promise<Subscription> {
    const sub = await this.subscriptions.findBySubject(input.subjectId);
    if (sub === null) throw new Error('NO_SUBSCRIPTION_FOR_SUBJECT');

    const nextPlan = requirePlan(input.to);
    const subjectKind = planKindOf(sub);
    if (!planAllowsSubjectKind(nextPlan, subjectKind)) {
      // An organization subject may not be moved onto an individual-only plan and vice
      // versa. Fail closed rather than silently coercing.
      throw new Error(`PLAN_NOT_ALLOWED_FOR_SUBJECT_KIND:${input.to}`);
    }

    const next: Subscription = { ...sub, planId: input.to, updatedAt: input.at };
    await this.subscriptions.save(next);
    await this.audit.record({
      action: 'plan_changed',
      outcome: 'SUCCESS',
      subjectId: input.subjectId,
      actorUserId: input.actorUserId,
      actorSessionId: input.actorSessionId,
      correlationId: input.correlationId,
      occurredAt: input.at,
      reason: input.reason,
      metadata: { from: sub.planId, to: input.to },
    });
    return next;
  }

  // ------------------------------------------------------------- capability

  /**
   * The single capability probe.
   *
   * When `meter` is supplied and the entitlement is ALLOWED, exactly one usage event is
   * recorded. If the usage event id has already been consumed, the meter is a no-op and a
   * `usage_duplicate_ignored` audit event is appended — the entitlement decision itself is
   * unchanged, because consumption is not authorisation.
   */
  async check(input: {
    readonly actor: BusinessActor;
    readonly feature: string;
    readonly at: string;
    readonly meter?: UsageResource | null;
    readonly periodKey: string;
    readonly usageEventId?: string | null;
    readonly quantity?: number;
  }): Promise<CapabilityResult> {
    const subject = input.actor.subject;

    // A disabled/locked platform account can never act commercially. Defence in depth:
    // actorFromPrincipal already rejects it, this guards a hand-constructed actor.
    if (input.actor.platformUserStatus !== 'ACTIVE') {
      const verdict = deniedForPlatformStatus(subject, input.feature, input.at, input.actor.platformUserStatus);
      await this.audit.record({
        action: 'entitlement_denied',
        outcome: 'REJECTED',
        subjectId: subject.subjectId,
        organizationId: subject.organizationId,
        actorUserId: subject.subjectId,
        actorSessionId: subject.sessionId,
        correlationId: subject.correlationId,
        occurredAt: input.at,
        reason: `PLATFORM_STATUS:${input.actor.platformUserStatus}`,
        metadata: { feature: input.feature },
      });
      return { verdict, usageEventId: null, usageDuplicate: false, bucketConsumedAfter: null };
    }

    const sub = await this.subscriptions.findBySubject(subject.subjectId);
    const meter = input.meter ?? null;

    const verdict = EntitlementEngine.evaluate({
      subject,
      feature: input.feature,
      at: input.at,
      subscription: sub,
      meter,
      consumed: meter === null ? null : await this.usage.consumed(subject.subjectId, meter, input.periodKey),
      reconciliation: this.reconciliation(subject.subjectId),
    });

    if (!verdict.allowed) {
      await this.audit.record({
        action: 'entitlement_denied',
        outcome: 'REJECTED',
        subjectId: subject.subjectId,
        organizationId: subject.organizationId,
        actorUserId: subject.subjectId,
        actorSessionId: subject.sessionId,
        correlationId: subject.correlationId,
        occurredAt: input.at,
        reason: verdict.reason ?? verdict.decision,
        metadata: {
          feature: input.feature,
          decision: verdict.decision,
          planId: verdict.planId ?? 'NONE',
          subscriptionStatus: verdict.subscriptionStatus ?? 'NONE',
        },
      });
      return { verdict, usageEventId: null, usageDuplicate: false, bucketConsumedAfter: null };
    }

    if (meter === null || input.usageEventId === null || input.usageEventId === undefined) {
      await this.audit.record({
        action: 'entitlement_granted',
        outcome: 'SUCCESS',
        subjectId: subject.subjectId,
        organizationId: subject.organizationId,
        actorUserId: subject.subjectId,
        actorSessionId: subject.sessionId,
        correlationId: subject.correlationId,
        occurredAt: input.at,
        reason: 'CAPABILITY_GRANTED',
        metadata: { feature: input.feature, planId: verdict.planId ?? 'NONE' },
      });
      return { verdict, usageEventId: null, usageDuplicate: false, bucketConsumedAfter: null };
    }

    const usageResult = await this.usage.record(
      {
        eventId: input.usageEventId,
        subjectId: subject.subjectId,
        resource: meter,
        quantity: input.quantity ?? 1,
        occurredAt: input.at,
        periodKey: input.periodKey,
        metadata: { feature: input.feature, planId: verdict.planId ?? 'NONE' },
      },
      input.at,
    );

    await this.audit.record({
      action: usageResult.duplicate ? 'usage_duplicate_ignored' : 'usage_recorded',
      outcome: 'SUCCESS',
      subjectId: subject.subjectId,
      organizationId: subject.organizationId,
      actorUserId: subject.subjectId,
      actorSessionId: subject.sessionId,
      correlationId: subject.correlationId,
      occurredAt: input.at,
      reason: usageResult.duplicate ? 'IDEMPOTENT_REPLAY' : 'USAGE_CONSUMED',
      metadata: {
        resource: meter,
        quantity: String(input.quantity ?? 1),
        bucketConsumed: String(usageResult.bucketConsumed),
        eventId: usageResult.eventId,
      },
    });

    return {
      verdict,
      usageEventId: usageResult.eventId,
      usageDuplicate: usageResult.duplicate,
      bucketConsumedAfter: usageResult.bucketConsumed,
    };
  }

  /** Remaining usage for a resource in a period. `null` means unlimited. */
  async remaining(input: {
    readonly subjectId: string;
    readonly resource: UsageResource;
    readonly periodKey: string;
  }): Promise<{ readonly limit: number | null; readonly consumed: number; readonly remaining: number | null }> {
    const planId = await this.resolvePlan(input.subjectId);
    const plan = requirePlan(planId);
    const limit = plan.limits[LIMIT_FIELD_BY_RESOURCE_IMPORT[input.resource]];
    const consumed = await this.usage.consumed(input.subjectId, input.resource, input.periodKey);
    return { limit, consumed, remaining: limit === null ? null : Math.max(0, limit - consumed) };
  }

  /** Current effective subscription status for a subject. */
  async statusOf(subjectId: string, atMs: number): Promise<SubscriptionStatus | null> {
    const sub = await this.subscriptions.findBySubject(subjectId);
    if (sub === null) return null;
    return effectiveStatus(sub, atMs);
  }
}

// ---------------------------------------------------------------------------

function planKindOf(sub: Subscription): 'USER' | 'ORGANIZATION' {
  // A subscription is organization-scoped when its plan is organization-only.
  return requirePlan(sub.planId).individual ? 'USER' : 'ORGANIZATION';
}

function statusAction(status: SubscriptionStatus): 'subscription_started' | 'subscription_changed' | 'subscription_cancelled' | 'subscription_paused' | 'subscription_resumed' | 'subscription_expired' {
  switch (status) {
    case 'TRIALING':
      return 'subscription_started';
    case 'ACTIVE':
      return 'subscription_changed';
    case 'PAST_DUE':
      return 'subscription_changed';
    case 'PAUSED':
      return 'subscription_paused';
    case 'CANCELLED':
      return 'subscription_cancelled';
    case 'EXPIRED':
      return 'subscription_expired';
    default:
      return 'subscription_changed';
  }
}

function deniedForPlatformStatus(
  subject: CommercialSubject,
  feature: string,
  at: string,
  status: string,
): EntitlementVerdict {
  return {
    decision: 'DENIED_SUBJECT_MISMATCH',
    allowed: false,
    feature: (feature as FeatureId) ?? null,
    subjectId: subject.subjectId,
    planId: null,
    subscriptionStatus: null,
    limit: null,
    limitValue: null,
    consumed: null,
    remaining: null,
    reason: `ACCOUNT_${status}`,
    evaluatedAt: at,
  };
}

// Imported lazily at the bottom to keep the module graph flat.
export { actorFromPrincipal };