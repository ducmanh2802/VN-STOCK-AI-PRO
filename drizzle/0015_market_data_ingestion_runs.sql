-- 0015 — MARKET DATA INGESTION RUN LEDGER
-- ============================================================================
-- Records every end-of-day / backfill ingestion run and the outcome for each symbol,
-- so completeness is measured and auditable instead of assumed:
--   expected symbols, symbols with the target session's bar, missing, failed,
--   and the last run that actually completed.
-- A partial load is recorded as PARTIAL, never as COMPLETE.
--
-- At most one RUNNING row per job (partial unique index) — a second concurrent run
-- cannot register itself even if it bypassed the advisory lock.
-- Additive only: two new tables, nothing else is touched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "market_data_ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"job" text NOT NULL,
	"mode" text NOT NULL,
	"target_session" date,
	"range_from" date NOT NULL,
	"range_to" date NOT NULL,
	"status" text NOT NULL,
	"expected_symbols" integer NOT NULL,
	"complete_symbols" integer DEFAULT 0 NOT NULL,
	"missing_symbols" integer DEFAULT 0 NOT NULL,
	"failed_symbols" integer DEFAULT 0 NOT NULL,
	"bars_inserted" integer DEFAULT 0 NOT NULL,
	"bars_duplicate" integer DEFAULT 0 NOT NULL,
	"bars_rejected" integer DEFAULT 0 NOT NULL,
	"detail" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "market_data_ingestion_runs_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "mdir_mode_check" CHECK ("mode" IN ('SCHEDULED', 'BACKFILL', 'MANUAL')),
	CONSTRAINT "mdir_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS "market_data_ingestion_symbol_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"symbol" text NOT NULL,
	"instrument_id" text NOT NULL,
	"outcome" text NOT NULL,
	"attempts" integer NOT NULL,
	"bars_received" integer DEFAULT 0 NOT NULL,
	"bars_inserted" integer DEFAULT 0 NOT NULL,
	"bars_duplicate" integer DEFAULT 0 NOT NULL,
	"bars_rejected" integer DEFAULT 0 NOT NULL,
	"withheld_in_progress" integer DEFAULT 0 NOT NULL,
	"missing_sessions" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"detail" text,
	"finished_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mdisr_outcome_check" CHECK ("outcome" IN ('COMPLETE', 'MISSING', 'FAILED'))
);

DO $$ BEGIN
 ALTER TABLE "market_data_ingestion_symbol_results" ADD CONSTRAINT "mdisr_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."market_data_ingestion_runs"("run_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "mdir_one_running_per_job_idx" ON "market_data_ingestion_runs" USING btree ("job") WHERE "status" = 'RUNNING';
CREATE INDEX IF NOT EXISTS "mdir_job_started_idx" ON "market_data_ingestion_runs" USING btree ("job", "started_at");
CREATE UNIQUE INDEX IF NOT EXISTS "mdisr_run_symbol_idx" ON "market_data_ingestion_symbol_results" USING btree ("run_id", "symbol");
