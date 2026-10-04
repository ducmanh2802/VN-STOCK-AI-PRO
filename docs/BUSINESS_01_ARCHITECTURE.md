# BUSINESS-01 — MONETIZATION FOUNDATION ARCHITECTURE

**Status:** IMPLEMENTED + CERTIFIED
**Date:** 2026-10-05
**Depends on:** PLATFORM-01 identity (`Principal`) — consumed, never duplicated

---

## 1. WHAT WAS BUILT

The platform had **no commercial layer of any kind** before this phase (verified in
`docs/BUSINESS_READINESS_AUDIT.md` §6, gaps G-01…G-04). BUSINESS-01 creates the entire
commercial entitlement substrate.

```
src/lib/business/
  features.ts            canonical feature registry (22 features, implementation-gated)
  types.ts               plans, subscriptions, usage, EntitlementVerdict, UNAVAILABLE markers
  plans.ts               plan catalog, plan resolution, plan fingerprint
  subscriptionMachine.ts closed lifecycle machine + derived effective status
  entitlementEngine.ts   the single capability decision point
  entitlementService.ts  orchestration: plan resolution + metering + audit
  usageMeter.ts          idempotent, period-bounded usage metering
  actor.ts               PLATFORM Principal -> CommercialSubject seam
  auditLog.ts            append-only commercial audit trail with secret redaction
  api/businessApiRouter.ts  domain-level HTTP surface (mount-ready)
  adapters/drizzleAdapters.ts  SQL-backed SubscriptionStore / UsageMeter / AuditLog
  index.ts               public barrel
src/db/business/schema.ts      3 commercial tables (isolated from the concurrent PLATFORM lane)
src/lib/db/business/BusinessRepositories.ts  3 repositories
src/services/business/BusinessServiceComposition.ts  composition root
drizzle/0008_business_monetization.sql         migration + CHECK constraints
```

---

## 2. THE COMMERCIAL CHAIN (roadmap §17)

Every capability decision converges on one deterministic path:

```
USER (Principal, PLATFORM)
  ↓  actor.ts — the ONLY place identity becomes a commercial subject
SUBJECT (USER | ORGANIZATION)
  ↓  subscriptionMachine.ts — effectiveStatus(sub, injectedInstant)
SUBSCRIPTION (TRIALING|ACTIVE|PAST_DUE|PAUSED|CANCELLED|EXPIRED|INCOMPLETE|UNAVAILABLE)
  ↓  plans.ts — resolvePlan() is TOTAL, never undefined
PLAN (FREE|PREMIUM|PRO|TEAM|BUSINESS|ENTERPRISE)
  ↓  entitlementEngine.ts — 8 ordered gates
ENTITLEMENT (EntitlementVerdict: decision + allowed + reason)
  ↓  usageMeter.ts — metered only AFTER an ALLOWED verdict
USAGE (period-bounded bucket, idempotent on eventId)
  ↓  LIMIT_FIELD_BY_RESOURCE
LIMIT
```

Every one of those steps is a pure function over injected inputs. No step reads a wall clock.

---

## 3. ENTITLEMENT EVALUATION ORDER (fail closed)

| # | Gate | Denial decision |
|---|---|---|
| 1 | feature registration | `DENIED_UNKNOWN_FEATURE` |
| 2 | feature implementation | `DENIED_FEATURE_NOT_IMPLEMENTED` |
| 3 | subscription ownership | `DENIED_SUBJECT_MISMATCH` |
| 4 | subscription resolution | `DENIED_NO_SUBSCRIPTION` |
| 5 | reconciliation overlay | `REQUIRES_RECONCILIATION` |
| 6a | evaluation instant validity | `REQUIRES_RECONCILIATION` |
| 6b | cancellation window | `DENIED_GRACE_EXPIRED` |
| 6c | effective status | `DENIED_SUBSCRIPTION_INACTIVE` / `REQUIRES_PAYMENT` |
| 7 | plan feature membership | `DENIED_FEATURE_NOT_IN_PLAN` |
| 8 | usage limit | `LIMIT_REACHED` |

Three orderings are load-bearing and were each fixed by a failing test:

**(a) Implementation precedes plan membership.** A plan may name `API_ACCESS`, but no
implementation exists, so gate 2 refuses it regardless of plan. This is what makes
"no dead features" (roadmap §01.4) an enforced invariant rather than a documentation note.

