# VN-STOCK-AI-PRO — P27 CERTIFICATION
# DATA FOUNDATION & TRUTH ENGINE
# REAL MARKET DATA → VALIDATION → FRESHNESS → FALLBACK → CERTIFY

Certified: 2026-10-07
Commit base: `46388e1` (branch `main`) + uncommitted P27 working tree
Auditor execution: autonomous (audit → fix → test → build → deploy → public QA)
Companion document: `docs/P27_DATA_AUDIT.md` (the audit that preceded every code change)

---

## EXECUTIVE RESULT

    PASS WITH LIMITATIONS

All 28 gates in §35 are satisfied. The limitations are **declared unavailability
with a real reason for each**, not failures: no authoritative index-level feed,
no market-wide foreign-flow feed, and no market-cap field in any connected source.
Each of those renders `--` / `null` / `DATA_UNAVAILABLE` — never a fabricated
number (§1 non-negotiables).

Three defects found **during** the run — after the audit — are the reason this
phase exists: the vendor's `ot`/`changePc` are unsigned magnitudes (an all-green
market), `closePrice` is stale for three symbols, and one of my own first edits
crashed the public dashboard. All three are fixed, regression-tested and listed
in §15 below.

---

## §35 CERTIFICATION GATES

| Gate | Result | Evidence |
|---|---|---|
| Full data audit complete | **PASS** | `docs/P27_DATA_AUDIT.md` — §1–§12, defects D-01…D-21 |
| Provider matrix documented | **PASS** | audit §2; code `providers/providerMatrix.ts`; test "§6 — provider matrix" (4 cases) |
| Data contract hardened | **PASS** | `types/market.ts`, `types/stock.ts`, `schemas/stockSchema.ts`; nullable fields widened, `StockSummarySchema.price` → `.positive()` |
| Provider abstraction hardened | **PASS** | `providerHealth.ts`, `providerGuard.ts`, `providerMatrix.ts`, `requestCoalescer.ts` |
| Fallback deterministic | **PASS** | `runWithFallback` + `MarketDataUnavailableError`; test "§24.4" (3 cases) |
| Freshness centralized | **PASS** | single `resolveDataFreshness()` in `freshness/dataFreshness.ts` |
| CURRENT / STALE / UNAVAILABLE / INVALID correct | **PASS** | "§24.2" (2), "§24.7" (2), "§7 — failure classification" (6) |
| Quote data truthful | **PASS** | live: `/api/market-data/quote/HPG` → `change −150`, `changePercent −0.73`, `source VPS`, `dataStatus OK`; direction derived from prices only |
| History data truthful | **PASS** | live: `/api/market-data/history/HPG?timeframe=1M` → `dataSource KBS`, `dataStatus OK` |
| VN-INDEX source verified **or explicitly unavailable** | **UNAVAILABLE (declared)** | KBS `data_day` returns `[]` for every index symbol; VPS index list endpoints 404 → matrix declares `index` UNAVAILABLE, tiles render `--` |
| VN30 source verified **or explicitly unavailable** | **UNAVAILABLE (declared)** | same evidence |
| HNX source verified **or explicitly unavailable** | **UNAVAILABLE (declared)** | same evidence |
| UPCOM source verified **or explicitly unavailable** | **UNAVAILABLE (declared)** | same evidence |
| Foreign flow truthful | **PASS** | per-symbol `fBVol/fSVolume/fRoom` **REAL**; market-wide flow has no source → `availability: 'UNAVAILABLE'`, `netValue: null`, provenance `NO_AUTHORITATIVE_FLOW_FEED` (no hardcoded literals) |
| Fundamentals truthful | **PASS** | live `/api/market-data/fundamentals/HPG` returns a real quarterly series; all ratios nullable; `pb`/`pe` re-derived from `bvps`/`eps` only |
| Market cap truthful | **PASS** | no source exposes shares outstanding → `marketCap: null`, tile renders `--` (matrix route `marketCap` = UNAVAILABLE, empty chain, no network attempt) |
| No synthetic production data | **PASS** | no fixture imported by production code; failures return codes, never `0`; footer no longer claims demo |
| Anti-fabrication tests PASS | **PASS** | §24.1–§24.7 all present — `p27AntiFabrication.test.ts` (§12 evidence below) |
| Provider failure tests PASS | **PASS** | `p27ProviderHealth.test.ts` — §7 + §19 + §6 + §27, 20 cases |
| Cache tests PASS | **PASS** | `p27FallbackAndCache.test.ts` — §17/§18/§19/§8 + §27, 19 cases |
| Regression PASS | **PASS** | **215 files / 2477 tests passed, 0 failures** (baseline 210 / 2409 — +5 files, +68 tests, no decrease) |
| TypeScript PASS | **PASS** | `npm run typecheck` → 0 diagnostics |
| Build PASS | **PASS** | `npm run build` exit 0 (`vite build` + `esbuild` → `dist/server.cjs`) |
| Browser QA PASS | **PASS** | §14 below, 0 failures, 0 console errors |
| Public runtime PASS | **PASS** | `https://windows-pc.tailbc6a27.ts.net/` → HTTP 200, no dev runtime, no Vite, no HMR |
| Documentation complete | **PASS** | this file + `docs/P27_DATA_AUDIT.md` |
| No secrets | **PASS** | no key/secret literal in `src/` or `server.ts` (only the pre-existing `whsec_test_secret` test string in `Business05Billing.test.ts`) |
| RiskGuard untouched / protected | **PASS** | no file under RiskGuard / TradingEngine / PositionSizer modified; only data-contract-compatible edits outside them (`RecommendationEngine` provenance strings, `stockDetailService` null RSI) |

