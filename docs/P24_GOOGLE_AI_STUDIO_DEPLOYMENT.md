# P24 — GOOGLE AI STUDIO DEPLOYMENT EVIDENCE

Forensic deployment audit → complexity measurement → targeted fixes → Linux
container build → container runtime → golden path → regression.

Verification host: Windows dev machine, **Node v24.12.0**, npm 11.6.2,
Docker Engine 29.1.3 (`node:22-alpine` images, Node 22.23.3 inside).

**No secrets appear in this document.**

---

## 1. VERDICT

```text
P24 GOOGLE AI STUDIO PUBLISH — BLOCKED
```

Everything up to and including *a real Linux container build, real container run,
and the full golden path inside that container* is **PASS and was executed**. The
two remaining gates — *an actual Google AI Studio publish* and *the published public
runtime* — **cannot be executed from this machine** and were therefore not claimed.

Exact reason, §9. No mock and no fabricated URL was substituted.

---

## 2. STARTUP PATH (traced, not assumed)

```text
npm ci                                  -> 505 packages, exit 0
npm run build                           -> vite build  (SPA -> dist/)
                                         esbuild server.ts -> dist/server.cjs
npm start  = cross-env NODE_ENV=production node dist/server.cjs
                                         -> ONE node process
                                         -> ONE http listener on 0.0.0.0:$PORT
                                         -> Express serves dist/ statically
                                         -> Express serves /api/*
```

There is no frontend server, no backend server, no worker, no scheduler, no proxy.
`PORT` is read from the environment and never hardcoded; `HOST` defaults to
`0.0.0.0`.

Dev path (`npm run dev` = `tsx server.ts`) mounts the Vite dev server as in-process
middleware on the same Express app and the same port. Both paths were exercised.

**Verified process shape inside the container:**

```text
$ docker exec vn-p24 ps
    PID   COMMAND          COMMAND
      1 node             node dist/server.cjs      <- exactly one
$ netstat -tlnp
tcp 0.0.0.0:10000  LISTEN  1/node                <- exactly one port
$ id
uid=100(app) gid=101(app)                        <- non-root
```

---

## 3. DEPLOYMENT COMPLEXITY SCORE

| Dimension | Before | After |
|---|---:|---:|
| Services | 1 | 1 |
| Startup processes | 1 | 1 |
| Listening ports | 1 | 1 |
| Build commands | 1 | 1 |
| Start commands | 1 | 1 |
| **Required** env variables | 0 | 0 |
| Optional env variables | 15 | 15 |
| Mandatory cloud resources | 0 | 0 |
| Background workers / cron | 0 | 0 |
| Persistent-storage assumptions | 0 | 0 |
| Deployment config files | 4 | 4 |
| Infrastructure technologies | 4 | 4 |
| Runtime image size | 906 MB | 732 MB |

**Classification: LOW — before and after.** The architecture was already the
single-process target P23 aimed for; no revert was required and none was performed.

### 3.1 Items audited and classified

| Item | Classification | Evidence |
|---|---|---|
| Kubernetes / Helm / Terraform | UNUSED | 0 files, 0 references |
| docker-compose | UNUSED | 0 files |
| Redis / ioredis | UNUSED | only the substring "redistributed" in a comment |
| Queue / Kafka / AMQP | UNUSED | 0 references |
| Cron / node-cron | UNUSED | 0 references |
| Background daemon | UNUSED | `setInterval` 0 uses in non-test source |
| `worker_threads` / `cluster` | UNUSED | only `clusterLevels()` in support/resistance maths |
| nginx / systemd / reverse proxy | UNUSED | 0 references; not needed, one process binds directly |
| `child_process` / `spawn` / `execSync` | UNUSED | 0 uses |
| Native/binary requirement | NOT REQUIRED | only platform-native `esbuild`, `lightningcss`, `@tailwindcss/oxide`, resolved per-platform by npm |
| Fixed public IP / custom DNS / TLS termination | NOT REQUIRED | platform-managed |
| Filesystem persistence | NOT REQUIRED | no writes outside `dist/` read |
| GPU | NOT REQUIRED | none |
| `Dockerfile` | OPTIONAL | required for container hosts, unused by AI Studio's npm path |
| `render.yaml` | OPTIONAL | Render only; documents the same one-service shape |
| `.dockerignore` | OPTIONAL | paired with `Dockerfile` |
| `firebase-applet-config.example.json` | LEGACY / DEFERRED | imported by nothing; kept because a passing guard test (`repoGuards.test.ts`) uses it as a secret-scanning fixture |

