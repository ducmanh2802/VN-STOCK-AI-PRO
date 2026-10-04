# BUSINESS-03 — MARKETPLACE CERTIFICATION

**Verdict:** `BUSINESS-03 CERTIFIED`
**Date:** 2026-10-05
**Business-lane tests:** 4 files / 134 tests / 0 failures
**Typecheck:** PASS

---

## 1. ROADMAP §03.10 REQUIRED TEST COVERAGE

| Required test | Status | Evidence |
|---|---|---|
| strategy versioning | PASS | 4 cases: new version leaves prior byte-identical; evidence not inherited; DRAFT reset; performance carried until replaced |
| publication | PASS | 3 cases: documented path; `DRAFT->PUBLISHED` and `PUBLISHED->DRAFT` and `ARCHIVED->PUBLISHED` all refused |
| certification | PASS | `does not let a flag be asserted without its precondition` — VERIFIED and CERTIFIED both refused on a bare version |
| performance provenance | PASS | `refuses to display a metric when ANY provenance field is missing` — loops all **six** fields individually |
| ranking | PASS | 5 cases incl. the anti-return test and the missing-component test |
| visibility | PASS | `UNLISTED listings stay reachable by ref for authenticated users but are never public` |
| ownership | PASS | `refuses submission by a non-author` + anonymous refusal |
| marketplace entitlement | PASS | `refuses publishing when the plan has zero listings`; `accepts submission on a plan that permits it` |
| commercial state | PASS | `produces NOT_APPLICABLE rather than a fabricated payout`; fee/balance invariants |
| **no fake performance** | PASS | 5 gate cases + `creates a listing whose provenance is incomplete — publishing is still possible` |
| **no version mutation** | PASS | `creates a new version and leaves the previous one byte-identical` (JSON snapshot comparison) |
| audit | PASS | transition + submission paths audited; migration carries `correlation_id` on moderation/ledger side |

**Result: 12/12 required categories covered.**

---

## 2. PHASE 0 ACCEPTANCE CRITERIA

| ID | Criterion | Status | Proof |
|---|---|---|---|
| AC-08 | Marketplace performance displayed only when all 6 provenance fields resolve, else `NOT_AVAILABLE` | MET | 6-field loop test + generated-column DB gate |
| AC-09 | A strategy version update never mutates a prior version's recorded performance | MET | byte-identical JSON snapshot + `UNIQUE(strategy_id, version)` |
| AC-14 | Zero imports from `src/lib/trading/**` | MET | grep clean |
| AC-15 | Typecheck + tests pass | MET | §4 |

---

## 3. THE THREE-LAYER ANTI-FABRICATION DESIGN

The roadmap's single hardest requirement is §03.2. One enforcement layer would be a
convention; three make it structural:

| Layer | What it prevents |
|---|---|
| `gateMetric` returns a union; `DisplayableMetric` is constructible only via the gate | a reviewer forgetting a check |
| `performanceForDisplay` is the single rendering path | an ad-hoc render elsewhere in the codebase |
| `CHECK (performance = '[]' OR performance_displayable)` on a STORED GENERATED column | **any** direct SQL write persisting a number without provenance |

The third is the one that matters. Application checks protect against application mistakes;
the constraint protects against a future migration, an admin script, or a hand-written query —
none of which will remember to call the gate.

`performance_displayable` is `GENERATED ALWAYS AS (...) STORED`, so it is a function of the
six provenance columns and the application cannot write it.

---

## 4. GATE EVIDENCE

```
Typecheck
  PASS — 0 errors in src/lib/business/**, src/db/business/**.

Business tests (npx vitest run src/lib/business)
  PASS — 4 files, 134 tests, 0 failures.

Protected files
  No file under src/lib/trading/**, src/middleware/auth.ts, server.ts, or src/db/schema.ts
  was modified by this lane.

Migration
  drizzle/0010_business_marketplace.sql — 4 tables, 14 CHECK/UNIQUE constraints,
  1 STORED GENERATED column. ID 0010 previously unused.

No-money check (roadmap §2.1, §04)
  `marketplace_purchases` has NO amount column.
  `marketplace_creator_economics` monetary columns are NULL until a settled ledger entry
  exists, and the DB CHECK makes the decomposition balance mandatory.
  `creatorEconomics({settledGrossMinor: null})` returns NOT_APPLICABLE with all-null money.
```

---

## 5. DEFECTS AND DESIGN DECISIONS WORTH RECORDING

### D-06 — Ranking would have rewarded raw return

The first ranking draft summed `cagrPct` directly. A +95% CAGR / −70% drawdown strategy would
have outranked a +18% CAGR / −22% drawdown one. That is precisely roadmap §03.6's
prohibited "highest return = best strategy" ranking. Replaced with a risk-adjusted component
set, and pinned by the test `never ranks on raw return`, which builds the 95% strategy
explicitly and asserts it ranks **second**.

### D-07 — Excluded candidates would have been scored as zero

Initial ranking scored unresolvable provenance as `0`, which sorts unverified strategies to
the bottom — visually identical to "we evaluated them and they are bad". That is a fabricated
judgement about work nobody assessed. Changed to exclusion with an explicit reason, tested by
`excludes a version whose provenance does not resolve, with a reason`.

### D-08 — Partial provenance rendering (caught during typecheck)

`gateAllMetrics` originally returned `provenance: null` on the unavailable path while the
type omitted the field. That is exactly the shape that invites a later
`metrics[0].value` render against an empty provenance. The type now carries
`provenance: ResolvedProvenance | null` explicitly, and `performanceForDisplay` re-checks it
before returning `AVAILABLE`.

---

## 6. OPEN ISSUES CARRIED FORWARD

| ID | Issue | Severity |
|---|---|---|
| P-01 | No marketplace HTTP router yet | P2 |
| P-02 | Ranking weights unvalidated against real outcomes (no data exists) | P2 — flagged, not fabricated |
| P-03 | `VERIFIED` asserted manually; no automated re-verification job | P2 — INFRA phase |
| P-04 | Claim scanning is a blocklist, not a classifier | P2 by design |

**P0 = 0. P1 = 0.**

---

## 7. CERTIFICATION

Roadmap §03.10 requires that no fake performance, no version mutation, and full audit be
demonstrated.

- **No fake performance**: three enforcement layers including a database constraint; six-field
  exhaustive test; non-finite values treated as unavailable; publishing with incomplete
  provenance possible but rendering nothing.
- **No version mutation**: byte-identical snapshot assertion, frozen values, and a unique
  (strategy, version) index.
- **No fabricated commercial state**: no amount column on purchases; NULL-until-settled creator
  economics; DB-enforced decomposition balance.

```
BUSINESS-03 CERTIFIED
```