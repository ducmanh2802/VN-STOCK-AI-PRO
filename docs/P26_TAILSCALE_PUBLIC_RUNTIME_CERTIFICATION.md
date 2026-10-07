# VN-STOCK-AI-PRO — P26 CERTIFICATION
# TAILSCALE PUBLIC RUNTIME HARDENING → AUTO-FIX → FINAL PUBLIC RUNTIME PASS

Certified: 2026-10-07
Commit: `46388e1` (branch `main`)
Auditor execution: autonomous (Phases A → P)

---

## EXECUTIVE RESULT

    PUBLIC RUNTIME PASS

All 24 mandatory criteria in §19 are satisfied. Zero source changes were
required — the P25 production artifact already met every hardening property,
so Phase C auto-fix policy resolved to **DO NOTHING** and certify.

Known limitations exist but are **outside the P26 criteria** and pre-date this
phase (documented in P23 §5): no production PostgreSQL, and no authoritative
index-level feed. Both degrade truthfully (`UNAVAILABLE` / `null` / JSON 500
error), never to fabricated values.

---

## BUILD

| Item | Result |
|---|---|
| `npm run build` | **PASS** (`vite build` 1945 modules → `dist/`; `esbuild` → `dist/server.cjs` 860.6 KB + 1.8 MB sourcemap) |
| Bundle | `dist/index.html` 1.61 kB, `dist/assets/index-D827E4T5.css` 120.55 kB, `dist/assets/index-BsH1ycG6.js` 1,169.30 kB |
| Server bundle | `dist/server.cjs` (860.6 KB) |
| Exit code | `BUILD_EXIT=0` |
| Startup command | `node dist/server.cjs` (container CMD); `cross-env NODE_ENV=production node dist/server.cjs` (`npm start`) |
| Vite in production | none — `vite` is imported dynamically and only when `NODE_ENV !== production`; runtime stage ships prod-dependencies only |

Host rebuild does **not** affect the running container: the container serves the
`dist/` baked into image `vn-stock-ai-pro:p25`, not a host mount.

---

## TESTS

| Item | Result |
|---|---|
| TypeScript (`npm run typecheck` → `tsc --noEmit`) | **PASS** (`TYPE_EXIT=0`, no diagnostics) |
| Vitest (`npx vitest run`) | **PASS** (`TEST_EXIT=0`) |
| Test files | **210 passed (210)** |
| Tests | **2409 passed (2409)** |
| Skips / failures / snapshot drift | none |
| Regression vs P25 baseline | **IDENTICAL — 210 / 2409, no decrease** |
| Duration | 56.31 s |

---

## CONTAINER

| Item | Value |
|---|---|
| Image | `vn-stock-ai-pro:p25` |
| Image ID | `sha256:13f48f5ec355acae43b763d5733c72a3e46b2a90c478f2b5649542afada15533` |
| Image created | 2026-10-06T12:35:13Z (not rebuilt) |
| Container name / ID | `vn-p25` / `35ccc360a7fd3f5a0caf7e729ccaf968fe3c9ef51d0c710b9e8dbfc2479c61d0` |
| **PID 1** | `node dist/server.cjs` (verified from `/proc/1/cmdline`) |
| Port | container `10000` ← host `0.0.0.0:10000` (only exposed port) |
| **NODE_ENV** | `production` |
| **User** | `app` (uid 100, non-root) |
| **Health** | `healthy` (probe: `GET /api/health`, 30 s / 5 s / 20 s start / 3 retries) |
| **Restart policy** | `unless-stopped` |
| Volumes / source mounts | none |
| RestartCount / OOMKilled | `0` / `false` |
| Hardening verdict | already satisfied → **no change made** |

Runtime filesystem contains only `dist/`, `node_modules` (prod deps) and
`package.json`. No `src/`, no `vite.config`, no `tsx`, no dev launcher.

---

## PUBLIC RUNTIME

    Public URL:
    https://windows-pc.tailbc6a27.ts.net/

Measured after the controlled restart (Phase I), identical results local ↔ public:

