# LEARNING FOUNDATION AUDIT

## Executive Summary
- The Learning MVP is REAL and verified in the working tree: catalog (7 lessons, 11 exercises, 1 lab, 1 path,
  1 project), 6 pure deterministic engines, localStorage-backed service, 4 UI pages, 5/5 contextual system links.
  Evidence this audit: `tsc --noEmit` PASS, learning scope 3 files / 25 tests PASS, zero trading/risk imports.
- IMPORTANT TREE-STATE NOTE: the working tree already contains LEARNING-09 (AdaptiveLearningEngine + 6 tests +
  Dashboard wiring) and LEARNING-10 (Project model/engine/tests + Path-page UI) as UNCOMMITTED lane-local work.
  They are audited below as IMPLEMENTED, not as certified mainline. This prompt's baseline (L01→08) is therefore
  understated; the audit reports the actual tree.
- Foundation verdict: single-user deterministic foundation is SUFFICIENT for the pure track (adaptive, projects,
  knowledge graph, tutor contracts). Multi-user persistence/authorization does NOT exist (localStorage only, no
  learning routes/tables, no RBAC) and is REQUIRED before certification issuance, studio, or training — tracked as
  P1, parallel backend track, not a blocker for L12.
- No P0 blockers. Recommendation: OPTION A (proceed; next is L09/L10 certification then L12 Knowledge Graph),
  with the P1 backend track (`0003_learning_*` + auth-gated routes) running in parallel before L11/L14/L15.

## Repository Baseline
- Branch: `main`, HEAD `c00dced` (Phase 29 integrated: `e67a656` portfolio + `c00dced` multi-asset since prior audit).
  Single worktree `D:/Stock/VN-STOCK-AI-PRO`. No reset/clean performed.
- Learning files are UNTRACKED (lane-local, never committed): `src/lib/learning/**`, `src/services/learning/**`,
  `src/components/learning/`, 4 Learning pages, `src/schemas/learningSchema.ts`. One SHARED edit:
  `src/pages/RecommendationsPage.tsx` modified (LearnThis link; 2 lines).
- Governance docs present: `docs/AGENT_PARALLEL_EXECUTION.md`, `docs/prompts/LEARNING_PLATFORM_AUTONOMOUS_ROADMAP.md`,
  `docs/LEARNING_PLATFORM_DISCOVERY_REPORT.md`, `docs/LEARNING_PLATFORM_ROADMAP.md`,
  `docs/LEARNING_PLATFORM_POST_MVP_ARCHITECTURE_AUDIT.md`. Repository evidence wins over docs where they differ
  (one difference found: baseline claims L01→08 certified, but L08 project layer only exists via the L10 work).

## Current MVP Certification Evidence
- `tsc --noEmit`: PASS (exit 0, this audit).
- Learning tests: 3 files / 25 tests PASS (`learningEngines` 14, `adaptiveLearning` 6, `projectEngine` 5).
- Isolation invariant (learning↛trading imports): PASS by test + re-grepped clean this audit.
- Full suite last known: 158 files / 1635 tests PASS (prior turn; not re-run — this is a read-only audit and the
  full-suite state belongs to all lanes; learning scope re-verified here).
- `vite build`: PASS per prior turn evidence; not re-run in this audit (writes `dist/`).
- MVP acceptance (roadmap §6): path/lessons/exercises-with-WHY/persistence/evidence-mastery/deterministic-next/
  lab/contextual-links/no-fabrication all IMPLEMENTED and tested.

## Current Learning Architecture
- `src/lib/learning/`: `types.ts`, `catalog.ts` (`CATALOG_VERSION='1.0.0-mvp'`, 48 ids), `ExerciseScoringEngine.ts`,
  `MasteryEngine.ts`, `LearningRecommendationEngine.ts`, `AdaptiveLearningEngine.ts` (L09, untracked),
  `ProjectEngine.ts` (L10, untracked), `ProgressStore.ts` (4 localStorage keys), `systemLinks.ts` (5 links),
  `index.ts` barrel. All pure: no React, no IO, no clock, no trading imports.
- `src/services/learning/LearningService.ts`: orchestration only (catalog + progress + scoring + mastery +
  recommendation + projects). No fetch, no DB. Correct layering, no violation.
