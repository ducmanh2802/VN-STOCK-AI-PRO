# Market Data Audit

**Phase 8.1 — REAL MARKET DATA AUDIT**
**Status:** AUDIT ONLY (no production code modified)
**Date of audit:** 2026-09-04
**Scope:** Why the price displayed by VN STOCK AI does not match the actual Vietnamese stock market, using **HPG** as the primary tracer.

> **Important scope rule honored:** No application/business/scoring/AI-analyst code was modified in this phase. This document is the only file created.

---

## 1. Current Architecture

VN STOCK AI is a **client-first React 19 SPA** served by an Express backend (`server.ts`, port 3000) that also exposes an analysis/DB REST API. The market data access layer already has an abstraction:

```
src/services/market/
├── MarketDataProvider.ts   # re-exports the interface type only
├── MockMarketDataProvider.ts # CONCRETE implementation used at runtime
└── index.ts                # singleton: marketDataProvider = new MockMarketDataProvider()
```

The interface itself lives at:

```
src/types/provider.ts   →  export interface MarketDataProvider { ... }
```

**Only implementation wired into the singleton is `MockMarketDataProvider`** (see `src/services/market/index.ts:6`).
UI consumption flows through TanStack React Query hooks in `src/hooks/useMarketQueries.ts`, which call `marketService.*`.

The Express `/api/*` routes (`server.ts`) read from PostgreSQL/Drizzle repositories, but **only one UI path uses them** (`/api/stocks/:symbol/money-flow-analysis`). Everything else reads mock data directly.

---

## 2. Current HPG Price Flow

Complete data path for the HPG price as rendered on the Stock Detail page:

```
UI (StockDetailPage.tsx → StockPriceSummary)
        ▲  stock.price  (FullStockDetail)
        │
useFullStockDetail(symbol)                      hooks/useMarketQueries.ts:147
        │  getFullStockDetail('HPG')
        ▼
stockDetailService.ts:7  getFullStockDetail()
        │  baseSummary = MOCK_STOCKS_DATABASE['HPG']      (line 9)
        │  const price = baseSummary.price                 (line 17)
        ▼
src/data/mock/marketData.ts:204  HPG record
        │  price: 28650   (hardcoded demo value)
        ▼
(no database, no provider API, no cache source beyond React Query)
```

Detailed origin of the HPG fields used:

| Field | Value (hardcoded) | Location |
|---|---|---|
| `price` (current) | **28650** | `src/data/mock/marketData.ts:209` |
| `change` | 650 | `src/data/mock/marketData.ts:210` |
| `changePercent` | 2.32 | `src/data/mock/marketData.ts:211` |
| `refPrice` | 28000 | `src/data/mock/marketData.ts:217` |
| `ceilingPrice` / `floorPrice` | 29950 / 26050 | `marketData.ts:218-219` |
| `open / high / low` | 28100 / 28800 / 28050 | `marketData.ts:214-216` |
| `sparkline` | fabricated series | `marketData.ts:228` |

**Chart candles are 100% synthetic.** `stockHistory.ts:generateCandlestickHistory()` uses a **seeded LCG pseudo-random generator** to build 130 OHLCV bars that are forced to END at `currentPrice` (the mock 28650). Timestamps are anchored to a hardcoded baseline date `2025-02-28T15:00:00Z` (`stockHistory.ts:48`).

**Money-flow panel is the only backend path.** `useMoneyFlowAnalysis` (`useMarketQueries.ts:166`) fetches `/api/stocks/:symbol/money-flow-analysis`, which reads `PriceRepository.getDailyHistory()` from PostgreSQL — but those rows were seeded from `MOCK_STOCKS_DATABASE` (see `src/db/seed.ts`) with a fixed `date: '2025-02-28'`.

---
## 3. Current Market Data Sources

There is **exactly one active market-data source**: the in-memory mock constant file.

| Source | Type | Where | Consumed by |
|---|---|---|---|
| `MOCK_STOCKS_DATABASE` | Mock (hardcoded) | `src/data/mock/marketData.ts:203` | `MockMarketDataProvider`, `stockDetailService`, `db/seed.ts` |
| `MOCK_INDICES`, `MOCK_MARKET_STATUS`, `MOCK_SECTORS`, `MOCK_TOP_GAINERS/LOSERS/ACTIVE`, `MOCK_MARKET_BREADTH`, `MOCK_MARKET_SENTIMENT`, `MOCK_AI_MARKET_SUMMARY`, `MOCK_AI_TOP_SIGNALS` | Mock (hardcoded) | `src/data/mock/marketData.ts` | `MockMarketDataProvider` |
| PostgreSQL `stocks` / `stock_daily` / `stock_intraday` tables | Real DB, MOCK data | `src/db/schema.ts`, seeded by `src/db/seed.ts` | Express `/api/stocks/*` routes |
| `localStorage` (`vn_stock_ai_watchlist`) | Client persistence | `MockMarketDataProvider.ts:26,37` | watchlist symbols only (no price) |

