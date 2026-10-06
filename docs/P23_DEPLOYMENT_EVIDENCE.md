# P23 DEPLOYMENT EVIDENCE

**Mission:** DEPLOYMENT RECOVERY → AUTO-FIX → SINGLE SERVER DEPLOY → PUBLIC RUNTIME PASS
**Repository:** VN-STOCK-AI-PRO
**Verdict:** `P23 SINGLE-SERVER PUBLIC RUNTIME — BLOCKED` (see §5 — external blocker, no fabricated PASS)

Every result below was produced by an actual command in this session. Nothing is
projected, simulated, or claimed from inspection alone. No secret value appears in this
document.

---

## 1. ENVIRONMENT

| Item | Value |
|---|---|
| Date/time of evidence run | 2026-10-05 22:15Z → 2026-10-06 00:20Z (UTC) |
| Git HEAD at evidence time | `925df56 update` (+ uncommitted P23 fixes, §6) |
| Node (local) | v24.12.0 |
| Node (production image) | node:22-alpine (Docker `node:22-alpine`, Linux) |
| npm (local) | 11.6.2 |
| npm (in image) | 10.9.9 |
| Package manager | npm. `bun.lock` exists but `bun` is **not installed** and is not used by any script → classified DEAD (§4). |
| Platform | win32 / Git Bash. Container verification on linux/amd64. |

**Mid-task repository movement (disclosed):** commit `925df56` landed at
`2026-10-05T22:22:07Z`, while this session was already running. It modified
`RiskGuard.ts`, `RiskManager.ts`, `PositionSizer.ts`, `PaperOrderRiskBoundary.ts`,
`types/risk.ts`, `createPlatformRouter.ts` and `business06.e2e.test.ts`. All earlier
readings of those files were therefore stale and were re-verified against the new HEAD;
the risk-control findings in §4 were re-tested after that commit.

---

## 2. BUILD / TYPECHECK / TESTS — REGRESSION GATE

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** — `tsc --noEmit`, 0 errors (exit 0) |
| Build | `npm run build` | **PASS** — exit 0 |
| Frontend bundle | `vite build` | **PASS** — 1945 modules; `index-B7IFe-f4.js` 1,168.61 kB (313.52 kB gzip), `index-CBJ4EAnj.css` 119.78 kB (18.29 kB gzip) |
| Server bundle | `esbuild … --outfile=dist/server.cjs` | **PASS** — 860.5 kB + sourcemap |
| Tests | `npm test` | **PASS** — **2409 / 2409**, 210 / 210 files |

### 2.1 Pre-existing test failures found and their disposition

At the start of the session (HEAD `b0ae4d4`) the suite was **2401 / 2406** with 5 failures,
all in `src/test/business06.e2e.test.ts` (BUSINESS-06 billing e2e). These were **not**
caused by P23 and **not** worked around: no test was deleted, skipped, or weakened. They
were fixed upstream by commit `925df56` (+40 lines to that file), after which the suite is
fully green.

### 2.2 One flaky test characterised, not hidden

`src/test/reachabilityGate.test.ts > P1-01` failed once mid-session with
`Test timed out in 5000ms` (it took 5.3 s while 4 background servers, a Postgres container
and Docker Desktop were competing for CPU). It passes 49/49 in isolation (17 s) and passes
in the full suite at normal load. Root cause is the 5 s default timeout sitting ~6 % above
the test's real duration under load — a **pre-existing** timing margin, not a regression
from any P23 change. The timeout was NOT raised, because raising it to make a test pass is
exactly the gate-weakening §24 prohibits without evidence it is irrelevant to deployment.

---

## 3. FIXES APPLIED (auto-fix, each verified)

All patches are minimal and additive. Nothing was rewritten, and no financial validation,
risk control, provider or test was weakened.

