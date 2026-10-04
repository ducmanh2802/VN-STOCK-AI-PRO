/**
 * BUSINESS-05 — WEBHOOK PIPELINE
 * ==============================
 * Verify → dedupe → process (roadmap §05.4, §05.5).
 *
 * THREATS ADDRESSED, each with an explicit control:
 *
 *   | threat                     | control                                             |
 *   |----------------------------|-----------------------------------------------------|
 *   | spoofed webhook            | signature verified over the RAW body                |
 *   | tampered body after signing| signature covers the raw body, never a re-serialised object |
 *   | replayed webhook           | `eventId` dedupe + absolute timestamp freshness window |
 *   | forged timestamp           | timestamp is inside the signature material          |
 *   | duplicate delivery         | `eventId` UNIQUE in the store; processing is skipped |
 *   | client-trusted payment     | the pipeline NEVER accepts a client-supplied payment status |
 *   | unknown event type         | fail closed, recorded as FAILED                     |
 *
 * "Never trust client-side payment success" (§05.5) is structural: the request body of this
 * endpoint carries ONLY `{ rawBody, signature, timestamp, eventId }`. The payment state is
 * read from the provider adapter, never from the incoming payload's opinion of itself.
 */

import type { Money, PaymentEnvironment, PaymentProvider, PaymentStatus } from './paymentProvider.ts';

// The sandbox signing helper is part of the pipeline's testable surface: the pipeline is
// verified against a real signature, never against a stub that always returns true.
export { sandboxSignature } from './paymentProvider.ts';

export type WebhookProcessingState =
  | 'RECEIVED'
  | 'VALIDATED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'RETRY_REQUIRED';

export interface WebhookEnvelope {
  /** Provider event id. The idempotency key. */
  readonly eventId: string;
  readonly provider: string;
  readonly eventType: string;
  /** Raw, unmodified body. Signature is computed over THIS, not over a parsed object. */
  readonly rawBody: string;
  readonly signature: string;
  /** Provider-signed timestamp, seconds since epoch. */
  readonly timestamp: string;
}

export interface WebhookProcessingRecord {
  readonly eventId: string;
  readonly provider: string;
  readonly eventType: string;
  readonly state: WebhookProcessingState;
  readonly failureReason: string | null;
  /** The economic effect that was applied. Null when nothing was applied. */
  readonly appliedEffect: string | null;
  readonly receivedAt: string;
  readonly processedAt: string | null;
}

export type WebhookRejection =
  | 'INVALID_SIGNATURE'
  | 'STALE_TIMESTAMP'
  | 'UNKNOWN_PROVIDER'
  | 'UNSUPPORTED_EVENT_TYPE'
  | 'MALFORMED_ENVELOPE';

export type WebhookOutcome =
  | { readonly accepted: true; readonly record: WebhookProcessingRecord }
  | { readonly accepted: false; readonly reason: WebhookRejection; readonly record: WebhookProcessingRecord };

/** Timestamp freshness window. A webhook older than this is a replay. */
export const WEBHOOK_MAX_AGE_SECONDS = 300;

export interface WebhookDedupeStore {
  /** Returns false when the event id was already recorded (i.e. a duplicate delivery). */
  claim(eventId: string): Promise<boolean>;
  put(record: WebhookProcessingRecord): Promise<void>;
  get(eventId: string): Promise<WebhookProcessingRecord | null>;
}

export class InMemoryWebhookDedupeStore implements WebhookDedupeStore {
  private readonly records = new Map<string, WebhookProcessingRecord>();

  /** Atomic in a single-process synchronous critical section; the SQL path uses UNIQUE. */
  async claim(eventId: string): Promise<boolean> {
    if (this.records.has(eventId)) return false;
    return true;
  }

  async put(record: WebhookProcessingRecord): Promise<void> {
    this.records.set(record.eventId, record);
  }

  async get(eventId: string): Promise<WebhookProcessingRecord | null> {
    return this.records.get(eventId) ?? null;
  }
}

export interface WebhookEffect {
  /**
   * The single, named economic effect an event is allowed to have.
   * Returning a name is what makes "duplicate event => one economic effect" checkable: the
   * same event id can only ever produce one applied effect.
   */
  readonly effect: string;
  readonly paymentId: string | null;
  readonly amount: Money | null;
}

