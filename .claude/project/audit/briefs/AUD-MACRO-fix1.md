# TASK BRIEF - AUD-MACRO (fix attempt 1 of 3, same session)

GOAL: Correct the Findings of `docs/audit/2026-10-15/opencode-macro-learning-business.md` so every finding is
real and its Evidence is verbatim, then reply with the AGENTS.md section 7 block as plain text.

CONTEXT (the orchestrator's citation checker on your file):
```
OK   F2 src/services/market/MarketIntelligenceService.ts:6 high — financial-integrity — `src/services/market/MarketIntelligenceService.ts:6-13`
FAIL F3  medium — broken-contract — `src/lib/newsmacro/api/NewsMacroListRouter.ts:33`  -> no Evidence code block
OK   F4 src/pages/MacroNewsPage.tsx:48 critical — runtime-crash — `src/pages/MacroNewsPage.tsx:48-58`
FAIL F5  high — financial-integrity — (from audit logs, tsc-current.txt, and route-qa.md)  -> no Location `path:line`
FAIL F6  medium — dead-code — `src/lib/market/stockUniverse.ts:15-76`  -> file not found: src/lib/market/stockUniverse.ts
FAIL F7  high — financial-integrity — `src/lib/features.ts:308-311`  -> file not found: src/lib/features.ts
FAIL F8  medium — data-provenance — `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts:321-322`  -> no Evidence code block
FAIL F9  medium — data-provenance — `src/lib/features.ts:118-121`  -> file not found: src/lib/features.ts
FAIL F10  low — cosmetics — `src/lib/portfolio/CapitalAllocationEngine.ts:38`  -> file not found: src/lib/portfolio/CapitalAllocationEngine.ts
```
- Three Locations point at files that do not exist in this repo: `src/lib/features.ts`,
  `src/lib/market/stockUniverse.ts`, `src/lib/portfolio/CapitalAllocationEngine.ts`. Use glob/read to find the
  real file, or delete the finding. Never cite a file you have not opened in this session.
- F8 (MoneyFlowEngine) belongs to the analysis area and is already reported there: delete it.
- F3 and F8 have no Evidence code block; F5 has no `path:line`. Fix or delete them.
- Every remaining finding must be inside this area's scope: src/lib/macro/**, src/lib/macro-regime/**,
  src/lib/newsMacro/**, src/lib/learning/**, src/lib/business/**, src/lib/platform/**, src/lib/product/**,
  their src/services/* counterparts, src/utils/**, plus src/pages/MacroNewsPage.tsx.
- Keep F2 and F4 as they are (they pass). Quality over quantity: 4-8 real findings are better than 9 broken ones.

ALLOWED FILES:
- docs/audit/2026-10-15/opencode-macro-learning-business.md

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. The citation checker passes for every remaining finding.
2. Your last message is plain text starting with `STATUS:` (do not output it with a tool).

BASELINE: tsc 563 errors (documentation only). LIMITS: attempt 1 of 3.

REPORT: AGENTS.md section 7 block as plain text in your last message. TYPECHECK: "not run (documentation-only task)".