| # | File | Defect found (with evidence) | Fix | Verification |
|---|---|---|---|---|
| F1 | `server.ts` (`/api/health`) | Health answered a hardcoded `status:'ok'` while the database was unusable — a false green a load balancer would route to (§8 G). | Top-level `status`/`ready` now derived from the existing `runHealthCheck` + `statusCodeFor` already used by `/api/readyz`; added `process:'PROCESS_OK'` and observed provider state. Reuses existing platform machinery, adds none. | Before: `{"status":"ok"}` with `database:DATABASE_CONFIGURATION_REQUIRED`. After: `{"status":"degraded","process":"PROCESS_OK","ready":true,…}`; `dependencyProbes` enumerated. |
| F2 | `server.ts` (static/SPA) | `app.get('*')` swallowed everything: a **missing asset** and an **unknown `/api` path both returned index.html with HTTP 200**. | `/api` → JSON 404; `/assets` → 404 text; SPA fallback registered last. | Before: `/assets/does-not-exist.js` → 200 HTML (1608 B); `/api/nonexistent` → 200 HTML. After: 404 `text/plain`; 404 `application/json {"error":"NOT_FOUND"}`. SPA routes `/ /research /trading /portfolio /replay /billing` still 200 `text/html`. |
| F3 | `server.ts` (`httpServer.listen`) | Bind failure was an **unhandled `'error'` event** — stack trace, ambiguous exit status. | `httpServer.on('error')` → single actionable line, `process.exitCode = 1`. | `PORT=3111` (busy): now prints `FATAL: cannot bind 127.0.0.1:3111 — address already in use.` and exits **1** (was an unhandled throw). |
| F4 | `src/db/index.ts` | Pool had **no `port`** → always dialled 5432. A managed/sidecar Postgres on any other port failed with `ECONNREFUSED`. | `SQL_PORT` support, default unchanged. | Against Postgres on 55432: `{"error":…}` 500 `ECONNREFUSED` before → `/api/stocks` 200 after. |
| F5 | `src/db/index.ts` | Pool had **no `ssl` option at all** → always plaintext; a TLS-only managed DB or Cloud SQL public endpoint fails. | Opt-in `SQL_SSL`, plus `SQL_SSL_REJECT_UNAUTHORIZED`. Off by default → existing plaintext deployments byte-for-byte unchanged. | Typecheck+build clean; default path unchanged (verified by tests). |
| F6 | `src/db/bootstrapEnv.ts` (new) + `server.ts` | **Root cause of the DB outage.** ES imports are evaluated *before* any statement in `server.ts`, so `dotenv.config()` inside `startServer()` ran *after* the eager `createPool()` at `src/db/index.ts` module scope. The pool captured `undefined` for every `SQL_*` value and dialled its own defaults. Platform-injected env (Cloud Run/AI Studio/Render) masked it; any local or CI `.env` failed silently. | Side-effect module imported first in `server.ts`, so dotenv is the first evaluated dependency. Pool construction semantics unchanged. | `ECONNREFUSED` on all DB routes before → `/api/stocks` 200, `/api/stocks/HPG` 200, `/api/stocks/HPG/daily` 200 after. |
| F7 | `src/scripts/import-hpg-kbs.ts` | Identical latent bug to F6 in the importer. | Same bootstrap import. | Importer went from `BLOCKER: PostgreSQL is not reachable` → `=== IMPORT COMPLETE ===`, exit 0. |
| F8 | `drizzle.config.ts` | Same missing-`port` bug; migrations could not connect. | `SQL_PORT` support. | `drizzle-kit push` exit 1 (`ECONNREFUSED`) → exit 0, **42 tables** created. |
| F9 | `package-lock.json` | **Lockfile out of sync with `package.json`** → `npm ci`, the reproducible-deploy standard, failed outright (`Missing: @opentelemetry/api@1.9.1`). Lockfile had been generated on Windows and lacked Linux/Alpine platform entries. | Regenerated `--package-lock-only --include=optional` **inside** `node:22-alpine`. Diff is **+78 / −17**: additions are nested `optional`/`dev` platform packages under `@tailwindcss/oxide-wasm32-wasi`; deletions are only `"peer": true` metadata and the F10 engines line. **No package was downgraded or removed.** | `docker build` exit 1 → exit 0. |
| F10 | `package.json` | `engines.node: ">=20.19.0"` contradicted the actual tree: `vitest@5.0.1` requires `^22.12.0 \|\| ^24 \|\| >=26`. A Node 20 base image emitted `EBADENGINE`. | `engines.node: ">=22.12.0"`; Dockerfile base → `node:22-alpine`. | Image builds and runs on Node 22 with no engine warnings. |
| F11 | `Dockerfile`, `render.yaml`, `.dockerignore` (new) | **No deployment configuration existed at all** — zero tracked Dockerfile/compose/render.yaml/railway.json/fly.toml/vercel.json/netlify.toml/Procfile, and no `.github` CI. | Single-stage-per-concern multi-stage Dockerfile (deps → build → runtime, prod-only deps, non-root, `HEALTHCHECK`), Render blueprint, `.dockerignore`. | `docker build` **exit 0**; container reports **healthy**; image verified free of `.env`, credentials and `.git` (§7). |
| F12 | `.env.example` | New runtime vars undocumented. | `SQL_PORT`, `SQL_SSL`, `SQL_SSL_REJECT_UNAUTHORIZED` documented with defaults and rationale. | — |

