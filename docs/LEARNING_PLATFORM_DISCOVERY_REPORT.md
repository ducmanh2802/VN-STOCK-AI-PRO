# LEARNING PLATFORM — DISCOVERY REPORT (LEARNING-01)
Status: COMPLETE | Date: 2026-10-04 | Scope: VN-STOCK-AI-PRO full repo audit

## 1. Executive summary
- VN-STOCK-AI-PRO is a production-hardened Vietnamese market intelligence + paper-trading platform. 24/24 phases CERTIFIED (Phase 17 → 23 + PR-01A..E), ~139 test files, fail-closed deterministic architecture.
- No learning/education/help content exists (grep: zero Learn/Lesson/Course files, no learn route in App.tsx/Sidebar).
- Learning Hub belongs as an isolated extension: `src/lib/learning/` (pure engines) + `src/services/learning/` (orchestration) + `src/pages/Learning*` + `src/components/learning/` + future `drizzle/0003_learning` tables + future read-only `/api/learning/*`. Must never touch trading/risk execution.

## 2. Architecture found
- Client: React 19 + Vite 6 + Tailwind v4 + zustand `useAppStore` (string `currentView` router) + TanStack Query `useMarketQueries.ts` + `Header/Sidebar/Footer/CommandPalette/AICopilot`.
- Pages (14): Dashboard, Market, SectorIntelligence, StockScreener (active) / Stocks (dead), StockDetail (7 tabs), Watchlist, Portfolio (presentation-only over /api/trading), RiskCenter (server-authoritative), PaperTrading (510 lines), Recommendations (SHORT/MEDIUM/LONG), AIAnalyst, DataStatus, PhasePlaceholder (strategy-lab/backtest/fundamentals/news-macro/journal/settings).
- Backend: Express `server.ts` (845 lines, 29 routes). Market: stocks/search/daily/intraday/technicals/fundamentals/valuations/technical-analysis/fundamental-analysis/valuation-analysis/money-flow-analysis/market-data/history|quote|fundamentals/market-intelligence/analysis/recommendations/rankings + AI chat (Gemini 2.5 Flash proxy) + trading (PaperBroker process-local) + macro router.
- DB: Drizzle PG 28 tables (`users, stocks, stock_daily, stock_intraday, technical_indicators, financial_statements, financial_ratios, valuation_results, money_flows, foreign_trading, news, watchlists, watchlist_items, portfolios, portfolio_positions, portfolio_transactions, signals, analysis_results, ai_analysis, alerts, financial_facts_v2, earnings_calendar, policy_events, strategic_projects, project_beneficiaries, legal_governance_events, macro_observations, macro_regime_snapshots`). Migrations: 0000_phase24, 0001_phase26, 0002_phase27.
- Auth: Firebase client + firebase-admin `requireAuth` → only `GET /api/users/me` gated; trading/market currently paper-public.
- Zod: `src/schemas/stockSchema.ts` (+ freshness/integrity tests).
- Governance: `.clinerules/00-05` — deterministic, no Math.random/Date.now in engines, LookAheadGuard [0..T], T→T+1 execution, 100-lot, 20% single-stock / 10% cash / 15% DD freeze, conservation laws, anti-mock (no MOCK_STOCKS/random-walk/fake EPS), provenance required.