Every `setTimeout` in non-test server code is a request timeout (`AbortController`)
or the graceful-shutdown timer. There is no scheduler.

---

## 4. ENVIRONMENT FORENSICS

Every variable was traced to a real read site. `VITE_*` variables were additionally
verified absent from the emitted bundle.

| Variable | Read by | Required | Build/Runtime | Secret | Needed for AI Studio |
|---|---|---:|---|---|---:|
| `PORT` | `server.ts:69` | platform-injected | Runtime | no | **yes** (provided) |
| `HOST` | `server.ts:70` | no (default `0.0.0.0`) | Runtime | no | no |
| `NODE_ENV` | `server.ts:909`, `security.ts:67,98` | **yes** for the production path | Runtime | no | **yes** |
| `LOG_LEVEL` | `createPlatformRouter.ts:106` | no (default `INFO`) | Runtime | no | no |
| `SQL_HOST` / `SQL_USER` / `SQL_PASSWORD` / `SQL_DB_NAME` | `src/db/index.ts:38-43`, `createPlatformRouter.ts:75` | no | Runtime | password only | no |
| `SQL_PORT` | `src/db/index.ts:14` | no (default 5432) | Runtime | no | no |
| `SQL_SSL` | `src/db/index.ts:26` | no | Runtime | no | no |
| `SQL_SSL_REJECT_UNAUTHORIZED` | `src/db/index.ts:31` | no (default `false`) | Runtime | no | no |
| `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` | `drizzle.config.ts` | no | **build-time CLI only** | password only | no |
| `FIREBASE_PROJECT_ID` | `firebase-admin.ts:40` | no | Runtime | no | no |
| `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` | `firebase-admin.ts:41-42` | no | Runtime | no | no |
| `GEMINI_API_KEY` | `aiChatService.ts:55`, `server.ts:174` | no | Runtime | **yes** | no |
| `DISABLE_HMR` | `vite.config.ts:20,22`, `server.ts` | no | Dev only | no | no |
| `VITE_FIREBASE_*` (7) | `src/lib/firebase.ts:29-35` only | no | Build | no | no |
| `APP_URL` | **nothing** | no | — | no | no |

### 4.1 Removed / deferred

- **No variable was deleted**, because every remaining one has a real read site or a
  documented platform meaning.
- `VITE_FIREBASE_*` and `APP_URL` were reclassified as **optional / unreferenced** in
  `.env.example` and `render.yaml`. This was the real defect: both files presented
  them as configuration to fill in, so an operator would have believed the publish was
  blocked on values that nothing reads.

---

## 5. FIREBASE AUDIT

| Item | Classification | Evidence |
|---|---|---|
| `firebase-admin` (server) | **OPTIONAL** — required only for `GET /api/users/me` | `firebase-admin.ts` resolves state lazily and never throws; unset ⇒ `requireAuth` answers `401 AUTH_CONFIGURATION_REQUIRED` |
| `firebase` (client SDK) | **UNUSED** | `src/lib/firebase.ts` has **zero importers** — no page, hook, component or service references it |
| `VITE_FIREBASE_*` | **UNUSED** | tree-shaken out: `grep -c VITE_FIREBASE_API_KEY dist/assets/index-*.js` ⇒ **0** |

**Consequence: Firebase is not required to boot, build, start, publish, or serve
any real-data route.** Verified: the container runs with no Firebase configuration
whatsoever and reports `auth: AUTH_CONFIGURATION_REQUIRED` truthfully.

No credential was fabricated. Removal of the client module is **DEFERRED**: it is a
real product capability awaiting an authenticated UI, and deleting it is a product
decision rather than a deployment one. The documentation now says so instead of
implying a requirement.

---

## 6. DEFECTS FOUND AND FIXED

Seven defects, each reproduced before the fix and re-verified after.

### 6.1 `npm ci` fails on every Linux build platform — **the actual publish blocker**

