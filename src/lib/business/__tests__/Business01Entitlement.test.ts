/**
 * BUSINESS-01 TESTS — subscription lifecycle, entitlement decisions, feature access,
 *                   usage limits, trial, expired, cancelled, fail-closed
 */
import { describe, it, expect } from 'vitest';
import { actorFromPrincipal, anonymousSubject } from '../actor.ts';
import { InMemoryCommercialAuditLog } from '../auditLog.ts';
import {
  EntitlementEngine,
  type ReconciliationState,
} from '../entitlementEngine.ts';
import { EntitlementService, InMemorySubscriptionStore } from '../entitlementService.ts';
import {
  applyTransition,
  canTransition,
  effectiveStatus,
  isTerminal,
  legalTargets,
  requireSubscriptionStatus,
  startFreeSubscription,
  startTrial,
  SUBSCRIPTION_TRANSITIONS,
  transition,
} from '../subscriptionMachine.ts';
import type { CommercialSubject, Subscription } from '../types.ts';
import { InMemoryUsageMeter, validateUsageEvent } from '../usageMeter.ts';

const NOW = '2026-10-15T00:00:00Z';
const NOW_MS = Date.parse(NOW);

function subject(id = 'u1', kind: 'USER' | 'ORGANIZATION' = 'USER'): CommercialSubject {
  return {
    subjectId: id,
    kind,
    organizationId: kind === 'ORGANIZATION' ? id : null,
    sessionId: 'sess_1',
    correlationId: 'corr_1',
  };
}

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    subscriptionId: 'sub_1',
    subjectId: 'u1',
    planId: 'FREE',
    status: 'ACTIVE',
    currentPeriodStart: '2026-10-01T00:00:00Z',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    gracePeriodEnd: null,
    trialEndsAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    providerRef: null,
    ...over,
  };
}

function recon(state: ReconciliationState) {
  return () => state;
}

// -----------------------------------------------------------------------------

describe('SubscriptionStateMachine', () => {
  it('rejects an unknown status', () => {
    expect(() => requireSubscriptionStatus('PENDING_REVIEW')).toThrow('UNKNOWN_SUBSCRIPTION_STATUS:PENDING_REVIEW');
  });

  it('allows the documented lifecycle edges', () => {
    expect(canTransition('TRIALING', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'PAST_DUE')).toBe(true);
    expect(canTransition('PAST_DUE', 'ACTIVE')).toBe(true);
    expect(canTransition('PAST_DUE', 'CANCELLED')).toBe(true);
    expect(canTransition('ACTIVE', 'CANCELLED')).toBe(true);
    expect(canTransition('CANCELLED', 'EXPIRED')).toBe(true);
    expect(canTransition('INCOMPLETE', 'ACTIVE')).toBe(true);
  });

  it('rejects illegal transitions by throwing (roadmap §05.3)', () => {
    expect(() => transition(sub({ status: 'EXPIRED' }), 'TRIALING', NOW)).toThrow('INVALID_SUBSCRIPTION_TRANSITION');
    expect(() => transition(sub({ status: 'UNAVAILABLE' }), 'ACTIVE', NOW)).toThrow('INVALID_SUBSCRIPTION_TRANSITION');
    expect(() => transition(sub({ status: 'INCOMPLETE' }), 'TRIALING', NOW)).toThrow('INVALID_SUBSCRIPTION_TRANSITION');
    expect(() => requireSubscriptionStatus('NOT_A_STATUS')).toThrow('UNKNOWN_SUBSCRIPTION_STATUS:NOT_A_STATUS');
  });

  it('never mutates the input subscription', () => {
    const before = sub();
    const after = transition(before, 'CANCELLED', NOW);
    expect(before.status).toBe('ACTIVE');
    expect(after).not.toBe(before);
    expect(after.status).toBe('CANCELLED');
  });

  it('does not delete access on cancellation (roadmap §01.2)', () => {
    const cancelled = transition(
      sub({ planId: 'PRO', currentPeriodEnd: '2026-11-01T00:00:00Z' }),
      'CANCELLED',
      NOW,
    );
    expect(cancelled.cancelledAt).toBe(NOW);
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect(cancelled.currentPeriodEnd).toBe('2026-11-01T00:00:00Z');

    // inside the paid period: still entitling
    const inside = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'BACKTEST',
      at: '2026-10-20T00:00:00Z',
      subscription: cancelled,
    });
    expect(inside.allowed).toBe(true);

    // past the paid period: denied
    const outside = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'BACKTEST',
      at: '2026-12-01T00:00:00Z',
      subscription: cancelled,
    });
    expect(outside.allowed).toBe(false);
    expect(outside.decision).toBe('DENIED_GRACE_EXPIRED');
  });

  it('derives an effective status from the injected instant, never a clock', () => {
    const trial = startTrial({
      subscriptionId: 'sub_t',
      subjectId: 'u1',
      planId: 'PRO',
      at: '2026-10-01T00:00:00Z',
      trialEndsAt: '2026-10-10T00:00:00Z',
      currentPeriodEnd: '2026-11-01T00:00:00Z',
    });
    expect(effectiveStatus(trial, Date.parse('2026-10-05T00:00:00Z'))).toBe('TRIALING');
    expect(effectiveStatus(trial, Date.parse('2026-10-11T00:00:00Z'))).toBe('EXPIRED');
  });

  it('marks UNAVAILABLE as terminal and fail-closed', () => {
    expect(isTerminal('UNAVAILABLE')).toBe(true);
    expect(legalTargets('UNAVAILABLE')).toEqual([]);
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'LEARNING',
      at: NOW,
      subscription: sub({ status: 'UNAVAILABLE' }),
    });
    expect(v.allowed).toBe(false);
    expect(v.decision).toBe('DENIED_SUBSCRIPTION_INACTIVE');
  });

  it('records PAST_DUE without granting more grace than exists', () => {
    const pastDue = applyTransition(sub({ status: 'ACTIVE' }), 'PAST_DUE', NOW);
    expect(pastDue.status).toBe('PAST_DUE');
    // a payment failure never fabricates a grace window that was not set by policy
    expect(pastDue.gracePeriodEnd).toBeNull();
  });
});