## 3. Capability inventory (learning-sourceable, all verified in code)
| System capability | Code location | Teachable concepts |
|---|---|---|
| Market data (KBS history + VPS quote/fundamentals, TTL cache, freshness CURRENT/STALE/UNAVAILABLE) | `services/market/*`, `providers/kbs|vps`, `marketDataCache` | price/volume/liquidity, HOSE/HNX/UPCOM, VN-Index/VN30, freshness/provenance, DATA_UNAVAILABLE fail-closed |
| Watchlist/Screener (filter PE/ROE/RSI/MA/AI-score/breakout/vol-spike) | `pages/StockScreenerPage`, `store/useAppStore` | screening, liquidity, momentum filters |
| Technical intelligence (SMA/EMA/RSI/MACD/BB/ATR/support-resistance/risk) | `lib/indicators/*`, `lib/analysis/technical/*` | trends, momentum, volatility, S/R, stop/target |
| Fundamental + Enterprise 10-engine (BQ/Growth/Profit/Health/EQ/DuPont/Piotroski/Val/Comp/Risk/Market + score + thesis) | `lib/analysis/fundamental`, `lib/analysis/enterprise/*` | revenue/profit/EPS/margins/ROE/ROA/D-E/cash-flow/TTM/YoY/QoQ/restatement, DuPont, F-score |
| Valuation (PE/PB/DCF/Dividend/Historical + rating; FACT/ASSUMPTION/ESTIMATE/MODEL OUTPUT split) | `lib/analysis/valuation/*` | P/E, P/B, DCF, FCF, fair value, margin of safety, sensitivity |
| MoneyFlow (candle+foreign+institutional) | `lib/analysis/moneyFlow` | accumulation/distribution, foreign flow |
| Strategy/Recommendation (Signal→Scorer 0-100→SHORT/MEDIUM/LONG→RiskReward; 5 StrategyFactory generators) | `lib/analysis/strategy`, `lib/strategy/*` | signal/entry/exit, backtest costs 0.15%+tax+slip, Sharpe/Sortino/DD/win-rate, overfitting/lookahead |
| Backtest + Quant Governance (LookAheadGuard, TradeSimulator, walk-forward/OOS/Monte-Carlo/bootstrap/acceptance-gate/generalization) | `lib/analysis/backtest/*` | backtesting, transaction costs, regime, estimation error |
| Market Intelligence (breadth/regime/sector/RS/volume-flow/snapshot) | `lib/analysis/market/*` | breadth, regime, sector rotation, RS, liquidity, correlation |
| Macro + Macro-Regime (liquidity/rates/FX/commodity/global + growth×inflation quadrant + cutoff pubDate<=asOf) | `lib/macro/*`, `lib/macro-regime/*`, `lib/analysis/macro/*` | inflation/rates/GDP/DXY/gold/oil/risk-on-off, policy transmission |
| Earnings & Documents (19.6 pipeline discover→parse→reconcile + 24 engines + facts v2 + calendar) | `services/financialDocuments/*`, `lib/earnings/*` | TTM, restatement, lineage, data quality |
| Derivatives (basis/OI/term-structure/expiry/contract-resolver/registry) | `lib/derivatives/*` | VN30F basis, contango/backwardation, OI |
| ETF (NAV/iNAV/premium/holdings/tracking/performance/registry) | `lib/etf/*` | NAV, premium/discount, tracking error, concentration |
| Corporate actions (adjustment P_ex/K_t, T+2/GDKHQ calendar, entitlement A:B, registry VSDC>HOSE>HNX) | `lib/corporate-actions/*` | splits/dividends/rights, ex-date, adjustment |
| Capital-cycle/Policy (cycle 6-stage, policy/project/beneficiary-tier/backlog/governance-L4-block/evidence-graph/shock) | `lib/capital-cycle/*` | policy transmission, backlog, governance risk |
| Paper trading (Validator→RiskGuard→RiskManager→PositionSizer→PaperBroker→Ledger→Reconciliation→Replay→Conservation) | `lib/trading/*` | position sizing, 100-lot, no-short, diversification, VaR (null w/o telemetry), drawdown, stop-loss, R:R, FOL, T+2.5, price bands ±7/10/15% |
| Risk & integrity (RiskGuard 18.1, IntegrityGuard OHLC/freshness/bands, Validator, Conservation, snapshot hash) | `lib/trading/risk|integrity|validation|snapshot|replay` | concentration, exposure, stale/invalid data, fail-closed, survivorship/lookahead bias |
| AI Analyst (server-side Gemini proxy, advisory-only, thesis/scenarios Bull/Base/Bear) | `POST /api/ai/chat`, `components/ai/AICopilot` | AI grounding, SYSTEM FACT vs EXPLANATION vs ASSUMPTION vs SIMULATION |

