# P27 — DATA FOUNDATION & TRUTH ENGINE

## `docs/P27_DATA_AUDIT.md`

**Phase:** P27 (executed autonomously, continuing from the P26 `PUBLIC RUNTIME PASS` baseline)
**Audit date:** 2026-10-07
**Audit scope:** `src/`, `server.ts`, `src/services/market/**`, providers, API routes, UI data consumers, tests, docs.
**Method:** full-repo text search (`market data`, `quote`, `candle`, `index`, `VN-INDEX`, `VN30`, `HNX`, `UPCOM`, `foreign flow`, `market cap`, `fundamentals`, `freshness`, `cache`, `provider`, `fallback`, `DATA_UNAVAILABLE`, `CURRENT`, `STALE`, `INVALID`), file-by-file read of every provider and market-data route, plus **live probes against the real vendors** to validate which capabilities actually exist.

> This audit was completed **before** the P27 code changes in this phase. Every defect listed in §5 has a matching fix entry in §12.

---

## 1. Provider inventory

| Provider | Module | Endpoint(s) | Capability | Live-verified on 2026-10-07 |
|---|---|---|---|---|
| **VPS Securities** | `src/services/market/providers/VPSMarketDataProvider.ts` (bulk, used by the dashboard path) and `src/services/market/providers/vps/VpsProvider.ts` (single-symbol, used by the API path) | `bgapidatafeed.vps.com.vn/getliststockdata/{SYM}`, `/getliststockbaseinfo/{SYM}` | realtime quotes, per-symbol foreign flow, fundamentals | `getliststockdata/HPG` → 1 array entry; `getliststockbaseinfo/HPG` → statement JSON |
| **KBS (KB Securities VN)** | `src/services/market/providers/kbs/KbsHistoricalProvider.ts` | `kbbuddywts.kbsec.com.vn/data_day` | daily OHLCV history (≈1 year lookback, `errorCode 4000014` beyond) | returns real `data_day` rows; requires a browser `User-Agent` (WAF blocks `400 Request Blocked` otherwise) |
| **VNDIRECT / VCI** | — | — | — | **not present in this codebase**; no dormant implementation found to revive |
| **Index feed** | — | — | index level | **none reachable** (see §7) |

Two independent VPS clients exist (`VPSMarketDataProvider` for the client-side universe sweep, `VpsProvider` for `/api/market-data/*`). Both normalize the same payload; both were audited and fixed.

## 2. Provider matrix (new in P27: `providers/providerMatrix.ts`)

| Provider | Quote | History | Index | Fundamentals | Breadth | Foreign flow | Market cap |
|---|---|---|---|---|---|---|---|
| **VPS** | yes | no | **no** | yes | derived from quotes | per-symbol only | **no** |
| **KBS** | no | yes | **no** | no | derived from candles | no | no |
| **Status** | IMPLEMENTED | IMPLEMENTED | **UNAVAILABLE** | IMPLEMENTED | IMPLEMENTED (partial coverage) | IMPLEMENTED (per-symbol) | **UNAVAILABLE** |

Matrix facts were established by live probe, not by assumption:

* KBS `data_day` for `VNINDEX`, `VN-INDEX`, `VN30`, `HNXINDEX`, `UPCOMINDEX`, `HNX`, `UPCOM` → `{"symbol":X,"data_day":[]}` (empty).
* VPS `getliststockdata/VN30|VNINDEX|VN100|HNX` → `[]`.
* VPS index endpoints `getlistindex`, `getlistindexdata`, `getlistmarketindex`, `getindexdata` → **404**.
* `VNI` exists in both feeds but is an **UPCoM-listed security** (`ISIN VN000000VNI6`, price ≈ 6 900 VND), *not* an index.

**Provider priority / authority**

| Capability | Priority | Why |
|---|---|---|
| Quote | VPS → none | VPS is the only live realtime feed. KBS is used only as a *cross-check* benchmark for the kVND→VND normalization (advisory `OK/MISMATCH/UNVERIFIED`), never as a substitute price source. |
| History | KBS → none | KBS `data_day` is the only daily OHLCV feed. |
| Fundamentals | VPS → none | Only `getliststockbaseinfo` supplies statements. Period metadata is `AMBIGUOUS` and is exposed as such. |
| Index | **none** | Declared `UNAVAILABLE` in the matrix; see §7. |

