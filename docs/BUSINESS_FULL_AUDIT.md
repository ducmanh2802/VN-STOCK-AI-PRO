# BUSINESS FULL AUDIT

**Roadmap:** §21
**Date:** 2026-10-05
**Verdict input:** BUSINESS-01…05 all certified; commercial security audit complete

---

## A. ARCHITECTURE

### A.1 Domain boundaries

```
HTTP (businessApiRouter — mount-ready, NOT mounted)
  ↓  authenticated by PLATFORM Principal, authorized by EntitlementEngine
SERVICES (src/services/business — composition root)
  ↓
DOMAIN ENGINES (src/lib/business/**) — PURE. No I/O, no clock, no database.
  ↓
REPOSITORIES (src/lib/db/business/**)
  ↓
DRIZZLE (src/db/business/schema.ts)
```

| Boundary | Evidence |
|---|---|
| Domain has zero I/O | Every engine is a `static` method or pure function over injected inputs. `EntitlementService` injects `SubscriptionStore` / `UsageMeter` / `CommercialAuditLog`; no engine opens a connection or reads `Date.now()`. |
| Domain has zero clock reads | `evaluate({ at })`, `transition(sub, to, at)`, `record(event, at)` all take the instant. Proven by `is deterministic: the same input yields the identical verdict` and `never exposes a wall clock: repeated evaluation is identical`. |
| Persistence is the only DB touch | `BusinessRepositories.ts`, `CommunityRepository.ts`. |
| HTTP is the only transport touch | `businessApiRouter.ts`. |

### A.2 Dependency direction

- Domain → nothing (except its own types).
- Repositories → domain types + drizzle.
- Services → domain interfaces only.
- Router → PLATFORM `Principal` type + domain.
- **The business lane never imports the trading lane** (0 hits, grep-verified).

The one intentional cross-lane dependency is `import type { Principal } from '../platform/identity/types.ts'` — a **type-only** import, so it creates no runtime coupling and cannot even load PLATFORM code.

### A.3 Service / database boundaries

One repository per aggregate, each with an interface consumed by the domain, so the in-memory
and SQL implementations satisfy one contract. That is why every behavioural test written
against the in-memory pair is meaningful for the SQL pair.

### A.4 Isolation decision (concurrency)

A concurrent PLATFORM lane was actively editing `src/db/schema.ts` and `server.ts`. The
Business lane therefore wrote its tables to **`src/db/business/schema.ts`** and took migration
IDs **0008–0012**, leaving `0007` to PLATFORM. Documented in `docs/BUSINESS_READINESS_AUDIT.md` §1.1.

---

## B. COMMERCIAL

| Area | State | Evidence |
|---|---|---|
| Plans | 6 tiers, code-defined, fingerprinted per subscription | `plans.ts`; 14 tests |
| Subscriptions | Closed 8-state machine, illegal transitions throw | `subscriptionMachine.ts`; 8 tests |
| Entitlement | 8 ordered fail-closed gates, one decision point | `entitlementEngine.ts`; 13 tests |
| Usage | Period-bounded, idempotent on a **globally** unique event id | `usageMeter.ts`; 4 tests incl. 2 property tests |
| Billing | Provider-neutral; SANDBOX-only; no money can be unsourced | `paymentProvider.ts`; 12 tests |
| Refund | Explicit policy; never destroys research ownership | `refundPolicy.ts`; 5 tests |
| Marketplace economics | gross / fee / share / refund / tax kept separate; NULL until settled | `MarketplaceEngine.ts`; 4 tests + DB CHECK |
| Reconciliation | 7 finding codes, detects only, never repairs | `reconciliation.ts`; 9 tests |
| Audit | Append-only commercial trail, credential-redacted | `auditLog.ts`; 3 tests |

### B.1 The central commercial chain (roadmap §17)

```
USER (Principal, PLATFORM)
 → SUBJECT (actor.ts — the ONLY identity→commercial conversion)
 → ORGANIZATION (BUSINESS-04, ACTIVE membership only)
 → WORKSPACE (single-parent, no join table)
 → PLAN (resolvePlan is TOTAL — never undefined)
 → SUBSCRIPTION (closed state machine + derived effective status)
 → ENTITLEMENT (8 fail-closed gates → EntitlementVerdict)
 → FEATURE (22-feature registry, implementation-gated)
 → USAGE (period-bounded, idempotent)
 → LIMIT (plan.limits, derived counters, DB constraints)
```