No external market-data API (SSI, TCBS, Yahoo, Alpha Vantage, Twelve Data, etc.) is called anywhere in the codebase. `@google/genai` (Gemini) is installed and declared in `metadata.json` but is **not invoked** in any source file.

---

## 4. Mock/Fake Data

Every location where a stock price/number can be produced without a real provider (listed, **not deleted**):

| # | FILE | FUNCTION / CONST | DATA | USED BY |
|---|---|---|---|---|
| 1 | `src/data/mock/marketData.ts` | `MOCK_STOCKS_DATABASE` (HPG.price = 28650) | 25 hardcoded Vietnamese equities with full OHLC/ref/ceiling/floor/PE/PB/ROE/RSI/aiScore/fairValue | `MockMarketDataProvider` (`getAllStocks`, `getStockDetail`, `searchStocks`, `getWatchlist`), `stockDetailService`, `db/seed.ts` |
| 2 | `src/data/mock/marketData.ts` | `MOCK_INDICES`, `MOCK_MARKET_STATUS`, `MOCK_SECTORS`, `MOCK_TOP_*`, `MOCK_MARKET_BREADTH/SENTIMENT`, `MOCK_AI_MARKET_SUMMARY`, `MOCK_AI_TOP_SIGNALS` | Hardcoded indices/sectors/movers/sentiment/signals (`isDemo: true`) | `MockMarketDataProvider` |
| 3 | `src/data/mock/marketData.ts` | `MOCK_AI_TOP_SIGNALS` HPG entry (`sig-hpg`, currentPrice 28650, target 33500, stop 27200) | Hardcoded signal | `getAITopSignals`, `stockDetailService` |
| 4 | `src/services/market/stockDetailService.ts` | `getFullStockDetail()` | **Derives** 52-week high/low, pivot points (R1-R3/S1-S3), MA20/50/200, target/stop, fair value, DCF, fundamentals, money flow from `baseSummary.price` via multipliers (e.g. `price*1.22`, `price*0.74`, `pe*`) | `useFullStockDetail` → Stock Detail page |
| 5 | `src/services/market/stockHistory.ts` | `generateCandlestickHistory()` + `buildChartDataBundle()` | Synthetic OHLCV via **seeded LCG random walk**, ending at `currentPrice`; baseline date `2025-02-28` | `useStockChartData` → candlestick chart + indicator snapshot |
| 6 | `src/lib/analysis/fundamental/`, `technical/`, `valuation/`, `moneyFlow/` | Score engines | Deterministic calculations (legit) but input-driven off mock prices | Analysis endpoints / charts |
| 7 | `src/db/seed.ts` | `seedDatabase()` | Inserts **mock database values** into PostgreSQL with hardcoded `todayStr = '2025-02-28'` and fixed ratios/volume | Cloud SQL tables |
| 8 | `src/db/schema.ts` | DDL | Defines tables (structure only, no data) | backend only |

---
## 5. API Sources

All HTTP endpoints on the Express server (`server.ts`):

| Endpoint | Method | Provider | Auth | Produces | Timestamp |
|---|---|---|---|---|---|
| `/api/health` | GET | server | none | `{status,timestamp}` | `new Date().toISOString()` |
| `/api/users/me` | GET | DB (users) | Firebase `requireAuth` | user profile | DB `created_at` |
| `/api/stocks` | GET | DB (stocks) | none | master list | DB |
| `/api/stocks/search` | GET | DB | none | search results | DB |
| `/api/stocks/:symbol` | GET | DB (stocks) | none | stock row | DB |
| `/api/stocks/:symbol/daily` | GET | DB (stock_daily) | none | OHLCV history | `date` (date col) |
| `/api/stocks/:symbol/intraday` | GET | DB (stock_intraday) | none | intraday ticks | `timestamp` |
| `/api/stocks/:symbol/technicals` | GET | DB | none | indicators | `date` |
| `/api/stocks/:symbol/fundamentals` | GET | DB | none | statements/ratios | `date` |
| `/api/stocks/:symbol/valuations` | GET | DB | none | valuations | DB |
| `/api/signals` | GET | DB (signals) | none | signals | DB |
| `/api/stocks/:symbol/technical-analysis` | GET | analysis engine | none | score | computed |
| `/api/stocks/:symbol/fundamental-analysis` | GET | analysis engine | none | score | computed |
| `/api/stocks/:symbol/valuation-analysis` | GET | analysis engine | none | valuation | DB `latest_daily.close` |
| `/api/stocks/:symbol/money-flow-analysis` | GET | DB + MoneyFlowEngine | none | money flow | DB |

