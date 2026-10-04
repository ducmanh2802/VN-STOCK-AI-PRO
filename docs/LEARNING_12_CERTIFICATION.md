# LEARNING-12 — KNOWLEDGE GRAPH: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Objective
Derived typed knowledge graph over the catalog (single source of truth, zero
content duplication): 9 node kinds, 8 relationship types, bounded traversal,
integrity validation, and real product integration (adaptive prerequisite
traversal now graph-backed).

## Files
- `src/lib/learning/KnowledgeGraph.ts` (buildGraph, getDirectPrerequisites, prerequisitesOf,
  taughtBy, practicedBy, validateGraph; dedupe at build, strict validation for external graphs)
- `src/lib/learning/__tests__/knowledgeGraph.test.ts` (10 tests)
- `src/lib/learning/index.ts` (barrel)
- `src/lib/learning/AdaptiveLearningEngine.ts` (prereq lookup via graph; behavior unchanged, tests green)

## Acceptance (§12 + §12.3)
Node/edge model (§12.1 all used rels present) / powers prerequisites +
recommendations + navigation + assessment/project mapping (ASSESSES/PRACTICES edges)
+ tutor retrieval (taughtBy/practicedBy consumed by L13 context) / integrity:
missing nodes, dangling refs, prereq cycles, duplicate edges, invalid rels,
orphan concepts — each detected by test, real catalog validates clean
(one genuine builder dup found by the validator during development and fixed).

## Evidence
Learning scope green; full suite 174/1755 green; tsc 0; build pass.
Graph is deterministic (sorted nodes/edges; rebuild equality tested) and bounded
(visited-sets, 1000-step guard, cycle-safe traversal tested).

## Security / Safety
Pure derivation; no new data, no imports beyond catalog/systemLinks.

## Known limitations
Skill nodes deferred (no Skill entities yet); Decorative UI deferred (graph has no
dedicated visualization — consumption is via engines, per anti-decoration rule).

## Commit
Uncommitted (Learning-owned files above, ready for scoped commit).
