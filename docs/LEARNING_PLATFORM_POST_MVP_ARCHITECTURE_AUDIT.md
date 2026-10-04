# LEARNING PLATFORM — POST-MVP ARCHITECTURE AUDIT
Status: DISCOVERY COMPLETE | Date: 2026-10-04 | Scope: LEARNING-09 → LEARNING-15 readiness
Follows: `docs/LEARNING_PLATFORM_DISCOVERY_REPORT.md` (LEARNING-01), `docs/LEARNING_PLATFORM_ROADMAP.md` (MVP slice).
Baseline claim in launching prompt (`LEARNING-01→08 CERTIFIED`) is PARTIALLY TRUE — see §MVP Baseline.

## Executive Summary
- Learning Hub MVP is real and certified lane-local: static versioned catalog (7 lessons, 11 exercises, 1 lab, 1 path),
  4 pure deterministic engines, localStorage-backed service, 4 UI pages, 5/5 contextual system links, 14 tests green.
- Backend posture is CLIENT-ONLY: zero learning routes in `server.ts`, zero learning tables in `drizzle/`,
  no `LearningRepository`. Auth exists (Firebase `requireAuth`, `getOrCreateUser`) but authorizes exactly one route
  (`GET /api/users/me`); roles are a `role default 'user'` column with no RBAC enforcement.
- LEARNING-09 (adaptive) is implementable WITHOUT backend: all inputs (progress, attempts, mastery) are local and
  deterministic. GO.
- LEARNING-10 (projects) is implementable WITHOUT backend as sandboxed self-check projects. GO after L09.
- LEARNING-11 (certification issuance), LEARNING-14 (studio), LEARNING-15 (training/community) REQUIRE backend
  (identity, audit trail, versioning) and are specified as contracts only in this phase. DEFER implementation.
- LEARNING-12 (knowledge graph) is implementable as a pure derived graph over the existing catalog. GO after L10.
- LEARNING-13 (AI tutor) gets grounding contract + context-builder interface only; no model wiring in this phase.
- No migration is created by this audit (§14 of launching prompt: discovery creates no migrations).

## MVP Baseline
Claimed: LEARNING-01→08 CERTIFIED. Verified:
- LEARNING-01 Discovery: DONE (`LEARNING_PLATFORM_DISCOVERY_REPORT.md`).
- LEARNING-02 Content model: DONE (`types.ts` + `catalog.ts` v1.0.0-mvp + `schemas/learningSchema.ts`).
- LEARNING-03 Hub MVP: DONE (Dashboard/Path/Lesson/PracticeLab + Sidebar LEARN + SafetyBanner/DataBadgeChip).
- LEARNING-04 Path engine: DONE basic (prereq chain + deterministic next-lesson). Adaptive layer MISSING → L09.
- LEARNING-05 Practice engine: DONE for 6/8 types (KNOWLEDGE/CALCULATION/INTERPRETATION/SYSTEM_NAVIGATION/DECISION/
  DEBUGGING); BUILD/DEFEND exist as types only, no exercises → L10 covers via projects.
- LEARNING-06 Assessment & mastery: DONE basic (MasteryEngine evidence-gated + scoring deterministic). Review
  scheduling + weak-topic surfacing MISSING → L09.
- LEARNING-07 System-integrated: DONE (5/5 `LearnThis` links: StockDetail/RiskCenter/Portfolio/Recommendations/DataStatus).
- LEARNING-08 Projects: NOT IMPLEMENTED (no project entity, no catalog entries, no UI). Baseline claim is aspirational;
  L10 implements the MVP-grade slice (1 sandboxed beginner project + engine + tests).

## Current Architecture
- `src/lib/learning/`: `types.ts` (domain), `catalog.ts` (static PUBLISHED content + PREREQUISITES chain),
  `ExerciseScoringEngine.ts` (deterministic, tolerance-aware), `MasteryEngine.ts` (evidence-gated states),
  `LearningRecommendationEngine.ts` (`recommendNext`: failed-exercise → path-order → review → complete),
  `ProgressStore.ts` (localStorage `vnstock_learning_*_v1`, fail-safe), `systemLinks.ts` (5 links), `index.ts` (barrel).
- `src/services/learning/LearningService.ts`: orchestration (catalog + progress + scoring + mastery + recommendation).
- UI: `LearningDashboardPage` (progress/next/weak/mastered), `LearningPathPage` (prereq locks), `LearningLessonPage`
  (sections + inline exercises + WHY feedback), `PracticeLabPage` (SIMULATED 4-ticker + evidence checkboxes).
- Invariants enforced by test: determinism, evidence-gated mastery, prereq ordering, fail-safe unknown ids,
  learning↛trading import isolation.