// -----------------------------------------------------------------------------

describe('EntitlementEngine', () => {
  it('denies an unregistered feature before anything else', () => {
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'MADE_UP',
      at: NOW,
      subscription: sub(),
    });
    expect(v.decision).toBe('DENIED_UNKNOWN_FEATURE');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('UNKNOWN_FEATURE');
  });

  it('denies a feature whose plan grants it but which has no implementation', () => {
    // API_ACCESS is in ENTERPRISE but NOT_YET_AVAILABLE per the PHASE 0 audit.
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'API_ACCESS',
      at: NOW,
      subscription: sub({ planId: 'ENTERPRISE', status: 'ACTIVE' }),
    });
    expect(v.decision).toBe('DENIED_FEATURE_NOT_IMPLEMENTED');
    expect(v.allowed).toBe(false);
  });

  it('denies when the subject has no subscription', () => {
    const v = EntitlementEngine.evaluate({ subject: subject(), feature: 'LEARNING', at: NOW, subscription: null });
    expect(v.decision).toBe('DENIED_NO_SUBSCRIPTION');
  });

  it('denies a subscription that belongs to a different subject (IDOR, roadmap §02.4)', () => {
    const v = EntitlementEngine.evaluate({
      subject: subject('u1'),
      feature: 'LEARNING',
      at: NOW,
      subscription: sub({ subjectId: 'u2' }),
    });
    expect(v.decision).toBe('DENIED_SUBJECT_MISMATCH');
    expect(v.reason).toContain('u2');
  });

  it('denies an unknown persisted plan id rather than guessing', () => {
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'LEARNING',
      at: NOW,
      subscription: sub({ planId: 'DIAMOND' as Subscription['planId'] }),
    });
    expect(v.decision).toBe('REQUIRES_RECONCILIATION');
    expect(v.reason).toContain('UNKNOWN_PLAN');
  });

  it('grants FREE learning and denies FREE backtesting', () => {
    const allow = EntitlementEngine.evaluate({ subject: subject(), feature: 'LEARNING', at: NOW, subscription: sub() });
    expect(allow.allowed).toBe(true);
    expect(allow.planId).toBe('FREE');
    expect(allow.reason).toBeNull();

    const deny = EntitlementEngine.evaluate({ subject: subject(), feature: 'BACKTEST', at: NOW, subscription: sub() });
    expect(deny.decision).toBe('DENIED_FEATURE_NOT_IN_PLAN');
  });

  it('refuses to allow while reconciliation is pending (roadmap §29)', () => {
    for (const state of ['PAYMENT_UNKNOWN', 'ENTITLEMENT_MISSING', 'ENTITLEMENT_ORPHANED'] as const) {
      const v = EntitlementEngine.evaluate({
        subject: subject(),
        feature: 'LEARNING',
        at: NOW,
        subscription: sub({ planId: 'PRO', status: 'ACTIVE' }),
        reconciliation: state,
      });
      expect(v.allowed).toBe(false);
      expect(v.decision).toBe('REQUIRES_RECONCILIATION');
      expect(v.reason).toContain(state);
    }
  });

  it('keeps access during PAST_DUE grace and drops it once grace elapses', () => {
    const pastDue = sub({ planId: 'PRO', status: 'PAST_DUE', gracePeriodEnd: '2026-11-01T00:00:00Z' });

    // Inside the grace window a failed renewal does not withdraw service: that is exactly
    // what a grace period is for. The overdue condition stays visible on the verdict.
    const inside = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'LEARNING',
      at: NOW,
      subscription: pastDue,
    });
    expect(inside.allowed).toBe(true);
    expect(inside.subscriptionStatus).toBe('PAST_DUE');

    // Grace elapsed: the derived status is EXPIRED and access is gone.
    const outside = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'LEARNING',
      at: '2026-12-01T00:00:00Z',
      subscription: pastDue,
    });
    expect(outside.allowed).toBe(false);
    expect(outside.subscriptionStatus).toBe('EXPIRED');
    expect(outside.decision).toBe('DENIED_SUBSCRIPTION_INACTIVE');
  });

  it('reports REQUIRES_PAYMENT for a subscription with no settled payment', () => {
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'BACKTEST',
      at: NOW,
      subscription: sub({ planId: 'PRO', status: 'INCOMPLETE' }),
    });
    expect(v.decision).toBe('REQUIRES_PAYMENT');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('NO_SETTLED_PAYMENT');
  });

  it('expires a PAST_DUE subscription once grace has elapsed', () => {
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'LEARNING',
      at: '2026-12-01T00:00:00Z',
      subscription: sub({ planId: 'PRO', status: 'PAST_DUE', gracePeriodEnd: '2026-11-01T00:00:00Z' }),
    });
    expect(v.allowed).toBe(false);
    expect(v.subscriptionStatus).toBe('EXPIRED');
  });

  it('rejects an invalid evaluation instant instead of guessing', () => {
    const v = EntitlementEngine.evaluate({ subject: subject(), feature: 'LEARNING', at: 'not-a-date', subscription: sub() });
    expect(v.decision).toBe('REQUIRES_RECONCILIATION');
  });

  it('enforces the usage limit and reports remaining headroom', () => {
    const s = sub({ planId: 'PREMIUM', status: 'ACTIVE' });
    const first = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'AI_ASSISTANT',
      at: NOW,
      subscription: s,
      meter: 'AI_REQUESTS',
      consumed: 499,
    });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const last = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'AI_ASSISTANT',
      at: NOW,
      subscription: s,
      meter: 'AI_REQUESTS',
      consumed: 500,
    });
    expect(last.decision).toBe('LIMIT_REACHED');
    expect(last.remaining).toBe(0);
    expect(last.limitValue).toBe(500);
  });

  it('treats a null limit as unlimited and still reports consumption', () => {
    const v = EntitlementEngine.evaluate({
      subject: subject(),
      feature: 'LEARNING',
      at: NOW,
      subscription: sub({ planId: 'ENTERPRISE', status: 'ACTIVE' }),
      meter: 'AI_REQUESTS',
      consumed: 99_999_999,
    });
    expect(v.allowed).toBe(true);
    expect(v.limitValue).toBeNull();
    expect(v.remaining).toBeNull();
  });

  it('is deterministic: the same input yields the identical verdict', () => {
    const input = {
      subject: subject(),
      feature: 'RESEARCH',
      at: NOW,
      subscription: sub({ planId: 'PREMIUM', status: 'ACTIVE' }),
      meter: 'BACKTEST_RUNS' as const,
      consumed: 3,
    };
    expect(EntitlementEngine.evaluate(input)).toEqual(EntitlementEngine.evaluate(input));
  });
});