---

## §36 FINAL CERTIFICATION FORMAT

```
============================================================
VN-STOCK-AI-PRO — P27 CERTIFICATION
============================================================

STATUS:
PASS WITH LIMITATIONS

DATA FOUNDATION:
PASS

PROVIDER HEALTH:
PASS

FRESHNESS:
PASS

FALLBACK:
PASS

ANTI-FABRICATION:
PASS

VN-INDEX:
UNAVAILABLE

VN30:
UNAVAILABLE

HNX:
UNAVAILABLE

UPCOM:
UNAVAILABLE

FOREIGN FLOW:
UNAVAILABLE

FUNDAMENTALS:
REAL

MARKET CAP:
UNAVAILABLE

DATABASE:
OUT OF SCOPE

BUILD:
PASS

TYPESCRIPT:
PASS

TESTS:
PASS — 215 files / 2477 tests

BROWSER QA:
PASS

PUBLIC RUNTIME:
PASS

PUBLIC:
https://windows-pc.tailbc6a27.ts.net/

SYNTHETIC FINANCIAL DATA:
NONE

AUTO-FIXES:
21  (audit defects D-01 … D-21)

SOURCE CHANGES:
55  (44 modified + 1 deleted + 10 new)

============================================================
FINAL STATUS:
PASS WITH LIMITATIONS
============================================================
```

---

## DATA SOURCES

Provider matrix (`src/services/market/providers/providerMatrix.ts`) — the single
authority for "which provider answers this capability, and what happens when it
does not":

| Capability | Chain | Status |
|---|---|---|
| `quote` (single symbol) | `VPS` | REAL — KBS is a read-only cross-check, never a substitute |
| `quotes` (batch/universe) | `VPS` | REAL — 68 symbols |
| `history` (daily OHLCV) | `KBS` | REAL |
| `fundamentals` | `VPS` | REAL (period metadata exposed as AMBIGUOUS) |
| `breadth` | `VPS` (derived) | REAL — coverage reported with the counts |
| `foreignFlow` | `VPS` | REAL per-symbol; **market-wide flow UNAVAILABLE** |
| `index` | `[]` (none) | **UNAVAILABLE — refuses to run** |
| `marketCap` | `[]` (none) | **UNAVAILABLE — refuses to run** |

8 capabilities: 6 implemented, 2 explicitly unavailable.

Any capability whose chain is empty fails immediately with
`DataUnavailableError(DATA_UNAVAILABLE)` and **makes no network attempt** —
tested by "§6 — provider matrix › refuses to run a capability whose chain is
empty" and "§24.4 › a capability with an empty chain fails immediately".

Provider health registry (`providerHealth.ts`) — live from `/api/health`:

```json
"providerHealth": [
  { "provider": "KBS", "state": "HEALTHY", "consecutiveFailures": 0, "lastErrorCode": null },
  { "provider": "VPS", "state": "HEALTHY", "consecutiveFailures": 0, "lastErrorCode": null }
],
"inFlightProviderRequests": 0
```

Health states: `HEALTHY → DEGRADED (1 failure) → UNAVAILABLE (≥3 consecutive)`;
a single `403` is `BLOCKED` immediately; `429` is `BLOCKED` but retryable.
Error payloads expose **codes only**, never vendor messages.

---

## FRESHNESS

