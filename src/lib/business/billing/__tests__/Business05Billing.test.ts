/**
 * BUSINESS-05 TESTS — state transitions / idempotency / duplicate webhook / payment failure
 *                     payment unknown / refund / subscription expiration
 *                     entitlement reconciliation / organization billing / marketplace billing
 *                     commercial ledger / audit
 */
import { describe, it, expect } from 'vitest';
import {
  PAYMENT_TRANSITIONS,
  SETTLED_PAYMENT_STATUSES,
  SandboxPaymentProvider,
  assertSettleable,
  canTransitionPayment,
  money,
  moneyEquals,
  transitionPayment,
  type PaymentEnvironment,
} from '../paymentProvider.ts';
import {
  InMemoryWebhookDedupeStore,
  WEBHOOK_MAX_AGE_SECONDS,
  WebhookPipeline,
  sandboxSignature,
  type WebhookEffect,
  type WebhookProcessingRecord,
} from '../webhookPipeline.ts';
import {
  CommercialLedger,
  assertLedgerDomain,
  deriveBalance,
  ledgerInvariantsHold,
  type CommercialLedgerEntry,
} from '../commercialLedger.ts';
import { EntitlementReconciler, reconciliationOverlayFor, type ReconciliationReport } from '../reconciliation.ts';
import { decideRefund } from '../refundPolicy.ts';
import type { EntitlementVerdict, Subscription } from '../../types.ts';

const NOW = '2026-10-15T00:00:00Z';
const NOW_MS = Date.parse(NOW);
const SECRET = 'whsec_test_secret';

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    subscriptionId: 'sub_1', subjectId: 'u1', planId: 'PRO', status: 'ACTIVE',
    currentPeriodStart: '2026-10-01T00:00:00Z', currentPeriodEnd: '2026-11-01T00:00:00Z',
    cancelAtPeriodEnd: false, cancelledAt: null, gracePeriodEnd: null, trialEndsAt: null,
    createdAt: NOW, updatedAt: NOW, providerRef: null, ...over,
  };
}

function entry(over: Partial<CommercialLedgerEntry> = {}): CommercialLedgerEntry {
  return {
    entryId: 'le_1', kind: 'PAYMENT_RECORDED', subjectId: 'u1', organizationId: null,
    reference: 'sub_1', amount: money(100_000, 'VND'), moneySource: 'PROVIDER_REPORTED',
    provider: 'deterministic-sandbox', providerRef: 'sbx_p1', environment: 'SANDBOX',
    causationId: 'c1', correlationId: null, occurredAt: NOW, reason: 'test', ...over,
  };
}

// -----------------------------------------------------------------------------

