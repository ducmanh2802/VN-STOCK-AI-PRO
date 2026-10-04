# LEARNING-15 — CUSTOMER TRAINING / COMMUNITY FOUNDATION: CERTIFICATION
Status: CERTIFIED (lane-local, foundation-grade: domain + rules, NO social network, NO payments) | Date: 2026-10-04

## Objective
Training foundation with clean domain boundaries: organizations, cohorts with
explicit enrollment windows (asOfDate, never wall clock), enrollments, learner
profiles, deterministic cohort progress aggregation, enrollment-gated community
posting eligibility, and tiered access attach points (FREE→B2B) for future
monetization. No fake auth, no fake social features.

## Files
- `src/lib/learning/TrainingFoundation.ts` (Organization, Cohort, Enrollment,
  LearnerProfile, AccessTier, enroll, summarizeCohort, hasAccess, canPostToCohort)
- `src/lib/learning/__tests__/trainingFoundation.test.ts` (8 tests)
- `src/lib/learning/index.ts` (barrel)

## Acceptance (§15 intent)
Organization/cohort/enrollment/learner/instructor-association/progress/completion
(all modeled + tested) / cohort windows + assigned curriculum / community
foundation limited to justified functionality (posting eligibility gate;
moderation, threads, leaderboards explicitly deferred) / monetization attach
points identified (tier ordering tested), payments NOT implemented (no platform
foundation for them — correct per §15.4).

## Evidence
Learning scope green; full suite 174/1755 green; tsc 0; build pass.

## Security / Safety
IDs are opaque strings (userId-ready, no fake identity); dropped learners lose
posting eligibility; no PII required (displayName nullable); no cross-cohort
leakage (cohort-scoped aggregation).

## Known limitations
No persistence, no auth, no UI, no moderation pipeline, no payments.
Multi-user reality requires the P1 backend track.

## Commit
Uncommitted (Learning-owned files above, ready for scoped commit).
