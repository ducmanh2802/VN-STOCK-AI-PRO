# BUSINESS-05 — BILLING / ENTITLEMENT CERTIFICATION

**Verdict:** `BUSINESS-05 CERTIFIED`
**Date:** 2026-10-05
**Business-lane tests:** 7 files / 236 tests / 0 failures
**Typecheck:** PASS · **Full regression:** 205 files / 2213 tests / 0 failures · **Build:** PASS

---

## 1. ROADMAP §05.10 REQUIRED TEST COVERAGE

| Required test | Status | Evidence |
|---|---|---|
| state transitions | PASS | `allows the documented transitions`, `rejects illegal transitions`, `REFUNDED is terminal` |
| idempotency | PASS | ledger `is append-only and idempotent on causation`; provider `is idempotent on the caller-supplied idempotency key` |
| duplicate webhook | PASS | `PROPERTY: duplicate webhook => exactly one economic effect` — 11 deliveries, 1 effect |
| payment failure | PASS | `keeps PAYMENT_UNKNOWN as RETRY_REQUIRED`; `records FAILED for a failed payment`; reconciliation finding 4 |
| payment unknown | PASS | `PAYMENT_UNKNOWN never silently becomes success`; `keeps PAYMENT_UNKNOWN as RETRY_REQUIRED and never as PROCESSED` |
| refund | PASS | 5 `Refund policy` cases incl. the unconditional research-ownership retention |
| subscription expiration | PASS | `derives an effective status from the injected instant` (BUSINESS-01) + E2E `afterPeriod → DENIED_GRACE_EXPIRED` |
| entitlement reconciliation | PASS | 9 `Reconciliation` cases covering all 7 finding codes |
| organization billing | PASS | E2E: org subject gets its own `BUSINESS` subscription and payment + ledger entries |
| marketplace billing | PASS | E2E: `PLATFORM_FEE` + `CREATOR_SHARE` decomposed ledger entries; BUSINESS-03 `creatorEconomics` |
| commercial ledger | PASS | 6 cases incl. `has no investment-accounting entry kind` and the documented sign convention |
| audit | PASS | commercial audit trail + webhook processing records + reconciliation findings all append-only |
| authorization | PASS | `refuses to treat any provider as PRODUCTION`; E2E `no unauthorized subject ever gains an entitlement` |

**Result: 13/13 required categories covered.**

---

## 2. PHASE 0 ACCEPTANCE CRITERIA

| ID | Criterion | Status | Proof |
|---|---|---|---|
| AC-11 | Duplicate webhook delivery produces exactly one economic effect | MET | property test (11× → 1); `UNIQUE(event_id)` + `UNIQUE(causation_id)` |
| AC-12 | Commercial and investment ledgers are separate | MET | 0 imports from `src/lib/trading/**`; no investment column; `assertLedgerDomain` guard |
| AC-13 | Reconciliation surfaces every listed inconsistency and never silently repairs | MET | 7 finding codes; reconciler has **no write path** to any subscription/payment/entitlement |
| AC-15 | Typecheck + tests + build pass | MET | §4 |

---

## 3. THE FIVE CLAIMS THAT MATTER

### 3.1 No fake payment — structural, not conventional

The only adapter is `SANDBOX` with `canSettle: false`. `assertSettleable()` throws for
`PRODUCTION` and for any non-settling adapter. There is **no code path that could mark a
payment PRODUCTION**, which is what makes §4's "never allow test payment state to grant
production financial privileges" true by construction.

### 3.2 No fake money — an amount cannot be unsourced

`moneySource` couples to the amount in both directions, in code and in SQL:

| `moneySource` | Amount | Provider |
|---|---|---|
| `PROVIDER_REPORTED` | required | **required** |
| `OPERATOR_ADJUSTMENT` | required | optional |
| `NONE` | **must be NULL** | optional |

A `PAYMENT_UNKNOWN` or `STATE_CHANGE` entry therefore contributes **nothing** to any balance.
Tested by `a state record never moves a balance`.

### 3.3 Duplicate delivery cannot double-charge

Three UNIQUE constraints, one per idempotency requirement: `idempotency_key` (no duplicate
payment), `causation_id` (no duplicate effect), `event_id` (no duplicate webhook processing).
The webhook pipeline also returns the **original** record for a duplicate rather than an
error, because providers retry legitimately and an error would make them retry forever.

### 3.4 Refund never destroys research

