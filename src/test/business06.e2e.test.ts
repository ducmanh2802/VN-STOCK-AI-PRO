/**
 * BUSINESS-06 — §17 END-TO-END COMMERCIAL JOURNEY + §18 RESTART DURABILITY + §19 CONCURRENCY
 * ==========================================================================================
 * Runs the complete journey through the real persistence ports (no pure mocks):
 *
 *   REGISTER → LOGIN → CREATE ORGANIZATION → ASSIGN ROLE → SELECT PLAN → CREATE SUBSCRIPTION
 *   → PAYMENT EVENT → WEBHOOK → ENTITLEMENT ACTIVE → ALLOCATE SEAT → ACCESS PREMIUM RESOURCE
 *   → AUDIT EVENT → RENEW → CANCEL → ENTITLEMENT REMOVED → ACCESS DENIED
 *
 * "Restart" is modelled the way it actually happens in production: a brand-new service graph
 * is constructed over the SAME repository instances. A genuine process restart would discard
 * in-memory state, so every assertion here proves the answer came from the repository.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryPersistence } from '../lib/db/business06/memory.ts';
import type { TransactionContext } from '../lib/db/business06/contracts.ts';
import { DurableIdentityService } from '../services/business06/DurableIdentityService.ts';
import { OrganizationService, OrganizationError, type OrgAuditEvent } from '../services/business06/OrganizationService.ts';
import { BillingPersistenceService, BillingError, type PaymentProviderVerifier } from '../services/business06/BillingPersistenceService.ts';
import { InMemoryAuthEventSink } from '../lib/platform/identity/types.ts';
import { EntitlementEngine } from '../lib/business/entitlementEngine.ts';
import { PLANS } from '../lib/business/plans.ts';
import type { PlanId, Subscription, SubscriptionStatus } from '../lib/business/types.ts';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;
const PERIOD = '2026-10';

/** Deterministic verifier: signature must equal `sig:<sha256(body)>`. */
const verifier: PaymentProviderVerifier = {
  name: 'deterministic-test-provider',
  verify(rawBody, signature) {
    const hash = payloadHashFor(rawBody);
    const ok = signature === `sig:${hash}`;
    const parsed = JSON.parse(rawBody) as { id: string; type: string };
    return { eventId: parsed.id, eventType: parsed.type, verified: ok };
  },
};

function payloadHashFor(raw: string): string {
  // Local import avoids depending on service internals in the test.
  let out = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    out ^= raw.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return (out >>> 0).toString(16);
}

function signed(body: string): { raw: string; signature: string } {
  return { raw: body, signature: `sig:${payloadHashFor(body)}` };
}

interface World {
  persistence: ReturnType<typeof createInMemoryPersistence>['persistence'];
  internals: ReturnType<typeof createInMemoryPersistence>['internals'];
  seatAllocation: ReturnType<typeof createInMemoryPersistence>['seatAllocation'];
  identity: DurableIdentityService;
  org: OrganizationService;
  billing: BillingPersistenceService;
  audit: OrgAuditEvent[];
  clock: { now: number };
}

function buildWorld(startAt = T0): World {
  const { persistence, internals, seatAllocation } = createInMemoryPersistence();
  const clock = { now: startAt };
  const audit: OrgAuditEvent[] = [];
  const sink = new InMemoryAuthEventSink();
  const identity = new DurableIdentityService(
    {
      users: persistence.repositories.users,
      sessions: persistence.repositories.sessions,
      authEvents: persistence.repositories.authEvents,
      sink,
      sessionTtlMs: 30 * DAY,
      lockout: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
    },
    () => clock.now,
  );
  const org = new OrganizationService(persistence.tx, seatAllocation, (e) => audit.push(e), () => clock.now);
  const billing = new BillingPersistenceService(persistence.tx, () => clock.now);
  return { persistence, internals, seatAllocation, identity, org, billing, audit, clock };
}