- UI: Dashboard (progress/next/weak/mastered + adaptive WHY), Path (prereq locks + project self-check),
  Lesson (sections + inline exercises + feedback), PracticeLab (SIMULATED + evidence checkboxes). Sidebar LEARN
  group; string-`currentView` router; no learning data fetching.
- Ownership: Learning-owned (all new files) + 1 minimal SHARED edit (RecommendationsPage LearnThis). PROTECTED
  (RiskGuard/TradingEngine/RiskManager/PositionSizer/providers/Phases 27-30): untouched. FOREIGN: none touched.

## Content Model Audit
| Entity | Exists | Versioned | Identifiable | Ordered | Prereq-aware | Difficulty-aware | Mastery-aware | Persisted | Testable |
|---|---|---|---|---|---|---|---|---|---|
| Domain/Topic/Concept | yes | yes (catalog v) | yes | no (flat) | n/a | no | via mastery | no (static) | yes |
| Lesson | yes (7) | yes | yes | via path | yes (chain) | yes | no | progress only | yes |
| Example | yes | yes | no (embedded) | yes | no | no | no | no | PARTIAL |
| Exercise | yes (11, 6 types used) | yes | yes | no | via lesson | yes | yes (scoring→mastery) | attempts local | yes |
| Assessment | NO (exercises act as such) | — | — | — | — | — | — | — | MISSING |
| Project | yes (1, L10) | yes | yes | no | no | yes (level) | no | completion local | yes |
| Skill | NO | — | — | — | — | — | — | — | MISSING (L12 node) |
| Prerequisite | yes (lesson→lesson map) | no | n/a | chain | yes | no | no | no | yes |
| Learning Path | yes (1) | yes | yes | yes | yes | no | no (L09 explains) | progress only | yes |
- Evolvability: additive entities (Skill, Assessment, graph edges) fit without rewrite; content stays static-typed.
  BUILD/DEFEND exercise types exist but have no exercises — by design deferred to projects.

## Content Versioning
- Statuses DRAFT/REVIEW/PUBLISHED/ARCHIVED exist in types; service gates on PUBLISHED. Only PUBLISHED ships.
- Single `CATALOG_VERSION` stamps every object. No per-object revision, no effective date, no migration of progress.
- ANSWER to v1→v2 question: progress keys are bare lesson/exercise ids with NO version recorded, so a learner
  completed on v1 is treated as completed on v2 SILENTLY (stale-completion carryover). No corruption, but no
  invalidation either. Required architecture (P1, before certification): record `catalogVersion` per progress/
  attempt row; on version bump, mark affected items `REVIEW_REQUIRED` instead of dropping them.

## User / Authentication Audit
- Firebase client + `firebase-admin requireAuth` (`src/middleware/auth.ts`); `getOrCreateUser` upserts
  `users(uid,email,role default 'user')`. Exactly ONE gated route (`GET /api/users/me`).
- Learning uses NO auth: anonymous local progress, no PII. Correct for MVP.
- Authentication (Firebase identity) ≠ Authorization (none) ≠ User identity for learning (none) ≠ Learning
  profile (none) ≠ Ownership (no user_fk anywhere in learning) ≠ Roles (column only, unenforced).
- User A isolation: NOT SUPPORTED — same browser shares keys; User B on same machine sees User A's progress.
  No cross-device, no recovery. Acceptable pre-backend; BLOCKED for certification/training claims.

## Authorization / Ownership
- Current: none. Future requires: `requireAuth` on `/api/learning/*`, `user_uid` on every learning row,
  role checks (instructor/admin) for studio issuance, org/cohort scoping for training. No RBAC framework exists
  repo-wide — introducing the first enforced roles inside the learning backend is the thin end of that wedge.

## Progress Persistence
- `ProgressStore` (`IProgressStore`, DB-ready interface): 4 keys (`progress/attempts/labs/projects v1`), JSON,
  fail-safe (corrupt/missing → empty, never crash). Survives reload: yes. Device change: NO. User-specific: NO.
  Version-aware: NO. Auditable: NO (no timestamps on completions except lesson `completedAt`, no actor).
- Classification: LOCAL ONLY. Minimum production architecture: `learning_progress (user_uid, lesson_id, completed,
  catalog_version, timestamps)` + `learning_attempts` + `learning_mastery` per reserved roadmap SQL, behind
  `LearningRepository` mirroring existing static-repository conventions, additive migration `0003`.