---

## 4. MARKET DATA & TRADING SAFETY (real, no synthetic)

### 4.1 Real provider egress — verified from BOTH host and inside the container

| Check | Result |
|---|---|
| KBS `kbbuddywts.kbsec.com.vn` | HTTP **200** |
| VPS `bgapidatafeed.vps.com.vn` | HTTP **200** (~850 B) |
| Provider credentials required | **None** — no API key, no auth header, bare `fetch` |
| `GET /api/market-data/quote/HPG` | `dataStatus:OK`, `source:VPS`, `lastPrice:20500`, `openPrice:20400`, `ceilingPrice:21450`, `floorPrice:18650`, `changePercent:2.24`, `matchedVolumeShares:31964600`, foreign buy/sell values populated |
| ↳ cross-check | `{"benchmarkSource":"KBS","kbsDate":"2026-10-05","kbsClose":20500,"deviationPercent":0,"status":"OK"}` — **0 % deviation**, independent confirmation |
| `GET /api/market-data/history/HPG?timeframe=1M` | `dataStatus:OK`, `dataSource:KBS`, real daily candles from `2026-07-22` |
| `GET /api/analysis/FPT` | Real KBS 1-year chain → `score:36.3`, `signal:SELL`, `rsi14:35.62`, `sma200:71393.57` |
| Freshness | KBS latest bar `2026-10-05` = today. No stale substitution. |

### 4.2 Fail-closed behaviour — verified, not assumed

| Case | Observed response |
|---|---|
| Invalid symbol `ZZZZINVALID9` | `{"dataStatus":"DATA_UNAVAILABLE","dataSource":"VPS","error":"VPS_QUOTE_FAILED — VpsApiError: VPS quote list is empty for ZZZZINVALID9"}` |
| Malformed symbol `!!bad` | HTTP **400** |
| Unsupported intraday timeframe `1D` | `DATA_UNAVAILABLE … "synthetic candles are disabled."` |
| **VPS returns `lastPrice:0`** (session rolled over, no trades outside market hours) | `DATA_UNAVAILABLE … "VPS quote has no usable lastPrice for HPG"`. Raw payload still carried `closePrice:"20500.0"` and reference `r:20.5` — **the app refused to substitute either.** Substituting a previous close as "current" would be a fabricated price. |

Root cause of the intermittency: VPS emits `"lastPrice":0, "lastVolume":0, "sequence":0`
between sessions while `closePrice`/`r` remain populated. The refusal is correct
behaviour, not a defect.

### 4.3 Trading safety chain — the Phase J hard requirement

Chain: `POST /api/trading/order` → `TradingApiRouter.validateTradingOrder` →
`PaperOrderRiskBoundary.submit()` → **RiskGuard** → **RiskManager** → **PositionSizer** →
`OrderManager.submitOrder` → **PaperBroker**. The boundary is the **only** HTTP→broker
path; `PaperOrderRiskBoundary.ts:443` is the sole submission site, and
`reachabilityGate.test.ts` (`P1-01: the trading boundary is the only HTTP path to the
broker`) enforces it as a source-level gate and passes.

