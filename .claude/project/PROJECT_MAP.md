# VN-STOCK-AI-PRO — Project map

Generated 2026-10-15 from the 2026-10-15 audit, HEAD 55d3ff8 + uncommitted restores; structure only — defects live in `.claude/project/STATUS.md`.

## What this is
- A Vietnamese equities research and **paper-trading** terminal (HOSE / HNX / UPCoM): market dashboards, screener, stock detail, multi-horizon recommendations, strategy lab and backtest, fundamentals, macro/news, learning, journal. The goal is real VN trading support: fail-closed data, no synthetic numbers, and every order through Recommendation → TradingDataValidator → RiskGuard → PaperBroker/Ledger → Audit (`AGENTS.md` §4).
- Stack: React 19 + Vite 6 + Tailwind v4 SPA; a zustand store that doubles as the router; TanStack Query v5 hooks; Express 4 API in `server.ts`; Postgres via Drizzle; KBS (daily history) and VPS (quotes, fundamentals) as market providers; Firebase auth on one route.
- One process serves both: dev = `tsx server.ts` (Express with Vite in middleware mode, port 3000); prod = `npm run build` → `dist/` + `dist/server.cjs`, started by `npm start` (`render.yaml`, `Dockerfile`).
- Commit a277613 (2026-10-14) deleted 241 files and reverted 62; much of the tree is now stubs or older versions. Read each Health line before trusting a module.

## How to run and verify

| Command | What it does | Safe for agents? |
|---|---|---|
| `npx tsc --noEmit` (= `npm run typecheck`, `npm run lint`) | Typecheck. Baseline **563** errors (117 on 2026-10-13, before a277613) | Yes. The only command OpenCode may run; success = no new errors vs baseline |
| `npx vitest run <file>` | Run named test files. Config now comes from `vite.config.ts` (node env, no globals, no jsdom) | Orchestrator only; OpenCode may not run tests |
| `npm test` (= `vitest run`, full suite) | Whole suite (not run on 2026-10-15) | Only with the user's approval |
| `npm run build` | `vite build` + esbuild `server.ts` → `dist/server.cjs` | Only with the user's approval (last result: PASS, 2026-10-15) |
| `npm run dev` | `tsx server.ts`: Express + Vite middleware, port 3000 (`--port N` overrides; `DISABLE_HMR=true` turns HMR off) | Orchestrator, when asked to run the app; never OpenCode |
| `npm start` | `NODE_ENV=production node dist/server.cjs`: static `dist/` + SPA fallback, `PORT` from env | Same as dev |
| `npm run preview` | `vite preview` of `dist/`: static only, `/api/*` answers index.html with 200 | UI smoke checks only |
| `npm run clean` | Deletes `dist/` and server.js | Ask first |
| `npm run db:migrate`, `npm run db:migrate:status` | `scripts/db-migrate.ts` applies `drizzle/*.sql` | **No** (database write) |
| `npm run ingest:backfill`, `npm run data:reconcile-daily` | `scripts/backfill-daily-bars.ts`, `scripts/reconcile-daily-prices.ts` (KBS → Postgres) | **No** (database + live API) |
| `npm run verify:backtest:real` | `scripts/verify-real-backtest.ts` against live KBS (imports modules a277613 deleted, GONE) | **No** (live API) |
| `drizzle-kit push` | Diffs the live DB against the schema | **Never** |
| npm install / ci, git writes, deploy | — | Never without the user's explicit approval for that action |

## Architecture at a glance

```
Browser   index.html → src/main.tsx → GlobalErrorBoundary → QueryProvider → src/App.tsx
          App.tsx = Header · Sidebar · CommandPalette · AICopilot · StockQuickViewModal + view switch (22 views)
             │   URL ⇄ zustand src/store/useAppStore.ts (PATH_TO_VIEW, resolveRouteFromPath, pushState/popstate)
             ▼
Hooks     src/hooks/useMarketQueries.ts (TanStack Query)          some pages call fetch('/api/...') directly
             │   └─ marketService  src/services/market/index.ts   ← runs IN THE BROWSER, never reaches /api
             ▼   HTTP /api/*
Server    server.ts (Express 4): bootstrapEnv → express.json → correlationMiddleware → securityHeaders
          → 14 app.use routers + 23 inline handlers → /api JSON 404 guard → Vite (dev) | static dist + SPA (prod)
             ▼
Services  src/services/*  market · data · macro · macro-regime · newsMacro · research · replay · business-api
                          scenario · strategy · alerts · assistant · trading (PaperOrderRiskBoundary, not mounted)
             ▼
Engines   src/lib/*       analysis · indicators · data · decision · portfolio · rebalancing-decision · strategy
                          earnings · corporate-actions · capital-cycle · etf · derivatives · multi-asset
                          macro · macro-regime · newsMacro · learning · business · product · platform · trading (stubs)
             ▼                                              ▼
Storage   Postgres via Drizzle: src/db (pool, schema,     Providers  src/services/market/providers
          migrations) · src/lib/db (repositories) ·                  (KBS history, VPS types, health/matrix stubs)
          drizzle/*.sql (0000–0015)
```

## Route overview
Mount order in `server.ts` (it matters: the 404 guard must stay after every API mount).

