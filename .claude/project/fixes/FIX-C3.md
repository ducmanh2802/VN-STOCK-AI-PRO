# TASK BRIEF - FIX-C3

GOAL: The money-flow engine must not fabricate a volume ratio of 999 and a "SURGE" signal when the 20-session
average volume is zero; the ratio becomes unavailable and the volume component becomes neutral, explicitly.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- File: `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts` (reached from `server.ts` money-flow analysis route and
  the UI component `src/components/stock/StockMoneyFlow.tsx`).
  - Lines 49-54: `export type VolumeSignalStatus = 'SURGE' | 'ABOVE_AVERAGE' | 'NORMAL' | 'LOW' | 'DRY_UP';`
  - Line 295: `let volumeStatus: VolumeSignalStatus = 'NORMAL';` (also used when there is no lookback).
  - Lines 320-324 (else branch of `if (volumeSMA20 > 0)`):
    `volumeRatio = latest.volume > 0 ? 999 : 0;`
    `volumeStatus = latest.volume > 0 ? 'SURGE' : 'DRY_UP';`
  - Lines 530-540: the status drives `volScore` (SURGE → 90 or 25, ABOVE_AVERAGE → 75/35, LOW/DRY_UP → 45,
    otherwise 55), so the fabricated SURGE inflates or deflates the composite score.
- Required fix (minimal):
  1. Add `'UNAVAILABLE'` to `VolumeSignalStatus`.
  2. Initial value on line 295 becomes `'UNAVAILABLE'` (no lookback = no baseline).
  3. Replace the else branch (lines 320-324): `volumeRatio = null; volumeStatus = 'UNAVAILABLE';`
     interpretation `'Không đủ dữ liệu khối lượng nền 20 phiên (trung bình bằng 0) — không đánh giá khối lượng.'`
  4. In the volScore block add, before the final else, `else if (volumeStatus === 'UNAVAILABLE') { volScore = 50; }`
     and push a reason string saying the volume component is neutral because the baseline is unavailable
     (use the existing `reasons` array).
  5. Change nothing else. Do not touch `src/lib/analysis/backtest/**`.
- `StockMoneyFlow.tsx` already prints `--` for a non-finite ratio and shows the status text; no UI change needed.
- Tests: extend `src/lib/analysis/moneyFlow/__tests__/moneyFlow.test.ts` (read it first; keep every existing
  test unchanged) with a new `describe` block: candles whose previous 20 volumes are all 0 and the latest volume
  > 0 → `volumeSignal.volumeRatio === null`, `volumeSignal.status === 'UNAVAILABLE'`, and the result is the same
  as for an identical series except that it never reports 'SURGE'; and all-zero volumes → also null/UNAVAILABLE.
  Reuse the candle helpers already in that test file.

ALLOWED FILES:
- src/lib/analysis/moneyFlow/MoneyFlowEngine.ts
- src/lib/analysis/moneyFlow/__tests__/moneyFlow.test.ts

DO NOT TOUCH: every other file, the AGENTS.md section 2 protected paths and every file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. No code path in MoneyFlowEngine.ts produces 999 or a SURGE without a positive baseline.
2. Existing tests unchanged and passing; the new tests pass.
3. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run src/lib/analysis/moneyFlow src/lib/analysis/strategy -> all pass

BASELINE: tsc 109 errors. Known failing tests: 9 in src/lib/rebalancing-decision, 1 in
src/test/reachabilityGate.test.ts, 1 in src/lib/strategy/__tests__/StrategyContextAggregator.test.ts (separate task).

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
