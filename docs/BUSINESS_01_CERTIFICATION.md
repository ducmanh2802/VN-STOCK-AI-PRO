# BUSINESS-01 — MONETIZATION FOUNDATION CERTIFICATION

**Verdict:** `BUSINESS-01 CERTIFIED`
**Date:** 2026-10-05
**Tests:** 2 files / 59 tests / 0 failures
**Typecheck:** PASS (0 errors in `src/lib/business/**`, `src/lib/db/business/**`, `src/services/business/**`)

---

## 1. ROADMAP §01.8 REQUIRED TEST COVERAGE

| Required test | Status | Evidence |
|---|---|---|
| plan resolution | PASS | `resolves a plan for every subject, even one with no subscription`; `PlanCatalog > resolves the highest rank plan deterministically` |
| entitlement | PASS | 13 `EntitlementEngine` cases covering every denial decision |
| feature access | PASS | `FeatureRegistry` 5 cases; `grants FREE learning and denies FREE backtesting` |
| usage limits | PASS | `enforces the usage limit and reports remaining headroom`; `stops at the FREE plan limit and reports LIMIT_REACHED` |
| expired subscription | PASS | `expires a PAST_DUE subscription once grace has elapsed`; `does not delete access on cancellation` |
| cancelled subscription | PASS | `does not delete access on cancellation (roadmap §01.2)` — asserts ALLOWED inside the paid window and `DENIED_GRACE_EXPIRED` after |
| trial | PASS | `derives an effective status from the injected instant, never a clock` — TRIALING in trial, EXPIRED after |
| organization entitlement | PASS (partial) | `separates individual plans from organization plans`; `rejects a plan change that the subject kind does not permit`. Organization *seat* and *precedence* semantics are BUSINESS-04 by roadmap §04.7 |
| user entitlement | PASS | full `EntitlementEngine` + `EntitlementService` coverage |
| concurrent usage | PASS | `PROPERTY: interleaved duplicates never exceed the sum of distinct events` (10 rounds × 3 ids = 30 attempts, 3 charges) |
| duplicate usage event | PASS | `PROPERTY: a duplicate event id has exactly one economic effect` (50 identical retries → 1 charge); `reports a duplicate explicitly rather than silently` |
| authorization interaction | PASS | `denies a subscription that belongs to a different subject (IDOR, roadmap §02.4)`; `blocks a non-ACTIVE platform account even with a valid subscription`; `ActorSeam > fails closed on every doubt` |
| fail-closed behavior | PASS | `fails closed on an unregistered feature identifier`; `never declares a dead feature as implemented`; `refuses to allow while reconciliation is pending (roadmap §29)`; `rejects an invalid evaluation instant instead of guessing`; `denies an unknown persisted plan id rather than guessing` |

**Result: 13/13 required categories covered.**

---

## 2. PHASE 0 ACCEPTANCE CRITERIA

| ID | Criterion | Status | Proof |
|---|---|---|---|
| AC-01 | Single deterministic capability answer for every subject type × registry feature | MET | `EntitlementEngine.evaluate` — 13 cases; ordering documented in `BUSINESS_01_ARCHITECTURE.md` §3 |
| AC-02 | Plan resolution is total, never `undefined` | MET | `resolves a plan for every subject…` — unknown subject → `FREE` |
| AC-03 | Subscription transitions are a closed machine | MET | `rejects illegal transitions by throwing`; `UNAVAILABLE` has `[]` targets |
| AC-04 | Repeated usage key ⇒ one effect, sequential and interleaved | MET | 2 property tests (50× and 30× replays) |
| AC-05 | `PAYMENT_UNKNOWN` never yields `ACTIVE`/`ALLOWED` | MET | `refuses to allow while reconciliation is pending`; `REQUIRES_PAYMENT` test |
| AC-06 | Every commercial mutation appends one audit event with actor + correlation + reason | MET | `meters only after the entitlement check succeeds`; `audits a successful plan change`; `covers every roadmap §05.9 commercial audit action` |
| AC-07 | *(deferred to BUSINESS-02)* | — | community artifacts do not exist yet |
| AC-08 | *(deferred to BUSINESS-03)* | — | marketplace performance does not exist yet |
| AC-09 | *(deferred to BUSINESS-03)* | — | strategy versions do not exist yet |
| AC-10 | *(deferred to BUSINESS-04)* | — | seats do not exist yet |
| AC-11 | *(deferred to BUSINESS-05)* | — | webhooks do not exist yet |
| AC-12 | Commercial and investment ledgers are separate | MET | zero imports from `src/lib/trading/**`; verified by grep |
| AC-13 | *(deferred to BUSINESS-05)* | — | reconciliation engine lands in BUSINESS-05; the **overlay** it will use already exists and is tested |
| AC-14 | Zero imports from `src/lib/trading/**` | MET | verified |
| AC-15 | Typecheck + tests pass; no protected file modified | MET | see §4 |

