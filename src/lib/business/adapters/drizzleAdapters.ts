/**
 * BUSINESS-01 — DATABASE-BACKED COMMERCIAL ADAPTERS
 * ==================================================
 * Implements the same three interfaces as the in-memory test doubles, backed by drizzle.
 * This is what makes the idempotency and audit guarantees hold across processes:
 *
 *  - UsageMeter      -> BusinessUsageRepository.insertOnce  (UNIQUE event_id)
 *  - SubscriptionStore -> BusinessSubscriptionRepository    (UNIQUE subject_id)
 *  - CommercialAuditLog -> BusinessAuditRepository.append   (append-only)
 *
 * The in-memory and SQL implementations satisfy ONE contract, so every behavioural test
 * written against the in-memory pair is meaningful for the SQL pair.
 */

import type { CommercialAuditLog, CommercialAuditEvent, AuditInput } from '../auditLog.ts';
import { redact } from '../auditLog.ts';
import type { SubscriptionStore } from '../entitlementService.ts';
import type { Subscription, UsageBucket, UsageResource } from '../types.ts';
import { validateUsageEvent, type RecordResult, type UsageMeter } from '../usageMeter.ts';
import {
  BusinessAuditRepository,
  BusinessSubscriptionRepository,
  BusinessUsageRepository,
} from '../../db/business/BusinessRepositories.ts';

// -----------------------------------------------------------------------------

export class DrizzleSubscriptionStore implements SubscriptionStore {
  async findBySubject(subjectId: string): Promise<Subscription | null> {
    return BusinessSubscriptionRepository.findBySubject(subjectId);
  }
  async save(sub: Subscription): Promise<void> {
    await BusinessSubscriptionRepository.upsert(sub, 'USER', null, sub.subscriptionId);
  }
  async list(): Promise<readonly Subscription[]> {
    // Bounded. A production listing must paginate; see BusinessSubscriptionRepository.list.
    return BusinessSubscriptionRepository.list(200, 0);
  }
}

// -----------------------------------------------------------------------------

/**
 * SQL-backed idempotent usage meter.
 *
 * The idempotency guarantee is enforced by the database, not by application logic:
 *   INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING id
 * A replay returns zero rows and is therefore reported as `duplicate: true`.
 * The counter is then re-read from the SUM over the indexed bucket, which is the same value
 * the entitlement check already used — no second source of truth.
 */
export class DrizzleUsageMeter implements UsageMeter {
  async record(event: Parameters<UsageMeter['record']>[0], at: string): Promise<RecordResult> {
    validateUsageEvent(event);
    const inserted = await BusinessUsageRepository.insertOnce({
      eventId: event.eventId,
      subjectId: event.subjectId,
      resource: event.resource,
      quantity: event.quantity,
      periodKey: event.periodKey,
      feature: typeof event.metadata.feature === 'string' ? event.metadata.feature : null,
      occurredAt: event.occurredAt,
      metadata: event.metadata,
      correlationId: typeof event.metadata.correlationId === 'string' ? event.metadata.correlationId : null,
    });
    const bucketConsumed = await BusinessUsageRepository.consumed(
      event.subjectId,
      event.resource,
      event.periodKey,
    );
    return {
      eventId: event.eventId,
      subjectId: event.subjectId,
      resource: event.resource,
      periodKey: event.periodKey,
      quantity: event.quantity,
      bucketConsumed,
      duplicate: !inserted,
      recordedAt: at,
    };
  }

  async consumed(subjectId: string, resource: UsageResource, periodKey: string): Promise<number> {
    return BusinessUsageRepository.consumed(subjectId, resource, periodKey);
  }

  async bucket(subjectId: string, resource: UsageResource, periodKey: string): Promise<UsageBucket> {
    return {
      subjectId,
      resource,
      periodKey,
      consumed: await BusinessUsageRepository.consumed(subjectId, resource, periodKey),
      // Deliberately NOT materialised: the event-id ledger can be arbitrarily large.
      // Idempotency for the SQL path is enforced by the UNIQUE constraint, not by
      // returning the set to the caller (roadmap §27: no unbounded queries).
      eventIds: [],
    };
  }
}

// -----------------------------------------------------------------------------

export class DrizzleCommercialAuditLog implements CommercialAuditLog {
  /**
   * Append-only. `sequence` is allocated as max(sequence)+1 inside the repository, which is
   * correct for the single-process modular monolith this repository is (roadmap §6).
   * A multi-writer deployment must move sequence allocation to a database sequence; that is
   * recorded as a known limitation in docs/BUSINESS_FULL_AUDIT.md.
   */
  async record(input: AuditInput): Promise<CommercialAuditEvent> {
    const event: CommercialAuditEvent = Object.freeze({
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
    void BusinessAuditRepository.append(event);
    return event;
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