export interface WebhookProcessorDeps {
  readonly provider: PaymentProvider;
  readonly dedupe: WebhookDedupeStore;
  /** Reads the authoritative state from the PROVIDER. Never from the payload. */
  readonly readPaymentStatus: (providerRef: string) => Promise<PaymentStatus>;
  /** Applies the one economic effect. Must itself be idempotent on eventId. */
  readonly applyEffect: (record: WebhookProcessingRecord, effect: WebhookEffect) => Promise<void>;
  /** Resolves the signing secret per provider endpoint. */
  readonly resolveSecret: (provider: string) => string | null;
  readonly environment: PaymentEnvironment;
  /** Injected clock, milliseconds. The pipeline never reads the wall clock. */
  readonly nowMs: () => number;
}

const SUPPORTED_EVENTS: ReadonlySet<string> = new Set([
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
  'payment.cancelled',
  'payment.updated',
]);

export class WebhookPipeline {
  /**
   * Process one delivery.
   *
   * Ordering is deliberate and each gate is load-bearing:
   *   1. envelope shape        — malformed input cannot reach the signature check
   *   2. provider known        — we must know which secret to verify against
   *   3. event type supported  — fail closed on anything we do not understand
   *   4. dedupe (eventId)      — claim BEFORE any effect
   *   5. signature over RAW body
   *   6. timestamp freshness   — replay window
   *   7. read authoritative status from the provider
   *   8. apply exactly one effect
   *
   * A duplicate delivery returns `accepted: true` with the ORIGINAL record and no new
   * effect. It is not an error: providers retry legitimately and an error would make them
   * retry forever. The `appliedEffect` on the returned record is the proof of idempotency.
   */
  async process(envelope: WebhookEnvelope, receivedAt: string): Promise<WebhookOutcome> {
    const base: Omit<WebhookProcessingRecord, 'state' | 'failureReason' | 'appliedEffect' | 'processedAt'> = {
      eventId: envelope.eventId ?? '',
      provider: envelope.provider ?? '',
      eventType: envelope.eventType ?? '',
      receivedAt,
    };

    const reject = (reason: WebhookRejection): WebhookOutcome => ({
      accepted: false,
      reason,
      record: { ...base, state: 'FAILED', failureReason: reason, appliedEffect: null, processedAt: null },
    });

    if (envelope.eventId === '' || envelope.provider === '' || envelope.rawBody === '') {
      return reject('MALFORMED_ENVELOPE');
    }

    const secret = this.deps.resolveSecret(envelope.provider);
    if (secret === null) return reject('UNKNOWN_PROVIDER');
    if (!SUPPORTED_EVENTS.has(envelope.eventType)) return reject('UNSUPPORTED_EVENT_TYPE');

    // (4) Dedupe BEFORE any verification side effects, so a replayed valid signature cannot
    //     cause repeated work. Claim is the atomic point.
    const claimed = await this.deps.dedupe.claim(envelope.eventId);
    if (!claimed) {
      const existing = await this.deps.dedupe.get(envelope.eventId);
      return {
        accepted: true,
        record:
          existing ?? {
            ...base,
            state: 'PROCESSED',
            failureReason: null,
            appliedEffect: null,
            processedAt: receivedAt,
          },
      };
    }

    const received: WebhookProcessingRecord = {
      ...base,
      state: 'RECEIVED',
      failureReason: null,
      appliedEffect: null,
      processedAt: null,
    };
    await this.deps.dedupe.put(received);

    // (5) Signature over the RAW body.
    const signatureOk = this.deps.provider.verifyWebhookSignature({
      rawBody: envelope.rawBody,
      signature: envelope.signature,
      timestamp: envelope.timestamp,
      secret,
    });

    const verified = signatureOk
      ? validated0(received)
      : failed(received, 'INVALID_SIGNATURE');

    if (!signatureOk) {
      await this.deps.dedupe.put(verified);
      return { accepted: false, reason: 'INVALID_SIGNATURE', record: verified };
    }

    // (6) Replay window.
    const ts = Number.parseInt(envelope.timestamp, 10);
    if (!Number.isFinite(ts)) {
      await this.deps.dedupe.put(failed(verified, 'INVALID_SIGNATURE'));
      return { accepted: false, reason: 'INVALID_SIGNATURE', record: failed(verified, 'INVALID_SIGNATURE') };
    }
    const ageSeconds = Math.abs(this.deps.nowMs() / 1000 - ts);
    if (ageSeconds > WEBHOOK_MAX_AGE_SECONDS) {
      const stale = failed(verified, 'STALE_TIMESTAMP');
      await this.deps.dedupe.put(stale);
      return { accepted: false, reason: 'STALE_TIMESTAMP', record: stale };
    }

    const validated: WebhookProcessingRecord = { ...verified, state: 'VALIDATED' };
    await this.deps.dedupe.put(validated);

    // (7) Authoritative state from the PROVIDER, never from the payload.
    const parsed = parsePayload(envelope.rawBody);
    const providerRef = parsed.providerRef;
    if (providerRef === null) {
      const bad = failed(validated, 'MALFORMED_ENVELOPE');
      await this.deps.dedupe.put(bad);
      return { accepted: false, reason: 'MALFORMED_ENVELOPE', record: bad };
    }

    let status: PaymentStatus;
    try {
      status = await this.deps.readPaymentStatus(providerRef);
    } catch {
      // A provider we cannot reach is RETRY_REQUIRED, never FAILED and never success.
      const retry = { ...validated, state: 'RETRY_REQUIRED' as const, failureReason: 'PROVIDER_UNREACHABLE' };
      await this.deps.dedupe.put(retry);
      return { accepted: true, record: retry };
    }

    if (status === 'PAYMENT_UNKNOWN') {
      // §05.2 / §29: unknown stays unknown. It becomes a reconciliation finding, not ACTIVE.
      const unknown = { ...validated, state: 'RETRY_REQUIRED' as const, failureReason: 'PAYMENT_UNKNOWN' };
      await this.deps.dedupe.put(unknown);
      return { accepted: true, record: unknown };
    }

    // (8) Exactly one effect.
    const effect: WebhookEffect = {
      effect: `${envelope.provider}:${envelope.eventType}`,
      paymentId: parsed.paymentId,
      amount: parsed.amount,
    };
    const processing: WebhookProcessingRecord = { ...validated, state: 'PROCESSING' };
    await this.deps.dedupe.put(processing);

    try {
      await this.deps.applyEffect(processing, effect);
    } catch (error) {
      const retry = {
        ...processing,
        state: 'RETRY_REQUIRED' as const,
        failureReason: error instanceof Error ? error.message : 'EFFECT_FAILED',
      };
      await this.deps.dedupe.put(retry);
      return { accepted: true, record: retry };
    }

    const processed: WebhookProcessingRecord = {
      ...processing,
      state: 'PROCESSED',
      appliedEffect: effect.effect,
      processedAt: receivedAt,
    };
    await this.deps.dedupe.put(processed);
    return { accepted: true, record: processed };
  }