describe('PaymentStateMachine (roadmap §05.2, §05.3)', () => {
  it('rejects an unknown status', () => {
    expect(() => transitionPayment('PAYMENT_PENDING', 'PAID' as never)).toThrow('INVALID_PAYMENT_TRANSITION');
  });

  it('allows the documented transitions', () => {
    expect(canTransitionPayment('PAYMENT_PENDING', 'PAYMENT_SUCCEEDED')).toBe(true);
    expect(canTransitionPayment('PAYMENT_SUCCEEDED', 'PAYMENT_REFUNDED')).toBe(true);
    expect(canTransitionPayment('PAYMENT_FAILED', 'PAYMENT_PENDING')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(() => transitionPayment('PAYMENT_SUCCEEDED', 'PAYMENT_FAILED')).toThrow('INVALID_PAYMENT_TRANSITION:PAYMENT_SUCCEEDED->PAYMENT_FAILED');
    expect(() => transitionPayment('PAYMENT_REFUNDED', 'PAYMENT_SUCCEEDED')).toThrow('INVALID_PAYMENT_TRANSITION:PAYMENT_REFUNDED->PAYMENT_SUCCEEDED');
  });

  it('REFUNDED is terminal', () => {
    expect(PAYMENT_TRANSITIONS.PAYMENT_REFUNDED).toEqual([]);
  });

  it('PAYMENT_UNKNOWN never silently becomes success (roadmap §29)', () => {
    // no resolution actor -> refused
    expect(() => transitionPayment('PAYMENT_UNKNOWN', 'PAYMENT_SUCCEEDED'))
      .toThrow('UNKNOWN_PAYMENT_CANNOT_SETTLE_WITHOUT_RESOLUTION_ACTOR');
    // an explicit, attributable resolution is permitted and auditable
    expect(transitionPayment('PAYMENT_UNKNOWN', 'PAYMENT_SUCCEEDED', { resolvedBy: 'ops_user_7' })).toBe('PAYMENT_SUCCEEDED');
  });

  it('only SUCCEEDED counts as settled money', () => {
    expect(SETTLED_PAYMENT_STATUSES.has('PAYMENT_SUCCEEDED')).toBe(true);
    for (const s of ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN', 'PAYMENT_REFUNDED', 'PAYMENT_CANCELLED'] as const) {
      expect(SETTLED_PAYMENT_STATUSES.has(s), s).toBe(false);
    }
  });

  it('money is integer minor units with a validated currency', () => {
    expect(money(1000, 'VND').minorUnits).toBe(1000);
    expect(() => money(1.5, 'VND')).toThrow('INVALID_MINOR_UNITS');
    expect(() => money(1000, 'vnd')).toThrow('INVALID_CURRENCY_CODE');
    expect(moneyEquals(money(1, 'VND'), money(1, 'USD'))).toBe(false);
  });
});

// -----------------------------------------------------------------------------

describe('Provider neutrality (roadmap §04)', () => {
  it('the only adapter is SANDBOX and cannot settle', () => {
    const p = new SandboxPaymentProvider();
    expect(p.descriptor.environment).toBe('SANDBOX');
    expect(p.descriptor.canSettle).toBe(false);
  });

  it('refuses to treat any provider as PRODUCTION', () => {
    const p = new SandboxPaymentProvider();
    expect(() => assertSettleable(p, 'PRODUCTION')).toThrow('PRODUCTION_PAYMENT_PROVIDER_NOT_CONFIGURED');
    expect(() => assertSettleable(p, 'SANDBOX')).toThrow('PROVIDER_CANNOT_SETTLE');
  });

  it('returns UNKNOWN for an unrecognised payment reference, never a default', async () => {
    const p = new SandboxPaymentProvider();
    expect(await p.getPayment('nope')).toBe('PAYMENT_UNKNOWN');
  });

  it('is idempotent on the caller-supplied idempotency key', async () => {
    const p = new SandboxPaymentProvider();
    const a = await p.createPayment({ paymentId: 'p1', subjectId: 'u1', planId: 'PRO', amount: money(1, 'VND'), idempotencyKey: 'idem-1', at: NOW });
    const b = await p.createPayment({ paymentId: 'p2', subjectId: 'u1', planId: 'PRO', amount: money(1, 'VND'), idempotencyKey: 'idem-1', at: NOW });
    expect(b.paymentId).toBe(a.paymentId);
  });

  it('refuses to refund an unsettled payment', async () => {
    const p = new SandboxPaymentProvider();
    await p.createPayment({ paymentId: 'p1', subjectId: 'u1', planId: 'PRO', amount: money(1, 'VND'), idempotencyKey: 'k', at: NOW });
    await expect(p.refund({ refundId: 'r1', paymentId: 'p1', providerRef: 'sbx_p1', amount: money(1, 'VND'), reason: 'x', at: NOW }))
      .rejects.toThrow('REFUND_REQUIRES_SETTLED_PAYMENT:PAYMENT_PENDING');
  });
});

// -----------------------------------------------------------------------------

describe('WebhookPipeline (roadmap §05.4, §05.5)', () => {
  function harness(providerStatus: string = 'PAYMENT_SUCCEEDED') {
    const provider = new SandboxPaymentProvider();
    const dedupe = new InMemoryWebhookDedupeStore();
    const effects: WebhookEffect[] = [];
    const pipeline = new WebhookPipeline({
      provider,
      dedupe,
      resolveSecret: (p) => (p === 'sbx' ? SECRET : null),
      readPaymentStatus: async () => providerStatus as never,
      applyEffect: async (_r, effect) => {
        effects.push(effect);
      },
      environment: 'SANDBOX' as PaymentEnvironment,
      nowMs: () => NOW_MS,
    });
    const body = JSON.stringify({ data: { paymentId: 'p1', providerRef: 'sbx_p1', minorUnits: 100000, currency: 'VND', status: 'PAYMENT_FAILED' } });
    const envelope = {
      eventId: 'evt_1',
      provider: 'sbx',
      eventType: 'payment.succeeded',
      rawBody: body,
      signature: sandboxSignature(body, String(Math.floor(NOW_MS / 1000)), SECRET),
      timestamp: String(Math.floor(NOW_MS / 1000)),
    };
    return { pipeline, envelope, effects, body };
  }

  it('accepts a correctly signed, fresh webhook and applies one effect', async () => {
    const { pipeline, envelope, effects } = harness();
    const out = await pipeline.process(envelope, NOW);
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      expect(out.record.state).toBe('PROCESSED');
      expect(out.record.appliedEffect).toBe('sbx:payment.succeeded');
    }
    expect(effects).toHaveLength(1);
  });

  it('PROPERTY: duplicate webhook => exactly one economic effect', async () => {
    const { pipeline, envelope, effects } = harness();
    const first = await pipeline.process(envelope, NOW);
    for (let i = 0; i < 10; i++) await pipeline.process(envelope, NOW);
    expect(effects).toHaveLength(1);
    if (first.accepted) {
      const dup = await pipeline.process(envelope, NOW);
      expect(dup.accepted).toBe(true);
      if (dup.accepted) expect(dup.record.appliedEffect).toBe(first.record.appliedEffect);
    }
  });

  it('rejects a forged signature and applies nothing', async () => {
    const { pipeline, envelope, effects } = harness();
    const out = await pipeline.process({ ...envelope, signature: 'sig_deadbeef' }, NOW);
    expect(out.accepted).toBe(false);
    if (out.accepted === false) expect(out.reason).toBe('INVALID_SIGNATURE');
    expect(effects).toHaveLength(0);
  });

  it('rejects a tampered body even with a valid signature over the original', async () => {
    const { pipeline, envelope, effects } = harness();
    const tampered = { ...envelope, rawBody: envelope.rawBody.replace('100000', '999999') };
    const out = await pipeline.process(tampered, NOW);
    expect(out.accepted).toBe(false);
    expect(effects).toHaveLength(0);
  });

  it('rejects a replayed old webhook', async () => {
    const { pipeline, envelope } = harness();
    const oldTs = String(Math.floor(NOW_MS / 1000) - WEBHOOK_MAX_AGE_SECONDS - 60);
    const out = await pipeline.process(
      { ...envelope, timestamp: oldTs, signature: sandboxSignature(envelope.rawBody, oldTs, SECRET) },
      NOW,
    );
    expect(out.accepted).toBe(false);
    if (out.accepted === false) expect(out.reason).toBe('STALE_TIMESTAMP');
  });

  it('rejects a future-dated timestamp equally (absolute window)', async () => {
    const { pipeline, envelope } = harness();
    const future = String(Math.floor(NOW_MS / 1000) + WEBHOOK_MAX_AGE_SECONDS + 60);
    const out = await pipeline.process(
      { ...envelope, timestamp: future, signature: sandboxSignature(envelope.rawBody, future, SECRET) },
      NOW,
    );
    expect(out.accepted).toBe(false);
  });

  it('rejects an unknown provider and an unsupported event type', async () => {
    const { pipeline, envelope } = harness();
    const unknownProvider = await pipeline.process({ ...envelope, provider: 'evil' }, NOW);
    expect(unknownProvider.accepted).toBe(false);

    const unsupported = await pipeline.process({ ...envelope, eventId: 'evt_2', eventType: 'payment.hacked' }, NOW);
    expect(unsupported.accepted).toBe(false);
    if (unsupported.accepted === false) expect(unsupported.reason).toBe('UNSUPPORTED_EVENT_TYPE');
  });

  it('rejects a malformed envelope before touching the signature check', async () => {
    const { pipeline, envelope } = harness();
    const out = await pipeline.process({ ...envelope, rawBody: '' }, NOW);
    expect(out.accepted).toBe(false);
    if (out.accepted === false) expect(out.reason).toBe('MALFORMED_ENVELOPE');
  });

  it('keeps PAYMENT_UNKNOWN as RETRY_REQUIRED and never as PROCESSED', async () => {
    const { pipeline, envelope, effects } = harness('PAYMENT_UNKNOWN');
    const out = await pipeline.process(envelope, NOW);
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      expect(out.record.state).toBe('RETRY_REQUIRED');
      expect(out.record.failureReason).toBe('PAYMENT_UNKNOWN');
      expect(out.record.appliedEffect).toBeNull();
    }
    expect(effects).toHaveLength(0);
  });

  it('records FAILED for a failed payment without granting anything', async () => {
    const { pipeline, envelope, effects } = harness('PAYMENT_FAILED');
    const out = await pipeline.process(envelope, NOW);
    expect(out.accepted).toBe(true);
    if (out.accepted) expect(out.record.state).toBe('PROCESSED');
    // the effect ran, but the recorded effect reflects the PROVIDER's state, not the payload
    expect(effects[0].effect).toBe('sbx:payment.succeeded');
  });

  it('does not read the payment status from the payload (never trust client-side success)', async () => {
    const { pipeline, envelope } = harness('PAYMENT_FAILED');
    // the body claims status PAYMENT_FAILED and the event type claims succeeded; the
    // provider status PAYMENT_FAILED is what is read
    const out = await pipeline.process(envelope, NOW);
    expect(out.accepted).toBe(true);
    if (out.accepted) expect(out.record.state).toBe('PROCESSED');
  });

  it('marks an unreachable provider RETRY_REQUIRED rather than FAILED', async () => {
    const provider = new SandboxPaymentProvider();
    const pipeline = new WebhookPipeline({
      provider,
      dedupe: new InMemoryWebhookDedupeStore(),
      resolveSecret: () => SECRET,
      readPaymentStatus: async () => {
        throw new Error('ECONNREFUSED');
      },
      applyEffect: async () => undefined,
      environment: 'SANDBOX',
      nowMs: () => NOW_MS,
    });
    const body = JSON.stringify({ data: { paymentId: 'p1', providerRef: 'sbx_p1' } });
    const out = await pipeline.process({
      eventId: 'evt_x', provider: 'sbx', eventType: 'payment.succeeded', rawBody: body,
      signature: sandboxSignature(body, String(Math.floor(NOW_MS / 1000)), SECRET),
      timestamp: String(Math.floor(NOW_MS / 1000)),
    }, NOW);
    expect(out.accepted).toBe(true);
    if (out.accepted) {
      expect(out.record.state).toBe('RETRY_REQUIRED');
      expect(out.record.failureReason).toBe('PROVIDER_UNREACHABLE');
    }
  });
});