## Mastery Engine
- Evidence: best-score-per-exercise averaged per concept; MASTERED needs avg≥0.85 across ≥2 exercises; lesson-open
  alone yields LEARNING at most — verified by test (`lesson open alone does not master`). Clicks/views are NOT
  evidence (no such inputs exist). Deterministic: yes. Reproducible: yes (pure of snapshot). Explainable: PARTIAL
  (states + scores exposed; L09 adds evidence strings). Persistable: snapshot is serializable. Version-aware: NO.
- Unused: `REVIEW_REQUIRED` (typed, never emitted); difficulty/recency/repetition/topic-weighting not modeled —
  L09 covers review-scheduling deterministically WITHOUT wall-clock (clock is banned in engines); recency stays
  deferred until backend timestamps exist.

## Recommendation Engine
- Base (`recommendNext`): failed-first → prereq-ordered path → unattempted review → COMPLETE; unknown path
  fail-safe. Deterministic yes, prerequisite-aware yes, difficulty-aware NO, mastery-aware NO, explainable NO
  (single `reason` string).
- Adaptive (L09, in tree): weakest-concept-first failures, UNDERSTANDING→REVIEW scheduling, difficulty-ordered
  review, full `AdaptiveExplanation` (WHY THIS / WHY NOW / MISSING PREREQUISITES / EVIDENCE / weak+review lists).
  Answers all six audit questions. Gap CLOSED at engine level; certification/integration pending.

## Practice System
- Types used: KNOWLEDGE, CALCULATION (tolerance), INTERPRETATION, SYSTEM_NAVIGATION, DECISION, DEBUGGING (6/8).
  BUILD/DEFEND: typed, no exercises — covered via L10 project (build an analysis + defend in thesis paragraph).
- Pipeline per exercise: prompt + options-or-numeric + scoring + feedback (head/Why/Expected reasoning/Concept/
  Feature/Next) + attempt history + retry + difficulty + mastery impact via conceptIds. Solution = explanation
  (no hidden answer-key risk). Serious-lab requirements met for MVP: SIMULATED banner, evidence checkboxes,
  self-check gating, no buy/sell.

## Learning Paths
- Static, versioned, prerequisite-aware; NOT dynamic/mastery-aware/personalized (L09 explanation annotates but
  does not reorder the path). Chained prerequisites = linear `Investment Basics → …` style sequences without
  hardcoding (data-driven `PREREQUISITES` map + path items). Branching/remediation paths: MISSING (P2).

## Knowledge Graph Readiness
- Exists: Concept→Topic→Domain linkage, Lesson→Concept refs, Exercise→Concept refs, Lesson→Lesson prereqs,
  Lesson→SystemFeature refs. Reusable as-is for nodes + TEACHES/PRACTICES/APPLIES/REQUIRES edges.
- Redesign needed: none structural — L12 is a DERIVED pure layer (adjacency + traversal: prereq chain,
  concept→lessons, gap detection) plus a future `Skill` node. No migration, no backend. READY.

## Project Learning Readiness
- Implemented (L10, in tree): `Project` entity, 1 PUBLISHED sandbox project with 4-evidence rubric, deterministic
  `scoreProject`, completion persistence, Path-page self-check UI with zod validation. Sandbox boundary: no
  execution imports, EDUCATIONAL labels, self-attested (no instructor grading — backend-gated).
- Still missing for full L10 vision: intermediate→engineer projects, peer/instructor review, mastery impact of
  projects on concepts (currently completion only, NOT mastery evidence — correct conservative choice).

## Assessment Readiness
- Formative assessment EXISTS (exercises + labs + project self-checks, all evidence-graded). Summative/credentialed
  assessment does NOT exist: no timed低温 exam entity, no attempt limits, no identity binding, no anti-cheat
  (answers are client-side; a learner can retry infinitely — fine for learning, invalid for certification).

## Certification Readiness
- Distinguishable today: Completion (progress) vs Understanding vs Mastery (engine states) — YES. Certifiable: NO.
  Missing: identity, criteria engine, scoring aggregation, issuer, certificate id/version/expiry, evidence bundle,
  audit trail, revocation. All require backend → CONTRACT-ONLY until the P1 backend track lands. No false
  certification exists anywhere (nothing claims to issue).

