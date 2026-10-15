# TASK BRIEF - FIX-SNAPSHOT-A (fix attempt 2 of 3, same session)

GOAL: Fix one regression in `snapshot.ts` and restore two missing test checks. Small, exact edits only.

WHAT THE ORCHESTRATOR FOUND after fix 1 (tests pass, tsc 109, but the change is not acceptable):
1. REGRESSION in `src/lib/indicators/snapshot.ts`: inside `if (latestMACD && prevMACD) { ... }` the four branches
   only set `macdTrend`; the `macdLabel = ...` lines were dropped. So when MACD IS available the label still says
   'Chưa đủ dữ liệu để tính MACD (cần tối thiểu 35 phiên)'. Make the block exactly:
   ```ts
   if (latestMACD && prevMACD) {
     if (latestMACD.macd > latestMACD.signal && prevMACD.macd <= prevMACD.signal) {
       macdTrend = 'BULLISH_CROSS';
       macdLabel = 'Cắt lên Signal (Tín hiệu MUA ngắn hạn)';
     } else if (latestMACD.macd < latestMACD.signal && prevMACD.macd >= prevMACD.signal) {
       macdTrend = 'BEARISH_CROSS';
       macdLabel = 'Cắt xuống Signal (Tín hiệu BÁN chốt lời)';
     } else if (latestMACD.macd > latestMACD.signal) {
       macdTrend = 'BULLISH';
       macdLabel = 'Nằm trên Signal (Động lượng tăng tiếp diễn)';
     } else {
       macdTrend = 'BEARISH';
       macdLabel = 'Nằm dưới Signal (Động lượng điều chỉnh)';
     }
   }
   ```
   Change nothing else in `snapshot.ts`.
2. MISSING TEST in `src/lib/indicators/__tests__/indicators.test.ts`: the 95-candle test (the main defect: about 95
   bars is the default 3-month chart) is gone. Add it as the FIRST `it` inside
   `describe('Indicator Snapshot — insufficient history', ...)`:
   ```ts
   it('95 candles: SMA50 exists, SMA200 and goldenCross are null (no golden cross without 200 sessions)', () => {
     const candles: CandlePoint[] = Array.from({ length: 95 }, (_, i) => ({
       time: `2025-01-${String(i + 1).padStart(2, '0')}`,
       open: 25000 + i * 10 - 50,
       high: 25100 + i * 10,
       low: 24900 + i * 10,
       close: 25000 + i * 10,
       volume: 1000000,
     }));
     const snapshot = computeIndicatorSnapshot(candles);
     expect(snapshot).not.toBeNull();
     if (!snapshot) return;

     expect(typeof snapshot.sma50.value).toBe('number');
     expect(snapshot.sma50.priceRelation).toBe('ABOVE');
     expect(snapshot.sma200.value).toBeNull();
     expect(snapshot.sma200.priceRelation).toBeNull();
     expect(snapshot.sma200.diffPercent).toBeNull();
     expect(snapshot.sma200.goldenCross).toBeNull();
   });
   ```
3. MISSING CHECKS in the existing test '220 rising candles: ...': add these two lines at its end:
   ```ts
   expect(snapshot.sma200.goldenCross).toBe(true);
   expect(snapshot.macd.label).not.toContain('Chưa đủ dữ liệu');
   ```

ALLOWED FILES:
- src/lib/indicators/snapshot.ts
- src/lib/indicators/__tests__/indicators.test.ts

DO NOT TOUCH: every other file, including `src/lib/indicators/types.ts` (it is correct now).

ACCEPTANCE CRITERIA:
1. `npx vitest run src/lib/indicators/__tests__/indicators.test.ts` passes, including the new and the existing tests.
2. `npx tsc --noEmit` reports 109 errors (baseline) or fewer, none in the allowed files.

VERIFY: run both commands yourself before reporting (no `cd`, pipes, `;`, `&&` or redirection).

LIMITS: attempt 2 of 3. No commits, installs, network or database access.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it.
