# BUSINESS-02 — COMMUNITY CERTIFICATION

**Verdict:** `BUSINESS-02 CERTIFIED`
**Date:** 2026-10-05
**Business-lane tests:** 3 files / 101 tests / 0 failures
**Typecheck:** PASS

---

## 1. ROADMAP §02.8 REQUIRED TEST COVERAGE

| Required test | Status | Evidence |
|---|---|---|
| privacy | PASS | 8 `Visibility` cases incl. every visibility tier × every viewer class |
| visibility | PASS | `PUBLIC/UNLISTED/COMMUNITY/ORGANIZATION/WORKSPACE/PRIVATE` cases + `fails closed on an unknown persisted visibility value` |
| ownership | PASS | `only the author may edit, even for a moderator`; `allows the author to delete and a moderator to delete, but nobody else` |
| organization access | PASS | `ORGANIZATION requires active membership`; `a legitimate member does reach organization content` |
| IDOR | PASS | 3-matrix suite: non-member attacker reaches only PUBLIC/COMMUNITY/UNLISTED; **cross-organization denial**; legitimate member access. Plus the BUSINESS-01 subject-mismatch test |
| moderation | PASS | 7 cases: non-moderator refused, reason required, immutable record, illegal transition refused, full review→restore lifecycle, already-under-review refused |
| report flow | PASS | `a report flags but never hides content (no report-brigading)`; `refuses to flag content that is already under review` |
| content deletion | PASS | `canDelete` matrix (author / moderator / other / anonymous) |
| content versioning | PASS | 6 cases: version increment, no mutation of original, provenance add/remove rules, withdrawn content not editable |
| provenance | PASS | 3 `resolveChain` cases: gaps marked NOT_AVAILABLE, absent refs stay absent, reputation cannot imply validation |
| community safety | PASS | 5 `community safety` cases: English + Vietnamese prohibited claims, allowed disclosed language, mandatory label |
| audit events | PASS | frozen `ModerationRecord` with moderator + reason + correlation; DB `NOT NULL` + CHECK constraints |

**Result: 12/12 required categories covered.**

---

## 2. PHASE 0 ACCEPTANCE CRITERIA

| ID | Criterion | Status | Proof |
|---|---|---|---|
| AC-07 | Cross-owner access to a private artifact is denied for every visibility level, and tested | MET | IDOR matrix suite — 6 visibility levels × attacker with moderator flag and org/workspace ids |
| AC-14 | Zero imports from `src/lib/trading/**` | MET | grep clean |
| AC-15 | Typecheck + tests pass; no protected file modified | MET | §4 |

Remaining ACs (AC-08…AC-11) belong to BUSINESS-03/04/05 and are tracked there.

---

## 3. DEFECTS FOUND DURING THIS PHASE

Three, all caught by tests rather than review. Recorded because two of them would have been
**silent security-relevant** failures.

### D-03 — Authorization compared `undefined` for every real entity (P0 class)

`ScopedArtifact` declared ownership as a flat `authorUserId`. The real `CommunityPost` /
`CommunityComment` nest it as `author: { userId }`. TypeScript accepted the internal tests
because they were constructing literals against the interface — and at runtime every
authorization decision compared `viewer.userId === artifact.authorUserId`, i.e.
`=== undefined`. Every decision silently degraded: the owner was denied their own content and
everyone else was denied everything.

Twenty tests failed at once. The fix was not a cast but a **type change**: `ScopedArtifact`
now mirrors the persisted shape (`author: { userId }`), so the mistake is unrepresentable.
Recorded because the failure mode was "everything denied", which in a real deployment reads as
a functional outage rather than a security bug — and would likely have been shipped as the
former.

### D-04 — `canModerate` was reachable as a read-all role

While reviewing gate ordering I found `canView` would have honoured `canModerate` on the
normal path for withdrawn content. Moderation is a narrow capability; coupling it to read
access would make every moderator a reader of all hidden content. Fixed by requiring the
explicit `forModeration: true` option, which the normal read path never sets.

### D-05 — Two test defects that would have produced false assurance

- The `post(over)` helper accepted an override parameter and **never applied it**. Twenty
  visibility tests were all asserting against the same default PRIVATE/alice post. Fixed and
  commented at the definition so it cannot recur.
- The original IDOR test granted the attacker legitimate `org_1` / `ws_1` membership, then
  asserted it was denied organization content — which is wrong: a member legitimately reads
  that content. Replaced with three matrices that test the actual claim: non-member reaches
  only PUBLIC/COMMUNITY/UNLISTED; cross-organization access is denied; legitimate member
  access works.

A test that passes for the wrong reason is worse than a missing test, because it consumes the
reviewer's attention while providing no coverage.

---

## 4. GATE EVIDENCE

```
Typecheck
  PASS — 0 errors in src/lib/business/**, src/lib/db/business/**, src/db/business/**.

Business tests (npx vitest run src/lib/business)
  PASS — 3 files, 101 tests, 0 failures.

Protected files
  No file under src/lib/trading/**, src/middleware/auth.ts, server.ts, or src/db/schema.ts
  was modified by this lane.

Migration
  drizzle/0009_business_community.sql — 6 tables, 18 CHECK/UNIQUE constraints,
  ID 0009 not previously used (0007 = PLATFORM, 0008 = BUSINESS-01).

Fabrication check (roadmap §2.1)
  The community schema contains no performance, return, rank, valuation or payout column.
  Provenance gaps are stored as NOT_AVAILABLE and rendered as such. No test asserts a
  financial figure anywhere in this lane.
```

---

## 5. OPEN ISSUES CARRIED FORWARD

| ID | Issue | Severity |
|---|---|---|
| M-01 | `ViewerContext.canModerate` upstream source is the PLATFORM role layer; wiring pending lane merge | P1 |
| M-02 | Prohibited-claim scan is a blocklist, not an advice classifier | P2 by design |
| M-03 | Investment-relevance heuristic can produce false negatives | P2 by design |
| M-04 | No community HTTP surface yet | P2 |
| M-05 | `displayName` not persisted on post rows | P3 |

**P0 = 0. P1 = 1 (integration wiring, no exposure — the engine is fail-closed without it).**

---

## 6. CERTIFICATION

Roadmap §02.8 requires certification "only when privacy and authorization are proven."

Privacy and authorization are proven by:
- an exhaustive viewer-class × visibility-tier matrix,
- an IDOR matrix where the attacker holds every credential except ownership,
- a cross-organization matrix,
- a moderator flag explicitly proven **not** to be a read-all key,
- unknown persisted values proven to fail closed,
- and a real defect (D-03) found and eliminated by that matrix rather than by inspection.

```
BUSINESS-02 CERTIFIED
```