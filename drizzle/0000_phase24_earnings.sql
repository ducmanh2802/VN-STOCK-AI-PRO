-- PHASE 24 — EARNINGS & FINANCIAL STATEMENTS INTELLIGENCE
-- Additive migration. Creates ONLY new tables/indexes.
-- It does NOT alter, drop, or repurpose any existing table (financial_statements,
-- financial_ratios, etc. remain untouched and authoritative for existing flows).
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "financial_facts_v2" (
  "id" serial PRIMARY KEY,
  "symbol" text NOT NULL,
  "metric" text NOT NULL,
  "statement_type" text NOT NULL,
  "report_type" text NOT NULL,
  "period_id" text NOT NULL,
  "period_type" text NOT NULL,
  "fiscal_year" integer NOT NULL,
  "quarter" integer,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "value" numeric(24, 4),
  "currency" text NOT NULL,
  "unit" text NOT NULL,
  "audited" boolean DEFAULT false NOT NULL,
  "audit_status" text NOT NULL,
  "restatement_status" text DEFAULT 'ORIGINAL' NOT NULL,
  "restatement_version" integer DEFAULT 0 NOT NULL,
  "report_id" text NOT NULL,
  "statement_id" text NOT NULL,
  "publication_date" date,
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "freshness" text NOT NULL,
  "validation_status" text NOT NULL,
  "unavailable_reason" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "fin_facts_v2_filing_idx"
  ON "financial_facts_v2" ("symbol", "statement_type", "report_type", "period_id", "metric", "source", "report_id", "publication_date");
CREATE INDEX IF NOT EXISTS "fin_facts_v2_symbol_period_idx"
  ON "financial_facts_v2" ("symbol", "period_id");

CREATE TABLE IF NOT EXISTS "earnings_calendar" (
  "id" serial PRIMARY KEY,
  "symbol" text NOT NULL,
  "period_id" text NOT NULL,
  "period_type" text NOT NULL,
  "fiscal_year" integer NOT NULL,
  "report_date" date,
  "status" text NOT NULL,
  "source" text,
  "source_tier" text,
  "publication_timestamp" timestamp,
  "freshness" text NOT NULL,
  "reason_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "earnings_calendar_symbol_period_source_idx"
  ON "earnings_calendar" ("symbol", "period_id", "source");
CREATE INDEX IF NOT EXISTS "earnings_calendar_symbol_idx"
  ON "earnings_calendar" ("symbol");
