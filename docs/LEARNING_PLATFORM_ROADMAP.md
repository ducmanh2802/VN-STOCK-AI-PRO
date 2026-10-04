# LEARNING PLATFORM — ROADMAP (LEARNING-02..15)
Status: APPROVED FOR AUTONOMOUS EXECUTION | Date: 2026-10-04
Follows: `docs/LEARNING_PLATFORM_DISCOVERY_REPORT.md` ← source of truth for capabilities.

## 1. Phasing (merged to fit repo reality)
- LEARNING-01 Discovery — DONE (report above).
- LEARNING-02 Content model + catalog — MVP: static versioned catalog (`src/lib/learning/catalog.ts`) typed by `types.ts` + zod `schemas/learningSchema.ts`. No DB tables in MVP (deferred, SQL drafted in §5).
- LEARNING-03 Hub MVP (Personal Learning Hub) — Dashboard + Path + Lesson + Practice Lab + system links + progress/mastery/recommendation. Client-only, localStorage-backed. THIS RELEASE.
- LEARNING-04 Path engine — prerequisites + deterministic next-lesson (shipped in MVP, extended later with adaptive review).
- LEARNING-05 Practice & exercise engine — 8 types (MVP ships knowledge/calculation/interpretation/debugging/decision; build/defend via projects later) + feedback template (YOUR ANSWER/CORRECT-WHY/REASONING/CONCEPT/FEATURE/NEXT).
- LEARNING-06 Assessment & mastery — MasteryEngine (NOT_STARTED→LEARNING→PRACTICING→UNDERSTANDING→MASTERED + REVIEW_REQUIRED), evidence-gated, deterministic scoring.
- LEARNING-07 System-integrated learning — `systemLinks.ts` + `Learn this` on StockDetail/RiskCenter/Portfolio/Recommendations/DataStatus.
- LEARNING-08 Projects — MVP ships 1 beginner project (Analyze one company, evidence checklist); intermediate→engineer deferred.
- LEARNING-09 Certification — deferred; foundation: capstone + thresholds defined, no issuance in MVP.
- LEARNING-10 AI Tutor — deferred; grounding contract defined (catalog-only, FACT/EXPLANATION/ASSUMPTION/SIMULATION split).
- LEARNING-11 Instructor/Admin Studio — deferred; content lifecycle DRAFT/REVIEW/PUBLISHED/ARCHIVED reserved in types.
- LEARNING-12 Community — deferred; extension points reserved (no tables in MVP).
- LEARNING-13 Customer Training — deferred; PATH F reserved; foundation READY when MVP certified.
- LEARNING-14 Analytics — deferred; events interface reserved (`lesson_completed, exercise_attempted, mastery_changed`).
- LEARNING-15 Hardening & Certification — `tsc --noEmit` + `vitest run` (learning scope) + `vite build` + evidence audit → `LEARNING_PLATFORM_STATUS: CERTIFIED`.

## 2. MVP content scope (smallest coherent slice)
PATH A — "VN Beginnings" (complete beginner, 7 lessons, all PUBLISHED):
1. `les-market-101` What is a stock? (market-basics; uses Watchlist; KNOWLEDGE + CALC market-cap)
2. `les-price-volume-102` Price & volume/liquidity (Market page; INTERPRETATION HISTORICAL-style + DEBUGGING stale-data)
3. `les-index-sector-103` VN-Index/VN30/sectors/HOSE-HNX-UPCOM (Market Map; KNOWLEDGE)
4. `les-statements-104` Financial statements in 10 min (StockDetail fundamentals; CALC P/E + margin + DEBUGGING wrong-TTM)
5. `les-risk-105` Risk & position sizing (RiskCenter + PositionSizer 100-lot; CALC size + DECISION investigate-next)
6. `les-system-106` Using VN-STOCK-AI-PRO end-to-end (Screener→Detail→Watchlist→Paper; SYSTEM NAVIGATION)
7. `les-practice-107` Practice Lab briefing (SIMULATED ACB/FPT/HPG/VCB diversification; INTERPRETATION + evidence checklist)
Exercises: ≥1 per lesson (10 total MVP). Practice Lab: `lab-diversification-01` (SIMULATED EDUCATIONAL DATA banner, correlation/sector/size evidence checkboxes, no buy/sell).
System links (5): StockDetail→les-statements-104, RiskCenter→les-risk-105, Portfolio→les-risk-105, Recommendations→les-system-106, DataStatus→les-price-volume-102.
Safety: header disclaimer (education only, not advice); every simulated block labeled `SIMULATED EDUCATIONAL DATA`; valuation split FACT/ASSUMPTION/ESTIMATE/MODEL OUTPUT where shown; no real prices fabricated (catalog uses illustrative SIMULATED numbers only).

