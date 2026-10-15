# TASK BRIEF - FIX-C10 (fix attempt 1 of 3, same session)

GOAL: Correct two of your new tests in `src/lib/analysis/strategy/__tests__/recommendation.test.ts`. Your change
to `RecommendationEngine.ts` is correct; do not touch it.

CONTEXT:
- The runner ran `npx vitest run src/lib/analysis/strategy/__tests__/recommendation.test.ts`: 1 failed, 12 passed.
  `sets expectedReturn to null when score is null` → `AssertionError: expected 2.8 to be null` (line 196).
  You reported PASS without a passing test run; that is a false report. Run the test file before reporting.
- Why it fails: that test passes all six component scores (78, 82, ...), so the composite score is NOT null.
  `StrategyScorer.score` returns `score: null` only when every component is null (`availableComponents === 0`,
  `src/lib/analysis/strategy/StrategyScorer.ts:114,129`). The target/stop envelope does not depend on the score
  (`RecommendationEngine.ts` lines 91-104: SHORT_TERM target = resistance above price, stop = support below price).
- Required test changes (in that file only; keep every other test unchanged):
  1. `sets expectedReturn to null when score is null`: pass `scores` with all six fields set to `null`
     (technicalScore, fundamentalScore, momentumScore, moneyFlowScore, valuationScore, riskScore),
     `currentPrice: 100_000`, `supportPrice: 95_000`, `resistancePrice: 110_000`, strategy 'SHORT_TERM'.
     Expect `rec.score` toBeNull(), `rec.potentialUpside` and `rec.potentialDownside` not null (the envelope
     exists), and `rec.expectedReturn` toBeNull(). (Before the fix this returned 2.5 from an invented 50% win rate.)
  2. Replace `generates same expectedReturn when score is present` (it compares two identical calls, which proves
     nothing) with a test that checks the formula is unchanged for a non-null score: generate FPT SHORT_TERM with
     `baseScores`, `currentPrice: 130_000`, `supportPrice: 125_000`, `resistancePrice: 142_000`; expect
     `rec.score` not null, `rec.expectedReturn` not null, and
     `rec.expectedReturn` toBe(`Number((w * rec.potentialUpside! - (1 - w) * rec.potentialDownside!).toFixed(2))`)
     where `w = Math.min(0.85, Math.max(0.35, rec.score! / 100))`.

ALLOWED FILES:
- src/lib/analysis/strategy/__tests__/recommendation.test.ts

DO NOT TOUCH: every other file, including `src/lib/analysis/strategy/RecommendationEngine.ts`.

ACCEPTANCE CRITERIA:
1. `npx vitest run src/lib/analysis/strategy/__tests__/recommendation.test.ts` passes (all tests).
2. No existing test or assertion removed or weakened, except replacing the self-comparing test named above.
3. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY: run both yourself before reporting (no `cd`, pipes, `;`, `&&` or redirection):
`npx vitest run src/lib/analysis/strategy/__tests__/recommendation.test.ts` and `npx tsc --noEmit`.
The orchestrator re-runs both.

BASELINE: tsc 109 errors. LIMITS: attempt 1 of 3 for this failure. No commits, installs, network or database access.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it.
