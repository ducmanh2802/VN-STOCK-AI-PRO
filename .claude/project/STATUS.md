<!-- status-fingerprint: 923484d08522a439 -->
# VN-STOCK-AI-PRO — Status

Living status file, maintained by Claude (orchestrator). Every repository change gets a Changelog
entry here; the Stop hook `.claude/hooks/status-guard.mjs` blocks the end of a turn until this file
is updated and re-stamped (`node .claude/hooks/status-guard.mjs --stamp`). Every claim names the
command or file that proves it. For structure read [PROJECT_MAP.md](PROJECT_MAP.md) first.

Unlike `docs/`, `.ai/CURRENT.md`, `phase-status.md` and `task_on_progress.md` (historical claims),
this file records only evidence produced by a command. Re-check numbers that matter before acting.

## Current state — 2026-10-15

| Item | Value | Evidence |
|---|---|---|
| Branch / HEAD | `main` @ `55d3ff8` | `git log -1` |
| Typecheck | **109** errors | `npx tsc --noEmit` with the restored pre-a277613 tsconfig (563 before the restore; 117 on 2026-10-13); 85 are vitest globals in tests, 24 in rebalancing tests |
| Build | **PASS** | `npm run build` exit 0 (vite + esbuild server bundle) |
| Full test suite | not run | needs the user's approval |
| Routing tests | 11/11 pass | `npx vitest run src/store/__tests__/useAppStore.test.ts` |
| Runtime routes | **24 / 24 OK** | `vite preview` + headless browser, external requests blocked, after restore step 12 (was 16/25) |

Routes broken at runtime (2026-10-15):

| Route | Error | Cause |
|---|---|---|
| `/`, `/dashboard`, `/market`, `/sector-intelligence` | `getMarketIndices is not a function` | `src/services/market/index.ts` exposes it as `getIndices`; `src/hooks/useMarketQueries.ts` calls `getMarketIndices` |
| `/recommendations` | `rank is not a function` | recommendation engine API reverted by `a277613` |
| `/stock/:symbol` | `generateAllHorizons is not a function` | same |
| `/strategy-lab`, `/backtest` | React error #31 | page renders `HORIZON_LABELS[h]`, which is now an object `{vi, en, holding}` |
| `/news-macro` | `Cannot read properties of null (reading 'items')` | page does not fail closed on a null payload |

