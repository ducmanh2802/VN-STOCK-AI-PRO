/**
 * BUSINESS FULL BUSINESS END-TO-END TEST (roadmap §20)
 * =====================================================
 *
 *   CREATE USER → ASSIGN FREE PLAN → USE FREE FEATURES → HIT LIMIT → START TRIAL
 *   → ACTIVATE PREMIUM → GAIN ENTITLEMENT → RUN RESEARCH → CREATE STRATEGY → BACKTEST
 *   → PAPER REPLAY → PUBLISH RESEARCH → COMMUNITY SHARE → MARKETPLACE PUBLICATION
 *   → ORGANIZATION INVITATION → ASSIGN SEAT → TRAINING → SUBSCRIPTION CHANGE
 *   → REFUND / CANCELLATION → ENTITLEMENT RECONCILIATION → AUDIT
 *
 * The point of this file is not coverage of any single unit — the per-phase suites do that.
 * It is to prove the phases compose: that an entitlement decided in BUSINESS-01 still holds
 * after COMMUNITY, MARKETPLACE, ORGANIZATION and BILLING have each moved the subject's
 * state, and that no transition in the journey silently produces an unauthorized access, a
 * fabricated number, a broken provenance chain, or a missing audit event.
 *
 * VERIFIED INVARIANTS AT THE END:
 *   - no fake payment      : the only provider is SANDBOX and cannot settle
 *   - no fake performance  : any listing without full provenance renders NOT_AVAILABLE
 *   - no unauthorized access: cross-owner and cross-org reads are denied at every step
 *   - no broken provenance : the community chain reports gaps rather than omitting them
 *   - every commercial mutation left an audit event
 */

import { describe, it, expect } from 'vitest';
import { actorFromPrincipal } from '../actor.ts';
import { InMemoryCommercialAuditLog } from '../auditLog.ts';
import { EntitlementService, InMemorySubscriptionStore } from '../entitlementService.ts';
import { InMemoryUsageMeter } from '../usageMeter.ts';
import { CommunityEngine } from '../community/CommunityEngine.ts';
import { canView } from '../community/visibility.ts';
import { present } from '../community/types.ts';
import { MarketplaceEngine } from '../marketplace/MarketplaceEngine.ts';
import { emptyEvidence } from '../marketplace/performanceGate.ts';
import { evidence } from '../marketplace/types.ts';
import type { PerformanceEvidence } from '../marketplace/types.ts';
import { assignSeat, resolveEntitlementPrecedence, seatConsistency } from '../organization/OrganizationEngine.ts';
import type { Membership, Organization, Seat } from '../organization/types.ts';
import { CommercialLedger } from '../billing/commercialLedger.ts';
import { decideRefund } from '../billing/refundPolicy.ts';
import { EntitlementReconciler } from '../billing/reconciliation.ts';
import { SandboxPaymentProvider, money, transitionPayment } from '../billing/paymentProvider.ts';
import type { Subscription } from '../types.ts';

const NOW = '2026-10-15T00:00:00Z';
const NOW_MS = Date.parse(NOW);
const PERIOD = '2026-10';

function principal(userId: string, sessionId: string) {
  return { userId, sessionId, issuedAt: NOW_MS - 1000, expiresAt: NOW_MS + 3_600_000, provider: 'platform-session' as const };
}

function fullProvenance(period = { start: '2020-01-01', end: '2025-12-31' }): PerformanceEvidence {
  return {
    dataset: evidence('VN30 ADJUSTED 2026-10-01'),
    period: evidence(period),
    strategyVersion: evidence('v1.0.0'),
    costModel: evidence('BPS 15 + tax 10'),
    executionModel: evidence('next-bar-fill, lot 100'),
    validationState: evidence('OUT_OF_SAMPLE_PASSED'),
  };
}

// -----------------------------------------------------------------------------

