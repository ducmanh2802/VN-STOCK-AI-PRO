-- RESEARCH — 0005 RESEARCH EXPERIMENTS + CERTIFICATIONS
-- Additive migration. Creates ONLY the two Research tables.
-- Does NOT alter, drop, or repurpose any existing table.
-- Safe to run multiple times (IF NOT EXISTS).
-- Deterministic ordering: 0005 (after 0004_decision_journal).
-- Mirrors src/db/schema.ts (researchExperiments, researchCertifications).
-- Append-only: onConflictDoNothing; verdicts never rewritten.

CREATE TABLE IF NOT EXISTS "research_experiments" (
  "id" serial PRIMARY KEY,
  "experiment_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "strategy" text NOT NULL,
  "strategy_version" text NOT NULL,
  "universe" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "data_version" text NOT NULL,
  "parameters" text NOT NULL,
  "seed" integer,
  "fingerprint" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "research_exp_id_idx" ON "research_experiments" ("experiment_id");
CREATE INDEX IF NOT EXISTS "research_exp_strategy_idx" ON "research_experiments" ("strategy");

CREATE TABLE IF NOT EXISTS "research_certifications" (
  "id" serial PRIMARY KEY,
  "experiment_id" text NOT NULL UNIQUE,
  "verdict" text NOT NULL,
  "manifest" text NOT NULL,
  "warnings" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "research_cert_exp_idx" ON "research_certifications" ("experiment_id");
CREATE INDEX IF NOT EXISTS "research_cert_verdict_idx" ON "research_certifications" ("verdict");