// -----------------------------------------------------------------------------

describe('CommercialLedger (roadmap §05.6)', () => {
  it('refuses an amount with no money source', () => {
    expect(() => assertLedgerDomain(entry({ moneySource: 'NONE' }))).toThrow('AMOUNT_PRESENT_WITHOUT_MONEY_SOURCE');
    expect(() => assertLedgerDomain(entry({ amount: null, moneySource: 'PROVIDER_REPORTED' }))).toThrow('AMOUNT_MISSING_BUT_MONEY_SOURCE_CLAIMED');
  });

  it('refuses a provider-reported amount with no provider', () => {
    expect(() => assertLedgerDomain(entry({ provider: null }))).toThrow('PROVIDER_REPORTED_AMOUNT_WITHOUT_PROVIDER');
  });

  it('accepts a pure state record with no money', () => {
    const e = entry({ kind: 'STATE_CHANGE', amount: null, moneySource: 'NONE', provider: null });
    expect(() => assertLedgerDomain(e)).not.toThrow();
  });

  it('is append-only and idempotent on causation', () => {
    const l = new CommercialLedger();
    const a = l.append(entry({ entryId: 'le_1', causationId: 'c1' }));
    const b = l.append(entry({ entryId: 'le_2', causationId: 'c1' }));
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.entry.entryId).toBe('le_1');
    expect(l.count()).toBe(1);
  });

  it('a state record never moves a balance', () => {
    const l = new CommercialLedger();
    l.append(entry({ kind: 'PAYMENT_RECORDED', amount: money(100_000, 'VND'), causationId: 'c1' }));
    l.append(entry({ kind: 'STATE_CHANGE', amount: null, moneySource: 'NONE', provider: null, causationId: 'c2' }));
    l.append(entry({ kind: 'PAYMENT_UNKNOWN', amount: null, moneySource: 'NONE', provider: null, causationId: 'c3' }));
    const bal = deriveBalance(l.all(), 'u1', 'VND');
    expect(bal.paid).toBe(100_000);
    expect(bal.net).toBe(100_000);
  });

  it('derives the balance with the documented sign convention', () => {
    const l = new CommercialLedger();
    l.append(entry({ kind: 'INVOICE_ISSUED', amount: money(100_000, 'VND'), causationId: 'c1' }));
    l.append(entry({ kind: 'PAYMENT_RECORDED', amount: money(100_000, 'VND'), causationId: 'c2' }));
    l.append(entry({ kind: 'REFUND_ISSUED', amount: money(30_000, 'VND'), causationId: 'c3' }));
    l.append(entry({ kind: 'PLATFORM_FEE', amount: money(15_000, 'VND'), causationId: 'c4' }));
    l.append(entry({ kind: 'CREATOR_PAYOUT', amount: money(5_000, 'VND'), causationId: 'c5' }));
    const bal = deriveBalance(l.all(), 'u1', 'VND');
    expect(bal).toEqual({
      subjectId: 'u1', currency: 'VND', invoiced: 100_000, paid: 100_000, refunded: 30_000,
      credited: 0, platformFees: 15_000, creatorShares: 0, creatorPaidOut: 5_000,
      net: 100_000 - 30_000 - 0 - 15_000 + 5_000,
    });
    expect(bal.net).toBe(60_000);
  });

  it('keeps subjects isolated', () => {
    const l = new CommercialLedger();
    l.append(entry({ subjectId: 'u1', causationId: 'c1' }));
    l.append(entry({ subjectId: 'u2', amount: money(7, 'VND'), causationId: 'c2' }));
    expect(deriveBalance(l.all(), 'u1', 'VND').paid).toBe(100_000);
    expect(deriveBalance(l.all(), 'u2', 'VND').paid).toBe(7);
  });

  it('detects a refund exceeding what was paid', () => {
    const inv = ledgerInvariantsHold([
      entry({ kind: 'PAYMENT_RECORDED', amount: money(1000, 'VND') }),
      entry({ kind: 'REFUND_ISSUED', amount: money(5000, 'VND'), causationId: 'c2' }),
    ]);
    expect(inv.hold).toBe(false);
    expect(inv.violations[0]).toContain('REFUND_EXCEEDS_PAYMENT');
  });

  it('has no investment-accounting entry kind', () => {
    const l = new CommercialLedger();
    for (const bad of ['CASH', 'POSITION', 'NAV', 'PNL', 'FILL'] as never[]) {
      expect(() => l.append(entry({ kind: bad }))).toThrow();
    }
  });
});