```text
$ docker build .
#9 npm error code EUSAGE
#9 npm error `npm ci` can only install packages when your package.json and
      package-lock.json ... are in sync.
#9 npm error Missing: @opentelemetry/api@1.9.1 from lock file
#9 npm error Missing: @emnapi/core@1.11.3 from lock file
#9 npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

This is the defect that makes the project build on a developer machine and fail on
AI Studio, Cloud Run, Render, or any Docker host.

**Root cause.** `@tailwindcss/oxide-wasm32-wasi` — the WASM *fallback* that is never
executed on linux-x64 or win32-x64 — declares `@emnapi/core` and `@emnapi/runtime` as
real dependencies. npm **10** hoists them to the tree root and therefore demands
top-level lockfile entries; npm **11** keeps them nested under the wasm package and is
satisfied by the committed lock. `node:22-alpine` ships npm 10.9.9.

Verified both directions:

| npm | Platform | Result |
|---|---|---|
| 11.6.2 | linux-x64 (alpine) | `npm ci` → **508 packages, exit 0** |
| 11.6.2 | win32-x64 | `npm ci` → **505 packages, exit 0** |
| 10.9.9 | linux-x64 (alpine) | **EUSAGE** — 3 packages missing |

**Fix:** pin npm 11 in both install stages of the `Dockerfile`. `package-lock.json` is
**byte-identical to the committed one** (`git diff package-lock.json` empty).

> Regenerating the lockfile on Linux was tried and **rejected**: it produces a
> 506-entry lock that drops `@tailwindcss/oxide-win32-x64-msvc`,
> `@tailwindcss/oxide-android-arm64` and `lightningcss-linux-x64-gnu`, and then
> `npm ci` fails on the dev machine with `Missing:
> @tailwindcss/oxide-android-arm64@4.3.3 from lock file`. One committed lockfile can
> only satisfy both platforms by keeping the committed npm-major's layout.

### 6.2 `/api` 404 guard existed only in the production branch

The `/api` JSON-404 guard registered after `/api/health` was inside the
`else { … }` production block, so **`npm run dev` — the command Google AI Studio runs
by default — answered every unmatched `/api/*` with the SPA shell and HTTP 200.**
Vite's dev server applies the same HTML rewrite, so the guard has to sit in front of
the Vite middleware.

| | before | after |
|---|---|---|
| `GET /api/definitely-not-a-route` (dev) | `200 text/html` + `index.html` | `404 application/json` `{"error":"NOT_FOUND"}` |

### 6.3 `DISABLE_HMR` was silently ignored

`server.ts` passed `hmr: { server: httpServer }` as an **inline** Vite option. Inline
options outrank `vite.config.ts`, so the config file's `hmr: process.env.DISABLE_HMR
!== 'true'` had no effect. AI Studio sets `DISABLE_HMR=true` to stop page flicker and
watcher CPU burn during agent edits.

Verified by websocket probe:

```text
DISABLE_HMR=true   -> upgrade refused, HTTP 200 (websocket disabled)  [after fix]
DISABLE_HMR unset  -> hmr: { server: httpServer }, byte-identical to previous behaviour
```

### 6.4 every deep link except `/stock/:symbol` was ignored

`parseInitialRoute()` resolved only `/stock/:symbol` and fell through to `dashboard`
for everything else. The server correctly returns `index.html` with 200 for
`/portfolio`, `/paper-trading`, `/research`, `/market`, … so the failure was invisible
to any HTTP check: the user simply landed on the dashboard. The `popstate` listener had
the same three-shape limit, so back/forward drifted too.

`PATH_TO_VIEW` + a single exported `resolveRouteFromPath()` now back both the initial
load and `popstate`, so they cannot diverge again.

Measured in-browser, each route now rendering a distinct view (before, all of them
rendered the dashboard):

| Path | before `bodyChars` | after `bodyChars` |
|---|---:|---:|
| `/` | 8523 | 8523 |
| `/portfolio` | *(dashboard)* | 2143 |
| `/paper-trading` | *(dashboard)* | 1785 |
| `/stock/HPG` | 3191 | 3191 |
| `/risk-center` | *(dashboard)* | 2547 |
| `/market` | *(dashboard)* | 4596 |
| `/screener` | *(dashboard)* | 2798 |

### 6.5 `reachabilityGate.test.ts` timed out under the full suite

2 of 2409 tests failed **only** in the full parallel run and passed in isolation
(49/49). Cause: `findNonTestCallers()` and `buildImportGraph()` each re-walked `src/`
and re-read every `.ts`/`.tsx` file *per call*; the gate calls them dozens of times, so
one run repeated that I/O hundreds of times and individual assertions crossed the 5 s
default timeout under a 210-worker pool.

Fixed by memoising a per-`repoRoot` source snapshot. **No assertion was weakened, no
test was deleted, no compiler setting changed.** The two scanners keep their own
distinct filters (`buildImportGraph` excludes tests only; `findNonTestCallers` also
excludes docs), exactly as before.

```text
test file in isolation:  22.14 s  ->  2.28 s
full suite:              2 failed / 2409  ->  0 failed / 2409
```

### 6.6 runtime image carried the whole toolchain

The `Dockerfile` claimed "Production dependency tree only" and its header claimed
pruning devDependencies was safe — but `COPY --from=deps` copied the **full** tree,
so `vite`, `esbuild`, `typescript`, `vitest`, `tsx`, `drizzle-kit` and `tailwindcss`
were all present in the runtime layer. An accidental `require('vite')` in a production
path would have resolved silently.

Added a dedicated `prod-deps` stage (`npm ci --omit=dev`). Now enforced, not merely
documented:

```text
vite absent | esbuild absent | typescript absent | vitest absent
tsx absent | drizzle-kit absent | tailwindcss absent
image 906 MB -> 732 MB ; container still healthy; real market data still OK
```

### 6.7 duplicate, defective drizzle config

`src/db/drizzle.config.ts` was unreferenced (drizzle-kit resolves `drizzle.config.ts`
from the project root) and was the **pre-P23 variant that omits `SQL_PORT`** — it
would have silently dialled 5432 against a managed database on any other port. Removed.
The root `drizzle.config.ts` is the canonical one and retains the fix.

---

## 7. SIMPLIFICATION / REVERT LEDGER

No deployment change was reverted. Nothing was rolled back, and no forbidden command
(`git reset --hard`, `git clean`, `git restore .`) was run. The P23 single-server
architecture was **correct** and was kept.

**Simplified:** duplicate defective drizzle config removed (6.7); devDependencies
excluded from the runtime image (6.6); npm pinned so one lockfile serves every
platform (6.1).

**Documentation corrected (the misleading part, not the code):** `.env.example` and
`render.yaml` no longer present optional and unreferenced variables as required.

**Deferred, with reasons:**

| Item | Why deferred |
|---|---|
| `src/lib/firebase.ts` + the `firebase` client dependency | unused today, but a real capability awaiting an authenticated UI; removing it is a product decision |
| `firebase-applet-config.example.json` | dead, but referenced as a fixture by a passing guard test |
| route-level code splitting | bundle is 1.17 MB (314 kB gzip); a performance improvement, not a correctness or publish issue |
| `Dockerfile` / `render.yaml` / `.dockerignore` | optional for AI Studio, required by container hosts; all three are correct |

**Preserved untouched:** RiskGuard, RiskManager, PositionSizer, TradingEngine,
PaperBroker, all KBS/VPS providers, freshness validation, fail-closed data behaviour,
the research/recommendation/AI-score engines, and all existing tests.

---

## 8. GATE RESULTS — ALL EXECUTED

### 8.1 Build and static gates

| Gate | Command | Result |
|---|---|---|
| Install (reproducible) | `npm ci` | **PASS** — 505 packages, exit 0 |
| Install (per §13) | `npm install` | **PASS** — 506 audited, tree intact |
| Typecheck | `npm run typecheck` | **PASS** — exit 0 |
| Unit + integration | `npx vitest run` | **PASS** — **2409/2409**, 210/210 files |
| Frontend build | `vite build` | **PASS** — 1945 modules, JS 1.169 MB, CSS 119.8 kB |
| Server build | `esbuild server.ts` | **PASS** — `dist/server.cjs` 860.6 kB |
| Container build | `docker build` | **PASS** — Linux, exit 0 |
| Lockfile unchanged | `git diff package-lock.json` | **PASS** — empty |

### 8.2 Local runtime

| Check | Result |
|---|---|
| `npm run dev` boot | **PASS** — `0.0.0.0:8791` |
| `npm start` boot (production) | **PASS** — `0.0.0.0:8798` |
| `DISABLE_HMR=true` boot | **PASS** — websocket refused, watcher off |
| Bind-conflict handling | **PASS** — observed live: `FATAL: cannot bind 0.0.0.0:3000 — address already in use.`, exit 1 |
| `/api/platform/healthz` | **PASS** — `200 {"status":"alive"}` |
| `/api/platform/readyz` | **PASS** — `200 {"status":"degraded","ready":true}` |
| `/api/health` truthfulness | **PASS** — `degraded`, `DATABASE_CONFIGURATION_REQUIRED`, `AUTH_CONFIGURATION_REQUIRED`, `GEMINI_CONFIGURATION_REQUIRED`, providers `UNVERIFIED` |
| Static assets | **PASS** — JS `200 application/javascript` 1 168 610 B; CSS `200 text/css` 119 779 B |
| CSP header | **PASS** — production `script-src 'self'`, explicit `connect-src` allowlist |
| Unknown `/api/*` | **PASS** — `404 application/json`, both modes |
| Missing hashed asset | **PASS** — `404 text/plain` |
| SPA deep links | **PASS** — all `200 text/html` |

### 8.3 Real market data (no mocks, no synthetic candles)

Executed against the **container** runtime:

| Route | Result |
|---|---|
| `/api/market-data/quote/HPG` | **PASS** — `dataStatus OK`, source `VPS`, last `20500`, KBS cross-check `20500`, **deviation 0 %**, `crossCheck.status OK` |
| `/api/market-data/history/HPG` | **PASS** — `dataStatus OK`, source `KBS`, timeframe `3M`, **98 real bars**, `2026-05-19` → `2026-10-06` |
| `/api/market-data/history/HPG?timeframe=1D` | **PASS (fail-closed)** — `TIMEFRAME_NOT_SUPPORTED: "1D" requires intraday bars which KBS does not provide; synthetic candles are disabled.` |
| `/api/analysis/HPG` | **PASS** — real RSI/MACD/BB/ATR from KBS candles |
| `/api/stocks/HPG/recommendations` | **PASS** — `dataStatus OK`, real engine output |
| `/api/stocks/HPG/money-flow-analysis` | **PASS (truthful DEGRADED)** — `500 Lỗi khi phân tích dòng tiền`, no synthetic rows, because no PostgreSQL is configured |

### 8.4 Financial safety chain — live, in the container

Chain traced by grep: `TradingApiRouter:162 → PaperOrderRiskBoundary.submit → …
OrderManager:130 → PaperBroker:414`. The **only** non-test `submitOrder` caller
outside the broker is the risk boundary; `server.ts` never calls it. The reachability
gate independently asserts the router contains no `getOrderManager().submitOrder(`.

| Request | HTTP | Code | `riskGuard` / `riskManager` / `positionSizer` / `paperBroker` |
|---|---:|---|---|
| BUY, no stop/target | 422 | `RISK_PARAMETERS_REQUIRED` | false / false / false / **false** |
| BUY, R/R 1.83 < 2.0 | 409 | `INVALID_RISK_REWARD` | true / false / false / **false** |
| BUY, R/R ≥ 2.0, market closed | 409 | `MARKET_CLOSED` | true / true / false / **false** |

`submittedQuantity: 0` in every case; each trace records a real VPS fetch
(`MARKET_DATA_OK: source=VPS … crossCheck=OK`). **The broker gate never opened.**

### 8.5 Golden path — headless browser, containerized runtime

| Step | Path | HTTP | Mounted | bodyChars | svgs |
|---|---|---:|---|---:|---:|
| Dashboard | `/` | 200 | yes | 8523 | 139 |
| Portfolio | `/portfolio` | 200 | yes | 2143 | 42 |
| Paper trading | `/paper-trading` | 200 | yes | 1785 | 42 |
| Stock detail + chart | `/stock/HPG` | 200 | yes | 3030 | 46 (8 canvas/table) |
| Risk | `/risk-center` | 200 | yes | 2547 | 43 |
| Screener | `/screener` | 200 | yes | 2781 | 81 |
| Market | `/market` | 200 | yes | 4596 | 58 |

Console errors: **none from application code.** The only failed requests are the four
intentional ones above — three risk rejections (422/409/409) and the DB-unconfigured
500. `title` non-empty, `#root` populated on every page.

---

## 9. WHY THE PUBLISH GATES ARE BLOCKED

Checked on this machine:

```text
gcloud      NOT INSTALLED
firebase    NOT INSTALLED
aistudio    NOT INSTALLED
gsutil      NOT INSTALLED
~/.config/gcloud                     does not exist
GOOGLE_APPLICATION_CREDENTIALS       not set
FIREBASE_* / GCP_* / AI_STUDIO_*     none set
```

Importing a project, configuring a run target, pressing **Publish**, and reading the
resulting public URL are **web-UI operations bound to a signed-in Google account**.
There is no CLI path, and no credential exists here to create one. Per §26 and §30 I
did not fabricate a URL, a deployment status, or a passing publish.

### 9.1 What is left to do — it is a UI action, not a code change

The container path is proven end to end, so a publish should succeed. In Google AI
Studio:

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Port | provided by the platform; never hardcode |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| Secrets to add | **none required** |
| Optional secrets | `GEMINI_API_KEY`, `SQL_*`, `FIREBASE_PROJECT_ID` |

### 9.2 One risk the code cannot control

If AI Studio builds with npm **10.x** instead of the `Dockerfile`'s npm 11 and ignores
the `Dockerfile`, `npm ci` fails with the §6.1 error. The durable fix, if that happens,
is to set `npm install -g npm@11` in the platform's build step. Do **not** regenerate
the lockfile on the failing platform — that trades a Linux failure for a Windows one.

---

## 10. KNOWN LIMITATIONS (unchanged by this phase)

1. Identity/session/audit state is process-local; a restart clears it and a fresh
   process refuses access rather than reconstructing it.
2. Paper trading is process-local; `PaperBroker` balances reset on restart.
3. `/api/stocks*` and `/api/signals` require PostgreSQL and answer `500` without it.
   The real-data market routes do not need it.
4. Firebase sign-in needs configuration; unset ⇒ `401`, never a bypass.
5. Google Fonts load from a CDN; an air-gapped environment falls back to system fonts.
6. Client bundle is 1.17 MB (314 kB gzip) in a single chunk.

---

## 11. FINAL CERTIFICATION MATRIX

| Gate | Required | Result |
|---|---|---|
| Deployment forensic audit | PASS | **PASS** |
| Startup path identified | PASS | **PASS** |
| ENV audit | PASS | **PASS** |
| Dependency audit | PASS | **PASS** |
| Complexity assessment | PASS | **PASS** — LOW before and after |
| Safe revert if required | PASS | **PASS** — not required; nothing reverted |
| Minimal deployment path | PASS | **PASS** — 1 process, 1 port, 1 build, 1 start |
| Typecheck | PASS | **PASS** |
| Build | PASS | **PASS** |
| Local runtime | PASS | **PASS** — dev and production |
| Database | PASS / truthful DEGRADED | **truthful DEGRADED** — not configured; explicit, no synthetic rows |
| Real market data | PASS / truthful BLOCKED | **PASS** — VPS + KBS, 0 % deviation, 98 real bars |
| Frontend | PASS | **PASS** |
| API | PASS | **PASS** |
| Risk chain | PASS | **PASS** — broker gate never opened |
| Google AI Studio compatibility | PASS | **PASS** — no unsupported capability assumed; container proven on Linux |
| Google AI Studio publish | PASS | **BLOCKED** — no CLI, no credential (§9) |
| Published runtime | PASS | **BLOCKED** — depends on the above |
| Golden path | PASS | **PASS** — 7 routes in a real browser against the container |
| Regression | PASS | **PASS** — 2409/2409, typecheck clean |

```text
FINAL: P24 GOOGLE AI STUDIO PUBLISH — BLOCKED
```

Blocked solely on the two publish gates that require a signed-in Google account.
Every gate that can be satisfied from inside this repository was satisfied and is
evidenced above.