// -----------------------------------------------------------------------------

describe('UsageMeter', () => {
  const meter = () => new InMemoryUsageMeter();

  it('rejects malformed events with SCREAMING_SNAKE codes', () => {
    const base = {
      eventId: 'e1',
      subjectId: 'u1',
      resource: 'AI_REQUESTS' as const,
      quantity: 1,
      occurredAt: NOW,
      periodKey: '2026-10',
      metadata: {},
    };
    expect(() => validateUsageEvent({ ...base, eventId: '' })).toThrow('INVALID_USAGE_EVENT_ID');
    expect(() => validateUsageEvent({ ...base, subjectId: ' ' })).toThrow('INVALID_USAGE_SUBJECT_ID');
    expect(() => validateUsageEvent({ ...base, quantity: 0 })).toThrow('INVALID_USAGE_QUANTITY');
    expect(() => validateUsageEvent({ ...base, quantity: 1.5 })).toThrow('INVALID_USAGE_QUANTITY');
    expect(() => validateUsageEvent({ ...base, periodKey: 'Oct' })).toThrow('INVALID_USAGE_PERIOD_KEY');
    expect(() => validateUsageEvent({ ...base, occurredAt: 'nope' })).toThrow('INVALID_USAGE_OCCURRED_AT');
  });

  it('accumulates consumption per subject, resource and period', async () => {
    const m = meter();
    m.record({ eventId: 'a', subjectId: 'u1', resource: 'AI_REQUESTS', quantity: 1, occurredAt: NOW, periodKey: '2026-10', metadata: {} }, NOW);
    m.record({ eventId: 'b', subjectId: 'u1', resource: 'AI_REQUESTS', quantity: 2, occurredAt: NOW, periodKey: '2026-10', metadata: {} }, NOW);
    m.record({ eventId: 'c', subjectId: 'u1', resource: 'AI_REQUESTS', quantity: 9, occurredAt: NOW, periodKey: '2026-11', metadata: {} }, NOW);
    m.record({ eventId: 'd', subjectId: 'u2', resource: 'AI_REQUESTS', quantity: 9, occurredAt: NOW, periodKey: '2026-10', metadata: {} }, NOW);

    expect(await m.consumed('u1', 'AI_REQUESTS', '2026-10')).toBe(3);
    expect(await m.consumed('u1', 'AI_REQUESTS', '2026-11')).toBe(9);
    expect(await m.consumed('u2', 'AI_REQUESTS', '2026-10')).toBe(9);
    expect(await m.consumed('u9', 'AI_REQUESTS', '2026-10')).toBe(0);
  });

  it('PROPERTY: a duplicate event id has exactly one economic effect', async () => {
    const m = meter();
    const ev = { eventId: 'same', subjectId: 'u1', resource: 'BACKTEST_RUNS' as const, quantity: 1, occurredAt: NOW, periodKey: '2026-10', metadata: {} };
    for (let i = 0; i < 50; i++) await m.record(ev, NOW);
    expect(await m.consumed('u1', 'BACKTEST_RUNS', '2026-10')).toBe(1);
    expect(await m.eventCount('u1', 'BACKTEST_RUNS', '2026-10')).toBe(1);
  });

  it('reports a duplicate explicitly rather than silently', async () => {
    const m = meter();
    const ev = { eventId: 'k', subjectId: 'u1', resource: 'EXPORTS' as const, quantity: 3, occurredAt: NOW, periodKey: '2026-10', metadata: {} };
    const first = await m.record(ev, NOW);
    const second = await m.record(ev, NOW);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.bucketConsumed).toBe(3);
  });

  it('PROPERTY: interleaved duplicates never exceed the sum of distinct events', async () => {
    const m = meter();
    const ids = ['x', 'y', 'z'];
    let expected = 0;
    for (let round = 0; round < 10; round++) {
      for (const id of ids) {
        await m.record({ eventId: id, subjectId: 'u1', resource: 'AI_REQUESTS' as const, quantity: 1, occurredAt: NOW, periodKey: '2026-10', metadata: {} }, NOW);
        expected += 1;
      }
    }
    expect(await m.consumed('u1', 'AI_REQUESTS', '2026-10')).toBe(ids.length);
    expect(expected).toBe(30);
  });
});

