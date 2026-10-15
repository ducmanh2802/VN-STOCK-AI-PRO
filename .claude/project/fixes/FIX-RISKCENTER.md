# TASK BRIEF - FIX-RISKCENTER

GOAL: The Risk Center page must show only what the data proves: no hard-coded "LIVE", "4/4 rules passed" or
"TUÂN THỦ" badges, no guardrails that do not exist, and the canonical limits from the risk policy.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- File: `src/pages/RiskCenterPage.tsx` (read it all first). Data comes from `useTradingPortfolio`,
  `useTradingPositions`, `useTradingStatus`, `useTradingRiskMetrics` (lines 36-45).
- Verified defects (line numbers as of 2026-10-15):
  - line 33 `const [maxPositionPct] = useState(25);` — the canonical single-position limit is 20 %:
    `DEFAULT_RISK_GUARD_POLICY.maxPositionPercent` in `src/lib/trading/types/risk.ts` line 173-175
    (daily loss limit `dailyLossLimitPercent: 3.0`, line 182).
  - line 98 `status={isLoading ? 'LOADING' : 'LIVE'}` — shows LIVE even when every query failed.
  - line 187 hard-coded '4/4 QUY TẮC ĐẠT CHUẨN'; lines 204 and 217 unconditional `<Badge variant="up">TUÂN THỦ</Badge>`;
    line 199 says '< ngưỡng tối đa' even when the concentration is above the limit.
  - line 213 claims every sector is under a 35 % cap, but no sector rule exists in the risk engine.
  - lines 226-230 show a stop-loss guard at -7.0 % as 'BẬT' and line 239 a circuit breaker at a 5.0 % daily
    drawdown; neither exists (the canonical daily loss limit is 3 %).
  - line 129: use `exposure?.value != null && exposure.value > 0` (the current check treats a missing value as data).
- Required fix (only this file):
  1. Import `DEFAULT_RISK_GUARD_POLICY` (type-safe, read-only import from `../lib/trading/types/risk`) and use its
     `maxPositionPercent` and `dailyLossLimitPercent` instead of local numbers.
  2. Header status: 'LOADING' while loading; 'DATA_UNAVAILABLE' (or 'ERROR', whichever the DataStatusBadge type
     accepts — check its props) when any of the four queries errored or returned no data; 'LIVE' only when all succeeded.
  3. Every rule badge is computed: compliant / breached / unavailable from the actual metric against the policy
     limit; the "N/M QUY TẮC ĐẠT CHUẨN" summary counts the computed results; when a metric is missing show
     'KHÔNG CÓ DỮ LIỆU', never TUÂN THỦ.
  4. Remove the sector-cap, -7 % stop-loss and 5 % circuit-breaker claims, or show them as 'CHƯA CẤU HÌNH'
     (not configured) without a green badge. Do not invent new limits.
  5. Keep the layout, components and Vietnamese wording style; change nothing outside this file.
- Add `src/pages/__tests__/RiskCenterRules.test.ts` only if you extract the badge logic into a small pure exported
  function in RiskCenterPage.tsx (e.g. `evaluateRiskRule(value: number | null, limit: number)` returning
  'COMPLIANT' | 'BREACHED' | 'UNAVAILABLE'); test null → UNAVAILABLE, below/at/above the limit.

ALLOWED FILES:
- src/pages/RiskCenterPage.tsx
- src/pages/__tests__/RiskCenterRules.test.ts

DO NOT TOUCH: every other file (the risk engine and its types are protected: import read-only, never edit),
every file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. No hard-coded LIVE / 'đạt chuẩn' / TUÂN THỦ remains; every badge derives from data or says unavailable.
2. Limits come from DEFAULT_RISK_GUARD_POLICY; no non-existent guardrail is presented as active.
3. `npx tsc --noEmit` reports no new errors versus the baseline; the test (if added) passes.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run src/pages/__tests__ -> all pass; headless render of /risk-center

BASELINE: tsc 109 errors. Known failing tests: 9 in src/lib/rebalancing-decision, 1 in
src/test/reachabilityGate.test.ts, 1 in src/lib/strategy/__tests__/StrategyContextAggregator*.test.ts (separate task).

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
