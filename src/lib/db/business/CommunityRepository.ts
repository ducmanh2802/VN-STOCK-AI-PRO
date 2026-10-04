/**
 * BUSINESS-02 — COMMUNITY REPOSITORIES
 * =====================================
 * Append-only persistence for community artifacts, moderation records and reputation events.
 *
 * Privacy note: `visibility` is stored, but every read path is followed by a server-side
 * `canView` check in src/lib/business/community/visibility.ts. SQL filtering here is a
 * bounded-query optimisation, never the authorization decision. A bug in a WHERE clause can
 * therefore return *fewer* rows than the viewer may see, never *more*.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/index.ts';
import {
  communityComments,
  communityModerationRecords,
  communityPostVersions,
  communityPosts,
  communityReputationEvents,
  communityReports,
  type CommunityCommentRow,
  type CommunityPostRow,
} from '../../../db/business/schema.ts';
import type { CommunityComment, CommunityPost, ModerationRecord, ReputationEvent } from '../../business/community/index.ts';

export class CommunityRepository {
  // ---------------------------------------------------------------- posts

  static async insertPost(post: CommunityPost): Promise<void> {
    if (!db) return;
    await db.insert(communityPosts).values({
      postId: post.postId,
      authorUserId: post.author.userId,
      authorOrganizationId: post.author.organizationId,
      title: post.title,
      body: post.body,
      labels: JSON.stringify(post.labels),
      visibility: post.visibility,
      workspaceId: post.workspaceId,
      organizationId: post.organizationId,
      moderation: post.moderation,
      provenance: JSON.stringify(post.provenance),
      version: post.version,
      createdAt: new Date(post.createdAt),
      updatedAt: new Date(post.updatedAt),
    });
  }

  /** Version bump. Guarded by `version` so a concurrent edit cannot silently overwrite. */
  static async updatePost(post: CommunityPost, expectedVersion: number): Promise<boolean> {
    if (!db) return false;
    const rows = await db
      .update(communityPosts)
      .set({
        title: post.title,
        body: post.body,
        labels: JSON.stringify(post.labels),
        provenance: JSON.stringify(post.provenance),
        visibility: post.visibility,
        moderation: post.moderation,
        version: post.version,
        updatedAt: new Date(post.updatedAt),
      })
      .where(and(eq(communityPosts.postId, post.postId), eq(communityPosts.version, expectedVersion)))
      .returning({ id: communityPosts.id });
    return rows.length > 0;
  }

  static async findPost(postId: string): Promise<CommunityPost | null> {
    if (!db) return null;
    const rows = await db.select().from(communityPosts).where(eq(communityPosts.postId, postId)).limit(1);
    return rows[0] ? toPost(rows[0]) : null;
  }

  /**
   * Bounded, indexed feed page. `limit` is clamped here, not trusted from the caller.
   * The caller must still re-check visibility per row.
   */
  static async feed(input: {
    readonly visibility: string;
    readonly moderation: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<readonly CommunityPost[]> {
    if (!db) return [];
    const limit = Math.min(Math.max(input.limit, 1), 50);
    const offset = Math.max(input.offset, 0);
    const rows = await db
      .select()
      .from(communityPosts)
      .where(and(eq(communityPosts.visibility, input.visibility), eq(communityPosts.moderation, input.moderation)))
      .orderBy(desc(communityPosts.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(toPost);
  }

  // ---------------------------------------------------------------- versions

  /** Append-only: the exact text that carried a claim is retained forever. */
  static async appendVersion(input: {
    readonly postId: string;
    readonly version: number;
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
    readonly provenance: readonly unknown[];
    readonly editedByUserId: string;
  }): Promise<void> {
    if (!db) return;
    await db
      .insert(communityPostVersions)
      .values({
        postId: input.postId,
        version: input.version,
        title: input.title,
        body: input.body,
        labels: JSON.stringify(input.labels),
        provenance: JSON.stringify(input.provenance),
        editedByUserId: input.editedByUserId,
      })
      .onConflictDoNothing({ target: [communityPostVersions.postId, communityPostVersions.version] });
  }

  // ---------------------------------------------------------------- comments

  static async insertComment(c: CommunityComment): Promise<void> {
    if (!db) return;
    await db.insert(communityComments).values({
      commentId: c.commentId,
      postId: c.postId,
      authorUserId: c.author.userId,
      authorOrganizationId: c.author.organizationId,
      body: c.body,
      visibility: c.visibility,
      workspaceId: c.workspaceId,
      organizationId: c.organizationId,
      moderation: c.moderation,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    });
  }

  static async commentsForPost(postId: string, limit: number): Promise<readonly CommunityComment[]> {
    if (!db) return [];
    const rows = await db
      .select()
      .from(communityComments)
      .where(eq(communityComments.postId, postId))
      .orderBy(communityComments.createdAt)
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(toComment);
  }

  // ---------------------------------------------------------------- moderation

  /** Append-only, idempotent on moderationId. Never updated, never deleted. */
  static async appendModeration(record: ModerationRecord): Promise<void> {
    if (!db) return;
    await db
      .insert(communityModerationRecords)
      .values({
        moderationId: record.moderationId,
        targetType: record.targetType,
        targetId: record.targetId,
        action: record.action,
        fromState: record.from,
        toState: record.to,
        moderatorUserId: record.moderatorUserId,
        reason: record.reason,
        correlationId: record.correlationId,
        occurredAt: new Date(record.occurredAt),
      })
      .onConflictDoNothing({ target: communityModerationRecords.moderationId });
  }

  /** Bounded, indexed moderation history for one artifact. */
  static async moderationHistory(targetType: 'POST' | 'COMMENT', targetId: string, limit: number): Promise<readonly ModerationRecord[]> {
    if (!db) return [];
    const rows = await db
      .select()
      .from(communityModerationRecords)
      .where(and(eq(communityModerationRecords.targetType, targetType), eq(communityModerationRecords.targetId, targetId)))
      .orderBy(desc(communityModerationRecords.occurredAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map((r) => ({
      moderationId: r.moderationId,
      targetType: r.targetType as 'POST' | 'COMMENT',
      targetId: r.targetId,
      action: r.action as ModerationRecord['action'],
      from: r.fromState as ModerationRecord['from'],
      to: r.toState as ModerationRecord['to'],
      moderatorUserId: r.moderatorUserId,
      reason: r.reason,
      correlationId: r.correlationId,
      occurredAt: r.occurredAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------- reports

  /** One report per (reporter, target). A duplicate report is a no-op, not an error. */
  static async insertReport(input: {
    readonly reportId: string;
    readonly targetType: 'POST' | 'COMMENT';
    readonly targetId: string;
    readonly reporterUserId: string;
    readonly reason: string;
    readonly detail: string;
    readonly createdAt: string;
  }): Promise<boolean> {
    if (!db) return false;
    const rows = await db
      .insert(communityReports)
      .values({
        reportId: input.reportId,
        targetType: input.targetType,
        targetId: input.targetId,
        reporterUserId: input.reporterUserId,
        reason: input.reason,
        detail: input.detail,
        createdAt: new Date(input.createdAt),
      })
      .onConflictDoNothing()
      .returning({ id: communityReports.id });
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- reputation

  static async appendReputationEvent(e: ReputationEvent): Promise<void> {
    if (!db) return;
    await db
      .insert(communityReputationEvents)
      .values({
        eventId: e.eventId,
        userId: e.userId,
        kind: e.kind,
        delta: e.delta,
        subjectRef: e.subjectRef,
        occurredAt: new Date(e.occurredAt),
      })
      .onConflictDoNothing({ target: communityReputationEvents.eventId });
  }

  /** Bounded fold. Never materialised as an unbounded list. */
  static async reputationScore(userId: string): Promise<number> {
    if (!db) return 0;
    const rows = await db
      .select({ total: sql<number>`coalesce(sum(${communityReputationEvents.delta}), 0)::int` })
      .from(communityReputationEvents)
      .where(eq(communityReputationEvents.userId, userId));
    return rows[0]?.total ?? 0;
  }
}

// -----------------------------------------------------------------------------

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toPost(r: CommunityPostRow): CommunityPost {
  return {
    postId: r.postId,
    author: {
      userId: r.authorUserId,
      organizationId: r.authorOrganizationId,
      displayName: '',
    },
    title: r.title,
    body: r.body,
    labels: parseJson(r.labels, [] as unknown as CommunityPost['labels']),
    visibility: r.visibility as CommunityPost['visibility'],
    workspaceId: r.workspaceId,
    organizationId: r.organizationId,
    moderation: r.moderation as CommunityPost['moderation'],
    provenance: parseJson(r.provenance, [] as unknown as CommunityPost['provenance']),
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toComment(r: CommunityCommentRow): CommunityComment {
  return {
    commentId: r.commentId,
    postId: r.postId,
    author: { userId: r.authorUserId, organizationId: r.authorOrganizationId, displayName: '' },
    body: r.body,
    visibility: r.visibility as CommunityComment['visibility'],
    workspaceId: r.workspaceId,
    organizationId: r.organizationId,
    moderation: r.moderation as CommunityComment['moderation'],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type { CommunityPostRow, CommunityCommentRow };