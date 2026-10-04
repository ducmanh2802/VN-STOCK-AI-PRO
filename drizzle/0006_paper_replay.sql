-- PAPER REPLAY — 0006 PAPER-ONLY REPLAY JOURNAL
-- Additive migration. Creates ONLY the paper replay journal table.
-- Does NOT alter, drop, or repurpose any existing table.
-- Safe to run multiple times (IF NOT EXISTS).
-- Deterministic ordering: 0006 (after 0005_research).
-- Mirrors src/db/schema.ts (replayRuns) exactly.
-- PAPER ONLY: this table records simulated replays. No real-broker data,
-- credentials, or real orders are ever stored.

CREATE TABLE IF NOT EXISTS "replay_runs" (
  "id" serial PRIMARY KEY,
  "replay_id" text NOT NULL UNIQUE,
  "mode" text NOT NULL,
  "status" text NOT NULL,
  "manifest_fingerprint" text NOT NULL,
  "manifest" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "initial_capital" numeric(18, 2) NOT NULL,
  "final_nav" numeric(18, 2) NOT NULL,
  "return_pct" numeric(12, 6),
  "strategy_trade_count" integer DEFAULT 0 NOT NULL,
  "risk_rejection_count" integer DEFAULT 0 NOT NULL,
  "execution_rejection_count" integer DEFAULT 0 NOT NULL,
  "filled_quantity" integer DEFAULT 0 NOT NULL,
  "accounting_status" text NOT NULL,
  "reconciliation_status" text NOT NULL,
  "limitations" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "replay_runs_id_idx" ON "replay_runs" ("replay_id");
CREATE INDEX IF NOT EXISTS "replay_runs_status_idx" ON "replay_runs" ("status");
CREATE INDEX IF NOT EXISTS "replay_runs_mode_idx" ON "replay_runs" ("mode");