# TASK BRIEF - FIX-C10

GOAL: `RecommendationEngine.generate` must not invent a 50% win rate when the score is missing, and must not
stamp today's wall-clock date as the data as-of date.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- File: `src/lib/analysis/strategy/RecommendationEngine.ts`.
  - Lines 26-45: `export interface RecommendationGenerateParams { symbol; strategy; currentPrice; scores; ... }`.
  - Line 142: `const estimatedWinRate = score !== null ? Math.min(0.85, Math.max(0.35, score / 100)) : 0.5;`
    then lines 143-148 compute `expectedReturn` from it whenever an upside/downside envelope exists — so a
    stock with NO score still gets an expected return computed from an invented 50% win rate.
  - Lines 274-275 of the returned object: `generatedAt: new Date().toISOString(),` and
    `asOfDate: new Date().toISOString().split('T')[0],` — `asOfDate` is documented in
    `src/types/recommendation.ts` as "Data as-of date (latest data point used)", type `string | null`; the
    wall-clock date is not that.
- Required fix (minimal):
  1. Line 142: `estimatedWinRate` is `null` when `score === null`; `expectedReturn` is `null` unless both the
     envelope and the win rate exist. Keep the clamp for a non-null score exactly as it is.
  2. Add two optional fields to `RecommendationGenerateParams`: `asOfDate?: string | null` (YYYY-MM-DD of the
     latest data point) and `generatedAt?: string` (ISO instant).
  3. Returned object: `asOfDate: params.asOfDate ?? null` and
     `generatedAt: params.generatedAt ?? new Date().toISOString()`.
  4. `generateMultiHorizon` and `rankUniverse` already spread params, so they pass the new fields through; check
     that and change nothing else. Do not edit any other file (callers in server.ts are protected).
- Tests: extend `src/lib/analysis/strategy/__tests__/recommendation.test.ts` (read it first; keep existing tests
  unchanged unless one asserts the old fabricated behaviour — if so, say which in your report instead of
  silently editing it) with: score null + envelope present → `expectedReturn === null`; score present → same
  expectedReturn as before; `asOfDate` passed through and `null` when omitted; `generatedAt` passed through.

ALLOWED FILES:
- src/lib/analysis/strategy/RecommendationEngine.ts
- src/lib/analysis/strategy/__tests__/recommendation.test.ts

DO NOT TOUCH: every other file, the AGENTS.md section 2 protected paths and every file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. No 0.5 default win rate; no wall-clock `asOfDate`.
2. Existing tests pass (or the report names any test that asserted the old behaviour); new tests pass.
3. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run src/lib/analysis/strategy src/pages/recommendations -> all pass

BASELINE: tsc 109 errors. Known failing tests: 9 in src/lib/rebalancing-decision, 1 in
src/test/reachabilityGate.test.ts, 1 in src/lib/strategy/__tests__/StrategyContextAggregator.test.ts (separate task).

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