| /api prefix (server.ts line) | Router / handler file | Subsystem |
|---|---|---|
| /api/trading (114) | `src/lib/trading/api/TradingApiRouter.ts` — stub, GET status / portfolio, over `src/lib/trading/engine/TradingEngine.ts` + `src/lib/trading/paper/PaperBroker.ts` stubs | Trading & risk |
| /api/macro (117) | `src/lib/macro/api/macroRouter.ts` → `src/lib/macro/MacroService.ts` (status, sources, definitions, indicators[/:code], categories/:category) | Macro |
| /api/backtest (120, rate limit `expensive`) | `src/lib/trading/api/BacktestApiRouter.ts` — stub, GET status, POST run → NOT_CONFIGURED | Trading / analysis |
| /api → news, policy-events, earnings-calendar, macro/observations (129) | `src/lib/newsMacro/api/NewsMacroListRouter.ts` → `src/services/newsMacro/NewsMacroListService.ts` → `src/lib/db/NewsMacroRepository.ts` | Macro / news |
| GET /api/macro/radar (135, inline) | `src/services/macro/MacroIntelligenceService.ts` → `src/services/macro-regime/MacroRegimeService.ts` → `src/lib/macro-regime/MacroRegimeOrchestrator.ts` | Macro |
| /api/canonical-data (159) | `src/services/data/CanonicalDataApiRouter.ts` (ingest/:symbol, bars, quality, cross-source-check, identity) | Market data |
| /api/canonical-data/ingestion (177) | `src/services/data/IngestionStatusApiRouter.ts` — stub status | Market data |
| /api/research (181) | `src/services/research/ResearchApiRouter.ts` → `src/lib/research/AuditEngine.ts`, `src/lib/db/research/ResearchRepository.ts` | Server / research |
| /api/replay (184) | `src/services/replay/PaperReplayApiRouter.ts` → `src/lib/db/replay/ReplayRepository.ts` | Trading / replay |
| /api/billing (188) | `src/services/business-api/BusinessApiRouterComposition.ts` → `src/lib/business/api/businessApiRouter.ts` | Business |
| /api/strategy (192) | `src/services/strategy/StrategyApiRouter.ts` — stub status | Strategy |
| /api/scenario (194) | `src/services/scenario/ScenarioApiRouter.ts` → `src/lib/product/scenario/ScenarioEngine.ts` (GET list, POST evaluate) | Strategy & portfolio |
| /api/alerts (197) | `src/services/alerts/AlertApiRouter.ts` — stub status | Product |
| /api/platform (203) | `src/lib/platform/api/createPlatformRouter.ts` + `src/lib/platform/api/AuthApiRouter.ts` (healthz, readyz, metrics, /auth/*) | Server / platform |
| GET /api/health (230) | inline: `src/lib/platform/observability/health.ts` + cache / provider / in-flight stats | Server |
| GET /api/users/me (311) | inline + `src/middleware/auth.ts` (Firebase `requireAuth`, the only authed route) + `src/db/users.ts` | Server |
| GET /api/stocks, /stocks/search, /stocks/:symbol (325–355) | inline → `src/lib/db/StockRepository.ts` | DB |
| GET /api/stocks/:symbol/daily (370) | `src/services/data/DailyPriceApiRouter.ts` → `src/services/data/DailyPriceService.ts` | Market data |
| GET /api/stocks/:symbol/{intraday, technicals, fundamentals, valuations}, /api/signals (391–466) | inline → Price / Technical / Fundamental / Valuation / Signal repositories in `src/lib/db/` | DB |
| GET /api/stocks/:symbol/{technical, fundamental, valuation, money-flow}-analysis (480–569) | inline: canonicalDailyBarsOr → DailyPriceService + engines from `src/lib/analysis/index.ts` | Analysis |
| GET /api/market-data/{history, quote, fundamentals}/:symbol (647, 691, 726) | inline → `src/services/market/realMarketDataService.ts` (+ `src/services/market/stockHistory.ts`) | Market data |
| GET /api/market-intelligence (714) | inline → `src/services/market/MarketIntelligenceService.ts` | Market data / analysis |
| GET /api/analysis/:symbol (750) | inline → `src/lib/analysis/technical/StockAnalysisEngine.ts` | Analysis |
| GET /api/stocks/:symbol/recommendations (813), /api/recommendations/rankings (917) | inline → `src/lib/analysis/strategy/RecommendationEngine.ts` (generateMultiHorizon / rankUniverse) | Strategy |
| POST /api/ai/chat (1014, rate limit `expensive`) | inline → `src/services/assistant/aiChatService.ts` | Server / assistant |
| any other /api/* (1058) | JSON 404 guard; then Vite middleware (dev) or static `dist/` + `GET *` SPA fallback (prod); error handler at 1118 | Server |

No UI code calls /api/strategy, /alerts, /scenario, /research, /replay, /canonical-data, /billing or /platform.

## UI views
Routing lives in `src/store/useAppStore.ts` (PATH_TO_VIEW; VIEW_TO_PATH is derived) and the view switch in `src/App.tsx`, the only file that imports pages.

| View id | Route | Page file |
|---|---|---|
| dashboard | /, /dashboard, any unknown path | `src/pages/DashboardPage.tsx` (untracked user work) |
| market | /market | `src/pages/MarketPage.tsx` |
| sector-intelligence | /sector-intelligence | `src/pages/SectorIntelligencePage.tsx` |
| screener, stocks | /screener, /stocks | `src/pages/StockScreenerPage.tsx` (both ids) |
| watchlist | /watchlist | `src/pages/WatchlistPage.tsx` |
| stock-detail | /stock/:symbol (only via navigateToStock) | `src/pages/StockDetailPage.tsx` |
| recommendations | /recommendations | `src/pages/RecommendationsPage.tsx` |
| ai-analyst | /ai-analyst | `src/pages/AIAnalystPage.tsx` (untracked; rendered only when aiSummary exists) |
| strategy-lab | /strategy-lab | `src/pages/StrategyLabPage.tsx` (untracked) |
| backtest | /backtest | `src/pages/BacktestPage.tsx` (untracked) + `src/pages/backtest/metrics.ts` |
| fundamentals | /fundamentals | `src/pages/FundamentalsPage.tsx` (untracked) + `src/pages/fundamentals/metrics.ts` |
| news-macro | /news-macro | `src/pages/MacroNewsPage.tsx` (untracked) |
| paper-trading | /paper-trading | `src/pages/PaperTradingPage.tsx` (dirty) |
| portfolio | /portfolio | `src/pages/PortfolioPage.tsx` + `src/pages/portfolio/metrics.ts` |
| risk-center | /risk-center | `src/pages/RiskCenterPage.tsx` |
| data-status | /data-status | `src/pages/DataStatusPage.tsx` |
| learn, learn-path, learn-lesson | /learn, /learn-path, /learn-lesson | `src/pages/LearningDashboardPage.tsx`, `src/pages/LearningPathPage.tsx`, `src/pages/LearningLessonPage.tsx` |
| practice-lab | /practice-lab | `src/pages/PracticeLabPage.tsx` |
| journal | /journal | `src/pages/JournalPage.tsx` |
| settings | /settings | `src/pages/SettingsPage.tsx` (untracked) |

Orphan with no importer: `src/pages/PhasePlaceholderPage.tsx`. Runtime check on 2026-10-15: 16 of 25 routes render (`docs/audit/2026-10-15/inputs/route-qa.md`).

## Subsystems

### 1. Frontend shell
- **Purpose:** boots the SPA, provides global providers and the single error boundary, owns the zustand store that acts as the router, the shared data hooks, the app chrome and the UI primitives.
- **Entry points:** `index.html` (module `./src/main.tsx`) → `src/main.tsx` → `src/App.tsx`; `resolveRouteFromPath` runs at store import time and again on popstate; Ctrl/Cmd+K opens the command palette.

| Path | Role |
|---|---|
| `src/main.tsx` | StrictMode → GlobalErrorBoundary → QueryProvider → App (untracked; re-created with BOM/CRLF) |
| `src/App.tsx` | Shell layout + view switch; calls 10 query hooks; gates loading/error only for dashboard, market, sector-intelligence |
| `src/store/useAppStore.ts` | currentView, selectedStockSymbol (shared by quick view and detail), watchlist (localStorage), theme; route tables (dirty) |
| `src/hooks/useMarketQueries.ts` | All TanStack hooks: marketService calls, /api/market-data, analysis, recommendations, trading; MARKET_KEYS / TRADING_KEYS |
| `src/providers/QueryProvider.tsx` | QueryClient defaults: retry 1, staleTime 30 s, no refetch on focus |
| `src/components/ui/ErrorBoundary.tsx` | ErrorState panel + GlobalErrorBoundary (the only boundary in the app) |
| `src/components/common/Header.tsx`, `src/components/common/Sidebar.tsx`, `src/components/common/Footer.tsx` | Chrome: search + index ribbon, navigation (5 groups, 19 items), disclaimer |
| `src/components/layout/CommandPalette.tsx` | Ctrl+K: 15 navigation commands + stock search |
| `src/components/common/SourceBadge.tsx`, `src/components/common/DemoBadge.tsx` | Provenance badges (SourceBadge defaults to REAL DATA; DemoBadge always DEMO) |
| `src/components/ui/` | Badge, Button, Card, EmptyState, LoadingState, Metric, MetricCard, DataStatusBadge, ScoreRing, Signal; most use `cn()` from `src/lib/utils.ts` (untracked restore) |
| `src/index.css` | Tailwind v4 `@theme` tokens, dense type scale, spacing tokens |
| `vite.config.ts` | react + tailwind plugins, port 3000; also the de-facto vitest config |

- **Wiring:** navigation → setCurrentView → pushPath(VIEW_TO_PATH); navigateToStock → /stock/:SYM. Hook data reaches Header, Dashboard / Market / SectorIntelligence / Watchlist pages and StockQuickViewModal as props. Server routes used: /api/market-intelligence, /api/market-data/*, /api/analysis, /api/stocks/:s/{money-flow-analysis, recommendations}, /api/recommendations/rankings, /api/trading/*.
- **Tests:** `src/store/__tests__/useAppStore.test.ts` (11 routing tests, untracked restore; Claude ran it: 11/11 pass); `src/components/common/__tests__/SourceBadge.test.ts` (untracked). Nothing covers hooks, App, Header, Sidebar or the boundary.
- **Health (2026-10-15):** partially broken. 10 tsc errors, all in `src/hooks/useMarketQueries.ts` (calls marketService methods that no longer exist); the 4 market routes show an error state; routing and back/forward work.
- **Source:** `.claude/project/audit/2026-10-15-claude-areas.json` (frontend-shell), re-checked against `src/App.tsx` and `src/store/useAppStore.ts`.

### 2. Frontend pages and components
- **Purpose:** 23 page components plus their widgets; meant to be fail-closed presentation layers (no order logic, no invented numbers).
- **Entry points:** the App.tsx view switch (see UI views); globally mounted `src/components/ai/AICopilot.tsx` (POST /api/ai/chat) and `src/components/stock/StockQuickViewModal.tsx`.

| Path | Role |
|---|---|
| `src/pages/` | One file per view (table above); `src/pages/portfolio/metrics.ts`, `src/pages/backtest/metrics.ts`, `src/pages/fundamentals/metrics.ts` = fail-closed formatters |
| `src/components/dashboard/` | 15 dashboard widgets (indices ribbon, heatmaps, movers, breadth, sentiment, AI summary) |
| `src/components/stock/` | Stock-detail cards (chart, technicals, valuation, money flow, risk/reward, recommendations view, real fundamentals) |
| `src/components/watchlist/` | Watchlist table / grid / toolbar, AddStockModal |
| `src/components/trading/macro/MacroRadar.tsx` | Macro radar and its siblings in `src/components/trading/macro/` (used by MacroNewsPage) |
| `src/components/learning/LearningWidgets.tsx`, `src/components/charts/EquityCurveChart.tsx` | Learning widgets; backtest equity curve |
| `src/types/market.ts`, `src/types/stock.ts`, `src/types/stockDetail.ts`, `src/types/recommendation.ts` | Contracts pages code against; reverted to older shapes by a277613 (the recommendation types file is also dirty) |
| `src/utils/formatters.ts` | VND / price / percent formatters returning `--` for non-finite input |

- **Wiring:** market views: hooks → browser marketService → `src/services/market/realMarketDataService.ts`. Data views: fetch → server.ts routes. Trading: PaperTradingPage → usePlaceTradingOrder → POST /api/trading/order (route absent today). Recommendations, StockDetail and StrategyLab pages call `src/lib/analysis/strategy/*` directly in the browser.
- **Tests:** 6 component suites in `src/components/dashboard/__tests__/`, `src/components/stock/__tests__/`, `src/components/watchlist/__tests__/` (fixtures carry 13 tsc errors; not run). All 10 page tests are GONE, e.g. `src/pages/__tests__/PhaseFiveViews.test.tsx` (GONE).
- **Health (2026-10-15):** partially broken. 279 of the 563 tsc errors (components 232, pages 47), mostly from reverted type files; 9 of 25 routes broken at runtime, and several "OK" routes are degraded. Only settings, learn, learn-path, learn-lesson and journal work as designed.
- **Source:** `.claude/project/audit/2026-10-15-claude-areas.json` (frontend-pages); `docs/audit/2026-10-15/inputs/route-qa.md`.

### 3. Server / API
- **Purpose:** Express 4 composition root: JSON API under /api plus the SPA (Vite middleware in dev, static `dist/` in prod); middleware for correlation ids, security headers, rate limits and auth.
- **Entry points:** `server.ts` startServer(); line 3 imports `src/db/bootstrapEnv.ts` first (must stay first); build target `dist/server.cjs`.

| Path | Role |
|---|---|
| `server.ts` | Mounts every router, 23 inline routes, the /api 404 guard, SPA fallback, error handler. Except PORT logic, identical to a277613~1 (protected) |
| `src/middleware/platform/security.ts` | correlationMiddleware, securityHeaders, sendSafeError / sendDataError (503 when DB unavailable) |
| `src/middleware/platform/rateLimit.ts` + `src/lib/platform/security/rateLimiter.ts` | In-memory fixed-window limiter; only /api/backtest and /api/ai/chat use it |
| `src/middleware/auth.ts` | Firebase `requireAuth`; only GET /api/users/me |
| `src/middleware/platform/requirePermission.ts` | requirePrincipal / requireResource / requirePermission — no production route uses them |
| `src/lib/platform/api/createPlatformRouter.ts`, `src/lib/platform/api/AuthApiRouter.ts` | /api/platform health + in-memory identity / sessions / audit |
| `src/lib/platform/observability/health.ts` | runHealthCheck; every probe optional, so /api/health answers 200 |
| `src/services/assistant/aiChatService.ts` | POST /api/ai/chat backend (canned text since a277613 removed Gemini) |
| `src/services/research/ResearchApiRouter.ts`, `src/services/replay/PaperReplayApiRouter.ts` | Research and replay lanes (a277613 rewrites) |
| `src/services/business-api/BusinessApiRouterComposition.ts` | /api/billing composition with its own empty IdentityService |
| `src/schemas/stockSchema.ts`, `src/schemas/learningSchema.ts` | Zod schemas, used only by frontend hooks / learning pages |
| `src/lib/firebase-admin.ts` | Admin SDK state for requireAuth |

- **Wiring:** request → express.json → correlation → securityHeaders → router or inline handler → service / repository / engine → JSON; failures via sendDataError or router-local 500. See Route overview for the full mount order and the UI callers.
- **Tests:** `src/middleware/__tests__/auth.test.ts`, `src/middleware/__tests__/rateLimit.test.ts`, `src/db/__tests__/dbFailure.test.ts`, `src/lib/platform/api/__tests__/authApi.test.ts`, `src/lib/platform/authorization/__tests__/authorizationHttp.test.ts`, `src/lib/newsMacro/api/__tests__/NewsMacroListRouter.test.ts` (none run). No test for `server.ts` or any lane router; router tests such as `src/lib/trading/__tests__/TradingApiRouter.test.ts` are GONE.
- **Health (2026-10-15):** partially broken. 42 tsc errors in `server.ts` (history-contract, VPS-fundamentals, ranking and EOD-scheduler clusters). Routers compile only because d365ccd replaced ~20 server-reachable files with stubs; all 45 import targets exist, so the bundle builds.
- **Source:** `.claude/project/audit/2026-10-15-claude-areas.json` (server-api), re-checked against `server.ts` route registrations.

### 4. Market data
- **Purpose:** quotes (intended source VPS), daily OHLCV (KBS), fundamentals (VPS), dashboard aggregates, static symbol universe, TTL cache, provider health, freshness; canonical daily-bar read model and EOD ingestion; pure VN data-foundation helpers in `src/lib/data/`.
- **Entry points:** GET /api/market-data/{history,quote,fundamentals}/:symbol, /api/market-intelligence, /api/stocks/:symbol/daily, /api/canonical-data/*, the EOD scheduler in the listen callback (EOD_INGEST_ENABLED=true); browser `src/services/market/index.ts`; scripts `scripts/backfill-daily-bars.ts`, `scripts/reconcile-daily-prices.ts`.

| Path | Role |
|---|---|
| `src/services/market/realMarketDataService.ts` | Server-side facade (history, quote, fundamentals); a277613 turned it into hard-coded values |
| `src/services/market/index.ts` | Browser marketService: only getIndices, getHeatmap, getTopMovers, getQuote, searchStocks |
| `src/services/market/providers/kbs/KbsHistoricalProvider.ts`, `src/services/market/providers/kbs/types.ts` | KBS daily OHLCV fetch and bar types (protected) |
| `src/services/market/providers/vps/types.ts` | VPS quote / fundamentals types, shrunk to a flat shape (protected) |
| `src/services/market/providers/providerHealth.ts`, `src/services/market/providers/providerMatrix.ts` | Health / fallback stats — stubs (protected) |
| `src/services/market/marketDataCache.ts` | In-memory TTL cache shared by many services; key prefixes feed /api/health |
| `src/services/market/MarketIntelligenceService.ts` | /api/market-intelligence snapshot builder |
| `src/services/market/stockHistory.ts`, `src/services/market/stockDetailService.ts`, `src/services/market/requestCoalescer.ts` | Chart bundle builder; stock detail (hard-coded); in-flight dedup (stub) |
| `src/services/market/stockUniverse.ts` | Static VN universe (60 symbols) used by pages and engines |
| `src/services/market/freshness/dataFreshness.ts` | resolveDataFreshness (CURRENT / STALE / UNAVAILABLE / INVALID) |
| `src/services/data/DailyPriceService.ts`, `src/services/data/DailyPriceApiRouter.ts` | Daily bars from legacy stock_daily (oldest-first); /api/stocks/:symbol/daily |
| `src/services/data/CanonicalDataApiRouter.ts` | /api/canonical-data (persists nothing since a277613) |
| `src/services/data/EodIngestionScheduler.ts`, `src/services/data/DailyBarIngestionJob.ts`, `src/services/data/dailyIngestionRuntime.ts`, `src/services/data/IngestionStatusApiRouter.ts` | EOD ingestion chain — all no-op stubs |
| `src/lib/data/vnPriceLimits.ts`, `src/lib/data/vnTradingCalendar.ts`, `src/lib/data/canonicalBarValidation.ts`, `src/lib/data/index.ts` | HOSE ±7 / HNX ±10 / UPCoM ±15 % bands and ticks; ICT session calendar; bar validation; data-foundation barrel |
| `src/services/market/quoteValidation.ts`, `src/services/market/providers/providerGuard.ts`, `src/services/market/providers/vps/index.ts`, `src/services/market/providers/kbs/index.ts` | GONE — pre-damage validation, retry/circuit breaker, VPS and KBS entry points |

- **Wiring:** server.ts imports realMarketDataService, stockHistory, stockUniverse, cache stats, providerHealth / providerMatrix, requestCoalescer, MarketIntelligenceService and `src/services/data/*`. Intended chain (a277613~1): KBS / VPS provider → providerGuard + providerMatrix → realMarketDataService (MarketDataUnavailableError on failure) → routes with dataStatus; EOD scheduler → ingestion job → canonical_market_bars → DailyPriceService. `src/services/trading/PaperOrderRiskBoundary.ts` defaults to getRealtimeQuote but is not mounted.
- **Tests:** `src/lib/indicators/__tests__/indicators.test.ts` (Claude ran it: 17/17 pass); `src/lib/data/__tests__/Data01.test.ts` … `Data05.test.ts` (not run). All 15+ tests for `src/services/market` and `src/services/data` are GONE.
- **Health (2026-10-15):** broken. Quotes, fundamentals, indices, heatmap, movers, sentiment and breadth are literal constants; the KBS-history routes throw (code reading); ~100 caller tsc errors trace to this layer's contract regressions. `src/lib/data/` and `src/lib/indicators/` are healthy.
- **Source:** `.claude/project/audit/2026-10-15-claude-areas.json` (market-data).

### 5. DB and persistence
- **Purpose:** Postgres schema, committed SQL migrations, migration runner, connection health, and the repository layer used by routes and services.
- **Entry points:** `src/db/index.ts` (eager pg Pool + drizzle `db`), `src/db/bootstrapEnv.ts` (dotenv before the pool; first import of `server.ts` and of every DB script), `src/db/migrations.ts` via `scripts/db-migrate.ts`.

| Path | Role |
|---|---|
| `src/db/index.ts`, `src/db/connectionConfig.ts` | Pool from SQL_* env vars (port / SSL resolution); exposes `db` |
| `src/db/bootstrapEnv.ts` | Must be evaluated before `src/db/index.ts`, otherwise the pool gets undefined credentials |
| `src/db/schema.ts`, `src/db/business/schema.ts` | Drizzle table declarations (44 + 18 `pgTable`s) |
| `src/db/migrations.ts`, `src/db/schemaConsistency.ts` | Runner (contiguous ids, idempotent apply, status) and declared-vs-migrated comparison |
| `drizzle/` | 16 SQL migrations, 0000_phase24_earnings → 0015_market_data_ingestion_runs; `drizzle/0014_core_schema_baseline.sql` is the idempotent core-schema baseline |
| `src/db/dbFailure.ts`, `src/db/databaseHealth.ts`, `src/db/users.ts` | DB-unavailable classifier (deliberately does not import the pool); NOT_CONFIGURED / CONNECTED / UNAVAILABLE; user upsert |
| `src/lib/db/index.ts` | Barrel for Stock, Price, Technical, Fundamental, Valuation, Signal, Watchlist, Portfolio, MoneyFlow repositories (imported by `server.ts`) |
| `src/lib/db/NewsMacroRepository.ts`, `src/lib/db/MacroRepository.ts`, `src/lib/db/EarningsFactsRepository.ts`, `src/lib/db/CapitalCycleRepository.ts` | Domain repositories |
| `src/lib/db/data/CanonicalMarketDataRepository.ts`, `src/lib/db/data/IngestionRunRepository.ts`, `src/lib/db/data/DataFoundationRepository.ts` | Canonical bars / provenance / quality; ingestion-run ledger |
| `src/lib/db/research/ResearchRepository.ts`, `src/lib/db/replay/ReplayRepository.ts`, `src/lib/db/decision/DecisionJournalRepository.ts`, `src/lib/db/business/BusinessRepositories.ts` | Lane repositories (research and replay are d365ccd stubs of 5–6 lines) |
| `drizzle.config.ts` | drizzle-kit config — `drizzle-kit push` is forbidden |

- **Wiring:** `server.ts` → `src/lib/db/index.ts` repositories → `db`; the research router also queries `src/db/schema.ts` tables directly; NewsMacroListService → NewsMacroRepository; DailyPriceService → PriceRepository. Drizzle numeric columns come back as strings.
- **Tests:** `src/db/__tests__/migrations.test.ts` (builds a PGlite DB from `drizzle/*.sql` via `src/db/__tests__/pgliteHarness.ts`), `src/db/__tests__/dbFailure.test.ts`, `src/db/__tests__/databaseHealth.test.ts`, `src/lib/db/__tests__/NewsMacroRepository.test.ts`. Not run in the audit; the PGlite persistence tests under `src/services/data/__tests__/` are GONE.
- **Health (2026-10-15):** 0 tsc errors in `src/db/` and `src/lib/db/`; 16 contiguous migrations on disk. OpenCode's claim that the runner applies them idempotently is unverified (tests not run). Stubbed research / replay repositories persist nothing.
- **Source:** `docs/audit/2026-10-15/opencode-db-persistence.md` (Map), paths re-verified; the InstrumentRepository it lists under src/lib/db does not exist, and the `if (!db) return` guard it describes does not appear in `src/lib/db/`.

### 6. Trading and risk core
- **Purpose:** the paper-order pipeline Recommendation → TradingDataValidator → RiskGuard → PaperBroker / Ledger → Audit, VN lot and band rules, replay and snapshot integrity. Almost all of it was deleted by a277613.
- **Entry points:** /api/trading and /api/backtest (stubs); `src/services/trading/PaperOrderRiskBoundary.ts` (not mounted on any route).

| Path | Role |
|---|---|
| `src/services/trading/PaperOrderRiskBoundary.ts` | Order boundary: simulation check → risk params → quote → RiskGuard → PositionSizer → broker (220 lines; protected) |
| `src/lib/trading/engine/TradingEngine.ts`, `src/lib/trading/paper/PaperBroker.ts` | d365ccd stubs (20 / 16 lines; 841 / 860 before); fixed 100,000,000 VND balance |
| `src/lib/trading/api/TradingApiRouter.ts`, `src/lib/trading/api/BacktestApiRouter.ts` | Route stubs (16 / 15 lines) |
| `src/lib/trading/types/trading.ts`, `src/lib/trading/types/risk.ts`, `src/lib/trading/snapshot/snapshotHash.ts` | Surviving types and snapshot hash |
| `src/lib/trading/backtest/BacktestTypes.ts` | Untracked restore (used by the backtest page) |
| `src/lib/research/AuditEngine.ts` | Certification checks behind /api/research (48 lines, rewritten) |
| `src/lib/trading/risk/RiskGuard.ts` | GONE — policy checks (max 20 % position, 80 % exposure, min R/R 2.0, 100-share lots, 10 % cash buffer) |
| `src/lib/trading/risk/PositionSizer.ts`, `src/lib/trading/risk/RiskManager.ts`, `src/lib/trading/risk/VietnamLotRule.ts` | GONE — sizing, portfolio risk, 100-share board lots |
| `src/lib/trading/validation/TradingDataValidator.ts`, `src/lib/trading/integrity/MarketDataIntegrityGuard.ts` | GONE — OHLCV and quote validation |
| `src/lib/trading/execution/BrokerAdapter.ts`, `src/lib/trading/execution/OrderManager.ts`, `src/lib/trading/paper/PaperTradeLedger.ts`, `src/lib/trading/paper/PaperExecutionEngine.ts` | GONE — broker interface, order pipeline, double-entry ledger |
| `src/lib/trading/replay/ReplayEngine.ts`, `src/lib/trading/replay/FinancialConservationValidator.ts`, `src/lib/trading/snapshot/MarketSnapshot.ts` | GONE — deterministic replay, conservation checks, market snapshot |
| `src/lib/trading/backtest/BacktestEngine.ts`, `src/lib/trading/backtest/BacktestDataProvider.ts` | GONE — still imported by `scripts/verify-real-backtest.ts` |

- **Wiring:** server.ts:113 builds `new TradingEngine({ broker: new PaperBroker() })` for the stub router; PaperTradingPage expects 7 /api/trading routes with a `{success, data}` envelope (2 exist). GONE files are still imported by `src/services/trading/PaperOrderRiskBoundary.ts` (RiskGuard, PositionSizer), `src/lib/rebalancing-decision/TurnoverCostEngine.ts` (VietnamLotRule), `src/lib/analysis/__tests__/QuantPropertyBasedHardening.test.ts` (PositionSizer, deleted replay harness). `src/lib/decision/RiskDecisionEngine.ts` is self-contained and does not import them. `src/lib/platform/observability/reachabilityRegistry.ts` documents the required order.
- **Tests:** none left; the whole `src/lib/trading/__tests__/` directory is GONE (62 GONE files under `src/lib/trading`, tests included).
- **Health (2026-10-15):** broken. 10 tsc errors in `src/services/trading/PaperOrderRiskBoundary.ts` (missing imports) + 10 in `scripts/verify-real-backtest.ts`; no order path runs any risk check. Whole-subsystem restore from a277613~1 needs user approval (protected).
- **Source:** `docs/audit/2026-10-15/opencode-trading-risk-core.md` (Map) + server-api map in `.claude/project/audit/2026-10-15-claude-areas.json`. Corrected: PaperBroker is a stub, not "restored"; the test lives at `src/lib/analysis/__tests__/QuantPropertyBasedHardening.test.ts`; the guard is under `src/lib/trading/integrity/` (GONE).

### 7. Strategy and portfolio
- **Purpose:** horizon-based recommendations and rankings, signal thresholds, strategy registry, scenario what-ifs, decision chain, portfolio allocation and constrained rebalancing.
- **Entry points:** RecommendationEngine.generate / generateMultiHorizon / rankUniverse; SignalEngine; StrategyFactory; ScenarioEngine via /api/scenario; DecisionChainBuilder; RebalancingDecisionBuilder.build.

| Path | Role |
|---|---|
| `src/types/recommendation.ts` | InvestmentHorizon, HORIZON_LABELS (now `{vi, en, holding}` objects), weights, holding days (dirty) |
| `src/lib/analysis/strategy/RecommendationEngine.ts` | Multi-horizon recommendations, targets / stops, rankUniverse |
| `src/lib/analysis/strategy/SignalEngine.ts`, `src/lib/analysis/strategy/StrategyScorer.ts`, `src/lib/analysis/strategy/RiskRewardEngine.ts` | Score → BUY/HOLD/SELL (DEFAULT_THRESHOLDS_BY_HORIZON); 0–100 score; R/R and suggested shares |
| `src/lib/strategy/StrategyFactory.ts`, `src/lib/strategy/UniversalSignalNormalizer.ts`, `src/lib/strategy/types.ts` | Strategy registry + generators in `src/lib/strategy/generators/` (untracked restore) |
| `src/lib/strategy/StrategyContextAggregator.ts` | GONE — still imported by `src/services/strategy/StrategyIntelligenceService.ts` (no importer of its own) |
| `src/services/strategy/StrategyApiRouter.ts`, `src/services/scenario/ScenarioApiRouter.ts` | /api/strategy stub; /api/scenario (user's dirty work) |
| `src/lib/product/scenario/ScenarioEngine.ts` | What-if engine behind /api/scenario |
| `src/lib/decision/DecisionChainBuilder.ts`, `src/lib/decision/RiskDecisionEngine.ts`, `src/lib/decision/PositionIntegrationEngine.ts`, `src/lib/decision/types.ts` | data → validation → risk → size → decision chain (ACCEPTABLE / CAUTION / BLOCKED) |
| `src/lib/portfolio/AllocationEngine.ts`, `src/lib/portfolio/ConcentrationEngine.ts`, `src/lib/portfolio/PortfolioIntelligenceSnapshotBuilder.ts` | Equal-weight / inverse-vol / min-var / Black-Litterman; concentration and HHI; snapshot |
| `src/lib/rebalancing-decision/RebalancingDecisionBuilder.ts`, `src/lib/rebalancing-decision/ConstraintEngine.ts`, `src/lib/rebalancing-decision/ConstrainedAllocator.ts`, `src/lib/rebalancing-decision/TurnoverCostEngine.ts` | Constraint checks, bounded simplex projection, lot-aware turnover cost |
| `src/lib/rebalancing-decision/types.ts` | GONE — imported by the rebalancing engines |

- **Wiring:** server.ts:883 / 991 call generateMultiHorizon / rankUniverse; RecommendationsPage and StockDetailPage call RecommendationEngine in the browser; StrategyLabPage uses StrategyScorer, SignalEngine, StrategyFactory + /api/recommendations/rankings; JournalPage / `src/services/product/JournalService.ts` use `src/lib/decision/types.ts`; ScenarioApiRouter uses `src/lib/portfolio/types.ts`. The decision, portfolio and rebalancing engines have no other production importer. OpenCode's claims that UI calls the strategy / scenario routers, that portfolio services call the rebalancing builder, and that RiskGuard consumes RiskDecisionEngine were not confirmed by grep (`src/services/portfolio/` is empty).
- **Tests:** `src/lib/analysis/strategy/SignalEngine.test.ts`, `src/lib/analysis/strategy/StrategyScorer.test.ts`, `src/lib/analysis/strategy/__tests__/recommendation.test.ts`, `src/lib/portfolio/__tests__/PortfolioEngines.test.ts`, `src/lib/portfolio/__tests__/PortfolioFailClosed.test.ts`, `src/lib/rebalancing-decision/__tests__/` (4 files; 2 are untracked restores, 1 dirty), `src/lib/decision/__tests__/` (Decision01–05). Bare describe/it suites cannot run without the deleted vitest.config.ts (GONE).
- **Health (2026-10-15):** partially broken. ~135 tsc errors: rebalancing-decision 104, analysis/strategy 24, portfolio 6, services/strategy 1. Pages still call the pre-a277613 API (rank, generateAllHorizons) and render HORIZON_LABELS as text.
- **Source:** `docs/audit/2026-10-15/opencode-strategy-portfolio.md` (Map), paths and wiring re-verified by grep.

### 8. Analysis and indicators
- **Purpose:** deterministic engines: technical analysis and scoring, fundamental ratios, valuation (PE / PB / DCF / DDM), money flow, market intelligence (breadth, regime, sectors, relative strength), macro impact, enterprise scoring, capital allocation, backtest and research validation; plus pure TA math.
- **Entry points:** `src/lib/analysis/index.ts` (barrel used by `server.ts`), `src/lib/analysis/technical/StockAnalysisEngine.ts`, `src/lib/analysis/backtest/index.ts`, `src/lib/indicators/index.ts`.

| Path | Role |
|---|---|
| `src/lib/analysis/technical/StockAnalysisEngine.ts`, `src/lib/analysis/technical/TechnicalScoreEngine.ts` | Per-stock analysis (/api/analysis, recommendations) and score breakdown (/technical-analysis) |
| `src/lib/analysis/technical/indicators.ts`, `src/lib/analysis/technical/supportResistance.ts` | ATR / candle validation; swing-level clustering |
| `src/lib/analysis/fundamental/FundamentalScoreEngine.ts`, `src/lib/analysis/fundamental/metrics.ts` | Fundamental score; ROE / ROA / D/E and other ratios |
| `src/lib/analysis/valuation/ValuationEngine.ts`, `src/lib/analysis/valuation/formulas.ts` | Valuation engine and PE / PB / DCF / DDM / historical formulas |
| `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts` | CMF, foreign / institutional flow, volume signals |
| `src/lib/analysis/market/MarketIntelligenceSnapshotBuilder.ts` | Market snapshot used by MarketIntelligenceService (+ Breadth, Regime, RelativeStrength, SectorIntelligence, VolumeFlow engines) |
| `src/lib/analysis/macro/index.ts`, `src/lib/analysis/macro/types.ts` | Macro impact / regime / sensitivity / calendar engines; the macro cards in `src/components/trading/macro/` and MacroNewsPage import only the types |
| `src/lib/analysis/enterprise/EnterpriseScoreEngine.ts` | 100-point composite (+ DuPont, Piotroski, growth, health, profitability engines) |
| `src/lib/analysis/capitalAllocation/CapitalAllocationEngine.ts` | Capital-allocation scoring (StockCapitalAllocation card) |
| `src/lib/analysis/backtest/BacktestEngine.ts`, `src/lib/analysis/backtest/BacktestDataAdapter.ts`, `src/lib/analysis/backtest/LookAheadGuard.ts` | Bar-by-bar backtest, candle validation / normalisation, look-ahead guard |
| `src/lib/analysis/backtest/validation/CrossGeneralizationValidator.ts`, `src/lib/analysis/backtest/validation/SeededRandom.ts` | Research validation (acceptance gate, statistics, generalization); Mulberry32 PRNG |
| `src/lib/indicators/index.ts`, `src/lib/indicators/snapshot.ts` | Pure SMA / EMA / RSI / MACD / Bollinger / volume + indicator snapshot |

- **Wiring:** imported by `server.ts`, `src/services/market/MarketIntelligenceService.ts`, `src/hooks/useMarketQueries.ts`, pages (Market, SectorIntelligence, Recommendations, StockDetail, StrategyLab, MacroNews) and components (MarketIntelligenceWidget, StockMoneyFlow, StockCapitalAllocation, trading/macro). The backtest engine has no live route (BacktestApiRouter is a stub); BacktestDataAdapter reads realMarketDataService history.
- **Tests:** suites under `src/lib/analysis/technical/__tests__/`, `src/lib/analysis/valuation/__tests__/`, `src/lib/analysis/fundamental/__tests__/`, `src/lib/analysis/moneyFlow/__tests__/`, `src/lib/analysis/backtest/__tests__/` (10 files), `src/lib/analysis/market/__tests__/` (8), `src/lib/analysis/enterprise/__tests__/`, `src/lib/analysis/capitalAllocation/__tests__/`; `src/lib/indicators/__tests__/indicators.test.ts` passes 17/17.
- **Health (2026-10-15):** mostly intact. 43 tsc errors outside `src/lib/analysis/strategy/` (enterprise 24, backtest 14, market 3, property-based test 2); `src/lib/indicators/` is tsc-clean and unchanged since a277613~1.
- **Source:** `docs/audit/2026-10-15/opencode-analysis.md` (Map; its dotted paths were translated and verified) + market-data map for `src/lib/indicators/`.

### 9. Fundamentals and assets
- **Purpose:** earnings normalisation (income, balance sheet, cash flow, EPS, margins, quality, restatements), corporate actions (ex-rights price, entitlements), capital cycle and policy graph, ETFs (iNAV, holdings), derivatives (VN30 futures term structure, basis, expiry), multi-asset portfolio aggregation.
- **Entry points:** engine folders in `src/lib/`; one snapshot service each under `src/services/earnings/`, `src/services/corporate-actions/`, `src/services/capital-cycle/`, `src/services/etf/`, `src/services/derivatives/`. The fundamentals UI itself reads /api/market-data/fundamentals (VPS types), not these engines.

| Path | Role |
|---|---|
| `src/lib/earnings/IncomeStatementEngine.ts`, `src/lib/earnings/BalanceSheetEngine.ts`, `src/lib/earnings/CashFlowEngine.ts`, `src/lib/earnings/EpsEngine.ts` | Statement normalisation from canonical facts; FCF; EPS with corporate-action adjustment |
| `src/lib/earnings/EarningsQualityEngine.ts`, `src/lib/earnings/MarginEngine.ts`, `src/lib/earnings/RestatementEngine.ts`, `src/lib/earnings/EarningsSnapshotBuilder.ts` | Quality, margins, restatements, snapshot |
| `src/services/earnings/EarningsIntelligenceService.ts`, `src/services/earnings/EarningsDataProvider.ts` | Earnings snapshot service over the engines |
| `src/lib/corporate-actions/CorporateActionAdjustmentEngine.ts`, `src/lib/corporate-actions/CorporateActionEntitlementEngine.ts`, `src/lib/corporate-actions/VietnamCorporateActionsRegistry.ts` | Ex-reference price / adjustment factors; ratio parsing with FLOOR; registry |
| `src/lib/capital-cycle/CapitalCycleEngine.ts`, `src/services/capital-cycle/PolicyIntelligenceService.ts` | 6-stage cycle classification; policy / project / governance graph service |
| `src/lib/etf/EtfNavEngine.ts`, `src/lib/etf/EtfHoldingsEngine.ts`, `src/lib/etf/VietnamEtfRegistry.ts` | iNAV and premium/discount; holdings concentration; registry |
| `src/lib/derivatives/TermStructureEngine.ts`, `src/lib/derivatives/VietnamDerivativesRegistry.ts`, `src/lib/derivatives/BasisEngine.ts` | Curve shape / regime; contract codes; basis |
| `src/lib/multi-asset/MultiAssetPortfolioEngine.ts`, `src/lib/multi-asset/QuantPlatformIntegrationEngine.ts` | Cross-asset aggregation, leverage, margin; portfolio + signals + limits |
| `src/services/etf/EtfIntelligenceService.ts`, `src/services/corporate-actions/CorporateActionIntelligenceService.ts`, `src/services/derivatives/DerivativesIntelligenceService.ts` | Snapshot services that import the cache (derivatives also its types) but none of the engines |
| `src/pages/FundamentalsPage.tsx`, `src/components/stock/StockRealFundamentals.tsx`, `src/lib/analysis/enterprise/financialFacts.ts` | UI fundamentals path (VPS statements explorer) |

- **Wiring:** none of the five snapshot services has a production importer; only tests and `src/lib/platform/observability/reachabilityRegistry.ts` reference them. Earnings and policy services wrap their engines; ETF, corporate-action and derivatives services do not. OpenCode's route wiring for this area (e.g. /api/strategy → QuantPlatformIntegrationEngine) was not confirmed.
- **Tests:** `src/lib/earnings/__tests__/` (11), `src/lib/corporate-actions/__tests__/` (7), `src/lib/capital-cycle/__tests__/` (10), `src/lib/etf/__tests__/` (6), `src/lib/derivatives/__tests__/` (7), `src/lib/multi-asset/__tests__/` (2); none run. Service tests such as `src/services/etf/__tests__/EtfIntelligenceService.test.ts` are GONE.
- **Health (2026-10-15):** engines largely intact: 7 tsc errors, all in `src/lib/earnings/__tests__/EarningsRemediation.test.ts`, + 1 in `src/services/capital-cycle/PolicyIntelligenceService.ts`. The services are unreachable from server or UI.
- **Source:** `docs/audit/2026-10-15/opencode-fundamentals-assets.md` (Map). Corrected: ETF service is under `src/services/etf/`, QuantPlatformIntegrationEngine under `src/lib/multi-asset/`; there is no earnings barrel.

### 10. Macro, news, learning, product and business
- **Purpose:** macro indicators and regime, news / policy / earnings-calendar lists, the learning catalog and engines, journal / research workspace / scenario / alerts (product), and plans, entitlements, subscriptions and billing (business).
- **Entry points:** /api/macro, /api/macro/radar, /api/news (+ policy-events, earnings-calendar, macro/observations), /api/billing; pages MacroNews, LearningDashboard / LearningPath / LearningLesson, PracticeLab, Journal.

| Path | Role |
|---|---|
| `src/lib/macro/MacroService.ts`, `src/lib/macro/providers/EmptyMacroDataProvider.ts` | Macro service; default provider returns NO_DATA (no mock data) |
| `src/lib/macro/registry/indicatorRegistry.ts`, `src/lib/macro/registry/sourceRegistry.ts`, `src/lib/macro/validation/MacroDataValidator.ts`, `src/lib/macro/freshness/MacroFreshnessPolicy.ts` | Indicator / source registries (US, VN, global; SBV, GSO, FRED…), validation, freshness |
| `src/lib/macro-regime/MacroRegimeOrchestrator.ts` | Regime from inflation, growth, monetary, financial-conditions and external-sector engines in `src/lib/macro-regime/` |
| `src/services/macro/MacroIntelligenceService.ts`, `src/services/macro-regime/MacroRegimeService.ts` | /api/macro/radar; MacroRegimeService feeds it from `src/services/macro-regime/__tests__/macroFixtures.ts` |
| `src/lib/newsMacro/api/NewsMacroListRouter.ts`, `src/services/newsMacro/NewsMacroListService.ts` | Four list routes mounted at bare /api; service is a d365ccd stub |
| `src/lib/learning/catalog.ts`, `src/lib/learning/systemLinks.ts` | Static lessons / exercises / labs (SIMULATED / EDU badges); knowledge-graph links |
| `src/services/learning/LearningService.ts` | Browser-side learning service over mastery, scoring, project and recommendation engines in `src/lib/learning/` |
| `src/lib/product/journal/JournalEngine.ts`, `src/lib/product/journal/JournalStore.ts`, `src/services/product/JournalService.ts` | Investment journal (local); decision snapshots deep-frozen |
| `src/lib/product/research/ResearchWorkspaceEngine.ts`, `src/lib/product/alerts/AlertEngine.ts`, `src/lib/product/assistant/ResearchAssistantFoundation.ts` | Research workspace; alerts; assistant foundation used by aiChatService |
| `src/lib/business/plans.ts`, `src/lib/business/features.ts`, `src/lib/business/entitlementEngine.ts`, `src/lib/business/subscriptionMachine.ts` | Plan ladder, feature registry with reachability, entitlements, subscription state machine |
| `src/lib/business/api/businessApiRouter.ts` | /api/billing routes; billing, community, marketplace, organization sub-folders under `src/lib/business/` |

- **Wiring:** MacroNewsPage → /api/macro/{radar,indicators,status}, /api/market-intelligence and the four list routes; `src/components/trading/macro/MacroRegimeCard.tsx` imports `src/lib/macro-regime/` types. Learning pages → LearningService → `src/lib/learning/`; JournalPage → JournalService + JournalEngine (browser only, no API). /api/billing → BusinessApiRouterComposition (separate in-memory identity). OpenCode's "/api/news-macro" mount and its NewsMacroListService location were wrong.
- **Tests:** `src/lib/macro/__tests__/MacroFoundation.test.ts`, `src/lib/macro-regime/__tests__/` (10), `src/lib/newsMacro/api/__tests__/NewsMacroListRouter.test.ts`, `src/lib/learning/__tests__/` (9), `src/lib/business/__tests__/` + sub-folder suites, one suite per product area (e.g. `src/lib/product/journal/__tests__/journalEngine.test.ts`). Not run. Service tests such as `src/services/macro/__tests__/MacroLegacyRemediation.test.ts` are GONE.
- **Health (2026-10-15):** macro: 22 tsc errors in `src/lib/macro/` (sourceRegistry 12, MacroFoundation test 7, validator 3); /api/macro/radar serves fixture data. Learning, journal and settings work as designed (frontend-pages map); business and product have 1 tsc error each.
- **Source:** `docs/audit/2026-10-15/opencode-macro-learning-business.md` (Map) + server-api map. Corrected: `src/lib/learning/systemLinks.ts` exists; the feature registry is `src/lib/business/features.ts`.

### 11. Repo health
- **Purpose:** inventory of the a277613 damage, build / test infrastructure and repo hygiene.
- **Entry points:** the audit inputs in `docs/audit/2026-10-15/inputs/` and the living status file `.claude/project/STATUS.md`.

| Path | Role |
|---|---|
| `docs/audit/2026-10-15/inputs/a277613-changes.txt` | `git show a277613 --name-status`: 241 D, 62 M, 4 A |
| `docs/audit/2026-10-15/inputs/a277613-deleted-status.txt` | Every file a277613 deleted: 197 still GONE, 44 BACK |
| `docs/audit/2026-10-15/inputs/tsc-current.txt` | Full `npx tsc --noEmit` output (563 errors) |
| `docs/audit/2026-10-15/inputs/route-qa.md` | Runtime check of every UI route (vite preview, no backend) |
| `.claude/project/STATUS.md` | Current numbers, open defects, changelog (guarded by the Stop hook) |
| `package.json`, `bun.lock` | Scripts, Node ≥ 22.12; the only lock file left — package-lock.json is GONE |
| `tsconfig.json`, `vite.config.ts` | Compiler and build config; vitest.config.ts is GONE (deleted by a277613) |
| `render.yaml`, `Dockerfile` | Deploy: render runs `npm ci && npm run build` then `npm start` (npm ci expects package-lock.json, which is GONE); Docker CMD `node dist/server.cjs`, HEALTHCHECK on /api/health |

- **Wiring:** tsc errors by area (tsc-current.txt): components 232, rebalancing-decision 104, lib/analysis 67, pages 47, `server.ts` 42, lib/macro 22, scripts 11, hooks 10, services/trading 10, earnings 7, portfolio 6, other 5. GONE files by area: `src/lib/trading` 62, `src/services/market` 21, `src/lib/strategy` 14, pages 12, `src/services/data` 10, `src/lib/research` 10, `src/lib/replay` 10.
- **Tests:** only two suites were executed on 2026-10-15 (routing 11/11, indicators 17/17). The full suite was not run (needs the user's approval).
- **Health (2026-10-15):** tsc 563 (117 on 2026-10-13); `npm run build` PASS — but only with the untracked restored files; 16 / 25 routes render. Root junk: an untracked file whose name is a mangled PowerShell command ("how d365ccd:package.json | Select-String …"), plus stray logs (vite.log, vite.err.log, .tmp-srv.log). OpenCode's junk list (task_on_progress.md, ssi_probe_raw.txt, vite-env.d.ts) is already GONE.
- **Source:** `docs/audit/2026-10-15/opencode-repo-health.md` (Map; the routes.tsx it mentions does not exist and its claims about what `src/main.tsx` imports were wrong), the audit inputs and `.claude/project/STATUS.md`.

## Protected paths (AGENTS.md §2)
Changes need the user's explicit approval and are made by the orchestrator, never by OpenCode (`opencode.json` denies edits):
- `src/lib/trading/**`, `src/services/trading/**`, `src/services/market/providers/**`
- `src/db/**`, `drizzle/**`, `drizzle.config.ts`, `scripts/**`
- `package.json`, lock files (`bun.lock`; package-lock.json is GONE), tsconfig*.json, `vite.config.ts`, vitest.config.ts (GONE), `server.ts`, `Dockerfile`, `render.yaml`, firebase config (`firebase-applet-config.example.json`)
- `AGENTS.md`, `CLAUDE.md`, `opencode.json`, .opencode/ (not present), `.clinerules/`, `.claude/`, `.agents/`, .git*, `.vscode/`

Also off-limits for agents: `.env*` (never read or print), `npm run db:*` / `ingest:*` / `data:*`, `drizzle-kit push`, git writes, installs.

## Cross-cutting gotchas
- **a277613 history.** 2026-10-14 "chore: update dependencies and refactor codebase" deleted 241 files and reverted 62 to older versions; 197 deleted files are still GONE, including `src/lib/trading/risk/RiskGuard.ts`, `src/lib/trading/risk/PositionSizer.ts`, `src/lib/trading/risk/VietnamLotRule.ts` and `src/lib/trading/validation/TradingDataValidator.ts` (all GONE). d365ccd then re-added ~20 server-reachable files as **compiling stubs**: compiling is not working. Compare with `git show a277613~1:<path>` (line counts) before trusting a file.
- **Restore policy (user decision, 2026-10-15):** restore whole subsystems from a277613~1 as coupled sets, not file by file. Example: the pre-damage `src/services/market/realMarketDataService.ts` needs `src/services/market/providers/kbs/index.ts`, `src/services/market/providers/vps/index.ts`, `src/services/market/providers/providerGuard.ts`, `src/services/market/quoteValidation.ts` and `src/types/provider.ts` (all GONE), and `src/services/data/CanonicalDataApiRouter.ts` + `src/services/market/index.ts` were rewritten against the mock signature. Protected files in a set still need approval.
- **Fix callees, not callers.** `server.ts` market-data code and the UI components were not changed by a277613; the type, service and engine files were. Restore those rather than adapting ~25 components or `server.ts`. Do not alias getMarketIndices → getIndices (it would show hard-coded VN-INDEX values as live), and ignore tsc's "Did you mean generateMultiHorizon?" hint.
- **Untracked files the build depends on.** `src/main.tsx`, `src/lib/utils.ts` and 7 pages (`src/pages/AIAnalystPage.tsx`, `src/pages/BacktestPage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/FundamentalsPage.tsx`, `src/pages/MacroNewsPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/StrategyLabPage.tsx`), plus `src/pages/backtest/metrics.ts`, `src/pages/fundamentals/metrics.ts`, `src/lib/strategy/` and `src/lib/trading/backtest/BacktestTypes.ts`, exist only in the working tree. A clean checkout of HEAD 55d3ff8 cannot build. `src/pages/DashboardPage.tsx` is user work that differs from a277613~1 and `src/pages/PaperTradingPage.tsx` is dirty: confirm ownership before overwriting either.
- **Historical claims.** `docs/`, `.ai/CURRENT.md`, `phase-status.md`, `ARCHITECTURE_AUDIT.md` and `src/lib/platform/observability/reachabilityRegistry.ts` describe routes and chains that no longer exist; their PASS numbers are not evidence, and they never define the next phase. The OpenCode audit maps in `docs/audit/2026-10-15/` contained wrong paths (corrected in this map).
- **Runtime traps.** One error boundary for the whole app (`src/main.tsx`), so a page throw replaces the shell. The browser marketService never calls /api. SourceBadge defaults to REAL DATA: always pass a variant. Express 4 does not catch rejected async handlers: every async route needs its own try/catch. Keep the /api 404 guard after every API mount. Restoring pre-a277613 routers re-opens anonymous DB-write routes (they had no auth): gate them.
- **Tests infrastructure.** vitest.config.ts is GONE, so vitest reads `vite.config.ts` (no `test` block): node environment, no globals, no jsdom. Suites using bare describe/it fail; the store test fakes `window` before a dynamic import.
- **Env and DB.** `src/db/bootstrapEnv.ts` must be the first import of `server.ts` and of every DB script; `src/db/index.ts` builds the pool eagerly. Never read `.env*`.
- **Windows / PowerShell.** Windows 10; the PowerShell tool is 5.1 (no `&&`/`||`: use `A; if ($?) { B }`), Git Bash is also available. Write files as UTF-8 explicitly (`Out-File` / `Set-Content -Encoding utf8`): `src/main.tsx` was re-created with BOM + CRLF, and the Vietnamese comments in `src/services/scenario/ScenarioApiRouter.ts` are mojibake (UTF-8 read as cp1252). A mangled PowerShell pipeline already left a junk file at the repo root. Node ≥ 22.12.
- **OpenCode orchestration.** Claude Code orchestrates; OpenCode implements one scoped task at a time, only through `.claude/opencode/delegate.ps1` (brief from `.claude/opencode/brief-template.md`, `-DryRun` first, never `--auto`, never two runs at once, no edits while `Get-Process opencode*` returns anything). Run evidence lands in `%TEMP%\opencode-runs\<ID>-<time>`; exit 0 = in scope (review the diff yourself), 1 = FAIL, 2 = BLOCKED. OpenCode never commits; dirty ALLOWED files need the user's ownership confirmation (`-AllowDirty`).
- **STATUS stop hook.** `.claude/settings.json` registers `.claude/hooks/status-guard.mjs` as a Stop hook. It fingerprints HEAD plus every dirty / untracked path (size + mtime, excluding `.claude/project/`) and blocks the end of a turn until `.claude/project/STATUS.md` is updated and re-stamped with `node .claude/hooks/status-guard.mjs --stamp`.