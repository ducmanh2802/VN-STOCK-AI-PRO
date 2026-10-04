-- PLATFORM FOUNDATION — 0007 IDENTITY, SESSIONS, AUTH EVENTS
-- Additive migration. Creates ONLY new platform_* tables.
-- Does NOT alter, drop, or repurpose any existing table (users, stocks, decision_journal,
-- research_*, replay_runs, macro_*, earnings_*, capital_cycle_* all untouched).
-- Safe to run multiple times (IF NOT EXISTS).
-- Deterministic ordering: 0007 (after 0006_paper_replay).
-- Mirrors src/db/schema.ts additions exactly.
-- SECURITY: no plaintext passwords, no tokens, no secrets. Only scrypt credential
-- records and sha256 token hashes are stored.

CREATE TABLE IF NOT EXISTS "platform_user_account" (
  "user_id" text PRIMARY KEY,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "password_hash" text,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "last_login_at" bigint,
  "disabled_reason" text
);

CREATE TABLE IF NOT EXISTS "platform_sessions" (
  "session_id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" bigint NOT NULL,
  "expires_at" bigint NOT NULL,
  "revoked_at" bigint,
  "renewal_count" integer NOT NULL DEFAULT 0,
  "last_renewed_at" bigint
);

CREATE TABLE IF NOT EXISTS "platform_auth_events" (
  "id" serial PRIMARY KEY,
  "event_id" text NOT NULL UNIQUE,
  "event_type" text NOT NULL,
  "user_id" text,
  "session_id" text,
  "occurred_at" bigint NOT NULL,
  "outcome" text NOT NULL,
  "metadata" text NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS "platform_sessions_user_idx" ON "platform_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "platform_sessions_expiry_idx" ON "platform_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "platform_auth_events_user_idx" ON "platform_auth_events" ("user_id");
CREATE INDEX IF NOT EXISTS "platform_auth_events_time_idx" ON "platform_auth_events" ("occurred_at");