## Current Data Model
Static catalog types: KnowledgeDomain → Topic → Concept → Lesson (sections/examples/keyPoints/systemFeatureRefs/
dataBadge) → Exercise (8 types, options/correctAnswer/tolerance/explanation/expectedReasoning/conceptRefs/
systemFeature) → LearningPath (lesson|exercise|lab items) → PracticeLab (evidenceRequired) + PREREQUISITES map.
Runtime types: LessonProgress, ExerciseAttempt, ConceptMastery, ScoredResult, Recommendation. No project,
assessment, certification, skill, or graph-edge entities yet.

## Current Persistence
localStorage only (`vnstock_learning_progress_v1`, `vnstock_learning_attempts_v1`, `vnstock_learning_labs_v1`)
behind `IProgressStore` (DB-ready interface). No server persistence, no multi-device, no user binding.
Transition to backend is REQUIRED once certification/projects/instructor/customer-training need identity + audit
trail. Draft SQL already reserved in `LEARNING_PLATFORM_ROADMAP.md` §4 (`learning_progress/mastery/attempts`).

## Current Auth
Firebase client + `firebase-admin` `requireAuth` (`src/middleware/auth.ts`); `getOrCreateUser` upserts
`users(uid,email,role default 'user')`. Only `GET /api/users/me` is gated; market/trading routes are paper-public.
No RBAC, no OWNER/ADMIN/INSTRUCTOR roles enforced. Learning MVP correctly avoids auth entirely (anonymous local
progress, no PII). Distinction: authentication (Firebase identity) ≠ authorization (none yet) ≠ ownership
(future `user_uid` FK) ≠ tenant isolation (future org/cohort scope — not designed yet).

## Current APIs
No `/api/learning/*` routes. Conventions to follow when needed: Express routes in `server.ts`, zod validation in
`src/schemas/*`, class-static repositories in `src/lib/db/*` over drizzle `db` (append-only precedent:
`EarningsFactsRepository`). Future endpoints stay as roadmap-defined (paths/lessons/attempt/progress/mastery/
recommendations/projects/certifications), implemented only when persistence lands.

## Current Frontend
React 19 + Vite 6 + Tailwind v4 terminal theme; string-`currentView` router in `useAppStore`; TanStack Query for
market data (learning uses none — pure local). Learning screens reuse terminal styling + educational spacing +
SafetyBanner. No learning search yet (reserved).

## Current Learning Engines
- Scoring: exact option-id / numeric tolerance / case-insensitive text; feedback = head + Why + Expected reasoning
  + Concept + Feature + Next. Deterministic, tested.
- Mastery: best-score-per-exercise averaged per concept; MASTERED requires avg≥0.85 over ≥2 exercises; lesson-open
  alone never masters. REVIEW_REQUIRED exists in type but is never emitted.
- Recommendation: failed-first (lowest avg, id tiebreak) → path order with prereq backfill → unattempted review →
  COMPLETE; unknown path fails safe. No mastery awareness, no difficulty ordering, no explanation object.

## LEARNING-09 Gap
Missing: mastery-aware ordering, weak-topic detection, UNDERSTANDING→review scheduling, difficulty-aware sequencing,
explanation (WHY THIS / WHY NOW / MISSING PREREQ / EVIDENCE). All inputs available locally → pure-engine scope.
Acceptance: `recommendAdaptive` + `explainNext` deterministic; weak-first ordering tested; explanation renders in
Dashboard Continue card; existing `recommendNext` untouched (back-compat).

## LEARNING-10 Gap
Missing: entire project layer (entity, catalog, submission/self-check engine, UI, evidence checklist). MVP slice:
1 sandboxed beginner project ("Analyze one company") with evidence checklist + self-check scoring, isolated from
trading (no execution imports; SIMULATED/EDUCATIONAL labels). No backend.

## LEARNING-11 Gap
Missing: certification requirements/evidence/scoring/expiry/versioning/identity/audit-trail. Requires backend
identity + persistence → CONTRACT ONLY in this phase (types + requirement matrix, no issuance).

## LEARNING-12 Gap
Missing: graph nodes/edges beyond lesson PREREQUISITES. Implementable pure: derive Domain→Topic→Concept→Lesson→
Exercise→Lab + SystemCapability nodes with REQUIRES/TEACHES/PRACTICES/APPLIES edges from catalog; traversal helpers
(prereq chain, concept→lessons, gap detection) + tests. GO after L10.

## LEARNING-13 Gap
Missing: tutor context + grounding. Scope: `TutorContextBuilder` interface (Knowledge Graph + mastery + lesson +
history + provenance) + response envelope (VERIFIED/EXPLANATION/ASSUMPTION/SIMULATION/UNKNOWN) with no model wiring.
No AI-generated content becomes authoritative without review.

## LEARNING-14 Gap
Missing: authoring (CRUD + DRAFT/REVIEW/PUBLISHED/ARCHIVED + versioning). Requires backend + RBAC → CONTRACT ONLY
(entity lifecycle + version/audit semantics, no UI).

## LEARNING-15 Gap
Missing: org/cohort/enrollment/community. Requires backend + moderation/privacy design → CONTRACT ONLY
(extension points + data-model sketch, no social features).

