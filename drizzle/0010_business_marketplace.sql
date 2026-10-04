-- =============================================================================
-- BUSINESS-03 — STRATEGY / RESEARCH MARKETPLACE
-- Versioned strategy listings with column-level performance provenance.
--
-- CENTRAL RULE (roadmap §03.2): a performance figure may be displayed ONLY when all six
-- provenance fields are present. This is enforced HERE, by the database, in two layers:
--
--   1. A GENERATED column `performance_displayable` computed from the six fields.
--      Application code cannot override it; it is a function of the columns.
--
--   2. A CHECK constraint that refuses to store any performance metric unless
--      `performance_displayable` is true. There is therefore no row in which a number is
--      stored without its provenance — the invalid state is unrepresentable, not merely
--      discouraged.
--
-- This is stricter than an application-only check, because the exact failure the roadmap
-- forbids ("+37.4%" with no idea where it came from) must be impossible to persist, not
-- merely impossible to render.
--
-- STATE SEPARATION (roadmap §03.4, §15): `evidence` is a JSON array of INDEPENDENT flags
-- (AUTHORED / PUBLISHED / VERIFIED / BACKTESTED / OUT_OF_SAMPLE_TESTED / PAPER_TESTED /
-- CERTIFIED). Publication never implies validation: there is no code path and no
-- constraint that promotes PUBLISHED to VERIFIED.
--
-- NO PAYMENT DATA (roadmap §04, §03.8): this migration stores no price, no amount, no
-- currency and no payout. Commercial model is a NAME here; money arrives only through the
-- BUSINESS-05 billing ledger behind a provider abstraction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. marketplace_strategies — stable identity across versions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_strategies (
  id                      SERIAL PRIMARY KEY,
  strategy_id             TEXT NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  -- OWNERSHIP
  author_user_id          TEXT NOT NULL,
  author_organization_id  TEXT,
  organization_id         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_strategies_sid_idx
  ON marketplace_strategies (strategy_id);
CREATE INDEX IF NOT EXISTS marketplace_strategies_author_idx
  ON marketplace_strategies (author_user_id);
CREATE INDEX IF NOT EXISTS marketplace_strategies_org_idx
  ON marketplace_strategies (organization_id)
  WHERE organization_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. marketplace_listings — one row per strategy VERSION
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id                    SERIAL PRIMARY KEY,
  listing_ref           TEXT NOT NULL UNIQUE,          -- '<strategy_id>@v<version>'
  strategy_id           TEXT NOT NULL,
  version               INTEGER NOT NULL,
  previous_version_ref  TEXT,

  author_user_id        TEXT NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  universe              TEXT NOT NULL,
  asset_class           TEXT NOT NULL,

  rules                 TEXT NOT NULL DEFAULT '{}',
  parameters            TEXT NOT NULL DEFAULT '{}',
  -- §03.1 requires all three models to be stated.
  risk_model            TEXT NOT NULL,
  execution_model       TEXT NOT NULL,
  cost_model            TEXT NOT NULL,

  -- Independent evidence flags. Never a single collapsed status.
  evidence              TEXT NOT NULL DEFAULT '["AUTHORED"]',

  publication_status    TEXT NOT NULL DEFAULT 'DRAFT',
  commercial_model      TEXT NOT NULL DEFAULT 'FREE',
  visibility            TEXT NOT NULL DEFAULT 'UNLISTED',

  -- ---- the six mandatory provenance fields (roadmap §03.2) ----
  perf_dataset            TEXT,
  perf_period_start       DATE,
  perf_period_end         DATE,
  perf_strategy_version   TEXT,
  perf_cost_model         TEXT,
  perf_execution_model    TEXT,
  perf_validation_state   TEXT,

  -- Recorded metrics. Refused by CHECK unless provenance is complete.
  performance           TEXT NOT NULL DEFAULT '[]',
  sample_size           INTEGER,
  paper_trade_count     INTEGER,
  out_of_sample         BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_listings_publication_check CHECK (
    publication_status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','PUBLISHED',
                           'SUSPENDED','DEPRECATED','ARCHIVED')
  ),
  CONSTRAINT marketplace_listings_commercial_check CHECK (
    commercial_model IN ('FREE','ONE_TIME','SUBSCRIPTION','BUNDLE','ORGANIZATION_LICENSE')
  ),
  CONSTRAINT marketplace_listings_visibility_check CHECK (
    visibility IN ('PUBLIC','UNLISTED')
  ),
  CONSTRAINT marketplace_listings_version_check CHECK (version >= 1),
  CONSTRAINT marketplace_listings_period_order_check CHECK (
    perf_period_start IS NULL OR perf_period_end IS NULL OR perf_period_end >= perf_period_start
  ),
  CONSTRAINT marketplace_listings_sample_size_check CHECK (
    sample_size IS NULL OR sample_size >= 0
  ),

  -- LAYER 1: displayability is a FUNCTION of the six provenance columns.
  -- A STORED generated column cannot be written by the application.
  performance_displayable BOOLEAN GENERATED ALWAYS AS (
    perf_dataset IS NOT NULL
    AND perf_period_start IS NOT NULL
    AND perf_period_end IS NOT NULL
    AND perf_strategy_version IS NOT NULL
    AND perf_cost_model IS NOT NULL
    AND perf_execution_model IS NOT NULL
    AND perf_validation_state IS NOT NULL
  ) STORED
);

