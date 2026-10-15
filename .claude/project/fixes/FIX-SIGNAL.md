# TASK BRIEF - FIX-SIGNAL

GOAL: The `Signal` component must not turn a qualitative confidence label into an invented model percentage, and the
dashboard AI summary must not claim a model confidence that nothing computed.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`,
  `npx vitest run src/components/ui/__tests__/Signal.test.tsx` and read-only git commands; never prefix `cd`,
  never use pipes, `;`, `&&` or redirection.
- `src/components/ui/Signal.tsx`:
  - line 18: `confidence?: number | 'high' | 'medium' | 'low'; // 0 - 100 or rating`
  - lines 40-42: `const confidence = typeof confidenceProp === 'string' ? confidenceProp === 'high' ? 88 : confidenceProp === 'medium' ? 65 : 40 : confidenceProp;`
  - lines 171-176 render it as `Độ tin cậy mô hình: {confidence}%`. So the label 'high' is shown as an 88% model
    confidence that no model computed.
- `src/components/dashboard/AIMarketSummaryCard.tsx` lines 40-45 pass the literal `confidence="high"` to `<Signal>`
  (the summary comes from a rule-based template, not a model). The other caller,
  `src/components/stock/StockQuickViewModal.tsx:139-144`, passes no confidence (leave it alone).

REQUIRED CHANGES (minimal):
1. `Signal.tsx`: remove the 88 / 65 / 40 mapping. Render the confidence pill like this:
   - string `'high' | 'medium' | 'low'` → label `Mức tin cậy:` followed by `Cao` / `Trung bình` / `Thấp`, NO `%`;
   - a finite number → the existing `Độ tin cậy mô hình:` followed by `{n}%`;
   - undefined or a non-finite number (NaN, Infinity) → no pill at all.
   Change nothing else in the component.
2. `AIMarketSummaryCard.tsx`: delete the line `confidence="high"` from the `<Signal ... />` call. Nothing else.
3. New test file `src/components/ui/__tests__/Signal.test.tsx` (use `renderToStaticMarkup` from
   `react-dom/server`, like `src/components/stock/__tests__/StockHardenedComponents.test.tsx`):
   - `confidence="high"` → HTML contains 'Cao' and 'Mức tin cậy', does NOT contain '88%' nor 'Độ tin cậy mô hình';
   - `confidence="medium"` → contains 'Trung bình', not '65%'; `confidence="low"` → contains 'Thấp', not '40%';
   - `confidence={72}` → contains '72%' and 'Độ tin cậy mô hình';
   - `confidence={Number.NaN}` → does not contain 'NaN' and does not contain 'Độ tin cậy mô hình';
   - no confidence → does not contain 'Độ tin cậy mô hình' nor 'Mức tin cậy'.
   Use `type="BUY"` for all cases.

ALLOWED FILES:
- src/components/ui/Signal.tsx
- src/components/dashboard/AIMarketSummaryCard.tsx
- src/components/ui/__tests__/Signal.test.tsx (new)

DO NOT TOUCH: every other file. Create no other files (the report is NOT a file).

ACCEPTANCE CRITERIA:
1. No percentage is derived from a string rating; the dashboard summary passes no confidence.
2. `npx vitest run src/components/ui/__tests__/Signal.test.tsx` passes (if bash refuses to run it, say so under
   BLOCKERS — never claim it passed).
3. `npx tsc --noEmit` reports 109 errors (baseline) or fewer.

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error. No commits, installs,
migrations, network or database access. Do not delete or rename files. Never delete or weaken an existing test.

REPORT: end with the AGENTS.md section 7 block as plain text in your LAST message (first line
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`). Do NOT use bash, echo, cat, printf or the write tool to output it,
and never write a report file. Once the work is done, stop calling tools and reply with the block.
