-- P0-04 REMEDIATION — CANONICAL MARKET DATA PERSISTENCE
-- =====================================================
-- Closes the P0-04 gap: "canonical bars, provenance and quality have no table".
-- Additive migration. Creates ONLY new Data Foundation tables.
-- Does NOT alter, drop, or repurpose any existing table (instruments and
-- corporate_action_events from 0003 are untouched).
-- Safe to run multiple times (IF NOT EXISTS).
--
-- MIGRATION ID RESERVATION (§20)
--   Existing IDs: 0000 .. 0012 (contiguous, zero-padded 4-digit).
--   0013 is the first genuinely unused ID. No concurrent lane owns it: the
--   BUSINESS-06 lane works in src/services/business06 and
--   src/lib/db/business06 (in-memory ports) and created no drizzle file.
--   Already-applied migrations 0000-0012 are NOT modified.
--
-- IDENTITY MODEL (§15)
--   The system already defines a canonical instrument identity
--   (instruments.instrument_id, see 0003). Ticker text is NOT the primary
--   key: every bar is keyed by (instrument_id, source, bar_time, version).
--   `symbol` is stored only as a denormalised, non-authoritative convenience
--   column for operational queries and is NOT part of any uniqueness rule.
--
-- POINT-IN-TIME SAFETY (§19)
--   observation_time  = when the source says the market event happened
--   publication_time  = when the source published the observation
--   effective_time    = when the observation became usable for decisions
--   ingested_at       = when this system wrote the row
--   Every historical read filters on effective_time <= asOf so a query can
--   never see data that was not yet knowable at the requested as-of instant.
--
-- PROVENANCE (§16)
--   No canonical bar may appear from nowhere: source, source_record_id,
--   observation/publication/ingestion timestamps, provider and data_version
--   are all NOT NULL, and provenance is stored on the bar row itself so it
--   survives restart.
--
-- QUALITY (§17)
--   explicit quality_state in VALID | STALE | INVALID | UNAVAILABLE, plus the
--   deterministic reasons that produced it. Deterministic repairs are allowed
--   only through the recorded `transform_version` + `transform_note` pair.
--
-- MULTI-SOURCE (§18)
--   source is part of the primary key, so KBS, VPS and VNDIRECT observations
--   coexist. There is no synthetic fallback row: `is_synthetic` exists solely to
--   make any synthetic row loudly detectable, and the repository refuses to
--   write one.