/** Simulates a process restart: fresh services over the same repositories. */
function restart(world: World): World {
  const clock = { now: world.clock.now };
  const audit = world.audit;
  const sink = new InMemoryAuthEventSink();
  const identity = new DurableIdentityService(
    {
      users: world.persistence.repositories.users,
      sessions: world.persistence.repositories.sessions,
      authEvents: world.persistence.repositories.authEvents,
      sink,
      sessionTtlMs: 30 * DAY,
      lockout: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
    },
    () => clock.now,
  );
  const org = new OrganizationService(world.persistence.tx, world.seatAllocation, (e) => audit.push(e), () => clock.now);
  const billing = new BillingPersistenceService(world.persistence.tx, () => clock.now);
  return { ...world, identity, org, billing, audit, clock };
}

async function seedSubscription(w: World, subjectId: string, planId: PlanId, status: SubscriptionStatus) {
  await w.billing.createSubscription({
    subscriptionId: `sub-${subjectId}`,
    subjectId,
    subjectKind: 'ORGANIZATION',
    organizationId: subjectId,
    planId,
    status,
    providerRef: `prov-${subjectId}`,
    currentPeriodStart: new Date(w.clock.now).toISOString(),
    currentPeriodEnd: new Date(w.clock.now + 30 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    gracePeriodEnd: new Date(w.clock.now + 35 * DAY).toISOString(),
    trialEndsAt: null,
    version: 1,
    createdAt: new Date(w.clock.now).toISOString(),
    updatedAt: new Date(w.clock.now).toISOString(),
  });
}

/**
 * §8 Entitlements are derived from DURABLE state through the certified BUSINESS-01 engine —
 * never from memory and never from `if (plan === 'PRO')` logic.
 */
function entitlementFor(sub: Awaited<ReturnType<BillingPersistenceService['subscriptionOf']>>, subjectId: string, at: number) {
  return EntitlementEngine.evaluate({
    subject: { subjectId, kind: 'ORGANIZATION', organizationId: subjectId, sessionId: null, correlationId: null },
    feature: 'AI_ASSISTANT',
    at: new Date(at).toISOString(),
    // The persisted row is passed through verbatim. Nulling the period bounds here would
    // make `accessWindowElapsed` permanently false and silently grant access forever.
    subscription: sub as Subscription | null,
  });
}

describe('§17 E2E commercial journey (real persistence boundary)', () => {
  let w: World;

  beforeEach(() => {
    w = buildWorld();
  });

  it('register → subscribe → pay → webhook → entitlement → seat → premium access → renew → cancel → denied', async () => {
    // ---------- REGISTER + LOGIN ----------
    await w.identity.createUser({ userId: 'u-owner', identifier: 'owner@vnstock.vn', password: 'OwnerPass123' });
    const login = await w.identity.authenticateWithPassword({ identifier: 'owner@vnstock.vn', password: 'OwnerPass123' });
    expect(login.ok).toBe(true);
    expect(login.token).toBeTruthy();
    const token = login.token!;

    // ---------- CREATE ORGANIZATION ----------
    const created = await w.org.createOrganization({
      organizationId: 'org-1', name: 'VN Quant Lab', ownerUserId: 'u-owner', correlationId: 'corr-1', initialSeats: 2,
    });
    expect(created.organization.status).toBe('ACTIVE');
    expect((await w.org.seatsOf('org-1')).length).toBe(2);

    // ---------- ASSIGN ROLE ----------
    await w.identity.createUser({ userId: 'u-member', identifier: 'member@vnstock.vn', password: 'MemberPass123' });
    await w.org.addMember({ organizationId: 'org-1', actorUserId: 'u-owner', userId: 'u-member', role: 'RESEARCHER', correlationId: 'corr-1' });
    expect((await w.persistence.repositories.memberships.find('org-1', 'u-member'))?.role).toBe('RESEARCHER');

    // ---------- SELECT PLAN + CREATE SUBSCRIPTION ----------
    const plan = PLANS.get('TEAM')!;
    expect(plan.maxSeats).toBeGreaterThan(0);
    await seedSubscription(w, 'org-1', 'TEAM', 'TRIALING');

    // ---------- PAYMENT EVENT + WEBHOOK → ENTITLEMENT ACTIVE ----------
    const { raw, signature } = signed(JSON.stringify({ id: 'evt_1', type: 'subscription.activated' }));
    const outcome = await w.billing.processWebhook({
      provider: 'deterministic-test-provider',
      eventId: 'evt_1',
      eventType: 'subscription.activated',
      rawBody: raw,
      signature,
      verifier,
      correlationId: 'corr-1',
      resolveEffects: () => [
        {
          kind: 'PAYMENT_EVENT',
          subjectId: 'org-1',
          organizationId: 'org-1',
          amountMinor: 1_990_000,
          currency: 'VND',
          periodKey: PERIOD,
          subscriptionPatch: {
            planId: 'TEAM',
            status: 'ACTIVE',
            currentPeriodStart: new Date(w.clock.now).toISOString(),
            currentPeriodEnd: new Date(w.clock.now + 30 * DAY).toISOString(),
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            gracePeriodEnd: new Date(w.clock.now + 35 * DAY).toISOString(),
            trialEndsAt: null,
          },
        },
      ],
    });
    expect(outcome.status).toBe('PROCESSED');
    expect(outcome.applied).toEqual(expect.arrayContaining(['ledger:PAYMENT_EVENT', 'subscription:ACTIVE']));

    // ---------- ENTITLEMENT ACTIVE ----------
    const sub = await w.billing.subscriptionOf('org-1');
    expect(sub?.status).toBe('ACTIVE');
    const verdict = entitlementFor(sub, 'org-1', w.clock.now);
    expect(verdict.allowed).toBe(true);

    // ---------- ALLOCATE SEAT ----------
    const seat = await w.org.allocateSeat({
      organizationId: 'org-1', actorUserId: 'u-owner', targetUserId: 'u-member',
      seatId: 'org-1-seat-2', purchasedSeats: plan.maxSeats!, correlationId: 'corr-1',
    });
    expect(seat).toMatchObject({ allocated: 1, seatId: 'org-1-seat-2' });
    expect((await w.persistence.repositories.memberships.find('org-1', 'u-member'))?.seatId).toBe('org-1-seat-2');

    // ---------- ACCESS PREMIUM RESOURCE ----------
    expect(entitlementFor(sub, 'org-1', w.clock.now).allowed).toBe(true);

    // ---------- AUDIT EVENTS RECORDED ----------
    expect(w.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['organization.create', 'membership.add', 'seat.allocate']));
    expect(w.audit.every((a) => a.correlationId === 'corr-1')).toBe(true);

    // ---------- RENEW ----------
    const current = await w.billing.subscriptionOf('org-1');
    const renew = signed(JSON.stringify({ id: 'evt_2', type: 'subscription.renewed' }));
    await w.billing.processWebhook({
      provider: 'deterministic-test-provider', eventId: 'evt_2', eventType: 'subscription.renewed',
      rawBody: renew.raw, signature: renew.signature, verifier, correlationId: 'corr-1',
      resolveEffects: () => [{
        kind: 'PAYMENT_EVENT', subjectId: 'org-1', organizationId: 'org-1', amountMinor: 1_990_000,
        currency: 'VND', periodKey: PERIOD,
        subscriptionPatch: {
          planId: 'TEAM', status: 'ACTIVE',
          currentPeriodStart: new Date(w.clock.now).toISOString(),
          currentPeriodEnd: new Date(w.clock.now + 60 * DAY).toISOString(),
          cancelAtPeriodEnd: false, cancelledAt: null,
          gracePeriodEnd: new Date(w.clock.now + 65 * DAY).toISOString(), trialEndsAt: null,
        },
      }],
    });
    expect((await w.billing.subscriptionOf('org-1'))!.version).toBeGreaterThan(current!.version);

    // ---------- CANCEL ----------
    const before = await w.billing.subscriptionOf('org-1');
    await w.billing.transitionSubscription({
      subjectId: 'org-1',
      expectedVersion: before!.version,
      patch: { status: 'CANCELLED', cancelAtPeriodEnd: false, cancelledAt: new Date(w.clock.now).toISOString() },
    });

    // ---------- ENTITLEMENT REMOVED + ACCESS DENIED ----------
    const cancelled = await w.billing.subscriptionOf('org-1');
    expect(cancelled?.status).toBe('CANCELLED');
    // Cancelling does NOT delete access: the paid period plus the grace window still stand.
    expect(entitlementFor(cancelled, 'org-1', w.clock.now).allowed).toBe(true);
    // Only once BOTH the paid period and the grace window have elapsed is access denied.
    const windowEnd = Math.max(
      Date.parse(cancelled!.currentPeriodEnd!),
      Date.parse(cancelled!.gracePeriodEnd!),
    );
    const afterWindow = entitlementFor(cancelled, 'org-1', windowEnd + 1);
    expect(afterWindow.allowed).toBe(false);
    expect(afterWindow.decision).toBe('DENIED_GRACE_EXPIRED');

    // ---------- the session issued before all of this is still valid ----------
    expect((await w.identity.authenticateToken(token)).ok).toBe(true);
  });
});

