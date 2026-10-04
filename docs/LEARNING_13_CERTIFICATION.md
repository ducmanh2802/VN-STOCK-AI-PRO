# LEARNING-13 — AI TUTOR FOUNDATION: CERTIFICATION
Status: CERTIFIED (lane-local, foundation-grade: policy+context+adapter+validator, NO model wiring) | Date: 2026-10-04

## Objective
Safety-first tutor foundation: the tutor can NEVER be the source of financial
truth. Heuristic classifier, deterministic policy with mandatory refusal classes,
VERIFIED catalog context builder, isolated LLM adapter interface + deterministic
stub, and a provenance-enforcing response validator.

## Files
- `src/lib/learning/TutorFoundation.ts` (classifyQuestion, buildTutorContext, decideTutorAction,
  LlmAdapter, StubLlmAdapter, validateTutorResponse, isCatalogExercise)
- `src/lib/learning/__tests__/tutorFoundation.test.ts` (12 tests)
- `src/lib/learning/index.ts` (barrel)

## Acceptance (§13.5)
Context selection (lesson+mastery+graph links) / retrieval guard (catalog id
check) / missing context (UNKNOWN envelope) / unsupported questions (redirect) /
provenance (tag required) / hallucination boundaries (trade/market-fact REFUSE +
redirect lesson) / refusal explicitness / deterministic policy / adapter isolation
(stub only; zero network imports; core tests need no API key).

## Evidence
Learning scope green; full suite 174/1755 green; tsc 0; build pass.

## Security / Safety
TRADE_ACTION and MARKET_FACT always REFUSE (EN+VI patterns); advice verbs fail
validation; catalog refs mandatory for catalog answers; SIMULATED stays labeled
via context limits. No prompt/tool execution boundary exists yet (no tools wired).

## Known limitations
No UI, no model, no conversation memory, no RAG over system docs (contracts
ready). Heuristic classifier is foundation-grade, not production NLU.

## Commit
Uncommitted (Learning-owned files above, ready for scoped commit).
