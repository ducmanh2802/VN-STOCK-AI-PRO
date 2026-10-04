# BUSINESS-02 — COMMUNITY ARCHITECTURE

**Status:** IMPLEMENTED + CERTIFIED
**Date:** 2026-10-05
**Tests:** 3 business files / 101 tests / 0 failures

---

## 1. WHAT WAS BUILT

The platform had no community layer. BUSINESS-02 adds a research/learning community whose
every artifact is a reference to a research object that keeps its provenance — not a social
feed with stock images.

```
src/lib/business/community/
  types.ts           visibility, moderation states, provenance refs, viewer context
  visibility.ts      THE privacy boundary — one pure authorization function
  CommunityEngine.ts validation, versioning, moderation, reputation, chain resolution
  index.ts           public barrel
src/lib/db/business/CommunityRepository.ts   bounded, indexed persistence
drizzle/0009_business_community.sql         6 tables + constraints
```

---

## 2. THE PRIVACY BOUNDARY (roadmap §02.4)

The entire IDOR defence of this lane is `visibility.ts` — about 80 lines of pure function
with no I/O, no clock and no database. That is deliberate: the security-critical decision
must be readable and exhaustively testable in isolation.

```
canView(artifact, viewer, { forModeration? })
```

Rules, all tested:

| Visibility | Owner | Org member | Workspace member | Any authenticated | Anonymous |
|---|---|---|---|---|---|
| `PRIVATE` | YES | no | no | no | no |
| `WORKSPACE` | YES | — | YES | no | no |
| `ORGANIZATION` | YES | YES | — | no | no |
| `COMMUNITY` | YES | YES | YES | YES | no |
| `UNLISTED` | YES | YES | YES | YES | no |
| `PUBLIC` | YES | YES | YES | YES | YES |

Moderation state is evaluated **before** visibility:

| Moderation state | Owner | Moderator (moderation view) | Everyone else |
|---|---|---|---|
| `VISIBLE` | per visibility | per visibility | per visibility |
| `FLAGGED` / `UNDER_REVIEW` | YES | YES | **no** |
| `HIDDEN` / `REMOVED` / `SUSPENDED` | moderation view only | YES | **no** |

Three defences worth naming:

1. **A moderator flag is not a universal read key.** `canModerate` only widens access on the
   explicit `forModeration: true` path, which the normal read path never sets. Without this,
   `canModerate` would quietly become a read-all role.
2. **A workspace grant requires organization membership too.** A viewer who knows a workspace
   id but is not an organization member is denied. Otherwise workspace ids become an
   enumeration vector.
3. **Unknown persisted visibility values fail closed.** `UNKNOWN_VISIBILITY:…`, never a
   default to public.

`visibleFeed()` returns `{ visible, redactedWithReasons }`. Redacted items are reported with
a reason rather than silently dropped, so a UI can distinguish "no content" from "content you
cannot see" instead of implying an empty account.

---

## 3. MODERATION (roadmap §02.5)

A closed state machine; illegal transitions throw `INVALID_MODERATION_TRANSITION`.

```
VISIBLE ──→ FLAGGED ──→ UNDER_REVIEW ──→ VISIBLE
   │            │             │       └→ HIDDEN ──→ UNDER_REVIEW
   └────────────┴─────────────┴─────────────→ HIDDEN ──→ REMOVED
REMOVED  ──→ UNDER_REVIEW   (appeal path)
SUSPENDED──→ UNDER_REVIEW
```

Every action appends a frozen `ModerationRecord` carrying moderator, action, from, to,
reason, correlation and instant. `community_moderation_records` has `moderator_user_id NOT
NULL` and a `length(reason) > 0` CHECK: an unattributable or unreasoned moderation action
cannot be written.

**A flag is not a takedown.** Any authenticated user may flag; only a moderator may act. If
flagging hid content, any user could hide anyone's post by reporting it — a report-brigading
primitive. The test `a report flags but never hides content` pins this.

