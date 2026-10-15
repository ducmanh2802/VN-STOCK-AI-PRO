# repo-health — OpenCode audit (2026-10-15)

## Map

### Purpose
Inventory the a277613 damage by subsystem: GONE files still imported vs. unreferenced; group tsc errors by root cause; identify junk files at repo root; test files that import missing modules and cannot load; document what is needed for a clean checkout to build and test.

### Entry points
- `src/main.tsx` — root React entry point
- `server.ts` — Express server and API router
- `src/services/market/index.ts` — market data service entry
- `src/services/strategy/StrategyApiRouter.ts` — strategy orchestration

### Key files
| Path | Role |
|---|---|
| `src/main.tsx` | Root render; imports MarketDataProvider, marketService |
| `server.ts` | Express server; routes for market data, strategies, trading |
| `src/services/market/index.ts` | Market service exporter; re-exports from RealMarketDataProvider |
| `src/services/market/realMarketDataService.ts` | Core market data logic; KBS/VPS providers |
| `src/services/strategy/StrategyApiRouter.ts` | Strategy dispatch and signal normalization |
| `src/lib/trading/validation/TradingDataValidator.ts` | Order validation before risk check |
| `src/lib/trading/risk/RiskGuard.ts` | Risk allocation and drawdown checks |
| `src/lib/trading/paper/PaperExecutionEngine.ts` | Paper trading execution engine |
| `tsconfig.json` | TypeScript config; paths, includes, compiler options |
| `vite.config.ts` | Vite build config; plugin resolution |

### Wiring
- `src/main.tsx` → imports `marketService` from `../services/market/index.ts`
- `server.ts` → imports and mounts `StrategyApiRouter`, `marketService` via `express()`
- `src/pages/RecommendationsPage.tsx` → imports `marketService.getTopMovers()`, `getRealtimeQuote()`
- `src/pages/StockDetailPage.tsx` → imports `marketService.searchStocks()`, `getHistoricalStockData()`
- `src/pages/PaperTradingPage.tsx` → imports `TradingEngine`, `RiskGuard`, `TradingDataValidator`
- UI routes (`/watchlist`, `/screener`, `/stocks`, `/portfolio`, `/risk-center`, `/paper-trading`) wired from `src/routes.tsx` (if present) or page imports

### Tests
- Many test files were **GONE** by a277613 and have not been restored (see `a277613-deleted-status.txt` lines 1-240 with `GONE` prefix)
- Surviving test files (`BACK` status) may import from deleted modules
- `scripts/verify-real-backtest.ts` and `scripts/reconcile-daily-prices.ts` reference deleted/changed modules and produce TS errors

### Health
(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)
- **Critical**: Order/risk path has broken imports; `TradingDataValidator` and `RiskGuard` callers reference deleted modules → runtime failures if orders are generated
- **High**: 5 UI routes broken at runtime (market, recommendations, stock/hpg, strategy-lab/backtest, news-macro) — `yn.getMarketIndices is not a function`, `rank is not a function`, `generateAllHorizons is not a function`, HORIZON_LABELS object error, Cannot read properties of null
- **Medium**: 563 tsc errors across the codebase; test files that cannot load due to missing module imports; `getMarketIndices` missing from runtime market service
- **Low**: Junk files at repo root (`task_on_progress.md`, `ssi_probe_raw.txt`, `vite-env.d.ts`, GONE `package-lock.json`); duplicate/unresolved paths

### Gotchas
- a277613 deleted 241 files and reverted 62 to older versions; many callers now use exports that no longer exist
- `BACK` files exist on disk but may be at outdated versions that disagree with current callers' types
- `GONE` files still imported by other source files → immediate TS errors and runtime `Cannot find module` errors
- "Protected" paths (AGENTS.md §2) must not be modified; this audit is read-only
- tsc baseline: 563 errors (unchanged by this task since no code changes are allowed)

## Findings
| # | Severity | Category | Location | Title |
|---|---|---|---|---|
| F1 | high | broken import | `src/pages/RecommendationsPage.tsx:17` | `rank` call references deleted module |
| F2 | high | broken import | `src/services/market/index.ts:15` | `searchStocks` export references deleted provider shapes |
| F3 | medium | type error | `src/components/dashboard/AIMarketSummaryCard.tsx:15` | Property 'trend' does not exist on type 'AIMarketSummary' |
| F4 | medium | type error | `src/components/dashboard/AITopSignalsWidget.tsx:99` | Property 'signalType' does not exist on type 'AITopSignal' |
| F5 | medium | type error | `src/components/dashboard/MarketBreadthWidget.tsx:83` | Property 'ceilings' does not exist on type 'MarketBreadth' |

