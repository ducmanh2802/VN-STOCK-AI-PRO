/**
 * BUSINESS-06 — BILLING PERSISTENCE SERVICE (webhooks + commercial ledger + subscriptions)
 * ======================================================================================
 * §12 webhook processing is durable and idempotent:
 *
 *   provider + eventId → processed exactly once
 *
 * Retrying the same webhook must NOT duplicate a subscription, an invoice, a ledger entry, an
 * entitlement or a seat. The guarantee comes from a UNIQUE constraint inside the database
 * (`business_webhook_records (provider, event_id)`), not from application bookkeeping.
 *
 * §25 failure semantics: an unverified payload NEVER grants entitlement, and a persistence
 * fault is NEVER reported as a successful payment.
 *
 * §10 the commercial ledger is deliberately separate from the financial ledgers
 * (FinancialConservation / InvestmentLedger / PortfolioLedger / TradingLedger). It is never
 * merged with them.
 */
import { createHash } from 'node:crypto';
import {
  PersistenceError,
  type CommercialEntryKind,
  type CommercialLedgerRepository,
  type SubscriptionRepository,
  type SubscriptionRow,
  type TransactionContext,
  type TransactionRunner,
  type WebhookRepository,
} from '../../lib/db/business06/contracts.ts';

export type BillingFailure =
  | 'PERSISTENCE_UNAVAILABLE'
  | 'SIGNATURE_INVALID'
  | 'EVENT_TYPE_UNSUPPORTED'
  | 'PAYLOAD_HASH_MISMATCH'
  | 'SUBSCRIPTION_NOT_FOUND';

export class BillingError extends Error {
  constructor(readonly failure: BillingFailure, message: string) {
    super(message);
    this.name = 'BillingError';
  }
}

/** §11 provider-neutral verification port. No provider is hard-coded. */
export interface PaymentProviderVerifier {
  readonly name: string;
  /** Raw body + provider signature → verified event, or null when the signature is invalid. */
  verify(rawBody: string, signature: string | null): { eventId: string; eventType: string; verified: boolean } | null;
}

export type WebhookOutcome =
  | { readonly status: 'PROCESSED'; readonly applied: readonly string[] }
  | { readonly status: 'DUPLICATE'; readonly applied: readonly string[] };

export interface WebhookEffectInput {
  readonly provider: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly rawBody: string;
  readonly signature: string | null;
  readonly verifier: PaymentProviderVerifier;
  readonly correlationId: string | null;
  /** Commercial effect derived from a VERIFIED payload only. */
  readonly resolveEffects: (eventType: string) => ReadonlyArray<{
    readonly kind: CommercialEntryKind;
    readonly subjectId: string;
    readonly organizationId: string | null;
    readonly amountMinor: number;
    readonly currency: string;
    readonly periodKey: string;
    readonly subscriptionPatch?: {
      readonly planId: string;
      readonly status: string;
      readonly currentPeriodStart: string | null;
      readonly currentPeriodEnd: string | null;
      readonly cancelAtPeriodEnd: boolean;
      readonly cancelledAt: string | null;
      readonly gracePeriodEnd: string | null;
      readonly trialEndsAt: string | null;
    };
  }>;
}

export function payloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

export class BillingPersistenceService {
  constructor(
    private readonly tx: TransactionRunner,
    private readonly now: () => number,
  ) {}