Live traces (`riskTrace.gates` is the server's own record of which gates ran):

| Order | Result | Gates |
|---|---|---|
| `quantity:57` | `INVALID_QUANTITY` | edge validation, pre-risk |
| `side:"HODL"` | `INVALID_ORDER` | edge validation, pre-risk |
| BUY, no stop/target | `RISK_PARAMETERS_REQUIRED` — "The system never synthesizes protective levels" | `riskGuard:false` — rejected before any sizing |
| BUY with stop 18000 / target 26000 | `MARKET_CLOSED` | `riskGuard:true, riskManager:true, positionSizer:false, paperBroker:false` — notes: `MARKET_DATA_OK: source=VPS … crossCheck=OK` → `RISKGUARD_AUTHORIZED` → `RISKMANAGER_BLOCKED: MARKET_CLOSED` |
| SELL 100, no position | `INSUFFICIENT_POSITION` — "Quy định TTCK VN: Nghiêm cấp bán khống" | `riskGuard:true, riskManager:false, paperBroker:false` — `SHORT_SELL_BLOCKED: available=0` |
| Any order while VPS unavailable | `DATA_UNAVAILABLE` — *"Lệnh giao dịch thất bại có chủ đích (Fail-closed)"* | **all gates false, `paperBroker:false`** — broker never reached |

`GET /api/trading/status` → `brokerMode:"PAPER"`, `isSimulation:true`,
`paperTradingOnly:true`, `liveTradingEnabled:false`. The only `BrokerAdapter`
implementation is `PaperBroker` with `isSimulation` hardcoded `true`
(`PaperBroker.ts:46`); no live broker, order-entry SDK or broker credential exists in the
repo. `PaperBroker.submitOrderSync` independently re-enforces emergency stop, trading
enabled, board lot, VN session, ceiling/floor, cash and no-short-sell.

**Conclusion: no production trading route bypasses RiskGuard / RiskManager / TradingEngine.**

### 4.4 Browser-confirmed integrity (real render, §17 B)

A real headless browser against the container reported **0 console errors and 0 failed
requests**. The stock-detail page rendered:

```
NGUỒN DỮ LIỆU THẬT
Lịch sử:KBS ✓   Realtime:VPS ✕   BCTC:VPS ✓
GIÁ REALTIME  ✕ VPS không khả dụng
Không hiển thị giá giả. Lý do: VPS_QUOTE_FAILED — VpsApiError: VPS quote has no usable lastPrice for HPG
Lịch sử giá & phân tích kỹchuyên vẫn dùng dữ liệu thật từ KBS.
```

("No fake price is displayed. Reason: VPS_QUOTE_FAILED".) The Data-Health page rendered
policy tiles `ZERO MOCK` and `FAIL CLOSED` ("reject fake data on disconnect") with a real
measured HTTP ping of **88 ms** across 6 feeds, and the Paper-Trading page rendered
`Execution mode: PAPER · no live broker path is introduced by this workspace` plus
"Lệnh được kiểm tra rủi ro và xác thực bởi TradingEngine phía server".

---

## 5. BLOCKER — WHY THIS IS **BLOCKED**, NOT PASS

§29 lists `missing real credential`, `account permission` and `hosting/infra restriction`
as genuine blockers, and forbids converting BLOCKED into PASS. Two of the sixteen §28 PASS
conditions cannot be executed here, and neither may be faked:

1. **No public deployment target.** There is no hosting account, credential, API token or
   CLI for any provider: `render`, `railway`, `fly`, `vercel`, `netlify`, `gh`, `heroku` and
   `gcloud` are all **absent** from `PATH`; there is no `~/.netrc`; the repo has no remote
   credentials; `.github/` (CI) does not exist. Outbound HTTPS works (GitHub, KBS and VPS
   all reachable), so this is an **authorisation** limit, not a network limit.
2. **No production PostgreSQL instance and no credentials for one.** No `DATABASE_URL` or
   `SQL_*` value exists anywhere in the repo or environment. A managed instance cannot be
   provisioned without an account.

Everything up to and including the production container is therefore verified for real,
locally. **The public-URL steps (§16, §17 A/C on a public host, §18 on a public host) were
not executed and are not claimed.** A `render.yaml` and a verified `Dockerfile` are
supplied and the image is proven to build, run and serve — but no public URL exists.

**Exact next action to reach PASS** (≈10 minutes of human work, then no further code):

1. Create a Render account and a Render PostgreSQL instance.
2. `render blueprint launch` (or add the service manually) — `render.yaml` declares one
   web service plus the `SQL_*` / `GEMINI_API_KEY` / `FIREBASE_*` variables.
   Alternatively `docker push` the verified image and run it on any single host.
3. Set `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` (add `SQL_SSL=true`
   if Render requires TLS) in the Render dashboard.
4. Create the schema on the new database:
   `npx drizzle-kit push --force` (validated in this session: exit 0, 42 tables).
5. Optionally seed real history: `npx tsx src/scripts/import-hpg-kbs.ts` (validated: 411
   real KBS bars, 0 duplicates, 0 invalid OHLC).
6. Re-run the §17 matrix against the resulting `https://<service>.onrender.com`.

No code change is expected to be required for steps 1–6; the container in this session
already runs the exact artifact that would be deployed.

---

## 6. UNCOMMITTED WORKING-TREE CHANGES (this session)

`package.json`, `package-lock.json`, `server.ts`, `src/db/index.ts`,
`src/db/bootstrapEnv.ts` (new), `src/scripts/import-hpg-kbs.ts`, `drizzle.config.ts`,
`.env.example`, `Dockerfile` (new), `render.yaml` (new), `.dockerignore` (new).
**Nothing was committed** — committing was not requested.

`.env` was created locally for verification. It is gitignored, contains only throwaway
credentials for the local `p23-postgres` container, and was confirmed **absent** from the
built image.

---

## 7. SECURITY MINIMUM (§20)

| Check | Result |
|---|---|
| Secret committed | **No.** `git ls-files` shows only `.env.example`; no `.env`, no `firebase-applet-config.json` (only `.example.json`). |
| Repo-wide scan (`password=`, `api_key=`, `secret=`, `token=`, `private_key`) | Only env-var *reads* (`paymentProvider.ts`, `webhookPipeline.ts`, `repoGuards.ts`), empty `.env.example` placeholders, and test fixtures. No literal secret value. |
| `DATABASE_URL` exposed to frontend | **No.** No `DATABASE_URL` exists in the codebase; the pool reads server-only `SQL_*` vars. |
| Secret in a `VITE_*` var | **No.** `VITE_FIREBASE_*` reads are the public Firebase *web* config only (`src/lib/firebase.ts:29-35`). |
| Image hygiene | No `.env`, no credential string, no `.git` history in the built image. |
| Production error leakage | `sendSafeError` (added upstream in `925df56`) replaces `error.message` with a public message; `/api/ai/chat` only includes `dev: error.message` when `NODE_ENV !== 'production'`. Verified: DB-down route returned the generic `Lỗi khi tải danh sách cổ phiếu`, and the real driver text appeared only in server logs. |
| SQL injection | Unchanged — all queries go through Drizzle parameterised builders. The logged failure showed bound params (`['ACTIVE',30]`), not interpolation. |
| Trading endpoint protection | **Known gap, pre-existing and deliberately acknowledged:** `/api/trading` is mounted with **no** `requireAuth` and no authorisation (`reachabilityRegistry.ts:100-101` records `authentication:'NONE', authorization:'NONE'`, "P2"). Paper-only, so no real money is at risk, but any network-reachable caller can place paper orders and drain the simulated account. Not introduced or worsened by P23; **must be fixed before any public exposure.** |
| CORS | No CORS middleware is configured. Justified: one origin serves both the SPA and the API, so no cross-origin surface exists. Must be revisited if a separate frontend host is ever added. |

---

## 8. DATABASE (§9)

| Step | Result |
|---|---|
| Driver | `pg` + `drizzle-orm/node-postgres`, memoized pool on `global._postgresPool`, `max:10`, `connectionTimeoutMillis:15000` |
| Runtime variables | `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` (+ new `SQL_PORT`, `SQL_SSL`) |
| Migration variables | `SQL_HOST`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` — a **different credential pair** from runtime |
| Boot behaviour | The pool is constructed eagerly at module scope but connects lazily, so the process boots without a database and degrades honestly instead of crash-looping |
| Schema | `drizzle-kit push --force` → exit 0, **42 tables** in `public` |
| Real data | `src/scripts/import-hpg-kbs.ts` → **411 real KBS bars**, `2025-01-02 … 2026-08-28`, duplicates 0, null-OHLC 0, invalid-OHLC 0 |
| Real query through the app | `GET /api/stocks/HPG` → `{"id":1,"symbol":"HPG","companyName":"Tập đoàn Hòa Phát","exchange":"HOSE","sector":"Thép"}`; `GET /api/stocks/HPG/daily?limit=1` → real OHLCV; `GET /api/stocks/HPG/technical-analysis` → `score:81.3` with MA/RSI breakdown |
| Destructive actions | **None.** All DDL was `CREATE TABLE IF NOT EXISTS` against a brand-new empty container. No production table was dropped, no database reset, no user data destroyed. |
| Recovery gap (pre-existing) | `drizzle/` has **no `meta/_journal.json`**, so `drizzle-kit migrate` cannot run; migrations are hand-numbered, and the 21 base tables are not in `drizzle/` at all. `drizzle-kit push` is therefore the only in-repo mechanism that can build a fresh database. Worth fixing before the first production migration is ever needed. |

---

## 9. GOLDEN PATH (§18) — real browser, real container

`http://127.0.0.1:38080` (the container). Every step drove the app's real navigation
(`#nav-item-<view>`) or a real deep link. **0 console errors, 0 failed requests.**

| Step | Rendered chars | Result |
|---|---|---|
| 1 dashboard landing | 746 | mounts, disclaimer + version chrome |
| 2 market index | 3436 | 4 indices, `ĐÓNG CỬA` state, breadth ▲0/■63/▼0 |
| 3 screener | 1939 | real filter UI, 10 results |
| 4 stock search `HPG` | 2402 | typed into the real search box |
| 5 stock detail `/stock/HPG` | 2683 | KBS ✓ / VPS ✕ / BCTC ✓, `NẮM GIỮ`, AI Score 50/100 |
| 6 fundamentals | 1783 | page renders (content gated behind its own phase notice) |
| 7 AI analysis | 3049 | renders trend read |
| 8 risk | 2091 | `4/4 QUY TẮC ĐẠT CHUẨN`, `RiskGuard`, VaR, concentration 0 %/25 % |
| 9 paper trading | 1328 | 100.00 tr VND paper account, `PAPER`, order form |
| 10 portfolio | 1687 | NAV, `ALL CASH`, `RiskGuard: BẬT`, sector split `DATA_UNAVAILABLE` |
| 11 data health | 2391 | 88 ms ping, 6/6 feeds, `ZERO MOCK` / `FAIL CLOSED` |
| 12 watchlist | 2415 | 6 symbols, live VPS/KBS feed header |
| 13 arbitrary deep link `/research` | 8139 | **HTTP 200, not a server 404** — SPA fallback correct |

Nested-route refresh (§17 C) verified: direct loads of `/stock/HPG` and `/research` both
return 200 and mount.

---

## 10. PERFORMANCE BASELINE (§19)

| Metric | Observed |
|---|---|
| Cold start (container, healthy) | ~20 s to first healthy check |
| Frontend bundle | 1,168.61 kB raw / **313.52 kB gzip** (single JS chunk, no code splitting) |
| CSS | 119.78 kB raw / 18.29 kB gzip |
| Measured provider HTTP latency (Data-Health tile) | **88 ms** average |
| KBS history (`1M`) through the container | ~1–2 s incl. cross-source verification |
| No code splitting | The 313 kB gzip single chunk is the one obvious production blocker worth addressing *after* the app is proven to work. §19 explicitly defers optimisation ahead of proving correctness, so this is recorded, not acted on. |

---

## 11. INFRA CLASSIFICATION (§22)

Nothing was deleted. Deferred infrastructure was left in place.

| Component | State | Note |
|---|---|---|
| Express + React/Vite single process | **ACTIVE** | The deployed artifact |
| PostgreSQL + Drizzle | **REQUIRED FOR CURRENT SINGLE SERVER** | 42 tables; now actually reachable (F4/F6/F8) |
| KBS + VPS providers | **ACTIVE** | No credentials; real data confirmed |
| `Dockerfile`, `render.yaml`, `.dockerignore` | **ACTIVE (new)** | Image builds, runs, healthy |
| `drizzle/` migrations 0000–0013 | **DEFERRED** | Unusable via `migrate` (no journal); `push` works |
| Firebase Admin / Firebase client | **OPTIONAL** | No credential. `/api/users/me` answers 401 `AUTH_CONFIGURATION_REQUIRED` — access denied, never bypassed. |
| Gemini AI Copilot | **OPTIONAL** | No key; `/api/ai/chat` fails honestly, marked `advisoryOnly` |
| `assertStartupReady` (`src/lib/platform/config/env.ts:116`) | **DEFERRED** | Hard-fails production boot when `SQL_*`/`GEMINI_API_KEY` are missing. Intentionally **not** wired, because it would prevent the truthful degraded boot that §8 G requires. No caller exists — grep-confirmed. |
| `bun.lock` | **UNUSED** | `bun` not installed; no script uses it |
| `src/db/seed.ts` → `src/data/mock/marketData.ts` | **UNUSED** | Grep-confirmed **zero importers** — mock fixtures cannot reach production |
| `src/lib/trading/replay/ReplayEngine.ts`, `PaperExecutionEngine.ts` | **UNUSED (from HTTP)** | Reachable only through `trading/replay/index.ts`, which nothing imports. Carries its own sandbox broker, so it cannot touch the server broker. Left in place per §22. |
| Kubernetes / Terraform / Helm / queues / Redis / workers / cron | **DEFERRED** | None exists in the repo; none was introduced |
| Prometheus / Grafana / OTel / ELK / tracing | **DEFERRED** | `/api/platform/metrics` already exposes a Prometheus text endpoint; no alerting added |
| CI/CD (`.github/`) | **UNUSED** | Does not exist; not introduced (§14 forbids complex CI/CD for this phase) |

---

## 12. GOOGLE AI STUDIO COMPATIBILITY (§23)

| Check | Result |
|---|---|
| Dev entrypoint | `DISABLE_HMR=true npx tsx server.ts` → boots, `VN STOCK AI Server running on http://127.0.0.1:3777` |
| Vite middleware | `appType:'spa'`, dynamic `import('vite')` only when `NODE_ENV !== 'production'`, so pruned devDependencies cannot break the production server |
| Port | `PORT` from env, default 3000, never hardcoded; `HOST` defaults `0.0.0.0` |
| `/api/health` in dev | Works, returns the same truthful body |
| Filesystem | Static serving uses `process.cwd()/dist`; single-container, no external volume |
| Degradation | No Firebase/Gemini/DB credential is required to boot; each degrades to an explicit state |
| Not made dependent on production infra | Correct — Google AI Studio runs the dev path, which needs none of the deploy-only additions |
| `dist/assets/aistudio/.gitignore` | Present, honoured |

---

## 13. KNOWN LIMITATIONS (disclosed, not fixed)

1. **`/api/trading` is unauthenticated** (§7). Pre-existing P2 debt. Safe now (paper-only),
   but it must be closed before public exposure.
2. **Hardcoded analysis constants presented as computed scores.**
   `src/services/market/RealMarketDataProvider.ts:760,763,766` — `trendScore` is one of three
   hardcoded literals (`72 / 38 / 55`) selected by the real advance/decline ratio, and is
   rendered as "TREND SCORE 38/100" with a confidence figure; `:547` sets `aiScore: 60`
   for off-universe tickers and `:549` sets `sparkline: [price, price]` (a degenerate
   2-point flat line), both flagged `isDemo:false`. Also `:726-731`
   (`confidence = min(95, aiScore + 5)`) and `:737-741` (three fixed Vietnamese catalyst
   strings rendered per stock). The inputs are real, and target/stop/upside/R:R are
   correctly `null`, but these particular *numbers and strings* are not computed per
   security. **Not patched**: rewriting the scoring model is an analysis-domain change
   outside a deployment mission (§0.1, §24), and inventing a replacement score would be
   fabrication. Flagged for a dedicated data-integrity phase. This is why the §28 gate
   "No fake/mock/synthetic production data" cannot be claimed unconditionally.
3. **Stale "DEMO DATA" labels and a contradictory footer disclaimer.** The footer still
   asserts that *all* figures are `DỮ LIỆU MÔ PHỎNG (DEMO DATA)`, and several panels keep
   `DEMO DATA` badges, while the same build serves real KBS/VPS data and the provider sets
   `isDemo:false`. Misleading in the safe direction, but inaccurate. Left alone because
   relabelling touches product copy, not deployment.
4. **Version inconsistency**: header renders `v2.5`, footer renders `v1.0.0 (Phase 1
   Foundation)`.
5. **`Fundamentals` view is content-gated** behind its own "planned for Phase 4" notice —
   deliberate in the app, so the golden path step renders the shell.
6. **`drizzle/` cannot `migrate`** (§8).
7. **VPS realtime quote is unavailable between sessions** (`lastPrice:0`) — vendor
   behaviour, handled fail-closed.
8. **Full stock fundamental ratios are absent** from the seeded DB (`listedShares`,
   `outstandingShares`, `eps`, `bvps`, `pe`, `pb`, `roe` are `null`), so fundamental,
   valuation and money-flow scores cannot be computed and correctly return
   `DATA_UNAVAILABLE` / `null` rather than inventing ratios. Populating them is a data
   task, not a code task.
9. **`P1-01` timeout margin** (§2.2).
10. **Bundle not code-split** (§10).

---

## 14. CERTIFICATION MATRIX (§27)

| Gate | Status | Evidence |
|---|---|---|
| Repository audit | **PASS** | §1, §11; 0 deployment configs existed pre-fix |
| Dependency recovery | **PASS** | F9 lockfile resync, F10 engines; `npm ci` exit 0 |
| ENV audit | **PASS** | F4/F5/F12; §1, §11 |
| Build | **PASS** | `npm run build` exit 0 |
| Typecheck | **PASS** | `npm run typecheck` exit 0, 0 errors |
| Tests | **PASS** | 2409/2409, 210/210 |
| Local runtime | **PASS** | prod + dev both boot; §3 F3/F6 |
| Database | **PASS (local, real PG)** | 42 tables, 411 real bars, real queries §8 |
| Market data | **PASS** | real KBS/VPS, 0 % cross-check deviation §4.1 |
| Frontend | **PASS** | bundle serves, 0 console errors §4.4, §9 |
| API | **PASS** | health, stocks, market-data, analysis, trading, research, risk §4, §9 |
| Risk chain | **PASS** | §4.3 — RiskGuard → RiskManager → PositionSizer → PaperBroker, fail-closed, broker never bypassed |
| Single-server deploy | **PASS (artifact)** | Docker image builds, runs, **healthy**; `render.yaml` supplied. Not *executed* publicly. |
| Public URL | **BLOCKED** | No hosting account/credential/CLI (§5) |
| Public health | **BLOCKED** | Same |
| Public frontend | **BLOCKED** | Same |
| Public API | **BLOCKED** | Same |
| Golden path | **PASS (local container)** | 13 real browser steps, §9 |
| Regression | **PASS** | Re-run after every fix; 2409/2409 |
| Google AI Studio | **PASS** | §12 |
| No fake production data | **QUALIFIED** | Providers/fail-closed clean (§4.2, §4.4); but hardcoded `aiScore`/`trendScore`/`sparkline`/catalysts remain — §13.2 |
| No critical secret exposure | **PASS** | §7 |

---

## 15. FINAL

```
P23 SINGLE-SERVER PUBLIC RUNTIME — BLOCKED
```

**Exact blocker:** no public hosting account/credential and no production PostgreSQL
instance or credential. Both are external authorisation requirements under §29 and
neither can be satisfied or simulated from this environment.

**What was already fixed (12 patches, all verified):** false-green health endpoint;
SPA fallback swallowing assets and API 404s; unhandled bind crash; missing `SQL_PORT` and
missing TLS support on the pool; the env-before-pool bootstrap ordering bug that made every
local/CI database connection fail; the same bug in the data importer; the drizzle-kit port
bug; an out-of-sync `package-lock.json` that broke `npm ci`; a wrong `engines.node`; and the
complete absence of deployment configuration. Post-fix state: typecheck clean, build clean,
**2409/2409 tests**, a healthy production container on Node 22, a real PostgreSQL with 42
tables and 411 genuine KBS bars, real KBS/VPS market data cross-verified at 0 % deviation,
and a fail-closed risk chain with no broker bypass.

**What remains:** steps 1–6 of §5 — create the Render account + database, set the `SQL_*`
variables, run `drizzle-kit push`, optionally seed real history, then re-run the §17 matrix
against the public URL. No further code change is expected.

**This BLOCKED is not converted into a PASS, and no deployment, credential, health result,
screenshot or test result in this document was fabricated.**
