-- =============================================================================
-- BUSINESS-01 — MONETIZATION FOUNDATION
-- Commercial entitlement substrate: subscriptions, idempotent usage metering,
-- and the commercial audit trail.
--
-- LANE BOUNDARY: this migration is owned by the BUSINESS lane. It is intentionally
-- a separate file from `src/db/schema.ts` because that file is concurrently owned by
-- the PLATFORM lane (docs/BUSINESS_READINESS_AUDIT.md §1.1, roadmap §25).
--
-- COMMERCIAL LEDGER BOUNDARY (roadmap §05.6): these tables record invoices-equivalent
-- commercial state ONLY. They contain no cash, position, NAV, P&L, fee or trade data.
-- The investment accounting ledger lives in the trading lane and is never mixed here.
--
-- PAYMENT BOUNDARY (roadmap §4): there is NO payment provider in this repository.
-- No amount, currency, card number, bank account or settlement record is stored.
-- Amounts arrive only after a provider adapter is authorised (BUSINESS-05).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. business_subscriptions
-- One row per commercial subject (USER = platform user id, ORGANIZATION = org id).
-- Mutable over its lifecycle; every mutation is mirrored into business_audit_events.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_subscriptions (
  id                    SERIAL PRIMARY KEY,
  subscription_id       TEXT NOT NULL UNIQUE,
  subject_id            TEXT NOT NULL,
  subject_kind          TEXT NOT NULL,
  organization_id       TEXT,
  plan_id               TEXT NOT NULL,
  -- Fingerprint of the applied PlanDefinition. The plan catalog is code-defined so
  -- entitlement evaluation stays deterministic; storing the fingerprint here means a
  -- later catalog change can never silently rewrite a historical subscription.
  plan_fingerprint      TEXT NOT NULL,
  status                TEXT NOT NULL,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at          TIMESTAMPTZ,
  grace_period_end      TIMESTAMPTZ,
  trial_ends_at         TIMESTAMPTZ,
  provider_ref          TEXT,
  correlation_id        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Status must be one of the closed machine's states (roadmap §01.2 / §05.3).
  CONSTRAINT business_subscriptions_status_check CHECK (
    status IN ('TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED','INCOMPLETE','UNAVAILABLE')
  ),
  -- Ownership discriminator must agree with the organization pointer (roadmap §10).
  CONSTRAINT business_subscriptions_kind_check CHECK (
    (subject_kind = 'USER' AND organization_id IS NULL)
    OR (subject_kind = 'ORGANIZATION' AND organization_id IS NOT NULL)
  ),
  -- A cancellation must record when it happened.
  CONSTRAINT business_subscriptions_cancelled_at_check CHECK (
    status <> 'CANCELLED' OR cancelled_at IS NOT NULL
  ),
  -- Period must not be inverted.
  CONSTRAINT business_subscriptions_period_order_check CHECK (
    current_period_start IS NULL
    OR current_period_end IS NULL
    OR current_period_end > current_period_start
  )
);

-- A subject holds AT MOST ONE subscription. This is what makes plan resolution total
-- and makes a duplicate subscription impossible (roadmap §05.4).
CREATE UNIQUE INDEX IF NOT EXISTS business_subscriptions_subject_uniq
  ON business_subscriptions (subject_id);

CREATE INDEX IF NOT EXISTS business_subscriptions_sid_idx
  ON business_subscriptions (subscription_id);
CREATE INDEX IF NOT EXISTS business_subscriptions_status_idx
  ON business_subscriptions (status);
CREATE INDEX IF NOT EXISTS business_subscriptions_org_idx
  ON business_subscriptions (organization_id)
  WHERE organization_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. business_usage_events  (append-only)
--
-- IDEMPOTENCY (roadmap §01.5, §05.4):
--   event_id is GLOBAL UNIQUE. A retried request therefore cannot be counted twice,
--   and cannot dodge a per-subject cap by moving to another subject either.
--   The repository inserts with ON CONFLICT (event_id) DO NOTHING and re-reads, so a
--   duplicate is reported as duplicate=true rather than raising.
--
--   event_id is GLOBAL (not per-subject) deliberately: a per-subject unique key would
--   still permit the same logical charge to be re-keyed under a second subject.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_usage_events (
  id              SERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL UNIQUE,
  subject_id      TEXT NOT NULL,
  resource        TEXT NOT NULL,
  quantity        INTEGER NOT NULL,
  period_key      TEXT NOT NULL,
  feature         TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL,
  metadata        TEXT NOT NULL DEFAULT '{}',
  correlation_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A zero or negative charge is never valid (UsageMeter.validateUsageEvent).
  CONSTRAINT business_usage_quantity_check CHECK (quantity > 0),
  -- Period key is an explicit billing window, e.g. '2026-10'.
  CONSTRAINT business_usage_period_key_check CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT business_usage_resource_check CHECK (
    resource IN ('AI_REQUESTS','BACKTEST_RUNS','PAPER_REPLAYS','RESEARCH_EXPERIMENTS',
                 'EXPORTS','ALERTS','API_CALLS','COMMUNITY_POSTS','MARKETPLACE_LISTINGS')
  )
);

-- Bounded aggregation for the limit check: one index serves the whole
-- consumed(subject, resource, period) lookup.
CREATE INDEX IF NOT EXISTS business_usage_bucket_idx
  ON business_usage_events (subject_id, resource, period_key);
CREATE INDEX IF NOT EXISTS business_usage_period_idx
  ON business_usage_events (period_key);
CREATE INDEX IF NOT EXISTS business_usage_event_id_idx
  ON business_usage_events (event_id);

-- -----------------------------------------------------------------------------
-- 3. business_audit_events  (append-only, immutable)
--
-- The commercial audit trail required by roadmap §05.9 / §28. Nothing in the Business
-- lane ever issues an UPDATE or DELETE against this table.
--
-- REVOKE UPDATE/DELETE at the database level is left to the deployment role policy,
-- which this migration does not assume exists.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_audit_events (
  id                BIGSERIAL PRIMARY KEY,
  sequence          BIGINT NOT NULL,
  action            TEXT NOT NULL,
  outcome           TEXT NOT NULL,
  subject_id        TEXT NOT NULL,
  organization_id   TEXT,
  actor_user_id     TEXT,
  actor_session_id  TEXT,
  correlation_id    TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL,
  reason            TEXT NOT NULL,
  metadata          TEXT NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_audit_outcome_check CHECK (outcome IN ('SUCCESS','FAILURE','REJECTED')),
  -- A rejection must always carry a reason explaining what was refused.
  CONSTRAINT business_audit_reason_check CHECK (length(reason) > 0)
);

-- Total ordering of the commercial trail per writer.
CREATE UNIQUE INDEX IF NOT EXISTS business_audit_seq_idx
  ON business_audit_events (sequence);
CREATE INDEX IF NOT EXISTS business_audit_subject_idx
  ON business_audit_events (subject_id);
CREATE INDEX IF NOT EXISTS business_audit_action_idx
  ON business_audit_events (action);
CREATE INDEX IF NOT EXISTS business_audit_correlation_idx
  ON business_audit_events (correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_audit_time_idx
  ON business_audit_events (occurred_at);