| Route | HTTP | Content-Type | Body |
|---|---|---|---|
| `/` | 200 | `text/html; charset=UTF-8` | SPA `index.html` (1608 B) |
| `/api/platform/healthz` | 200 | `application/json` | `{"status":"alive","checkedAt":…}` |
| `/api/health` | 200 | `application/json` | `{"status":"degraded","process":"PROCESS_OK","ready":true,…}` |
| `/api/trading/status` | 200 | `application/json` | `{"success":true,"data":{…"brokerMode":"PAPER","paperTradingOnly":true…}}` |
| `/api/macro/status` | 200 | `application/json` | `{"phase":"PHASE_19.1_MACRO_FOUNDATION","health":{…"status":"NO_DATA"…}}` |
| `/api/platform/readyz` | 200 | `application/json` | `{"status":"degraded","ready":true,…,"blockedBy":[]}` |
| `/watchlist` | 200 | `text/html` | SPA |
| `/market` | 200 | `text/html` | SPA |
| `/stocks/VNM` | 200 | `text/html` | SPA |
| `/portfolio` | 200 | `text/html` | SPA |
| `/no-such-page` | 200 | `text/html` | SPA fallback (client router owns unknown pages) |
| `/api/definitely-not-a-route` | **404** | `application/json` | `{"error":"NOT_FOUND"}` |
| `/api/ai/chat` (GET) | 404 | `application/json` | `{"error":"NOT_FOUND"}` — route is POST-only, correct |
| `/assets/vite-nope.js` (stale) | **404** | `text/plain` | `Not Found` — **not** HTML |
| `/assets/index-B2B9QiFk.js` | 200 | `application/javascript` | 1,169,296 B, byte-identical local vs public |
| `/assets/index-ClKofz4n.css` | 200 | `text/css` | 109,700 B |

Transport / integrity checks:

- No redirect loop (`num_redirects = 0` on every route)
- No connection refused, no timeout (all < 50 ms)
- HTTPS only, no mixed HTTP/HTTPS issue
- No stack trace in any client response
- No dev-server banner, no HMR socket, no Vite middleware
- Security headers present: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `Permissions-Policy`, `Content-Security-Policy`

---

## TAILSCALE

| Item | Value |
|---|---|
| Client | `1.102.4-t3caf7d9e7` (go1.26.6) |
| Node status | `windows-pc` `100.78.237.31` — **connected / online** |
| Funnel status | **Funnel on** |
| Public listener | `https://windows-pc.tailbc6a27.ts.net` (Funnel on) |
| Target | `/ -> proxy http://127.0.0.1:10000` |
| Path | Docker `0.0.0.0:10000` → `vn-p25` → `node dist/server.cjs` |
| Funnel auto-fix needed | none — configuration healthy, untouched |

No second tunnel provider, no second public architecture introduced.

---

## DATA TRUTH

**Audit method:** live public API sampling + source scan for fabrication patterns.

