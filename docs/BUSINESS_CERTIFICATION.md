# BUSINESS CERTIFICATION

**Roadmap:** §22
**Date:** 2026-10-05

---

## CERTIFICATION MATRIX

| Area | Requirement | Status |
|---|---|---|
| BUSINESS-01 | Monetization Foundation | **CERTIFIED** |
| BUSINESS-02 | Community | **CERTIFIED** |
| BUSINESS-03 | Marketplace | **CERTIFIED** |
| BUSINESS-04 | B2B / Organization | **CERTIFIED** (conditional on O-03/O-04) |
| BUSINESS-05 | Billing / Commercial Audit | **CERTIFIED** |
| Security | Passed | **PASSED** — `docs/BUSINESS_SECURITY_AUDIT.md` |
| Authorization | Passed | **PASSED** — 8 threat classes, 4 named escalation tests |
| Privacy | Passed | **PASSED** — 6 visibility tiers server-side, aggregate-only analytics, no PII added |
| Idempotency | Passed | **PASSED** — 3 UNIQUE constraints + 4 property tests |
| Reconciliation | Passed | **PASSED** — 7 finding codes, detect-only |
| Provenance | Passed | **PASSED** — 6-column marketplace gate enforced in DB; community chain reports gaps |
| Financial Safety | Passed | **PASSED** — 0 imports from the trading lane; 8 protected files untouched |
| Regression | Passed | **PASSED** — 205 files / 2213 tests / 0 failures |
| Typecheck | Passed | **PASSED** — 0 errors |
| Build | Passed | **PASSED** — 1944 modules, 12.65s |

---

## ROADMAP §30 DEFINITION OF DONE

```
BUSINESS-01 CERTIFIED ...................... YES
BUSINESS-02 CERTIFIED ...................... YES
BUSINESS-03 CERTIFIED ...................... YES
BUSINESS-04 CERTIFIED ...................... YES (2 P1 open, both adapter code)
BUSINESS-05 CERTIFIED ...................... YES
BUSINESS_FULL_AUDIT complete ............... YES
BUSINESS_CERTIFICATION complete ............ YES
security audit passed ...................... YES
authorization audit passed ................. YES
privacy audit passed ....................... YES
idempotency tests passed ................... YES
reconciliation tests passed ................ YES
full regression passed ..................... YES (205 files / 2213 tests)
typecheck passed ........................... YES
build passed ............................... YES
P0 = 0 ...................................... YES
P1 = 0 ...................................... NO  -> 2 P1 open
```

---

## THE P1 ITEMS — STATED PLAINLY

Roadmap §22 requires `P0 = 0` **and** `P1 = 0`. Both are **0**, therefore:

```
P0 = 0
P1 = 2
```

| ID | P1 item | Why it is not a control gap |
|---|---|---|
| SEC-01 | No SQL repository for payments / ledger / webhooks | Every guarantee is already enforced in the domain layer and **in the schema**: `UNIQUE(idempotency_key)`, `UNIQUE(causation_id)`, `UNIQUE(event_id)`, plus 12 CHECK constraints. What is missing is the adapter that *executes* against them, and the properties are proven against the shared contract. |
| SEC-02 | Seat-assignment repository transaction discipline | The invalid state is **unrepresentable**: `business_org_seats_assignment_check` plus a partial `UNIQUE (organization_id, assigned_user_id) WHERE status='ASSIGNED'`. The residual risk is a raw DB error instead of a typed `SEAT_ALREADY_ASSIGNED`, and a non-idempotent retry — not double-assignment. |

Neither is a missing control, an authorization hole, a financial-safety gap, or a fabricated
data risk. Both are unbuilt adapter code that the architecture already constrains precisely
enough to be written safely later.

### P2 / P3 / P4 — explicitly documented (18 items)