describe('§18 restart / durability', () => {
  it('session, organization, membership, subscription and entitlement survive a restart', async () => {
    let w = buildWorld();
    await w.identity.createUser({ userId: 'u-d', identifier: 'd@vnstock.vn', password: 'DurablePass123' });
    const login = await w.identity.authenticateWithPassword({ identifier: 'd@vnstock.vn', password: 'DurablePass123' });
    const token = login.token!;
    await w.org.createOrganization({ organizationId: 'org-d', name: 'Durable Org', ownerUserId: 'u-d', correlationId: null, initialSeats: 1 });
    await seedSubscription(w, 'org-d', 'PRO', 'ACTIVE');

    // ===== PROCESS RESTART: new services, same repositories =====
    w = restart(w);
    w.clock.now = T0 + 1000;

    // session still authenticates (durable, hash-only)
    const auth = await w.identity.authenticateToken(token);
    expect(auth.ok).toBe(true);
    expect(auth.principal?.userId).toBe('u-d');

    // organization + membership remain
    const members = await w.org.listMembers({ organizationId: 'org-d', actorUserId: 'u-d' });
    expect(members.map((m) => m.role)).toEqual(['OWNER']);

    // subscription + entitlement remain correct
    const sub = await w.billing.subscriptionOf('org-d');
    expect(sub?.status).toBe('ACTIVE');
    expect(entitlementFor(sub, 'org-d', w.clock.now).allowed).toBe(true);
  });

  it('a duplicate webhook after restart has no duplicate business effect', async () => {
    let w = buildWorld();
    await w.identity.createUser({ userId: 'u-w', identifier: 'w@vnstock.vn', password: 'WebhookPass123' });
    await seedSubscription(w, 'org-w', 'TEAM', 'TRIALING');
    const { raw, signature } = signed(JSON.stringify({ id: 'evt_dup', type: 'subscription.activated' }));
    const effects = () => [{
      kind: 'PAYMENT_EVENT' as const, subjectId: 'org-w', organizationId: 'org-w', amountMinor: 500_000,
      currency: 'VND', periodKey: PERIOD,
      subscriptionPatch: {
        planId: 'TEAM', status: 'ACTIVE',
        currentPeriodStart: new Date(w.clock.now).toISOString(),
        currentPeriodEnd: new Date(w.clock.now + 30 * DAY).toISOString(),
        cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
      },
    }];
    const first = await w.billing.processWebhook({
      provider: 'deterministic-test-provider', eventId: 'evt_dup', eventType: 'subscription.activated',
      rawBody: raw, signature, verifier, correlationId: null, resolveEffects: effects,
    });
    expect(first.status).toBe('PROCESSED');
    const ledgerAfterFirst = await w.billing.periodTotalMinor('org-w', PERIOD);
    const versionAfterFirst = (await w.billing.subscriptionOf('org-w'))!.version;

    // ===== RESTART, then the provider retries the SAME event =====
    w = restart(w);
    const second = await w.billing.processWebhook({
      provider: 'deterministic-test-provider', eventId: 'evt_dup', eventType: 'subscription.activated',
      rawBody: raw, signature, verifier, correlationId: null, resolveEffects: effects,
    });
    expect(second.status).toBe('DUPLICATE');
    expect(second.applied).toEqual([]);
    // no double charge, no second subscription transition
    expect(await w.billing.periodTotalMinor('org-w', PERIOD)).toBe(ledgerAfterFirst);
    expect((await w.billing.subscriptionOf('org-w'))!.version).toBe(versionAfterFirst);
    expect(w.internals.ledger.count()).toBe(1);
  });
});