`RETAIN_RESEARCH_OWNERSHIP` is unconditional across all four branches
(`withinPaidPeriod × marketplacePurchase`). Test name states the invariant rather than a
single case.

### 3.5 Reconciliation detects and refuses to repair

The reconciler is a pure function returning a report. It has no write path to a
subscription, a payment or an entitlement. Its `overlay` feeds `EntitlementEngine`, which
then returns `REQUIRES_RECONCILIATION` instead of `ALLOWED` — closing the loop with §29.

Beyond the three findings the roadmap names, four more were added because they are the same
class of silent lie: failed-payment-without-grace, refunded-but-active, invalid persisted
status, ledger invariant violation.

---

## 4. GATE EVIDENCE

```
Typecheck   (tsc --noEmit)                        PASS — 0 errors
Full tests  (vitest run)                          PASS — 205 files, 2213 tests, 0 failures
Build       (vite build + esbuild server)         PASS — 1944 modules, built in 12.65s

Business tests (vitest run src/lib/business)      PASS — 7 files, 236 tests, 0 failures
  Business01Plans         14
  Business01Entitlement   45
  Business02Community     42
  Business03Marketplace   33
  Business04Organization  47
  Business05Billing       52
  BusinessE2EJourney       3

Protected files
  No file under src/lib/trading/**, src/middleware/auth.ts, or src/db/schema.ts was modified
  by this lane. server.ts and src/db/schema.ts DO appear modified in git status; the diff is
  entirely PLATFORM / replay-lane content (createPlatformRouter, correlationMiddleware,
  replayRuns) with zero business content. See docs/BUSINESS_FULL_AUDIT.md §2.

Migration
  drizzle/0012_business_billing.sql — 4 tables, 20 CHECK/UNIQUE constraints, 3 idempotency
  UNIQUE indexes. ID 0012 previously unused.

Cross-lane import check
  grep -rn "from '.*trading" src/lib/business src/services/business src/db/business  ->  0
```

---

## 5. DEFECT FOUND BY THE E2E JOURNEY — THE MOST IMPORTANT ONE HERE

### D-11 — There was no way to create a paid subscription at all

Roadmap §20's journey requires `START TRIAL` and, later, an organization acquiring its own
subscription. The E2E test failed at the trial step with
`INVALID_SUBSCRIPTION_TRANSITION:ACTIVE->TRIALING`.

Analysis: `EntitlementService` could `ensureFreeSubscription`, `changeStatus` and `changePlan`
on an **existing** subscription — but nothing could *create* a non-FREE one. The only route
would have been to widen `ensureFreeSubscription`, i.e. to silently let a plan flip grant paid
entitlements with no settled payment behind it. That is precisely the failure §29 forbids.

`openPaidSubscription()` was added with three explicit cases:

| existing state | behaviour |
|---|---|
| none | create the paid subscription |
| FREE | replace it (the ordinary upgrade) |
| non-FREE | **refuse** — replacing an active paid subscription would be a second charge for the same subject |

Plus `ACTIVE` requires a non-null `providerRef`, so an ACTIVE subscription cannot be created
with no payment reference behind it.

**This is the defect class the roadmap's §20 end-to-end test exists to find, and it was only
found by running the journey.** Six unit suites had passed without ever noticing that the
product could not sell anything.

---

## 6. OPEN ISSUES

| ID | Issue | Severity |
|---|---|---|
| B-02 | No repository implementations for payments / ledger / webhooks; domain guarantees proven, SQL adapters not written | **P1** |
| B-01 | Sandbox signature is a deterministic stand-in, not a provider signing scheme | P2 |
| B-03 | No reconciliation repository and no operator repair workflow (by design — repair must be audited) | P2 |
| B-04 | No scheduler for periodic reconciliation | P2 — INFRA phase |
| B-05 | No billing HTTP router | P2 |

**P0 = 0. P1 = 1.**

---

## 7. CERTIFICATION

Roadmap §05.10 requires certification "only if commercial state is deterministic and
auditable."

- **Deterministic:** closed state machines for subscription, payment, publication, seat and
  moderation; every engine pure over injected instants; repeated evaluation proven identical.
- **Auditable:** append-only commercial audit trail, append-only ledger with causal ids,
  append-only webhook processing records, append-only reconciliation findings. Credential-
  shaped metadata redacted at the write path.

```
BUSINESS-05 CERTIFIED
```