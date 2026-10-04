# BUSINESS-04 — B2B / ORGANIZATION / TRAINING ARCHITECTURE

**Status:** IMPLEMENTED + CERTIFIED
**Date:** 2026-10-05
**Tests:** 5 business files / 181 tests / 0 failures

---

## 1. WHAT WAS CREATED

PHASE 0 §2.5 established that organization, workspace, team, member and seat **do not exist
anywhere in this repository**. They are net-new.

```
src/lib/business/organization/
  types.ts            Organization, Membership, Seat, Workspace, OrgRole, OrgCapability,
                      EntitlementPrecedence, OrgAnalytics, TrainingAssignment
  OrganizationEngine.ts  capability checks, lifecycle, seats, precedence, export authz
  index.ts            public barrel
src/db/business/schema.ts   4 organization tables + 2 supporting tables
drizzle/0011_business_organization.sql
```

---

## 2. ROLE SYSTEM BOUNDARY (roadmap §04.1, §04.4)

**No second role system was created.**

```
PLATFORM  →  "who is this person?"     (Principal, UserStatus, authentication)
BUSINESS  →  "what may they do in THIS organization?"  (OrgRole → OrgCapability)
BUSINESS  →  "what may they do commercially?"          (EntitlementEngine → Feature)
BUSINESS  →  "may they moderate?"                      (ViewerContext.canModerate,
                                                          sourced from PLATFORM)
```

`OrgRole` is a resource-scoping role. It is evaluated **only after** PLATFORM has
established the principal, it never authenticates anybody, and it never grants a capability
PLATFORM has refused. `ROLE_CAPABILITIES` maps role → capability; `can()` then applies
authentication → organization status → membership status → role, failing closed at each step.

`INSTRUCTOR / TRAINING_ADMIN` (roadmap §04.4) are mapped through the same capability system
rather than introduced as parallel constructs.

---

## 3. FAIL-CLOSED ORDERING (each step load-bearing)

```
1. authenticated?              no  -> AUTHENTICATION_REQUIRED
2. organization ACTIVE?         no  -> ORGANIZATION_SUSPENDED
3. membership ACTIVE?           no  -> MEMBERSHIP_{PENDING|SUSPENDED|REVOKED}
4. capability in role?          no  -> CAPABILITY_NOT_IN_ROLE:{role}
```

Step 2 precedes step 3 deliberately: **a SUSPENDED organization must deny even its OWNER**.
Otherwise "suspend the organization" would be a no-op for its most privileged members — the
control would be theatre. Tested by `a SUSPENDED organization grants nothing, not even to its owner`.

---

## 4. SEATS (roadmap §04.6)

Four states, a closed transition machine, and **derived** counts. There is no stored counter
that could drift from the rows.

### Consistency invariant

```
assigned + available + suspended + revoked === total
status = ASSIGNED  ⟺  assigned_user_id IS NOT NULL
```

Checked in `seatConsistency()` **before** every mutation, so a drifted table is reported
(`SEAT_TABLE_INCONSISTENT`) rather than compounded. The same invariant is a per-row CHECK in
the migration, so drift is unrepresentable at the storage layer too.

### Concurrency safety — what actually closes the race

`assignSeat` is a pure transition: it takes a snapshot, returns a new seat, mutates nothing.
Two concurrent in-process calls therefore cannot interleave *inside* the function. But that
only solves the single-process case, and the roadmap asks for genuine safety.

The real closure is in the migration:

```sql
CREATE UNIQUE INDEX business_org_seats_active_assignment
  ON business_org_seats (organization_id, assigned_user_id)
  WHERE status = 'ASSIGNED' AND assigned_user_id IS NOT NULL;
```

This partial unique index makes the losing write **fail at the database** under any
interleaving, in any number of processes. Neither the pure function nor the index is
sufficient alone; the pair is the guarantee. The repository must re-read the seat row inside
its transaction and reject on a zero-row update — documented in the source, §5 below, and
carried as open issue O-04.

Capacity authority is the **plan's `maxSeats`**, never a stored counter.

---

## 5. ENTITLEMENT PRECEDENCE (roadmap §04.7)

**Policy: an ORGANIZATION plan overrides the individual plan, one-directionally, and the
individual plan is always retained.**

Why override rather than union or intersection:

| Option | Failure |
|---|---|
| UNION | A FREE individual keeps FREE entitlements while holding a BUSINESS seat — the organization pays for 50 seats and it changes nothing. Commercially incoherent. |
| INTERSECTION | An organization can never lift a user above their personal tier — also commercially wrong. |
| **OVERRIDE** | Organization capabilities apply while a seat is held; the personal plan returns intact on departure. |

Five anti-escalation properties, each tested:

1. A membership whose `organizationId` is not among the evaluated organizations is **ignored**
   — otherwise a caller could pass an arbitrary membership record to inherit somebody else's
   organization plan.
2. A membership belonging to a **different user** is ignored.
3. A **SUSPENDED organization** or a non-ACTIVE membership falls back to the individual plan
   **immediately**, so a leaver loses organization entitlements at revocation, not at some
   later sweep.
4. `individualPlanId` is **always** retained in the result: leaving the organization restores
   the personal tier with no data loss and no re-purchase.
5. `maxRank` provides an explicit ceiling so a future plan change cannot silently promote a
   member.

`resolveEntitlementPrecedence` always returns **both** plans plus the winning `source` and a
human-readable `reason`, so every decision is auditable.

---

## 6. ORGANIZATION DELETION / DEACTIVATION

- `CLOSED` is terminal; `CLOSED -> ACTIVE` throws.
- Closing requires **zero assigned seats** (`CANNOT_CLOSE_ORGANIZATION_WITH_ASSIGNED_SEATS`) —
  closing with assigned seats would strand paid seats nobody can manage.
- Losing ACTIVE membership **drops the seat claim immediately** (`seatId: null`), so a leaver's
  seat never lingers as assigned to a departed user.
- The last active OWNER cannot be demoted (`CANNOT_DEMOTE_THE_LAST_OWNER`); a SUSPENDED owner
  does not count as a safety net, because an organization with no reachable owner is
  unrecoverable without direct database surgery.

---

## 7. TRAINING — NO ENGINE DUPLICATION (roadmap §04.3)

This lane declares **no** course, path, lesson, exercise, assessment or progress type.
`TrainingAssignment` references the LEARNING lane by `(learning_path_id,
learning_path_version)` only. `src/lib/learning` remains the single owner of learning
content, progress and certification.

---

## 8. B2B ANALYTICS AND EXPORT (roadmap §04.8, §04.9)

**Analytics is aggregate-only.** `business_org_analytics_snapshots` stores a JSON object of
`OrgMetric -> integer` and has **no per-member activity column**. §04.8 says "do not expose
private user information beyond organization policy"; a per-user activity feed requires an
explicit, separately-authorized policy that does not exist yet, so the aggregate is the only
thing this layer computes. Recorded as open issue O-05.

Exports run through the same capability system as everything else — `authorizeExport()` maps
each `OrgExportKind` to a capability and calls `can()`. There is no "admin export" side door.
`AUDIT_REPORT` escalates to `ORG_MANAGE` (OWNER only). An unknown export kind is refused
rather than defaulted.

---

## 9. DATA MODEL

| Table | Constraint of note |
|---|---|
| `business_organizations` | `CHECK (subject_id = organization_id)` — an org cannot point at a foreign commercial subject |
| `business_org_memberships` | `UNIQUE (organization_id, user_id)` — no duplicate membership |
| `business_org_workspaces` | single-parent by design; no join table |
| `business_org_seats` | assignment CHECK + partial UNIQUE on active assignment |
| `business_training_assignments` | references the LEARNING lane by version |
| `business_org_analytics_snapshots` | aggregate metrics only |

No cash, position, NAV, P&L or invoice amount appears anywhere in this migration.

---

## 10. KNOWN LIMITATIONS

| # | Limitation | Severity |
|---|---|---|
| O-01 | No organization HTTP router | P2 |
| O-02 | `organization_id` / `user_id` have no FK to PLATFORM tables (concurrent lanes) | P2 — resolved at lane merge |
| O-03 | Seat assignment transaction discipline is documented but not yet implemented in a repository (`SELECT … FOR UPDATE` / conditional update) | P1 |
| O-04 | Partial unique index enforces correctness, but callers get a raw DB error rather than a typed `SEAT_ALREADY_ASSIGNED` until the repository exists | P1 — coupled to O-03 |
| O-05 | Aggregate-only org analytics; no per-member reporting | P2 by design (§04.8) |