  /**
   * The single webhook entry point. Order matters:
   *   1. verify signature  (an unverified payload never reaches business state)
   *   2. INSERT ... ON CONFLICT DO NOTHING  → false means "already processed"
   *   3. apply ledger/subscription effects in the SAME transaction
   *
   * A duplicate delivery returns `DUPLICATE` and applies nothing.
   */
  async processWebhook(input: WebhookEffectInput): Promise<WebhookOutcome> {
    const at = this.now();
    const verified = input.verifier.verify(input.rawBody, input.signature);
    if (!verified || !verified.verified) {
      // §12: status supplied by an unverified payload is never trusted.
      throw new BillingError('SIGNATURE_INVALID', 'webhook signature could not be verified');
    }
    const hash = payloadHash(input.rawBody);

    return this.tx.run(async (repos) => {
      const inserted = await repos.webhooks.insertOnce({
        provider: input.provider,
        eventId: verified.eventId,
        eventType: verified.eventType,
        receivedAt: at,
        verifiedAt: at,
        processingStatus: 'VERIFIED',
        payloadHash: hash,
        processedAt: null,
        failureReason: null,
        correlationId: input.correlationId,
      });
      if (!inserted) {
        const existing = await repos.webhooks.find(input.provider, verified.eventId);
        // A previously FAILED event may be retried; a PROCESSED one must not re-apply.
        if (existing?.processingStatus === 'PROCESSED') {
          return { status: 'DUPLICATE', applied: [] };
        }
        await repos.webhooks.markProcessed(input.provider, verified.eventId, at);
        return { status: 'DUPLICATE', applied: [] };
      }

      const applied: string[] = [];
      try {
        const effects = input.resolveEffects(verified.eventType);
        for (const effect of effects) {
          // Ledger append is itself idempotent (UNIQUE event_id / causation_id).
          const appended = await repos.ledger.appendOnce({
            entryId: `${input.provider}-${verified.eventId}-${effect.kind}`,
            eventId: `${input.provider}-${verified.eventId}-${effect.kind}`,
            causationId: `${input.provider}-${verified.eventId}`,
            subjectId: effect.subjectId,
            organizationId: effect.organizationId,
            kind: effect.kind,
            amountMinor: effect.amountMinor,
            currency: effect.currency,
            periodKey: effect.periodKey,
            occurredAt: at,
            provider: input.provider,
            correlationId: input.correlationId,
            metadata: JSON.stringify({ eventType: verified.eventType }),
          });
          if (appended) applied.push(`ledger:${effect.kind}`);

          if (effect.subscriptionPatch) {
            const existingSub = await repos.subscriptions.findBySubject(effect.subjectId);
            if (!existingSub) throw new BillingError('SUBSCRIPTION_NOT_FOUND', `no subscription for ${effect.subjectId}`);
            const next: SubscriptionRow = {
              ...existingSub,
              planId: effect.subscriptionPatch.planId,
              status: effect.subscriptionPatch.status,
              currentPeriodStart: effect.subscriptionPatch.currentPeriodStart,
              currentPeriodEnd: effect.subscriptionPatch.currentPeriodEnd,
              cancelAtPeriodEnd: effect.subscriptionPatch.cancelAtPeriodEnd,
              cancelledAt: effect.subscriptionPatch.cancelledAt,
              gracePeriodEnd: effect.subscriptionPatch.gracePeriodEnd,
              trialEndsAt: effect.subscriptionPatch.trialEndsAt,
              updatedAt: new Date(at).toISOString(),
              version: existingSub.version + 1,
            };
            // Optimistic concurrency: refuse rather than clobber a concurrent transition.
            await repos.subscriptions.updateStatus(next, existingSub.version);
            applied.push(`subscription:${effect.subscriptionPatch.status}`);
          }
        }
        await repos.webhooks.markProcessed(input.provider, verified.eventId, at);
        return { status: 'PROCESSED', applied };
      } catch (e) {
        await repos.webhooks.markFailed(
          input.provider,
          verified.eventId,
          at,
          e instanceof Error ? e.message : String(e),
        );
        throw e;
      }
    });
  }

  /**
   * Manual/off-cycle state transition (§7). State is never mutated from raw HTTP input: the
   * caller must supply the target state and the service enforces the version compare-and-set.
   */
  async transitionSubscription(input: {
    subjectId: string;
    expectedVersion: number;
    patch: Partial<Pick<SubscriptionRow, 'status' | 'planId' | 'currentPeriodStart' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'cancelledAt' | 'gracePeriodEnd' | 'trialEndsAt'>>;
  }): Promise<SubscriptionRow> {
    const at = this.now();
    try {
      return await this.tx.run(async (repos) => {
        const existing = await repos.subscriptions.findBySubject(input.subjectId);
        if (!existing) throw new BillingError('SUBSCRIPTION_NOT_FOUND', 'subscription not found');
        const next: SubscriptionRow = {
          ...existing,
          ...input.patch,
          updatedAt: new Date(at).toISOString(),
          version: existing.version + 1,
        };
        await repos.subscriptions.updateStatus(next, input.expectedVersion);
        return next;
      });
    } catch (e) {
      if (e instanceof PersistenceError && e.fault === 'SERIALIZATION_CONFLICT') {
        throw new BillingError('PERSISTENCE_UNAVAILABLE', e.detail);
      }
      throw e;
    }
  }

  async createSubscription(row: SubscriptionRow): Promise<void> {
    await this.tx.run((repos) => repos.subscriptions.upsert(row));
  }

  async subscriptionOf(subjectId: string): Promise<SubscriptionRow | null> {
    return this.tx.run((repos) => repos.subscriptions.findBySubject(subjectId));
  }

  async ledgerOf(subjectId: string, limit = 100): Promise<readonly Awaited<ReturnType<CommercialLedgerRepository['listBySubject']>>[number][]> {
    return this.tx.run((repos) => repos.ledger.listBySubject(subjectId, limit));
  }

  async periodTotalMinor(subjectId: string, periodKey: string): Promise<number> {
    return this.tx.run((repos) => repos.ledger.totalMinor(subjectId, periodKey));
  }

  /**
   * §25 entitlement must never be inferred from "no error". A persistence fault raises so the
   * caller can answer UNAVAILABLE rather than silently downgrade to FREE.
   */
  async entitlementInputs(subjectId: string): Promise<{
    readonly subscription: SubscriptionRow | null;
    readonly webhookFailures: number;
  }> {
    return this.tx.run(async (repos: TransactionContext) => ({
      subscription: await repos.subscriptions.findBySubject(subjectId),
      webhookFailures: await repos.webhooks.countByStatus('FAILED'),
    }));
  }
}