// -----------------------------------------------------------------------------

describe('EntitlementService', () => {
  function harness(reconciliation?: () => ReconciliationState) {
    const store = new InMemorySubscriptionStore();
    const usage = new InMemoryUsageMeter();
    const audit = new InMemoryCommercialAuditLog();
    const svc = new EntitlementService(
      reconciliation ? { subscriptions: store, usage, audit, reconciliation } : { subscriptions: store, usage, audit },
    );
    return { store, usage, audit, svc };
  }

  const actor = actorFromPrincipal(
    { userId: 'u1', sessionId: 'sess_1', issuedAt: NOW_MS - 1000, expiresAt: NOW_MS + 60_000, provider: 'platform-session' },
    'ACTIVE',
    NOW_MS,
    'corr_1',
  );

  it('resolves a plan for every subject, even one with no subscription', async () => {
    const { svc } = harness();
    expect(await svc.resolvePlan('nobody')).toBe('FREE');
    expect(await svc.statusOf('nobody', NOW_MS)).toBeNull();
  });

  it('assigns the explicit FREE plan idempotently and audits it once', async () => {
    const { svc, audit, store } = harness();
    const a = await svc.ensureFreeSubscription('u1', NOW);
    const b = await svc.ensureFreeSubscription('u1', NOW);
    expect(a).toBe(b);
    expect(await store.list()).toHaveLength(1);
    expect(await audit.forAction('subscription_created')).toHaveLength(1);
  });

  it('meters only after the entitlement check succeeds', async () => {
    const { svc, usage, audit } = harness();
    await svc.ensureFreeSubscription('u1', NOW);

    // DENIED: FREE does not include BACKTEST. Nothing must be metered.
    const denied = await svc.check({
      actor: actor.ok ? actor.actor : never(),
      feature: 'BACKTEST',
      at: NOW,
      meter: 'BACKTEST_RUNS',
      periodKey: '2026-10',
      usageEventId: 'u1',
    });
    expect(denied.verdict.allowed).toBe(false);
    expect(denied.usageEventId).toBeNull();
    expect(await usage.consumed('u1', 'BACKTEST_RUNS', '2026-10')).toBe(0);
    expect(await audit.forAction('usage_recorded')).toHaveLength(0);
    expect(await audit.forAction('entitlement_denied')).toHaveLength(1);

    // ALLOWED and metered.
    const allowed = await svc.check({
      actor: actor.ok ? actor.actor : never(),
      feature: 'LEARNING',
      at: NOW,
      meter: 'ALERTS',
      periodKey: '2026-10',
      usageEventId: 'u1-alert-1',
    });
    expect(allowed.verdict.allowed).toBe(true);
    expect(allowed.bucketConsumedAfter).toBe(1);
    expect(await audit.forAction('usage_recorded')).toHaveLength(1);
  });

  it('PROPERTY: retried request => one usage effect and an explicit audit record', async () => {
    const { svc, usage, audit } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    const call = async () =>
      svc.check({
        actor: actor.ok ? actor.actor : never(),
        feature: 'LEARNING',
        at: NOW,
        meter: 'ALERTS',
        periodKey: '2026-10',
        usageEventId: 'retry-me',
      });

    const first = await call();
    const second = await call();
    expect(first.usageDuplicate).toBe(false);
    expect(second.usageDuplicate).toBe(true);
    expect(await usage.consumed('u1', 'ALERTS', '2026-10')).toBe(1);
    expect(await audit.forAction('usage_recorded')).toHaveLength(1);
    expect(await audit.forAction('usage_duplicate_ignored')).toHaveLength(1);
  });

  it('stops at the FREE plan limit and reports LIMIT_REACHED', async () => {
    const { svc, usage } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    // FREE allows 3 alerts per period.
    for (let i = 0; i < 3; i++) {
      await svc.check({ actor: actor.ok ? actor.actor : never(), feature: 'LEARNING', at: NOW, meter: 'ALERTS', periodKey: '2026-10', usageEventId: `a${i}` });
    }
    expect(await usage.consumed('u1', 'ALERTS', '2026-10')).toBe(3);
    const blocked = await svc.check({
      actor: actor.ok ? actor.actor : never(),
      feature: 'LEARNING',
      at: NOW,
      meter: 'ALERTS',
      periodKey: '2026-10',
      usageEventId: 'a4',
    });
    expect(blocked.verdict.decision).toBe('LIMIT_REACHED');
    expect(await usage.consumed('u1', 'ALERTS', '2026-10')).toBe(3);
  });

  it('blocks a non-ACTIVE platform account even with a valid subscription', async () => {
    const { svc, usage } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    const disabled = actorFromPrincipal(
      { userId: 'u1', sessionId: 's', issuedAt: 0, expiresAt: NOW_MS + 1000, provider: 'platform-session' },
      'DISABLED',
      NOW_MS,
      null,
    );
    expect(disabled.ok).toBe(false);

    const forged = { subject: subject('u1'), platformUserStatus: 'DISABLED' as const };
    const r = await svc.check({ actor: forged, feature: 'LEARNING', at: NOW, meter: 'ALERTS', periodKey: '2026-10', usageEventId: 'x' });
    expect(r.verdict.allowed).toBe(false);
    expect(r.verdict.reason).toBe('ACCOUNT_DISABLED');
    expect(await usage.consumed('u1', 'ALERTS', '2026-10')).toBe(0);
  });

  it('rejects a plan change that the subject kind does not permit', async () => {
    const { svc } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    await expect(
      svc.changePlan({ subjectId: 'u1', to: 'TEAM', at: NOW, actorUserId: 'u1', actorSessionId: 's', correlationId: null, reason: 'TEST' }),
    ).rejects.toThrow('PLAN_NOT_ALLOWED_FOR_SUBJECT_KIND:TEAM');
  });

  it('audits a successful plan change', async () => {
    const { svc, audit } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    await svc.changePlan({ subjectId: 'u1', to: 'PREMIUM', at: NOW, actorUserId: 'u1', actorSessionId: 's', correlationId: 'corr_1', reason: 'UPGRADE' });
    expect(await svc.resolvePlan('u1')).toBe('PREMIUM');
    const ev = await audit.forAction('plan_changed');
    expect(ev).toHaveLength(1);
    expect(ev[0].metadata).toEqual({ from: 'FREE', to: 'PREMIUM' });
  });

  it('refuses capability while reconciliation is pending', async () => {
    const { svc, usage } = harness(recon('PAYMENT_UNKNOWN'));
    await svc.ensureFreeSubscription('u1', NOW);
    const r = await svc.check({
      actor: actor.ok ? actor.actor : never(),
      feature: 'LEARNING',
      at: NOW,
      meter: 'ALERTS',
      periodKey: '2026-10',
      usageEventId: 'z',
    });
    expect(r.verdict.decision).toBe('REQUIRES_RECONCILIATION');
    expect(await usage.consumed('u1', 'ALERTS', '2026-10')).toBe(0);
  });

  it('reports remaining usage for a period', async () => {
    const { svc } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    await svc.check({ actor: actor.ok ? actor.actor : never(), feature: 'LEARNING', at: NOW, meter: 'ALERTS', periodKey: '2026-10', usageEventId: 'a1' });
    expect(await svc.remaining({ subjectId: 'u1', resource: 'ALERTS', periodKey: '2026-10' })).toEqual({ limit: 3, consumed: 1, remaining: 2 });
  });

  it('describes the plan with implementation status per feature', async () => {
    const { svc } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    const d = await svc.describePlan('u1');
    expect(d.planId).toBe('FREE');
    expect(d.features.every((f) => f.implemented)).toBe(true);
  });

  it('never exposes a wall clock: repeated evaluation is identical', async () => {
    const { svc } = harness();
    await svc.ensureFreeSubscription('u1', NOW);
    const a = await svc.statusOf('u1', NOW_MS);
    const b = await svc.statusOf('u1', NOW_MS);
    expect(a).toBe(b);
  });
});

