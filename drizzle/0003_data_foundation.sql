-- DATA FOUNDATION — 0003 DATA-01/02 PERSISTENCE
-- Additive migration. Creates ONLY the two Data Foundation tables.
-- Does NOT alter, drop, or repurpose any existing table.
-- Safe to run multiple times (IF NOT EXISTS).
-- Deterministic ordering: 0003 (after 0002_phase27_macro).
-- Mirrors src/db/schema.ts (instruments, corporateActionEvents) exactly.
-- No seed data: instruments are registered from the static universe + live
-- listings only; corporate actions from VSDC/HOSE/HNX/ISSUER only — never synthetic.

CREATE TABLE IF NOT EXISTS "instruments" (
  "id" serial PRIMARY KEY,
  "instrument_id" text NOT NULL UNIQUE,
  "symbol" text NOT NULL,
  "exchange" text NOT NULL,
  "asset_class" text NOT NULL,
  "currency" text DEFAULT 'VND' NOT NULL,
  "country" text DEFAULT 'VN' NOT NULL,
  "sector" text,
  "industry" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date,
  "isin" text,
  "previous_symbols" text DEFAULT '[]' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "instruments_id_idx" ON "instruments" ("instrument_id");
CREATE INDEX IF NOT EXISTS "instruments_symbol_idx" ON "instruments" ("symbol");
CREATE INDEX IF NOT EXISTS "instruments_status_idx" ON "instruments" ("status");
CREATE INDEX IF NOT EXISTS "instruments_valid_from_idx" ON "instruments" ("valid_from");

CREATE TABLE IF NOT EXISTS "corporate_action_events" (
  "id" serial PRIMARY KEY,
  "event_id" text NOT NULL UNIQUE,
  "instrument_id" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "announcement_date" date,
  "record_date" date,
  "ex_date" date,
  "payment_date" date,
  "effective_date" date,
  "ratio_old" numeric(18, 6),
  "ratio_new" numeric(18, 6),
  "cash_amount_vnd" numeric(18, 2),
  "issue_price_vnd" numeric(18, 2),
  "symbol_change_from" text,
  "symbol_change_to" text,
  "source" text NOT NULL,
  "source_tier" text NOT NULL,
  "data_version" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "cae_event_id_idx" ON "corporate_action_events" ("event_id");
CREATE INDEX IF NOT EXISTS "cae_instrument_idx" ON "corporate_action_events" ("instrument_id");
CREATE INDEX IF NOT EXISTS "cae_ex_date_idx" ON "corporate_action_events" ("ex_date");
CREATE INDEX IF NOT EXISTS "cae_kind_idx" ON "corporate_action_events" ("kind");