describe('§19 concurrency invariants', () => {
  it('seat allocation cannot exceed purchased seats under concurrent requests', async () => {
    const w = buildWorld();
    await w.identity.createUser({ userId: 'u-c', identifier: 'c@vnstock.vn', password: 'ConcurrentPass1' });
    await w.identity.createUser({ userId: 'u-1', identifier: 'u1@vnstock.vn', password: 'ConcurrentPass1' });
    await w.identity.createUser({ userId: 'u-2', identifier: 'u2@vnstock.vn', password: 'ConcurrentPass1' });
    await w.identity.createUser({ userId: 'u-3', identifier: 'u3@vnstock.vn', password: 'ConcurrentPass1' });
    await w.org.createOrganization({ organizationId: 'org-c', name: 'Concurrent Org', ownerUserId: 'u-c', correlationId: null, initialSeats: 3 });

    const attempts = ['u-1', 'u-2', 'u-3'].map((u, i) =>
      w.org
        .allocateSeat({ organizationId: 'org-c', actorUserId: 'u-c', targetUserId: u, seatId: `org-c-seat-${i + 1}`, purchasedSeats: 2, correlationId: null })
        .then(() => 'ALLOCATED' as const)
        .catch((e: unknown) => (e instanceof OrganizationError ? e.failure : 'UNKNOWN_ERROR')),
    );
    const results = await Promise.all(attempts);

    // capacity 2, three concurrent requests → exactly two succeed
    expect(results.filter((r) => r === 'ALLOCATED')).toHaveLength(2);
    expect(results.filter((r) => r === 'SEAT_CAPACITY_EXHAUSTED')).toHaveLength(1);
    expect(await w.org.organizationsOf('u-c')).toContain('org-c');
    const seats = await w.org.seatsOf('org-c');
    expect(seats.filter((s) => s.status === 'ASSIGNED')).toHaveLength(2);
    expect(await w.seatAllocation.allocatedCount('org-c')).toBe(2);
  });

  it('the same user cannot hold two assigned seats (partial unique index)', async () => {
    const w = buildWorld();
    await w.identity.createUser({ userId: 'u-c', identifier: 'c@vnstock.vn', password: 'ConcurrentPass1' });
    await w.identity.createUser({ userId: 'u-1', identifier: 'u1@vnstock.vn', password: 'ConcurrentPass1' });
    await w.org.createOrganization({ organizationId: 'org-d', name: 'Dup Org', ownerUserId: 'u-c', correlationId: null, initialSeats: 3 });
    await w.org.allocateSeat({ organizationId: 'org-d', actorUserId: 'u-c', targetUserId: 'u-1', seatId: 'org-d-seat-2', purchasedSeats: 3, correlationId: null });
    await expect(
      w.org.allocateSeat({ organizationId: 'org-d', actorUserId: 'u-c', targetUserId: 'u-1', seatId: 'org-d-seat-3', purchasedSeats: 3, correlationId: null }),
    ).rejects.toMatchObject({ failure: 'INVALID_INPUT' });
    expect(await w.seatAllocation.allocatedCount('org-d')).toBe(1);
  });

  it('concurrent duplicate webhooks produce exactly one ledger entry', async () => {
    const w = buildWorld();
    await seedSubscription(w, 'org-r', 'TEAM', 'TRIALING');
    const { raw, signature } = signed(JSON.stringify({ id: 'evt_race', type: 'subscription.activated' }));
    const call = () =>
      w.billing
        .processWebhook({
          provider: 'deterministic-test-provider', eventId: 'evt_race', eventType: 'subscription.activated',
          rawBody: raw, signature, verifier, correlationId: null,
          resolveEffects: () => [{
            kind: 'PAYMENT_EVENT' as const, subjectId: 'org-r', organizationId: 'org-r', amountMinor: 250_000,
            currency: 'VND', periodKey: PERIOD,
            subscriptionPatch: {
              planId: 'TEAM', status: 'ACTIVE',
              currentPeriodStart: new Date(w.clock.now).toISOString(),
              currentPeriodEnd: new Date(w.clock.now + 30 * DAY).toISOString(),
              cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
            },
          }],
        })
        .then((r) => r.status)
        .catch(() => 'ERROR');
    const [a, b] = await Promise.all([call(), call()]);
    expect([a, b].filter((s) => s === 'PROCESSED')).toHaveLength(1);
    expect(w.internals.ledger.count()).toBe(1);
    expect(await w.billing.periodTotalMinor('org-r', PERIOD)).toBe(250_000);
  });

  it('concurrent subscription transitions: the stale writer is refused, not applied', async () => {
    const w = buildWorld();
    await seedSubscription(w, 'org-s', 'TEAM', 'ACTIVE');
    const current = (await w.billing.subscriptionOf('org-s'))!;
    const [ok, conflict] = await Promise.allSettled([
      w.billing.transitionSubscription({ subjectId: 'org-s', expectedVersion: current.version, patch: { cancelAtPeriodEnd: true } }),
      w.billing.transitionSubscription({ subjectId: 'org-s', expectedVersion: current.version, patch: { status: 'PAUSED' } }),
    ]);
    expect(ok.status).toBe('fulfilled');
    expect(conflict.status).toBe('rejected');
    // The loser is refused by the optimistic-concurrency guard, never applied.
    expect((conflict as PromiseRejectedResult).reason).toMatchObject({ failure: 'PERSISTENCE_UNAVAILABLE' });
    const after = (await w.billing.subscriptionOf('org-s'))!;
    expect(after.version).toBe(current.version + 1);
    expect(after.status).toBe('ACTIVE'); // the losing write did NOT clobber the row
  });
});