---

## 4. CONTENT SAFETY (roadmap §05, §02.6)

Two independent controls:

**(a) Mandatory disclosure.** Investment-relevant content must carry at least one of
`EDUCATIONAL | RESEARCH | PAPER_ONLY | HYPOTHESIS | PERSONAL_VIEW`, or creation throws
`CONTENT_LABEL_REQUIRED`.

**(b) Prohibited-claim scan.** 11 patterns (English + Vietnamese) covering
guaranteed-return, risk-free, 100%-win-rate, cannot-lose, "chắc chắn thắng", "không rủi ro".
Any hit rejects the post, comment or edit.

**Recorded limitation:** a blocklist is not an advice classifier. It cannot decide whether
prose constitutes personalised investment advice, and it is not claimed to. Its scope is the
unambiguous cases; the real burden of disclosure is carried by the mandatory label. This is
stated in the source so the control is not over-trusted.

---

## 5. PROVENANCE (roadmap §02.2, §16)

`CommunityEngine.resolveChain(post)` returns one entry per expected link:

```
RESEARCH | STRATEGY_VERSION | DATASET | BACKTEST | VALIDATION | PAPER_REPLAY
```

A gap is reported as `state: 'NOT_AVAILABLE'` with `because`, and `refId: null`. Gaps are
never **omitted** from the array — a chain that silently drops its missing links reads as a
complete chain, which is precisely the failure mode §16 exists to prevent.

Provenance may be **added** to but never removed: `updatePost` throws
`PROVENANCE_REMOVAL_FORBIDDEN`. Dropping a research reference is how a verified post becomes
an unsourced claim.

---

## 6. REPUTATION (roadmap §02.7)

A pure fold over `ReputationEvent[]`. Every event requires a non-empty `subjectRef` —
reputation without an attributable cause is just a number.

**Reputation is not an input to any authorization or moderation decision.** There is no
parameter through which it could be: `canView` takes only `(artifact, viewer)`, and `viewer`
contains userId, org ids, workspace ids and `canModerate` — no reputation. The test
`does not let a high-reputation author imply validation` pins this by showing a post by a
high-reputation author still reports an empty chain.

---

## 7. DATA MODEL

| Table | Mutability | Key constraint |
|---|---|---|
| `community_posts` | append-changed | `version` guarded on update; scope coherence CHECKs |
| `community_post_versions` | append-only | `UNIQUE(post_id, version)` — edit history cannot be forged |
| `community_comments` | append-only-ish | visibility inherited from parent post |
| `community_reports` | append-only | `UNIQUE(reporter, target_type, target_id)` |
| `community_moderation_records` | append-only | actor NOT NULL, reason length > 0 |
| `community_reputation_events` | append-only | `subject_ref` length > 0 |

**SQL filtering is an optimisation, never the authorization decision.** Every read is followed
by a server-side `canView`. A bug in a `WHERE` clause can return *fewer* rows than the viewer
may see, never *more*.

**No performance column exists anywhere in this schema.** There is no field in which a
fabricated investment number could be presented as system-validated. Marketplace performance,
which genuinely needs provenance, is a separate concern with its own source columns.

---

## 8. KNOWN LIMITATIONS

| # | Limitation | Severity |
|---|---|---|
| M-01 | Moderator/role resolution comes from `ViewerContext.canModerate`, whose upstream source is the PLATFORM role layer — the Business lane does not define roles | P1 — interface is ready; wiring at lane merge |
| M-02 | Prohibited-claim scan is a blocklist, not an advice classifier (see §4) | P2 by design |
| M-03 | Investment-relevance heuristic is a regex; a false negative means a label is not demanded | P2 by design, mitigated by (b) |
| M-04 | No community API router yet; `CommunityService` orchestration and HTTP surface land with the integration step | P2 |
| M-05 | `displayName` is not persisted on the post row (returned empty by `toPost`) | P3 — cosmetic, join at read time |