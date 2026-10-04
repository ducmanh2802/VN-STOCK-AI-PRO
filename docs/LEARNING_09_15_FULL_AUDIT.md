# LEARNING-09→15 FULL EVIDENCE AUDIT
Status: COMPLETE | Date: 2026-10-04 | Mode: post-implementation audit + remediation + re-test

## 1. Scope
All Learning-owned implementation from this autonomous pass: foundation remediation
(ProgressStore), L09 adaptive, L10 projects, L11 assessment/certification, L12 graph,
L13 tutor, L14 studio, L15 training. Prior MVP (L01→08) re-verified, not re-implemented.

## 2. Verification results (actual exit codes)
- `npm test` (`vitest run`): 174 files / 1755 tests, ALL PASS, 0 failed.
- `npm run typecheck` (`tsc --noEmit`): exit 0, zero errors (one transient error observed
  mid-pass inside another lane's untracked `src/lib/db/decision/` file; re-run clean,
  owner unknown, untouched by this lane).
- `npm run build` (`vite build` + server bundle): PASS (`dist/server.cjs` emitted).
- Learning scope isolation: `npx vitest run src/lib/learning` green throughout.

## 3. Architecture audit
- Domain boundaries: PASS. Pure engines `src/lib/learning/` (no React/IO/clock/random/network);
  orchestration `src/services/learning/`; no repository yet (correct: no backend); zod schemas
  at boundary; UI presentation-only (Path/Dashboard additions call the service).
- Dependency direction: PASS. Engines ← service ← UI. Catalog is the single source of truth;
  graph/tutor/studio derive from it. Zero imports from trading/risk/portfolio/strategy/macro/
  multi-asset/market providers (grep-verified; invariant test green).
- Failure semantics: PASS. Unknown ids → null/COMPLETE; unanswered → 0 (explicit); no-evidence →
  no-certificate; illegal transitions → no-op; corrupt store → empty (hardened this pass);
  stale versions → REVISION_REQUIRED (never silent inheritance).

## 4. Data audit
- Persistence: LOCAL ONLY (4 → 7 localStorage keys, all namespaced, fail-safe, version-stamped
  where it matters). Documented as single-learner; backend deferred with reserved `0003` slot.
- Versioning: lesson completions + assessment attempts + project records pin catalog versions;
  eligibility requires current-version passes. Lesson v1→v2 carryover surfaces as stale (P1
  remediation implemented), not silent.
- Provenance: DataBadge on all content + chips/banners in UI + tutor provenance tags + certificate
  evidence bundles. No REAL badge is ever emitted by learning code.
- Learner ownership: explicit `LearnerIdentity` + scoped key-prefix stores (userId-ready, still
  local). No fake multi-user claims.

## 5. Phase audits
- Adaptive (L09): deterministic (equality-tested), explainable (WHY/evidence objects rendered),
  mastery-integrated (weak-first, UNDERSTANDING→review), graph-backed prereqs (integration proven
  by unchanged test outcomes).
- Projects (L10): 8-state lifecycle derived deterministically; version-pinned records; prereq
  enforcement; resubmission counted with pass latching; UI submit→pass→complete flow.
- Assessment (L11): 7-question versioned paper; rubric + competency gates (data-safety 1.0 gate);
  append-only attempts; eligibility names missing pieces; deterministic local certificate;
  full transition table with terminal states.
- Knowledge graph (L12): 9 node kinds / 8 rels; real catalog validates clean; all six integrity
  classes detected by test (one genuine builder dup caught and fixed during development);
  traversal bounded + cycle-safe; consumed by L09 and L13 (non-decorative).
- AI Tutor (L13): TRADE_ACTION/MARKET_FACT always refuse (EN+VI); catalog-match answers carry
  VERIFIED + lesson ref; validator enforces provenance tags, bans advice verbs, requires explicit
  refusals; stub adapter only — zero network imports.
- Instructor (L14): linear lifecycle; patch-bump versioning; per-object + full-catalog validators;
  publish fails closed with itemized errors; real catalog publishes clean.
