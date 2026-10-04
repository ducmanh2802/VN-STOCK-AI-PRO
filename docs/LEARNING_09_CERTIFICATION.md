# LEARNING-09 — ADAPTIVE LEARNING: CERTIFICATION
Status: CERTIFIED (lane-local, single-learner) | Date: 2026-10-04

## Objective
Mastery-aware, explainable recommendations: weakest-concept-first failures,
UNDERSTANDING→REVIEW scheduling, difficulty-ordered review, full WHY/evidence
explanations. Deterministic, no LLM, no clock in pure engines.

## Files
- `src/lib/learning/AdaptiveLearningEngine.ts` (recommendAdaptive, detectWeakConcepts, detectReviewConcepts)
- `src/lib/learning/__tests__/adaptiveLearning.test.ts` (10 tests)
- `src/lib/learning/index.ts`, `src/services/learning/LearningService.ts` (getAdaptiveRecommendation)
- `src/pages/LearningDashboardPage.tsx` (WHY NOW + evidence rendering)

## Acceptance (§9.4) — all covered by tests
mastery progression / weak detection / prerequisites / review scheduling /
ranking / tie-breaking (id order) / determinism / empty history / missing data
(unknown path fail-safe) / invalid state (maxScore 0) / completed path /
conflicting signals (failed exercise outranks completion).

## Evidence
- Learning scope green; full suite 174/1755 green; `tsc --noEmit` 0; `vite build` pass.
- L12 integration: prerequisite traversal moved to graph-backed helpers with zero behavior change (tests green).

## Security / Safety
Pure engine; no trading imports (invariant test); no PII; no clock/random.

## Known limitations
Review scheduling is attempt-based, not time-based (wall clock banned in engines).
Remedial path branching deferred (P2). Backend persistence deferred (P1 track).

## Commit
Uncommitted (shared worktree; Learning-owned files listed above, ready for scoped commit).
