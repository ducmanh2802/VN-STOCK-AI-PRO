# LEARNING PLATFORM ARCHITECTURE (as implemented, 2026-10-04)

## Layers (dependency flows downward only)
```text
UI pages/components (presentation, LearningService calls, zod-validated input)
  → src/services/learning/LearningService.ts (orchestration only)
    → src/lib/learning/* engines (pure, deterministic, no IO/clock/random)
      → src/lib/learning/catalog.ts (single source of truth, versioned)
    → src/lib/learning/ProgressStore.ts (IProgressStore, localStorage, key-scoped)
  → src/schemas/learningSchema.ts (boundary validation)
```

## Modules
| Module | Role | Purity |
|---|---|---|
| catalog.ts | Static PUBLISHED content (domains→assessments, v1.0.0-mvp) | static |
| ExerciseScoringEngine | Exact/tolerance/text scoring + teaching feedback | pure |
| MasteryEngine | Evidence-gated states (open ≠ mastery) | pure |
| LearningRecommendationEngine | Failed-first → path-order → review (baseline) | pure |
| AdaptiveLearningEngine (L09) | Weak-first + review scheduling + explanations, graph-backed prereqs | pure |
| ProjectEngine (L10) | Rubric self-check + lifecycle + prereqs + version pins | pure |
| AssessmentEngine (L11) | Versioned grading + eligibility + deterministic certificates | pure |
| KnowledgeGraph (L12) | Derived nodes/edges + traversal + integrity validation | pure |
| TutorFoundation (L13) | Classifier + policy + VERIFIED context + adapter iface + validator | pure |
| ContentStudio (L14) | Lifecycle + validators + fail-closed publish gate | pure |
| TrainingFoundation (L15) | Orgs/cohorts/enrollment windows + aggregation + tiers | pure |
| ProgressStore | 7 namespaced keys, shape-robust reads, version stamps, scoped stores | IO-isolated |
| systemLinks | 5 feature→lesson links (LearnThis UI) | static |

## Data
- Runtime: LessonProgress(+catalogVersion), attempts (exercise/assessment, append-only),
  project records (version-pinned), certificate (single local). All fail-safe on corruption.
- Identity: `LearnerIdentity` + key-prefix scoping (userId-ready, still local).
- Backend (reserved, not built): `0003_learning_*` tables + LearningRepository + auth-gated routes.

## Boundaries (non-negotiable)
- Zero imports from trading/risk/portfolio/strategy/macro/providers (tested invariant).
- SIMULATED/EDUCATIONAL labeling on all non-real figures; tutor provenance tags enforced.
- Certificates are local EDUCATIONAL attestations, never external accreditation.
- Published content immutable (version bump on edit); attempts/records never mutate.
