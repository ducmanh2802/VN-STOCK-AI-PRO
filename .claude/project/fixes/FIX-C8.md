# TASK BRIEF - FIX-C8

GOAL: `/news-macro` must fail closed instead of crashing when an API answers HTTP 200 with a null or
non-JSON body: such a response becomes an error state with a message, never a "success" with `data: null`.

CONTEXT:
- You already run in the repository root. Edit with the edit tool. Bash is limited to `npx tsc --noEmit`
  and read-only git commands; never prefix `cd`, never use pipes, `;`, `&&` or redirection.
- File: `src/pages/MacroNewsPage.tsx`.
  - Lines 48-59, `async function fetchJson<T>(url: string): Promise<T>`:
    `const body = await res.json().catch(() => null);` — when `res.ok` is true it does `return body as T;`
    even if `body` is `null` (empty body, invalid JSON, or a literal `null`).
  - Callers `loadOne` (lines 144-158) and `loadList` (lines 201-216) then store
    `{ status: 'success', data }` with `data === null`.
  - The list renderer reads `lists[listTab].data.items` at lines 514, 525 and 538, so a null body crashes the
    whole page ("Cannot read properties of null (reading 'items')"). Verified in a browser on 2026-10-15.
- Required fix (minimal):
  1. In `fetchJson`, when `res.ok` is true but `body` is `null` or not an object, throw an `Error` with a
     Vietnamese message that names the URL, e.g. `Phản hồi không hợp lệ (không phải JSON) từ ${url}`.
     Keep the existing error handling for `!res.ok` exactly as it is.
  2. Add `export` to `fetchJson` so it can be unit-tested. Change nothing else in its behaviour.
  3. Do not change the render code, the endpoints, the labels or any other function.
- Add a new test file `src/pages/__tests__/MacroNewsPageFetch.test.ts` (vitest, node environment; import
  `{ describe, it, expect, vi, afterEach }` from 'vitest'; stub `fetch` with `vi.stubGlobal('fetch', ...)` and
  restore with `vi.unstubAllGlobals()` in afterEach). Cover:
  - 200 with a JSON object body → resolves to that object;
  - 200 whose `json()` rejects (invalid JSON) → rejects with an Error whose message contains the URL;
  - 200 whose `json()` resolves to `null` → rejects;
  - 500 with `{ error: "boom" }` → rejects with message "boom";
  - 404 with `{ error: { code: "X", message: "nope" } }` → rejects with message "nope".
  Build the fake response as a plain object `{ ok, status, json: () => Promise }`.

ALLOWED FILES (exact repo-relative paths; the only files you may create or edit):
- src/pages/MacroNewsPage.tsx
- src/pages/__tests__/MacroNewsPageFetch.test.ts

DO NOT TOUCH: every other file, in particular the AGENTS.md section 2 protected paths and every file with
uncommitted user work.

ACCEPTANCE CRITERIA:
1. `fetchJson` is exported and throws on a 200 response with a null or non-object body; the `!res.ok` branch
   is byte-for-byte unchanged.
2. No other line of `MacroNewsPage.tsx` changes.
3. The new test file covers the 5 cases above and passes.
4. `npx tsc --noEmit` reports no new errors versus the baseline.

VERIFY (the orchestrator runs these; you may run only `npx tsc --noEmit`):
- npx tsc --noEmit -> no new errors versus BASELINE
- npx vitest run src/pages/__tests__/MacroNewsPageFetch.test.ts src/pages/__tests__/PhaseFiveViews.test.tsx -> all pass

BASELINE: tsc 109 errors (85 vitest-globals in tests, 24 in rebalancing tests). Known failing tests: 9 in
src/lib/rebalancing-decision, 1 in src/test/reachabilityGate.test.ts, 1 in src/lib/strategy/__tests__/StrategyContextAggregator.test.ts.

LIMITS: at most 3 fix attempts per failure, then STATUS: BLOCKED with the last error output.
No commits, installs, migrations, network or database access. Do not delete or rename files.

REPORT: end with the AGENTS.md section 7 block. Its first line must be
`STATUS: PASS | PARTIAL | BLOCKED | FAILED`. The report is ordinary text in your LAST message: do NOT use bash,
echo, cat, printf or the write tool to output it, and never write outside the repo. Once the work is done,
stop calling tools and reply with the block.