-- ---------------------------------------------------------------------------
-- 1. CANONICAL DAILY BARS  (the historical bar substrate)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "canonical_market_bars" (
  "id" serial PRIMARY KEY,
  "bar_key" text NOT NULL UNIQUE,
  "instrument_id" text NOT NULL,
  "symbol" text NOT NULL,
  "exchange" text NOT NULL,
  "timeframe" text NOT NULL DEFAULT '1D',
  "bar_time" timestamp NOT NULL,
  "trading_date" date NOT NULL,
  "open" numeric(18, 4),
  "high" numeric(18, 4),
  "low" numeric(18, 4),
  "close" numeric(18, 4),
  "reference_price" numeric(18, 4),
  "ceiling_price" numeric(18, 4),
  "floor_price" numeric(18, 4),
  "volume" numeric(24, 2),
  "turnover_vnd" numeric(24, 2),
  -- adjustment state
  "adjustment_state" text NOT NULL DEFAULT 'RAW',
  "adjustment_factor" numeric(20, 10),
  -- provenance (NOT NULL: no bar may appear from nowhere)
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "source_record_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_version" text,
  "observation_time" timestamp NOT NULL,
  "publication_time" timestamp,
  "effective_time" timestamp NOT NULL,
  "ingested_at" timestamp NOT NULL DEFAULT now(),
  "data_version" text NOT NULL,
  -- quality
  "quality_state" text NOT NULL DEFAULT 'VALID',
  "quality_reason" text,
  "quality_detail" text,
  "transform_version" text,
  "transform_note" text,
  "is_synthetic" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "cmb_bar_key_idx" ON "canonical_market_bars" ("bar_key");
CREATE INDEX IF NOT EXISTS "cmb_instrument_date_idx" ON "canonical_market_bars" ("instrument_id", "trading_date");
CREATE INDEX IF NOT EXISTS "cmb_source_idx" ON "canonical_market_bars" ("source");
CREATE INDEX IF NOT EXISTS "cmb_quality_idx" ON "canonical_market_bars" ("quality_state");
CREATE INDEX IF NOT EXISTS "cmb_effective_idx" ON "canonical_market_bars" ("effective_time");
CREATE INDEX IF NOT EXISTS "cmb_ingested_idx" ON "canonical_market_bars" ("ingested_at");

-- ---------------------------------------------------------------------------
-- 2. CANONICAL DATA PROVENANCE  (append-only lineage ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "canonical_data_provenance" (
  "id" serial PRIMARY KEY,
  "provenance_id" text NOT NULL UNIQUE,
  "bar_key" text NOT NULL,
  "instrument_id" text NOT NULL,
  "source" text NOT NULL,
  "source_record_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_version" text,
  "source_url" text,
  "observation_time" timestamp NOT NULL,
  "publication_time" timestamp,
  "effective_time" timestamp NOT NULL,
  "ingested_at" timestamp NOT NULL DEFAULT now(),
  "data_version" text NOT NULL,
  "payload_checksum" text,
  "raw_excerpt" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "cdp_provenance_id_idx" ON "canonical_data_provenance" ("provenance_id");
CREATE INDEX IF NOT EXISTS "cdp_bar_key_idx" ON "canonical_data_provenance" ("bar_key");
CREATE INDEX IF NOT EXISTS "cdp_source_idx" ON "canonical_data_provenance" ("source");
CREATE INDEX IF NOT EXISTS "cdp_effective_idx" ON "canonical_data_provenance" ("effective_time");

-- ---------------------------------------------------------------------------
-- 3. CANONICAL DATA QUALITY  (explicit quality observations per bar version)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "canonical_data_quality" (
  "id" serial PRIMARY KEY,
  "quality_id" text NOT NULL UNIQUE,
  "bar_key" text NOT NULL,
  "instrument_id" text NOT NULL,
  "trading_date" date NOT NULL,
  "source" text NOT NULL,
  "quality_state" text NOT NULL,
  "reason_code" text,
  "detail" text,
  "checked_rule_version" text NOT NULL,
  "source_values" text,
  "resolved_values" text,
  "evaluated_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "cdq_quality_id_idx" ON "canonical_data_quality" ("quality_id");
CREATE INDEX IF NOT EXISTS "cdq_bar_key_idx" ON "canonical_data_quality" ("bar_key");
CREATE INDEX IF NOT EXISTS "cdq_instrument_date_idx" ON "canonical_data_quality" ("instrument_id", "trading_date");
CREATE INDEX IF NOT EXISTS "cdq_state_idx" ON "canonical_data_quality" ("quality_state");

-- ---------------------------------------------------------------------------
-- 4. CROSS-SOURCE AGREEMENT  (§18 multi-source disagreement is recorded,
--    never silently resolved by picking a convenient number)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "canonical_source_agreement" (
  "id" serial PRIMARY KEY,
  "instrument_id" text NOT NULL,
  "trading_date" date NOT NULL,
  "timeframe" text NOT NULL DEFAULT '1D',
  "primary_source" text NOT NULL,
  "compared_source" text NOT NULL,
  "primary_close" numeric(18, 4) NOT NULL,
  "compared_close" numeric(18, 4) NOT NULL,
  "deviation_percent" numeric(12, 6) NOT NULL,
  "tolerance_percent" numeric(12, 6) NOT NULL,
  "agreement_state" text NOT NULL,
  "detail" text,
  "evaluated_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "csa_agreement_key_idx"
  ON "canonical_source_agreement" ("instrument_id", "trading_date", "timeframe", "compared_source");
CREATE INDEX IF NOT EXISTS "csa_instrument_date_idx"
  ON "canonical_source_agreement" ("instrument_id", "trading_date");
CREATE INDEX IF NOT EXISTS "csa_state_idx" ON "canonical_source_agreement" ("agreement_state");
