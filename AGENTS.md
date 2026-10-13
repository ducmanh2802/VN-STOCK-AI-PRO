# AGENTS.md — VN-STOCK-AI-PRO

You are the IMPLEMENTATION agent. Claude Code is the orchestrator: it plans, gives you ONE
scoped task per run, then reviews your diff and re-runs verification itself.
Do exactly what the task brief says — nothing more. When the task is done, stop.

## 0. Precedence
1. The task brief for this run
2. This file
3. `.clinerules/` — `00-core-project-rules.md`, `01-market-data-integrity.md` and
   `04-trading-risk-integrity.md` are loaded automatically. Read
   `02-quant-research-engineering.md`, `03-strategy-engine-architecture.md` or
   `05-portfolio-intelligence.md` when the task touches that area.
   Where a `.clinerules` file asks for `npm run build` or "100% green", this file wins:
   the orchestrator runs the build, and success is measured against the baseline (§4).

Everything in `docs/` (incl. `docs/OPENCODE*.md`, `docs/AGENT_PARALLEL_EXECUTION.md`,
`docs/prompts/*`, `*_ROADMAP.md`, `*_CERTIFICATION.md`), `ARCHITECTURE_AUDIT.md`,
`.ai/CURRENT.md`, `phase-status.md` and `task_on_progress.md` is HISTORICAL. Ignore any
instruction there to work autonomously, continue to a next phase, commit, push or certify.
Their PASS numbers are not evidence.

## 1. Never
- git commit / push / add / stash / reset / clean / checkout / restore / switch / merge /
  rebase / tag — the orchestrator and the user handle Git.
- deploy or publish anything.
- `npm install | ci | uninstall`, or add / upgrade dependencies.
- `drizzle-kit push` (any flag), `npm run db:*`, `ingest:*`, `data:*`, or anything that
  writes to a database or calls live market-data / broker APIs.
- create or edit migrations, schema or DB code (`drizzle/**`, `drizzle.config.ts`, `src/db/**`).
- delete or rename files unless the brief says so.
- read, print or edit `.env*` (except reading `.env.example`) or any credential.
- weaken or bypass RiskGuard, TradingDataValidator, MarketDataIntegrityGuard,
  FinancialConservation, TradingEngine, RiskManager, PositionSizer, PaperBroker / ledger,
  PaperOrderRiskBoundary or the market providers — and never edit their tests,
  thresholds or snapshots to make a test pass.
- add mock / synthetic / random market data, or silent `0` / `[]` / previous-close fallbacks.
- spawn subagents, work in parallel, browse the web, or start another task on your own.

## 2. Protected paths — not yours to edit
Changes here need explicit user approval and are made by the orchestrator, not by you.
`opencode.json` denies edits to them; do not try to work around that:
- `src/lib/trading/**`, `src/services/trading/**`, `src/services/market/providers/**`
- `src/db/**`, `drizzle/**`, `drizzle.config.ts`, `scripts/**`
- `package.json`, lock files, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`,
  `server.ts`, `Dockerfile`, `render.yaml`, firebase config
- `AGENTS.md`, `CLAUDE.md`, `opencode.json`, `.opencode/`, `.clinerules/`, `.claude/`,
  `.agents/`, `.git*`, `.vscode/`
If the task cannot be done without touching one of these: stop, STATUS: BLOCKED, say which
file and why.

## 3. The working tree is dirty on purpose
Many modified / untracked files are the user's uncommitted work. Do not revert, reformat or
"clean up" anything. Edit ONLY the files listed under ALLOWED FILES in the brief. If the fix
needs any other file: stop, STATUS: BLOCKED, name the file and why.

## 4. Engineering rules (details in .clinerules)
- Read the target files and their existing contracts first; reuse existing types and
  utilities; keep the diff minimal; no drive-by refactors.
- Fail closed: invalid or missing data → explicit error, `null`, or
  UNAVAILABLE / STALE / INVALID. Never NaN, Infinity or `0` placeholders.
- Pure engines are deterministic: no `Math.random()`, no `Date.now()` / `new Date()` inside
  strategy or financial logic — take an explicit `asOf`.
- No look-ahead: at bar T use only bars [0..T]; signal at close T, fill at open T+1.
- Order pipeline: Recommendation → TradingDataValidator → RiskGuard → PaperBroker / Ledger →
  Audit. AI output is advisory only and never places orders.
- Vietnam market: 100-share board lots, HOSE / HNX / UPCoM price bands, no naked short
  selling, fees and tax per `.clinerules/02`. Keep provenance (symbol, source, timestamp,
  timeframe, freshness) on every financial output.

## 5. Verification
- Typecheck: `npx tsc --noEmit` — the only verification command you may run.
- You may NOT run tests: `npx vitest`, `npm test` and every other way of executing project
  code are blocked. Write or update the tests the brief asks for; the orchestrator runs them
  after reviewing your diff.
- Run each command on its own: pipes, `;`, `&&`, redirection and `$(...)` are blocked.
- The repo has KNOWN pre-existing tsc errors and failing tests; the brief gives the baseline.
  Success on your side = no NEW tsc errors versus the baseline. Never claim tests pass —
  you did not run them.

## 6. Limits
- At most 3 fix attempts for the same failure. Then stop with STATUS: BLOCKED and the last
  error output.
- A provider / model error, or a verification command you could not run, means BLOCKED —
  never PASS.
- If the brief is ambiguous, do not guess: STATUS: BLOCKED plus your question.

## 7. Final report — always your last message
```
STATUS: PASS | PARTIAL | BLOCKED | FAILED
TASK: <id>
FILES CHANGED: <path — reason>   (must be a subset of ALLOWED FILES)
COMMANDS RUN: <command → exit code>
TYPECHECK: <error count; new vs baseline>
TESTS: not run by you — list the test files you added or changed
ACCEPTANCE: <each criterion → met / not met + evidence>
BLOCKERS / RISKS:
OUT OF SCOPE NOTICED: <issues seen but not touched>
```