Every arrow is a pure function over injected inputs. **All capability checks converge on
`EntitlementEngine.evaluate`** — there is no second path.

---

## C. SECURITY

Full detail in `docs/BUSINESS_SECURITY_AUDIT.md`.

| Area | Result |
|---|---|
| Authentication | Delegated to PLATFORM; 0 secrets, 0 tokens stored |
| Authorization | 8 threat classes each with a dedicated test; 4 named ESCALATION TESTs |
| IDOR | 3-matrix community suite + subject-mismatch + cross-org + cross-workspace |
| Privacy | 6 visibility tiers server-side; aggregate-only org analytics; no PII column added |
| Payment security | 11 threat rows, each with a test |
| Webhook security | raw-body signature, absolute replay window, dedupe-before-verify, provider-authoritative status |

**P0 = 0. P1 = 2** (missing SQL adapter code for billing and seat assignment).

---

## D. FINANCIAL SAFETY

| Roadmap §3 requirement | Status |
|---|---|
| `RiskGuard` unchanged | **UNTOUCHED** — no file under `src/lib/trading/**` modified |
| `RiskManager` unchanged | **UNTOUCHED** |
| `PositionSizer` unchanged | **UNTOUCHED** |
| `TradingEngine` unchanged | **UNTOUCHED** |
| `MarketDataIntegrityGuard` / `PointInTimeGuard` unchanged | **UNTOUCHED** |
| `TradingDataValidator` unchanged | **UNTOUCHED** |
| `FinancialConservationValidator` unchanged | **UNTOUCHED** |
| `PaperBroker` unchanged | **UNTOUCHED** |
| No real trading | Confirmed still `PaperBroker` only, `isSimulation: true`; `PaperReplayEngine` still hard-fails on a non-simulation port |
| No financial bypass | **Structurally impossible** — 0 imports from the trading lane |

**Investment ledger untouched:** `portfolio_*`, `paper_trade_ledger`, account/cash/position/NAV
state were neither read nor written. The commercial ledger has no investment column and a
`CHECK` that refuses investment concept kinds.

**Commercial entitlement is not financial authorization.** No code path converts a
subscription into an order, a fill, or a position. `EntitlementService.check` returns a
`CapabilityResult` — a verdict and a usage charge, nothing else.

---

## E. DATA

### E.1 Provenance

| Concern | Mechanism |
|---|---|
| Marketplace performance | 6 individual columns + a `GENERATED ALWAYS AS` displayable flag + a CHECK refusing any metric without it |
| Community chain | `resolveChain` returns all 6 expected links; gaps are `NOT_AVAILABLE` with a reason, never omitted |
| Provenance mutation | `PROVENANCE_REMOVAL_FORBIDDEN` — may be added to, never removed |
| Strategy versions | `UNIQUE(strategy_id, version)`; new version never inherits prior evidence |
| Research certification | referenced, never re-derived or re-labelled |

### E.2 Versioning

Strategy versions, community post versions, plan fingerprints, subscription status history —
all append or monotonic. No historical row is ever rewritten.

### E.3 Auditability

Five append-only trails: commercial audit events, commercial ledger entries, webhook
processing records, community moderation records, reconciliation findings.

### E.4 PII

`grep` for email/phone/address/national-ID columns across `src/db/business/schema.ts` → none
added. `users.email` exists in the pre-existing `users` table, which this lane does not touch.

---

## F. PRODUCT INTEGRATION

| Existing engine | Integration method | Duplicated? |
|---|---|---|
| `src/lib/research` (RESEARCH-01…05) | referenced by id + version via `ProvenanceRef` | **No** |
| `src/lib/replay` (PaperReplayEngine) | referenced by id + version (`PAPER_REPLAY`) | **No** |
| `src/lib/learning` (Learning Hub) | referenced by `learningPathId` + `learningPathVersion` | **No** — `LEARNING_LANE_VERSION_NOTE` states this explicitly |
| `src/lib/product/*` (journal, scenario, assistant, alerts) | feature registry entries pointing at real engines | **No** |
| `src/lib/portfolio`, `src/lib/multi-asset` | feature registry entries with evidence paths | **No** |
| PLATFORM identity | `Principal` consumed via `actor.ts` | **No** |

