-- DECISION OS — 0004 DECISION JOURNAL PERSISTENCE
-- Additive migration. Creates ONLY the two Decision OS journal tables.
-- Does NOT alter, drop, or repurpose any existing table.
-- Safe to run multiple times (IF NOT EXISTS).
-- Deterministic ordering: 0004 (after 0003_data_foundation).
-- Mirrors src/db/schema.ts (decisionJournal, decisionReviews) exactly.
-- Append-only: inserts use onConflictDoNothing; history is never rewritten.

CREATE TABLE IF NOT EXISTS "decision_journal" (
  "id" serial PRIMARY KEY,
  "decision_id" text NOT NULL UNIQUE,
  "instrument_id" text NOT NULL,
  "as_of_date" date NOT NULL,
  "decision_type" text NOT NULL,
  "decision_status" text NOT NULL,
  "evidence" text NOT NULL,
  "thesis_id" text,
  "confidence" numeric(5, 2),
  "data_quality" text NOT NULL,
  "provenance" text NOT NULL,
  "fail_code" text,
  "notes" text NOT NULL,
  "version" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "decision_journal_id_idx" ON "decision_journal" ("decision_id");
CREATE INDEX IF NOT EXISTS "decision_journal_instrument_idx" ON "decision_journal" ("instrument_id");
CREATE INDEX IF NOT EXISTS "decision_journal_asof_idx" ON "decision_journal" ("as_of_date");

CREATE TABLE IF NOT EXISTS "decision_reviews" (
  "id" serial PRIMARY KEY,
  "review_id" text NOT NULL UNIQUE,
  "decision_id" text NOT NULL,
  "original_decision" text NOT NULL,
  "original_evidence" text NOT NULL,
  "actual_outcome" text,
  "what_changed" text NOT NULL,
  "what_was_correct" text NOT NULL,
  "what_was_wrong" text NOT NULL,
  "lessons" text NOT NULL,
  "new_decision" text,
  "reviewed_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "decision_reviews_id_idx" ON "decision_reviews" ("review_id");
CREATE INDEX IF NOT EXISTS "decision_reviews_decision_idx" ON "decision_reviews" ("decision_id");