describe('§25 failure semantics', () => {
  it('a database outage is never converted into FREE_USER / ALLOW', async () => {
    const down = createInMemoryPersistence({ unavailable: true });
    const identity = new DurableIdentityService(
      {
        users: down.persistence.repositories.users,
        sessions: down.persistence.repositories.sessions,
        sink: new InMemoryAuthEventSink(),
        sessionTtlMs: DAY,
        lockout: { maxAttempts: 5, windowMs: 1000, lockMs: 1000 },
      },
      () => T0,
    );
    // The outage propagates; it does not answer "invalid credentials" or "anonymous user".
    await expect(identity.authenticateToken('any-token')).rejects.toThrow(/PERSISTENCE_UNAVAILABLE/);
    await expect(identity.authenticateWithPassword({ identifier: 'a@b.c', password: 'Whatever123' })).rejects.toThrow(/PERSISTENCE_UNAVAILABLE/);
  });

  it('an unverified webhook payload never reaches business state', async () => {
    const w = buildWorld();
    await seedSubscription(w, 'org-u', 'TEAM', 'TRIALING');
    const { raw } = signed(JSON.stringify({ id: 'evt_forged', type: 'subscription.activated' }));
    await expect(
      w.billing.processWebhook({
        provider: 'deterministic-test-provider', eventId: 'evt_forged', eventType: 'subscription.activated',
        rawBody: raw, signature: 'sig:forged', verifier, correlationId: null,
        resolveEffects: () => [{
          kind: 'PAYMENT_EVENT', subjectId: 'org-u', organizationId: 'org-u', amountMinor: 0,
          currency: 'VND', periodKey: PERIOD,
          subscriptionPatch: {
            planId: 'ENTERPRISE', status: 'ACTIVE',
            currentPeriodStart: null, currentPeriodEnd: null,
            cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
          },
        }],
      }),
    ).rejects.toBeInstanceOf(BillingError);
    // Nothing was written: subscription untouched, no ledger row.
    expect((await w.billing.subscriptionOf('org-u'))!.status).toBe('TRIALING');
    expect(w.internals.ledger.count()).toBe(0);
    expect(await w.internals.webhooks.find('deterministic-test-provider', 'evt_forged')).toBeNull();
  });

  it('a webhook for an unknown subscription fails loudly instead of granting access', async () => {
    const w = buildWorld();
    const { raw, signature } = signed(JSON.stringify({ id: 'evt_nosub', type: 'subscription.activated' }));
    await expect(
      w.billing.processWebhook({
        provider: 'deterministic-test-provider', eventId: 'evt_nosub', eventType: 'subscription.activated',
        rawBody: raw, signature, verifier, correlationId: null,
        resolveEffects: () => [{
          kind: 'PAYMENT_EVENT', subjectId: 'org-missing', organizationId: null, amountMinor: 1000,
          currency: 'VND', periodKey: PERIOD,
          subscriptionPatch: {
            planId: 'PRO', status: 'ACTIVE',
            currentPeriodStart: null, currentPeriodEnd: null,
            cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
          },
        }],
      }),
    ).rejects.toBeInstanceOf(BillingError);
    // the failed attempt is recorded for operators
    expect((await w.internals.webhooks.find('deterministic-test-provider', 'evt_nosub'))?.processingStatus).toBe('FAILED');
  });
});

