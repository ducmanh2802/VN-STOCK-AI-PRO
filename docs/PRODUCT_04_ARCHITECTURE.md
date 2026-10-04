# PRODUCT-04 — AI RESEARCH ASSISTANT: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Purpose
An assistant that explains and cites, never recommends and never invents. It has no market data of
its own: every answerable statement must trace to an artifact injected by the caller.

## Architecture
```text
Caller injects verified artifacts (JournalEngine entries, ScenarioEngine results,
ResearchWorkspace state, curated concepts)
  → buildResearchContext()   → citable facts per artifact (id, kind, label, citableFacts)
  → classifyResearchQuestion() → kind (JOURNAL_FACT | SCENARIO | PORTFOLIO | CONCEPT |
                                       TRADE_ACTION | OUT_OF_SCOPE)
  → decideResearchAction()   → ANSWER_FROM_CONTEXT | EXPLAIN_WITH_ASSUMPTION |
                               ASK_CLARIFYING | REFUSE
  → ResearchLlmAdapter.generate()   [injected; StubResearchLlmAdapter for tests]
  → validateResearchResponse()     [pre-render gate: tag, advice, citation, numeric grounding]
```

## Design constraints (inherited from the certified Learning tutor lane)
1. Core logic is provider-independent — `ResearchLlmAdapter` is injected, never imported.
2. Provenance tag mandatory: `[VERIFIED|EXPLANATION|ASSUMPTION|SIMULATION|UNKNOWN]`.
3. Trade advice is refused outright (VI + EN phrasings; "guaranteed return" variants included).
4. **Numeric grounding guard (new):** every number in a draft must exist in the injected
   `citableFacts`; otherwise the draft is a fabrication and is rejected. Context-item ids and
   provenance tags are scrubbed before extraction so reference digits are not misread as data.

## Why ASK_CLARIFYING instead of guessing
When the required context kind is absent, the assistant asks rather than answering from parametric
memory — the failure mode this platform is designed to make impossible.

## Known limitations
Deterministic stub only; no retrieval ranking; no multi-turn state; EN+VI keyword routing is
intentionally narrow (out-of-scope → clarify, not guess).