// -----------------------------------------------------------------------------

describe('ActorSeam', () => {
  const valid = { userId: 'u1', sessionId: 's', issuedAt: 0, expiresAt: 1000, provider: 'platform-session' as const };

  it('accepts an active principal', () => {
    const r = actorFromPrincipal(valid, 'ACTIVE', 0, 'c');
    expect(r.ok).toBe(true);
  });

  it('fails closed on every doubt', () => {
    expect(actorFromPrincipal(null, 'ACTIVE', 0, null)).toEqual({ ok: false, reason: 'NO_PRINCIPAL' });
    expect(actorFromPrincipal(valid, 'ACTIVE', 1000, null)).toEqual({ ok: false, reason: 'SESSION_EXPIRED' });
    expect(actorFromPrincipal(valid, 'DISABLED', 0, null)).toEqual({ ok: false, reason: 'ACCOUNT_DISABLED' });
    expect(actorFromPrincipal(valid, 'LOCKED', 0, null)).toEqual({ ok: false, reason: 'ACCOUNT_LOCKED' });
    expect(actorFromPrincipal(valid, 'PENDING', 0, null)).toEqual({ ok: false, reason: 'ACCOUNT_PENDING' });
  });

  it('creates an explicit anonymous subject, not an implicit default user', () => {
    const s = anonymousSubject('c');
    expect(s.subjectId).toBe('anonymous');
    expect(s.kind).toBe('USER');
  });
});

