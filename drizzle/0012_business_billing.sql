-- =============================================================================
-- BUSINESS-05 — BILLING / ENTITLEMENT / COMMERCIAL AUDIT
--
-- COMMERCIAL LEDGER BOUNDARY (roadmap §05.6) — read before adding a column.
--
--   INVESTMENT accounting (trading lane): cash, position, NAV, P&L, fees, fills, orders.
--   COMMERCIAL accounting (this file):      invoice, payment, refund, credit,
--                                           platform fee, creator share.
--
--   These are separate accounting domains and must never cross-contaminate. This migration
--   creates no FK to any investment table and there is NO position, quantity, price, NAV,
--   fill or order column. There is no code path from this lane to the investment ledger:
--   `src/lib/business/**` has zero imports from `src/lib/trading/**`.
--
-- REAL MONEY BOUNDARY (roadmap §04)
--   No payment provider exists in this repository. Amount columns are therefore NULL by
--   default and CHECK-constrained to require an explicit `money_source` and, for provider
--   amounts, an explicit provider. A monetary value cannot be written without declaring where
--   it came from — which is the §2.1 anti-fabrication rule at the schema level.
--
-- IDEMPOTENCY (§05.4) — three UNIQUE constraints, each load-bearing:
--   business_commercial_payments.idempotency_key  → no duplicate payment
--   business_commercial_ledger.causation_id       → no duplicate economic effect
--   business_webhook_records.event_id             → no duplicate webhook processing
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. business_commercial_payments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_commercial_payments (
  id               SERIAL PRIMARY KEY,
  payment_id       TEXT NOT NULL UNIQUE,
  -- GLOBAL UNIQUE. A retried charge cannot create a second payment row.
  idempotency_key  TEXT NOT NULL UNIQUE,
  provider         TEXT NOT NULL,
  provider_ref     TEXT,
  subject_id       TEXT NOT NULL,
  organization_id  TEXT,
  plan_id          TEXT NOT NULL,

  -- PAYMENT_PENDING | PAYMENT_SUCCEEDED | PAYMENT_FAILED | PAYMENT_REFUNDED
  -- | PAYMENT_CANCELLED | PAYMENT_UNKNOWN
  status           TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',

  -- Integer minor units only. There is no float money column in this schema.
  amount_minor     BIGINT,
  currency         TEXT,

  -- TEST | SANDBOX | PRODUCTION. Written explicitly, never inferred.
  environment      TEXT NOT NULL DEFAULT 'SANDBOX',

  correlation_id   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_payments_status_check CHECK (
    status IN ('PAYMENT_PENDING','PAYMENT_SUCCEEDED','PAYMENT_FAILED',
               'PAYMENT_REFUNDED','PAYMENT_CANCELLED','PAYMENT_UNKNOWN')
  ),
  CONSTRAINT business_payments_environment_check CHECK (
    environment IN ('TEST','SANDBOX','PRODUCTION')
  ),
  CONSTRAINT business_payments_currency_check CHECK (
    currency IS NULL OR currency ~ '^[A-Z]{3}$'
  ),
  -- An amount is all-or-nothing: minor units and currency appear together.
  CONSTRAINT business_payments_amount_pair_check CHECK (
    (amount_minor IS NULL AND currency IS NULL)
    OR (amount_minor IS NOT NULL AND currency IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS business_payments_pid_idx
  ON business_commercial_payments (payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_payments_idem_idx
  ON business_commercial_payments (idempotency_key);
CREATE INDEX IF NOT EXISTS business_payments_subject_idx
  ON business_commercial_payments (subject_id);
CREATE INDEX IF NOT EXISTS business_payments_status_idx
  ON business_commercial_payments (status);
CREATE INDEX IF NOT EXISTS business_payments_provider_ref_idx
  ON business_commercial_payments (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. business_commercial_ledger  (append-only)
--
--   NO UPDATE, NO DELETE, ever. A correction is a new pair of entries.
--
--   money_source / amount coupling is the anti-fabrication constraint:
--     amount IS NULL  <=>  money_source = 'NONE'
--     money_source = 'PROVIDER_REPORTED' => provider IS NOT NULL
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_commercial_ledger (
  id              BIGSERIAL PRIMARY KEY,
  entry_id        TEXT NOT NULL UNIQUE,
  -- The natural idempotency key of one economic effect. GLOBAL UNIQUE (§05.4).
  causation_id    TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  subject_id      TEXT NOT NULL,
  organization_id TEXT,
  reference       TEXT NOT NULL,

  amount_minor    BIGINT,
  currency        TEXT,
  -- PROVIDER_REPORTED | OPERATOR_ADJUSTMENT | NONE
  money_source    TEXT NOT NULL DEFAULT 'NONE',
  provider        TEXT,
  provider_ref    TEXT,
  environment     TEXT NOT NULL DEFAULT 'SANDBOX',
  correlation_id  TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Commercial kinds ONLY. An investment concept can never be written here (§05.6).
  CONSTRAINT business_ledger_kind_check CHECK (
    kind IN ('INVOICE_ISSUED','INVOICE_VOID','PAYMENT_RECORDED','PAYMENT_FAILED',
             'PAYMENT_UNKNOWN','REFUND_ISSUED','CREDIT_ISSUED','PLATFORM_FEE',
             'CREATOR_SHARE','CREATOR_PAYOUT','STATE_CHANGE')
  ),
  -- §2.1 / §4: money can never be unsourced, and a "source" can never be empty.
  CONSTRAINT business_ledger_money_check CHECK (
    (amount_minor IS NULL AND money_source = 'NONE')
    OR (amount_minor IS NOT NULL AND money_source IN ('PROVIDER_REPORTED','OPERATOR_ADJUSTMENT'))
  ),
  CONSTRAINT business_ledger_provider_check CHECK (
    money_source <> 'PROVIDER_REPORTED' OR provider IS NOT NULL
  ),
  CONSTRAINT business_ledger_amount_pair_check CHECK (
    (amount_minor IS NULL AND currency IS NULL)
    OR (amount_minor IS NOT NULL AND currency IS NOT NULL AND currency ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT business_ledger_environment_check CHECK (
    environment IN ('TEST','SANDBOX','PRODUCTION')
  ),
  CONSTRAINT business_ledger_reason_check CHECK (length(reason) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_ledger_eid_idx
  ON business_commercial_ledger (entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_ledger_causation_idx
  ON business_commercial_ledger (causation_id);
CREATE INDEX IF NOT EXISTS business_ledger_subject_idx
  ON business_commercial_ledger (subject_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_ledger_reference_idx
  ON business_commercial_ledger (reference);
CREATE INDEX IF NOT EXISTS business_ledger_kind_idx
  ON business_commercial_ledger (kind);

-- -----------------------------------------------------------------------------
-- 3. business_webhook_records
--
--   event_id is GLOBAL UNIQUE: the replay defence. A provider retry is recognised as a
--   duplicate and NO second economic effect is applied. This is the mechanism behind the
--   roadmap's "duplicate webhook => one economic effect" property.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_webhook_records (
  id             BIGSERIAL PRIMARY KEY,
  event_id       TEXT NOT NULL UNIQUE,
  provider       TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  -- RECEIVED | VALIDATED | PROCESSING | PROCESSED | FAILED | RETRY_REQUIRED
  state          TEXT NOT NULL DEFAULT 'RECEIVED',
  failure_reason TEXT,
  -- The single named economic effect applied. NULL when none was applied.
  applied_effect TEXT,
  -- Digest of the raw signed body, for dispute resolution. Never the body itself and never
  -- a signature: a signature is a credential-shaped value and is not persisted.
  payload_digest TEXT,
  received_at    TIMESTAMPTZ NOT NULL,
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_webhook_state_check CHECK (
    state IN ('RECEIVED','VALIDATED','PROCESSING','PROCESSED','FAILED','RETRY_REQUIRED')
  ),
  -- A PROCESSED record must name the effect it applied; otherwise "processed" is unfalsifiable.
  CONSTRAINT business_webhook_effect_check CHECK (
    state <> 'PROCESSED' OR applied_effect IS NOT NULL
  ),
  -- A FAILED record must say why.
  CONSTRAINT business_webhook_failure_check CHECK (
    state <> 'FAILED' OR failure_reason IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS business_webhook_eid_idx
  ON business_webhook_records (event_id);
CREATE INDEX IF NOT EXISTS business_webhook_state_idx
  ON business_webhook_records (state);
CREATE INDEX IF NOT EXISTS business_webhook_provider_idx
  ON business_webhook_records (provider, received_at DESC);

-- -----------------------------------------------------------------------------
-- 4. business_reconciliation_findings  (append-only)
--
--   §05.7: inconsistencies become EXPLICIT reconciliation states, and are never silently
--   repaired. This table records findings. It has NO write path to a subscription, a payment
--   or an entitlement — repair is a separate, operator-initiated, audited action.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_reconciliation_findings (
  id               BIGSERIAL PRIMARY KEY,
  finding_id       TEXT NOT NULL UNIQUE,
  code             TEXT NOT NULL,
  severity         TEXT NOT NULL,
  subject_id       TEXT NOT NULL,
  reference        TEXT NOT NULL,
  detail           TEXT NOT NULL,
  -- JSON object of observed key/value strings. Contains no credentials.
  observed         TEXT NOT NULL DEFAULT '{}',
  -- What a human must decide. A finding without a required action is not actionable.
  required_action  TEXT NOT NULL,
  resolved_at      TIMESTAMPTZ,
  resolved_by      TEXT,
  resolution_note  TEXT,
  detected_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_reconciliation_code_check CHECK (
    code IN ('SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN',
             'PAYMENT_SETTLED_ENTITLEMENT_MISSING',
             'ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED',
             'PAYMENT_FAILED_SUBSCRIPTION_STILL_ENTITLING',
             'REFUNDED_SUBSCRIPTION_STILL_ENTITLING',
             'SUBSCRIPTION_STATUS_INVALID',
             'LEDGER_INVARIANT_VIOLATION')
  ),
  CONSTRAINT business_reconciliation_severity_check CHECK (severity IN ('P0','P1','P2')),
  -- An unresolved P0 must not be closed with a note that omits who did it.
  CONSTRAINT business_reconciliation_resolution_check CHECK (
    resolved_at IS NULL OR (resolved_by IS NOT NULL AND resolution_note IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS business_reconciliation_fid_idx
  ON business_reconciliation_findings (finding_id);
-- Bounded operator queue: unresolved findings, worst first.
CREATE INDEX IF NOT EXISTS business_reconciliation_queue_idx
  ON business_reconciliation_findings (severity, detected_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS business_reconciliation_subject_idx
  ON business_reconciliation_findings (subject_id);