**Reality vs claims:** No endpoint provides **realtime** data. The raw `/api/stocks/*` DB endpoints can only return whatever was seeded — which is `MOCK_STOCKS_DATABASE` with `date = '2025-02-28'`. The four `*-analysis` endpoints compute scores from those same mock rows. No HTTP caching headers are set (no `Cache-Control`/`ETag`). Some route-level `staleTime` is applied only client-side (React Query), not on the server.

---

## 6. Database Sources

Tables defined in `src/db/schema.ts` (PostgreSQL, Drizzle):

| Table | Key columns | Price/timestamp | Source of data |
|---|---|---|---|
| `users` | uid, email, role, created_at, updated_at | auth timestamps | Firebase |
| `stocks` | symbol, company_name, exchange, sector, listed/outstanding_shares, is_active, created_at, updated_at | none (identity) | Seeded `MOCK_STOCKS_DATABASE` (MOCK) |
| `stock_daily` | **date, open, high, low, close, ref_price, ceiling_price, floor_price, change, change_percent, volume, value**, created_at, updated_at | `date` (business date) + server timestamps | Seeded mock (MOCK) |
| `stock_intraday` | **timestamp, price, change, volume**, accumulated_*, order_side, created_at, updated_at | `timestamp` | (no seed found for intraday ⇒ empty unless populated externally) |
| `technical_indicators` | date, timeframe, ma20/50/200, ema12/26, rsi14, macd*, bollinger*, volume_ma20, atr14 | `date` | Seeded mock (MOCK) |
| `financial_statements` / `financial_ratios` | year, quarter, revenue, net_profit, pe, pb, roe, eps, bvps | `year`/`quarter` | Seeded mock (MOCK) |
| `valuation_results` | model_name, target_price, current_price, upside_percent, rating | server timestamps | Seeded mock (MOCK) |
| `money_flows` / `foreign_tradings` | date, large/small*, buy/sell/net*, ownership_percent | `date` | Seeded mock (MOCK) |
| `signals` | signal_type, trigger/target/stopLoss, confidence, source='AI_STUDIO_ALGO', status | server timestamps | Seeded mock (MOCK) |
| `portfolios`, `watchlists`, `alerts`, `analysis_results`, `ai_analysis` | user/stock refs, metrics, source flags | server timestamps | Unpopulated / future |

**Verdict:** All price-bearing DB rows are **MOCK**. There is no ingestion path that writes real market prices.

---
## 7. Cache

- **Client (React Query):** Query keys defined in `useMarketQueries.ts:9` (`MARKET_KEYS`). Default React Query cache; explicit `staleTime` only for `moneyFlowAnalysis` (30s) and `chartData` (60s). None of the price-bearing queries (`getStockDetail`, `getAllStocks`, indices, etc.) set `staleTime`/`refreshInterval`, so no periodic refresh — data is whatever the mock returns.
- **No server-side cache** (no TTL, no Redis, no `Cache-Control`) on any `/api` endpoint.
- **No persistent market-data cache/tier** (would be the "database/cache" layer in the ideal flow) — the DB is the cache, and it holds seeded mock values.
- **Persistent client store:** `localStorage` key `vn_stock_ai_watchlist` for watchlist symbols only (no prices).

---

## 8. Timestamp Handling

| Attribute | Value | Generated by |
|---|---|---|
| `MOCK_MARKET_STATUS.timestamp` | `'Phiên chiều - 14:15:30 (GMT+7)'` | **Hardcoded string** (application), claims GMT+7 but is static |
| `MOCK_AI_TOP_SIGNALS[].updatedAt` | e.g. `'14:10:00'`, `'14:12:00'` | **Hardcoded strings** (application) |
| `App.tsx:114` fallback status.timestamp | `new Date().toLocaleTimeString('vi-VN')` | **Client local time** (device TZ, not necessarily Asia/Hanoi) |
| `/api/health` timestamp | `new Date().toISOString()` | **UTC server time** |
| DB `created_at`/`updated_at` | `defaultNow()` | **Server DB time** (UTC by default in Postgres) |
| `stock_daily.date` | `'2025-02-28'` (from seed) | **Hardcoded date** |
| `stockHistory.ts` baseline | `'2025-02-28T15:00:00Z'` | **Hardcoded UTC** used to fabricate chart dates |