## 3. Domain model (MVP subset of §26)
Types: `KnowledgeDomain, Topic, Concept, Lesson (sections, examples, keyPoints, systemFeatureRefs, dataBadge), Exercise (8 types, options, correctAnswer, tolerance, explanation, conceptRefs, systemFeature), LearningPath (items lesson|exercise|lab), LearnerProgress (lessonId→completed), Attempt (exerciseId→score), Mastery (conceptId→state+score), Recommendation`.
Prereqs: `learning_prerequisites (lessonId→requiredLessonIds)` enforced in recommendation (locked until complete).
Statuses: content `PUBLISHED` only in MVP (DRAFT/REVIEW/ARCHIVED reserved); mastery `NOT_STARTED|LEARNING|PRACTICING|UNDERSTANDING|MASTERED|REVIEW_REQUIRED`.
Determinism: scoring + mastery + recommendation are pure functions of (catalog, progress, attempts); same input → same output; no randomness, no Date.now in engines.

## 4. Backend/API plan
- MVP: NO new server routes, NO schema.ts change, NO trading imports from learning code (enforced by test). `LearningService` client-only.
- Next (LEARNING-09/11): additive `drizzle/0003_learning_hub_mvp.sql`:
```sql
CREATE TABLE IF NOT EXISTS learning_progress (user_uid TEXT NOT NULL, lesson_id TEXT NOT NULL, completed BOOLEAN NOT NULL DEFAULT FALSE, completed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_uid, lesson_id));
CREATE TABLE IF NOT EXISTS learning_attempts (id SERIAL PRIMARY KEY, user_uid TEXT NOT NULL, exercise_id TEXT NOT NULL, score NUMERIC NOT NULL, max_score NUMERIC NOT NULL, correct BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS learning_mastery (user_uid TEXT NOT NULL, concept_id TEXT NOT NULL, state TEXT NOT NULL, score NUMERIC NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_uid, concept_id));
```
Endpoints (future, auth-gated): `GET /api/learning/paths|courses|lessons/:id|exercises/:id, POST /exercises/:id/attempt, GET /progress|mastery|recommendations|projects, POST /projects/:id/submit, GET /certifications`.

## 5. UI/UX
Terminal aesthetic preserved (`bg-terminal-surface`, mono numerals); learning screens more spacious; IA: LEARN → Dashboard / Paths / Practice Lab; dashboard answers Where-am-I/Next/Weak/Mastered/Review; lesson view: sections + examples + system-feature callout + exercises inline + feedback panel; lab: SIMULATED banner + question + evidence checkboxes + self-check.
Mobile bottom nav unchanged (MVP).

## 6. Testing & acceptance (binding)
- `src/lib/learning/__tests__/learningEngines.test.ts`: scoring deterministic (MC/calc-tolerance/case-insensitive-text), mastery evidence-gating, recommendation prereq-ordering + determinism, progress persistence interface, published-content validity, unavailable-content fail-safe, learning↛trading import isolation.
- Commands: `npx tsc --noEmit`, `npx vitest run src/lib/learning`, `npm run build` (vite). Full `npm test` must not regress (pre-existing suites untouched).
- MVP complete when discovery §8 criteria all met + audit passes. Then `LEARNING_PLATFORM_STATUS: CERTIFIED`, `CUSTOMER_TRAINING_FOUNDATION: READY` (foundation only — no community/customer tables claimed).