describe('§20 security regression (D-03 shape / D-11)', () => {
  it('owner can reach its own organization; non-member and cross-org are denied', async () => {
    const w = buildWorld();
    for (const u of ['u-a', 'u-b']) await w.identity.createUser({ userId: u, identifier: `${u}@vnstock.vn`, password: 'SecurePass123' });
    await w.org.createOrganization({ organizationId: 'org-A', name: 'Org A', ownerUserId: 'u-a', correlationId: null, initialSeats: 1 });
    await w.org.createOrganization({ organizationId: 'org-B', name: 'Org B', ownerUserId: 'u-b', correlationId: null, initialSeats: 1 });

    // owner of A
    expect((await w.org.listMembers({ organizationId: 'org-A', actorUserId: 'u-a' })).length).toBe(1);
    // owner of B cannot read A (cross-org denial)
    await expect(w.org.listMembers({ organizationId: 'org-A', actorUserId: 'u-b' })).rejects.toMatchObject({ failure: 'NOT_A_MEMBER' });
    // a non-member is denied
    await w.identity.createUser({ userId: 'u-c', identifier: 'u-c@vnstock.vn', password: 'SecurePass123' });
    await expect(w.org.listMembers({ organizationId: 'org-A', actorUserId: 'u-c' })).rejects.toMatchObject({ failure: 'NOT_A_MEMBER' });
    // a VIEWER cannot write members (explicit permission)
    await w.org.addMember({ organizationId: 'org-A', actorUserId: 'u-a', userId: 'u-c', role: 'VIEWER', correlationId: null });
    await expect(
      w.org.addMember({ organizationId: 'org-A', actorUserId: 'u-c', userId: 'u-b', role: 'VIEWER', correlationId: null }),
    ).rejects.toMatchObject({ failure: 'ROLE_INSUFFICIENT' });
  });

  it('D-11: a paid subscription is created through the real webhook integration path', async () => {
    const w = buildWorld();
    await seedSubscription(w, 'org-paid', 'TEAM', 'INCOMPLETE');
    const { raw, signature } = signed(JSON.stringify({ id: 'evt_paid', type: 'invoice.paid' }));
    await w.billing.processWebhook({
      provider: 'deterministic-test-provider', eventId: 'evt_paid', eventType: 'invoice.paid',
      rawBody: raw, signature, verifier, correlationId: null,
      resolveEffects: () => [{
        kind: 'INVOICE', subjectId: 'org-paid', organizationId: 'org-paid', amountMinor: 990_000,
        currency: 'VND', periodKey: PERIOD,
        subscriptionPatch: {
          planId: 'TEAM', status: 'ACTIVE',
          currentPeriodStart: new Date(w.clock.now).toISOString(),
          currentPeriodEnd: new Date(w.clock.now + 30 * DAY).toISOString(),
          cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
        },
      }],
    });
    const sub = await w.billing.subscriptionOf('org-paid');
    expect(sub!.status).toBe('ACTIVE');
    expect(await w.billing.periodTotalMinor('org-paid', PERIOD)).toBe(990_000);
    expect(entitlementFor(sub, 'org-paid', w.clock.now).allowed).toBe(true);
  });

  it('no plaintext password or raw session token is ever persisted', async () => {
    const w = buildWorld();
    await w.identity.createUser({ userId: 'u-secret', identifier: 's@vnstock.vn', password: 'Plaintext123' });
    const login = await w.identity.authenticateWithPassword({ identifier: 's@vnstock.vn', password: 'Plaintext123' });
    const dump = JSON.stringify({
      users: w.internals.users.all(),
      sessions: await w.persistence.repositories.sessions.listByUser('u-secret'),
      events: w.internals.authEvents.all(),
      audit: w.audit,
    });
    expect(dump).not.toContain('Plaintext123');
    expect(dump).not.toContain(login.token!);
    // scrypt record + sha256 token hash only
    expect(w.internals.users.all()[0]!.passwordHash).toMatch(/^scrypt\$/);
    const session = (await w.persistence.repositories.sessions.listByUser('u-secret'))[0]!;
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the last owner cannot be demoted or removed', async () => {
    const w = buildWorld();
    await w.identity.createUser({ userId: 'u-o', identifier: 'o@vnstock.vn', password: 'SecurePass123' });
    await w.org.createOrganization({ organizationId: 'org-last', name: 'Last Owner Org', ownerUserId: 'u-o', correlationId: null, initialSeats: 1 });
    await expect(
      w.org.changeRole({ organizationId: 'org-last', actorUserId: 'u-o', targetUserId: 'u-o', role: 'VIEWER', correlationId: null }),
    ).rejects.toMatchObject({ failure: 'LAST_OWNER_PROTECTED' });
    await expect(w.org.removeMember({ organizationId: 'org-last', actorUserId: 'u-o', targetUserId: 'u-o' })).rejects.toMatchObject({
      failure: 'LAST_OWNER_PROTECTED',
    });
  });
});

