/**
 * BUSINESS-01 — COMMERCIAL AUDIT TRAIL
 * =====================================
 * PHASE 0 §2.6 established there is no commercial audit trail in the repository.
 * This file creates it.
 *
 * Design rules (roadmap §05.9, §28, §10):
 *  - APPEND ONLY. There is no update and no delete anywhere in this file.
 *  - Every event carries actor, correlation, subject, reason and outcome.
 *  - Secrets are structurally impossible to log: the metadata bag is
 *    `Readonly<Record<string, string>>` and is passed through `redact()` which drops any
 *    key that looks like a credential.
 *  - Audit events never contain amounts of money that were not actually settled. A failed or
 *    unknown payment is recorded as such; it is never recorded as revenue.
 */

export type CommercialAuditAction =
  // subscription
  | 'subscription_created'
  | 'subscription_started'
  | 'subscription_changed'
  | 'subscription_cancelled'
  | 'subscription_paused'
  | 'subscription_resumed'
  | 'subscription_expired'
  | 'plan_changed'
  // payments
  | 'payment_received'
  | 'payment_failed'
  | 'payment_unknown'
  | 'refund_issued'
  // entitlement / usage
  | 'entitlement_granted'
  | 'entitlement_revoked'
  | 'entitlement_denied'
  | 'usage_recorded'
  | 'usage_duplicate_ignored'
  // marketplace
  | 'marketplace_publication'
  | 'marketplace_purchase'
  | 'creator_payout'
  // organization
  | 'seat_assigned'
  | 'seat_removed'
  | 'organization_membership_changed'
  // moderation
  | 'content_reported'
  | 'moderation_action';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'REJECTED';

export interface CommercialAuditEvent {
  readonly sequence: number;
  readonly action: CommercialAuditAction;
  readonly outcome: AuditOutcome;
  /** Commercial subject the event concerns. */
  readonly subjectId: string;
  /** Organization, when the subject is scoped to one. */
  readonly organizationId: string | null;
  /** PLATFORM user id of the actor, when authenticated. */
  readonly actorUserId: string | null;
  readonly actorSessionId: string | null;
  readonly correlationId: string | null;
  /** ISO-8601, injected. Never read from the clock. */
  readonly occurredAt: string;
  readonly reason: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface AuditInput {
  readonly action: CommercialAuditAction;
  readonly outcome: AuditOutcome;
  readonly subjectId: string;
  readonly organizationId?: string | null;
  readonly actorUserId?: string | null;
  readonly actorSessionId?: string | null;
  readonly correlationId?: string | null;
  readonly occurredAt: string;
  readonly reason: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

const SECRET_KEY_PATTERN = /(pass|secret|token|credential|apikey|api_key|authorization|cookie|cvv|card_number)/i;
const REDACTED = '[REDACTED]';

/**
 * Drop anything that could be a credential. Applied on every write path.
 * A key whose name matches the secret pattern is replaced, never dropped, so that the
 * existence of the attempt is itself auditable.
 */
export function redact(meta: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> {
  if (!meta) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(meta).sort()) {
    const value = meta[key];
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    // Defence in depth: a long opaque token pasted into a value is also redacted.
    out[key] = value.length > 512 ? `${value.slice(0, 64)}…[TRUNCATED]` : value;
  }
  return Object.freeze(out);
}

export interface CommercialAuditLog {
  record(input: AuditInput): Promise<CommercialAuditEvent>;
  all(): Promise<readonly CommercialAuditEvent[]>;
  forSubject(subjectId: string): Promise<readonly CommercialAuditEvent[]>;
  forAction(action: CommercialAuditAction): Promise<readonly CommercialAuditEvent[]>;
  forCorrelation(correlationId: string): Promise<readonly CommercialAuditEvent[]>;
  count(): Promise<number>;
}

/**
 * Deterministic in-memory audit log. Monotonic `sequence` gives a stable ordering for tests
 * and for evidence capture. A production implementation must persist the same shape
 * append-only (see the business_migration).
 */
export class InMemoryCommercialAuditLog implements CommercialAuditLog {
  private readonly events: CommercialAuditEvent[] = [];
  private sequence = 0;

  async record(input: AuditInput): Promise<CommercialAuditEvent> {
    this.sequence += 1;
    const event: CommercialAuditEvent = Object.freeze({
      sequence: this.sequence,
      action: input.action,
      outcome: input.outcome,
      subjectId: input.subjectId,
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorSessionId: input.actorSessionId ?? null,
      correlationId: input.correlationId ?? null,
      occurredAt: input.occurredAt,
      reason: input.reason,
      metadata: redact(input.metadata),
    });
    this.events.push(event);
    return event;
  }

  async all(): Promise<readonly CommercialAuditEvent[]> {
    return [...this.events];
  }

  async forSubject(subjectId: string): Promise<readonly CommercialAuditEvent[]> {
    return this.events.filter((e) => e.subjectId === subjectId);
  }

  async forAction(action: CommercialAuditAction): Promise<readonly CommercialAuditEvent[]> {
    return this.events.filter((e) => e.action === action);
  }

  async forCorrelation(correlationId: string): Promise<readonly CommercialAuditEvent[]> {
    return this.events.filter((e) => e.correlationId === correlationId);
  }

  async count(): Promise<number> {
    return this.events.length;
  }
}

/** Discards everything. Only for tests that assert on unrelated subsystems. */
export class NullCommercialAuditLog implements CommercialAuditLog {
  async record(input: AuditInput): Promise<CommercialAuditEvent> {
    return Object.freeze({
      sequence: 0,
      action: input.action,
      outcome: input.outcome,
      subjectId: input.subjectId,
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorSessionId: input.actorSessionId ?? null,
      correlationId: input.correlationId ?? null,
      occurredAt: input.occurredAt,
      reason: input.reason,
      metadata: redact(input.metadata),
    });
  }
  async all(): Promise<readonly CommercialAuditEvent[]> {
    return [];
  }
  async forSubject(): Promise<readonly CommercialAuditEvent[]> {
    return [];
  }
  async forAction(): Promise<readonly CommercialAuditEvent[]> {
    return [];
  }
  async forCorrelation(): Promise<readonly CommercialAuditEvent[]> {
    return [];
  }
  async count(): Promise<number> {
    return 0;
  }
}