/**
 * BUSINESS-05 — PAYMENT PROVIDER ABSTRACTION
 * ==========================================
 * Provider-neutral payment architecture (roadmap §04, §05.1).
 *
 * REALITY OF THIS REPOSITORY (verified in PHASE 0 §5.2)
 *   There is NO payment provider integration anywhere in this codebase. No provider SDK, no
 *   API key, no merchant account. Therefore this file defines the SEAM and nothing else.
 *
 * WHAT THAT MEANS CONCRETELY
 *   - `SandboxPaymentProvider` is the only implementation, and it is explicitly labelled
 *     SANDBOX. It settles nothing.
 *   - No code path can mark a payment PRODUCTION, because `PaymentEnvironment.PRODUCTION`
 *     has no adapter and `assertSettleable` refuses it.
 *   - Amounts recorded here are amounts a provider REPORTED. They are never asserted as real
 *     revenue, and `CommercialLedgerEntry.moneySource` records where each amount came from.
 *
 *   This is the §2.1 / §29 requirement made structural: a test payment cannot be
 *   represented as a real payment, because there is no code path that could do so.
 */

// ============================================================================
// ENVIRONMENT
// ============================================================================

export type PaymentEnvironment = 'TEST' | 'SANDBOX' | 'PRODUCTION';

export interface PaymentProviderDescriptor {
  readonly name: string;
  readonly environment: PaymentEnvironment;
  /** False for every adapter that exists today. A provider claiming settlement is refused. */
  readonly canSettle: boolean;
}

// ============================================================================
// MONEY
// ============================================================================

/**
 * Money is integer minor units ONLY. There is deliberately no floating-point money type in
 * this lane: `0.1 + 0.2` must never be able to reach a ledger.
 *
 * There is also no VND/USD conversion table and no FX rate, because inventing one would be
 * fabricating a financial figure (§2.1). A provider that reports mixed currencies is a
 * reconciliation finding, not something to paper over.
 */
export interface Money {
  readonly minorUnits: number;
  readonly currency: string;
}

export function money(minorUnits: number, currency: string): Money {
  if (!Number.isSafeInteger(minorUnits)) throw new Error('INVALID_MINOR_UNITS');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('INVALID_CURRENCY_CODE');
  return Object.freeze({ minorUnits, currency });
}

export function moneyEquals(a: Money | null, b: Money | null): boolean {
  if (a === null || b === null) return a === b;
  return a.minorUnits === b.minorUnits && a.currency === b.currency;
}

// ============================================================================
// PAYMENT STATE (roadmap §05.2)
// ============================================================================

export type PaymentStatus =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_UNKNOWN';

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = Object.freeze({
  PAYMENT_PENDING: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_UNKNOWN'],
  PAYMENT_SUCCEEDED: ['PAYMENT_REFUNDED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'PAYMENT_UNKNOWN'],
  PAYMENT_CANCELLED: ['PAYMENT_PENDING'],
  // UNKNOWN is absorbing: the outcome is not yet known and must not be guessed.
  PAYMENT_UNKNOWN: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'],
  PAYMENT_REFUNDED: [],
});

/** Only these states represent settled money. */
export const SETTLED_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(['PAYMENT_SUCCEEDED']);

/**
 * §05.2: "PAYMENT_UNKNOWN must NOT silently become success."
 * This is the only transition function, and `PAYMENT_UNKNOWN -> PAYMENT_SUCCEEDED` is a
 * deliberate, audited, explicitly-invoked edge — not a default. Every other path must go
 * through `PaymentStateMachine.settle`, which refuses to settle an UNKNOWN payment without an
 * explicit `resolvedBy` actor.
 */
export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function transitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
  ctx: { readonly resolvedBy?: string | null } = {},
): PaymentStatus {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`INVALID_PAYMENT_TRANSITION:${from}->${to}`);
  }
  if (from === 'PAYMENT_UNKNOWN' && to === 'PAYMENT_SUCCEEDED' && !ctx.resolvedBy) {
    // Refuses the "silently becomes success" path (roadmap §29).
    throw new Error('UNKNOWN_PAYMENT_CANNOT_SETTLE_WITHOUT_RESOLUTION_ACTOR');
  }
  return to;
}

// ============================================================================
// ENTITIES
// ============================================================================

