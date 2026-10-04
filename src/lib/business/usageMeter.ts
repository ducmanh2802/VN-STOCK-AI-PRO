/**
 * BUSINESS-01 — USAGE METERING
 * =============================
 * Usage must be observable, auditable, idempotent and time-bounded (roadmap §01.5).
 *
 * Idempotency model
 * -----------------
 * A usage event carries a caller-supplied `eventId` (the idempotency key). The meter keeps
 * the set of accepted event ids per (subject, resource, period) bucket. Replaying the same
 * eventId is a NO-OP that returns `duplicate: true` — it never increments a counter.
 *
 * This is the invariant BUSINESS-05 also relies on for webhook replay:
 *     duplicate usage event => exactly one usage effect.
 *
 * The in-memory implementation below is deterministic and is what the test-suite exercises.
 * `UsageMeter` is an interface so the same contract can be backed by a transactional store
 * later without changing any caller. The SQL-backed implementation must additionally rely on
 * a UNIQUE(event_id) constraint — that is documented on the migration.
 *
 * No clock is read: `occurredAt` and `periodKey` are always supplied by the caller.
 */

import type { UsageBucket, UsageEvent, UsageResource } from './types.ts';

export interface RecordResult {
  readonly eventId: string;
  readonly subjectId: string;
  readonly resource: UsageResource;
  readonly periodKey: string;
  readonly quantity: number;
  readonly bucketConsumed: number;
  /** True when the event id had already been accepted; nothing was added. */
  readonly duplicate: boolean;
  readonly recordedAt: string;
}

export interface UsageReader {
  consumed(subjectId: string, resource: UsageResource, periodKey: string): Promise<number>;
  bucket(subjectId: string, resource: UsageResource, periodKey: string): Promise<UsageBucket>;
}

export interface UsageMeter extends UsageReader {
  record(event: UsageEvent, at: string): Promise<RecordResult>;
}

/** Validate a usage event. Fail closed with a SCREAMING_SNAKE code. */
export function validateUsageEvent(e: UsageEvent): void {
  if (typeof e.eventId !== 'string' || e.eventId.trim() === '') {
    throw new Error('INVALID_USAGE_EVENT_ID');
  }
  if (typeof e.subjectId !== 'string' || e.subjectId.trim() === '') {
    throw new Error('INVALID_USAGE_SUBJECT_ID');
  }
  if (!Number.isInteger(e.quantity) || e.quantity <= 0) {
    throw new Error('INVALID_USAGE_QUANTITY');
  }
  if (typeof e.periodKey !== 'string' || !/^[0-9]{4}-[0-9]{2}$/.test(e.periodKey)) {
    throw new Error('INVALID_USAGE_PERIOD_KEY');
  }
  if (typeof e.occurredAt !== 'string' || Number.isNaN(Date.parse(e.occurredAt))) {
    throw new Error('INVALID_USAGE_OCCURRED_AT');
  }
}

/** Deterministic key for a bucket. Period-bounded by construction. */
export function bucketKey(subjectId: string, resource: UsageResource, periodKey: string): string {
  return `${subjectId}|${resource}|${periodKey}`;
}

type Bucket = { consumed: number; eventIds: Set<string> };

export class InMemoryUsageMeter implements UsageMeter {
  private readonly buckets = new Map<string, Bucket>();

  private bucketState(subjectId: string, resource: UsageResource, periodKey: string): Bucket {
    const key = bucketKey(subjectId, resource, periodKey);
    let b = this.buckets.get(key);
    if (!b) {
      b = { consumed: 0, eventIds: new Set<string>() };
      this.buckets.set(key, b);
    }
    return b;
  }

  /**
   * Records one consumption.
   *
   * Contract:
   *  - invalid event            -> throws
   *  - eventId already accepted -> no increment, duplicate: true
   *  - otherwise                -> increment by quantity, duplicate: false
   *
   * Read-then-write inside a synchronous critical section: the JS event loop cannot
   * interleave two `record` calls, so concurrent callers in one process cannot double count.
   * A multi-process deployment MUST back this with a UNIQUE(event_id) insert (see the
   * migration) so that the invariant holds across processes too.
   */
  async record(event: UsageEvent, at: string): Promise<RecordResult> {
    validateUsageEvent(event);
    const b = this.bucketState(event.subjectId, event.resource, event.periodKey);

    if (b.eventIds.has(event.eventId)) {
      return {
        eventId: event.eventId,
        subjectId: event.subjectId,
        resource: event.resource,
        periodKey: event.periodKey,
        quantity: event.quantity,
        bucketConsumed: b.consumed,
        duplicate: true,
        recordedAt: at,
      };
    }

    b.eventIds.add(event.eventId);
    b.consumed += event.quantity;

    return {
      eventId: event.eventId,
      subjectId: event.subjectId,
      resource: event.resource,
      periodKey: event.periodKey,
      quantity: event.quantity,
      bucketConsumed: b.consumed,
      duplicate: false,
      recordedAt: at,
    };
  }

  async consumed(subjectId: string, resource: UsageResource, periodKey: string): Promise<number> {
    return this.buckets.get(bucketKey(subjectId, resource, periodKey))?.consumed ?? 0;
  }

  async bucket(subjectId: string, resource: UsageResource, periodKey: string): Promise<UsageBucket> {
    const b = this.buckets.get(bucketKey(subjectId, resource, periodKey));
    return {
      subjectId,
      resource,
      periodKey,
      consumed: b?.consumed ?? 0,
      eventIds: b ? [...b.eventIds].sort() : [],
    };
  }

  /** Total events accepted for a bucket. Used by tests to assert the idempotency ledger. */
  eventCount(subjectId: string, resource: UsageResource, periodKey: string): number {
    return this.buckets.get(bucketKey(subjectId, resource, periodKey))?.eventIds.size ?? 0;
  }

  /** All period keys recorded for a subject/resource. Bounded by construction. */
  periods(subjectId: string, resource: UsageResource): readonly string[] {
    const out: string[] = [];
    const prefix = `${subjectId}|${resource}|`;
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
    return out.sort();
  }
}

/** A meter that records nothing. Used to keep metering opt-in and explicitly disabled. */
export class NullUsageMeter implements UsageMeter {
  async record(event: UsageEvent, at: string): Promise<RecordResult> {
    validateUsageEvent(event);
    return {
      eventId: event.eventId,
      subjectId: event.subjectId,
      resource: event.resource,
      periodKey: event.periodKey,
      quantity: event.quantity,
      bucketConsumed: 0,
      duplicate: false,
      recordedAt: at,
    };
  }
  async consumed(): Promise<number> {
    return 0;
  }
  async bucket(subjectId: string, resource: UsageResource, periodKey: string): Promise<UsageBucket> {
    return { subjectId, resource, periodKey, consumed: 0, eventIds: [] };
  }
}