Evaluation criteria used (§6): authority (exchange-adjacent broker feed), availability, latency (5–20 s client timeouts), data quality, rate limit, WAF/blocking (KBS UA requirement), freshness (120 s quote TTL), coverage (see §9).

## 3. Data contract (§4)

`MarketQuote`, `StockSummary`, `TopMover`, `IndexData`, `MarketBreadth`, `FundamentalMetrics` are the five contracts that cross the provider → service → API → UI boundary. Baseline fields exposed: `data/status/dataStatus`, `source`, `fetchedAt`, `marketTimestamp`, `dataFreshness`, `sourceTimestamp`, `errorCode` (via `MarketDataUnavailableError.reason`). No secrets and no stack traces are exposed.

## 4. Baseline policy preserved (§3)

| Constant | Value | Location |
|---|---|---|
| Quote cache TTL | **15 s** | `realMarketDataService.ts` `QUOTE_TTL_MS` |
| History cache TTL | **60 s** | `HISTORY_TTL_MS` |
| Freshness guard | **120 s** | `VPSMarketDataProvider.QUOTE_FRESHNESS_TTL_MS` (= `DEFAULT_RISK_CONFIG.maxStaleTimeMs`) |
| Fundamentals cache TTL | **300 s** | `FUNDAMENTALS_TTL_MS` |
| Universe sweep cache | 2.5 s | `RealMarketDataProvider.CACHE_TTL_MS` |
| Freshness states | `CURRENT / STALE / UNAVAILABLE / INVALID` | `freshness/dataFreshness.ts` (sole path to `CURRENT` at `:132`) |

No TTL was extended in P27. Cache tolerance (10 %) and the existing 2.5 s sweep window were left untouched.

## 5. Defects found (and their P27 fixes)

### 5.1 Zero-fabrication / substitution (`0` used for missing data)

| # | Location | Defect | Fix |
|---|---|---|---|
| D-01 | `VPSMarketDataProvider.normalizeQuote:120-141` | `refPrice ?? 0`; `lastPrice ?? refPrice`; `openPrice ?? refPrice`; `highPrice/lowPrice ?? lastPrice`; `changePercent ?? 0`; `volume ?? 0`; `freshnessMs: ageMs ?? 0` | every field now `null` when absent; no field is copied from a neighbour; `dataStatus` becomes `UNAVAILABLE` when `price` is null |
| D-02 | `VPSMarketDataProvider.getFundamentals:290-357` | `findRatioVal`/`findStatementVal` returned `0`; `pe/pb/eps/roe/roa ‖ 0`; `dividendYield: 0`; `revenueGrowthYoY/profitGrowthYoY: 0`; `debtToEquity/netMargin/grossMargin: 0` | all extraction helpers return `number \| null`; every metric is nullable and stays `null` when the payload omits it |
| D-03 | `RealMarketDataProvider.refreshUniverseQuotes:101-111` | missing quote → `price: 0`, `change: 0`, `volume: 0`, `tradingValue` from `price*volume`, OHLC synthesized from `refPrice` | a symbol with no usable price is **skipped entirely** (no zero-priced row); remaining fields pass through as `null` |
| D-04 | `RealMarketDataProvider.getStockDetail:533` | `quote.totalValue ?? quote.price * quote.volume` fabricated a traded value | `tradingValue = null` unless the vendor supplied a traded value |
| D-05 | `stockDetailService.computeCanonicalRSI:22,28` | returned the literal `50` for <15 bars (a fabricated "neutral" RSI) | returns `null`; the thesis sentence omits the RSI clause instead of claiming `RSI(14) đạt 50` |
| D-06 | `server.ts:711-714`, `:811-816` | read non-existent `fundamentals.peRatio/pbRatio/roe/eps` → always `null`, silently discarding the real values that *were* present under `quarterly.*` | `latestNumber(fundamentals.quarterly.pe/roe/eps/bvps)`; `pb` derived only from real `price ÷ bvps` |
| D-07 | `RecommendationEngine.ts:237-246` | money-flow evidence labelled **"VPS Order Flow"** although the score is `upVol/totalVol` from KBS candles; valuation evidence claimed "DCF & Multiple models" | provenance now states the real source and the real formula (`KBS Daily Candle Volume`, `VPS Fundamentals (P/E)`, ROE-based scoring) |

### 5.2 Missing provider infrastructure