## AI Tutor Readiness
- Providable today: current lesson, path, mastery snapshot, exercise history, catalog (verified knowledge),
  systemLinks (capability refs). Missing: knowledge-graph context (→L12), tutor context-builder interface,
  provenance-labeled response envelope, grounding policy (catalog-only, FACT/EXPLANATION/ASSUMPTION/SIMULATION
  split per roadmap). Model wiring: explicitly deferred. Boundary design is specified; implementation is P2.

## System Knowledge Integration
- `systemLinks` (5) + per-lesson `systemFeatureRefs` + per-exercise `systemFeature` + lab guidance referencing
  RiskCenter/PositionSizer semantics. Verified used in 5 pages (10 `LearnThis` references). No duplicated
  financial logic found (grep: zero trading/risk imports in learning). Direction is correct: teach verified
  capabilities, link out, never re-implement. Deeper integration (live values with provenance/freshness shown
  inside lessons) is P2 and must wait for read-only learning API guards.

## Real vs Educational Data
- Classification EXPLICIT everywhere: `DataBadge` (SIMULATED/HISTORICAL/REAL/EDUCATIONAL) + `DataBadgeChip` +
  `SafetyBanner` on all 4 pages; catalog comment states all numerics are SIMULATED illustrative figures.
- No learning code path touches market APIs, providers, ortrading execution (verified). No fabricated REAL data:
  no prices, no P&L, no risk metrics presented as real. TEST_FIXTURE vs EDUCATIONAL: fixtures live only in
  `__tests__`, never imported by UI. No leakage channel found.

## API / Service Boundary
- `LearningService` = pure orchestration (catalog + store + engines). No business-logic-in-components violation
  beyond trivial view state; scoring/mastery/recommendation live in `lib`, never in pages. No persistence logic
  (store interface), no transport (no routes). Matches target layering exactly. Future: `LearningRepository`
  in `src/lib/db/` + zod schemas (already started) + Express transport. No violation to remediate.

## Database Readiness
- Drizzle PG; migrations `0000_phase24/0001_phase26/0002_phase27`; static class repositories (append-only
  precedent). No learning tables (verified: zero `learning` hits in schema/routes). Next free: `0003`.
- Necessary entities by phase: L-certification track → `learning_progress/attempts/mastery` (reserved SQL);
  L10-full → `project_submissions`; L11 → `certifications + evidence`; L14 → content-version tables; L15 →
  org/cohort/enrollment. None created (correct per governance).

## Security
- Documented, NOT fixed (per prompt): (1) localStorage progress is fully client-trusted — editable, no integrity;
  (2) no user isolation (shared machine = shared learner); (3) infinite retry + client-side answers = no
  assessment integrity (fine now, fatal for certification); (4) no IDOR surface yet (no backend ids); (5) role
  escalation n/a (no roles); (6) content is static-bundled (tamper = rebuild, visible); (7) future AI context must
  exclude secrets/PII. All become enforceable only with the backend track. No live vulnerability: nothing
  credentialed exists to steal.

## Performance
- 1 learner: trivial (sub-ms pure functions over ~50 catalog objects). 100–10k: unchanged client-side. 100k +
  backend analytics: UNKNOWN (no backend). Mastery is O(catalog × attempts); attempts arrays grow unbounded in
  localStorage — P2 cap/prune policy needed before scale (e.g., keep last N attempts per exercise). No caching
  needed now; server tables will want `(user_uid, lesson_id)` PKs + `created_at` indexes (in reserved SQL).

## Testing
| Area | Verdict |
|---|---|
| content validity (published-gate, refs resolve, prereq chain) | COVERED (tested) |
| scoring (exact/tolerance/text, feedback shape) | COVERED |
| mastery (evidence-gating, no mastery-on-open) | COVERED |
| recommendations (prereq order, failed-first, determinism, fail-safe) | COVERED |
| adaptive (weak-first, review, explanations) | COVERED (L09, uncertified) |
| projects (rubric, determinism) | COVERED (L10, uncertified) |
| progress persistence | PARTIAL (memory/localStorage happy path; no corruption/upgrade tests) |
| determinism | COVERED |
| versioning | MISSING (no version-aware behavior to test yet) |
| authorization / user isolation | MISSING (no backend; must-have with backend track) |
| failure states (unknown ids, corrupt store) | COVERED (fail-safe tests) |
- Mandatory before NEXT implementation (L12): keep all green (done); add corruption/upgrade unit tests for the
  store (P1, cheap); backend track must add authz/isolation tests from day one.

