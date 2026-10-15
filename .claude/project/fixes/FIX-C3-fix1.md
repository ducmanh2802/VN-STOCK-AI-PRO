# TASK BRIEF - FIX-C3 (fix attempt 1 of 3, same session)

GOAL: Correct the two new tests in `src/lib/analysis/moneyFlow/__tests__/moneyFlow.test.ts` so they test the real
edge case. Your change to `MoneyFlowEngine.ts` is correct; do not touch it.

CONTEXT:
- The orchestrator ran `npx vitest run src/lib/analysis/moneyFlow src/lib/analysis/strategy`: 2 failed, 92 passed.
  Both failures are in your new `describe('Volume Signal Edge Cases')` block:
  1. "previous 20 volumes are all 0 and latest volume > 0" → `AssertionError: expected 20 to be null` (line 33).
  2. "all 20 volumes are 0 (including latest)" → `AssertionError: expected +0 to be null` (line 66).
- Why: `MoneyFlowEngine.ts` lines 299-301 average the LAST 20 candles INCLUDING the latest one, and round:
  `volumeSMA20 = Math.round(volSum / lookback)`. With 20 prior zeros and a latest volume of 500000 the window
  holds 19 zeros + 500000, so SMA = 25000 and ratio = 20 (a real baseline). The old 999/SURGE branch is reached
  only when the ROUNDED average is 0 while the latest volume is > 0, e.g. 19 zero volumes and a latest volume of 9
  (9 / 20 = 0.45 → rounds to 0). And with all volumes 0 the average is 0, not null.
- Required test changes (in that file only; keep every other test unchanged):
  1. Test 1: build 21 candles where every volume is 0 except the LAST one, whose volume is 9. Expect
     `volumeSignal.volumeSMA20` toBe(0), `volumeRatio` toBeNull(), `status` toBe('UNAVAILABLE'),
     `currentVolume` toBe(9), and that `result.reasons` contains a string including 'trung tính'.
     Rename the test to say "rounded 20-session average is 0 while the latest volume is > 0".
  2. Test 2 (all volumes 0): expect `volumeSMA20` toBe(0) instead of toBeNull(); keep the other expectations.
  3. Delete the broken check `r.toLowerCase().includes('SURGE')` (a lower-cased string never contains 'SURGE');
     the `status` assertion already covers it.

ALLOWED FILES:
- src/lib/analysis/moneyFlow/__tests__/moneyFlow.test.ts

DO NOT TOUCH: every other file, including `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts`.

ACCEPTANCE CRITERIA:
1. `npx vitest run src/lib/analysis/moneyFlow` passes (all tests, including the 8 existing ones).
2. No existing test or assertion is removed or weakened, except the broken lower-case SURGE check named above.
3. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY: you may run `npx tsc --noEmit` and `npx vitest run src/lib/analysis/moneyFlow` (no `cd`, pipes, `;`,
`&&` or redirection). The orchestrator re-runs both.

BASELINE: tsc 109 errors. LIMITS: attempt 1 of 3 for this failure. No commits, installs, network or database access.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it.
