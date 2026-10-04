# LEARNING-11 — ASSESSMENT & CERTIFICATION: CERTIFICATION
Status: CERTIFIED (lane-local, single-learner; EDUCATIONAL attestation only) | Date: 2026-10-04

## Objective
Serious assessment: versioned assessment over catalog exercises, deterministic
rubric scoring, competency gates (incl. non-negotiable data-safety gate),
append-only version-pinned attempts, eligibility (lessons + assessment + project),
deterministic local certificate with explicit transitions. NOT an external
accreditation — every surface states EDUCATIONAL attestation.

## Files
- `src/lib/learning/types.ts` (Assessment, AssessmentAttempt, CertificateStatus ×5, Certificate)
- `src/lib/learning/catalog.ts` (ASSESSMENTS: asmt-beginner-01, 7 questions, 0.7 + c-data-risk:1.0)
- `src/lib/learning/AssessmentEngine.ts` (gradeAssessment, checkEligibility, issueCertificate, transitionCertificate)
- `src/lib/learning/__tests__/assessmentEngine.test.ts` (12 tests)
- `src/lib/learning/ProgressStore.ts` (attempts append-only key, certificate key)
- `src/services/learning/LearningService.ts` (list/get/submit/eligibility/issue/getCertificate)
- `src/schemas/learningSchema.ts` (SubmitAssessmentSchema)
- `src/pages/LearningPathPage.tsx` (assessment card: questions + submit + eligibility + issue + certificate view)

## Acceptance (§11.4)
Scoring / rubrics (threshold + competency gates) / versioning (attempts pin
assessment+catalog versions; stale passes don't satisfy eligibility) / attempts +
retakes (history kept, current-version pass counts) / pass-fail / competency
thresholds / eligibility (missing pieces named) / historical immutability
(records never mutated) / invalid answers (score 0, no crash) / incomplete
(unanswered = 0, explicit).

## Evidence
Learning scope green; full suite 174/1755 green; tsc 0; build pass.

## Security / Safety
No evidence → no certificate (fail-closed); illegal cert transitions are no-ops;
infinite-retry is a documented learning property, NOT assessment integrity —
server-graded integrity is P1 backend work before any production credential claim.

## Known limitations
Local attestation only; no identity binding, no revocation authority, no timed exams.
Production certification requires the P1 backend track.

## Commit
Uncommitted (Learning-owned files above, ready for scoped commit).