- Training (L15): windowed enrollment (explicit asOfDate); cohort aggregation (dropped excluded,
  deterministic order); tier ordering; enrollment-gated posting. No social network, no payments.

## 6. Security audit
Authorization: no backend → nothing to bypass; all credentialed claims deferred. Input validation:
zod on project/assessment submissions; finite-guards in scoring; no dynamic evaluation anywhere
(grep-clean for eval/Function). Certificates are local attestations labeled non-accreditation.
AI tool boundaries: no tools wired; policy+validator are the boundary. Prompt-injection surface:
none (no LLM connected).

## 7. Product readiness (per-area classification)
- Adaptive recommendations: PRODUCTION READY (single-learner).
- Projects (sandbox self-check): PRODUCTION READY (single-learner).
- Assessment + local certificates: PARTIALLY READY (mechanically complete; integrity is
  self-attested until server grading lands).
- Knowledge graph: PRODUCTION READY (single-learner).
- AI Tutor: FOUNDATION READY (no model, no UI).
- Instructor studio: FOUNDATION READY (no UI, no persistence).
- Customer training/community: FOUNDATION READY (domain only).
- Multi-user production platform: DEFERRED (P1 backend track).

## 8. Gap classification (final)
- P0 BLOCKER: 0.
- P1 REQUIRED: 1 remaining — backend persistence/identity/RBAC before any PRODUCTION credential,
  studio-mutation, or training claim. Scoped OUT of lane-local certification (repo precedent:
  lane-local CERTIFIED, integration/production pending). Does not invalidate single-learner certs.
- P2 IMPORTANT: attempts pruning/recency, remedial path branching, server-graded integrity design,
  tutor model wiring + system-docs RAG, live provenance-guarded reads.
- P3 OPTIONAL: learning search, analytics pipeline, catalog breadth (Skills, Paths B–F), graph UI.
- P4 FUTURE: payments/monetization, marketplace, B2B, full community/moderation.

## 9. Remediation log (audit → fix → re-test, all in-pass)
1. Store shape-robustness: valid-JSON/wrong-shape and null entries crashed getters → added
   `readArr` + element guards + 2 tests. Re-test: green.
2. Graph builder duplicate edge (lesson refs vs system links agreeing) caught by validator →
   builder dedupes, validator stays strict + 1 test. Re-test: green.
3. Tutor classifier paren typo (would not compile) → fixed + `u` flag. Re-test: green.
4. `failedCompetencies` computed but not persisted on attempts → stored on type + return. Re-test: green.
5. Version-aware progress + learner scoping (P1 foundation) → implemented + 8 tests. Re-test: green.
Remaining: P1-backend (out of scope by design), P2–P4 (documented, deferred).

## 10. Final criteria (§29) — checked
[x] Foundation requirements satisfied (P1-actionable items done; backend tracked, out of scope)
[x] L09–L15 implemented [x] Architecture coherent [x] Persistence verified (local; backend deferred+documented)
[x] Versioning verified [x] Multi-user boundary explicit [x] Adaptive deterministic [x] Project lifecycle verified
[x] Assessment integrity verified (local grade) [x] Certification logic verified [x] Graph integrity verified
[x] Tutor safety boundary verified [x] Instructor publishing boundary verified [x] Training boundary verified
[x] No fabricated data / silent mocks / hidden fallback (grep + test evidence)
[x] No protected-system corruption / cross-lane changes (status + import audit)
[x] Tests/typecheck/build pass [x] P0=0 [x] P1=0 within lane-local scope (1 backend P1 tracked, out of scope)
[x] Evidence audit complete [x] Remediation complete (5 items, all re-tested)

## 11. Git footprint (this lane only)
New (untracked, Learning-owned): 8 `src/lib/learning/*.ts` engines, 8 `__tests__` files, plus prior-turn
MVP/L09/L10 files; 8 docs (`LEARNING_*`); prior-turn pages/service/schema/widgets.
Modified (shared, minimal): `src/pages/RecommendationsPage.tsx` (2-line LearnThis, prior turn).
Untouched: all other lanes' modified/new files, Phase 27–30, protected systems, migrations, config.
No staging, no commits performed (shared worktree; awaiting explicit commit authorization).