| # | Defect | Fix |
|---|---|---|
| D-08 | No capability→provider map; order was implicit in per-call-site `try/catch`, so priority was unauditable | `providers/providerMatrix.ts` — frozen `PROVIDER_MATRIX`, `resolveChain()`, `runWithFallback()` retaining `source` + full `attempts[]`, terminal `DataUnavailableError` |
| D-09 | No health classification; failures were converted to a bare `MarketDataUnavailableError` and forgotten | `providers/providerHealth.ts` — `HEALTHY/DEGRADED/BLOCKED/UNAVAILABLE/INVALID`, `classifyProviderFailure()` (403/401/407 → BLOCKED non-retryable, 429 → BLOCKED retryable, 404 → non-retryable, 5xx → DEGRADED retryable, timeout/network → UNAVAILABLE retryable, malformed/schema → INVALID non-retryable), process-lifetime registry |
| D-10 | No timeout/retry/backoff/circuit-breaker on vendor calls; `src/lib/platform/resilience/resilience.ts` existed but was **unwired** | `providers/providerGuard.ts` — bounded retry (3 attempts, 150 ms base, ×2, capped 2 s), per-attempt `AbortController`, `CircuitBreaker` from `resilience.ts`, health recorded on every attempt |
| D-11 | No request deduplication: 20 widgets could issue 20 identical provider requests | `requestCoalescer.ts` — keyed single-flight; failures are **never** memoized (slot released on settle) |

### 5.3 Contract / UI truth

| # | Defect | Fix |
|---|---|---|
| D-12 | `MarketQuote`/`StockSummary`/`FundamentalMetrics`/`IndexData` declared most numbers non-nullable, forcing fabrications to satisfy the type | fields widened to `number \| null`; `StockSummarySchema.price` tightened to `.positive()`; nullable session fields declared nullable in the schema |
| D-13 | `DataStatusPage` counted **HTTP 200 as `LIVE`** even when the body carried `dataStatus: 'DATA_UNAVAILABLE'`; all six feeds were hard-coded `LIVE` before the first measurement | body inspected via `payloadDeclaresUnavailable()`; initial state `LOADING`; header/metric badges derived from measured state |
| D-14 | `DemoBadge` (`common/DemoBadge.tsx`, 24 call sites) unconditionally claimed **"DEMO DATA"** over live VPS/KBS data; `MarketOverview` printed a static `DEMO DATA`; `AIMarketSummaryCard` badged a real-derived summary `DEMO DATA` | replaced by `common/SourceBadge.tsx` with an explicit `variant: real \| calculated \| demo \| unavailable`; genuinely-demo surfaces (`PhasePlaceholderPage`) pass `variant="demo"`; `MarketOverview` → `VPS · REAL`; AI summary → `CALCULATED` |
| D-15 | `Footer.tsx` legal text asserted that **all** numbers are `DỮ LIỆU MÔ PHỎNG (DEMO DATA)` — false since P8.5C | rewritten to state exactly which labels mean real source, which mean calculated, and that missing data renders `--` |
| D-16 | Breadth presented as whole-market | `MarketBreadth.coverage {universe, coveredStocks, pricedStocks, percentPriced, note}` + coverage line in `MarketBreadthWidget` |
| D-17 | Index `changePercent`/`totalVolume`/`totalValue` were `0` for an empty basket | aggregates computed only over members that supplied the field; `null` when none did; sector tiles with no usable change are omitted rather than shown as `0.00%` |
| D-18 | `/api/health` reported provider state only as cache-key heuristics | now also exposes the P27 `providerHealth` registry (state, failure streak, **error code only** — no messages) and `inFlightProviderRequests` |

### 5.5 Defects found by live probing and runtime QA (after the first fixes)

