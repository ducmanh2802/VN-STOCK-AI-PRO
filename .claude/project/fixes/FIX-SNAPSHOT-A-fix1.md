# TASK BRIEF - FIX-SNAPSHOT-A (fix attempt 1 of 3, same session)

GOAL: Make your snapshot change correct and make the test file compile and pass. Same three allowed files.

WHAT THE ORCHESTRATOR FOUND (runner verify/):
- `npx tsc --noEmit`: `src/lib/indicators/__tests__/indicators.test.ts(300,1): error TS1005: ')' expected.`
- vitest: `Transform failed ... indicators.test.ts:300:0: ERROR: Expected ")" but found end of file`.
- You reported PASS without a passing test run. That is a false report. Run both commands before reporting.

DEFECTS IN `src/lib/indicators/snapshot.ts` (fix all):
1. `sma50Series.length >= 50`, `sma200Series.length >= 200`, `macdSeries.length >= 35` are wrong: those arrays hold
   RESULT points (`calculateSMA` returns `candles.length - period + 1` points, or `[]` when there is not enough data;
   `calculateMACD` returns `[]` below 35 candles). With 95 candles SMA50 has 46 points, so your code would hide a
   valid SMA50. "Not enough history" means the series is EMPTY (`length === 0`). Remove `hasSMA50History`,
   `hasSMA200History`, `sma50ValHasHistory`, `sma200ValHasHistory`, `hasMACDHistory` and `macdNull`.
2. `latestMACD` is declared with `const` inside the `if` block, assigned in the `else` block and read after it:
   that does not compile.
3. The volume condition `latestVol.value > 0` was not asked for: a real session with 0 volume and a positive
   20-session average must give ratio 0 and trend 'DRY', not null.

REQUIRED snapshot.ts CODE (make these sections read exactly like this; everything else as in the original file):
- SMA values:
  ```ts
  const sma20Val = sma20Series.length > 0 ? sma20Series[sma20Series.length - 1].value : currentPrice;
  const sma50Val = sma50Series.length > 0 ? sma50Series[sma50Series.length - 1].value : null;
  const sma200Val = sma200Series.length > 0 ? sma200Series[sma200Series.length - 1].value : null;
  ```
- MACD:
  ```ts
  const macdSeries = calculateMACD(candles, 12, 26, 9);
  const latestMACD = macdSeries.length > 0 ? macdSeries[macdSeries.length - 1] : null;
  const prevMACD = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : latestMACD;

  let macdTrend: IndicatorSnapshot['macd']['trend'] = null;
  let macdLabel = 'Chưa đủ dữ liệu để tính MACD (cần tối thiểu 35 phiên)';
  if (latestMACD && prevMACD) {
    // the ORIGINAL four branches, unchanged (BULLISH_CROSS, BEARISH_CROSS, BULLISH, else BEARISH)
  }
  ```
- Volume:
  ```ts
  const volSeries = calculateVolumeSeries(candles, 20);
  const latestVol = volSeries.length > 0 ? volSeries[volSeries.length - 1] : { value: 0, volumeMA: undefined };
  const volMA20 = latestVol.volumeMA !== undefined && latestVol.volumeMA > 0 ? latestVol.volumeMA : null;
  const ratioToMA = volMA20 !== null ? Number((latestVol.value / volMA20).toFixed(2)) : null;

  let volTrend: IndicatorSnapshot['volume']['trend'] = null;
  if (ratioToMA !== null) {
    volTrend = 'NORMAL';
    if (ratioToMA >= 1.5) {
      volTrend = 'SURGE';
    } else if (ratioToMA <= 0.65) {
      volTrend = 'DRY';
    }
  }
  ```
- Returned object (other keys unchanged):
  ```ts
  macd: {
    macd: latestMACD ? latestMACD.macd : null,
    signal: latestMACD ? latestMACD.signal : null,
    histogram: latestMACD ? latestMACD.histogram : null,
    trend: macdTrend,
    label: macdLabel,
  },
  sma50: {
    value: sma50Val,
    priceRelation: sma50Val !== null ? (currentPrice >= sma50Val ? 'ABOVE' : 'BELOW') : null,
    diffPercent: sma50Val !== null ? Number((((currentPrice - sma50Val) / sma50Val) * 100).toFixed(2)) : null,
  },
  sma200: {
    value: sma200Val,
    priceRelation: sma200Val !== null ? (currentPrice >= sma200Val ? 'ABOVE' : 'BELOW') : null,
    diffPercent: sma200Val !== null ? Number((((currentPrice - sma200Val) / sma200Val) * 100).toFixed(2)) : null,
    goldenCross: sma50Val !== null && sma200Val !== null ? sma50Val > sma200Val : null,
  },
  volume: {
    current: latestVol.value,
    ma20: volMA20,
    ratioToMA,
    trend: volTrend,
  },
  ```
Keep your `types.ts` change if it makes exactly the fields listed in the original brief nullable.

DEFECTS IN `src/lib/indicators/__tests__/indicators.test.ts` (fix all; keep every pre-existing test unchanged):
1. Structure: the existing `describe('Indicator Snapshot', ...)` lost its closing `});` and the file ends with `}`.
   Close `describe('Indicator Snapshot', ...)` right after its existing test, put your new
   `describe('Indicator Snapshot — insufficient history', ...)` after it inside the outer describe, and end the file
   with `});` so the outer `describe('Technical Indicators Library ...')` is closed.
2. Test '30 candles: ...': its volumes are real, so the 20-session average exists. Remove its three `volume`
   expectations and rename it to '30 candles: SMA50 and MACD are null'.
3. Test '220 rising candles': the check `[typeof a, typeof b, typeof c].every(t => typeof t === 'number')` is always
   false (`typeof 'number'` is 'string'). Replace it with three lines:
   `expect(typeof snapshot.macd.macd).toBe('number');` and the same for `signal` and `histogram`.
   Also add `expect(snapshot.sma200.goldenCross).toBe(true);` (steadily rising closes).
4. Add one test: 30 candles with volume 1000000 except the LAST candle with volume 0 → `volume.ratioToMA` toBe(0),
   `volume.trend` toBe('DRY'), `volume.ma20` is a positive number.

ALLOWED FILES:
- src/lib/indicators/snapshot.ts
- src/lib/indicators/types.ts
- src/lib/indicators/__tests__/indicators.test.ts

DO NOT TOUCH: every other file.

ACCEPTANCE CRITERIA:
1. `npx vitest run src/lib/indicators/__tests__/indicators.test.ts` passes (all tests).
2. `npx tsc --noEmit` reports 109 errors or fewer (baseline 109) and none in the three allowed files.

VERIFY: run both commands yourself before reporting (no `cd`, pipes, `;`, `&&` or redirection).

LIMITS: attempt 1 of 3 for this failure. No commits, installs, network or database access.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it.