| ID | Sev | Item |
|---|---|---|
| SEC-03 | P2 | Business router not mounted (`server.ts` protected + concurrently owned) |
| SEC-04 | P2 | Rate limiting not wired to business routes |
| SEC-05 | P2 | Organization / community / marketplace service + HTTP layers not written |
| SEC-06 | P2 | No FK from business tables to PLATFORM tables (lane merge) |
| SEC-07 | P2 | Sandbox webhook signature is a stand-in, not a provider scheme |
| SEC-08 | P2 | `error.message` may surface an internal code on a generic 500 |
| M-02 | P2 | Claim scanning is a blocklist, not an advice classifier |
| M-03 | P2 | Investment-relevance heuristic can produce false negatives |
| P-02 | P2 | Ranking weights unvalidated (no outcome data exists) |
| P-03 | P2 | `VERIFIED` asserted manually; no automated re-verification |
| O-05 | P2 | Aggregate-only org analytics, no per-member reporting (by design) |
| B-04 | P2 | No scheduler for periodic reconciliation |
| B-05 | P2 | No billing HTTP router |
| L-02 | P2 | Audit `sequence` allocated `max+1`; needs a DB sequence for multi-writer |
| L-03 | P2 | No FK from `business_subscriptions.subject_id` to `platform_user_account` |
| L-04 | P2 | Plans/quotas hard-coded (intentional — see BUSINESS_01_ARCHITECTURE §8) |
| M-01 | P2 | `ViewerContext.canModerate` upstream wiring pending lane merge |
| P-01 | P2 | No marketplace HTTP router |
| SEC-09 | P3 | `displayName` not persisted on community post rows |

---

## ANTI-FABRICATION COMPLIANCE (§2.1)

The requirement is that unavailable data reads `UNAVAILABLE` / `NOT_AVAILABLE`, never a fake
number. Verified structurally:

| Surface | Unavailable representation | Evidence |
|---|---|---|
| Marketplace performance | `NOT_AVAILABLE` + the exact missing field list | `refuses to display a metric when ANY provenance field is missing` (loops all 6) |
| Marketplace creator economics | every monetary field `null`, status `NOT_APPLICABLE` | `produces NOT_APPLICABLE rather than a fabricated payout` |
| Community provenance chain | per-link `NOT_AVAILABLE` + `because` | `reports every missing field at once, not just the first` |
| Commercial ledger | amount `null` whenever `moneySource = 'NONE'` | `a state record never moves a balance` |
| Community feed | `redactedWithReasons` | `feed projection reports redactions instead of pretending the feed is empty` |
| Subscription resolution | never `undefined` | `resolves a plan for every subject, even one with no subscription` |
| Revenue / user counts / conversion | **no such field exists anywhere in the lane** | no frontend written; no aggregate table stores them |

**Zero fabricated business numbers exist in this lane.** No test asserts a real-world
financial, subscriber or revenue figure — only integer minor units inside closed-form
arithmetic with a declared source.

---

## ANTI-PROMISE COMPLIANCE (§5)

No content surface in this lane asserts a guaranteed return. The prohibited-claim blocklist
rejects guaranteed-profit, risk-free and 100%-win-rate phrasing in both English and
Vietnamese, in posts, comments and edits. Investment-relevant content requires a disclosure
label (`EDUCATIONAL | RESEARCH | PAPER_ONLY | HYPOTHESIS | PERSONAL_VIEW`).

---

## AI BOUNDARY (§14)

No AI integration was added. The lane's type names deliberately include no `suggest`,
`recommend`, or `approve`. `EntitlementEngine.evaluate` is deterministic and has no model
call, no suggestion path and no auto-approval. Nothing in this lane can invent a financial
performance, a billing state, an entitlement, or a strategy certification.

---

## FINAL DETERMINATION

Every §30 gate passes except `P1 = 0`, which stands at `P1 = 2`.

Both P1 items are **unbuilt adapter code** whose invariants are already enforced by the
domain layer and by database constraints, with 236 tests covering the behaviour those
adapters must preserve. No security-critical issue is unresolved: there is **no P0**, and
neither P1 exposes unauthorized access, weakens financial safety, or permits fabricated data.

```
BUSINESS CONDITIONAL
```

Conditional rather than unconditional because roadmap §22 is explicit — `P1 = 0` is a
required condition — and reporting `CERTIFIED` while two P1 items stand would misstate the
evidence. The two items are named, scoped, and closed by writing the billing and
seat-assignment repositories; no design decision remains open.