## 4. Capability → concept → lesson map (excerpt; full in ROADMAP)
- Covariance→Correlation→Diversification→Covariance-free MVP (conceptual) → Portfolio page + RiskCenter → Practice (SIMULATED 4-ticker ACB/FPT/HPG/VCB).
- Earnings→Revenue/EPS/Margin→TTM→Restatement→Lineage→Earnings Intelligence→StockDetail fundamentals tab→TTM exercise + debugging (wrong TTM).
- Risk: PositionSizer math → RiskGuard caps → RiskCenter exposure → sizing calculation + debugging (stale data, lookahead).
- Strategy: Signal→Backtest (T+1, costs)→Validation→Recommendation horizons→Recommendations page → interpretation + defend.
- Macro: Growth×Inflation→Regime→Sector sensitivity→MacroRadar → decision (what to investigate next, no buy/sell force).
- System/Quant-eng: providers/fallback/freshness/DI/caching/provenance/as-of/lookahead/conservation/testing/certification → DataStatus page.

## 5. User/auth/DB audit
- Firebase Auth + `users(uid,email,role)` via `getOrCreateUser`; roles future (OWNER/ADMIN/INSTRUCTOR/MENTOR/CUSTOMER/LEARNER/MOD) — currently `role default 'user'`; no RBAC enforcement beyond `requireAuth` on `/users/me`.
- Watchlist in localStorage (`vn_stock_ai_watchlist`); portfolios/alerts in PG via PaperBroker (process-local, not multi-user).
- Learning implication: MVP uses localStorage progress (`vnstock_learning_progress_v1`) behind a `ProgressStore` interface; DB tables (`learning_progress/mastery/attempts`) deferred to LEARNING-09/11 behind additive migration, no auth change in MVP. No PII in learning records for MVP.

## 6. Where the Hub belongs (decision)
- `src/lib/learning/` — `types.ts, catalog.ts (static versioned content), ExerciseScoringEngine.ts, MasteryEngine.ts, LearningRecommendationEngine.ts, ProgressStore.ts, systemLinks.ts, index.ts` (pure, deterministic, no React, no fetch, no trading imports).
- `src/services/learning/LearningService.ts` — orchestration (catalog + progress + scoring + mastery + recommendation), localStorage-backed, DB-ready interface.
- `src/schemas/learningSchema.ts` — zod contracts.
- `src/pages/LearningDashboardPage.tsx, LearningPathPage.tsx, LearningLessonPage.tsx, PracticeLabPage.tsx` + `src/components/learning/LearningWidgets.tsx` (terminal styling, educational-spacious).
- `src/store/useAppStore` — add `learnSelectedPathId/learnSelectedLessonId` (optional; MVP can use local state + props to minimize diff).
- `Sidebar` — new `LEARN` group (Dashboard, Paths, Practice Lab). `App.tsx` — 4 new views (`learn, learn-path, learn-lesson, practice-lab`) + contextual `Learn this` links (StockDetail/RiskCenter/Portfolio/Recommendations → mapped lesson).
- API (future, not MVP): `GET /api/learning/*` read-only serving same catalog; `POST /attempt, GET /progress|mastery|recommendations` after auth/RBAC. MVP stays client-only to guarantee isolation.
- Tests: `src/lib/learning/__tests__/learningEngines.test.ts` (+ service test) covering determinism, scoring, mastery-evidence, prerequisites, fail-safe, no-import-trading invariant.

## 7. Risks & guardrails
- Must label SIMULATED / HISTORICAL / EDUCATIONAL; never present exercise as guaranteed outcome; never fabricate real market data; real data must show source/timestamp/freshness.
- Valuation lessons must split FACT/ASSUMPTION/ESTIMATE/MODEL OUTPUT.
- Exercises must not force buy/sell; decision type asks "what to investigate next".
- AI Tutor (future) must ground in approved catalog, never invent capabilities/data.

## 8. MVP acceptance (binding, from roadmap §47)
One complete path; lessons open/complete/revisit; exercises submittable with WHY feedback; progress persists; mastery evidence-based; deterministic next-activity; ≥1 Practice Lab; contextual links on ≥3 system features; no fabricated finance; learning↔trading import isolation; all tests + `tsc --noEmit` + `vite build` pass; audit passes.
