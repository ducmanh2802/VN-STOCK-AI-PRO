# BUSINESS-04 — B2B / ORGANIZATION CERTIFICATION

**Verdict:** `BUSINESS-04 CERTIFIED (conditional on O-03/O-04)`
**Date:** 2026-10-05
**Business-lane tests:** 5 files / 181 tests / 0 failures
**Typecheck:** PASS

---

## 1. ROADMAP §04.10 REQUIRED TEST COVERAGE

| Required test | Status | Evidence |
|---|---|---|
| organization ownership | PASS | `denies a membership belonging to a different organization (cross-tenant)`; `never returns another organization's workspaces`; `CHECK (subject_id = organization_id)` |
| workspace ownership | PASS | 3 cases: single-parent binding, cross-org isolation, input validation |
| seats | PASS | 9 cases: derived counts, drift detection both directions, refuse-on-drift, assign, one-user-one-seat, plan ceiling, illegal transitions, release, suspend |
| roles | PASS | `denies a capability the role does not confer`; owner/admin/researcher/viewer/instructor/training-admin matrix; last-owner protection |
| permissions | PASS | `has a non-empty, non-overlapping-by-accident capability map for every role` |
| training | PASS | `does not duplicate the learning engine`; `a learner role has no training administration capability` |
| instructor | PASS | `INSTRUCTOR` has `TRAINING_INSTRUCT` but not `TRAINING_MANAGE` |
| learner | PASS | `VIEWER` and `RESEARCHER` have neither training capability |
| organization entitlement | PASS | 8 precedence cases incl. 4 named ESCALATION TESTs |
| private data isolation | PASS | cross-tenant membership + workspace isolation + aggregate-only analytics design |
| export authorization | PASS | 4 cases: capability mapping, AUDIT_REPORT escalation, unknown kind refused, suspended org refused |
| concurrent membership | PASS | `PROPERTY: no user ever holds two seats in one organization`; `UNIQUE(organization_id, user_id)`; partial UNIQUE active-assignment index |
| organization deletion/deactivation | PASS | 3 cases: terminal CLOSED, close-with-assigned-seats refused, deactivation removes all capability |

**Result: 13/13 required categories covered.**

---

## 2. PHASE 0 ACCEPTANCE CRITERIA

| ID | Criterion | Status | Proof |
|---|---|---|---|
| AC-10 | Seat assignment is concurrency-safe; seat count always internally consistent | MET **with open items** | Pure transition + `seatConsistency()` precondition + partial UNIQUE index + row CHECK. Repository transaction discipline is O-03/O-04 |
| AC-15 | Typecheck + tests pass; no protected file modified | MET | §4 |

---

## 3. THE FOUR THINGS THAT MATTER HERE

### 3.1 No second role system

`OrgRole` is resource-scoping and evaluated only after PLATFORM authenticates. It never
authenticates and never overrides a PLATFORM refusal. `canModerate` is sourced from PLATFORM,
not defined here.

### 3.2 Suspension is not theatre

`a SUSPENDED organization grants nothing, not even to its owner`. If an owner retained
access, the suspend control would do nothing to the people who matter most.

### 3.3 The concurrency race is closed at the database, not in application code

```sql
CREATE UNIQUE INDEX business_org_seats_active_assignment
  ON business_org_seats (organization_id, assigned_user_id)
  WHERE status = 'ASSIGNED' AND assigned_user_id IS NOT NULL;
```

Application-level counting is a race regardless of how carefully it is written. The losing
write now fails in the database under any interleaving. Stated plainly because it is the
difference between "we think it is safe" and "it is not possible to double-assign".

### 3.4 Precedence cannot escalate

Four dedicated `ESCALATION TEST` cases: foreign-organization membership, foreign-user
membership, suspended organization, explicit rank ceiling. All four fall back to the
individual plan. The individual plan is always retained, so departure is non-destructive.

---

## 4. GATE EVIDENCE

```
Typecheck
  PASS — 0 errors in src/lib/business/**, src/db/business/**.

Business tests (npx vitest run src/lib/business)
  PASS — 5 files, 181 tests, 0 failures.

Protected files
  No file under src/lib/trading/**, src/middleware/auth.ts, server.ts, or src/db/schema.ts
  was modified by this lane.

Migration
  drizzle/0011_business_organization.sql — 6 tables, 9 CHECK constraints, 3 UNIQUE indexes
  including the partial active-assignment index. ID 0011 previously unused.

Financial-safety check
  grep -r "trading" src/lib/business/  ->  0 import statements.
  No cash/position/NAV/P&L/invoice column in this migration.
```

---

## 5. DEFECTS AND CORRECTIONS

### D-09 — Seat-capacity test asserted the wrong thing

The original test created 25 seats against TEAM's `maxSeats: 25` and expected
`SEAT_CAPACITY_EXCEEDED`. The engine was **correct** — 25 seats at a 25 cap is not over
capacity — so the test was wrong. Rewritten to test the real boundaries: 26 seats on TEAM
refused, 26 on ENTERPRISE allowed, exactly 25 on TEAM allowed.

Worth noting: this exposed that `assignSeat` carries a second, redundant `nextAssigned >
maxSeats` check that is unreachable given the length check and the seat-state machine. It is
kept as defence-in-depth and documented, rather than silently deleted.

### D-10 — `orgPlanId` was undeclared

`assignSeat` read `input.orgPlanId` for the capacity authority but the input type omitted it.
TypeScript did not catch it because the call sites passed the object through a literal that
was not yet type-checked in isolation. Added to the interface with an explicit comment that
its `maxSeats` is the capacity authority.

---

## 6. OPEN ISSUES

| ID | Issue | Severity |
|---|---|---|
| O-03 | Seat assignment transaction discipline documented but not implemented in a repository (`SELECT … FOR UPDATE` / conditional update) | **P1** |
| O-04 | Callers currently receive a raw DB unique-violation rather than a typed `SEAT_ALREADY_ASSIGNED` until the repository lands | **P1** |
| O-01 | No organization HTTP router | P2 |
| O-02 | No FK to PLATFORM tables (concurrent lanes) | P2 — lane merge |
| O-05 | Aggregate-only analytics, no per-member reporting | P2 by design |

**P0 = 0. P1 = 2** (both are the same missing repository transaction layer, not a
correctness hole in the domain; the database constraint prevents the bad state either way).

---

## 7. CERTIFICATION

Roadmap §04.10 requires organization/workspace ownership, seats, roles, permissions,
training, instructor, learner, organization entitlement, private data isolation, export
authorization, concurrent membership and organization deletion to be tested.

All thirteen are covered. Two P1 items remain — both parts of the not-yet-written seat
assignment repository. The **database constraint already prevents the invalid state**, so
the residual risk is a poor error message and a non-idempotent retry, not double-assignment.

```
BUSINESS-04 CERTIFIED (conditional on O-03 / O-04 repository work)
```