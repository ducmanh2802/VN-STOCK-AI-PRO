-- PHASE 27 — MACRO REGIME & ECONOMIC CYCLE INTELLIGENCE
-- Additive migration. Creates ONLY the two Phase 27 macro tables. It does NOT
-- alter, drop, or repurpose any existing table. Safe to run multiple times
-- (IF NOT EXISTS). Deterministic ordering: 0002 (after 0001_phase26_capital_cycle).
--
-- These tables mirror src/db/schema.ts (macroObservations, macroRegimeSnapshots)
-- exactly. No seed data is inserted: macro values are real statutory observations
-- ingested from authoritative feeds only — never frozen samples.

CREATE TABLE IF NOT EXISTS "macro_observations" (
  "id" serial PRIMARY KEY,
  "metric_code" text NOT NULL,
  "observation_date" date NOT NULL,
  "publication_date" date NOT NULL,
  "retrieval_date" date NOT NULL,
  "value" numeric(18, 4),
  "unit" text NOT NULL,
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "revision_version" integer DEFAULT 0 NOT NULL,
  "frequency" text NOT NULL,
  "period_id" text,
  "validation_status" text NOT NULL,
  "freshness_status" text NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "macro_obs_metric_obsdate_rev_idx"
  ON "macro_observations" ("metric_code", "observation_date", "revision_version");
CREATE INDEX IF NOT EXISTS "macro_obs_metric_obsdate_idx"
  ON "macro_observations" ("metric_code", "observation_date");
CREATE INDEX IF NOT EXISTS "macro_obs_metric_pubdate_idx"
  ON "macro_observations" ("metric_code", "publication_date");

CREATE TABLE IF NOT EXISTS "macro_regime_snapshots" (
  "id" serial PRIMARY KEY,
  "snapshot_id" text NOT NULL UNIQUE,
  "as_of_date" date NOT NULL,
  "publication_cutoff_date" date NOT NULL,
  "evaluated_at" timestamp NOT NULL,
  "macro_regime" text NOT NULL,
  "growth_state" text NOT NULL,
  "inflation_state" text NOT NULL,
  "monetary_state" text NOT NULL,
  "external_sector_state" text NOT NULL,
  "financial_conditions_state" text NOT NULL,
  "data_coverage" text NOT NULL,
  "confidence_percent" numeric(5, 2) NOT NULL,
  "classification_version" text NOT NULL,
  "diagnostics" text,
  "transition" text,
  "rationale_vi" text,
  "data_freshness" text NOT NULL,
  "lookahead_rejected" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "macro_regime_snapshots_id_idx"
  ON "macro_regime_snapshots" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "macro_regime_snapshots_date_idx"
  ON "macro_regime_snapshots" ("as_of_date");
CREATE INDEX IF NOT EXISTS "macro_regime_snapshots_regime_idx"
  ON "macro_regime_snapshots" ("macro_regime");
