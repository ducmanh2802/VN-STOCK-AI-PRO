# TASK BRIEF - FIX-SNAPSHOT-B

GOAL: The technical-indicator panel must say "not enough data" instead of asserting a market state when an
indicator is null.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`,
  `npx vitest run src/components/stock/__tests__/StockHardenedComponents.test.tsx` and read-only git commands;
  never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- Since FIX-SNAPSHOT-A, `computeIndicatorSnapshot` (`src/lib/indicators/snapshot.ts`) returns `null` for
  `sma50.value`, `sma200.value` / `priceRelation` / `diffPercent`, `sma200.goldenCross`, `macd.macd` / `signal` /
  `histogram` / `trend`, and `volume.ma20` / `ratioToMA` / `trend` when the history is too short (SMA200 needs 200
  sessions, MACD 35; the default 3-month chart has about 95). Numbers already render `--` through the existing
  `hasXxx` guards. Three TEXTS in `src/components/stock/StockTechnicalIndicators.tsx` still assert a state:
  1. Lines 215-219: `{sma200.goldenCross ? 'MA50 nằm trên MA200 - ...' : 'Đang theo dõi kiểm định ngưỡng hỗ trợ dài hạn MA200'}`
     — when `goldenCross` is null this claims MA200 is being tested although it does not exist.
  2. Line 235: `{volume.trend === 'SURGE' ? 'BÙNG NỔ VOL' : volume.trend === 'DRY' ? 'CẠN KIỆT' : 'BÌNH THƯỜNG'}`
     — null trend is shown as 'BÌNH THƯỜNG' (normal).
  3. Lines 246-250: `{hasVolumeRatio && volume.ratioToMA >= 1.3 ? '...' : 'Thanh khoản duy trì ở mức cân bằng tích lũy'}`
     — with no ratio it claims balanced liquidity.
  4. Lines 101-105: the MACD badge uses the red (down) style for any trend that is not bullish, including null.

REQUIRED CHANGES in `StockTechnicalIndicators.tsx` (minimal, nothing else):
1. Lines 215-219 become three cases: `sma200.goldenCross === true` → the existing uptrend text;
   `sma200.goldenCross === false` → the existing 'Đang theo dõi kiểm định ngưỡng hỗ trợ dài hạn MA200';
   otherwise → 'Chưa đủ dữ liệu MA200 (cần tối thiểu 200 phiên)'.
   Also make the badge condition on line 193 explicit: `sma200.goldenCross === true && (...)`.
2. Line 235: when `volume.trend` is null/undefined show '--' (keep SURGE / DRY / NORMAL → 'BÙNG NỔ VOL' /
   'CẠN KIỆT' / 'BÌNH THƯỜNG'); the badge style for a null trend is the neutral muted one:
   `'bg-terminal-bg text-terminal-text-muted border border-terminal-border'`.
3. Lines 246-250: three cases: `hasVolumeRatio && volume.ratioToMA >= 1.3` → existing surge text;
   `hasVolumeRatio` → existing 'Thanh khoản duy trì ở mức cân bằng tích lũy';
   otherwise → 'Chưa đủ dữ liệu khối lượng trung bình 20 phiên'.
4. MACD badge (lines 101-105): when `macd.trend` is null/undefined use the same neutral muted style; bullish and
   bearish styles unchanged.

TESTS — in `src/components/stock/__tests__/StockHardenedComponents.test.tsx`, inside
`describe('StockTechnicalIndicators', ...)`, keep every existing test unchanged and add one test that builds the
snapshot from real candles: import `computeIndicatorSnapshot` from `'../../../lib/indicators'`, make 95 candles with
FALLING closes (`close: 25000 - i * 10`, `open: close + 50`, `high: close + 100`, `low: close - 100`,
`volume: 1000000`, `time: \`t${i}\``), render `<StockTechnicalIndicators snapshot={snap} currentPrice={24060} />`
with `renderToStaticMarkup`, and expect the HTML: not to contain 'GOLDEN CROSS', not to contain
'Uptrend dài hạn lý tưởng', not to contain 'NaN', to contain 'Chưa đủ dữ liệu MA200'. Add a second test with the
same candles but every volume 0: expect it to contain 'Chưa đủ dữ liệu khối lượng trung bình 20 phiên' and not
'Thanh khoản duy trì ở mức cân bằng tích lũy'.

ALLOWED FILES:
- src/components/stock/StockTechnicalIndicators.tsx
- src/components/stock/__tests__/StockHardenedComponents.test.tsx

DO NOT TOUCH: every other file (the snapshot engine is done), the AGENTS.md section 2 protected paths.

ACCEPTANCE CRITERIA:
1. No text claims an MA200, volume or MACD state when the value is null.
2. `npx vitest run src/components/stock/__tests__/StockHardenedComponents.test.tsx` passes (existing + new tests).
3. `npx tsc --noEmit` reports 109 errors (baseline) or fewer.

VERIFY: you MUST run both commands yourself before reporting PASS (a PASS without a passing test run is a false
report). The orchestrator re-runs them plus the indicator and market tests.

BASELINE: tsc 109 errors. LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it,
and never write outside the repo. Once the work is done, stop calling tools and reply with the block.
