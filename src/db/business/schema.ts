/**
 * BUSINESS-01 — COMMERCIAL PERSISTENCE SCHEMA
 * ===========================================
 * Drizzle table declarations for the commercial layer.
 *
 * WHY A SEPARATE FILE (docs/BUSINESS_READINESS_AUDIT.md §1.1)
 * `src/db/schema.ts` is currently being modified concurrently by the PLATFORM lane
 * (roadmap §25: "If a file is concurrently changing: STOP or isolate the work"). Writing
 * here isolates the Business lane completely. It has zero overlap with any other lane's
 * tables and can be merged into `schema.ts` later without conflict.
 *
 * CONVENTIONS (matches src/db/schema.ts and drizzle/0005_research.sql)
 *  - snake_case SQL name, singular table name
 *  - `id: serial().primaryKey()`
 *  - business key gets `.notNull().unique()` plus an explicit uniqueIndex
 *  - `createdAt: timestamp().defaultNow().notNull()`
 *  - enums are plain `text`, never pgEnum (repo-wide convention)
 *  - JSON payloads are `text` and are serialised in the repository
 *  - third argument is the modern array form `(table) => [ ... ]`
 *
 * APPEND-ONLY TABLES (`business_usage_events`, `business_audit_events`, and all later
 * append-only business tables) intentionally carry `createdAt` but NO `updatedAt`.
 * Roadmap §10 asks for both; for an immutable event journal an `updatedAt` column would be
 * a lie, because the row can never change. This matches the existing RESEARCH
 * (`research_experiments`, `research_certifications`) and PAPER REPLAY (`replay_runs`)
 * append-only tables. Documented deviation.
 *
 * COMMERCIAL vs INVESTMENT LEDGER (roadmap §05.6): nothing in this file touches cash,
 * position, NAV, P&L or fee accounting. The investment ledger is
 * `paper_trade_ledger` / `portfolio_*` in the trading lane and is never referenced here.
 */

