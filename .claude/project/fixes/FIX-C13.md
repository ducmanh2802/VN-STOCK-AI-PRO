# TASK BRIEF - FIX-C13

GOAL: `StrategyContextAggregator.buildContext` must judge look-ahead against the evaluation DATE when the
caller gives `asOfDate` but no `evaluatedAt`, instead of against the machine's wall clock.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- File: `src/lib/strategy/StrategyContextAggregator.ts`.
  - Line 57: `const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();`
  - Lines 188-204 reject market / derivatives / ETF snapshots whose `timestamp` is after `evaluatedAt`
    (helper `isInstantAfter`, line 257).
  - Defect: with `asOfDate: '2026-10-01'` and no `evaluatedAt`, a market snapshot stamped
    `2026-10-15T00:00:00.000Z` is accepted whenever the machine clock is past 2026-10-15, i.e. future data
    leaks into a backdated evaluation. The existing test
    `src/lib/strategy/__tests__/StrategyContextAggregator.test.ts` lines 52-63
    ("detects lookahead bias on future market snapshot timestamps") started failing on 2026-10-15 because of this.
- Required fix (minimal):
  1. Add an exported pure helper in the same file:
     `export function endOfVnTradingDayIso(asOfDate: string): string` returning the ISO instant of
     `asOfDate` 23:59:59.999 in Vietnam time (UTC+07:00), i.e. `${asOfDate}T16:59:59.999Z`. If `asOfDate`
     does not match /^\d{4}-\d{2}-\d{2}$/, throw an Error (fail closed).
  2. Change line 57 to: when `options.evaluatedAt` is given use it; else when `options.asOfDate` is given use
     `endOfVnTradingDayIso(options.asOfDate)`; else (live use, no dates at all) keep `new Date().toISOString()`.
  3. Change nothing else (no other check, no other file).
- New test file `src/lib/strategy/__tests__/StrategyContextAggregatorAsOf.test.ts` (import `{ describe, it,
  expect, vi, afterEach }` from 'vitest'; reuse the snapshot-building pattern of the existing test file, read
  it first). Cover:
  - `endOfVnTradingDayIso('2026-10-01') === '2026-10-01T16:59:59.999Z'`; an invalid date string throws;
  - with `asOfDate: '2026-10-01'` and no `evaluatedAt`: a market snapshot at `2026-10-15T00:00:00.000Z` is
    rejected (`lookaheadRejected === true`) and the result's `evaluatedAt` is `2026-10-01T16:59:59.999Z`;
  - same asOfDate, snapshot at `2026-10-01T08:00:00.000Z` (15:00 VN, same day) is NOT rejected;
  - the result does not depend on the wall clock: run the first case again after
    `vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))` and expect the same outcome
    (restore with `vi.useRealTimers()` in afterEach).

ALLOWED FILES:
- src/lib/strategy/StrategyContextAggregator.ts
- src/lib/strategy/__tests__/StrategyContextAggregatorAsOf.test.ts

DO NOT TOUCH: every other file (the existing StrategyContextAggregator.test.ts too), the AGENTS.md section 2
protected paths and every file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. Only line 57 changes in behaviour; the helper is exported and pure.
2. The existing test file passes in full, including lines 52-63, without being edited.
3. The new test file covers the cases above and passes.
4. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run src/lib/strategy -> all pass

BASELINE: tsc 109 errors. Known failing tests: 9 in src/lib/rebalancing-decision, 1 in
src/test/reachabilityGate.test.ts, and 1 in StrategyContextAggregator.test.ts (the one this task fixes).

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