Single implementation: `resolveDataFreshness({sourceTimestamp, referenceTimeMs, ttlMs})`
in `src/services/market/freshness/dataFreshness.ts`. No other module derives state.

| Input | Rule |
|---|---|
| observation within TTL | `CURRENT` |
| observation past TTL | `STALE` |
| no observation at all | `UNAVAILABLE` |
| payload failed validation | `INVALID` |
| cached value re-served | keeps its own timestamp — **never re-stamped `CURRENT`** |
| cache served after a provider failure | `degraded`, never promoted |

Clock: server time only, in ms. The VPS realtime payload carries no
exchange-side timestamp, so the observation time is explicitly documented as
*the moment the record was received from the source* (§16 requirement, code
comment at the capture site).

Evidence: "§24.2" (2 cases) and "§24.7" (2 cases) in `p27AntiFabrication.test.ts`.

---

## FALLBACK

Priority is declared in the matrix, executed by `runWithFallback()`, wrapped by
`withProviderGuard()`:

1. bounded retry — 3 attempts, 150 ms base, ×2 backoff, 2000 ms cap;
2. terminal classes never retried (`BLOCKED` on 403, `INVALID` on malformed /
   schema-invalid, `404`);
3. the response always carries the **provider that actually answered**, plus the
   retained primary failure for diagnostics;
4. an exhausted chain ends in `DataUnavailableError` carrying every attempt;
5. failures are **never cached** — the next caller retries.

Requests for the same cache key are coalesced (`requestCoalescer.ts`): concurrent
callers share one provider call, a failed promise is never memoized, and every
caller observes the same rejection.

Evidence: "§24.4" (3), "§18" (4), "§17/§19" (5) — 12 cases.

---

## INDEX

| Index | Source found | Status | What the UI shows |
|---|---|---|---|
| VN-INDEX | none | **UNAVAILABLE** | `--` + real derived `changePercent` |
| VN30 | none | **UNAVAILABLE** | `--` + real derived `changePercent` |
| HNX | none | **UNAVAILABLE** | `--` + real derived `changePercent` |
| UPCOM | none | **UNAVAILABLE** | `--` + real derived `changePercent` |

Validation performed (audit §7, live probes 2026-10-07):

* KBS `data_day` returns `[]` for every index symbol tried;
* VPS `getlistindex*` endpoints return 404;
* VPS index list endpoints return `[]` for `VN30|VNINDEX|VN100|HNX`;
* `VNI` is an UPCoM **security** (`ISIN VN000000VNI6`), not an index — not usable.

**What is shown instead of a fake level:** the index cards report a
constituent-derived percentage change computed from real prices, aggregate volume
and value summed over the members that supplied them, and the level itself `--`.
Live reading after the final deploy: `VN-Index (HOSE) -- -- (-0.10%)`,
`HNX-Index -- -- (-1.79%)`, with per-card advance/decline `▲22 ■6 ▼35` for HOSE.

---

## MARKET DATA

| Route | Source | Status |
|---|---|---|
| `/api/market-data/quote/HPG` | VPS | `dataStatus: OK`, `change: -150`, `changePercent: -0.73` |
| `/api/market-data/history/HPG?timeframe=1M` | KBS | `dataSource: KBS`, `dataStatus: OK` |
| `/api/market-data/fundamentals/HPG` | VPS | real quarterly series |
| `/api/health` | — | KBS + VPS `HEALTHY`, `inFlightProviderRequests: 0` |
| `/api/platform/healthz` | — | HTTP 200 `{"status":"alive"}` |

**Quote engine (§9) — the single most important rule of this phase:**
`change` and `changePercent` are **always derived from two real prices**
(`lastPrice` vs reference). The vendor fields `ot` and `changePc` are used for
*nothing* — they are unsigned magnitudes. If the reference price is missing the
direction is unknown, so both stay `null` rather than guessing.

Reference price resolution: `r` (kVND) first, `closePrice` (VND) as fallback.

* `r` present on **68/68** symbols;
* `|lastPrice − r| == ot` for **68/68** symbols;
* `closePrice == r` for only **65/68** — stale on `MWG`, `KDH`, `GMD`.

Breadth: counts only members with a usable `change`, and reports the coverage it
actually measured (`MarketBreadth.coverage`). Live: `Phạm vi: 68 mã · có dữ liệu
giá: 68 mã (100%)`, card `Advancers 23 / Unchanged 7 / Decliners 38` — the
quote-derived per-exchange counts (`▲22 ■6 ▼35` for HOSE) and the candle-derived
card now agree to the symbol.

