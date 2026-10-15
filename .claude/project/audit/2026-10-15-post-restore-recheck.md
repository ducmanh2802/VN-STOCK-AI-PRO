# Post-restore re-check of the pre-restore audit leads (2026-10-15)

Read-only Claude workflow, all 6 batches (87 leads; batches 4-5 added later). Verdicts: {"STILL_PRESENT":25,"FIXED_BY_RESTORE":35}.

## Still present

| Sev | Lead | Files | Protected |
|---|---|---|---|
| high | Committed HEAD cannot build or boot: entry point, cn() util and 7 routed pages exist only as untracked files | `src/main.tsx`, `src/lib/utils.ts`, `vitest.config.ts` … | yes |
| high | RiskCenterPage hardcodes ENFORCED/LIVE/compliant guardrails; limits contradict canonical risk policy | `src/pages/RiskCenterPage.tsx` |  |
| high | No server-side authorization on any write route; requirePermission/requireResource are wired nowhere | `server.ts`, `src/lib/trading/api/TradingApiRouter.ts (only if per-route gating is preferred over the mount-level gate)` | yes |
| medium | SourceBadge fails open to 'REAL DATA'; Footer on every view certifies fixture data as real VPS/KBS data | `src/components/common/SourceBadge.tsx`, `src/components/common/Footer.tsx`, `src/components/dashboard/MarketHeatmap.tsx` … |  |
| medium | Single top-level error boundary: any page crash takes down the whole shell and 'reset' loops back into the crash | `src/App.tsx`, `src/components/ui/ErrorBoundary.tsx` |  |
| medium | Unknown market status is rendered as 'ĐANG GIAO DỊCH' (TRADING) with a live-ticking timestamp | `src/App.tsx`, `src/components/common/Header.tsx`, `src/types/market.ts` … |  |
| medium | Shell drops query errors outside the 3 market views: blank /ai-analyst, empty watchlist, quick view silently does nothing | `src/App.tsx`, `src/components/stock/StockQuickViewModal.tsx` |  |
| medium | Quick view and stock detail share selectedStockSymbol: detail page silently switches stock while URL keeps the old one | `src/store/useAppStore.ts`, `src/App.tsx` |  |
| medium | Signal turns a qualitative confidence label into a fabricated model percentage (high -> 88%) | `src/components/ui/Signal.tsx`, `src/components/dashboard/AIMarketSummaryCard.tsx` |  |
| medium | DataStatusPage calls an HTTP 200 LIVE without proving data availability | `src/pages/DataStatusPage.tsx` |  |
| medium | 'REAL DATA' / 'Đang giao dịch' labels hardcoded on panels regardless of data state | `src/components/common/SourceBadge.tsx`, `src/components/stock/StockHeader.tsx`, `src/pages/StockDetailPage.tsx` … |  |
| medium | AIMarketSummaryCard prints a fixed bullish narrative and a 'Hấp thụ tốt' badge regardless of data, labelled CALCULATED | `src/components/dashboard/AIMarketSummaryCard.tsx`, `src/services/market/RealMarketDataProvider.ts` |  |
| medium | MacroNewsPage crashes on a 200 response with a null or non-JSON body (fetchJson returns null as success) | `src/pages/MacroNewsPage.tsx`, `src/pages/__tests__/MacroNewsPageFetch.test.ts` |  |
| medium | Login/password rate limit uses one global key: 10 bad logins per minute lock every user out; rate limiting also keys on the proxy IP (no trust proxy) | `src/lib/platform/api/AuthApiRouter.ts`, `server.ts` | yes |
| low | ScoreRing renders a missing score as 0 with grade 'D' / 'AVOID' styling | `src/components/ui/ScoreRing.tsx`, `src/pages/StrategyLabPage.tsx` |  |
| low | MARKET_KEYS.watchlist sorts the caller's array in place, mutating zustand state outside set() | `src/hooks/useMarketQueries.ts` |  |
| low | 'recommendations' view is reachable only by typing the URL; nav lists are inconsistent | `src/components/common/Sidebar.tsx`, `src/components/layout/CommandPalette.tsx` |  |
| low | Error boundary shows full stack traces to end users in production | `src/components/ui/ErrorBoundary.tsx` |  |
| low | CommandPalette advertises arrow/enter keyboard navigation that does not exist; backdrop click does not close | `src/components/layout/CommandPalette.tsx` |  |
| low | Metric/MetricCard fabricate a direction for null change and print 'NaN%' | `src/components/ui/Metric.tsx`, `src/components/ui/MetricCard.tsx`, `src/components/stock/StockQuickViewModal.tsx` |  |
| low | Dead branch in useStockChartData | `src/hooks/useMarketQueries.ts` |  |
| low | PaperTradingPage trading gate fails open when the status payload lacks the flags | `src/pages/PaperTradingPage.tsx`, `src/pages/trading/__tests__/TradingHardening.test.tsx` |  |
| low | Undefined Tailwind tokens and an invisible badge after the 55d3ff8 colour migration | `src/components/stock/StockRecommendationsView.tsx`, `src/index.css` |  |
| low | LearningPathPage calls useState after a conditional early return | `src/pages/LearningPathPage.tsx` |  |
| low | ScenarioApiRouter (uncommitted) coerces malformed input instead of failing closed: bad quantity -> 0, unknown kind -> PRICE_SHOCK, bad value -> 0 | `src/services/scenario/ScenarioApiRouter.ts` |  |
| high | computeIndicatorSnapshot substitutes placeholder values when there is not enough history | `src/lib/indicators/snapshot.ts`, `src/lib/indicators/types.ts`, `src/components/stock/StockTechnicalIndicators.tsx` |  |
| low | RSI returns 100 (OVERBOUGHT) for a flat or suspended price series | `src/lib/indicators/rsi.ts`, `src/lib/indicators/__tests__/indicators.test.ts` |  |
| low | Routers leak internal error messages in production, bypassing sendSafeError | `src/services/research/ResearchApiRouter.ts`, `src/lib/macro/api/macroRouter.ts`, `src/lib/trading/api/TradingApiRouter.ts` | yes |
| low | Unvalidated limit query params on inline DB routes (NaN, negative or huge values go to SQL) | `server.ts`, `src/lib/db/StockRepository.ts`, `src/lib/db/SignalRepository.ts` | yes |
| low | d365ccd made non-production ignore process.env.PORT (only --port or NODE_ENV=production honour a port) | `server.ts` | yes |
| medium | Dashboard aggregates and stock search are hard-coded synthetic data, mostly without a demo marker | `src/services/market/RealMarketDataProvider.ts` |  |