import { pgTable, serial, integer, bigint, text, boolean, timestamp, date, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ============================================================================
// 1. BUSINESS_SUBSCRIPTIONS
// --------------------------------------------------------------------------
// One row per commercial subject. Append-changed rather than append-only, because a
// subscription legitimately mutates over its lifecycle; every mutation is additionally
// written to `business_audit_events` so history is reconstructable.
//
// `planFingerprint` records WHICH plan definition was applied at the time of the write.
// The plan catalog lives in code (src/lib/business/plans.ts) precisely so that entitlement
// evaluation is deterministic and version-controlled. Storing the fingerprint alongside
// every subscription means a later catalog change can never silently rewrite the meaning
// of a historical subscription.
// ============================================================================
export const businessSubscriptions = pgTable(
  'business_subscriptions',
  {
    id: serial('id').primaryKey(),
    subscriptionId: text('subscription_id').notNull().unique(),
    /** Commercial subject: a PLATFORM user id, or an organization id. */
    subjectId: text('subject_id').notNull(),
    /** 'USER' | 'ORGANIZATION'. Ownership discriminator. */
    subjectKind: text('subject_kind').notNull(),
    /** Set when subjectKind === 'ORGANIZATION'. */
    organizationId: text('organization_id'),
    planId: text('plan_id').notNull(),
    /** Fingerprint of the applied PlanDefinition. Auditability across catalog changes. */
    planFingerprint: text('plan_fingerprint').notNull(),
    /** TRIALING | ACTIVE | PAST_DUE | PAUSED | CANCELLED | EXPIRED | INCOMPLETE | UNAVAILABLE */
    status: text('status').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    gracePeriodEnd: timestamp('grace_period_end', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    /** Provider-neutral external reference. NULL for internal/system-issued subscriptions. */
    providerRef: text('provider_ref'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_subscriptions_sid_idx').on(table.subscriptionId),
    index('business_subscriptions_subject_idx').on(table.subjectId),
    index('business_subscriptions_status_idx').on(table.status),
    index('business_subscriptions_org_idx').on(table.organizationId),
  ],
);

// ============================================================================
// 2. BUSINESS_USAGE_EVENTS  (append-only, idempotent)
// --------------------------------------------------------------------------
// IDEMPOTENCY CONTRACT (roadmap §01.5, §05.4):
//   `event_id` carries a UNIQUE constraint. `usage_idempotency` proves a duplicate event
//   cannot create a second economic effect even across processes and even under a retry.
//   The repository inserts with ON CONFLICT DO NOTHING and then re-reads, so a duplicate
//   insert is reported as `duplicate: true` rather than an error.
//
// The unique index is deliberately GLOBAL on event_id (not per-subject) so that a caller
// cannot reuse an id across two subjects to double-charge either of them.
// ============================================================================
export const businessUsageEvents = pgTable(
  'business_usage_events',
  {
    id: serial('id').primaryKey(),
    /** Idempotency key supplied by the caller. GLOBAL UNIQUE. */
    eventId: text('event_id').notNull().unique(),
    subjectId: text('subject_id').notNull(),
    /** AI_REQUESTS | BACKTEST_RUNS | PAPER_REPLAYS | RESEARCH_EXPERIMENTS | EXPORTS |
     *  ALERTS | API_CALLS | COMMUNITY_POSTS | MARKETPLACE_LISTINGS */
    resource: text('resource').notNull(),
    /** Always a positive integer. Enforced by UsageMeter.validateUsageEvent. */
    quantity: integer('quantity').notNull(),
    /** Billing window key, e.g. '2026-10'. Never derived from the wall clock. */
    periodKey: text('period_key').notNull(),
    /** Feature the consumption was attributed to, when applicable. */
    feature: text('feature'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** JSON. Must never contain secrets — redact() in auditLog.ts is the reference filter. */
    metadata: text('metadata').notNull().default('{}'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_usage_event_id_idx').on(table.eventId),
    index('business_usage_bucket_idx').on(table.subjectId, table.resource, table.periodKey),
    index('business_usage_period_idx').on(table.periodKey),
  ],
);

// ============================================================================
// 3. BUSINESS_AUDIT_EVENTS  (append-only, never updated, never deleted)
// ===========================================================================
// The commercial audit trail required by roadmap §05.9 / §28. PHASE 0 §2.6 established
// that no such trail exists anywhere in the repository.
//
// Immutable by construction: no repository in this lane ever issues an UPDATE or DELETE
// against this table. `metadata` is passed through redact() before it is written.
// ============================================================================
export const businessAuditEvents = pgTable(
  'business_audit_events',
  {
    id: serial('id').primaryKey(),
    /** Monotonic, gap-free within a writer. Total ordering of the commercial trail. */
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    action: text('action').notNull(),
    /** SUCCESS | FAILURE | REJECTED */
    outcome: text('outcome').notNull(),
    subjectId: text('subject_id').notNull(),
    organizationId: text('organization_id'),
    /** PLATFORM user id of the actor. NULL for system-initiated events. */
    actorUserId: text('actor_user_id'),
    actorSessionId: text('actor_session_id'),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    /** JSON, redacted. Never contains a secret, token or payment credential. */
    metadata: text('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_audit_seq_idx').on(table.sequence),
    index('business_audit_subject_idx').on(table.subjectId),
    index('business_audit_action_idx').on(table.action),
    index('business_audit_correlation_idx').on(table.correlationId),
    index('business_audit_time_idx').on(table.occurredAt),
  ],
);

export type BusinessSubscriptionRow = typeof businessSubscriptions.$inferSelect;
export type NewBusinessSubscriptionRow = typeof businessSubscriptions.$inferInsert;
export type BusinessUsageEventRow = typeof businessUsageEvents.$inferSelect;
export type BusinessAuditEventRow = typeof businessAuditEvents.$inferSelect;

// ============================================================================
// BUSINESS-02 — COMMUNITY
// --------------------------------------------------------------------------
// Visibility is stored as text and is ALWAYS re-checked server-side by
// src/lib/business/community/visibility.ts. It is never trusted from a request body.
// ============================================================================

// -----------------------------------------------------------------------------
// 4. community_posts
// Append-changed (edits bump `version`); never deleted by moderation, only withdrawn.
// -----------------------------------------------------------------------------
export const communityPosts = pgTable(
  'community_posts',
  {
    id: serial('id').primaryKey(),
    postId: text('post_id').notNull().unique(),
    // OWNERSHIP (roadmap §10).
    authorUserId: text('author_user_id').notNull(),
    authorOrganizationId: text('author_organization_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** JSON array of ContentLabel. Mandatory for investment-relevant content. */
    labels: text('labels').notNull().default('[]'),
    /** PRIVATE | WORKSPACE | ORGANIZATION | COMMUNITY | UNLISTED | PUBLIC */
    visibility: text('visibility').notNull().default('PRIVATE'),
    workspaceId: text('workspace_id'),
    organizationId: text('organization_id'),
    /** VISIBLE | FLAGGED | UNDER_REVIEW | HIDDEN | REMOVED | SUSPENDED */
    moderation: text('moderation').notNull().default('VISIBLE'),
    /** JSON array of ProvenanceRef. Empty is allowed; gaps are rendered as NOT_AVAILABLE. */
    provenance: text('provenance').notNull().default('[]'),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_posts_pid_idx').on(table.postId),
    // Bounded public/community feed: visibility + moderation + recency.
    index('community_posts_feed_idx').on(table.visibility, table.moderation, table.createdAt),
    index('community_posts_author_idx').on(table.authorUserId),
    index('community_posts_org_idx').on(table.organizationId),
    index('community_posts_workspace_idx').on(table.workspaceId),
  ],
);

// -----------------------------------------------------------------------------
// 5. community_post_versions  (append-only, roadmap §02.2 content versioning)
// Every prior body is retained so an edit is auditable and a claim can be traced to the
// exact text that made it.
// -----------------------------------------------------------------------------
export const communityPostVersions = pgTable(
  'community_post_versions',
  {
    id: serial('id').primaryKey(),
    postId: text('post_id').notNull(),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    labels: text('labels').notNull().default('[]'),
    provenance: text('provenance').notNull().default('[]'),
    editedByUserId: text('edited_by_user_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_post_versions_uniq').on(table.postId, table.version),
    index('community_post_versions_post_idx').on(table.postId),
  ],
);

// -----------------------------------------------------------------------------
// 6. community_comments
// -----------------------------------------------------------------------------
export const communityComments = pgTable(
  'community_comments',
  {
    id: serial('id').primaryKey(),
    commentId: text('comment_id').notNull().unique(),
    postId: text('post_id').notNull(),
    authorUserId: text('author_user_id').notNull(),
    authorOrganizationId: text('author_organization_id'),
    body: text('body').notNull(),
    visibility: text('visibility').notNull().default('PRIVATE'),
    workspaceId: text('workspace_id'),
    organizationId: text('organization_id'),
    moderation: text('moderation').notNull().default('VISIBLE'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_comments_cid_idx').on(table.commentId),
    index('community_comments_post_idx').on(table.postId),
    index('community_comments_author_idx').on(table.authorUserId),
  ],
);

// -----------------------------------------------------------------------------
// 7. community_reports  (append-only)
// -----------------------------------------------------------------------------
export const communityReports = pgTable(
  'community_reports',
  {
    id: serial('id').primaryKey(),
    reportId: text('report_id').notNull().unique(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reporterUserId: text('reporter_user_id').notNull(),
    reason: text('reason').notNull(),
    detail: text('detail').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_reports_rid_idx').on(table.reportId),
    index('community_reports_target_idx').on(table.targetType, table.targetId),
  ],
);

// -----------------------------------------------------------------------------
// 8. community_moderation_records  (append-only, roadmap §02.5)
// Moderation is auditable: who, what, from, to, why, when, correlated.
// -----------------------------------------------------------------------------
export const communityModerationRecords = pgTable(
  'community_moderation_records',
  {
    id: serial('id').primaryKey(),
    moderationId: text('moderation_id').notNull().unique(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    action: text('action').notNull(),
    fromState: text('from_state').notNull(),
    toState: text('to_state').notNull(),
    moderatorUserId: text('moderator_user_id').notNull(),
    reason: text('reason').notNull(),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_moderation_mid_idx').on(table.moderationId),
    index('community_moderation_target_idx').on(table.targetType, table.targetId),
    index('community_moderation_actor_idx').on(table.moderatorUserId),
  ],
);

// -----------------------------------------------------------------------------
// 9. community_reputation_events  (append-only, roadmap §02.7)
// Reputation is a fold over these rows and nothing else. Never used for authorization.
// -----------------------------------------------------------------------------
export const communityReputationEvents = pgTable(
  'community_reputation_events',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id').notNull().unique(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    delta: integer('delta').notNull(),
    /** The artifact that caused the event. Reputation without provenance is just a score. */
    subjectRef: text('subject_ref').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_reputation_eid_idx').on(table.eventId),
    index('community_reputation_user_idx').on(table.userId),
  ],
);
export type CommunityPostRow = typeof communityPosts.$inferSelect;
export type CommunityCommentRow = typeof communityComments.$inferSelect;
export type CommunityReportRow = typeof communityReports.$inferSelect;
export type CommunityModerationRecordRow = typeof communityModerationRecords.$inferSelect;
export type CommunityReputationEventRow = typeof communityReputationEvents.$inferSelect;

// ============================================================================
// BUSINESS-03 — MARKETPLACE
// --------------------------------------------------------------------------
// PERFORMANCE IS COLUMN-LEVEL, NOT A BLOB.
//
// Every performance provenance field (roadmap §03.2) is its own nullable COLUMN rather
// than one JSON manifest. A missing field is then individually visible to a query, a CHECK
// constraint and a test — it cannot hide inside an opaque object where a reviewer would
// have to notice it. `marketplace_listings.performance_displayable` is a GENERATED column
// that the database itself computes from the six fields, so "displayable" is enforced by
// the engine and not merely by application convention.
// ============================================================================

export const marketplaceStrategies = pgTable(
  'marketplace_strategies',
  {
    id: serial('id').primaryKey(),
    strategyId: text('strategy_id').notNull().unique(),
    /** Stable identity across versions. The version chain hangs off this. */
    name: text('name').notNull(),
    authorUserId: text('author_user_id').notNull(),
    authorOrganizationId: text('author_organization_id'),
    /** Owning organization, when the strategy is organization-owned (BUSINESS-04). */
    organizationId: text('organization_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('marketplace_strategies_sid_idx').on(table.strategyId),
    index('marketplace_strategies_author_idx').on(table.authorUserId),
  ],
);

export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: serial('id').primaryKey(),
    listingRef: text('listing_ref').notNull().unique(),
    strategyId: text('strategy_id').notNull(),
    /** Monotonic per strategy. An update creates a new version; it never mutates this one. */
    version: integer('version').notNull(),
    previousVersionRef: text('previous_version_ref'),
    authorUserId: text('author_user_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    universe: text('universe').notNull(),
    assetClass: text('asset_class').notNull(),
    rules: text('rules').notNull().default('{}'),
    parameters: text('parameters').notNull().default('{}'),
    riskModel: text('risk_model').notNull(),
    executionModel: text('execution_model').notNull(),
    costModel: text('cost_model').notNull(),
    /** JSON array of EvidenceFlag. Independent flags, never a single collapsed status. */
    evidence: text('evidence').notNull().default('["AUTHORED"]'),
    /** DRAFT|SUBMITTED|UNDER_REVIEW|PUBLISHED|SUSPENDED|DEPRECATED|ARCHIVED */
    publicationStatus: text('publication_status').notNull().default('DRAFT'),
    /** FREE|ONE_TIME|SUBSCRIPTION|BUNDLE|ORGANIZATION_LICENSE */
    commercialModel: text('commercial_model').notNull().default('FREE'),
    /** PUBLIC|UNLISTED */
    visibility: text('visibility').notNull().default('UNLISTED'),

    // ---- the six mandatory provenance fields, one column each ----
    perfDataset: text('perf_dataset'),
    perfPeriodStart: date('perf_period_start'),
    perfPeriodEnd: date('perf_period_end'),
    perfStrategyVersion: text('perf_strategy_version'),
    perfCostModel: text('perf_cost_model'),
    perfExecutionModel: text('perf_execution_model'),
    perfValidationState: text('perf_validation_state'),

    /** Recorded metrics. Present ONLY when all six provenance columns are non-null. */
    performance: text('performance').notNull().default('[]'),
    /** Backtest trade count: the real sample size behind any ratio. */
    sampleSize: integer('sample_size'),
    paperTradeCount: integer('paper_trade_count'),
    outOfSample: boolean('out_of_sample').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('marketplace_listings_ref_idx').on(table.listingRef),
    // One version per strategy: makes silent in-place version mutation impossible.
    uniqueIndex('marketplace_listings_version_uniq').on(table.strategyId, table.version),
    // Bounded discovery feed.
    index('marketplace_listings_feed_idx').on(table.publicationStatus, table.assetClass, table.createdAt),
    index('marketplace_listings_author_idx').on(table.authorUserId),
    index('marketplace_listings_author_org_idx').on(table.authorUserId),
  ],
);

export type MarketplaceStrategyRow = typeof marketplaceStrategies.$inferSelect;
export type MarketplaceListingRow = typeof marketplaceListings.$inferSelect;

// ============================================================================
// BUSINESS-04 — ORGANIZATION / WORKSPACE / SEATS
// --------------------------------------------------------------------------
// The partial UNIQUE index on (organization_id, assigned_user_id) WHERE status='ASSIGNED'
// is declared in the migration rather than here, because it is a filtered unique index.
// It is the mechanism that makes concurrent seat assignment safe across processes.
// ============================================================================

export const organizations = pgTable(
  'business_organizations',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').notNull().unique(),
    name: text('name').notNull(),
    /** ACTIVE | SUSPENDED | CLOSING | CLOSED */
    status: text('status').notNull().default('ACTIVE'),
    /** Commercial subject id == organizationId. One subscription per subject. */
    subjectId: text('subject_id').notNull(),
    planId: text('plan_id').notNull(),
    planFingerprint: text('plan_fingerprint').notNull(),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_orgs_oid_idx').on(table.organizationId),
    index('business_orgs_status_idx').on(table.status),
  ],
);

export const orgMemberships = pgTable(
  'business_org_memberships',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    userId: text('user_id').notNull(),
    /** OWNER | ADMIN | RESEARCHER | VIEWER | TRAINING_ADMIN | INSTRUCTOR */
    role: text('role').notNull().default('VIEWER'),
    /** ACTIVE | SUSPENDED | REVOKED | PENDING */
    status: text('status').notNull().default('PENDING'),
    seatId: text('seat_id'),
    correlationId: text('correlation_id'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // One membership per (organization, user). Prevents duplicate membership rows.
    uniqueIndex('business_org_members_uniq').on(table.organizationId, table.userId),
    index('business_org_members_user_idx').on(table.userId),
    index('business_org_members_org_status_idx').on(table.organizationId, table.status),
  ],
);

export const orgWorkspaces = pgTable(
  'business_org_workspaces',
  {
    id: serial('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().unique(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_org_ws_wid_idx').on(table.workspaceId),
    index('business_org_ws_org_idx').on(table.organizationId),
  ],
);

export const orgSeats = pgTable(
  'business_org_seats',
  {
    id: serial('id').primaryKey(),
    seatId: text('seat_id').notNull().unique(),
    organizationId: text('organization_id').notNull(),
    /** AVAILABLE | ASSIGNED | SUSPENDED | REVOKED */
    status: text('status').notNull().default('AVAILABLE'),
    assignedUserId: text('assigned_user_id'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_org_seats_sid_idx').on(table.seatId),
    index('business_org_seats_org_idx').on(table.organizationId),
  ],
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type OrgMembershipRow = typeof orgMemberships.$inferSelect;
export type OrgWorkspaceRow = typeof orgWorkspaces.$inferSelect;
export type OrgSeatRow = typeof orgSeats.$inferSelect;

// ============================================================================
// BUSINESS-05 — BILLING / COMMERCIAL LEDGER / WEBHOOKS
// --------------------------------------------------------------------------
// COMMERCIAL vs INVESTMENT LEDGER (roadmap §05.6) — read this before adding a column.
//
//   INVESTMENT accounting lives in the trading lane: portfolio_*, paper_trade_ledger,
//   account state, cash, position, NAV, P&L, fees. THIS LANE MUST NOT TOUCH IT.
//
//   The tables below are commercial only: invoice, payment, refund, credit, platform fee,
//   creator share. There is NO position, quantity, price, NAV or fill column anywhere, and
//   no FK to any investment table. The separation is structural, not conventional.
// ============================================================================

export const commercialPayments = pgTable(
  'business_commercial_payments',
  {
    id: serial('id').primaryKey(),
    paymentId: text('payment_id').notNull().unique(),
    /** GLOBAL UNIQUE: a retried charge must never create a second payment (§05.4). */
    idempotencyKey: text('idempotency_key').notNull().unique(),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    subjectId: text('subject_id').notNull(),
    organizationId: text('organization_id'),
    planId: text('plan_id').notNull(),
    /** PAYMENT_PENDING|SUCCEEDED|FAILED|REFUNDED|CANCELLED|UNKNOWN */
    status: text('status').notNull().default('PAYMENT_PENDING'),
    /** Integer minor units only. NULL until a provider reports an amount. */
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    /** TEST | SANDBOX | PRODUCTION. Never inferred; written explicitly. */
    environment: text('environment').notNull().default('SANDBOX'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_payments_pid_idx').on(table.paymentId),
    uniqueIndex('business_payments_idem_idx').on(table.idempotencyKey),
    index('business_payments_subject_idx').on(table.subjectId),
    index('business_payments_status_idx').on(table.status),
    index('business_payments_provider_ref_idx').on(table.providerRef),
  ],
);

export const commercialLedgerEntries = pgTable(
  'business_commercial_ledger',
  {
    id: serial('id').primaryKey(),
    entryId: text('entry_id').notNull().unique(),
    /** The natural idempotency key of the whole economic effect (§05.4). */
    causationId: text('causation_id').notNull().unique(),
    kind: text('kind').notNull(),
    subjectId: text('subject_id').notNull(),
    organizationId: text('organization_id'),
    reference: text('reference').notNull(),
    /** NULL whenever moneySource === 'NONE'. An amount can never be unsourced. */
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    /** PROVIDER_REPORTED | OPERATOR_ADJUSTMENT | NONE */
    moneySource: text('money_source').notNull().default('NONE'),
    provider: text('provider'),
    providerRef: text('provider_ref'),
    environment: text('environment').notNull().default('SANDBOX'),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_ledger_eid_idx').on(table.entryId),
    uniqueIndex('business_ledger_causation_idx').on(table.causationId),
    index('business_ledger_subject_idx').on(table.subjectId),
    index('business_ledger_reference_idx').on(table.reference),
    index('business_ledger_kind_idx').on(table.kind),
  ],
);

export const webhookProcessingRecords = pgTable(
  'business_webhook_records',
  {
    id: serial('id').primaryKey(),
    /** GLOBAL UNIQUE: the webhook replay defence (§05.4, §05.5). */
    eventId: text('event_id').notNull().unique(),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    /** RECEIVED|VALIDATED|PROCESSING|PROCESSED|FAILED|RETRY_REQUIRED */
    state: text('state').notNull().default('RECEIVED'),
    failureReason: text('failure_reason'),
    /** The single named economic effect applied. NULL when none was. */
    appliedEffect: text('applied_effect'),
    payloadDigest: text('payload_digest'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('business_webhook_eid_idx').on(table.eventId),
    index('business_webhook_state_idx').on(table.state),
    index('business_webhook_provider_idx').on(table.provider, table.receivedAt),
  ],
);

export type CommercialPaymentRow = typeof commercialPayments.$inferSelect;
export type CommercialLedgerRow = typeof commercialLedgerEntries.$inferSelect;
export type WebhookProcessingRow = typeof webhookProcessingRecords.$inferSelect;