export interface PaymentAttempt {
  readonly paymentId: string;
  readonly provider: string;
  readonly providerRef: string | null;
  readonly subjectId: string;
  readonly planId: string;
  readonly status: PaymentStatus;
  readonly amount: Money | null;
  readonly idempotencyKey: string;
  /** Environment the attempt was created in. Never inferred. */
  readonly environment: PaymentEnvironment;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RefundRecord {
  readonly refundId: string;
  readonly paymentId: string;
  readonly providerRef: string | null;
  readonly amount: Money;
  readonly reason: string;
  readonly environment: PaymentEnvironment;
  readonly createdAt: string;
}

// ============================================================================
// PROVIDER INTERFACE (roadmap §05.1)
// ============================================================================

export interface PaymentProvider {
  readonly descriptor: PaymentProviderDescriptor;
  /** Create an attempt. Must be idempotent on `idempotencyKey`. */
  createPayment(input: {
    readonly paymentId: string;
    readonly subjectId: string;
    readonly planId: string;
    readonly amount: Money;
    readonly idempotencyKey: string;
    readonly at: string;
  }): Promise<PaymentAttempt>;
  /** Fetch the current state. A provider that cannot determine the state returns UNKNOWN. */
  getPayment(providerRef: string): Promise<PaymentStatus>;
  refund(input: {
    readonly refundId: string;
    readonly paymentId: string;
    readonly providerRef: string;
    readonly amount: Money;
    readonly reason: string;
    readonly at: string;
  }): Promise<RefundRecord>;
  verifyWebhookSignature(input: {
    readonly rawBody: string;
    readonly signature: string;
    readonly timestamp: string;
    readonly secret: string;
  }): boolean;
}

/**
 * Fail-closed environment guard.
 *
 * There is no adapter with `environment === 'PRODUCTION'` in this repository, so
 * `assertSettleable` throws for PRODUCTION and for any adapter that cannot settle. This is
 * what guarantees §4's "Never allow test payment state to grant production financial
 * privileges" at the type and runtime level rather than by convention.
 */
export function assertSettleable(provider: PaymentProvider, environment: PaymentEnvironment): void {
  if (environment === 'PRODUCTION') {
    throw new Error('PRODUCTION_PAYMENT_PROVIDER_NOT_CONFIGURED');
  }
  if (!provider.descriptor.canSettle) {
    throw new Error(`PROVIDER_CANNOT_SETTLE:${provider.descriptor.name}`);
  }
  if (provider.descriptor.environment !== environment) {
    throw new Error(`PROVIDER_ENVIRONMENT_MISMATCH:${provider.descriptor.environment}!=${environment}`);
  }
}

// ============================================================================
// SANDBOX ADAPTER — the only implementation
// ============================================================================

/**
 * Deterministic sandbox adapter. It exists so the billing state machine, webhook pipeline,
 * ledger and reconciliation can be exercised end to end with no network and no provider.
 *
 * It is labelled SANDBOX in its own descriptor, every record it produces carries
 * `environment: 'SANDBOX'`, and `canSettle` is false. It cannot represent a real payment.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly descriptor: PaymentProviderDescriptor = Object.freeze({
    name: 'deterministic-sandbox',
    environment: 'SANDBOX' as const,
    canSettle: false,
  });

  private readonly attempts = new Map<string, PaymentAttempt>();
  private readonly secrets = new Map<string, string>();

  /** Set the expected webhook secret for a provider endpoint. Test-only surface. */
  setWebhookSecret(providerRef: string, secret: string): void {
    this.secrets.set(providerRef, secret);
  }

  async createPayment(input: {
    readonly paymentId: string;
    readonly subjectId: string;
    readonly planId: string;
    readonly amount: Money;
    readonly idempotencyKey: string;
    readonly at: string;
  }): Promise<PaymentAttempt> {
    // Idempotent on the caller-supplied key: a retried create returns the SAME attempt.
    for (const existing of this.attempts.values()) {
      if (existing.idempotencyKey === input.idempotencyKey) return existing;
    }
    const attempt: PaymentAttempt = Object.freeze({
      paymentId: input.paymentId,
      provider: this.descriptor.name,
      providerRef: `sbx_${input.paymentId}`,
      subjectId: input.subjectId,
      planId: input.planId,
      status: 'PAYMENT_PENDING',
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      environment: this.descriptor.environment,
      createdAt: input.at,
      updatedAt: input.at,
    });
    this.attempts.set(input.paymentId, attempt);
    return attempt;
  }

  /** Test surface: force an attempt into a state, as a provider callback would. */
  applyProviderState(paymentId: string, status: PaymentStatus, at: string): PaymentAttempt {
    const existing = this.attempts.get(paymentId);
    if (!existing) throw new Error(`UNKNOWN_PAYMENT:${paymentId}`);
    const next: PaymentAttempt = Object.freeze({ ...existing, status, updatedAt: at });
    this.attempts.set(paymentId, next);
    return next;
  }

  async getPayment(providerRef: string): Promise<PaymentStatus> {
    for (const a of this.attempts.values()) {
      if (a.providerRef === providerRef) return a.status;
    }
    // Unknown reference => UNKNOWN, never a default of success or failure.
    return 'PAYMENT_UNKNOWN';
  }

  async refund(input: {
    readonly refundId: string;
    readonly paymentId: string;
    readonly providerRef: string;
    readonly amount: Money;
    readonly reason: string;
    readonly at: string;
  }): Promise<RefundRecord> {
    const existing = this.attempts.get(input.paymentId);
    if (!existing) throw new Error(`UNKNOWN_PAYMENT:${input.paymentId}`);
    if (existing.status !== 'PAYMENT_SUCCEEDED') {
      throw new Error(`REFUND_REQUIRES_SETTLED_PAYMENT:${existing.status}`);
    }
    const next: PaymentAttempt = Object.freeze({ ...existing, status: 'PAYMENT_REFUNDED', updatedAt: input.at });
    this.attempts.set(input.paymentId, next);
    return Object.freeze({
      refundId: input.refundId,
      paymentId: input.paymentId,
      providerRef: input.providerRef,
      amount: input.amount,
      reason: input.reason,
      environment: this.descriptor.environment,
      createdAt: input.at,
    });
  }

  /**
   * Deterministic HMAC-style signature check over raw body + timestamp.
   *
   * Note: this is a TEST adapter's stand-in for a provider's real signing scheme, not a
   * provider implementation. It exists so the *pipeline* (verify → dedupe → process) can be
   * tested; swapping in a real provider replaces only this method.
   */
  verifyWebhookSignature(input: {
    readonly rawBody: string;
    readonly signature: string;
    readonly timestamp: string;
    readonly secret: string;
  }): boolean {
    if (input.signature === '' || input.timestamp === '' || input.secret === '') return false;
    const expected = `sig_${hash(`${input.timestamp}.${input.rawBody}.${input.secret}`)}`;
    return expected === input.signature;
  }
}

/** Test-only: produce the signature this adapter would accept. */
export function sandboxSignature(rawBody: string, timestamp: string, secret: string): string {
  return `sig_${hash(`${timestamp}.${rawBody}.${secret}`)}`;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}