| Check | Result |
|---|---|
| Live quotes | `/api/market-data/quote/VNM` → `source:"VPS"`, `dataStatus:"OK"`, real OHLC/volume/foreign flow, `fetchedAt` real clock; cross-checked against KBS close with `deviationPercent:0` |
| History | `/api/market-data/history/VNM` → `dataStatus:"OK"`, `dataSource:"KBS"`, real dated candles |
| Fundamentals | `/api/market-data/fundamentals/VNM` → `source:"VPS"`, `statementUnit:"MILLION_VND"`, real quarterly series |
| Rankings | `/api/recommendations/rankings` → `dataSource:"KBS_VPS"`, `dataStatus:"OK"`; `expectedReturn`/`riskReward` are **`null`** when not derivable — not invented |
| Market intelligence | `dataFreshness:"CURRENT"` backed by real `sourceTimestamp`; regime `UNKNOWN` with `null` scores and warning `INSUFFICIENT_INDEX_DATA: Index candle history is under 20 bars` |
| Index level | `value:null`, `change:null`, `levelSource:"UNAVAILABLE"`, `levelProvenance:"NO_AUTHORITATIVE_INDEX_FEED…"` — rendered as `--`, never a fabricated level |
| Index `changePercent` | real arithmetic mean of constituent `changePercent` (constituent quotes are real), disclosed as a constituent aggregate — not presented as an official index print |
| Macro | `providerId:"empty-macro-provider"`, `status:"NO_DATA"`, honest Phase 19.1 baseline message |
| Freshness engine | `src/services/market/freshness/dataFreshness.ts:132` — the **only** path to `CURRENT` requires a real `sourceTimestamp` within TTL, after rejecting `FUTURE_SOURCE_TIMESTAMP → INVALID` and bad TTL → `UNAVAILABLE`. No request-time inference |
| `Math.random` in production paths | 12 hits, **all** order/transaction/audit **ID generation** in the paper broker; none touch prices, indicators, scores or recommendations |
| Hardcoded `CURRENT` | none — the single `status:'CURRENT'` literal is the derived return of the freshness function above |
| DB-backed routes when DB absent | `/api/stocks`, `/api/stocks/search`, `/api/stocks/:symbol`, `/api/signals` → **500 `application/json`** `{"error":"…"}`. Fail-closed: an error, **never** `0`, random, demo or mock values |
| RiskGuard / TradingEngine / PositionSizer | untouched — **zero source changes** in P26 |
| Trading state | `brokerMode:"PAPER"`, `isSimulation:true`, `paperTradingOnly:true`, `liveTradingEnabled:false` — truthful |

**Synthetic-data audit: PASS — no synthetic financial data served.**
**Fake-data audit: PASS — no fabricated prices, OHLC, volume, index levels, market cap,
foreign flow, fundamentals, P/E, P/B, DCF, FCF, macro, portfolio values, signals,
scores, AI recommendations or provider timestamps.**

`DATA_UNAVAILABLE` / `STALE` / `UNAVAILABLE` / `INVALID` semantics preserved.

---

## LOG / PROCESS AUDIT (PHASE E)

| Marker searched in `docker logs vn-p25` | Count |
|---|---|
| `[vite]` | 0 |
| `HMR` | 0 |
| `vite.config` | 0 |
| `npm run dev` / `development server` | 0 |
| `uncaughtException` / `unhandledRejection` / crash | 0 |
| `ECONNREFUSED` | present — **PostgreSQL only** (`pg-pool`), from DB-backed routes; optional dependency, correctly surfaced as `database: UNAVAILABLE` |
| Restart loop | **no** — `RestartCount=0`, `OOMKilled=false`, only one `die` event in 6 h with `exitCode=137` (SIGKILL from `docker stop`/desktop restart), not an app crash |

Expected runtime confirmed: **`node dist/server.cjs`**.

Logs were **not** suppressed; no log-level change was made.

---

## RESTART / RECOVERY (PHASE I)

Controlled `docker restart vn-p25` at 2026-10-07T13:27:54Z:

| Step | Result |
|---|---|
| 1. Container healthy | `Status=running`, `Health=healthy` within 12 s |
| 2. PID 1 correct | `PID1=node`, args `node dist/server.cjs`, user `app` |
| 3. Application responds | local `/` 200, all 5 health/API endpoints 200 |
| 4. Funnel still reaches it | `funnel status` unchanged: `/ -> proxy http://127.0.0.1:10000` |
| 5. Public endpoint recovers | all 9 probed routes 200/404-as-expected on `https://windows-pc.tailbc6a27.ts.net` |

Restart policy already `unless-stopped` → **no auto-fix needed**.
No application code changed for this test.

---

## PUBLIC / LOCAL PARITY (PHASE H)

Normalised comparison (timestamp fields stripped) of local `127.0.0.1:10000`
vs public `https://windows-pc.tailbc6a27.ts.net`:

| Endpoint | Parity |
|---|---|
| `/api/platform/healthz` | **IDENTICAL** |
| `/api/health` | **IDENTICAL** (`marketDataCache.size=69`, same provider states) |
| `/api/trading/status` | **IDENTICAL** (byte-equal even unnormalised) |
| `/api/macro/status` | **IDENTICAL** |
| `/assets/index-B2B9QiFk.js` | **byte-identical** (1,169,296 B) |