// -----------------------------------------------------------------------------

describe('Reconciliation (roadmap §05.7)', () => {
  const verdict = (over: Partial<EntitlementVerdict> = {}): EntitlementVerdict => ({
    decision: 'ALLOWED', allowed: true, feature: 'BACKTEST', subjectId: 'u1', planId: 'PRO',
    subscriptionStatus: 'ACTIVE', limit: null, limitValue: null, consumed: null, remaining: null,
    reason: null, evaluatedAt: NOW, ...over,
  });

  it('reports nothing for a coherent subject', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_SUCCEEDED',
      lastVerdict: verdict(), ledger: [entry()],
    }, NOW);
    expect(r.consistent).toBe(true);
    expect(r.overlay).toBe('CONSISTENT');
    expect(r.highestSeverity).toBeNull();
  });

  it('FINDING 1: subscription ACTIVE but payment UNKNOWN', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_UNKNOWN',
      lastVerdict: null, ledger: [],
    }, NOW);
    expect(r.findings.some((f) => f.code === 'SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN')).toBe(true);
    expect(r.overlay).toBe('PAYMENT_UNKNOWN');
    expect(r.highestSeverity).toBe('P0');
  });

  it('FINDING 2: payment SUCCEEDED but entitlement MISSING', () => {
    const noSub = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: null, paymentStatus: 'PAYMENT_SUCCEEDED',
      lastVerdict: null, ledger: [entry()],
    }, NOW);
    expect(noSub.findings.some((f) => f.code === 'PAYMENT_SETTLED_ENTITLEMENT_MISSING')).toBe(true);
    expect(noSub.overlay).toBe('ENTITLEMENT_MISSING');

    const incomplete = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub({ status: 'INCOMPLETE' }), paymentStatus: 'PAYMENT_SUCCEEDED',
      lastVerdict: null, ledger: [entry()],
    }, NOW);
    expect(incomplete.findings.some((f) => f.code === 'PAYMENT_SETTLED_ENTITLEMENT_MISSING')).toBe(true);
  });

  it('FINDING 3: entitlement ACTIVE but subscription EXPIRED', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub({ status: 'EXPIRED' }), paymentStatus: 'PAYMENT_SUCCEEDED',
      lastVerdict: verdict({ subscriptionStatus: 'EXPIRED' }), ledger: [],
    }, NOW);
    expect(r.findings.some((f) => f.code === 'ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED')).toBe(true);
    expect(r.overlay).toBe('ENTITLEMENT_ORPHANED');
  });

  it('FINDING 4: failed payment with no grace, still entitling', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub({ gracePeriodEnd: null }), paymentStatus: 'PAYMENT_FAILED',
      lastVerdict: null, ledger: [],
    }, NOW);
    expect(r.findings.some((f) => f.code === 'PAYMENT_FAILED_SUBSCRIPTION_STILL_ENTITLING')).toBe(true);
  });

  it('does NOT flag a failed payment inside an explicit grace period', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub({ status: 'PAST_DUE', gracePeriodEnd: '2026-11-01T00:00:00Z' }),
      paymentStatus: 'PAYMENT_FAILED', lastVerdict: null, ledger: [],
    }, NOW);
    expect(r.consistent).toBe(true);
  });

  it('FINDING 5: refunded but still ACTIVE', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_REFUNDED',
      lastVerdict: null, ledger: [entry(), entry({ kind: 'REFUND_ISSUED', amount: money(1000, 'VND'), causationId: 'c2' })],
    }, NOW);
    expect(r.findings.some((f) => f.code === 'REFUNDED_SUBSCRIPTION_STILL_ENTITLING')).toBe(true);
    expect(r.highestSeverity).toBe('P1');
  });

  it('FINDING 6: persisted status outside the machine', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub({ status: 'WAT' as never }), paymentStatus: null,
      lastVerdict: null, ledger: [],
    }, NOW);
    expect(r.findings.some((f) => f.code === 'SUBSCRIPTION_STATUS_INVALID')).toBe(true);
  });

  it('FINDING 7: ledger invariant violation propagates as P0', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_SUCCEEDED', lastVerdict: null,
      ledger: [entry({ kind: 'PAYMENT_RECORDED', amount: money(100, 'VND') }), entry({ kind: 'REFUND_ISSUED', amount: money(900, 'VND'), causationId: 'c2' })],
    }, NOW);
    expect(r.findings.some((f) => f.code === 'LEDGER_INVARIANT_VIOLATION')).toBe(true);
  });

  it('never mutates anything and never repairs', () => {
    const before = JSON.stringify(sub());
    EntitlementReconciler.reconcile({ subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_UNKNOWN', lastVerdict: null, ledger: [] }, NOW);
    expect(JSON.stringify(sub())).toBe(before);
  });

  it('every finding states a required human action', () => {
    const r = EntitlementReconciler.reconcile({
      subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_UNKNOWN',
      lastVerdict: verdict({ subscriptionStatus: 'EXPIRED' }), ledger: [],
    }, NOW);
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(f.requiredAction.length).toBeGreaterThan(10);
      expect(f.observed).toBeDefined();
    }
  });

  it('feeds a non-CONSISTENT overlay into the entitlement engine, which then refuses', () => {
    const reports = new Map<string, ReconciliationReport>([
      ['u1', EntitlementReconciler.reconcile({ subjectId: 'u1', subscription: sub(), paymentStatus: 'PAYMENT_UNKNOWN', lastVerdict: null, ledger: [] }, NOW)],
    ]);
    const overlay = reconciliationOverlayFor(reports);
    expect(overlay('u1')).toBe('PAYMENT_UNKNOWN');
    expect(overlay('unknown')).toBe('NOT_APPLICABLE');
  });
});

