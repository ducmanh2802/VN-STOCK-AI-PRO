-- =============================================================================
-- BUSINESS-02 — COMMUNITY
-- Research/learning community with server-side visibility, auditable moderation and
-- provenance-preserving versioning.
--
-- SAFETY POSTURE (roadmap §05, §02.6):
--   This schema stores prose and provenance references. It stores NO performance figure, NO
--   return, NO rank and NO valuation. There is no column in which a fabricated number about
--   an investment could be presented as system-validated. Marketplace performance (which
--   DOES need provenance) is a separate concern and lives in migration 0009, where each
--   metric carries its own source columns.
--
-- PRIVACY (roadmap §02.4): `visibility` is a stored declaration, NOT an authorization
--   decision. Every read re-evaluates visibility server-side through
--   src/lib/business/community/visibility.ts. Filtering in SQL is an optimisation only; a
--   bug in a query cannot make a PRIVATE post readable, because the API never returns a row
--   the engine did not approve.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. community_posts
-- Append-changed: an edit bumps `version` and writes a community_post_versions row.
-- Moderation withdraws (moderation column) rather than deleting, so moderation history
-- and reported content remain auditable.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_posts (
  id                      SERIAL PRIMARY KEY,
  post_id                 TEXT NOT NULL UNIQUE,
  -- OWNERSHIP (roadmap §10)
  author_user_id          TEXT NOT NULL,
  author_organization_id  TEXT,
  title                   TEXT NOT NULL,
  body                    TEXT NOT NULL,
  -- JSON array of ContentLabel: EDUCATIONAL | RESEARCH | PAPER_ONLY | HYPOTHESIS |
  -- PERSONAL_VIEW. Mandatory for investment-relevant content.
  labels                  TEXT NOT NULL DEFAULT '[]',
  -- PRIVATE | WORKSPACE | ORGANIZATION | COMMUNITY | UNLISTED | PUBLIC
  visibility              TEXT NOT NULL DEFAULT 'PRIVATE',
  workspace_id            TEXT,
  organization_id         TEXT,
  -- VISIBLE | FLAGGED | UNDER_REVIEW | HIDDEN | REMOVED | SUSPENDED
  moderation              TEXT NOT NULL DEFAULT 'VISIBLE',
  -- JSON array of ProvenanceRef. Gaps are rendered as NOT_AVAILABLE (roadmap §16);
  -- they are never filled with a placeholder.
  provenance              TEXT NOT NULL DEFAULT '[]',
  version                 INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_posts_visibility_check CHECK (
    visibility IN ('PRIVATE','WORKSPACE','ORGANIZATION','COMMUNITY','UNLISTED','PUBLIC')
  ),
  CONSTRAINT community_posts_moderation_check CHECK (
    moderation IN ('VISIBLE','FLAGGED','UNDER_REVIEW','HIDDEN','REMOVED','SUSPENDED')
  ),
  CONSTRAINT community_posts_version_check CHECK (version >= 1),
  -- A scoped post must actually name its scope, otherwise the scope check in the engine
  -- would be bypassable by omitting the id.
  CONSTRAINT community_posts_scope_check CHECK (
    (visibility IN ('PRIVATE','COMMUNITY','UNLISTED','PUBLIC') OR organization_id IS NOT NULL)
  ),
  CONSTRAINT community_posts_workspace_check CHECK (
    visibility <> 'WORKSPACE' OR workspace_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS community_posts_feed_idx
  ON community_posts (visibility, moderation, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_author_idx
  ON community_posts (author_user_id);
CREATE INDEX IF NOT EXISTS community_posts_org_idx
  ON community_posts (organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_posts_workspace_idx
  ON community_posts (workspace_id)
  WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS community_posts_pid_idx
  ON community_posts (post_id);

-- -----------------------------------------------------------------------------
-- 2. community_post_versions  (append-only)
-- An edit is auditable: the exact text that carried a claim is retained.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_post_versions (
  id               SERIAL PRIMARY KEY,
  post_id          TEXT NOT NULL,
  version          INTEGER NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  labels           TEXT NOT NULL DEFAULT '[]',
  provenance       TEXT NOT NULL DEFAULT '[]',
  edited_by_user_id TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_post_versions_version_check CHECK (version >= 1)
);

-- One row per (post, version). This is what makes an edit history non-forgeable.
CREATE UNIQUE INDEX IF NOT EXISTS community_post_versions_uniq
  ON community_post_versions (post_id, version);
CREATE INDEX IF NOT EXISTS community_post_versions_post_idx
  ON community_post_versions (post_id);

-- -----------------------------------------------------------------------------
-- 3. community_comments
-- A comment may never be broader than its parent post; the engine enforces this and the
-- visibility column records the inherited scope.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_comments (
  id                      SERIAL PRIMARY KEY,
  comment_id              TEXT NOT NULL UNIQUE,
  post_id                 TEXT NOT NULL,
  author_user_id          TEXT NOT NULL,
  author_organization_id  TEXT,
  body                    TEXT NOT NULL,
  visibility              TEXT NOT NULL DEFAULT 'PRIVATE',
  workspace_id            TEXT,
  organization_id         TEXT,
  moderation              TEXT NOT NULL DEFAULT 'VISIBLE',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_comments_visibility_check CHECK (
    visibility IN ('PRIVATE','WORKSPACE','ORGANIZATION','COMMUNITY','UNLISTED','PUBLIC')
  ),
  CONSTRAINT community_comments_moderation_check CHECK (
    moderation IN ('VISIBLE','FLAGGED','UNDER_REVIEW','HIDDEN','REMOVED','SUSPENDED')
  )
);

CREATE INDEX IF NOT EXISTS community_comments_post_idx
  ON community_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS community_comments_author_idx
  ON community_comments (author_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS community_comments_cid_idx
  ON community_comments (comment_id);

-- -----------------------------------------------------------------------------
-- 4. community_reports  (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_reports (
  id               SERIAL PRIMARY KEY,
  report_id        TEXT NOT NULL UNIQUE,
  target_type      TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reason           TEXT NOT NULL,
  detail           TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_reports_target_type_check CHECK (target_type IN ('POST','COMMENT')),
  CONSTRAINT community_reports_reason_check CHECK (
    reason IN ('UNSUPPORTED_RETURN_CLAIM','PERSONALIZED_ADVICE','SPAM','HARASSMENT',
               'PRIVATE_DATA','COPYRIGHT','OTHER')
  )
);

CREATE INDEX IF NOT EXISTS community_reports_target_idx
  ON community_reports (target_type, target_id);
-- One user may not report the same target repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS community_reports_uniq
  ON community_reports (reporter_user_id, target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS community_reports_rid_idx
  ON community_reports (report_id);

-- -----------------------------------------------------------------------------
-- 5. community_moderation_records  (append-only, roadmap §02.5)
-- Nothing in this lane ever issues UPDATE or DELETE against this table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_moderation_records (
  id                SERIAL PRIMARY KEY,
  moderation_id     TEXT NOT NULL UNIQUE,
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  action            TEXT NOT NULL,
  from_state        TEXT NOT NULL,
  to_state          TEXT NOT NULL,
  -- Actor identity is mandatory: moderation must be attributable (roadmap §02.5).
  moderator_user_id TEXT NOT NULL,
  reason            TEXT NOT NULL,
  correlation_id    TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_moderation_target_check CHECK (target_type IN ('POST','COMMENT')),
  CONSTRAINT community_moderation_action_check CHECK (
    action IN ('FLAG','BEGIN_REVIEW','RESTORE','HIDE','REMOVE','SUSPEND_AUTHOR')
  ),
  -- A record with no reason is not an auditable moderation action.
  CONSTRAINT community_moderation_reason_check CHECK (length(reason) > 0)
);

CREATE INDEX IF NOT EXISTS community_moderation_target_idx
  ON community_moderation_records (target_type, target_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS community_moderation_actor_idx
  ON community_moderation_records (moderator_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS community_moderation_mid_idx
  ON community_moderation_records (moderation_id);

-- -----------------------------------------------------------------------------
-- 6. community_reputation_events  (append-only, roadmap §02.7)
-- Reputation is a fold over these rows and nothing else. There is NO column anywhere in
-- this schema that feeds a reputation score into an authorization decision.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_reputation_events (
  id          SERIAL PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  delta       INTEGER NOT NULL,
  -- Provenance: reputation without an attributable cause is just a number.
  subject_ref TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT community_reputation_kind_check CHECK (
    kind IN ('CONTRIBUTION_UPVOTED','RESEARCH_VERIFIED','LEARNING_COMPLETED',
             'QUALITY_FEEDBACK_POSITIVE','MODERATION_ACTION_AGAINST','MODERATION_CLEARED')
  ),
  CONSTRAINT community_reputation_subject_check CHECK (length(subject_ref) > 0)
);

CREATE INDEX IF NOT EXISTS community_reputation_user_idx
  ON community_reputation_events (user_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_reputation_eid_idx
  ON community_reputation_events (event_id);