**Integration is by reference and entitlement gate, never by reimplementation.** The Business
lane adds no learning engine, no backtest engine and no paper engine.

---

## G. RELIABILITY

| Concern | Mechanism | Test |
|---|---|---|
| Duplicate payment | `UNIQUE(idempotency_key)`; provider idempotent on the key | yes |
| Duplicate economic effect | `UNIQUE(causation_id)` | yes |
| Duplicate webhook | `UNIQUE(event_id)` + dedupe-before-verify | yes (property, 11× → 1) |
| Duplicate usage event | `UNIQUE(event_id)` globally unique | yes (property, 50× → 1) |
| Concurrent seat assignment | partial `UNIQUE(organization_id, assigned_user_id) WHERE ASSIGNED` + pure transition | yes |
| Concurrent membership | `UNIQUE(organization_id, user_id)` | yes |
| Reconciliation | 7 explicit finding codes; never silent repair | 9 tests |
| Failure states | `UNAVAILABLE / INVALID / UNKNOWN / PENDING / REQUIRES_RECONCILIATION / FORBIDDEN / LIMIT_REACHED / PAYMENT_REQUIRED` all reachable and tested | — |
| Idempotent retries | retried request → 1 usage effect + `usage_duplicate_ignored` audit event | yes |
| Provider unreachable | `RETRY_REQUIRED`, never `FAILED` and never success | yes |

---

## H. UX (§13)

The lane ships **no frontend surface**. Reason, stated plainly rather than dressed up:

1. `server.ts` is protected (§26) and was concurrently owned by the PLATFORM lane.
2. Adding UI for endpoints that are not mounted would be a mock.

What is UI-ready when mounting happens:

| Surface | Behaviour already fixed by the domain |
|---|---|
| Plan / Entitlements / Usage | every denial carries an explicit decision + reason; never a bare `false` |
| Marketplace performance | `AVAILABLE` with provenance, or `NOT_AVAILABLE` with the missing field list — **never a bare number** |
| Community feed | `visibleFeed` returns `redactedWithReasons`, so "no content" is distinguishable from "content you cannot see" |
| Billing / audit | `UNAVAILABLE` and `NOT_AVAILABLE` are first-class return types |

**No fake KPI, revenue chart or user count exists anywhere in this lane**, because no
frontend code was written. The design constraint the roadmap cares about — *explicit
unavailable states instead of fabricated numbers* — is enforced in the API response types.

---

## I. MIGRATIONS

| ID | File | Tables |
|---|---|---|
| 0008 | `0008_business_monetization.sql` | 3 |
| 0009 | `0009_business_community.sql` | 6 |
| 0010 | `0010_business_marketplace.sql` | 4 |
| 0011 | `0011_business_organization.sql` | 6 |
| 0012 | `0012_business_billing.sql` | 4 |

**23 tables.** No ID reused. No historical migration altered. No destructive migration.
`0007` correctly left to the concurrent PLATFORM lane. Every migration carries CHECK
constraints beyond what the Drizzle types can express — including the three idempotency
UNIQUE indexes and the marketplace `GENERATED` displayable column.

---

## J. VERIFICATION RESULTS

```
Typecheck  (tsc --noEmit)                PASS — 0 errors
Full tests (vitest run)                  PASS — 205 files, 2213 tests, 0 failures
Build      (vite build && esbuild)       PASS — 1944 modules, 12.65s
Baseline   (at PHASE 0)                  PASS — 189 files, 1859 tests, 0 errors

Business lane                            7 files, 236 tests, 0 failures
  BUSINESS-01 Plans / Entitlement        14 + 45
  BUSINESS-02 Community                  42
  BUSINESS-03 Marketplace                33
  BUSINESS-04 Organization               47
  BUSINESS-05 Billing                    52
  E2E journey (§20)                       3

Protected-file check
  src/lib/trading/**          unmodified
  src/middleware/auth.ts      unmodified
  src/db/schema.ts            modified by the PLATFORM lane only (zero business content)
  server.ts                   modified by the PLATFORM lane only (zero business content)

Cross-lane import check
  grep -rn "from '.*trading" src/lib/business src/services/business src/db/business  ->  0
```