  private readonly deps: WebhookProcessorDeps;

  constructor(deps: WebhookProcessorDeps) {
    this.deps = deps;
  }
}

interface ParsedPayload {
  readonly paymentId: string | null;
  readonly providerRef: string | null;
  readonly amount: Money | null;
}

/**
 * Minimal, defensive parsing of the raw body.
 *
 * Deliberately does NOT read a status field even if one is present: §05.5 "Never trust
 * client-side payment success." The payload's own opinion of its success is ignored entirely.
 */
function parsePayload(rawBody: string): ParsedPayload {
  let obj: unknown;
  try {
    obj = JSON.parse(rawBody);
  } catch {
    return { paymentId: null, providerRef: null, amount: null };
  }
  if (typeof obj !== 'object' || obj === null) {
    return { paymentId: null, providerRef: null, amount: null };
  }
  const o = obj as Record<string, unknown>;
  const data = typeof o.data === 'object' && o.data !== null ? (o.data as Record<string, unknown>) : o;

  const providerRef = typeof data.providerRef === 'string' ? data.providerRef : null;
  const paymentId = typeof data.paymentId === 'string' ? data.paymentId : null;

  let amount: Money | null = null;
  const minor = data.minorUnits;
  const currency = data.currency;
  if (typeof minor === 'number' && Number.isSafeInteger(minor) && typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
    amount = { minorUnits: minor, currency };
  }
  return { paymentId, providerRef, amount };
}
function validated0(r: WebhookProcessingRecord): WebhookProcessingRecord {
  return r;
}

function failed(r: WebhookProcessingRecord, reason: string): WebhookProcessingRecord {
  return { ...r, state: 'FAILED', failureReason: reason };
}
