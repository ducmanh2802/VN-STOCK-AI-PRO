# LEARNING-14 — INSTRUCTOR / ADMIN STUDIO: CERTIFICATION
Status: CERTIFIED (lane-local, foundation-grade: lifecycle + validation gate, NO admin UI) | Date: 2026-10-04

## Objective
Authoring foundation: linear content lifecycle (DRAFT→REVIEW→PUBLISHED→ARCHIVED,
illegal moves are no-ops), immutable-published rule via version patch-bump helper,
per-object validators (required fields, reference resolution, prereq checks,
graph linkage, assessment mapping), full-catalog validation incl. bounded cycle
check, and a publish gate that fails closed.

## Files
- `src/lib/learning/ContentStudio.ts` (transitionContent, nextVersion, validateLesson/
  Exercise/Project/Assessment/Path, validateCatalog, publishContent)
- `src/lib/learning/__tests__/contentStudio.test.ts` (9 tests)
- `src/lib/learning/index.ts` (barrel)

## Acceptance (§14 + lifecycle/validation intent)
Create/edit/review/publish/archive/version semantics (pure transition + version
helper) / lifecycle enforced / publishing validation (fields, refs, prereqs,
graph links, assessment mappings, version consistency) / invalid content fails
closed (publish ok:false with itemized errors) / real catalog validates clean.

## Evidence
Learning scope green; full suite 174/1755 green; tsc 0; build pass.

## Security / Safety
Publishing permissions are code-level (no UI/mutating API exists); validator is the
enforcement point future studio UI/server must call. No content modified by this phase.

## Known limitations
No studio UI, no persistence of drafts, no roles (RBAC is P1 backend work),
no learner analytics. Duplicate/version-diff views deferred.

## Commit
Uncommitted (Learning-owned files above, ready for scoped commit).
