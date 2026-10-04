-- =============================================================================
-- BUSINESS-04 — ORGANIZATION / WORKSPACE / SEATS
-- Turns the platform into an organization-ready product (roadmap §04).
--
-- ROLE SYSTEM BOUNDARY (roadmap §04.1, §04.4)
--   This migration introduces NO authentication role. PLATFORM owns identity and roles.
--   `business_org_memberships.role` is a RESOURCE-SCOPING role — "what may this person do
--   inside this organization" — and is evaluated only after PLATFORM has established who
--   the principal is. It is not a second role system and it never authenticates anybody.
--
-- CONCURRENCY SAFETY (roadmap §04.6) — the load-bearing constraint of this migration:
--
--   CREATE UNIQUE INDEX business_org_seats_active_assignment
--     ON business_org_seats (organization_id, assigned_user_id)
--     WHERE status = 'ASSIGNED' AND assigned_user_id IS NOT NULL;
--
--   Two concurrent "assign the last seat" requests race in application code no matter how
--   carefully the handler is written. This partial unique index makes the losing write FAIL
--   at the database, under any interleaving, in any number of processes. Application-level
--   counting alone would be a race; this is what actually closes it.
--
--   The paired CHECK (an ASSIGNED seat must name a user; an unassigned seat must not) makes
--   seat-table drift unrepresentable, so `seatConsistency()` can never observe a row it did
--   not create.
--
-- NO FINANCIAL DATA (roadmap §05.6): no cash, no positions, no NAV, no P&L, no invoice
-- amounts. `plan_id` names a tier; the commercial ledger is BUSINESS-05's concern.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. business_organizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_organizations (
  id                SERIAL PRIMARY KEY,
  organization_id   TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  -- ACTIVE | SUSPENDED | CLOSING | CLOSED
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  -- The commercial subject for the whole organization. Matches
  -- business_subscriptions.subject_id for ORGANIZATION subjects.
  subject_id        TEXT NOT NULL,
  plan_id           TEXT NOT NULL,
  plan_fingerprint  TEXT NOT NULL,
  correlation_id    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_organizations_status_check CHECK (
    status IN ('ACTIVE','SUSPENDED','CLOSING','CLOSED')
  ),
  -- Subject id and organization id are the same value by construction. This makes it
  -- impossible for an organization row to point at a foreign commercial subject.
  CONSTRAINT business_organizations_subject_check CHECK (subject_id = organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_organizations_oid_idx
  ON business_organizations (organization_id);
CREATE INDEX IF NOT EXISTS business_organizations_status_idx
  ON business_organizations (status);

-- -----------------------------------------------------------------------------
-- 2. business_org_memberships  (append-changed)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_org_memberships (
  id             SERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  -- RESOURCE-SCOPING role, not an authentication role.
  role            TEXT NOT NULL DEFAULT 'VIEWER',
  -- ACTIVE | SUSPENDED | REVOKED | PENDING
  status          TEXT NOT NULL DEFAULT 'PENDING',
  seat_id         TEXT,
  correlation_id  TEXT,
  joined_at       TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,

  CONSTRAINT business_org_memberships_role_check CHECK (
    role IN ('OWNER','ADMIN','RESEARCHER','VIEWER','TRAINING_ADMIN','INSTRUCTOR')
  ),
  CONSTRAINT business_org_memberships_status_check CHECK (
    status IN ('ACTIVE','SUSPENDED','REVOKED','PENDING')
  )
);

-- One membership per (organization, user). A duplicate membership row would let the seat
-- count and the member count disagree.
CREATE UNIQUE INDEX IF NOT EXISTS business_org_memberships_uniq
  ON business_org_memberships (organization_id, user_id);
CREATE INDEX IF NOT EXISTS business_org_memberships_user_idx
  ON business_org_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS business_org_memberships_org_status_idx
  ON business_org_memberships (organization_id, status);

-- -----------------------------------------------------------------------------
-- 3. business_org_workspaces
-- A workspace belongs to exactly one organization. There is no join table by design:
-- a many-to-many workspace would make cross-organization leakage a matter of one query bug.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_org_workspaces (
  id              SERIAL PRIMARY KEY,
  workspace_id    TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_org_workspaces_status_check CHECK (status IN ('ACTIVE','ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS business_org_workspaces_wid_idx
  ON business_org_workspaces (workspace_id);
CREATE INDEX IF NOT EXISTS business_org_workspaces_org_idx
  ON business_org_workspaces (organization_id);

-- -----------------------------------------------------------------------------
-- 4. business_org_seats
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_org_seats (
  id               SERIAL PRIMARY KEY,
  seat_id          TEXT NOT NULL UNIQUE,
  organization_id  TEXT NOT NULL,
  -- AVAILABLE | ASSIGNED | SUSPENDED | REVOKED
  status           TEXT NOT NULL DEFAULT 'AVAILABLE',
  assigned_user_id TEXT,
  assigned_at      TIMESTAMPTZ,
  correlation_id   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_org_seats_status_check CHECK (
    status IN ('AVAILABLE','ASSIGNED','SUSPENDED','REVOKED')
  ),

  -- INVARIANT (roadmap §04.6 "seat count must be consistent"), enforced per row.
  -- Together these make seat-table drift unrepresentable.
  CONSTRAINT business_org_seats_assignment_check CHECK (
    (status = 'ASSIGNED' AND assigned_user_id IS NOT NULL)
    OR (status <> 'ASSIGNED' AND assigned_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS business_org_seats_sid_idx
  ON business_org_seats (seat_id);
CREATE INDEX IF NOT EXISTS business_org_seats_org_idx
  ON business_org_seats (organization_id);

-- ---- THE CONCURRENCY-SAFETY CONSTRAINT (roadmap §04.6) ----
-- A user may hold at most ONE assigned seat per organization. Two concurrent assignments of
-- the same user, or of the same last seat by two users, cause one write to fail here rather
-- than to silently double-consume capacity.
CREATE UNIQUE INDEX IF NOT EXISTS business_org_seats_active_assignment
  ON business_org_seats (organization_id, assigned_user_id)
  WHERE status = 'ASSIGNED' AND assigned_user_id IS NOT NULL;

-- Bounded seat lookup for the assignment transaction.
CREATE INDEX IF NOT EXISTS business_org_seats_available_idx
  ON business_org_seats (organization_id)
  WHERE status = 'AVAILABLE';

-- -----------------------------------------------------------------------------
-- 5. business_training_assignments  (append-only, roadmap §04.3)
-- REFERENCES the LEARNING lane by id + version. It stores NO course content, no lesson,
-- no assessment and no progress: the learning engine is not duplicated here.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_training_assignments (
  id                     SERIAL PRIMARY KEY,
  assignment_id          TEXT NOT NULL UNIQUE,
  organization_id        TEXT NOT NULL,
  -- Owned by src/lib/learning. Versioned so a content change is auditable.
  learning_path_id       TEXT NOT NULL,
  learning_path_version  TEXT NOT NULL,
  assigned_by_user_id    TEXT NOT NULL,
  correlation_id         TEXT,
  assigned_at            TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_training_path_check CHECK (
    length(learning_path_id) > 0 AND length(learning_path_version) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS business_training_assignment_id_idx
  ON business_training_assignments (assignment_id);
CREATE INDEX IF NOT EXISTS business_training_org_idx
  ON business_training_assignments (organization_id);

-- -----------------------------------------------------------------------------
-- 6. business_org_analytics_snapshots  (append-only, roadmap §04.8)
-- AGGREGATE COUNTS ONLY.
--
-- There is deliberately no per-member activity column. §04.8: "Do not expose private user
-- information beyond organization policy." A per-user activity feed requires an explicit,
-- separately-authorized policy that does not exist yet, so the aggregate is the only thing
-- the organization layer can compute.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_org_analytics_snapshots (
  id              SERIAL PRIMARY KEY,
  snapshot_id     TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  -- JSON object of OrgMetric -> integer. Aggregates only.
  metrics         TEXT NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_org_analytics_sid_idx
  ON business_org_analytics_snapshots (snapshot_id);
CREATE INDEX IF NOT EXISTS business_org_analytics_org_idx
  ON business_org_analytics_snapshots (organization_id, computed_at DESC);