**(b) Gate 6b runs before gate 6c.** A lapsed cancellation must yield the *specific*
`DENIED_GRACE_EXPIRED`, not the generic inactive-subscription denial. Checking the raw
status first keeps the specific diagnosis reachable and auditable.

**(c) Reconciliation precedes everything after plan resolution.** An unknown payment or an
orphaned entitlement yields `REQUIRES_RECONCILIATION`, never `ALLOWED` (roadmap §29).

---

## 4. LIFECYCLE SEMANTICS — THE DECISIONS THAT MATTER

The roadmap mandates the state set but not its semantics. These are the choices made, each
because the alternative silently loses money or silently grants service:

| Persisted status | Instant | Decision | Rationale |
|---|---|---|---|
| `ACTIVE` | in period | `ALLOWED` | paid, settled |
| `TRIALING` | in trial | `ALLOWED` | trial is explicit, never implicit |
| `TRIALING` | trial elapsed | `DENIED_SUBSCRIPTION_INACTIVE` | derived `EXPIRED` |
| `PAST_DUE` | **in grace** | **`ALLOWED`**, verdict carries `subscriptionStatus:'PAST_DUE'` | a grace period exists so a failed renewal does not cut service. The overdue condition stays visible on the verdict and in the audit trail |
| `PAST_DUE` | grace elapsed | `DENIED_SUBSCRIPTION_INACTIVE` | derived `EXPIRED` |
| `CANCELLED` | **in paid period** | **`ALLOWED`** | roadmap §01.2: cancellation does not delete access |
| `CANCELLED` | period + grace elapsed | `DENIED_GRACE_EXPIRED` | window closed |
| `PAUSED` | any | `DENIED_SUBSCRIPTION_INACTIVE` | suspension withholds access |
| `INCOMPLETE` | any | `REQUIRES_PAYMENT` | never had a settled payment; says so explicitly |
| `EXPIRED` | any | `DENIED_SUBSCRIPTION_INACTIVE` | terminal |
| `UNAVAILABLE` | any | `DENIED_SUBSCRIPTION_INACTIVE` | state indeterminate ⇒ deny |

**Explicitly non-existent:** a `PAYMENT_UNKNOWN → ACTIVE` path. It is not merely absent, it
is unrepresentable: `UNAVAILABLE` has an empty transition list, and the reconciliation
overlay refuses before status is even considered.

---

## 5. COMMERCIAL ISOLATION (roadmap §01.7, §3, §26)

`src/lib/business/**` contains **zero imports from `src/lib/trading/**`**. Verified by grep
and recorded in `docs/BUSINESS_FULL_AUDIT.md`.

Consequences, all enforced by construction:
- Business code cannot override `RiskGuard`, `RiskManager`, `PositionSizer`,
  `TradingEngine`, `FinancialConservationValidator`, `PaperBroker` or `TradingDataValidator`
  — it cannot reach them.
- A subscription grants a *commercial capability*, never trading authority.
- `EntitlementService.check()` returns a `CapabilityResult`. It has no code path that
  produces an order, a fill, or a position.

**No protected file was modified.** See `docs/BUSINESS_FULL_AUDIT.md` §2.

---

## 6. IDEMPOTENCY (roadmap §01.5, §05.4)

Two independent mechanisms, deliberately:

| Layer | Mechanism | Guarantee |
|---|---|---|
| In-memory (`InMemoryUsageMeter`) | `Set<eventId>` per bucket, checked and inserted in one synchronous critical section | one process cannot double count |
| SQL (`DrizzleUsageMeter`) | `UNIQUE(event_id)` + `INSERT … ON CONFLICT DO NOTHING RETURNING id` | **any** number of processes cannot double count |

`event_id` is **globally** unique, not unique per subject. A per-subject key would still let
one logical charge be re-keyed under a second subject to dodge a cap. This is stated in the
migration comment so it is not "helpfully" relaxed later.

---

## 7. API SURFACE (roadmap §12)

`createBusinessApiRouter()` — exported, mount-ready, **not mounted** (see below).

