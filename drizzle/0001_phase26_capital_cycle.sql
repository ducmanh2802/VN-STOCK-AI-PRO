-- PHASE 26 — INDUSTRY CAPITAL CYCLE & POLICY INTELLIGENCE
-- Additive migration. Creates ONLY the four Phase 26 tables. It does NOT alter,
-- drop, or repurpose any existing table. Safe to run multiple times
-- (IF NOT EXISTS). Deterministic ordering: 0001 (after 0000_phase24_earnings).
--
-- These tables mirror src/db/schema.ts (policyEvents, strategicProjects,
-- projectBeneficiaries, legalGovernanceEvents) exactly. No seed data is inserted.

CREATE TABLE IF NOT EXISTS "policy_events" (
  "id" serial PRIMARY KEY,
  "policy_event_id" text NOT NULL UNIQUE,
  "document_number" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "issuing_authority" text NOT NULL,
  "policy_type" text NOT NULL,
  "status" text NOT NULL,
  "target_sectors" text NOT NULL,
  "target_investment_vnd" numeric(24, 2),
  "funding_mechanism" text,
  "geographic_scope" text NOT NULL,
  "announcement_date" date NOT NULL,
  "effective_date" date,
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "source_url" text,
  "publication_date" date NOT NULL,
  "freshness" text NOT NULL,
  "validation_status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "policy_events_id_idx" ON "policy_events" ("policy_event_id");
CREATE INDEX IF NOT EXISTS "policy_events_doc_idx" ON "policy_events" ("document_number");
CREATE INDEX IF NOT EXISTS "policy_events_ann_idx" ON "policy_events" ("announcement_date");

CREATE TABLE IF NOT EXISTS "strategic_projects" (
  "id" serial PRIMARY KEY,
  "project_id" text NOT NULL UNIQUE,
  "project_code" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "primary_sector_id" text NOT NULL,
  "location_provinces" text,
  "project_status" text NOT NULL,
  "estimated_investment_vnd" numeric(24, 2),
  "approved_investment_vnd" numeric(24, 2),
  "funding_source" text,
  "owner" text,
  "contracting_authority" text,
  "start_date_planned" date,
  "expected_completion_date" date,
  "actual_completion_date" date,
  "delay_months" integer DEFAULT 0,
  "progress_percent" numeric(5, 2),
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "source_url" text,
  "publication_date" date,
  "freshness" text NOT NULL,
  "validation_status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "strategic_projects_id_idx" ON "strategic_projects" ("project_id");
CREATE INDEX IF NOT EXISTS "strategic_projects_code_idx" ON "strategic_projects" ("project_code");
CREATE INDEX IF NOT EXISTS "strategic_projects_sector_idx" ON "strategic_projects" ("primary_sector_id");

CREATE TABLE IF NOT EXISTS "project_beneficiaries" (
  "id" serial PRIMARY KEY,
  "relationship_id" text NOT NULL UNIQUE,
  "project_id" text NOT NULL,
  "symbol" text NOT NULL,
  "company_name" text NOT NULL,
  "role" text NOT NULL,
  "evidence_tier" text NOT NULL,
  "contract_package_code" text,
  "contract_value_vnd" numeric(24, 2),
  "confirmed_backlog_share_vnd" numeric(24, 2),
  "award_date" date,
  "execution_period_months" integer,
  "is_confirmed_beneficiary" boolean DEFAULT false NOT NULL,
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "source_url" text,
  "publication_date" date,
  "freshness" text NOT NULL,
  "validation_status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "proj_beneficiaries_rel_idx" ON "project_beneficiaries" ("relationship_id");
CREATE INDEX IF NOT EXISTS "proj_beneficiaries_proj_idx" ON "project_beneficiaries" ("project_id");
CREATE INDEX IF NOT EXISTS "proj_beneficiaries_sym_idx" ON "project_beneficiaries" ("symbol");

CREATE TABLE IF NOT EXISTS "legal_governance_events" (
  "id" serial PRIMARY KEY,
  "event_id" text NOT NULL UNIQUE,
  "symbol" text NOT NULL,
  "company_name" text NOT NULL,
  "event_type" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "authority" text NOT NULL,
  "official_document_number" text,
  "affected_person_name" text,
  "affected_person_role" text,
  "fine_amount_vnd" numeric(18, 2),
  "event_date" date NOT NULL,
  "announcement_date" date NOT NULL,
  "effective_date" date,
  "status" text NOT NULL,
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "source_url" text,
  "publication_date" date,
  "freshness" text NOT NULL,
  "validation_status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "legal_gov_events_id_idx" ON "legal_governance_events" ("event_id");
CREATE INDEX IF NOT EXISTS "legal_gov_events_sym_idx" ON "legal_governance_events" ("symbol");
CREATE INDEX IF NOT EXISTS "legal_gov_events_date_idx" ON "legal_governance_events" ("event_date");
CREATE INDEX IF NOT EXISTS "legal_gov_events_sev_idx" ON "legal_governance_events" ("severity");