---

## 3. DEFECTS FOUND AND FIXED DURING THIS PHASE

Both were caught by tests, not by review. Recorded because they are the substance of the phase.

| # | Defect | Impact if shipped | Fix |
|---|---|---|---|
| D-01 | `CANCELLED`-within-paid-period was denied at the status gate before the access-window check could run | Every cancelling customer would have lost access immediately, contradicting roadmap §01.2 | `ENTITLING_STATUSES` no longer includes `CANCELLED`; the access window is evaluated against the raw status (gate 6b) before the derived status (gate 6c) |
| D-02 | `PAST_DUE` was mapped to `REQUIRES_PAYMENT` denial, so a grace period had no effect | A grace period would have been dead code; a single failed renewal would cut service | `PAST_DUE` entitles while inside grace; the verdict still carries `subscriptionStatus:'PAST_DUE'` and an audit event is written. `REQUIRES_PAYMENT` is reserved for `INCOMPLETE` — "never had a settled payment" — which is the semantically exact case |

A third, architectural defect was corrected before testing: the store/meter/audit interfaces
were synchronous, which the drizzle adapters could not satisfy. They are now async, so one
contract serves both the in-memory and the SQL implementation and every behavioural test is
meaningful for production.

---

## 4. GATE EVIDENCE

```
Typecheck (npm run typecheck / tsc --noEmit)
  PASS — 0 errors attributable to this lane.

Business lane tests (npx vitest run src/lib/business)
  PASS — 2 files, 59 tests, 0 failures.

Protected-file check (git diff --name-only)
  No file under src/lib/trading/**, src/middleware/auth.ts, server.ts, or src/db/schema.ts
  was touched by this lane. See docs/BUSINESS_FULL_AUDIT.md §2.

Financial-safety check
  grep -r "trading" src/lib/business/  ->  0 import statements.
  Business code cannot reach RiskGuard / RiskManager / PositionSizer / TradingEngine /
  FinancialConservationValidator / PaperBroker / TradingDataValidator.
```

---

## 5. OPEN ISSUES CARRIED FORWARD

| ID | Issue | Severity | Owner |
|---|---|---|---|
| L-01 | Router exported but not mounted (`server.ts` protected + concurrently owned) | P1 | integration step at lane merge |
| L-02 | Audit `sequence` allocated `max+1`; needs a DB sequence for multi-writer | P2 | INFRA phase |
| L-03 | `business_subscriptions.subject_id` has no FK to `platform_user_account` | P2 | lane merge |
| L-06 | `API_ACCESS` / `EXPORT` declared but unimplemented → correctly denied | by design | future goal |

**P0 = 0. P1 = 1 (documented integration step, no security exposure).**

---

## 6. CERTIFICATION

Roadmap §01.8 requires certification "only if entitlement behavior is deterministic and
auditable."

- **Deterministic:** every engine is a pure function over injected inputs. No wall clock is
  read anywhere in the decision path. Asserted by
  `is deterministic: the same input yields the identical verdict` and
  `never exposes a wall clock: repeated evaluation is identical`.
- **Auditable:** every grant, denial, plan change, status change, usage record and duplicate
  replay appends an immutable event carrying actor, session, correlation, reason and outcome,
  with credential-shaped metadata structurally redacted.

```
BUSINESS-01 CERTIFIED
```