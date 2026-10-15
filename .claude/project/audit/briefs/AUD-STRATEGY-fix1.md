# TASK BRIEF - AUD-STRATEGY (fix attempt 1 of 3, same session)

GOAL: Correct `docs/audit/2026-10-15/opencode-strategy-portfolio.md` as listed below and end your reply
with the AGENTS.md section 7 block. Change nothing else.

CONTEXT (the orchestrator's review of your previous run):
- Your final reply had no AGENTS.md section 7 block, so the run was marked FAIL. The report must end the reply.
- F7 is wrong: `src/lib/analysis/strategy/RiskRewardEngine.ts:59` is
  `riskAmount > 0 ? Math.floor(maxRiskCapital / riskAmount / 100) * 100 : 0`, which DOES round to
  100-share lots. Delete F7 (from the table and its section).
- F10 is not a defect: this repo imports with explicit `.ts` extensions everywhere by convention.
  Delete F10 (from the table and its section).
- F9 cites line 68, but the quoted code is near line 176 of
  `src/lib/analysis/strategy/RecommendationEngine.ts`. Fix the Location in the table and the section,
  and copy the Evidence lines verbatim from around line 176.
- In the Findings table, F1's Location still says `src/lib/strategy/StrategyIntelligenceService.ts:3`;
  the section correctly says `src/services/strategy/StrategyIntelligenceService.ts:3`. Make the table match.
- Renumber nothing; gaps in F numbers are fine.

ALLOWED FILES (exact repo-relative paths; the only files you may create or edit):
- docs/audit/2026-10-15/opencode-strategy-portfolio.md

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. F7 and F10 are gone; F9 and the F1 table row point at the right file and line.
2. The citation checker passes for every remaining finding.
3. The reply ends with the section 7 block whose first line is `STATUS: PASS | PARTIAL | BLOCKED | FAILED`.

VERIFY: the orchestrator re-runs the citation checker. You do not need tsc.

BASELINE: tsc 563 errors (unchanged; documentation only).

LIMITS: this is attempt 1 of 3. No commits, installs, network or database access.

REPORT: end with the AGENTS.md section 7 block. TYPECHECK: write "not run (documentation-only task)".