**Root cause of most breakage:** commit `a277613` (2026-10-14, "chore: update dependencies and
refactor codebase") deleted 241 files and rewrote 62 back to older versions. 197 of the deleted
files are still missing, including `src/lib/trading/risk/RiskGuard.ts` and `PositionSizer.ts`,
which `src/services/trading/PaperOrderRiskBoundary.ts` still imports.

## Open issues

### Confirmed by Claude (re-read the code on 2026-10-15)

| # | Defect | Location | Reached from | Protected |
|---|---|---|---|---|
| C1 | Risk core deleted: `RiskGuard.ts`, `PositionSizer.ts`, `VietnamLotRule.ts`, `TradingDataValidator.ts` are GONE; `PaperOrderRiskBoundary.ts:5-6` still imports two of them and no route mounts it, so no order path goes through risk checks | `src/lib/trading/**`, `src/services/trading/PaperOrderRiskBoundary.ts` | — | yes |
| C2 | Production `MacroRegimeService` imports test fixtures (`__tests__/macroFixtures.ts`) | `src/services/macro-regime/MacroRegimeService.ts:2` | `GET /api/macro/radar` (`server.ts:135`) | no |
| C3 | Money flow fabricates `volumeRatio = 999` and labels it SURGE when the 20-day average volume is 0 | `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts:321-322` | `server.ts`, `StockMoneyFlow.tsx` | no |
| C4 | DCF / dividend valuation silently default growth 10%, terminal 3%, WACC 10.5%, dividend growth 4% when inputs are missing | `src/lib/analysis/valuation/formulas.ts:71-73,129` | valuation routes | no |
| C5 | UI hooks call 10 `marketService` methods that no longer exist | `src/hooks/useMarketQueries.ts:69…`, `src/services/market/index.ts` | `/`, `/dashboard`, `/market`, `/sector-intelligence` | no (index.ts) |
| C6 | `RecommendationEngine.rank` / `generateAllHorizons` no longer exist (now `rankUniverse` / `generateMultiHorizon`) | `src/pages/RecommendationsPage.tsx:17`, `src/pages/StockDetailPage.tsx:71` | `/recommendations`, `/stock/:symbol` | no |
| C7 | `HORIZON_LABELS[h]` is an object but restored pages render it as text (React #31) | `src/pages/StrategyLabPage.tsx:235`, `src/pages/BacktestPage.tsx:209` | `/strategy-lab`, `/backtest` | no |
| C8 | ~~FIXED 2026-10-15 by FIX-C8~~ `MacroNewsPage` treated a null/non-JSON body as success and crashed on `.items` | `src/pages/MacroNewsPage.tsx:48-58,514-538` | `/news-macro` | no |
| C9 | Strategy service imports the missing `StrategyContextAggregator.ts`; rebalancing engines import the missing `./types.ts` (module unused outside itself) | `src/services/strategy/StrategyIntelligenceService.ts:3`, `src/lib/rebalancing-decision/{ConstraintEngine.ts:20,ConstrainedAllocator.ts:15}` | strategy API | no |
| C10 | Recommendation engine: win rate defaults to 0.5 when the score is null; `new Date()` inside the engine (determinism rule) | `src/lib/analysis/strategy/RecommendationEngine.ts:142,274-275` | recommendations | no |
| C11 | ETF intelligence service returns hard-coded NAV 24,500 / price 24,550 labelled `CURRENT` (no importer today) | `src/services/etf/EtfIntelligenceService.ts:14-21` | unreachable | no |
| C12 | Dashboard widgets read fields the reverted types no longer have (`trend`, `signalType`, `ceilings`, …; ~130 tsc errors) | `src/components/dashboard/*` | `/dashboard` | no |
| C13 | ~~FIXED 2026-10-15 by FIX-C13~~ `StrategyContextAggregator` defaulted `evaluatedAt` to the wall clock (`new Date()`, line 57) and checks market/derivatives/ETF snapshot look-ahead against it, not against `asOfDate`: a snapshot after `asOfDate` but before "now" is accepted. Its test (`StrategyContextAggregator.test.ts:52-63`, fixture 2026-10-15) became a time bomb on 2026-10-15 | `src/lib/strategy/StrategyContextAggregator.ts:57,188-202` | strategy API | no |

### Post-restore re-check (2026-10-15, read-only Claude workflow)

All 87 pre-restore leads re-checked against the restored tree: **56 FIXED_BY_RESTORE, 31 STILL_PRESENT**
(the MacroNewsPage one was fixed afterwards by FIX-C8). Batch 4-5 adds: high — `computeIndicatorSnapshot` substitutes
placeholder values with too little history; medium — dashboard aggregates and stock search are hard-coded synthetic data;
low — RSI 100 on a flat series; low (protected) — routers leak internal error messages, unvalidated `limit` params, dev ignores `PORT`. Full list:
[audit/2026-10-15-post-restore-recheck.md](audit/2026-10-15-post-restore-recheck.md). Highlights still present:
high — HEAD cannot build from a clean checkout until the restored tree is committed (user's step); high —
`RiskCenterPage` hard-codes ENFORCED/LIVE guardrails; high (protected) — no server-side authorization on write
routes in `server.ts`; medium — `SourceBadge` defaults to REAL DATA, unknown market status shown as TRADING,
single top-level error boundary, `Signal` invents percentages, `DataStatusPage` calls any HTTP 200 LIVE,
`AIMarketSummaryCard` fixed bullish narrative; medium (protected) — login rate limit uses one global key.

### Unverified leads

**All items below are UNVERIFIED leads** from the 2026-10-15 Claude audit, which covered 4 of 11 areas
(frontend-shell, frontend-pages, server-api, market-data). Verification and the other 7 areas failed on
the account session limit. Full list (87 leads: 4 critical, 32 high, 32 medium, 19 low):
[audit/2026-10-15-claude-partial.md](audit/2026-10-15-claude-partial.md). The remaining 7 areas are
being audited by OpenCode (see Delegations). Re-read the code before acting on any of these.

Headline leads:

| Sev | Lead | Location | Protected |
|---|---|---|---|
| critical | `a277613` replaced the real market-data service with hard-coded quotes: any symbol returns 28,500 VND, including on the order/risk path; fundamentals hard-coded but labelled OK | `src/services/market/realMarketDataService.ts:31` | yes |
| critical | Committed HEAD cannot build: `src/main.tsx`, `src/lib/utils.ts` and 7 routed pages exist only as untracked files | `src/main.tsx:1` | no (needs a commit decision) |
| critical | `GET /api/macro/radar` builds the production macro regime from test fixtures | `src/services/macro-regime/MacroRegimeService.ts:2` | no |
| high | Paper-trading API replaced by a 2-route stub: order/positions/orders/risk routes 404, order pipeline gone; backtest API always `NOT_CONFIGURED` | `src/lib/trading/api/TradingApiRouter.ts:4`, `BacktestApiRouter.ts:10` | yes |
| high | `marketService` lost 10 methods the UI hooks call (dashboard/market/sector routes broken) | `src/services/market/index.ts:10`, `src/hooks/useMarketQueries.ts:69` | partly |
| high | `POST /api/research/certify` defaults all 8 governance gates to true; `POST /api/replay/run` fabricates a COMPLETED replay | `src/services/research/ResearchApiRouter.ts:15`, `src/services/replay/PaperReplayApiRouter.ts:17` | no |
| high | Daily-price reads return the OLDEST bars as "latest"; EOD ingestion is a no-op that reports COMPLETE and crashes the server when `EOD_INGEST_ENABLED=true` | `src/services/data/DailyPriceService.ts:25,62`, `EodIngestionScheduler.ts:18` | no |
| high | UI shows fabricated data as real: screener universe, header search quotes, `SourceBadge` defaults to REAL DATA, RiskCenter says "Risk Guard ENFORCED" while RiskGuard.ts is deleted, DataStatus calls any HTTP 200 LIVE | several pages | no |
| high | Page crashes: `/recommendations` (`rank`), `/stock/:symbol` (`generateAllHorizons`), `/strategy-lab` + `/backtest` (`HORIZON_LABELS` object), whole shell behind one error boundary | `src/pages/*`, `src/main.tsx:10` | no |
| high | Paper-trading BUY no longer sends stopLoss/targetPrice | `src/pages/PaperTradingPage.tsx:130` (user's dirty file) | no |

## Delegations (OpenCode)

Runner: `.claude/opencode/delegate.ps1`, one task at a time. Its guard ignores only OpenCode processes
that descend from the Kho Báu queue runner (`D:\trithuc\kho_bau_tri_thuc\docs\opencode\run-all.ps1`).

Model: `opencode/nemotron-3.5-lightning-free` (the configured free model, unchanged). Inputs for the
audit tasks: `docs/audit/2026-10-15/inputs/`. Each report is checked by a citation script (every
`path:line` must exist and every quoted line must be in the file near that line) and spot-read by Claude.

| Task | Goal | Status | Run dir / evidence |
|---|---|---|---|
| AUD-TRADING | audit trading-risk-core → `docs/audit/2026-10-15/opencode-trading-risk-core.md` | **PASS** (with notes) | `%TEMP%\opencode-runs\AUD-TRADING-20261015-095905`; 679 s; only the allowed file changed; citations 5/5 OK; Claude re-checked the imports and GONE files. Notes: shallow (5 broken-import findings), severities inflated (`PaperOrderRiskBoundary` is not mounted by any route), wrongly marks `rebalancing-decision` as protected |
| AUD-STRATEGY | audit strategy-portfolio → `docs/audit/2026-10-15/opencode-strategy-portfolio.md` | **PASS** on attempt 3 (with notes) | run 1 + fix 1 + fix 2 FAIL (no report, root cause above); fix 2 brought citations to 8/8; fix 3 `AUD-STRATEGY-fix3-20261015-105145`: report-only reply, `STATUS: PASS`, no file changed, 50 s. Notes: severities inflated (F1-F3 "critical", but `rebalancing-decision` has no outside importer and the server bundle builds); Claude removed two wrong findings (F7, F10) through the fix briefs | run 1 `AUD-STRATEGY-20261015-101454` (705 s) and fix 1 `AUD-STRATEGY-fix1-20261015-102846` (897 s): only the allowed file changed, but the final reply was empty (no section 7 block, model glitch: last step `reason: stop` with no text). Claude review of run 1: F7 wrong (`RiskRewardEngine.ts:59` does round to 100-share lots), F10 not a defect (repo uses `.ts` imports), F9 cited the wrong line. After fix 1: F7/F10 removed, F9 and F1 fixed, but F8 moved to the wrong line; citations 7/8 |
| AUD-REPO | audit repo-health (a277613 damage inventory, tsc root causes) → `docs/audit/2026-10-15/opencode-repo-health.md` | **PASS** on fix 1 (with notes) | run 1 `AUD-REPO-20261015-105324` (341 s) FAIL: **citations 0/20** — invented Evidence (e.g. a RiskGuard import in PaperTradingPage.tsx that does not exist) — and an empty final message. Fix 1 `AUD-REPO-fix1-20261015-110049` (592 s): `STATUS: PASS`, only the allowed file changed, citations 5/5; Claude matched F1, F3-F5 to real tsc errors (`rank`, `trend`, `signalType`, `ceilings`); F2's claim is wrong (line 15 has no tsc error; it is the fabricated search list). Thin: no damage inventory or tsc clustering |
| AUD-DB | audit db-persistence → `docs/audit/2026-10-15/opencode-db-persistence.md` | **FAIL** (stopped; usable as a reference) | fix 2 `AUD-DB-fix2-20261015-112530` BLOCKED: 3 failed edits (whitespace mismatch), then an empty reply, no change. Not retried: the only defect left is the F4 quote. Use the map and F1-F3, F5 (verified quotes); fix 1 `AUD-DB-fix1-20261015-112157` (139 s): real content (186 lines), citations 4/5 (F4 misquotes `src/db/schema.ts` as `src/db.schema.ts`); findings are low value (F1 dotenv-at-import and F3 contiguous migration ids are intended design); run 1 `AUD-DB-20261015-111158` (533 s): self-reported PASS, but the file holds only the 4-line STATUS block — no audit content (false PASS) |
| AUD-ANALYSIS | audit analysis + indicators → `docs/audit/2026-10-15/opencode-analysis.md` | **BLOCKED** (provider error; usable as a reference) | `AUD-ANALYSIS-20261015-112841` (626 s): `[504] Upstream idle timeout exceeded` mid-run; OpenCode recovered, wrote the file and self-reported PASS, but the runner rule makes any provider ERROR = BLOCKED; not retried. Citations 6/10. Claude confirmed F1 (`MoneyFlowEngine.ts:321` sets `volumeRatio = 999` and labels it SURGE when the 20-day average volume is 0) and F2 (`valuation/formulas.ts:71-73` silently defaults growth 10%, terminal 3%, WACC 10.5%); both reached from `server.ts` and the UI. F6/F8 quote the right code but the wrong file (it is `formulas.ts:129`); F4 wrong file; F9 no location. Map section has duplicated headings |
| AUD-ASSETS | audit fundamentals-assets → `docs/audit/2026-10-15/opencode-fundamentals-assets.md` | **PASS** on r2 (with notes) | r2 `AUD-ASSETS-r2-20261015-131138` (631 s): `STATUS: PASS`, only the allowed file changed, no rejected calls, citations 5/6 (F5 has no location). Claude: F1 confirmed (`src/services/etf/EtfIntelligenceService.ts:14-21` hard-codes NAV 24,500 / price 24,550 labelled `CURRENT`) but nothing imports that service; F3 is not a defect (absent corporate-action components legitimately count as 0, negatives still throw); severities inflated. Run 1 BLOCKED: `AUD-ASSETS-20261015-114102` (52 s): the model passed a mistyped path (`D:\Stock\VN-STOWA`) to glob; outside-repo access is `ask`, auto-rejected, which ends the run. 3 of 12 runs today died this way. Proposed fix (needs user approval, protected file): `"external_directory": "deny"` in `opencode.json`, so such calls fail and the run continues |
| AUD-MACRO | audit macro-learning-business → `docs/audit/2026-10-15/opencode-macro-learning-business.md` | **FAIL** (stopped; usable as a reference) | fix 1 `AUD-MACRO-fix1-20261015-133905` (422 s, after waiting for foreign OpenCode probes): STATUS PASS, but the Findings section is malformed (finding bodies lost their headings and sit between table rows). Claude checked all 5: F2 and F4 verified; F5 right in substance but the defect site is `src/services/macro-regime/MacroRegimeService.ts:2` (production service imports `__tests__/macroFixtures.ts`, served at `GET /api/macro/radar`, `server.ts:135`); F1 not a defect (honest NO_DATA placeholder); F3 false (`src/services/newsMacro/NewsMacroListService.ts` exists). Map section usable; run 1 `AUD-MACRO-20261015-132336` (812 s): self-reported PASS, but citations 2/9; 3 Locations are files that do not exist (`src/lib/features.ts`, `src/lib/market/stockUniverse.ts`, `src/lib/portfolio/CapitalAllocationEngine.ts`); one finding duplicates the analysis area |
| FIX-C8 | `/news-macro` fails closed on a 200 response with a null/non-JSON body | **PASS** | `FIX-C8-20261015-172953` (631 s): only the 2 allowed files; diff = `export` + a null/non-object check in `fetchJson` (`!res.ok` branch untouched); tsc 109 = baseline; Claude re-ran `MacroNewsPageFetch.test.ts` + `PhaseFiveViews.test.tsx` 20/20, `npm run build` exit 0, headless `/news-macro` renders with error states, no page error (route QA now 24/24). Minor: the invalid-JSON test checks the message prefix, not the URL |
| FIX-C13 | look-ahead judged against asOfDate, not the wall clock | FAIL, fixing (attempt 1 of 3) | `FIX-C13-20261015-174725` (613 s): diff correct (pure `endOfVnTradingDayIso`, `evaluatedAt` derivation only), tsc 109; the old time-bomb test now passes, but Claude's test run found the new "same-day NOT rejected" test wrong: it injects no derivatives snapshot, and `DerivativesIntelligenceService` prices with LIVE quotes stamped now, so rejection is correct look-ahead. Also the helper split an existing JSDoc from its function |
| FIX-C13 (final) | — | **PASS** on fix 2 | fix 1 `FIX-C13-fix1-20261015-195930` (578 s) corrected the test (injects a same-day derivatives snapshot; new case proves a live derivatives snapshot is rejected) and moved the JSDoc, but again had no report; fix 2 `FIX-C13-fix2-20261015-201634`: report-only, `STATUS: PASS`, no file changed. Claude verified `npx vitest run src/lib/strategy` 13/13 files, 71/71 (the old time-bomb test passes), tsc 109 |
| DOC-MAP | synthesise all area reports into `docs/audit/2026-10-15/PROJECT_MAP_DRAFT.md` | **BLOCKED** (provider) | `DOC-MAP-20261015-134750` (1105 s): three `[504] Upstream idle timeout` stream errors while the model generated the whole draft at once; OpenCode exit 1; no file written. Not retried (BLOCKED = stop and report) |

Note (2026-10-15 09:53): another Claude Code session in VS Code (`claude.exe` PID 16656, not this one)
launched `opencode run --auto` probes of every free model. The guard blocks on those (they are not the
Kho Báu runner), so delegation waits until they exit. A second Kho Báu stream also runs:
`D:\trithuc\kho_bau_luong_b\docs\opencode\run-all.ps1` (ignored by the guard since 10:15).

## Pending user decisions

**Done 2026-10-15:** restore steps 0-13 (table in the Changelog). **Next (user decisions):** the user commits the working tree themselves; the fix-forward defects C3, C4, C8, C10, C13 go to OpenCode one at a time. Open notes: HSTS dropped by the restored security headers; the restored UI calls `bgapidatafeed.vps.com.vn` from the browser; tsc parses `dist/` (consider `"exclude": ["dist"]`, protected file).

**Decided 2026-10-15 by the user:** (1) restore whole subsystems from `a277613~1`, Claude-led, explicit approval
per protected path, verification after each step; (2) Claude writes `PROJECT_MAP.md` (OpenCode DOC-MAP was BLOCKED).
`PROJECT_MAP.md` is done (see Changelog). The read-only restoration plan is being prepared by a Claude subagent.

- ~~**Strategy for the `a277613` damage (decides everything below).**~~ (decided above) The damage is systemic: the real
  market-data provider replaced by hard-coded quotes, trading/backtest APIs stubbed, the risk core deleted,
  62 files reverted to older contracts. Piecemeal fixes by the free model would rebuild by hand what
  `a277613~1` already contains. Options: restore whole subsystems from `a277613~1` (Claude-led, with
  approval per protected path) vs. fix forward task by task.
- **PROJECT_MAP:** DOC-MAP was BLOCKED by provider timeouts. Retry with OpenCode in smaller chunks, or let
  Claude write `.claude/project/PROJECT_MAP.md` from the verified area maps (uses Claude quota).
- **Delegable fixes ready to brief (no protected path):** C2, C3, C6, C7, C8, C10 (and C4 once the user
  decides whether valuation defaults may exist as labelled assumptions).

- Revert `a277613` properly, or keep fixing forward. A revert conflicts with 24 files that later
  commits changed and with 6 dirty/untracked user files (including `src/main.tsx` and `src/pages/DashboardPage.tsx`).
- Fixes in protected paths (AGENTS.md §2) are not delegable and need explicit approval per change.
- Junk files at the repo root (e.g. `how d365ccd…package.json | Select-String…`): delete on approval only.

## Working-tree ownership

User's own uncommitted work (never revert; a brief may touch one only after the user confirms):
`src/lib/rebalancing-decision/__tests__/ConstrainedAllocator.test.ts`, `src/pages/PaperTradingPage.tsx`,
`src/services/scenario/ScenarioApiRouter.ts`, `docs/abcd.md`, the root junk file above,
`src/components/common/__tests__/`, `src/lib/rebalancing-decision/__tests__/{RebalancingDecisionFailClosed,TurnoverCost}.test.ts`,
`src/main.tsx`, `src/pages/DashboardPage.tsx`.

Claude's uncommitted work from 2026-10-15: see the Changelog.

## Changelog

### 2026-10-15
- **Hotfix: Vite "No matching export resolveRouteFromPath" (Claude).** `src/store/useAppStore.ts`:
  restored the URL routing that `a277613` dropped (`PATH_TO_VIEW`, `resolveRouteFromPath`, initial
  route from URL, pushState sync), keeping the newer watchlist and theme code. Restored the deleted
  test `src/store/__tests__/useAppStore.test.ts` byte-exact. Evidence: tsc 550 → 549, no new errors;
  test 11/11.
- **Restored 18 deleted files byte-exact from `a277613~1` (Claude; 17 approved by the user, plus the
  6-line `src/lib/utils.ts` that the build needed):** `src/lib/strategy/**` (8),
  `src/lib/trading/backtest/BacktestTypes.ts` (protected, approved), 6 pages
  (`AIAnalyst`, `Backtest`, `StrategyLab`, `Fundamentals`, `MacroNews`, `Settings`),
  `src/pages/{backtest,fundamentals}/metrics.ts`, `src/lib/utils.ts`.
- **`src/types/recommendation.ts`:** re-added `SIGNAL_LABELS` (from `a277613~1`). Evidence: `npm run build` exit 0.
  tsc 563: 23 old errors fixed, 36 new ones, all in the restored pages (type drift).
- **OpenCode guard (user decision: run alongside the Kho Báu queue):** `.claude/opencode/delegate.ps1`
  now uses `Get-BlockingOpencode`, which ignores processes that descend from the Kho Báu `run-all.ps1`.
  Self-test with simulated processes: a process under the fake runner was ignored, a loose one blocked,
  both blocked with an empty ignore list. `CLAUDE.md` hard rule and preflight step reworded to match.
- **Status tracking (user request):** added `.claude/project/STATUS.md`, `.claude/project/PROJECT_MAP.md`
  and the Stop hook `.claude/hooks/status-guard.mjs`, registered in the new `.claude/settings.json`.
  Pipe-tested: blocks before stamping, silent after `--stamp`, edits to STATUS.md do not change the
  fingerprint. `CLAUDE.md` gained a "Project knowledge (read first)" section pointing here.
- **Claude audit (partial, read-only):** 4/11 areas, 87 unverified leads saved to
  `.claude/project/audit/2026-10-15-claude-partial.md` (+ raw JSON). 7 areas and all verification
  failed on the account session limit (reset 09:50).
- **OpenCode audit set-up (user request: delegate the audit and docs to OpenCode, free model):** copied the
  audit inputs to `docs/audit/2026-10-15/inputs/` (tsc output, a277613 lists, route QA, README); 7 area
  briefs + citation checker saved to `.claude/project/audit/` (`briefs/`, `check-citations.mjs`, `make-briefs.mjs`).
- **AUD-TRADING (OpenCode) = PASS with notes.** Confirmed by Claude (`ls`, `sed`): `src/lib/trading/risk/{RiskGuard,PositionSizer,VietnamLotRule}.ts`
  and `src/lib/trading/validation/TradingDataValidator.ts` are GONE; `PaperBroker.ts` exists;
  `PaperOrderRiskBoundary.ts:5-6` imports the missing RiskGuard/PositionSizer and is referenced only by
  `reachabilityRegistry.ts` (no route mounts it); `TurnoverCostEngine.ts:14` imports the missing VietnamLotRule.
- **Runner/hook fixes (Claude):** guard pattern widened to every `D:\trithuc\kho_bau*\…\docs\opencode\run-all.ps1`
  (second Kho Báu stream, `kho_bau_luong_b`); `delegate.ps1` writes `%TEMP%\opencode-runs\ACTIVE-VN-STOCK.json`
  from the pre to the post snapshot and the Stop hook defers while that PID is alive (tested: live lock → deferred,
  dead PID → block; parse check 0 errors). Citation checker now accepts `**Location:**`.
- **AUD-STRATEGY (OpenCode):** run 1 and fix 1 both FAIL on a missing section 7 report (see Delegations).
  Claude-confirmed leads from it: `src/services/strategy/StrategyIntelligenceService.ts:3` imports the missing
  `StrategyContextAggregator.ts`; `src/lib/rebalancing-decision/{ConstraintEngine.ts:20,ConstrainedAllocator.ts:15}`
  import the missing `./types.ts`; `RecommendationEngine.ts:142` defaults the win rate to 0.5 when the score is
  null; `RecommendationEngine.ts:274-275` uses `new Date()` (determinism rule).
- **Runner fix (Claude):** a Stop hook fired right after launching a run, before the lock existed (race).
  The lock is now written right after the run dir is created, before the slow pre-snapshot
  (`delegate.ps1` lines 273-282 vs. 288; parse check 0 errors). Checker accepts `**Evidence**:` and `123: ` prefixes.
- **Root cause of the missing reports (Claude, from `stdout.jsonl` of all 4 runs):** the free model tries to
  print the section 7 block with `echo`/`cat`/`printf` or by writing `/tmp/final_status.txt`; a *rejected*
  tool call (path outside the repo) ends `opencode run` immediately. All area briefs now say the report is
  plain text in the last message, with no tools. AUD-STRATEGY fix 2 brought the report to 8/8 verified citations.
- **`opencode.json` (protected; user-approved 2026-10-15):** added `"external_directory": "deny"` to `permission`.
  Reason: 3 of 12 runs died when an outside-repo call (`/dev/null`, `/tmp/...`, a mistyped `D:\Stock\VN-STOWA`) was
  auto-rejected. Verified with `opencode.cmd debug agent build`: the last external_directory rules are `deny *` then the
  OpenCode tool-output allow; bash rules unchanged; JSON valid; sha256 `94d5883a...`.
- **`.claude/project/PROJECT_MAP.md` written (Claude subagent, user decision):** 392 lines built from the 4 Claude
  area maps and the 7 OpenCode Map sections, cross-checked against `server.ts`, `src/App.tsx`, `package.json` and
  the a277613 GONE list. Verified: `check-map-paths.mjs` found 532 backticked paths, 0 missing unless marked GONE;
  11 subsystem sections; Claude spot-read the architecture, the route overview (`server.ts` line numbers) and the
  trading/risk section, which corrects OpenCode errors (PaperBroker is a stub; the guard lived under `src/lib/trading/integrity/`).
- **Restoration plan ready (Claude Plan subagent, read-only):** `.claude/project/RESTORE_PLAN.md` — 13 steps in
  dependency order (tooling → types → market data → trading/risk core → … → UI → config), user-owned files never
  overwritten, byte-exact restores checked with `git hash-object`. Claude re-checked with git: package.json identical
  a277613~1↔HEAD; stubs (TradingEngine 20 vs 841 lines, PaperBroker 16 vs 860, TradingApiRouter 16 vs 227,
  MacroIntelligenceService 10 vs 193, ReplayRepository 6 vs 35); user's ScenarioApiRouter import fix and
  PaperTradingPage one-line change; tsconfig `strict` added by a277613. Awaiting the user's approval to start.
- **Restoration (user-approved steps 0-12; plan in RESTORE_PLAN.md). Backup of 148 files + git status in the session
  scratchpad `restore/backup`. Restores are byte-exact (`git hash-object` = `a277613~1` blob, 0 mismatches).**

  | Step | Files | tsc (strict) | Tests | Build | Verdict |
  |---|---|---|---|---|---|
  | 0 backup | 148 backed up | 563 | — | — | done |
  | 1 + 1b tooling, lock | 3 (`vitest.config.ts`, `src/vite-env.d.ts`, `package-lock.json`) | 562 | useAppStore 11/11 | — | PASS (lock root deps = package.json) |
  | 2 types/schemas | 13 | 401 | 10/11 files, 197/198 (the 1 fail needed S3, passes after S3) | — | PASS: new errors only strict null checks (non-strict total 254) or in files of later steps |
  | 3 market data + providers | 35 | 299 | 11/12 files (9 fails needed S6 files, pass after S6) | FAIL until S6 (`MacroRegimeService` from a277613 imported `cached`) | PASS after S6; no `28500` left in `src/services/market` |
  | 6 intelligence services (run before 4: depends only on S3) | 34 | 284 | 17/17 files, 187/187 | PASS | PASS |
| 4 trading/risk core + boundary + routers (protected) | 69 | 334 (+50, all strict null checks in restored tests/harness) | 30/30 files, 570/570 (RiskGuard, PositionSizer, TradingDataValidator, TradingApiRouter, PaperOrderRiskBoundary, replay) | PASS | PASS; `/api/trading` has /order, /cancel, /positions, /orders, /risk-metrics again |
| 5 rebalancing + 7 strategy | 3 + 18 | 345 | 14/19 files, 114/124: 9 fails = the known pre-a277613 rebalancing defects (10-13 audit), 1 = time-bomb test → new C13 | — | PASS (no restoration regression) |
| 8 replay/research + 2 DB repositories | 28 | 345 | 9/9 files, 59/59 | PASS | PASS; certify `?? true` defaults and fabricated COMPLETED replay gone |
| 9 data ingestion (4 `src/scripts` restored, never run) | 21 | 329 | 5/5 files, 99/99 (incl. 2 in-memory PGlite) | PASS | PASS; `EodIngestionScheduler.start()` async again |
| 10 platform/business/middleware | 15 | 329 | 7/9 files, 68/71: the 3 fails are the 2 test files a277613 added for its own contract (`src/middleware/__tests__/{auth,rateLimit}.test.ts`); restored `requireAuth` still returns 401 for missing/empty/invalid tokens (only the JSON body differs) | PASS | PASS; stricter pre-a277613 security headers back, HSTS dropped (decide in step 13+) |
| 11 product services | 7 | 338 (+9 strict-only TS18048 in `LearningPathPage.tsx`) | 1/1 file, 25/25 | PASS | PASS |
| 12 UI pages + store + PaperTradingPage merge | 24 + merge | 322; **non-strict 109** (pre-a277613 baseline 117) | 11/11 files, 167/167 incl. useAppStore 11/11 | PASS | PASS; PaperTradingPage = a277613~1 + the user's one-line class change (diff verified), BUY stopLoss/targetPrice back |
| Route QA (vite preview, external requests blocked) | — | — | **23/24 routes render** (was 16/25); only `/news-macro` crashes (C8, not fixed by the restore) | — | the restored UI calls `bgapidatafeed.vps.com.vn` directly from the browser (286 requests blocked during QA): pre-a277613 architecture, note for the user |
| 13 config (user-approved) | `tsconfig.json` → a277613~1; deleted the 4 files a277613 added (`DemoBadge.tsx`, `PhasePlaceholderPage.tsx`, `src/middleware/__tests__/{auth,rateLimit}.test.ts`; backed up; no importers) | **109** (pre-a277613: 117): 85 = vitest globals in tests, 24 = rebalancing tests (pre-existing) | reachabilityGate + pages + store: 6/7 files, 127/128; the 1 fail is the known stale reachabilityGate test (10-13 memory) | PASS | PASS. tsc now also parses 58 `dist/*.js` files (allowJs, no include; parse only, no errors) |
- **FIX-C8 delegated to OpenCode** (user decision: fix-forward defects go to OpenCode one at a time). Brief
  `.claude/project/fixes/FIX-C8.md`; allowed files `src/pages/MacroNewsPage.tsx` (untracked only because Claude
  restored it byte-exact from a277613~1 today — not user work, hence `-AllowDirty`) and the new
  `src/pages/__tests__/MacroNewsPageFetch.test.ts`.
- **FIX-C8 (OpenCode) = PASS** — see Delegations. **Runner fix (Claude):** `delegate.ps1` now removes the active-run lock
  only right before its final exit (line 454), not after the post snapshot, because the verification phase also
  snapshots the repo; a Stop hook fired during FIX-C8's verification. Parse check 0 errors.
- **Concurrent work noticed (19:54):** an interactive OpenCode session (PID 27616, started 18:02 from Git Bash, not
  launched by Claude) is working in `D:StockVN-STOCK-AI-PROdocs`; it changed `index.html` (script src
  `./src/main.tsx` → `/src/main.tsx`), `docs/abcd.md` and `src/services/scenario/ScenarioApiRouter.ts` (comment
  mojibake fixed). The runner guard blocks Claude's OpenCode tasks until it ends; Claude makes no code edits meanwhile.
- **Post-restore re-check** of 60/87 leads saved to `.claude/project/audit/2026-10-15-post-restore-recheck.{md,json}`.
- **Google AI Studio Preview blank (user request, fixed by Claude).** Root cause reproduced locally: the dev server
  (`npm run dev`, the mode AI Studio runs) sent `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` on every
  response, so any iframe-based preview stays blank while `GET /` returns 200. Evidence: Chromium embedding
  http://localhost:3000/ from another origin logged "Framing 'http://localhost:3000/' violates the following Content
  Security Policy directive: frame-ancestors 'none'" and the frame stayed empty. Fix in `src/middleware/platform/security.ts`:
  new `frameAncestors()` — production and test keep `'none'` + `X-Frame-Options: DENY`; non-production allows
  `'self' https: http://localhost:* http://127.0.0.1:*` and omits X-Frame-Options; `FRAME_ANCESTORS` overrides (values
  that could inject a directive are ignored). New test `src/middleware/platform/__tests__/securityFraming.test.ts`.
  Verified: after restart the app renders inside the cross-origin iframe (#root 1,213 chars, <main> present, title
  correct, no framing violation); production bundle (`NODE_ENV=production node dist/server.cjs --port 3100`) still
  sends DENY + 'none', asset 200, healthz 200, `/api/users/me` without token 401; middleware/platform/auth/e2e/store
  tests 7/7 files, 63/63; tsc 109; build exit 0. Port: dev listens on 0.0.0.0:3000, which matches the AI Studio
  template (first commit `8a5ce61`: `const PORT = 3000`); not changed. Not verified inside AI Studio itself (no
  access from this machine) — the user must reload the Preview.
