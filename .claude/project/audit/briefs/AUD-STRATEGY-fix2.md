# TASK BRIEF - AUD-STRATEGY (fix attempt 2 of 3, same session)

GOAL: One small correction to `docs/audit/2026-10-15/opencode-strategy-portfolio.md`, then a final
text reply that is the AGENTS.md section 7 block.

CONTEXT:
- Your last two replies ended with an EMPTY message, so both runs were marked FAIL. Your very last
  message must be plain text (not a tool call) and must start with `STATUS:`.
- F8 now says line 176, which is wrong. Its quoted code is in
  `src/lib/analysis/strategy/RecommendationEngine.ts` around lines 217-227. Set F8's Location (table
  row and section) to `src/lib/analysis/strategy/RecommendationEngine.ts:217` and copy its Evidence
  lines verbatim from that place. Do not change any other finding.

ALLOWED FILES:
- docs/audit/2026-10-15/opencode-strategy-portfolio.md

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. F8 points at line 217 and its Evidence is verbatim from lines 217-227; nothing else changed.
2. Your final message is the section 7 block, first line `STATUS: PASS | PARTIAL | BLOCKED | FAILED`.

VERIFY: the orchestrator re-runs the citation checker.

BASELINE: tsc 563 errors (documentation only).

LIMITS: attempt 2 of 3.

REPORT: AGENTS.md section 7 block as your final plain-text message. TYPECHECK: "not run (documentation-only task)".
