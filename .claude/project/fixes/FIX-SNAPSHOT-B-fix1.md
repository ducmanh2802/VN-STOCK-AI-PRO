# TASK BRIEF - FIX-SNAPSHOT-B (fix attempt 1 of 3, same session)

GOAL: Undo two mistakes from your previous run. Same two allowed files; nothing else.

WHAT THE ORCHESTRATOR FOUND (the runner's vitest passed 35/35 and tsc is 109, but the change is not acceptable):
1. You DELETED an existing test in `src/components/stock/__tests__/StockHardenedComponents.test.tsx`
   ('handles non-finite values in technical indicators gracefully without crashing') and put your new test in its
   place. Existing tests must never be deleted. Re-add it, unchanged, as the first test after
   'renders unavailable message when snapshot is null' inside `describe('StockTechnicalIndicators', ...)`, and keep
   your two new tests after it. The exact original code:
   ```tsx
       it('handles non-finite values in technical indicators gracefully without crashing', () => {
         const brokenSnapshot = {
           symbol: 'HPG',
           date: '2026-09-16',
           rsi: { value: Number.NaN, status: 'NEUTRAL', label: 'RSI vùng tích lũy' },
           macd: { macd: Number.NaN, signal: 0, histogram: Number.NaN, trend: 'NEUTRAL', label: 'MACD đi ngang' },
           bollinger: { upper: Number.NaN, middle: Number.NaN, lower: Number.NaN, bandwidth: Number.NaN, status: 'NORMAL', label: 'Dải hẹp' },
           sma20: { value: Number.NaN, diffPercent: Number.NaN, status: 'ABOVE' },
           sma50: { value: Number.NaN, diffPercent: Number.NaN, status: 'ABOVE' },
           sma200: { value: Number.NaN, diffPercent: Number.NaN, status: 'ABOVE' },
           volume: { current: 100000, ma20: Number.NaN, ratioToMA: Number.NaN },
         } as unknown as IndicatorSnapshot;

         const html = renderToStaticMarkup(
           <StockTechnicalIndicators snapshot={brokenSnapshot} currentPrice={28000} />
         );
         expect(html).not.toContain('NaN');
         expect(html).toContain('--');
       });
   ```
2. REGRESSION in `src/components/stock/StockTechnicalIndicators.tsx`: the volume badge text now shows '--' for a
   real 'NORMAL' trend. It must be:
   ```tsx
   {volume.trend === 'SURGE' ? 'BÙNG NỔ VOL' : volume.trend === 'DRY' ? 'CẠN KIỆT' : volume.trend === 'NORMAL' ? 'BÌNH THƯỜNG' : '--'}
   ```
   Change nothing else in that file.
3. Add one test (after your two new ones) proving the NORMAL case: the same 95 falling candles with
   `volume: 1000000` on every candle (ratio 1.0 → 'NORMAL'); expect the HTML to contain 'BÌNH THƯỜNG' and
   'Thanh khoản duy trì ở mức cân bằng tích lũy'.
4. Your previous run also created `AGENTS.md_sect7_report.txt` at the repository root. Never create report files;
   the report is plain text in your last message. Do not touch that file now (the orchestrator handles it).

ALLOWED FILES:
- src/components/stock/StockTechnicalIndicators.tsx
- src/components/stock/__tests__/StockHardenedComponents.test.tsx

DO NOT TOUCH: every other file. Create no files.

ACCEPTANCE CRITERIA:
1. The deleted test is back, unchanged; every other pre-existing test unchanged.
2. A NORMAL volume trend shows 'BÌNH THƯỜNG'; a null trend shows '--'.
3. `npx vitest run src/components/stock/__tests__/StockHardenedComponents.test.tsx` passes (if bash refuses to
   run it, say so under BLOCKERS — do not claim it passed); `npx tsc --noEmit` reports 109 errors or fewer.

LIMITS: attempt 1 of 3. No commits, installs, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it.