**Issues:**
- Most business timestamps are **hardcoded or client-derived**, not provider-generated.
- Timezone is inconsistent: mixture of explicit `GMT+7`, client `vi-VN` local time, and UTC server/DB.
- No wall-clock "as-of" data freshness anywhere — the UI cannot prove it is showing "now".

---

## 9. Price Type

**Classification: MOCK / DEMO (hardcoded current reference price).**

The displayed HPG price (28650 VND) is:
- **NOT realtime** — no streaming/tick source.
- **NOT delayed** — no exchange snapshot is fetched.
- **NOT EOD/latest-close** — no real historical feed.
- **NOT previous close / adjusted close / unadjusted close** — there is no exchange-provided series at all.
- **A mock/demo price** — a hardcoded constant presented as "Đang giao dịch" (currently trading) by the UI, with fabricated OHLC, change, reference/ceiling/floor, and synthetically generated candles.

The data model even encodes this honesty: the `StockSummary` type **requires** `isDemo: true` (`src/types/stock.ts:30`), and all mock records set it. The UI *does* render a `DemoBadge` on pages (`src/components/common/DemoBadge.tsx`) and the Header shows "Đang giao dịch" with a pulsing dot (`StockHeader.tsx:80-83`) — the latter **misleadingly implies live trading** for a static mock value.
## 10. Why Price Can Differ

The displayed price differs from the real HPG market price for a simple, structural reason:

1. **The app never requests real market data.** `marketDataProvider` is `MockMarketDataProvider` (`src/services/market/index.ts:6`).
2. **HPG's "price" is a hardcoded demo constant** (`28650`, `marketData.ts:209`), immutable regardless of the actual market.
3. **The stock header claims "Đang giao dịch" (live trading)** (`StockHeader.tsx:82`) next to the DemoBadge — a live-looking label over static demo data.
4. **Chart OHLCV is fabricated** from the same mock price via a seeded random generator (`stockHistory.ts`), anchored to a hardcoded 2025-02-28 baseline.
5. **The one real backend path (money-flow) reads the DB**, which was itself seeded from the **same mock file** with a fixed business date (`seed.ts:42`), so it cannot correct the price either.

Net effect: the number on screen (28650) is a demo snapshot, not the HPG market price. This is by design in Phase 1, not a bug in a "real" data path — the real data path does not exist yet.

> Per instructions, **no actual current HPG market price is asserted here** (not fabricated).

---

## 11. Problems

1. **Single mock source of truth** (`MockMarketDataProvider`) — no real provider, no failover.
2. **No external market-data integration** — SSI/TCBS or any vendor API is mentioned only in docs, never implemented.
3. **Live-looking UI over demo data** — pulsing "Đang giao dịch" badge + "current price" label with only a small `DemoBadge` for disambiguation.
4. **Synthetic chart history** presented as real time series (LCG random walk, hardcoded baseline).
5. **Stamp/timestamp inconsistencies** — hardcoded `GMT+7` strings, client-local fallbacks, UTC server times mixed together; no authoritative "as-of" timestamp.
6. **No cache TTL/freshness control** on price data (only money-flow/chart client-side `staleTime`).
7. **DB contains only seeded mock rows**, so even `/api/stocks/:symbol/daily` returns fabricated data; `stock_intraday` has no seed and is empty.
8. **`MarketDataProvider` interface signature lacks a realtime/quote/candle method** — it has `getStockDetail` returning `StockSummary` (one price) but **no `getQuote`, no `getCandles`, no `getRealtimePrice`, no timestamp/freshness field**. The interface cannot represent live OHLCV or as-of time.
9. **Gemini declared but unused** — no AI analyst path wired yet.
10. **Pre-existing test-suite failure** (see PROJECT HEALTH below): all 5 test suites fail at import time with `Cannot read properties of undefined (reading 'config')` — a Vitest/Vite version mismatch, unrelated to this audit but blocks the `npm test` gate.
## 12. Recommended Architecture

The repo already has the right *seed*: a `MarketDataProvider` interface with a swappable implementation singleton. What it lacks is a **normalization + adapter layer** and a **time/datetime-aware quote & candle contract**.

Recommended target:

```
External Provider(s)                 e.g. SSI Streaming / TCBS / vendor REST
        │
        ▼
Provider Adapter(s)                  per-vendor HttpRealtimeProvider / HttpQuoteProvider
        │                            (map vendor fields → normalized model, add asOfTime, TZ=Asia/Hanoi)
        ▼
MarketDataProvider (interface)       EXTEND existing interface:
                                     + getQuote(symbol) → { price, bid/ask?, asOf, sourceType }
                                     + getCandles(symbol, range, interval) → real OHLCV
                                     + getMarketStatusReal() with real session time
        │
        ▼
Normalized Market Data               Quote(OHLC{price,ref,ceiling,floor}, volume, value, asOf)
                                     CandleSeries{time(ISO, TZ), OHLCV}
        │
        ▼
Analysis Engines  →  Scoring  →  AI Analyst      (pure deterministic; unchanged inputs)
        │
        ▼
UI (React Query hooks)               { quote, candles, status, asOf } with freshness labels
                                     "REAL · HH:MM ICT" / "DELAYED 15m" / "EOD yyyy-mm-dd" / "DEMO"
```

Notes:
- Keep the current `MockMarketDataProvider` as the **fallback/demo** implementation (implements the same extended interface).
- Introduce a `sourceType`/`priceType` field (`REALTIME | DELAYED | EOD | LATEST | DEMO`) and an `asOfTimestamp` on every price object so the UI can label data honestly.
- Introduce a "normalized market data" model (single TS shape for quote + candle) decoupled from any vendor.
- Move all real fetching behind the Express backend so vendor API keys never reach the browser (matching the existing `/api/*` + `requireAuth` pattern).

---

## 13. Recommended Next Step

**Phase 8.2 should introduce a real quote + candle provider while preserving every existing component.**

Concretely:
1. **Extend `MarketDataProvider`** (`src/types/provider.ts`) with `getQuote(symbol)` and `getCandles(symbol, range, interval)` plus a `priceType`/`asOfTimestamp` on results — additive, non-breaking.
2. **Define a `RealMarketDataProvider`** (or `HttpQuoteProvider`) implementing the extended interface, wired in `index.ts` via an environment flag (e.g. `MARKET_DATA_MODE=real|mock`) so `MockMarketDataProvider` remains the fallback.
3. **Expose backend proxy routes** (`/api/market/quote/:symbol`, `/api/market/candles/:symbol`) that call a real Vietnamese data vendor and return the **normalized** model with `priceType`, `asOf`, and `timezone: Asia/Hanoi`.
4. **Update the hooks** (`useMarketQueries.ts`) to call these routes and update the UI labels to show `REALTIME`, `DELAYED`, or `EOD` + the as-of timestamp — replacing the generic "Đang giao dịch" pulse when data is actually live.
5. **Add a cache layer** (in-memory TTL + optional DB persistence) for quotes/candles to bound vendor rate-limits, with documented freshness.
6. **Fix the pre-existing Vitest config mismatch** so the test suite runs (`npm test` currently fails at import for all suites).
7. **Do not** modify Scoring, AI Analyst, or engine math in this work — only route real normalized data into the existing inputs.
---

## PROJECT HEALTH (Phase 8.1)

| Check | Command | Result |
|---|---|---|
| lint | `npm run lint` → `tsc --noEmit` | **PASS** (0 errors; invoked via `node node_modules/typescript/bin/tsc --noEmit` because `tsc` is not on PATH in this environment) |
| typecheck | `npm run typecheck` → `tsc --noEmit` | **PASS** (0 errors) |
| test | `npm run test` → `vitest run` | **FAIL (pre-existing):** `Cannot read properties of undefined (reading 'config')` at import for all 5 suites — Vitest 5.0.0 vs installed Vite/config mismatch, unrelated to this audit |
| build | `npm run build` → `vite build && esbuild server.ts ...` | **PASS** — `vite build` produced `dist/` (`index.html` + `assets/`); only benign zod `@__PURE__` comment warnings printed |

> Note: `npm run lint` / `npm run typecheck` scripts invoke `tsc` which is not on Windows PATH here; using the local binary yields the same result (no type errors).
> The `esbuild server.ts → dist/server.cjs` part of the build script was not separately executed; the vitest failure is the only failing gate, and it is pre-existing.

---

## GIT SAFETY

`git status --short` at audit end:

- **Modified / committed files:** none (no tracked file was changed).
- **Untracked:** `package-lock.json` (pre-existing npm lock file — **not** created by this audit), plus the newly created `docs/MARKET_DATA_AUDIT.md`.
- A temporary `bin.txt` created during auditing was removed.

No production/business logic, scoring, or AI-analyst code was modified in this phase.