| # | Location | Defect | Fix |
|---|---|---|---|
| D-19 | `VPSMarketDataProvider.normalizeQuote:136-151`, `VpsProvider.getQuote:212`, `EtfDataProvider:109`, `DerivativesDataProvider:118/190` | **Direction was fabricated.** The VPS fields `ot` and `changePc` are unsigned *magnitudes*: a live probe of the whole universe on 2026-10-07 found **68/68 rows positive while 38 of those symbols closed DOWN** (KBS candles). Taking them at face value produced an all-green market — the quote-derived breadth reported **zero decliners** for a session in which the KBS candle-derived breadth for the same 68 symbols was 23 / 7 / 38, the index ribbon showed only advances, `trend`/`aiScore` were flipped, and the API quote was internally inconsistent (`change: -150` next to `changePercent: +0.73`). | `change` and `changePercent` are now **always derived from the two real prices** (`lastPrice` vs reference). When the reference is missing the direction is unknown, so both stay `null`. Applied to the universe provider, the API quote provider, the ETF provider and the derivatives provider. |
| D-20 | `VPSQuoteRaw` / `VpsProvider.getQuote:206-213` / `EtfDataProvider:78-81` | The reference price preferred `closePrice` (VND) over `r` (kVND). `closePrice` is stale for **MWG / KDH / GMD** (GMD reported 78,000 against a real reference of 52,000), which mis-priced those three symbols' change by −30 % / −8.7 %. | `r` is now the reference of record (present on 68/68 rows and satisfying `|lastPrice − r| == ot` for **68/68** rows); `closePrice` is only a fallback. |
| D-21 | `MarketBreadthWidget.tsx` (first P27 edit) | The §12 coverage block was inserted into the **loading** branch, where `breadth` is null — `TypeError: Cannot read properties of null (reading 'coverage')` took the whole public dashboard down to the ErrorBoundary. | Block moved into the rendered branch behind the existing `!breadth` guard; `__tests__/MarketBreadthWidget.test.tsx` now renders the loading / empty / error / data branches server-side so this class of regression is caught without a browser. |


### 5.4 Confirmed *not* defects (left alone deliberately)

* `MarketDataIntegrityGuard`, `TradingDataValidator`, freshness derivation (`dataFreshness.ts`) — already correct and covered by tests.
* `Math.random` — 12 hits, all paper-trading order-ID generation (not financial data).
* `src/db/seed.ts` fixtures — argv-guarded dev-only path, `isDemo: true`, explicit `DEMO_FIXTURE` provenance strings.
* DB routes failing closed with JSON 500 in production (no PostgreSQL) — out of scope per §26.

## 6. Freshness & timestamps (§15 / §16)

* Single implementation: `resolveDataFreshness({sourceTimestamp, referenceTimeMs, ttlMs})` in `freshness/dataFreshness.ts`.
* Freshness derives from **`dataTimestamp` only**. The VPS realtime payload carries no exchange-side timestamp, so the observation time is explicitly documented as *the moment the record was received from the source*; the code comment states this assumption (§16 requirement).
* Cached summaries recompute freshness against their own observation time on every read, so a cache can only **weaken** a label (`CURRENT → STALE → UNAVAILABLE`), never strengthen it. Provider failure degrades any `CURRENT` cached row to `STALE`.
* Timestamps are ISO-8601 UTC in all contracts; conversion to `GMT+7` happens only at presentation boundaries (session classification documents its `UTC+7` offset arithmetic).

## 7. Index source validation (§11) — `INDEX_STATUS = UNAVAILABLE`

**Blocker (verified 2026-10-07):**

1. KBS `data_day` answers `data_day: []` for every index symbol tried (`VNINDEX`, `VN-INDEX`, `VN30`, `HNXINDEX`, `UPCOMINDEX`, `HNX`, `UPCOM`).
2. VPS `getliststockdata` answers `[]` for `VN30`/`VNINDEX`/`VN100`/`HNX`.
3. VPS exposes no index route (`getlistindex*` / `getmarketindex` → HTTP 404).
4. The only symbol present under an index-like name (`VNI`) is a listed UPCoM security (`ISIN VN000000VNI6`), not an index — using it would be a category error.

Therefore `PROVIDER_MATRIX.index.providers = []`, `status: 'UNAVAILABLE'`, and `RealMarketDataProvider.getMarketIndices()` returns `value: null`, `change: null`, `sparkline: null`, `levelSource: 'UNAVAILABLE'` with an explicit `levelProvenance`. The UI renders `--`. Constituent-derived aggregates (advances/declines/unchanged, volume, value, mean change %) **are** real and are reported, with coverage metadata.

## 8. API contracts (§20)

