# LEARNING-10 — APPLIED / PROJECT LEARNING: CERTIFICATION
Status: CERTIFIED (lane-local, single-learner) | Date: 2026-10-04

## Objective
Sandboxed project framework: evidence checklist + thesis rubric self-check,
deterministic lifecycle, prerequisite enforcement, version-pinned records,
resubmission history. Zero contact with trading execution.

## Files
- `src/lib/learning/types.ts` (Project.requiresLessonIds, ProjectStatus ×8, ProjectRecord)
- `src/lib/learning/catalog.ts` (PROJECTS: prj-company-101 + getProject)
- `src/lib/learning/ProjectEngine.ts` (scoreProject, checkProjectPrereqs, projectStatusOf, isTerminalProjectStatus)
- `src/lib/learning/__tests__/projectEngine.test.ts` (lifecycle/version/prereq/invalid tests)
- `src/lib/learning/ProgressStore.ts` (project records key), `IProgressStore` extended
- `src/services/learning/LearningService.ts` (list/get/submit/completeProjectStep)
- `src/schemas/learningSchema.ts` (SubmitProjectSchema)
- `src/pages/LearningPathPage.tsx` (project card: checklist + thesis + status + complete step)

## Acceptance (§10.4)
Lifecycle (NOT_STARTED→…→COMPLETED + terminal set) / versioning (stale pin →
REVISION_REQUIRED, record never mutates) / submission / resubmission (counted,
pass latches) / evidence (4-item rubric) / evaluation (deterministic rubric) /
prerequisite enforcement (fail-closed message) / invalid submission (null/false) /
deterministic transitions.

## Evidence
Learning scope green; full suite 174/1755 green; tsc 0; build pass.

## Security / Safety
Sandbox-labeled, EDUCATIONAL badges, prereq-gated, zod-validated input.
Project completion is NOT mastery evidence (conservative; documented).

## Known limitations
Single Beginner project; instructor grading deferred (backend); mastery impact of
projects deferred. SUBMITTED/UNDER_REVIEW/FAILED states reserved for the review track.

## Commit
Uncommitted (Learning-owned files above, ready for scoped commit).