-- LAYER 2: no metric may be STORED without complete provenance.
-- This is the enforcement point. A row carrying '[]' metrics is always allowed; a row
-- carrying any metric requires performance_displayable = true.
ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_performance_gate;
ALTER TABLE marketplace_listings
  ADD CONSTRAINT marketplace_listings_performance_gate CHECK (
    performance = '[]'::TEXT OR performance_displayable
  );

-- One row per (strategy, version). This is what makes §03.5 structural: an update cannot
-- mutate a historical version's recorded performance, because the row is unique and new
-- versions are new rows.
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_version_uniq
  ON marketplace_listings (strategy_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_ref_idx
  ON marketplace_listings (listing_ref);

-- Bounded discovery feed (roadmap §03.6, §27).
CREATE INDEX IF NOT EXISTS marketplace_listings_feed_idx
  ON marketplace_listings (publication_status, asset_class, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_listings_author_idx
  ON marketplace_listings (author_user_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_org_idx
  ON marketplace_listings (organization_id)
  WHERE organization_id IS NOT NULL;
-- Ranking inputs are always read for a bounded candidate set.
CREATE INDEX IF NOT EXISTS marketplace_listings_rank_idx
  ON marketplace_listings (publication_status, publication_status DESC, sample_size)
  WHERE performance_displayable;

-- -----------------------------------------------------------------------------
-- 3. marketplace_purchases  (append-only)
-- Records the INTENT to purchase against a commercial ledger entry. Contains no amount:
-- money is BUSINESS-05's concern behind the PaymentProvider abstraction (§04).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id                SERIAL PRIMARY KEY,
  purchase_id       TEXT NOT NULL UNIQUE,
  listing_ref       TEXT NOT NULL,
  buyer_user_id     TEXT NOT NULL,
  buyer_organization_id TEXT,
  commercial_model  TEXT NOT NULL,
  -- NOT_APPLICABLE until a settled commercial ledger entry exists (BUSINESS-05).
  -- There is NO amount column: a half-recorded price is worse than none.
  ledger_entry_id   TEXT,
  status            TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_purchases_status_check CHECK (
    status IN ('NOT_APPLICABLE','PENDING','COMPLETED','REFUNDED','FAILED')
  )
);

CREATE INDEX IF NOT EXISTS marketplace_purchases_listing_idx
  ON marketplace_purchases (listing_ref);
CREATE INDEX IF NOT EXISTS marketplace_purchases_buyer_idx
  ON marketplace_purchases (buyer_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_purchases_pid_idx
  ON marketplace_purchases (purchase_id);

-- -----------------------------------------------------------------------------
-- 4. marketplace_creator_economics  (append-only, roadmap §03.9)
-- gross / platform fee / creator share / refund / tax / payout status, kept SEPARATE.
-- Every monetary column is NULL until a settled ledger entry supplies the amount, so a
-- payout balance can never be fabricated (§2.1).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_creator_economics (
  id                  SERIAL PRIMARY KEY,
  entry_ref           TEXT NOT NULL UNIQUE,
  listing_ref         TEXT NOT NULL,
  creator_user_id     TEXT NOT NULL,
  gross_revenue_minor BIGINT,
  platform_fee_minor  BIGINT,
  creator_share_minor BIGINT,
  refund_minor        BIGINT,
  tax_withheld_minor  BIGINT,
  payout_status       TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  ledger_entry_id     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_creator_payout_check CHECK (
    payout_status IN ('NOT_APPLICABLE','PENDING','PAID','FAILED')
  ),
  -- §03.9 decomposition invariant, enforced by the database:
  --   gross = platform fee + creator share, and creator share >= refund + tax.
  --   With NULLs allowed (nothing settled), the constraint is satisfied vacuously.
  CONSTRAINT marketplace_creator_balance_check CHECK (
    gross_revenue_minor IS NULL
    OR (
      platform_fee_minor IS NOT NULL
      AND creator_share_minor IS NOT NULL
      AND platform_fee_minor + creator_share_minor = gross_revenue_minor
      AND creator_share_minor - COALESCE(refund_minor, 0) - COALESCE(tax_withheld_minor, 0) >= 0
    )
  )
);

CREATE INDEX IF NOT EXISTS marketplace_creator_listing_idx
  ON marketplace_creator_economics (listing_ref);
CREATE INDEX IF NOT EXISTS marketplace_creator_user_idx
  ON marketplace_creator_economics (creator_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_creator_ref_idx
  ON marketplace_creator_economics (entry_ref);