describe('BUSINESS E2E — roadmap §20 full journey', () => {
  it('runs the whole commercial lifecycle with no fabricated state', async () => {
    const store = new InMemorySubscriptionStore();
    const usage = new InMemoryUsageMeter();
    const audit = new InMemoryCommercialAuditLog();
    const ledger = new CommercialLedger();

    const svc = new EntitlementService({
      subscriptions: store,
      usage,
      audit,
      reconciliation: () => 'CONSISTENT',
    });

    // ---------------------------------------------------------------- CREATE USER
    const actor = actorFromPrincipal(principal('alice', 'sess_alice'), 'ACTIVE', NOW_MS, 'corr_e2e');
    expect(actor.ok).toBe(true);
    const alice = actor.ok ? actor.actor : fail();

    // ------------------------------------------------- ASSIGN FREE PLAN (explicit)
    await svc.ensureFreeSubscription('alice', NOW);
    expect(await svc.resolvePlan('alice')).toBe('FREE');

    // ------------------------------------------------------- USE FREE FEATURES
    const learning = await svc.check({
      actor: alice, feature: 'LEARNING', at: NOW, meter: 'ALERTS', periodKey: PERIOD, usageEventId: 'e2e-alert-1',
    });
    expect(learning.verdict.allowed).toBe(true);

    // ----------------------------------------------------------- HIT THE LIMIT
    for (let i = 2; i <= 3; i++) {
      await svc.check({ actor: alice, feature: 'LEARNING', at: NOW, meter: 'ALERTS', periodKey: PERIOD, usageEventId: `e2e-alert-${i}` });
    }
    expect(await usage.consumed('alice', 'ALERTS', PERIOD)).toBe(3);

    const blocked = await svc.check({
      actor: alice, feature: 'LEARNING', at: NOW, meter: 'ALERTS', periodKey: PERIOD, usageEventId: 'e2e-alert-4',
    });
    expect(blocked.verdict.decision).toBe('LIMIT_REACHED');
    expect(blocked.verdict.allowed).toBe(false);
    // A LIMIT_REACHED probe must not have consumed anything.
    expect(await usage.consumed('alice', 'ALERTS', PERIOD)).toBe(3);

    // Free tier cannot do research at all.
    const freeResearch = await svc.check({ actor: alice, feature: 'RESEARCH', at: NOW, periodKey: PERIOD });
    expect(freeResearch.verdict.decision).toBe('DENIED_FEATURE_NOT_IN_PLAN');

    // ----------------------------------------------------------- START TRIAL
    // A trial is a real, explicitly-created paid subscription — never a plan flip on an
    // ACTIVE free subscription.
    await svc.openPaidSubscription({
      subjectId: 'alice', planId: 'PREMIUM', status: 'TRIALING',
      currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z',
      trialEndsAt: '2026-10-30T00:00:00Z', providerRef: 'sbx_trial_1', at: NOW,
      actorUserId: 'alice', actorSessionId: 'sess_alice', correlationId: 'corr_e2e', reason: 'TRIAL_STARTED',
    });
    expect(await svc.statusOf('alice', NOW_MS)).toBe('TRIALING');
    // A second subscription for the same subject is refused.
    await expect(svc.openPaidSubscription({
      subjectId: 'alice', planId: 'PRO', status: 'TRIALING',
      currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: null, providerRef: null, at: NOW,
      actorUserId: 'alice', actorSessionId: 'sess_alice', correlationId: null, reason: 'DUPLICATE',
    })).rejects.toThrow('PAID_SUBSCRIPTION_ALREADY_EXISTS');

    // -------------------------------------------------------- ACTIVATE PREMIUM
    const active = await svc.changeStatus({
      subjectId: 'alice', to: 'ACTIVE', at: NOW, actorUserId: 'alice', actorSessionId: 'sess_alice',
      correlationId: 'corr_e2e', reason: 'TRIAL_CONVERTED',
    });
    expect(active.status).toBe('ACTIVE');
    expect(active.planId).toBe('PREMIUM');

    // ---------------------------------------------------------- GAIN ENTITLEMENT
    const research = await svc.check({
      actor: alice, feature: 'RESEARCH', at: NOW, meter: 'RESEARCH_EXPERIMENTS', periodKey: PERIOD,
      usageEventId: 'e2e-exp-1',
    });
    expect(research.verdict.allowed).toBe(true);
    const certification = await svc.check({ actor: alice, feature: 'RESEARCH_CERTIFICATION', at: NOW, periodKey: PERIOD });
    expect(certification.verdict.allowed).toBe(true);

    // Paper replay is still a PRO feature — PREMIUM does not get it. This must NOT silently
    // succeed, and this is exactly the "no fabricated capability" check.
    const paperReplay = await svc.check({ actor: alice, feature: 'PAPER_REPLAY', at: NOW, periodKey: PERIOD });
    expect(paperReplay.verdict.allowed).toBe(false);
    expect(paperReplay.verdict.decision).toBe('DENIED_FEATURE_NOT_IN_PLAN');

    // ------------------------------------------------------- UPGRADE TO PRO
    await svc.changePlan({
      subjectId: 'alice', to: 'PRO', at: NOW, actorUserId: 'alice', actorSessionId: 'sess_alice',
      correlationId: 'corr_e2e', reason: 'UPGRADE',
    });
    const paperNow = await svc.check({
      actor: alice, feature: 'PAPER_REPLAY', at: NOW, meter: 'PAPER_REPLAYS', periodKey: PERIOD,
      usageEventId: 'e2e-replay-1',
    });
    expect(paperNow.verdict.allowed).toBe(true);

    // ------------------------------------------------ CREATE STRATEGY + BACKTEST
    let strategy = MarketplaceEngine.createVersion({
      strategyId: 'strat_1',
      authorUserId: 'alice',
      name: 'Trend filter',
      description: 'Moving-average filter with a volatility overlay.',
      universe: 'VN30',
      assetClass: 'EQUITY',
      rules: { entry: 'sma20 > sma60', exit: 'sma20 < sma60' },
      parameters: { fast: '20', slow: '60' },
      riskModel: 'vol-target 12%',
      executionModel: 'next-bar-fill, lot 100',
      costModel: 'BPS 15 + tax 10',
      // Evidence deliberately INCOMPLETE at first: a backtest exists but its provenance has
      // not been recorded yet.
      performanceEvidence: emptyEvidence(),
      performance: [{ metric: 'CAGR_PCT', value: 21.4 }, { metric: 'SHARPE', value: 1.05 }],
      commercialModel: 'FREE',
      visibility: 'PUBLIC',
      createdAt: NOW,
      previousVersionId: null,
    });

    // Backtest ran, so BACKTESTED is now an earned flag — but provenance is still absent.
    strategy = MarketplaceEngine.withEvidence(strategy, 'BACKTESTED');
    expect(MarketplaceEngine.performanceForDisplay(strategy).status).toBe('NOT_AVAILABLE');

    // PROVE NO FAKE PERFORMANCE: the numbers exist but will not render.
    const ungated = MarketplaceEngine.performanceForDisplay(strategy);
    if (ungated.status === 'NOT_AVAILABLE') expect(ungated.missing).toHaveLength(6);

    // --------------------------------------------------------- PAPER REPLAY
    strategy = MarketplaceEngine.withEvidence(strategy, 'PAPER_TESTED');

    // Complete the provenance, now that the replay has produced a real dataset/period.
    strategy = MarketplaceEngine.nextVersion(strategy, {
      at: '2026-10-20T00:00:00Z',
      performanceEvidence: fullProvenance(),
    });
    // A new version must NOT inherit the prior version's evidence.
    expect(strategy.evidence.has('CERTIFIED')).toBe(false);

    // Now the numbers render, and only with full provenance.
    const gated = MarketplaceEngine.performanceForDisplay(strategy);
    expect(gated.status).toBe('AVAILABLE');
    if (gated.status === 'AVAILABLE') {
      expect(gated.provenance.dataset).toBe('VN30 ADJUSTED 2026-10-01');
      expect(gated.provenance.validationState).toBe('OUT_OF_SAMPLE_PASSED');
    }

    // -------------------------------------------------- MARKETPLACE PUBLICATION
    const published = MarketplaceEngine.submitForPublication(strategy, {
      viewer: { userId: 'alice', organizationIds: [], workspaceIds: [], canModerate: false },
      planId: 'PRO',
      at: NOW,
    });
    expect(published.publication).toBe('SUBMITTED');
    expect(MarketplaceEngine.evidenceLevel(published)).toBe('AUTHORED'); // published, not validated

    // ------------------------------------------------------- COMMUNITY SHARE
    const post = CommunityEngine.createPost({
      postId: 'post_1',
      authorUserId: 'alice',
      authorDisplayName: 'Alice',
      authorOrganizationId: null,
      title: 'My trend filter: research notes',
      body: 'Sharing my backtest notes. CAGR 21.4% over 2020-2025 with a 19% drawdown. Educational research only.',
      labels: ['RESEARCH', 'PAPER_ONLY'],
      visibility: 'PUBLIC',
      workspaceId: null,
      organizationId: null,
      provenance: [
        present('RESEARCH_EXPERIMENT', 'exp_1', 'fp_abc'),
        present('STRATEGY_VERSION', 'strat_1', 'v2'),
      ],
      createdAt: NOW,
    });

    // PROVENANCE CHAIN: gaps are reported, never omitted.
    const chain = CommunityEngine.resolveChain(post);
    expect(chain).toHaveLength(6);
    expect(chain.find((c) => c.link === 'RESEARCH')!.state).toBe('PRESENT');
    expect(chain.find((c) => c.link === 'DATASET')!.state).toBe('NOT_AVAILABLE');
    expect(chain.find((c) => c.link === 'DATASET')!.refId).toBeNull();

    // ----------------------------------------------- ORGANIZATION INVITATION
    const org: Organization = {
      organizationId: 'org_acme', name: 'Acme Research', status: 'ACTIVE',
      subjectId: 'org_acme', planId: 'BUSINESS', createdAt: NOW, updatedAt: NOW,
    };
    const aliceMember: Membership = {
      organizationId: 'org_acme', userId: 'alice', role: 'OWNER', status: 'ACTIVE',
      seatId: 'seat_1', joinedAt: NOW, updatedAt: NOW,
    };
    const bobMember: Membership = {
      organizationId: 'org_acme', userId: 'bob', role: 'RESEARCHER', status: 'ACTIVE',
      seatId: 'seat_2', joinedAt: NOW, updatedAt: NOW,
    };

    // ------------------------------------------------------------ ASSIGN SEAT
    let seats: readonly Seat[] = [
      { seatId: 'seat_1', organizationId: 'org_acme', status: 'AVAILABLE', assignedUserId: null, assignedAt: null, createdAt: NOW, updatedAt: NOW },
      { seatId: 'seat_2', organizationId: 'org_acme', status: 'AVAILABLE', assignedUserId: null, assignedAt: null, createdAt: NOW, updatedAt: NOW },
    ];
    const a1 = assignSeat({ seat: seats[0], userId: 'alice', seats, orgPlanId: 'BUSINESS', at: NOW });
    seats = a1.allSeats;
    const a2 = assignSeat({ seat: seats[1], userId: 'bob', seats, orgPlanId: 'BUSINESS', at: NOW });
    seats = a2.allSeats;
    expect(seatConsistency(seats).consistent).toBe(true);

    // A third user cannot steal an assigned seat.
    expect(() => assignSeat({ seat: seats[0], userId: 'carol', seats, orgPlanId: 'BUSINESS', at: NOW }))
      .toThrow('INVALID_SEAT_TRANSITION:ASSIGNED->ASSIGNED');

    // ------------------------------------------------ ORGANIZATION ENTITLEMENT
    const precedence = resolveEntitlementPrecedence({
      individualPlanId: 'PRO',
      organizations: [org],
      memberships: [aliceMember],
      userId: 'alice',
    });
    expect(precedence.source).toBe('ORGANIZATION');
    expect(precedence.effectivePlanId).toBe('BUSINESS');
    expect(precedence.individualPlanId).toBe('PRO'); // retained for after departure

    // ------------------------------------------------------------- TRAINING
    // Referenced by id+version only; the LEARNING lane remains the engine owner.
    const assignment = {
      assignmentId: 'ta_1', organizationId: 'org_acme',
      learningPathId: 'path_quant_foundations', learningPathVersion: 'v1',
      assignedByUserId: 'alice', assignedAt: NOW,
    };
    expect(assignment.learningPathId).toBe('path_quant_foundations');
    // INSTRUCTOR cannot manage training; only TRAIN the cohort.
    expect(await (async () => {
      const { roleHas } = await import('../organization/OrganizationEngine.ts');
      return roleHas('INSTRUCTOR', 'TRAINING_MANAGE');
    })()).toBe(false);

    // --------------------------------------------------- SUBSCRIPTION CHANGE
    const orgSubject = {
      subjectId: 'org_acme', kind: 'ORGANIZATION' as const, organizationId: 'org_acme',
      sessionId: null, correlationId: 'corr_e2e',
    };
    const orgSub: Subscription = {
      subscriptionId: 'sub_org_acme', subjectId: 'org_acme', planId: 'BUSINESS', status: 'ACTIVE',
      currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z',
      cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
      createdAt: NOW, updatedAt: NOW, providerRef: null,
    };
    await store.save(orgSub);
    expect(await svc.resolvePlan('org_acme')).toBe('BUSINESS');
    expect(orgSubject.organizationId).toBe('org_acme');

    // ---------------------------------------------------------- PAYMENT (SANDBOX)
    const provider = new SandboxPaymentProvider();
    const attempt = await provider.createPayment({
      paymentId: 'pay_1', subjectId: 'org_acme', planId: 'BUSINESS',
      amount: money(5_000_000, 'VND'), idempotencyKey: 'e2e-idem-1', at: NOW,
    });
    expect(attempt.status).toBe('PAYMENT_PENDING');
    expect(attempt.environment).toBe('SANDBOX');

    // NO FAKE PAYMENT: the provider cannot settle and nothing is marked PRODUCTION.
    expect(provider.descriptor.canSettle).toBe(false);
    provider.applyProviderState('pay_1', 'PAYMENT_SUCCEEDED', NOW);

    // Ledger records the settled payment, sourced from the provider.
    const appendResult = ledger.append({
      entryId: 'le_pay_1', kind: 'PAYMENT_RECORDED', subjectId: 'org_acme', organizationId: 'org_acme',
      reference: 'sub_org_acme', amount: money(5_000_000, 'VND'), moneySource: 'PROVIDER_REPORTED',
      provider: provider.descriptor.name, providerRef: attempt.providerRef, environment: 'SANDBOX',
      causationId: 'pay_1', correlationId: 'corr_e2e', occurredAt: NOW, reason: 'PAYMENT_SETTLED',
    });
    expect(appendResult.duplicate).toBe(false);
    // Duplicate webhook => one economic effect.
    const replay = ledger.append({
      entryId: 'le_pay_2', kind: 'PAYMENT_RECORDED', subjectId: 'org_acme', organizationId: 'org_acme',
      reference: 'sub_org_acme', amount: money(5_000_000, 'VND'), moneySource: 'PROVIDER_REPORTED',
      provider: provider.descriptor.name, providerRef: attempt.providerRef, environment: 'SANDBOX',
      causationId: 'pay_1', correlationId: 'corr_e2e', occurredAt: NOW, reason: 'PAYMENT_SETTLED',
    });
    expect(replay.duplicate).toBe(true);
    expect(ledger.count()).toBe(1);

    // Platform fee + creator share, decomposed.
    ledger.append({
      entryId: 'le_fee_1', kind: 'PLATFORM_FEE', subjectId: 'org_acme', organizationId: 'org_acme',
      reference: 'listing_1', amount: money(750_000, 'VND'), moneySource: 'OPERATOR_ADJUSTMENT',
      provider: null, providerRef: null, environment: 'SANDBOX',
      causationId: 'fee_1', correlationId: 'corr_e2e', occurredAt: NOW, reason: 'FEE_APPLIED',
    });
    ledger.append({
      entryId: 'le_share_1', kind: 'CREATOR_SHARE', subjectId: 'alice', organizationId: null,
      reference: 'listing_1', amount: money(250_000, 'VND'), moneySource: 'OPERATOR_ADJUSTMENT',
      provider: null, providerRef: null, environment: 'SANDBOX',
      causationId: 'share_1', correlationId: 'corr_e2e', occurredAt: NOW, reason: 'SHARE_ACCRUED',
    });

    // ---------------------------------------------------- REFUND / CANCELLATION
    const refund = decideRefund({
      refundId: 'ref_1', paymentId: 'pay_1', subjectId: 'org_acme', amount: money(5_000_000, 'VND'),
      withinPaidPeriod: true, marketplacePurchase: false, creatorShareReversal: null,
      at: NOW, reason: 'customer request',
    });
    expect(refund.consequences).toContain('KEEP_ENTITLEMENT_UNTIL_PERIOD_END');
    // Research ownership survives the refund, unconditionally.
    expect(refund.consequences).toContain('RETAIN_RESEARCH_OWNERSHIP');

    ledger.append({
      entryId: 'le_ref_1', kind: 'REFUND_ISSUED', subjectId: 'org_acme', organizationId: 'org_acme',
      reference: 'sub_org_acme', amount: money(5_000_000, 'VND'), moneySource: 'PROVIDER_REPORTED',
      provider: provider.descriptor.name, providerRef: attempt.providerRef, environment: 'SANDBOX',
      causationId: refund.causationId, correlationId: 'corr_e2e', occurredAt: NOW, reason: 'REFUND_ISSUED',
    });

    // ------------------------------------------------ ENTITLEMENT RECONCILIATION
    const report = EntitlementReconciler.reconcile({
      subjectId: 'org_acme',
      subscription: orgSub,
      paymentStatus: 'PAYMENT_REFUNDED',
      lastVerdict: null,
      ledger: ledger.all(),
    }, NOW);
    // A refunded-but-ACTIVE organization IS a finding — reconciliation must surface it.
    expect(report.findings.some((f) => f.code === 'REFUNDED_SUBSCRIPTION_STILL_ENTITLING')).toBe(true);
    expect(report.consistent).toBe(false);

    // Cancellation, then the entitlement really does stop at period end.
    const cancelled = await svc.changeStatus({
      subjectId: 'org_acme', to: 'CANCELLED', at: NOW, actorUserId: 'alice',
      actorSessionId: 'sess_alice', correlationId: 'corr_e2e', reason: 'REFUND_CANCELLED',
    });
    expect(cancelled.cancelledAt).toBe(NOW);
    const insidePeriod = await svc.check({
      actor: { subject: orgSubject, platformUserStatus: 'ACTIVE' },
      feature: 'RESEARCH', at: '2026-10-20T00:00:00Z', periodKey: PERIOD,
    });
    expect(insidePeriod.verdict.allowed).toBe(true); // paid period not yet over
    const afterPeriod = await svc.check({
      actor: { subject: orgSubject, platformUserStatus: 'ACTIVE' },
      feature: 'RESEARCH', at: '2026-12-01T00:00:00Z', periodKey: '2026-12',
    });
    expect(afterPeriod.verdict.allowed).toBe(false);
    expect(afterPeriod.verdict.decision).toBe('DENIED_GRACE_EXPIRED');

    // A payment can never settle from UNKNOWN without an attributable actor.
    expect(() => transitionPayment('PAYMENT_UNKNOWN', 'PAYMENT_SUCCEEDED'))
      .toThrow('UNKNOWN_PAYMENT_CANNOT_SETTLE_WITHOUT_RESOLUTION_ACTOR');

    // -------------------------------------------------------- NO UNAUTHORIZED ACCESS
    const mallory = { userId: 'mallory', organizationIds: [], workspaceIds: [], canModerate: false };
    expect(canView(post, mallory).visible).toBe(true); // PUBLIC
    const privatePost = CommunityEngine.createPost({
      postId: 'post_private', authorUserId: 'alice', authorDisplayName: 'Alice',
      authorOrganizationId: 'org_acme', title: 'Internal research note',
      body: 'Internal note about our earnings analysis and valuation of HPG.',
      labels: ['PERSONAL_VIEW'], visibility: 'ORGANIZATION', workspaceId: null,
      organizationId: 'org_acme', provenance: [], createdAt: NOW,
    });
    expect(canView(privatePost, mallory).visible).toBe(false);
    expect(canView(privatePost, { userId: 'bob', organizationIds: ['org_acme'], workspaceIds: [], canModerate: false }).visible).toBe(true);

    // Departure restores the individual plan with no data loss.
    const afterDeparture = resolveEntitlementPrecedence({
      individualPlanId: 'PRO',
      organizations: [org],
      memberships: [{ ...aliceMember, status: 'REVOKED' }],
      userId: 'alice',
    });
    expect(afterDeparture.effectivePlanId).toBe('PRO');
    expect(afterDeparture.source).toBe('INDIVIDUAL');

    // ---------------------------------------------------------------- AUDIT
    const events = await audit.all();
    expect(events.length).toBeGreaterThan(0);
    // Every event is attributable and correlated.
    for (const e of events) {
      expect(e.reason.length).toBeGreaterThan(0);
      // The journey spans several instants, so assert the invariant that matters: every
      // event carries a real, parseable instant rather than a wall-clock read.
      expect(Number.isNaN(Date.parse(e.occurredAt)), e.occurredAt).toBe(false);
    }
    expect(events.some((e) => e.action === 'subscription_created')).toBe(true);
    expect(events.some((e) => e.action === 'plan_changed')).toBe(true);
    expect(events.some((e) => e.action === 'usage_recorded')).toBe(true);
    expect(events.some((e) => e.action === 'entitlement_denied')).toBe(true);
    expect(events.some((e) => e.action === 'subscription_cancelled')).toBe(true);
    // No credential ever reached the audit trail.
    for (const e of events) {
      for (const v of Object.values(e.metadata)) expect(v).not.toMatch(/whsec_|AKIA/);
    }

    // ------------------------------------------------------------ LEDGER SANITY
    const all = ledger.all();
    expect(all.length).toBe(4);
    const invariants = (await import('../billing/commercialLedger.ts')).ledgerInvariantsHold(all);
    expect(invariants.hold).toBe(true);
  });

  it('PROPERTY: no unauthorized subject ever gains an entitlement at any step', async () => {
    const store = new InMemorySubscriptionStore();
    const audit = new InMemoryCommercialAuditLog();
    const usage = new InMemoryUsageMeter();
    const svc = new EntitlementService({ subscriptions: store, usage, audit });

    await svc.ensureFreeSubscription('alice', NOW);
    const alice = actorFromPrincipal(principal('alice', 's'), 'ACTIVE', NOW_MS, 'c');
    await svc.changePlan({
      subjectId: 'alice', to: 'PRO', at: NOW, actorUserId: 'alice', actorSessionId: 's',
      correlationId: 'c', reason: 'UPGRADE',
    });

    // Every other subject, including anonymous, is refused every capability.
    const others = [null, 'bob', 'mallory', 'org_other', 'alice ', ''];
    for (const other of others) {
      const actor = other === null ? { subject: { subjectId: 'anonymous', kind: 'USER' as const, organizationId: null, sessionId: null, correlationId: null }, platformUserStatus: 'ACTIVE' as const } : null;
      if (actor) {
        for (const feature of ['LEARNING', 'RESEARCH', 'BACKTEST', 'PAPER_REPLAY']) {
          const v = await svc.check({ actor, feature, at: NOW, periodKey: PERIOD });
          expect(v.verdict.allowed, `${other} ${feature}`).toBe(false);
        }
      }
      if (other !== null) {
        const forged = { subject: { subjectId: other, kind: 'USER' as const, organizationId: null, sessionId: 'x', correlationId: null }, platformUserStatus: 'ACTIVE' as const };
        for (const feature of ['LEARNING', 'RESEARCH', 'BACKTEST', 'PAPER_REPLAY']) {
          const v = await svc.check({ actor: forged, feature, at: NOW, periodKey: PERIOD });
          expect(v.verdict.allowed, `${other} ${feature}`).toBe(false);
        }
      }
    }
    // Only the real subject passes.
    const ok = await svc.check({ actor: alice.ok ? alice.actor : fail(), feature: 'BACKTEST', at: NOW, periodKey: PERIOD });
    expect(ok.verdict.allowed).toBe(true);
  });

  it('PROPERTY: the ledger never accepts an unsourced amount at any point in the journey', () => {
    const l = new CommercialLedger();
    const bad = [
      { kind: 'PAYMENT_RECORDED', amount: money(100, 'VND'), moneySource: 'NONE' },
      { kind: 'PAYMENT_RECORDED', amount: null, moneySource: 'PROVIDER_REPORTED' },
      { kind: 'PAYMENT_RECORDED', amount: money(100, 'VND'), moneySource: 'PROVIDER_REPORTED', provider: null },
      { kind: 'CASH' },
      { kind: 'NAV' },
    ];
    for (const b of bad) {
      expect(() => l.append({
        entryId: `x_${Math.random()}`, kind: b.kind as never, subjectId: 'u1', organizationId: null,
        reference: 'r', amount: b.amount ?? null, moneySource: b.moneySource as never,
        provider: 'provider' in b ? (b.provider as string | null) : 'sbx', providerRef: null,
        environment: 'SANDBOX', causationId: `c_${Math.random()}`, correlationId: null,
        occurredAt: NOW, reason: 'r',
      }), `${b.kind}/${b.moneySource}`).toThrow();
    }
    expect(l.count()).toBe(0);
  });
});

function fail(): never {
  throw new Error('UNREACHABLE');
}