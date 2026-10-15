# TASK BRIEF - FIX-AISUMMARY-UI

GOAL: The dashboard "AI Market Analyst" card must not print a fixed bullish narrative or fixed badges regardless of
the data, and must not label rule-based template text as CALCULATED.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit` and
  read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection. You may NOT run tests
  (AGENTS.md section 5); the orchestrator runs them. Never claim tests pass.
- File `src/components/dashboard/AIMarketSummaryCard.tsx` (rendered on the dashboard, `DashboardPage.tsx:255`, and on
  `/ai-analyst`, `AIAnalystPage.tsx:29`). `summary.trend` is `'TÍCH CỰC' | 'TRUNG TÍNH' | 'TIÊU CỰC'`
  (`src/types/market.ts:46-57`); it is a rule-based bucket of the advance/decline ratio, and `trendScore` is one of
  the constants 72 / 55 / 38 (`RealMarketDataProvider.getAIMarketSummary`).
  - lines 61-64: `<Badge variant="up" size="xs"><TrendingUp .../>{summary.trend}</Badge>` — always green/up, even
    for 'TIÊU CỰC'.
  - lines 66-68: a static paragraph 'Thị trường đang duy trì xu thế tăng điểm ngắn hạn trên các đường trung bình
    động (MA20). Lực cầu chủ động ...' shown whatever the data says.
  - lines 77-79: `<Badge variant="accent" size="xs">Hấp thụ tốt</Badge>` — a fixed claim about money flow.
  - lines 157-159: `<Badge variant="ref" size="xs">CALCULATED</Badge>` on template text.
- Badge variants available (`src/components/ui/Badge.tsx`): `up`, `down`, `default`, `secondary`, ... .
  `lucide-react` exports `TrendingUp`, `TrendingDown`, `Minus`.

REQUIRED CHANGES in `AIMarketSummaryCard.tsx` (minimal, nothing else):
1. Trend badge: `variant` is `'up'` for 'TÍCH CỰC', `'down'` for 'TIÊU CỰC', `'default'` otherwise; icon
   `TrendingUp` / `TrendingDown` / `Minus` accordingly (add the two imports).
2. Replace the static paragraph on lines 66-68 with this data-backed text:
   `Xếp loại theo tỷ lệ mã tăng/giảm (quy tắc cố định): {summary.trend} — điểm quy tắc {summary.trendScore}/100.`
3. Delete the 'Hấp thụ tốt' badge (lines 77-79) entirely; keep the 'Vận Động Dòng Tiền' heading and
   `{summary.moneyFlow}` text.
4. Change the text `CALCULATED` (line 158) to `RULE-BASED`.

TESTS — new file `src/components/dashboard/__tests__/AIMarketSummaryCard.test.tsx` using `renderToStaticMarkup`
from `react-dom/server` (pattern: `src/components/stock/__tests__/StockHardenedComponents.test.tsx`). Build a
summary object of type `AIMarketSummary` with `trend`, `trendScore`, `moneyFlow: 'x'`, `strongSectors: []`,
`weakSectors: []`, `riskAlerts: []`, `overallComment: 'y'`, `disclaimer: 'z'`, `updatedAt: '10:00'`, `isDemo: false`.
1. trend 'TIÊU CỰC', trendScore 38 → HTML contains 'TIÊU CỰC' and 'điểm quy tắc 38/100'; does NOT contain
   'bg-terminal-up/12' (the class of an `up` Badge — before the fix the trend badge was always `up`), nor
   'duy trì xu thế tăng điểm', 'Hấp thụ tốt' or 'CALCULATED'; contains 'RULE-BASED'.
   (Do not assert 'text-terminal-down' / 'text-terminal-up': the sector headings always contain those classes.)
2. trend 'TÍCH CỰC', trendScore 72 → contains 'điểm quy tắc 72/100' and 'bg-terminal-up/12'; does NOT contain
   'bg-terminal-down/12'.
3. trend 'TRUNG TÍNH', trendScore 55 → contains 'điểm quy tắc 55/100'; does NOT contain 'bg-terminal-up/12'.

ALLOWED FILES:
- src/components/dashboard/AIMarketSummaryCard.tsx
- src/components/dashboard/__tests__/AIMarketSummaryCard.test.tsx (new)

DO NOT TOUCH: every other file, including `src/services/market/RealMarketDataProvider.ts` (separate decision).
Create no other files: the report is NOT a file.

ACCEPTANCE CRITERIA:
1. No fixed bullish text or fixed 'Hấp thụ tốt' badge; trend badge colour follows `summary.trend`; no CALCULATED label.
2. Tests written as specified (the orchestrator runs them).
3. `npx tsc --noEmit` reports 109 errors (baseline) or fewer.

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error. No commits, installs,
migrations, network or database access. Do not delete or rename files. Never delete or weaken an existing test.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Under TESTS write "not run (orchestrator runs them)". Do NOT use bash,
echo, cat, printf or the write tool to output it. Once the work is done, stop calling tools and reply with the block.
