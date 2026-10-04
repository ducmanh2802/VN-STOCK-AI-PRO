/**
 * BUSINESS-01 — COMMERCIAL REPOSITORIES
 * =====================================
 * Append-only / on-conflict-do-nothing persistence for the commercial layer.
 * Conventions follow src/lib/db/research/ResearchRepository.ts.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import {
  businessAuditEvents,
  businessSubscriptions,
  businessUsageEvents,
  type BusinessSubscriptionRow,
} from '../../../db/business/schema.ts';
import type { CommercialAuditEvent } from '../../business/auditLog.ts';
import { redact } from '../../business/auditLog.ts';
import { planFingerprint } from '../../business/plans.ts';
import type { Subscription } from '../../business/types.ts';

// -----------------------------------------------------------------------------
// subscriptions
// -----------------------------------------------------------------------------

export class BusinessSubscriptionRepository {
  /**
   * Insert-or-replace by subject. `subject_id` is UNIQUE, so there is never more than one
   * subscription per subject (roadmap §05.4: no duplicate subscription).
   *
   * This is the ONE mutable write in the commercial lane; every change is additionally
   * appended to business_audit_events, so the full history remains reconstructable.
   */
  static async upsert(sub: Subscription, subjectKind: 'USER' | 'ORGANIZATION', organizationId: string | null, correlationId: string | null): Promise<void> {
    if (!db) return;
    const fingerprint = planFingerprint(sub.planId);
    await db
      .insert(businessSubscriptions)
      .values({
        subscriptionId: sub.subscriptionId,
        subjectId: sub.subjectId,
        subjectKind,
        organizationId,
        planId: sub.planId,
        planFingerprint: fingerprint,
        status: sub.status,
        currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : null,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        cancelledAt: sub.cancelledAt ? new Date(sub.cancelledAt) : null,
        gracePeriodEnd: sub.gracePeriodEnd ? new Date(sub.gracePeriodEnd) : null,
        trialEndsAt: sub.trialEndsAt ? new Date(sub.trialEndsAt) : null,
        providerRef: sub.providerRef,
        correlationId,
      })
      .onConflictDoUpdate({
        target: businessSubscriptions.subjectId,
        set: {
          planId: sub.planId,
          planFingerprint: fingerprint,
          status: sub.status,
          currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : null,
          currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          cancelledAt: sub.cancelledAt ? new Date(sub.cancelledAt) : null,
          gracePeriodEnd: sub.gracePeriodEnd ? new Date(sub.gracePeriodEnd) : null,
          trialEndsAt: sub.trialEndsAt ? new Date(sub.trialEndsAt) : null,
          updatedAt: new Date(sub.updatedAt),
        },
      });
  }

  static async findBySubject(subjectId: string): Promise<Subscription | null> {
    if (!db) return null;
    const rows = await db
      .select()
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.subjectId, subjectId))
      .limit(1);
    const row = rows[0];
    return row ? BusinessSubscriptionRepository.toSubscription(row) : null;
  }

  /** Bounded page. Never an unbounded scan (roadmap §27). */
  static async list(limit: number, offset: number): Promise<readonly Subscription[]> {
    if (!db) return [];
    const rows = await db
      .select()
      .from(businessSubscriptions)
      .limit(limit)
      .offset(offset);
    return rows.map((r) => BusinessSubscriptionRepository.toSubscription(r));
  }

  static async countByStatus(status: string): Promise<number> {
    if (!db) return 0;
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.status, status));
    return rows[0]?.n ?? 0;
  }

  static toSubscription(row: BusinessSubscriptionRow): Subscription {
    return {
      subscriptionId: row.subscriptionId,
      subjectId: row.subjectId,
      planId: row.planId as Subscription['planId'],
      status: row.status as Subscription['status'],
      currentPeriodStart: row.currentPeriodStart ? row.currentPeriodStart.toISOString() : null,
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      gracePeriodEnd: row.gracePeriodEnd ? row.gracePeriodEnd.toISOString() : null,
      trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      providerRef: row.providerRef,
    };
  }
}

