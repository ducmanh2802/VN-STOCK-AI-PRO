# TASK BRIEF - FIX-SNAPSHOT-A

GOAL: `computeIndicatorSnapshot` must report "not available" (null) instead of placeholder numbers when there is
not enough history for SMA50, SMA200, MACD or the 20-session volume average.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`,
  `npx vitest run src/lib/indicators/__tests__/indicators.test.ts` and read-only git commands; never prefix `cd`,
  never use pipes, `;`, `&&` or redirection.
- File `src/lib/indicators/snapshot.ts` (reached in production: `server.ts` → `src/services/market/stockHistory.ts:187,220`
  → `StockTechnicalIndicators.tsx` on the stock detail page). It returns null below 20 candles (line 13), but above
  that it substitutes placeholders:
  - lines 26-27: `sma50Val` / `sma200Val` fall back to `currentPrice` when the series is empty (SMA50 needs 50
    candles, SMA200 needs 200; the default 3M chart has about 95). Then line 130 `goldenCross: sma50Val > sma200Val`
    becomes `sma50 > currentPrice`, and the UI shows "GOLDEN CROSS ... Uptrend dài hạn lý tưởng" when price is BELOW MA50.
  - line 51: MACD falls back to `{ macd: 0, signal: 0, histogram: 0 }` (`calculateMACD` returns [] below 35 candles),
    which lines 65-67 then label 'BEARISH' / 'Nằm dưới Signal'.
  - line 93: `const volMA20 = latestVol.volumeMA || 1;` invents a divisor of 1 when the average is 0 or undefined,
    so the ratio becomes the raw volume (a fake SURGE).
- Types: `IndicatorSnapshot` in `src/lib/indicators/types.ts` lines 38-82.
- The UI already renders `'--'` for null numbers (`isFiniteNumber` / `isPositiveFiniteNumber` guards); UI wording is a
  separate task, do not edit any component.

REQUIRED CHANGES (minimal):
1. `types.ts` — make only these fields nullable:
   - `macd`: `macd`, `signal`, `histogram` → `number | null`; `trend` → `... | null`.
   - `sma50` and `sma200`: `value` → `number | null`; `priceRelation` → `'ABOVE' | 'BELOW' | null`;
     `diffPercent` → `number | null`.
   - `sma200.goldenCross` → `boolean | null`.
   - `volume`: `ma20` → `number | null`; `ratioToMA` → `number | null`; `trend` → `... | null`.
2. `snapshot.ts`:
   a. `sma50Val` / `sma200Val` are `null` when their series is empty (leave `sma20Val` as is: with >= 20 candles it
      always exists). For `sma50` and `sma200`, when the value is null, `priceRelation` and `diffPercent` are null.
   b. `goldenCross` is `sma50Val > sma200Val` only when both are non-null, otherwise `null`.
   c. MACD: when `macdSeries` is empty, return `macd: null, signal: null, histogram: null, trend: null,
      label: 'Chưa đủ dữ liệu để tính MACD (cần tối thiểu 35 phiên)'` and skip the cross logic. Unchanged otherwise.
   d. Volume: no `|| 1`. If `latestVol.volumeMA` is undefined or <= 0, return `ma20: null, ratioToMA: null,
      trend: null`; otherwise exactly the current computation.
   e. Leave the RSI and Bollinger code unchanged (with >= 20 candles both series always exist).

TESTS — add a new `describe('Indicator Snapshot — insufficient history', ...)` block to
`src/lib/indicators/__tests__/indicators.test.ts` (keep every existing test unchanged). Build candles with a local
helper in that block (rising closes, positive volumes, like `sampleCandles`):
1. 95 candles: `sma50.value` is a number; `sma200.value`, `sma200.priceRelation`, `sma200.diffPercent` are null;
   `sma200.goldenCross` is null.
2. 30 candles: `sma50.value` is null; `macd.macd`, `macd.signal`, `macd.histogram`, `macd.trend` are null and
   `macd.label` contains 'Chưa đủ dữ liệu'.
3. 30 candles with every volume 0: `volume.ratioToMA`, `volume.ma20`, `volume.trend` are null.
4. 220 rising candles: `sma200.value` is a number and `sma200.goldenCross` is a boolean (`true` for a steadily
   rising series); MACD fields are numbers.

ALLOWED FILES:
- src/lib/indicators/snapshot.ts
- src/lib/indicators/types.ts
- src/lib/indicators/__tests__/indicators.test.ts

DO NOT TOUCH: every other file (no components, no services), the AGENTS.md section 2 protected paths.

ACCEPTANCE CRITERIA:
1. No placeholder for SMA50, SMA200, goldenCross, MACD or volume ratio; null when unavailable.
2. All tests in `src/lib/indicators/__tests__/indicators.test.ts` pass, including the existing ones.
3. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY: you MUST run both before reporting PASS (a PASS without a passing test run is a false report):
`npx vitest run src/lib/indicators/__tests__/indicators.test.ts` and `npx tsc --noEmit`. The orchestrator re-runs
them plus the component and service tests.

BASELINE: tsc 109 errors. LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it,
and never write outside the repo. Once the work is done, stop calling tools and reply with the block.
