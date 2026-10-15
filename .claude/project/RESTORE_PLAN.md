# Restoration plan — undo `a277613` by restoring subsystems from `a277613~1`

Decided by the user on 2026-10-15 (see STATUS.md). Plan prepared read-only by a Claude Plan subagent, key
claims re-checked by Claude with git (package.json identical a277613~1↔HEAD; stub sizes such as
TradingEngine 20 vs 841 lines; user diffs in ScenarioApiRouter.ts and PaperTradingPage.tsx; tsconfig `strict`
added by a277613). Progress is logged in STATUS.md, one changelog entry per step.

## Scope (git-checked)
- `a277613` (parent `675c1cf`): 241 deleted, 62 modified, 4 added. 197 deleted files still GONE; of the 44 back:
  19 byte-identical to `a277613~1`, 21 re-added by `d365ccd` as small fabricating stubs, 4 user-edited copies.
- 24 files were changed again after `a277613`. Keep HEAD for `src/utils/formatters.ts` (55d3ff8 tokens),
  `bun.lock` (d365ccd adds compression/pglite to match package.json), `docs/AI_STUDIO_DEV_AUTH_CERTIFICATION.md`;
  the other 21 are d365ccd stubs → overwrite with `a277613~1`.
- `d365ccd` also stubbed `src/lib/db/replay/ReplayRepository.ts` and `src/lib/db/research/ResearchRepository.ts`
  (outside a277613's list) → restore in S8.
- `a277613` also deleted `package-lock.json` (breaks `npm ci` in Dockerfile/Render), `vitest.config.ts`,
  `src/vite-env.d.ts`, and turned on `strict` in `tsconfig.json` (~148 of the 563 errors are strict-only).

## Never overwrite (user-owned)
`src/services/scenario/ScenarioApiRouter.ts` (user fixed an import), `src/pages/DashboardPage.tsx`, `src/main.tsx`,
`src/lib/rebalancing-decision/__tests__/{ConstrainedAllocator,RebalancingDecisionFailClosed,TurnoverCost}.test.ts`,
`src/components/common/__tests__/`, `docs/abcd.md`. `src/pages/PaperTradingPage.tsx` = manual merge (write
`a277613~1`, re-apply the user's one-line class change on the "—" span; also restores BUY stopLoss/targetPrice).

## Restore rule (Git Bash only — PowerShell `>` writes UTF-16)
```bash
rs() { for p in "$@"; do
  if [ -n "$(git status --porcelain -- "$p")" ]; then echo "SKIP dirty/untracked: $p"; continue; fi
  mkdir -p "$(dirname "$p")" && git show "a277613~1:$p" > "$p"
  [ "$(git hash-object "$p")" = "$(git rev-parse "a277613~1:$p")" ] || echo "MISMATCH $p"
done; }
```
Never `git checkout`, `stash`, `reset`. Per step: tsc count + per-file comparison (errors in settled files must not
rise), the listed `npx vitest run <files>`, `npm run build` after steps touching server imports, a STATUS entry.

## Steps (dependency order)

| Step | Subsystem (files) | Protected / approval | Fixes |
|---|---|---|---|
| 0 | Back up user and Claude files to the scratchpad; record status + tsc 563 | — (a user commit as rollback point is the user's call) | — |
| 1 | Tooling: `vitest.config.ts`, `src/vite-env.d.ts` (2) | P: vitest.config.ts | test config |
| 1b | `package-lock.json` (no npm install/ci) | lock file | `npm ci` in Docker/Render |
| 2 | Shared types/schemas: `src/types/*` (6 M + provider.ts), `src/schemas/*`, `src/lib/trading/types/{risk,trading}.ts` (13) | P: trading types | C7, C12 |
| 3 | Market data `src/services/market/**` incl. providers (35) | P: 14 provider files (+ realMarketDataService.ts, index.ts recommended) | C5, fake 28,500 quotes |
| 4 | Trading/risk core + boundary + routers, all in one go (69) | P: whole step | C1, trading API stub, backtest NOT_CONFIGURED |
| 5 | Rebalancing decision `index.ts`, `types.ts`, Determinism test (3) | — | C9 (part) |
| 6 | Intelligence services: capital-cycle, corporate-actions, derivatives, earnings, etf, financialDocuments, macro-regime, macro (34) | — | C2, C11 |
| 7 | Strategy: `StrategyContextAggregator.ts`, services, tests (18) | — | C9 |
| 8 | Replay + research libs/services + 2 DB repositories (28) | DB repositories: explicit approval | fabricated replay, certify defaults |
| 9 | Data ingestion `src/services/data/**` (17; `src/scripts/*` optional, never run) | PGlite (in-memory) tests: approval | oldest-bar "latest", no-op EOD, EOD boot crash |
| 10 | Platform/business/middleware (15) | auth-sensitive: user review (security headers change, HSTS dropped) | — |
| 11 | Product services: learning, journal, AI chat, QueryProvider, alerts, newsMacro service (7) | — | AI copilot contract |
| 12 | UI pages + store (12 byte-exact, 2 GONE, 10 tests) + PaperTradingPage merge | user confirms the merge | C6, route QA |
| 13 | Config: `tsconfig.json` → `a277613~1` (recommended), `vite.config.ts` optional, orphans (DemoBadge, PhasePlaceholderPage, 2 a277613 middleware tests) | P: tsconfig, vite.config; deletions need approval | strict-only errors; target ≈ 117 tsc errors |

Not fixed by the restore (fix-forward afterwards): C3 (`MoneyFlowEngine` 999), C4 (valuation defaults), C8
(`MacroNewsPage` null crash; page already equals `a277613~1`), C10 (win-rate default, `new Date()` in engine).

## Risks
- Temporary tsc rises between steps (judge settled files, not the raw count); S4 core and routers go together.
- S10 restores stricter security headers (X-Frame-Options DENY …) and drops HSTS; AI Studio framing is a separate decision.
- `server.ts` port handling changed by d365ccd (ignores PORT outside production) — protected, flag only.
- Watchlist localStorage key returns to `vn_stock_ai_watchlist`.
- `src/middleware/__tests__/{auth,rateLimit}.test.ts` (added by a277613) will fail against the restored middleware.
- The tree is only durable after the user commits; suggest a commit after each verified step.