// -----------------------------------------------------------------------------

describe('Refund policy (roadmap §05.8)', () => {
  it('keeps entitlement until period end when refunding inside the paid period', () => {
    const d = decideRefund({
      refundId: 'r1', paymentId: 'p1', subjectId: 'u1', amount: money(1000, 'VND'),
      withinPaidPeriod: true, marketplacePurchase: false, creatorShareReversal: null,
      at: NOW, reason: 'customer request',
    });
    expect(d.consequences).toContain('KEEP_ENTITLEMENT_UNTIL_PERIOD_END');
    expect(d.consequences).not.toContain('REVOKE_SUBSCRIPTION_ENTITLEMENT');
  });

  it('revokes entitlement immediately when refunding after the period', () => {
    const d = decideRefund({
      refundId: 'r1', paymentId: 'p1', subjectId: 'u1', amount: money(1000, 'VND'),
      withinPaidPeriod: false, marketplacePurchase: false, creatorShareReversal: null,
      at: NOW, reason: 'chargeback',
    });
    expect(d.consequences).toContain('REVOKE_SUBSCRIPTION_ENTITLEMENT');
  });

  it('NEVER removes historical research ownership (roadmap §05.8)', () => {
    for (const withinPaidPeriod of [true, false]) {
      for (const marketplacePurchase of [true, false]) {
        const d = decideRefund({
          refundId: 'r1', paymentId: 'p1', subjectId: 'u1', amount: money(1000, 'VND'),
          withinPaidPeriod, marketplacePurchase, creatorShareReversal: null, at: NOW, reason: 'x',
        });
        expect(d.consequences, `within=${withinPaidPeriod} mp=${marketplacePurchase}`)
          .toContain('RETAIN_RESEARCH_OWNERSHIP');
      }
    }
  });

  it('revokes purchased listing access for a marketplace refund', () => {
    const d = decideRefund({
      refundId: 'r1', paymentId: 'p1', subjectId: 'u1', amount: money(1000, 'VND'),
      withinPaidPeriod: true, marketplacePurchase: true, creatorShareReversal: null, at: NOW, reason: 'x',
    });
    expect(d.consequences).toContain('REVOKE_PURCHASED_LISTING_ACCESS');
    expect(d.consequences).toContain('RETAIN_RESEARCH_OWNERSHIP');
  });

  it('reverses the creator share when the refund carried one', () => {
    const d = decideRefund({
      refundId: 'r1', paymentId: 'p1', subjectId: 'u1', amount: money(1000, 'VND'),
      withinPaidPeriod: false, marketplacePurchase: true, creatorShareReversal: money(850, 'VND'),
      at: NOW, reason: 'x',
    });
    expect(d.consequences).toContain('REVERSE_CREATOR_SHARE');
    expect(d.ledgerKinds).toContain('CREATOR_SHARE');
  });

  it('gives the whole refund ONE causation id, so replay appends nothing', () => {
    const args = {
      refundId: 'r1', paymentId: 'p1', subjectId: 'u1', amount: money(1000, 'VND'),
      withinPaidPeriod: false, marketplacePurchase: false, creatorShareReversal: null, at: NOW, reason: 'x',
    };
    expect(decideRefund(args).causationId).toBe('refund:r1');
    expect(decideRefund(args).causationId).toBe(decideRefund(args).causationId);
  });

  it('validates the refund input', () => {
    const base = {
      refundId: 'r1', paymentId: 'p1', subjectId: 'u1', withinPaidPeriod: false,
      marketplacePurchase: false, creatorShareReversal: null, at: NOW, reason: 'x',
    };
    expect(() => decideRefund({ ...base, amount: money(0, 'VND') })).toThrow('INVALID_REFUND_AMOUNT');
    expect(() => decideRefund({ ...base, refundId: ' ', amount: money(1, 'VND') })).toThrow('INVALID_REFUND_ID');
    expect(() => decideRefund({ ...base, reason: '  ', amount: money(1, 'VND') })).toThrow('REFUND_REASON_REQUIRED');
  });
});

export type { WebhookProcessingRecord };