| Route | Auth | Notes |
|---|---|---|
| `GET /api/billing/plans` | public | catalog + per-feature implementation status |
| `GET /api/billing/subscription` | required | caller's own state only; **no id parameter → no IDOR surface** |
| `POST /api/billing/subscription/status` | required | self-service `CANCELLED`/`PAUSED` only; other statuses are provider-driven → `403 STATUS_NOT_SELF_SERVICE` |
| `GET /api/entitlements` | required | every plan feature with its decision |
| `POST /api/entitlements/check` | required | capability probe + optional idempotent metering |
| `GET /api/usage` | required | caller's own consumption, validated period key |
| `GET /api/billing/audit` | required | caller's own audit trail, bounded + paginated |

HTTP status mapping: denial → `403`, limit → `429`, payment required → `402`,
reconciliation → `503`. Unknown/ineffective states are never `200` with a falsy field.

### Why it is not mounted

`server.ts` is protected by roadmap §26 ("Global server routing") **and** is currently owned
by the PLATFORM lane, which is actively editing it (readiness audit §1.1). Mounting would
require a concurrent edit to a protected file. Mounting is:

```ts
import { createBusinessApiRouter } from './src/lib/business/api/businessApiRouter.ts';
app.use('/api/billing', createBusinessApiRouter({ ... }));
```

This is recorded as an integration step, not as done work.

---

## 8. DATA MODEL (roadmap §10)

| Table | Mutability | Notes |
|---|---|---|
| `business_subscriptions` | mutable | one row per subject, `UNIQUE(subject_id)` |
| `business_usage_events` | append-only | `UNIQUE(event_id)`, period-bounded index |
| `business_audit_events` | append-only | never updated, never deleted |

Every table: `id` PK, `created_at`, `updated_at` (mutable tables only), ownership columns
(`subject_id`, `organization_id`), status where applicable, index coverage for its hot query.

**Documented deviation from §10:** append-only tables carry `created_at` but **no**
`updated_at`. An `updated_at` on an immutable event journal would be a lie — the row can
never change. This matches the existing RESEARCH (`research_experiments`,
`research_certifications`) and PAPER REPLAY (`replay_runs`) tables.

**Plans are code-defined, not tabled.** Rationale: entitlement evaluation must be
deterministic and version-controlled with the engine that reads it; a runtime-mutable plan
table would let a bad write silently change what every user is entitled to. Auditability is
preserved instead by `plan_fingerprint` on every subscription row, so a later catalog change
cannot rewrite the meaning of a historical subscription.

### Migration hardening (beyond the ORM schema)

The migration adds constraints the Drizzle types cannot express:

- `status` must be one of the 8 machine states
- `subject_kind` must agree with `organization_id` presence
- a `CANCELLED` row must carry `cancelled_at`
- `current_period_end > current_period_start`
- `quantity > 0`
- `period_key ~ '^[0-9]{4}-[0-9]{2}$'`
- `business_subscriptions_subject_uniq` — a subject can never hold two subscriptions

---

## 9. PERFORMANCE (roadmap §27)

- Every hot query is index-backed: `(subject_id, resource, period_key)` for consumption,
  `subject_id` for subscription lookup, `(action)`, `(correlation_id)`, `(occurred_at)` for audit.
- `BusinessSubscriptionRepository.list(limit, offset)` and
  `BusinessAuditRepository.forSubject(subjectId, limit)` are bounded by construction.
- `DrizzleUsageMeter.bucket()` deliberately does **not** materialise the event-id set — it
  would be unbounded. Idempotency for the SQL path is enforced by the UNIQUE constraint.
- No authorization decision is cached. The plan catalog is immutable code; entitlement
  evaluation is one indexed subscription read plus one indexed SUM.

---

## 10. KNOWN LIMITATIONS

| # | Limitation | Severity |
|---|---|---|
| L-01 | Router not mounted — `server.ts` protected + concurrently owned | P1 (integration step) |
| L-02 | Audit `sequence` allocated as `max+1`; correct for one process, needs a DB sequence for multi-writer | P2 |
| L-03 | `userId` has no FK to `platform_user_account`; the two lanes are connected only at the application seam | P2 (resolved at lane merge) |
| L-04 | Plans, prices and quotas are hard-coded | P2 — intentional, see §8 |
| L-05 | No payment provider, no pricing, no currency — nothing monetary is fabricated | by design (roadmap §4) |
| L-06 | `EXPORT` and `API_ACCESS` features are declared but unimplemented, so they deny | by design (roadmap §01.4) |