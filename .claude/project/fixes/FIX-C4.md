# TASK BRIEF - FIX-C4

GOAL: Valuation must not invent company-specific growth rates. A missing 5-year FCF growth rate (DCF) or
dividend growth rate (DDM) makes that method unavailable (value null + reason). Model parameters (WACC,
terminal growth, required return) may still use documented defaults, but every result says which values it
used and which of them were defaults.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- `src/lib/analysis/valuation/formulas.ts`:
  - Lines 3-6: `export interface ValuationMethodOutput { value: number | null; reason?: string; }`
  - Lines 61-117 `calculateDCFValuation`: line 71 `const g1 = sanitizeNumber(params.growthRate5Y) ?? 0.10;`
    (company-specific — must not default), line 72 `g2 ... ?? 0.03` and line 73 `wacc ... ?? 0.105`
    (model parameters — defaults allowed but must be disclosed).
  - Lines 123-143 `calculateDividendValuation`: line 129 `const g = sanitizeNumber(params.dividendGrowthRate) ?? 0.04;`
    (company-specific — must not default), line 130 `const r = ... ?? 0.105;` (model parameter).
- `src/services/financialDocuments/CanonicalFinancialFactsAdapter.ts` line 386:
  `growthRate5Y: options?.growthRate5Y ?? 0.10,` — same invented growth at the adapter level. Line 385
  (`discountRateWACC ?? 0.105`) is a model parameter and may stay.
- Caller: `src/lib/analysis/valuation/ValuationEngine.ts` lines 78-80 passes `growthRate5Y` through. Do not edit it.
- Required fix (minimal):
  1. Extend `ValuationMethodOutput` with optional, read-only
     `assumptions?: Readonly<Record<string, number>>` and `defaultedAssumptions?: readonly string[]`.
  2. DCF: if `growthRate5Y` is missing/invalid → `{ value: null, reason: 'Thiếu tốc độ tăng trưởng FCF 5 năm đã xác minh (growthRate5Y), không định giá DCF.' }`.
     On success return `assumptions: { growthRate5Y, terminalGrowthRate, discountRateWACC }` (the numbers used)
     and `defaultedAssumptions` listing the keys that came from defaults (subset of terminalGrowthRate, discountRateWACC).
  3. DDM: if `dividendGrowthRate` is missing/invalid → null with a Vietnamese reason; on success return
     `assumptions: { dividendGrowthRate, requiredReturnRate }` and `defaultedAssumptions` (requiredReturnRate if defaulted).
  4. Adapter line 386: `growthRate5Y: options?.growthRate5Y ?? null` (type it `number | null` where needed).
  5. Change nothing else; keep every existing reason string and early return exactly as it is.
- Tests: extend `src/lib/analysis/valuation/__tests__/valuationAnalysisFailClosed.test.ts` (read it and
  `valuation.test.ts` first; keep existing tests unchanged unless one asserts the old invented default — if so,
  name it in your report instead of silently editing it) with: DCF without growthRate5Y → value null;
  DCF with growthRate5Y but no WACC → value present, `defaultedAssumptions` contains 'discountRateWACC';
  DDM without dividendGrowthRate → null; DDM with it → value present and assumptions reported.

ALLOWED FILES:
- src/lib/analysis/valuation/formulas.ts
- src/services/financialDocuments/CanonicalFinancialFactsAdapter.ts
- src/lib/analysis/valuation/__tests__/valuationAnalysisFailClosed.test.ts

DO NOT TOUCH: every other file, the AGENTS.md section 2 protected paths and every file with uncommitted user work.

ACCEPTANCE CRITERIA:
1. No company-specific growth default remains in the three places named above.
2. Every successful DCF/DDM result reports the assumptions it used and which were defaults.
3. Existing tests pass (or the report names any that asserted the old behaviour); new tests pass.
4. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run src/lib/analysis/valuation src/services/financialDocuments src/lib/analysis/__tests__/QuantPropertyBasedHardening.test.ts -> all pass

BASELINE: tsc 109 errors. Known failing tests: 9 in src/lib/rebalancing-decision, 1 in
src/test/reachabilityGate.test.ts, 1 in src/lib/strategy/__tests__/StrategyContextAggregator.test.ts (separate task).

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