// -----------------------------------------------------------------------------
// usage events
// -----------------------------------------------------------------------------

export class BusinessUsageRepository {
  /**
   * Idempotent insert. Returns true when the row was newly inserted, false when
   * `event_id` already existed (a replay).
   *
   * `onConflictDoNothing` on the UNIQUE event_id is the mechanism that guarantees
   * "duplicate usage event => one usage effect" across processes.
   */
  static async insertOnce(input: {
    readonly eventId: string;
    readonly subjectId: string;
    readonly resource: string;
    readonly quantity: number;
    readonly periodKey: string;
    readonly feature: string | null;
    readonly occurredAt: string;
    readonly metadata: Readonly<Record<string, string>>;
    readonly correlationId: string | null;
  }): Promise<boolean> {
    if (!db) return false;
    const inserted = await db
      .insert(businessUsageEvents)
      .values({
        eventId: input.eventId,
        subjectId: input.subjectId,
        resource: input.resource,
        quantity: input.quantity,
        periodKey: input.periodKey,
        feature: input.feature,
        occurredAt: new Date(input.occurredAt),
        metadata: JSON.stringify(redact(input.metadata)),
        correlationId: input.correlationId,
      })
      .onConflictDoNothing({ target: businessUsageEvents.eventId })
      .returning({ id: businessUsageEvents.id });
    return inserted.length > 0;
  }

  /** Consumption for one billing window. Bounded by the (subject, resource, period) index. */
  static async consumed(subjectId: string, resource: string, periodKey: string): Promise<number> {
    if (!db) return 0;
    const rows = await db
      .select({ total: sql<number>`coalesce(sum(${businessUsageEvents.quantity}), 0)::int` })
      .from(businessUsageEvents)
      .where(
        and(
          eq(businessUsageEvents.subjectId, subjectId),
          eq(businessUsageEvents.resource, resource),
          eq(businessUsageEvents.periodKey, periodKey),
        ),
      );
    return rows[0]?.total ?? 0;
  }
}

// -----------------------------------------------------------------------------
// audit events
// -----------------------------------------------------------------------------

export class BusinessAuditRepository {
  /** Append-only. Never updated, never deleted. */
  static async append(event: CommercialAuditEvent): Promise<void> {
    if (!db) return;
    await db.insert(businessAuditEvents).values({
      sequence: event.sequence,
      action: event.action,
      outcome: event.outcome,
      subjectId: event.subjectId,
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      actorSessionId: event.actorSessionId,
      correlationId: event.correlationId,
      occurredAt: new Date(event.occurredAt),
      reason: event.reason,
      metadata: JSON.stringify(event.metadata),
    });
  }

  /** Bounded, indexed audit query for a subject. */
  static async forSubject(subjectId: string, limit: number): Promise<readonly { action: string; outcome: string; occurredAt: string; reason: string }[]> {
    if (!db) return [];
    const rows = await db
      .select({
        action: businessAuditEvents.action,
        outcome: businessAuditEvents.outcome,
        occurredAt: businessAuditEvents.occurredAt,
        reason: businessAuditEvents.reason,
      })
      .from(businessAuditEvents)
      .where(eq(businessAuditEvents.subjectId, subjectId))
      .limit(limit);
    return rows.map((r) => ({
      action: r.action,
      outcome: r.outcome,
      occurredAt: r.occurredAt.toISOString(),
      reason: r.reason,
    }));
  }

  static async nextSequence(): Promise<number> {
    if (!db) return 1;
    const rows = await db.select({ n: sql<number>`coalesce(max(${businessAuditEvents.sequence}), 0)::int` }).from(businessAuditEvents);
    return (rows[0]?.n ?? 0) + 1;
  }
}