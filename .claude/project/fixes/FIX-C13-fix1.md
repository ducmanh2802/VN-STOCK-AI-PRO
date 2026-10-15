# TASK BRIEF - FIX-C13 (fix attempt 1 of 3, same session)

GOAL: Make your new test file correct and fix the misplaced JSDoc, then reply with the section 7 block.

CONTEXT (the orchestrator ran the tests you could not run):
- `npx vitest run src/lib/strategy` → 1 failure:
  `StrategyContextAggregatorAsOf.test.ts > with asOfDate and no evaluatedAt: same-day VN trading hour snapshot is NOT rejected`
  The context reports `lookaheadRejected: true` with detail
  `Derivatives snapshot timestamp (2026-10-15T11:01:26.563Z) > evaluation instant (2026-10-01T16:59:59.999Z)`.
- Root cause is the TEST, not your fix: with `assetClass: 'DERIVATIVE'` the aggregator fetches a derivatives
  snapshot when none is injected, and `DerivativesIntelligenceService` prices it with LIVE quotes stamped "now".
  For a backdated asOfDate that is real look-ahead, so rejecting it is correct. Your fix in
  `StrategyContextAggregator.ts` stays as it is.
- Fix the test: in that same-day case also pass
  `derivativesSnapshotOverride: makeDerivativesSnapshot({ timestamp: '2026-10-01T08:00:00.000Z' })`
  (`makeDerivativesSnapshot` is exported by `src/lib/strategy/__tests__/fixtures.ts`, line 78; see how
  `StrategyRemediation.test.ts` line 203 uses it), so that every injected snapshot is same-day.
  Add one more case: same-day market snapshot but NO derivatives override → `lookaheadRejected === true` and
  some `lookaheadDetails` entry starts with `Derivatives snapshot timestamp` (documents the behaviour above).
- JSDoc: your new `endOfVnTradingDayIso` was inserted between the existing JSDoc block ("Resolves the derivatives
  underlying index...") and `resolveDerivativesUnderlying`, so that comment now documents the wrong function.
  Move `endOfVnTradingDayIso` so the original JSDoc sits directly above `resolveDerivativesUnderlying` again, and
  give `endOfVnTradingDayIso` its own one-line JSDoc ("End of the asOfDate trading day in Vietnam time (UTC+07:00) as an ISO instant.").

ALLOWED FILES:
- src/lib/strategy/StrategyContextAggregator.ts (only the JSDoc/placement change)
- src/lib/strategy/__tests__/StrategyContextAggregatorAsOf.test.ts

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. `npx vitest run src/lib/strategy` passes completely (orchestrator runs it).
2. The behaviour of `buildContext` is unchanged from your previous run; only the helper's position and comments move.
3. Your last message is plain text starting with `STATUS:` (do not output it with a tool).

BASELINE: tsc 109 errors. LIMITS: attempt 1 of 3. No commits, installs, network or database access.

REPORT: AGENTS.md section 7 block as plain text in your last message. TYPECHECK: run `npx tsc --noEmit` and report the count.