## Failure Semantics
- Missing/invalid content or exercise: service returns null → UI fail-safe message (tested). Missing mastery
  data: states degrade to NOT_STARTED/LEARNING, never MASTERED (tested). Missing prerequisite: backfill named
  explicitly (tested). Corrupt progress: store swallows → empty (PARTIAL — untested, P1 test). Unknown score:
  scoring returns 0/false, never NaN (finite-guarded). Unavailable system data: lessons teach UNAVAILABLE as
  blocking; learning never fetches, so no runtime case. AI unavailable / DB unavailable: no such paths yet;
  future rule — explicit sync state, never silent loss.

## Product Maturity
- CORE: content yes / paths yes-static / practice yes-6-types / progress yes-local / mastery yes / recommendation
  yes(+adaptive in tree) / projects yes-1-sandbox / assessment formative-only / relationships prereq-only (graph →L12).
- ADVANCED: tutor contracts-only / studio contracts-only / analytics events-reserved / personalization via L09.
- BUSINESS: training/org/community/marketplace/B2B — none; correctly not driving architecture (extension points
  reserved, nothing built). Verdict: serious single-user learning product; NOT YET a platform business.

## Gap Matrix
| # | Gap | Phase blocked | Priority |
|---|---|---|---|
| 1 | Progress not version-aware (v1→v2 silent carryover) | L11 | P1 |
| 2 | No backend persistence/identity/RBAC | L11/L14/L15 | P1 |
| 3 | No assessment integrity (infinite retry, client answers) | L11 | P1 |
| 4 | Store corruption/upgrade untested | L12+ | P1 |
| 5 | Unbounded attempts growth | scale | P2 |
| 6 | No dynamic/remedial path branching | L09-full | P2 |
| 7 | Tutor context-builder + grounding envelope | L13 | P2 |
| 8 | Live system-data-in-lessons (provenance-guarded reads) | advanced | P2 |
| 9 | Analytics pipeline | L14-studio | P3 |
| 10 | Search across catalog | UX | P3 |
| 11 | Skill nodes, multi-path catalog breadth | L12-full | P3 |

## P0 Blockers
None. No security, ownership, migration, or architectural contradiction blocks the next pure-track phase.

## P1 Required
1. Version-aware progress (record `catalogVersion`; bump → REVIEW_REQUIRED, §Content Versioning).
2. Backend track: `0003_learning_progress` (progress/attempts/mastery) + `LearningRepository` + auth-gated
   read-only routes + user-scoped tests — before any certification issuance or instructor feature.
3. Assessment-integrity design (server-graded or attempt-capped) before L11.
4. Store corruption/upgrade + attempts-cap tests.

## P2 Important
Dynamic/remedial branching, tutor grounding envelope (L13), attempts pruning, live provenance-guarded reads.

## P3 Optional
Learning search, analytics pipeline, catalog breadth (Skills, Paths B–F), community extension points.

## Recommended Next Phase
OPTION A — Foundation is sufficient → certify/integrate L09+L10 (already implemented in tree), then LEARNING-12
Knowledge Graph (pure derived layer, zero backend, zero migration). The P1 backend track runs IN PARALLEL and
gates only L11/L14/L15. A was not chosen by default: the decision rests on the verified facts that (a) every L12
input already exists locally, (b) no L12 output requires identity or persistence, and (c) the multi-user gaps,
though real, are provably uninvolved in graph derivation.

## Dependencies
- L12 needs: L09/L10 certification (engine stability for graph.edges like PRACTICES/ASSESSES). No external lane.
- Backend track needs: agent-registry reservation for `0003`, Firebase-admin patterns already in repo. No Phase
  28/29/30 dependency. CodeGPT lane proceeds independently; no shared files required.

## Acceptance Criteria
- L09/L10 certification: implementation exists (yes, in tree) + tests green (yes) + tsc/build green (yes) +
  evidence documented (prior turn reports) + security boundary verified (this audit) + integration commit scoped
  to Learning-owned files only.
- L12 entry: graph nodes/edges derived from catalog, traversal + gap-detection tested, no new backend, docs updated.

## GO / NO-GO
GO for L09/L10 certification-and-integration and for LEARNING-12. NO-GO for backend migrations/routes, studio,
certification issuance, or community until the P1 backend track is explicitly authorized. NO-GO for touching
protected systems or another lane's files.