Recorded identity:

    container/image : vn-p25 / vn-stock-ai-pro:p25 (sha256:13f48f5ec355…)
    startup command : node dist/server.cjs
    public endpoint : https://windows-pc.tailbc6a27.ts.net/
    health result   : 200 / degraded-by-design / PROCESS_OK

The public endpoint terminates on the **same** container — it cannot point at a
dev server, Vite, a stale container or another source tree: Funnel proxies
`127.0.0.1:10000`, which is the published port of `vn-p25` and nothing else.

---

## AI STUDIO

    AI Studio DEV path is NOT production certification.

- The repo contains **no `applet/` directory**, therefore no
  `applet/src/middleware/auth.ts`.
- `npm run dev` (`tsx server.ts`, port 3000) is a **development-only** script
  and is not referenced by `Dockerfile`, the container CMD or any health check.
- No AI Studio launcher was executed during P26; no forced-dev error is being
  hidden, and no fake `auth.ts` was created.
- If Google AI Studio's development runtime ever reports
  `ERR_MODULE_NOT_FOUND …/app/applet/src/middleware/auth.ts`, it is classified as:

        AI_STUDIO_DEV_PATH_BLOCKED

  provided the production artifact stays healthy — which it does.

Production certification target, as executed:

    Docker → node dist/server.cjs → Tailscale Funnel → PUBLIC RUNTIME PASS

---

## BROWSER QA (PHASE O)

**PASS** — headless browser automation was available and used against the real
public URL `https://windows-pc.tailbc6a27.ts.net/`.

| Route | HTTP | Rendered | Console errors | Failed requests |
|---|---|---|---|---|
| `/` | 200 | 1106 body chars, nav + ribbon mounted | 0 | 0 |
| `/market` | 200 | rendered | 0 | 0 |
| `/watchlist` | 200 | heading `Danh Mục Theo Dõi Định Lượng (Quant Watchlist)` | 0 | 0 |
| `/stocks/VNM` | 200 | heading `Bàn làm việc thị trường`, 8496 chars | 0 | 0 |
| `/portfolio` | 200 | heading `Portfolio Analytics & Asset Allocation` | 0 | 0 |
| `/research/screener` | 200 | rendered | 0 | 0 |
| `/settings` | 200 | heading `Chức Năng Đang Phát Triển` | 0 | 0 |

- Page title correct on every route
- Navigation (Overview, Market, Market Map, Watchlist, Screener, AI Analysis PRO,
  Fundamentals, Macro, Learn, Paper Trading, Portfolio, Risk, Journal, Data
  Health, Settings) present and interactive
- `DATA_UNAVAILABLE` states observed truthfully on stock/portfolio views
- No stack trace, no `TypeError`/`ReferenceError` text in any page body
- Total across the run: **0 console errors, 0 failed network requests**

---

## PHASE K — AI STUDIO / PHASE L — AUTO-FIX LEDGER

Auto-fixes permitted by §14 and what was actually done:

| Candidate | Finding | Action |
|---|---|---|
| Restart policy | already `unless-stopped` | none |
| Port mapping | `0.0.0.0:10000 → 10000/tcp`, correct | none |
| Stale container | running `vn-stock-ai-pro:p25`, healthy | none |
| Stale Funnel config | Funnel on, correct target | none |
| Production env vars | `NODE_ENV=production`, no secrets | none |
| Health check | present and passing | none |
| Startup command | `node dist/server.cjs` | none |
| Container user | `app` (uid 100) non-root | none |
| Public routing | Funnel → 127.0.0.1:10000 → vn-p25 | none |

**Auto-fixes applied: 0.** Nothing in §14's forbidden list (financial formulas,
trading strategy, RiskGuard, PositionSizer, TradingEngine, provider selection or
truthfulness, portfolio/DCF calculations, AI decision logic) was touched.

---

## REGRESSION (PHASE N)