---

## K. ISSUE REGISTER

| ID | Sev | Area | Issue |
|---|---|---|---|
| SEC-01 | **P1** | Billing | No SQL repository for payments / ledger / webhooks |
| SEC-02 | **P1** | Organization | Seat-assignment repository transaction discipline not implemented |
| SEC-03 | P2 | API | Business router not mounted (`server.ts` protected + concurrent) |
| SEC-04 | P2 | API | Rate limiting not wired to business routes |
| SEC-05 | P2 | Services | Organization / community / marketplace service + HTTP layers not written |
| SEC-06 | P2 | Data | No FK from business tables to PLATFORM tables (lane merge) |
| SEC-07 | P2 | Billing | Sandbox signature is a stand-in, not a provider scheme |
| SEC-08 | P2 | API | `error.message` may surface an internal code on a generic 500 |
| M-02 | P2 | Community | Claim scanning is a blocklist, not an advice classifier |
| M-03 | P2 | Community | Investment-relevance heuristic can produce false negatives |
| P-02 | P2 | Marketplace | Ranking weights unvalidated (no outcome data exists to validate against) |
| P-03 | P2 | Marketplace | `VERIFIED` asserted manually; no automated re-verification job |
| O-05 | P2 | Organization | Aggregate-only analytics, no per-member reporting (by design) |
| B-04 | P2 | Billing | No scheduler for periodic reconciliation |
| B-05 | P2 | Billing | No billing HTTP router |
| L-02 | P2 | Commercial | Audit `sequence` allocated `max+1`; needs a DB sequence for multi-writer |
| L-03 | P2 | Commercial | No FK from `business_subscriptions.subject_id` to `platform_user_account` |
| SEC-09 | P3 | Community | `displayName` not persisted on post rows |

**P0 = 0 · P1 = 2 · P2 = 15 · P3 = 1**

Both P1 items are **missing adapter code, not missing controls**. Every invariant they would
carry is already enforced in the domain layer and, for seats, by a database constraint that
makes the invalid state unrepresentable.

---

## L. DEFECTS FOUND AND FIXED DURING THIS LANE

Recorded because they are the substance of the work, not decoration.

| # | Sev | Defect | Impact if shipped |
|---|---|---|---|
| D-01 | P1 | `CANCELLED`-within-paid-period denied before the access-window check ran | every cancelling customer would have lost access immediately, contradicting §01.2 |
| D-02 | P1 | `PAST_DUE` mapped to a denial, making the grace period dead code | a single failed renewal would cut service |
| D-03 | **P0** | `ScopedArtifact` used a flat `authorUserId`; the real entity nests `author.userId` | **every** authorization decision compared `undefined` — owner denied their own content, everyone denied everything. Read as a functional outage, not a security bug |
| D-04 | P1 | `canModerate` reachable as a read-all key on withdrawn content | any moderator could read all hidden content |
| D-05 | P2 | `post(over)` test helper accepted an override and never applied it | 20 visibility tests all asserted against the same default post — false assurance |
| D-05b | P2 | IDOR test granted the attacker legitimate membership, then asserted denial | asserted the wrong thing; would have "passed" while testing nothing |
| D-06 | P1 | Initial ranking summed raw CAGR | +95% CAGR / −70% drawdown would outrank +18% / −22% — exactly §03.6's prohibited ranking |
| D-07 | P1 | Unresolvable candidates scored 0 | unknown strategies sorted last, reading as "we evaluated them and they were bad" — a fabricated judgement |
| D-08 | P2 | `gateAllMetrics` returned provenance omitted from its type on the unavailable path | invites a later `metrics[0].value` render against empty provenance |
| D-09 | P2 | Seat-capacity test asserted 25 seats > cap 25 is an error | the engine was right, the test was wrong |
| D-10 | P2 | `assignSeat` read an undeclared `input.orgPlanId` | capacity authority untyped |
| **D-11** | **P1** | **No way existed to create a paid subscription** | **the platform could not sell anything**; found only by the §20 journey, after six passing unit suites |

D-03 and D-11 are the two that mattered. Both were invisible to review and to unit tests in
isolation, and both were found by the tests the roadmap specifically asked for.