---

## FUNDAMENTALS

* Source: VPS fundamentals / financial statements — real quarterly series.
* Every ratio is nullable: `pe pb eps roe roa dividendYield debtToEquity
  revenueGrowthYoY profitGrowthYoY netMargin grossMargin` — absent → `null` → `--`.
* `pe` and `pb` are re-derived only from two real inputs (`price ÷ eps`,
  `price ÷ bvps`); nothing else is invented.
* Evidence: "§24.6 › fundamentals without ratio rows report null metrics, never 0%".

Limitation: no shares-outstanding field, so per-share metrics cannot be
cross-checked into a market cap (see MARKET CAP).

---

## FOREIGN FLOW

* Per-symbol `fBVol` / `fSVolume` / `fRoom` are **REAL** (from the VPS payload).
* Market-wide foreign / proprietary / retail net flow has **no connected source**:
  `getMarketSentiment()` returns `netValue: null`, `availability: 'UNAVAILABLE'`,
  provenance `NO_AUTHORITATIVE_FLOW_FEED`.
* No hardcoded 185.4 / 62.1 / −247.5 style literals remain in the sentiment path.

---

## CACHE

* Architecture: in-memory TTL cache in `src/services/market/marketDataCache.ts`,
  plus a short-lived in-flight map (`requestCoalescer.ts`) for de-duplication.
* TTLs — quote **15 s** (`QUOTE_TTL_MS`), history **60 s** (`HISTORY_TTL_MS`),
  fundamentals **300 s** (`FUNDAMENTALS_TTL_MS`), universe sweep **2.5 s**
  (`RealMarketDataProvider.CACHE_TTL_MS`), freshness guard **120 s**
  (`QUOTE_FRESHNESS_TTL_MS`). No TTL was extended in P27 (audit §4).
* **Success only** — an exception path never writes a cache entry.
* A cache hit reports the freshness of the *original observation*, not `NOW`.
* Evidence: "§17 — TTL cache" (3), "§18" (4), "§17/§19" (6).

---

## ANTI-FABRICATION (§24 test evidence)

`src/services/market/__tests__/p27AntiFabrication.test.ts`:

| §24 test | Cases | Proves |
|---|---|---|
| 24.1 provider unavailable | 3 | `DATA_UNAVAILABLE` / `null`, **never `0`**; unpriced symbols are dropped, not zero-filled |
| 24.2 old timestamp | 2 | `STALE`, never `CURRENT` |
| 24.3 index without a source | 2 | level `null` / matrix `UNAVAILABLE`, UI renders `--` |
| 24.4 fallback source | 3 | reports the provider that **actually** answered; empty chain makes no network call |
| 24.5 malformed payload | 2 | `INVALID` / `MALFORMED`, never retried, never parsed |
| 24.6 omitted field | 6 | stays `null`; **direction derived from prices, never from vendor magnitudes**; `r` beats a stale `closePrice` |
| 24.7 stale in cache | 2 | cache never re-stamps `CURRENT`, never promotes a degraded row |

Plus §12 coverage (1). Companion suites:

* `p27ProviderHealth.test.ts` — 20 cases (§7 classification/registry, §19 retry/timeout/breaker, §6 matrix, §27 latency)
* `p27FallbackAndCache.test.ts` — 19 cases (§8 pass-through, §17, §18, §19, signed quote, §27 cache hit rate / fallback rate / dedup)
* `DataStatusPayload.test.ts` — 3 cases (HTTP 200 + `DATA_UNAVAILABLE` is **not** LIVE)
* `MarketBreadthWidget.test.tsx` — 5 cases (loading / empty / coverage / labels / error)

**68 new tests across 5 new files; all passing.**

---

## DATABASE

Explicitly **OUT OF SCOPE** for P27 (§26). No PostgreSQL was added, removed,
migrated or reconfigured. DB-backed routes still fail closed with JSON 500 in
production, which is why `/api/health` reports overall `status: "degraded"` with
`blockedBy` naming `database`/`auth`/`gemini` — a pre-existing, non-data-truth
condition that is unchanged by this phase and is **not** masked.

---

## PERFORMANCE (§27)

Measured on the running production container (2026-10-07, 4 endpoints × 2 passes)
and exposed by `/api/health`, so the numbers stay observable rather than anecdotal:

| Metric | Measurement | Where it is reported |
|---|---|---|
| Provider latency | VPS avg **93 ms** (last 20 ms) · KBS **108 ms** | `providerHealth[].avgLatencyMs` / `lastLatencyMs` — the guard times the real round trip |
| Response latency (cold) | quote 103–507 ms · history 126 ms · fundamentals 26 ms | observed on the public process |
| Response latency (warm) | **5–32 ms** | same measurement, cache-served |
| Cache hit rate | **50 %** (4 hits / 4 misses over 8 lookups) | `marketDataCache.hitRate` (+ `hits` / `misses`) |
| Fallback rate | 4 requests · **0 fallbacks** · 0 exhausted | `fallback{requests,fallbacks,exhausted}` |
| Provider failure rate | **0** — both providers `HEALTHY`, `consecutiveFailures: 0`, no `lastFailureAt` | `providerHealth` |
| Request deduplication | 0 concurrent shares at rest; `coalescedRequests` counts joins over the process lifetime | `inFlightProviderRequests` / `coalescedRequests` |

No optimization was performed (`Do not optimize prematurely`): the only change is
measurement — counters and timers. No new paid services, no persistence (§26).

---

## REGRESSION

| Item | Baseline (P26) | After P27 | Delta |
|---|---|---|---|
| Test files | 210 | **215** | +5 |
| Tests | 2409 | **2477** | +68 |
| Failures | 0 | **0** | — |
| TypeScript | pass | **pass** (0 diagnostics) | — |
| Build | pass | **pass** (exit 0) | — |
| Duration | 56.31 s | 50.34 s | −5.97 s |

Two pre-existing assertions were adjusted (never a data-truth assertion) —
documented in audit §12: an expected `fetch` call count that now includes bounded
retries, and a provenance `period` string that was restored after correction.

No test was deleted or weakened.

---

## BUILD

| Item | Value |
|---|---|
| Command | `npm run build` → `vite build && esbuild server.ts … dist/server.cjs` |
| Exit | **0** |
| `dist/index.html` | 1,608 B |
| `dist/assets/index-CqiSvh5m.js` | 1,171,540 B |
| `dist/assets/index-DNsJNqSr.css` | 121,369 B |
| `dist/server.cjs` | 900,210 B (+ 1,901,929 B sourcemap) |
| Runtime | `node dist/server.cjs` — **no Vite, no HMR, no dev server** |

---

## CONTAINER

| Item | Value |
|---|---|
| Image | `vn-stock-ai-pro:p27` |
| Image ID | `sha256:8f714bed0250bbb10272f3058b2109e1b8a4c58f7ac2a83892fb792562515125` |
| Image created | 2026-10-07T16:26:04Z (732 MB) |
| Container | `vn-p27` / `2ca390574dfbc604a756d3ea7869e0428792d6893f6867ecea2fb5a6afd6a099` |
| PID 1 command | `node dist/server.cjs` (via `docker-entrypoint.sh`) |
| User | `app` (non-root) |
| Env | `NODE_ENV=production` `PORT=10000` `HOST=0.0.0.0` `LOG_LEVEL=INFO` |
| Port | host `0.0.0.0:10000` (only exposed port) |
| Health | **healthy** |
| Restart policy | `unless-stopped` |
| RestartCount / OOMKilled | `0` / `false` |
| Volumes / source mounts | none |
| Previous container | `vn-p25` `Exited (137)` — stopped; exactly one serving container |

---

## PUBLIC RUNTIME

| Item | Result |
|---|---|
| Public URL | `https://windows-pc.tailbc6a27.ts.net/` → HTTP **200** |
| `/api/health` | HTTP **200** (KBS + VPS `HEALTHY`) |
| `/api/platform/healthz` | HTTP **200** `{"status":"alive"}` |
| Dev runtime / Vite / HMR | **none** — production `node dist/server.cjs` only |

---

## BROWSER QA (§32)

Tool: headless browser against the **public** URL. Final run: **0 failures,
0 console errors/warnings, 0 failed requests.**

| Item | Result |
|---|---|
| market ribbon | renders, signed change, level `--` |
| VN-INDEX / VN30 / HNX / UPCOM | all four `--` (no fabricated level) with real derived change |
| watchlist | renders real rows with per-symbol signed change |
| stock detail (quick view) | `MSN 75.200 +3.200,00 (+4.44%)`, `REAL DATA`; market cap `--`, P/E `—`, P/B `—`, ROE `—`, Fair Value `—` |
| unavailable states | index tiles `--`, fundamentals `—`, breadth coverage line present |
| stale states | not reachable live (feed was `CURRENT` during QA) — covered by §24.2 / §24.7 tests |
| source labels | every `data-provenance` on the dashboard = `real`; **zero** `DEMO DATA` labels on real feeds |
| false demo claims | none (`DEMO DATA` text absent from the body; footer states the real policy) |
| NaN / undefined / zero-price rows | none, across dashboard, Market, Fundamentals, Watchlist, Screener, Data Health, stock detail |
| console errors | **0** |
| crash / error boundary | none |
| Data Health page | 6/6 `ALL HEALTHY`, 7 `LIVE`, 0 `UNAVAILABLE`, 0 `LOADING` left |