| Item | Result |
|---|---|
| Source changes | **0** (`git diff --stat` empty) |
| Test changes | **0** |
| Business-logic changes | **0** |
| Generated files | `dist/` rebuilt by the mandatory `npm run build`; git-ignored |
| Secrets / credentials / `.env` | untouched; no `.env` tracked, none committed |
| Worktree status | only the new P26 documents are untracked (this certification + `P26_ENVIRONMENT_AUDIT.md` + the P26 prompt file) — **documented, intentional** |
| Test count | 210 files / 2409 tests — unchanged |

---

## SUCCESS CRITERIA (§19)

- [x] Production image exists — `vn-stock-ai-pro:p25`
- [x] Production image runs — `vn-p25` up, healthy
- [x] PID 1 is `node dist/server.cjs`
- [x] `NODE_ENV=production`
- [x] Non-root runtime — `app` uid 100
- [x] No Vite/HMR in production — 0 markers
- [x] Local production runtime healthy
- [x] Public Tailscale Funnel healthy
- [x] Public `/` returns 200
- [x] Public health endpoint works
- [x] SPA routes work
- [x] API routes return correct JSON
- [x] Unknown API routes return JSON 404
- [x] No fake financial data
- [x] `DATA_UNAVAILABLE` remains truthful
- [x] RiskGuard remains protected (untouched)
- [x] TradingEngine remains protected (untouched)
- [x] TypeScript PASS
- [x] Vitest PASS
- [x] No unexpected test-count regression (210 / 2409)
- [x] No secret leakage
- [x] Restart recovery PASS
- [x] Public/local parity PASS
- [x] Browser QA PASS
- [x] Certification document created
- [x] Git worktree clean **or** changes documented — documented above

**24 / 24 applicable criteria met.**

---

## KNOWN LIMITATIONS (OUT OF P26 SCOPE — PRE-EXISTING)

1. **No production PostgreSQL.** `database` dependency probe is
   `UNAVAILABLE (optional: true)`. Routes `/api/stocks`,
   `/api/stocks/search`, `/api/stocks/:symbol` and `/api/signals` return
   `500 application/json` with a truthful error message. Fixing this would
   require introducing a database, which §0 explicitly forbids in this phase.
2. **No authoritative index-level feed.** Index levels render as `--`
   (`value:null`, `levelSource:"UNAVAILABLE"`) with full provenance disclosure;
   the displayed percentage is a real constituent aggregate.
3. `/api/health` reports `status:"degraded"` by design while optional
   dependencies are absent, while still answering HTTP 200 so an optional outage
   cannot cause a restart loop.

None of these are P26 regressions; none involves fabricated data.

---

    ============================================================
    VN-STOCK-AI-PRO — P26 CERTIFICATION
    ============================================================

    STATUS:
    PUBLIC RUNTIME PASS

    BUILD:
    PASS

    TYPESCRIPT:
    PASS

    TESTS:
    PASS — 210 files / 2409 tests

    PRODUCTION:
    node dist/server.cjs

    CONTAINER:
    vn-stock-ai-pro:p25 (sha256:13f48f5ec355…) / vn-p25
    PID1=node dist/server.cjs  USER=app(uid 100)  NODE_ENV=production
    HEALTH=healthy  RESTART=unless-stopped

    TAILSCALE:
    CONNECTED (100.78.237.31 windows-pc, 1.102.4)
    FUNNEL=PASS -> http://127.0.0.1:10000

    PUBLIC:
    https://windows-pc.tailbc6a27.ts.net/

    HEALTH:
    PASS

    DATA TRUTH:
    PASS — no synthetic financial data

    AI STUDIO:
    DEV PATH NOT USED FOR PRODUCTION CERTIFICATION

    BROWSER QA:
    PASS

    REGRESSION:
    PASS (0 source changes, 210/2409 unchanged)

    GIT:
    DOCUMENTED CHANGES (2 new docs: P26_ENVIRONMENT_AUDIT.md + this file; no source/test/secret changes)

    CERTIFICATION:
    docs/P26_TAILSCALE_PUBLIC_RUNTIME_CERTIFICATION.md

    ============================================================
    FINAL STATUS: PUBLIC RUNTIME PASS
    ============================================================