// -----------------------------------------------------------------------------

describe('CommercialAuditTrail', () => {
  it('redacts credential-shaped metadata', async () => {
    const log = new InMemoryCommercialAuditLog();
    const e = await log.record({
      action: 'payment_received',
      outcome: 'SUCCESS',
      subjectId: 'u1',
      occurredAt: NOW,
      reason: 'TEST',
      metadata: { apiKey: 'AKIA123', password: 'p', note: 'ok', access_token: 'tok' },
    });
    expect(e.metadata.apiKey).toBe('[REDACTED]');
    expect(e.metadata.password).toBe('[REDACTED]');
    expect(e.metadata.access_token).toBe('[REDACTED]');
    expect(e.metadata.note).toBe('ok');
  });

  it('monotonically sequences and indexes by subject and correlation', async () => {
    const log = new InMemoryCommercialAuditLog();
    log.record({ action: 'entitlement_granted', outcome: 'SUCCESS', subjectId: 'u1', correlationId: 'c1', occurredAt: NOW, reason: 'A' });
    log.record({ action: 'entitlement_denied', outcome: 'REJECTED', subjectId: 'u2', correlationId: 'c1', occurredAt: NOW, reason: 'B' });
    log.record({ action: 'entitlement_granted', outcome: 'SUCCESS', subjectId: 'u1', correlationId: 'c2', occurredAt: NOW, reason: 'C' });

    expect((await log.all()).map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(await log.forSubject('u1')).toHaveLength(2);
    expect(await log.forCorrelation('c1')).toHaveLength(2);
    expect(await log.forAction('entitlement_denied')).toHaveLength(1);
    expect(await log.count()).toBe(3);
  });

  it('covers every roadmap §05.9 commercial audit action', async () => {
    const actions = [
      'subscription_created', 'subscription_changed', 'subscription_cancelled',
      'payment_received', 'payment_failed', 'refund_issued',
      'entitlement_granted', 'entitlement_revoked', 'usage_recorded',
      'plan_changed', 'seat_assigned', 'seat_removed',
      'marketplace_purchase', 'creator_payout',
    ] as const;
    const log = new InMemoryCommercialAuditLog();
    for (const a of actions) {
      await log.record({ action: a, outcome: 'SUCCESS', subjectId: 'u1', occurredAt: NOW, reason: 'COVERAGE' });
    }
    for (const a of actions) expect(await log.forAction(a)).toHaveLength(1);
  });
});

function never(): never {
  throw new Error('UNREACHABLE');
}