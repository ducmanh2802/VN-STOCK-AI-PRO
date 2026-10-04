# PRODUCT-04 — AI RESEARCH ASSISTANT: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Files
- `src/lib/product/assistant/ResearchAssistantFoundation.ts`
- `src/lib/product/assistant/__tests__/researchAssistantFoundation.test.ts` (11 tests)

## Test evidence (34 product tests at this phase, all pass)
| Requirement | Test |
| --- | --- |
| Refuses trade advice | EN (`Should I buy HPG now?`), VI (`nên mua ngay HPG không`), `guarantees … return` ⇒ `REFUSE`, provenance `UNKNOWN` |
| No improvisation | unmapped question ⇒ `ASK_CLARIFYING` |
| Fail-closed on missing context | empty context + portfolio question ⇒ `ASK_CLARIFYING` (no memory answers) |
| Grounded answers | cites `journal:j1`, `[VERIFIED]` required |
| **Numeric grounding** | draft citing `25000` when absent from context ⇒ `ungrounded number: 25000` |
| Tag + advice verbs | missing tag and `you should buy` both rejected |
| Explicit refusals | non-refusing draft rejected on `REFUSE` path |
| Scenario scoping | scenario questions may only cite scenario facts |
| Determinism | identical context ⇒ identical decision; stub adapter deterministic, provider-free |
| Number parsing | `-5,000,000`, `1_000`, `-0.5` normalized |

## Bugs found by these tests and fixed
1. Classification order — generic `CONCEPT` matched "what is in my journal", so grounded questions
   were answered as concepts. Fact patterns now evaluated before the concept heuristic.
2. `guaranteed? return` failed to match `guarantees 30% return` → replaced with
   `guarantee(s|d)? … return`.
3. Numeric guard flagged digits inside context ids (`journal:j1`) → ids/tags are now scrubbed before
   extraction while genuine fabrications are still caught (covered by both cases in the suite).

## Gate (§43)
`npx vitest run src/lib/product` → 4 files / 34 tests pass. `tsc --noEmit` clean. Build success.
No provider dependency in product code.