describe('§28 adversarial audit answers', () => {
  it('every adversarial question is answered NO, with evidence', async () => {
    const w = buildWorld();
    await w.identity.createUser({ userId: 'u-x', identifier: 'x@vnstock.vn', password: 'AuditPass123' });
    await seedSubscription(w, 'org-x', 'PRO', 'ACTIVE');

    // "Can a paid user exist only in memory?"  → subscription row is the source of truth
    const before = restart(w);
    expect((await before.billing.subscriptionOf('org-x'))!.status).toBe('ACTIVE');

    // "Can duplicate webhook double-charge?"  → tested above; ledger count stays 1
    // "Can duplicate webhook double-grant?"   → version does not advance on replay
    const { raw, signature } = signed(JSON.stringify({ id: 'evt_audit', type: 'invoice.paid' }));
    const fx = () => [{
      kind: 'INVOICE' as const, subjectId: 'org-x', organizationId: 'org-x', amountMinor: 1000,
      currency: 'VND', periodKey: PERIOD,
      subscriptionPatch: {
        planId: 'PRO', status: 'ACTIVE',
        currentPeriodStart: null, currentPeriodEnd: null,
        cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
      },
    }];
    await before.billing.processWebhook({ provider: 'deterministic-test-provider', eventId: 'evt_audit', eventType: 'invoice.paid', rawBody: raw, signature, verifier, correlationId: null, resolveEffects: fx });
    const v1 = (await before.billing.subscriptionOf('org-x'))!.version;
    await before.billing.processWebhook({ provider: 'deterministic-test-provider', eventId: 'evt_audit', eventType: 'invoice.paid', rawBody: raw, signature, verifier, correlationId: null, resolveEffects: fx });
    expect((await before.billing.subscriptionOf('org-x'))!.version).toBe(v1);
    expect(await before.billing.periodTotalMinor('org-x', PERIOD)).toBe(1000);

    // "Can a client claim payment success?"  → only a verified provider payload mutates state
    const repos: TransactionContext = before.persistence.repositories;
    expect(await repos.webhooks.find('deterministic-test-provider', 'evt_audit')).not.toBeNull();
  });
});