---

## DEFECTS FOUND AND FIXED (auto-fix policy §30)

Audit defects **D-01 … D-18** (see `docs/P27_DATA_AUDIT.md` §5) plus three found
by live probing and runtime QA **after** the first fixes:

| # | Defect | Why it matters |
|---|---|---|
| **D-19** | `ot` / `changePc` are **unsigned magnitudes** — 68/68 rows positive while 38 symbols actually closed down | Taking them at face value rendered an **all-green market** with zero decliners and internally contradictory quotes (`change −150` next to `changePercent +0.73`). Direction is now always derived from two real prices. |
| **D-20** | Reference preferred `closePrice` over `r`; `closePrice` is stale for `MWG`/`KDH`/`GMD` (GMD: 78,000 vs a real 52,000) | Mispriced three symbols' daily change by up to −30 %. `r` is now authoritative (`|last − r| == ot` for 68/68). |
| **D-21** | My own first §12 edit put the coverage block in the **loading** branch | `TypeError: Cannot read properties of null (reading 'coverage')` took the public dashboard to the error boundary. Fixed, plus a server-rendered test across all five widget states so it cannot recur silently. |

Everything else: zero-fabrication (`0` → `null`), freshness, matrix, health,
guard, coalescing, badge/label truth, `DataStatusPage` measuring bodies instead of
HTTP codes, `RecommendationEngine` provenance strings.

---

## SOURCE CHANGES

55 files: 44 modified, 1 deleted (`common/DemoBadge.tsx`), 10 new.

New modules: `providers/providerHealth.ts`, `providers/providerMatrix.ts`,
`providers/providerGuard.ts`, `requestCoalescer.ts`, `common/SourceBadge.tsx`.
New tests: `p27AntiFabrication.test.ts`, `p27ProviderHealth.test.ts`,
`p27FallbackAndCache.test.ts`, `DataStatusPayload.test.ts`,
`MarketBreadthWidget.test.tsx`.
New docs: `docs/P27_DATA_AUDIT.md`, this file.

Protected areas **untouched**: RiskGuard, TradingEngine, PositionSizer, strategy
logic. Outside those, only data-contract-compatible edits:
`RecommendationEngine` (provenance/period strings — test-restored), 
`stockDetailService` (canonical RSI returns `null` instead of a fabricated `50`).

---

## LIMITATIONS AND KNOWN FOLLOW-UPS (non-blocking)

1. **Index levels are UNAVAILABLE.** No connected feed returns a VN-INDEX / VN30 /
   HNX / UPCoM level. Tiles show `--`; only constituent-derived change/volume/value
   are shown. Would need a licensed index endpoint (the KBS index symbols are
   empty and the VPS index endpoints 404).
2. **Market-wide foreign flow is UNAVAILABLE.** Only per-symbol buy/sell/room.
3. **Market cap is UNAVAILABLE.** No source supplies shares outstanding.
4. **Breadth is measured, not universal.** Coverage is printed on the card; on this
   run it was 68/68 (100 %).
5. **`/api/health` overall status is `degraded`** because `database`/`auth`/`gemini`
   are unconfigured in production — pre-existing, out of P27 scope, and not a
   data-truth issue (both market-data providers report `HEALTHY`).
6. **Cross-source breadth delta is zero now**, but the two sources are independent:
   VPS quotes (price-derived) vs KBS candles (close-to-close). They agreed exactly
   on the final run; a future divergence would be a source discrepancy, not a bug.

---

## SIGN-OFF

The application never fabricates financial data. Missing, unavailable, stale,
invalid and unmeasured values are reported as `null`, `--`, `—`,
`DATA_UNAVAILABLE`, `STALE`, `INVALID` or `UNAVAILABLE` — never as `0` and never
as a plausible-looking guess. Every number shown in the public UI traces to a live
VPS or KBS response, or is explicitly marked as derived.

    ============================================================
    FINAL STATUS:
    PASS WITH LIMITATIONS
    ============================================================