| Route | Success | Unavailable | Notes |
|---|---|---|---|
| `GET /api/market-data/history/:symbol` | 200 + bundle | 200 + `{dataStatus:'DATA_UNAVAILABLE', dataSource, error}` | unsupported timeframe (intraday) refused, never generated |
| `GET /api/market-data/quote/:symbol` | 200 + `RealtimeQuote` (+ cross-check) | 200 + `DATA_UNAVAILABLE` | cross-check is advisory and never fabricates |
| `GET /api/market-data/fundamentals/:symbol` | 200 + fundamentals | 200 + `DATA_UNAVAILABLE` | period mapping `AMBIGUOUS` |
| `GET /api/stocks/:symbol/recommendations` | 200 + recommendation | 200 + `{dataStatus:'INSUFFICIENT_DATA'}` when <20 real bars | fail-closed scores stay `null` |
| unknown routes | — | JSON 404 | unchanged |
| internal errors | — | JSON 500 via `sendSafeError` | no stack traces |

No route returns HTTP 200 with fabricated financial data. `MarketDataUnavailableError` and `DataUnavailableError` both carry machine-readable codes (`DATA_UNAVAILABLE`, `KBS_EMPTY_HISTORY`, `PROVIDER_BLOCKED`, …).

## 9. Breadth, foreign flow, market cap, fundamentals

* **Breadth** — advances/declines/unchanged/ceilings/floors are counted only over members that supplied a usable `change`; `coverage` now states the universe and how many members were priced. Ratio/labels derive from those counts only.
* **Foreign flow** — per-symbol `fBVol` / `fSVolume` / `fRoom` only. Market-wide foreign / proprietary / retail net flow has **no** connected source: `getMarketSentiment()` returns `netValue: null`, `availability: 'UNAVAILABLE'`, with a `NO_AUTHORITATIVE_FLOW_FEED` provenance string (no hardcoded 185.4 / 62.1 / −247.5 literals).
* **Market cap / shares outstanding** — VPS base-info exposes neither field; both are `null` in `FundamentalMetrics`, `marketCap: null` in `StockSummary`, and sector market cap is `null` unless *every* constituent is authoritative.
* **Fundamentals** — `pe/pb/eps/roe/roa/dividendYield/debtToEquity/revenueGrowthYoY/profitGrowthYoY/netMargin/grossMargin` are all nullable; `pb`/`pe` are re-derived only from two real inputs (`price ÷ bvps`, `price ÷ eps`).

## 10. UI data-state audit (§21)

Audited: market ribbon, VN-INDEX/VN30/HNX/UPCOM tiles, watchlist, stock detail, market overview, heatmap, foreign flow, fundamentals.

* `formatVND/formatNumber/formatPercent/formatVolume/formatBillionVND` all render `--` for `null`/`NaN` and are covered by existing "does NOT coerce null to 0" tests.
* `StockFundamentals` guards every metric with `isFiniteNumber`/`isPositiveFiniteNumber` → fabricated `0%` rows now render `--`.
* `StockPriceSummary` renders an explicit unavailable panel when `price` is not positive.
* Unguarded arithmetic found and fixed: `WatchlistTable` (`stock.low/1000`, `stock.high/1000` — guarded by the surrounding `isFiniteNumber` check), `RealMarketDataProvider` sparkline/aggregate math.

## 11. Test fixture policy (§23)

* Synthetic fixtures exist only under `tests/` and `src/**/__tests__/`, and are labelled (`TEST_FIXTURE_ONLY` / `DEMO_FIXTURE`).
* Production code does not import fixtures; `src/data/mock/marketData.ts` is reachable only from the argv-guarded dev seed path.

## 12. Fix → test → regression

| Step | Result |
|---|---|
| Audit | this document |
| Diagnose | §5 defect table |
| Fix | §5 "Fix" column |
| Test | §24 anti-fabrication suite (`p27AntiFabrication.test.ts`, incl. D-19/D-20 direction & reference tests, §12 coverage), provider-health / fallback / cache suites (`p27ProviderHealth.test.ts`, `p27FallbackAndCache.test.ts`), `DataStatusPayload.test.ts`, `MarketBreadthWidget.test.tsx` |
| Regression | `npx tsc --noEmit` + `npx vitest run` (see certification) |

Two pre-existing tests were adjusted, both in the "expected call count / provenance string" category, never in their data-truth assertion:

1. `realMarketDataService.test.ts` — "NEVER falls back to synthetic data" asserted exactly 2 `fetch` calls; with §19 bounded retry each call now performs up to 3 attempts. The assertion became `>= 2` (both calls still reach the provider, the failure is still not cached, no synthetic data is still returned).
2. `RecommendationsDeepDiveHardening.test.tsx` — required `period: 'TTM / Latest Quarter'` in the evidence table; that value was restored after the provenance `source`/`calculation` strings were corrected.
