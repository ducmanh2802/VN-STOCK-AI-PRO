# TASK BRIEF - FIX-MARKETSTATUS

GOAL: When the market status is unknown (still loading, failed, or demo), the header must say so in neutral grey
instead of showing a green "ĐANG GIAO DỊCH" (trading) with a ticking clock; and the status must refresh.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- `src/types/market.ts` line 1: `export type MarketState = 'TRADING' | 'CLOSED';`, line 40:
  `stateLabel: 'ĐANG GIAO DỊCH' | 'ĐÓNG CỬA';` (inside the MarketStatus interface, lines ~37-45).
- `src/App.tsx` lines 137-143: `const marketStatus = statusQuery.data || { state: 'TRADING' as const,
  stateLabel: 'ĐANG GIAO DỊCH' as const, sessionName: 'Khớp lệnh liên tục' as const,
  timestamp: new Date().toLocaleTimeString('vi-VN'), isDemo: true as const };` — an invented TRADING state.
- `src/components/common/Header.tsx` line 77 `const isTrading = marketStatus.state === 'TRADING';`,
  lines 224-235 paint a green dot and the label, line 302 shows `marketStatus.timestamp` as a freshness stamp.
- `src/hooks/useMarketQueries.ts` lines 82-87 `useMarketStatus` has no `refetchInterval`, so a status fetched at
  10:00 still says trading after the close.
- Other users of MarketState: only `src/services/market/RealMarketDataProvider.ts` (protected? No — it is outside
  providers/**; but do NOT edit it in this task).
- Required fix (minimal):
  1. `src/types/market.ts`: `MarketState = 'TRADING' | 'CLOSED' | 'UNKNOWN'`; `stateLabel` also allows
     `'KHÔNG XÁC ĐỊNH'`.
  2. `src/App.tsx`: the fallback becomes `{ state: 'UNKNOWN', stateLabel: 'KHÔNG XÁC ĐỊNH', sessionName: 'Chưa có
     dữ liệu trạng thái', timestamp: null-or-empty per the type (check the field type; if it must be a string use
     '—'), isDemo: true }`. No `new Date()` in the fallback.
  3. `Header.tsx`: green only when `state === 'TRADING' && !marketStatus.isDemo`; UNKNOWN or demo → grey dot and
     the label as given; the ribbon timestamp shows '—' when the status is UNKNOWN.
  4. `useMarketStatus`: add `refetchInterval: 60_000`.
  5. Change nothing else.
- Test: add `src/components/common/__tests__/` is the USER'S folder — do NOT add files there. Instead add
  `src/hooks/__tests__/marketStatusFallback.test.ts` ONLY if you extract the fallback into an exported constant in
  App.tsx is not possible without importing React into node tests — so skip tests for this task; the orchestrator
  verifies with tsc and a headless browser render.

ALLOWED FILES:
- src/types/market.ts
- src/App.tsx
- src/components/common/Header.tsx
- src/hooks/useMarketQueries.ts

DO NOT TOUCH: every other file, the AGENTS.md section 2 protected paths and every file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. No code path shows TRADING without a real, non-demo status from the service.
2. The status query refetches every 60 s.
3. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npm run build; headless render of / with the API blocked → header shows KHÔNG XÁC ĐỊNH in grey

BASELINE: tsc 109 errors.

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