## Target Architecture
Client engines stay pure/deterministic (`src/lib/learning/`); orchestration in `src/services/learning/`; future
server layer mirrors existing conventions (`server.ts` routes → zod schemas → `LearningRepository` → drizzle).
Auth: Firebase identity + `user_uid`-scoped tables; RBAC roles added only when studio/training lands. AI Tutor reads
only approved catalog + derived graph + learner snapshot; output labelled by provenance class.

## Data Model (evolution)
Add (client-side now): `Project` (checklist/self-check), graph views (derived, no new source tables).
Reserve (backend later): `learning_progress/mastery/attempts` (roadmap SQL), `learning_projects/submissions`,
`learning_certifications` (with version, evidence refs, expiry, audit timestamps). Content objects keep
id/version/status/difficulty/prereqs/objectives/evidence.

## API Model
Deferred until persistence. Contract: `GET /api/learning/paths|lessons/:id|exercises/:id|labs`, `POST
/api/learning/exercises/:id/attempt`, `GET /api/learning/progress|mastery|recommendations`, `POST
/api/learning/projects/:id/submit`, `GET /api/learning/certifications` — all auth-gated, user-scoped.

## Auth/Authz
No change in L09/L10/L12 (anonymous local learning). Certification+ stages require: `requireAuth` on learning
routes, `user_uid` ownership on every row, instructor/admin roles for studio issuance, org/cohort scoping for
training. Do not mistake Firebase authentication for authorization.

## Knowledge Graph / Adaptive / Certification / Projects / AI Tutor / Studio / Training
Per-gap sections above. Ordering: L09 → L10 → L12 → L13-contract → L11/L14/L15-contracts → L15 hardening.

## Security
Learning code must never import trading/risk execution (tested invariant), never call market APIs for content,
never persist PII (anonymous local progress), never render unpublished content (PUBLISHED-gate in service),
never present SIMULATED figures as market data (badge + banner). Future server routes must be auth-gated and
user-scoped; studio mutations require role checks.

## Privacy
MVP holds no identity. Backend phases must scope all learning rows by `user_uid`, avoid cross-user aggregates
without role + purpose, and keep community features (if ever) behind explicit consent + moderation.

## Provenance
Content versioned (`CATALOG_VERSION`); every exercise carries `dataBadge`; valuation-adjacent content splits
FACT/ASSUMPTION/ESTIMATE/MODEL OUTPUT; tutor/future outputs must carry provenance class; UNKNOWN/INSUFFICIENT_DATA/
NOT_VERIFIED are valid outcomes.

## Failure Modes
Unknown ids → null/COMPLETE fail-safe (tested); STALE data → block, never average; missing backend (future) →
local mode with explicit sync state, never silent loss; provider failure → UNAVAILABLE, not fabricated progress.

## Testing
Per-phase: unit + determinism + persistence/authz-where-applicable + isolation + regression. Baseline guards:
`npx tsc --noEmit`, `npx vitest run`, `npm run build`. Never weaken existing tests.

## Performance
Catalog is static and tiny; engines are O(catalog × attempts) pure functions — no perf work needed. Future server
tables need `(user_uid, lesson_id)` / `(user_uid, concept_id)` PKs + `created_at` indexes (in reserved SQL).

## Migration Strategy
No migration in L09/L10/L12 (client-only). Backend landing order: `0003_learning_progress` (progress/attempts/
mastery) → `0004_learning_projects` → `0005_learning_certifications`, each additive, each reserved against the
agent registry, never renumbering another lane. Drizzle has 0000_phase24/0001_phase26/0002_phase27; next free is 0003.

## Implementation Dependencies
L09: none (local). L10: L09 certified (recommendation should surface project at the right moment). L12: L10
(projects become graph nodes). L13: L12 (graph context). L11/L14/L15: backend identity+persistence (external
dependency — contracts only). No dependency on Phase 28/29/30; CodeGPT lane proceeds independently.

## Acceptance Criteria
L09: adaptive recommendation deterministic + explained; weak-first; review surfacing; Dashboard shows WHY;
all green + isolation intact. L10: 1 project submittable with evidence checklist + self-check; sandboxed;
tests green. L12: graph traversal/gap detection tested. Contracts (L11/L13/L14/L15): types + docs, no fake
implementation. Final: `LEARNING_PLATFORM_STATUS: CERTIFIED` only with all implemented phases evidenced.

## Deferred Scope
Backend persistence, server routes, RBAC, certification issuance, studio UI, community/social, tutor model wiring,
learning search, multi-device sync. Documented as contracts, not built.

## GO / NO-GO
GO for L09 (no blockers). GO for L10/L12 after L09 certifies. CONTRACT-ONLY for L11/L13/L14/L15 backend-dependent
parts. NO-GO for any migration or server route in this pass. NO-GO for touching Phase 28/29/30, protected systems,
or another lane's files.