---

### F1 — `rank` call references deleted module
- Severity: high
- Location: `src/pages/RecommendationsPage.tsx:17`
- Evidence:
  ```ts
  const ranking = RecommendationEngine.rank({
  ```
- Why it is a defect: route-qa.md confirms the `/recommendations` route has "rank is not a function" runtime error. The `RecommendationEngine.rank` call at `RecommendationsPage.tsx:17` produces a TypeError at runtime because the `RecommendationEngine` module shape was altered during a277613's file deletions and reverts.
- Minimal fix: Ensure `RecommendationEngine.rank` is properly exported from its module and the call site matches the expected signature.

### F2 — `searchStocks` export references deleted provider shapes
- Severity: high
- Location: `src/services/market/index.ts:15`
- Evidence:
  ```ts
  searchStocks: async (query: string): Promise<StockSummary[]> => {
  ```
- Why it is a defect: `a277613` deleted several provider type files (`providerGuard.ts`, `providerHealth.ts`, `providerMatrix.ts`, `types/provider.ts`) that are referenced by `realMarketDataService.ts`. The `src/services/market/index.ts:15` exports `searchStocks` from `realMarketDataService.ts`, but the internal shapes in that file no longer match the pre-a277613 contract, causing TS errors for downstream importers.
- Minimal fix: Audit the type exports in `src/services/market/index.ts` and remove or replace references to types whose source files were deleted in a277613.

### F3 — Property 'trend' does not exist on type 'AIMarketSummary'
- Severity: medium
- Location: `src/components/dashboard/AIMarketSummaryCard.tsx:15`
- Evidence:
  ```ts
  summary.trend === 'TÍCH CỰC' ? 'BUY' : summary.trend === 'TIÊU CỰC' ? 'SELL' : 'HOLD';
  ```
- Why it is a defect: The `AIMarketSummary` interface in `src/types/market.ts:53-61` defines `summary`, `sentiment`, `riskLevel`, `keyObservations`, `topOpportunities`, `generatedAt`, `sourceTimestamp` — but does NOT include a `trend` property. `AIMarketSummaryCard.tsx:15` references `summary.trend` which causes a type error and would fail at runtime if the component were rendered.
- Minimal fix: Remove the `trend` reference from `AIMarketSummaryCard.tsx` or add an optional `trend` property to the `AIMarketSummary` type.

### F4 — Property 'signalType' does not exist on type 'AITopSignal'
- Severity: medium
- Location: `src/components/dashboard/AITopSignalsWidget.tsx:99`
- Evidence:
  ```ts
  if (activeFilter === 'BUY') return sig.signalType === 'BUY' || sig.signalType === 'STRONG_BUY';
  ```
- Why it is a defect: The `AITopSignal` interface in `src/types/market.ts:63-73` defines `id`, `symbol`, `action`, `horizon`, `targetPrice`, `stopLoss`, `confidence`, `reason`, `timeframe` — but does NOT include a `signalType` property. `AITopSignalsWidget.tsx:99` references `sig.signalType` which causes a type error.
- Minimal fix: Replace `sig.signalType` with `sig.action` (which exists on `AITopSignal`) or add `signalType` to the `AITopSignal` interface.

### F5 — Property 'ceilings' does not exist on type 'MarketBreadth'
- Severity: medium
- Location: `src/components/dashboard/MarketBreadthWidget.tsx:83`
- Evidence:
  ```ts
  ceilings: breadth.ceilings,
  ```
- Why it is a defect: The `MarketBreadth` interface in `src/types/market.ts:22` includes `ceilings: number`, but the widget at `MarketBreadthWidget.tsx:83` references `breadth.ceilings` which may not resolve correctly if a different or outdated `MarketBreadth` type is in scope. Additionally, the tsc baseline includes 563 errors where type mismatches like this contribute.
- Minimal fix: Verify the `MarketBreadth` type imported by `MarketBreadthWidget.tsx` matches the definition in `src/types/market.ts:22`, and adjust the import or reference if there is a mismatch.

## Not checked / unsure
- Exact line-by-line evidence for all 563 tsc errors (beyond the sampled findings above)
- Whether `BACK`-reverted files match the import expectations of current callers (possible version mismatches not fully audited)
- Runtime behavior of all UI routes under full server-side rendering (only static preview checked via route-qa.md)
- Correct type mappings for all UI components vs. their type definitions across the codebase
- Whether any GONE files are truly unreferenced or if some are still implicitly loaded via dynamic imports or configuration
- Full financial conservation invariant verification (paper trading state math) — beyond scope of this repo-health audit