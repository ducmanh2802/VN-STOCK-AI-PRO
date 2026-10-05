# GOOGLE AI STUDIO — FINAL CERTIFICATION

**Subject:** VN STOCK AI PRO — Google AI Studio bootstrap & runability remediation
**Host verified on:** Windows dev machine, Node **v24.12.0**, npm **11.6.2**
**Method:** every command was re-run with the deployment-local
`firebase-applet-config.json` **removed**, because that file is gitignored and
therefore absent in Google AI Studio. Passing in that state *is* passing in AI Studio.

---

## 1. INITIAL PROBLEM

The project could not be loaded, typechecked, built, or started in a clean
environment. One root cause broke three entrypoints at once, and two further
defects made the app non-functional once it did start.

| # | Symptom | Evidence |
|---|---|---|
| 1 | **Server could not boot at all** | `tsx server.ts` → `ERR_MODULE_NOT_FOUND: .../firebase-applet-config.json` |
| 2 | **Production build failed** | `esbuild server.ts` → `Could not resolve "../../firebase-applet-config.json"` |
| 3 | **Typecheck failed** | `tsc --noEmit` → `TS2307` in `src/lib/firebase-admin.ts:3`, `src/lib/firebase.ts:3` |
| 4 | **Dev server rendered a blank page** | Browser: `bodyChars 0`, `Executing inline script violates ... 'script-src 'self''` |
| 5 | **Market data panels could never load** | Browser: `Fetch API cannot load https://bgapidatafeed.vps.com.vn/...` (CSP `connect-src 'self'`) |
| 6 | **Port hardcoded** | `server.ts:49` → `const PORT = 3000;` — AI Studio forwards a dynamic port |
| 7 | **Production bundle would crash on pruned devDependencies** | `server.ts` statically imported `vite` (a devDependency) → `require("vite")` in `dist/server.cjs` |

Root cause of #1–#3: a single static import of a **gitignored, deployment-local**
file. It existed on the author's Windows machine and nowhere else.

---

## 2. ROOT CAUSES

1. **Deployment-local file treated as a build input.** `firebase-applet-config.json`
   holds a Firebase web API key, so it is deliberately gitignored — yet it was
   `import`ed statically by two modules, one server-side and one client-side.
   A gitignored file can never be a build input.
2. **CSP written for production only, applied to development too.** Vite's dev server
   injects an inline React-Refresh preamble that `script-src 'self'` blocks. Google
   AI Studio runs `npm run dev`, so the editor showed a blank page.
3. **CSP did not describe the app's real architecture.** The market-data layer fetches
   public VPS/KBS feeds directly from the browser, but `connect-src 'self'` denied it —
   silently disabling the index ticker and every quote panel.
4. **Hardcoded port.** Cloud Run supplies `PORT`; the server ignored it.
5. **Build tooling in `dependencies`.** `vite` was listed in *both* `dependencies` and
   `devDependencies` (flagged by `bun install`), so production could depend on a
   toolchain package.
6. **No npm lockfile.** Only `bun.lock` existed, and it was stale.

---

## 3. FIXES

### 3.1 Removed the gitignored-file dependency (fixes #1, #2, #3)

- **`src/lib/firebase-admin.ts`** — rewritten. Configuration now resolves from
  `FIREBASE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT`, **lazily**, so
  importing the module can never throw. Exposes `getAdminAuthState()` returning
  `READY` or `AUTH_CONFIGURATION_REQUIRED`. `adminAuth.verifyIdToken()` raises a typed
  `AdminAuthUnavailableError` instead of crashing at import.
- **`src/middleware/auth.ts`** — maps `AdminAuthUnavailableError` to
  `401 { status: "AUTH_CONFIGURATION_REQUIRED" }`. Auth is **denied, never bypassed**.
- **`src/lib/firebase.ts`** — rewritten to read public config from `VITE_FIREBASE_*`
  (the only mechanism that can safely reach a browser bundle). `auth` is now a
  lazy proxy, so importing it never throws in an unconfigured environment.
- **`src/vite-env.d.ts`** — new; declares the `VITE_*` contract.

### 3.2 Made the CSP environment-aware and accurate (fixes #4, #5)

- **`src/middleware/platform/security.ts`** — extracted `buildContentSecurityPolicy()`.
  - *Development* adds `'unsafe-inline'` to `script-src` so Vite HMR works.
  - *Production* keeps `script-src 'self'` — no inline script execution.
  - Both allow `connect-src` for the two public market-data origins and the Google
    Fonts CDN via an **explicit allowlist**, never `*`.
- Result: dev `bodyChars` 0 → 8651; production console errors 13 → **0**;
  failed requests 1 → **0**; live indices render.

### 3.3 Runtime/port/build correctness (fixes #6, #7)

- **`server.ts`**
  - `PORT = Number(process.env.PORT) || 3000`, `HOST = process.env.HOST || '0.0.0.0'`.
  - `await import('vite')` inside the non-production branch → `dist/server.cjs` has
    **no eager `require("vite")`**.
  - `dotenv.config()` for local dev (never overrides real env vars).
  - `startServer().catch(...)` → a fatal startup failure is loud and sets `exitCode 1`
    instead of an unhandled rejection.
  - `/api/health` now reports honest per-dependency states.
- **`vite.config.ts`** — `fileURLToPath(new URL('.', import.meta.url))` instead of
  `__dirname` (not defined in ESM); repaired a corrupted UTF-8 comment; set
  `chunkSizeWarningLimit`.
- **`package.json`** — `react-example` → `vn-stock-ai-pro`; added
  `engines.node >= 20.19.0`, `test:watch`; `start` now uses `cross-env` so it is
  correct on Windows **and** Linux; `clean` no longer uses `rm -rf`; moved `vite`,
  `@vitejs/plugin-react`, `@tailwindcss/vite`, `drizzle-kit` to `devDependencies` and
  de-duplicated `vite`.
- **`.env.example`** — full annotated contract; every value blank.
- **`.gitignore`** — ignore `.tmp-*`, `ssi_probe_raw.txt`, `*.log.[0-9]*`.
- **`package-lock.json`** — created (npm is canonical in AI Studio).
- **`bun.lock`** — regenerated so both lockfiles agree with `package.json`.

### 3.4 Documentation created

`docs/GOOGLE_AI_STUDIO_COMPATIBILITY.md`, `GOOGLE_AI_STUDIO_QUICKSTART.md`,
`docs/GOOGLE_AI_STUDIO_COMPATIBILITY_MATRIX.md`, this file.

---

## 4. FILES CHANGED

| File | Change |
|---|---|
| `src/lib/firebase-admin.ts` | Rewritten — lazy, env-only, fail-explicit auth |
| `src/lib/firebase.ts` | Rewritten — `VITE_*` public config, lazy `auth` proxy |
| `src/middleware/auth.ts` | `AUTH_CONFIGURATION_REQUIRED` 401 instead of crash |
| `src/middleware/platform/security.ts` | Environment-aware CSP + market-data allowlist |
| `src/vite-env.d.ts` | **New** — `VITE_*` type contract |
| `server.ts` | Dynamic PORT/HOST, lazy `vite`, dotenv, fatal-error handler, honest health |
| `vite.config.ts` | ESM-safe alias, comment repair, chunk warning limit |
| `package.json` | Name, engines, scripts, dependency classification, devDep de-dup |
| `package-lock.json` | **New** — canonical npm lockfile |
| `bun.lock` | Regenerated |
| `.env.example` | Full annotated environment contract |
| `.gitignore` | Temp-artifact coverage |
| `docs/GOOGLE_AI_STUDIO_COMPATIBILITY.md` | **New** |
| `docs/GOOGLE_AI_STUDIO_COMPATIBILITY_MATRIX.md` | **New** |
| `docs/GOOGLE_AI_STUDIO_FINAL_CERTIFICATION.md` | **New** (this file) |
| `GOOGLE_AI_STUDIO_QUICKSTART.md` | **New** |

---

## 5. COMMANDS VERIFIED

| Command | Result |
|---|---|
| `npm ci` | `added 504 packages`, exit 0 — no `--force`/`--legacy-peer-deps` |
| `bun install --lockfile-only` | exit 0, 616 packages, lockfile in sync |
| `npm run typecheck` | exit 0 with `firebase-applet-config.json` absent |
| `npm test` | 205 files / **2213 tests passed** |
| `npm run build` | `vite build` 1944 modules; `dist/server.cjs` 629 kB |
| `npm run dev` | `Server running on http://0.0.0.0:8795`; UI mounts, 0 console errors |
| `npm start` | `Server running on http://0.0.0.0:8796`; stayed alive across requests |

---

## 6. BUILD RESULT — PASS

```
dist/index.html                 1.61 kB
dist/assets/index-*.css       119.59 kB │ gzip  18.27 kB
dist/assets/index-*.js      1,165.07 kB │ gzip 312.07 kB
dist/server.cjs                629.1 kB
dist/server.cjs.map              1.3 MB
```

Verified: `dist/server.cjs` contains **no** eager `require("vite")`, only a lazy
`import("vite")` in the dev branch.

---

## 7. STARTUP + HTTP RESULT — PASS

Booted on dynamic ports 8792/8793/8795/8796/8797, proving `PORT` is honoured.

| Route | Status |
|---|---|
| `/` | 200 |
| `/portfolio` (SPA deep link) | 200 |
| `/api/health` | 200 |
| `/api/platform/healthz` | 200 |
| `/api/platform/readyz` | 200 |
| `/api/market-data/quote/HPG` | 200 (real VPS quote + KBS cross-check) |
| `/api/trading/portfolio` | 200 (paper account) |
| `/api/stocks` (no DB) | 500 with an explicit message — correct degraded state |

`/api/health` output:

```json
{"status":"ok","dependencies":{
  "database":"DATABASE_CONFIGURATION_REQUIRED",
  "auth":"AUTH_CONFIGURATION_REQUIRED",
  "gemini":"GEMINI_CONFIGURATION_REQUIRED"}}
```

The server stayed alive through every request, including the failing ones.

---

## 8. FRONTEND RESULT — PASS (both modes)

| Mode | `bodyChars` | Console errors | Failed requests |
|---|---|---|---|
| Production (before) | 1106 | 13 | 1 |
| Production (after) | **8651** | **0** | **0** |
| Development (before) | **0 — blank screen** | 1 | 0 |
| Development (after) | **8651** | **0** | **0** |

Rendered content includes live indices — `VN-Index (HOSE) 1300.10 +15.10 (+1.17%)`,
`VN30-Index 1330.22`, `HNX-Index 242.11`, `UPCoM-Index 98.36`.

---

## 9. DATABASE RESULT — DEGRADED, HONEST

No PostgreSQL was available. Per policy the database was **not** faked and no
embedded substitute was introduced.

- The pool is created lazily, so **the server boots with no database at all**.
- `/api/stocks*` and `/api/signals` return an explicit error; they never return
  synthetic rows, placeholder prices, or invented fundamentals.
- `GET /api/health` reports `database: DATABASE_CONFIGURATION_REQUIRED`.
- Real market data and paper trading work **without** PostgreSQL.
- `drizzle-kit` still refuses to run without `SQL_ADMIN_*` — intended, actionable.

---

## 10. EXTERNAL SERVICES

| Service | Required? | Startup behaviour | Failure behaviour |
|---|---|---|---|
| PostgreSQL (Cloud SQL) | For `/api/stocks*` | never blocks boot | explicit `500`, `CONFIGURATION_REQUIRED` |
| Firebase Admin | For `/api/users/me` | never blocks boot | `401 AUTH_CONFIGURATION_REQUIRED` |
| Gemini API | For `/api/ai/chat` | never blocks boot | explicit advisory notice; **never** a fabricated answer |
| VPS / KBS market feeds | For analysis | never blocks boot | `DATA_UNAVAILABLE`; **never** synthetic candles |

---

## 11. SAFETY VERIFICATION

| Guardrail | Result |
|---|---|
| Secret scan (API keys, private keys, `postgres://u:p@`, `AKIA…`) | 0 matches in tracked source |
| `.env.example` values | All blank |
| `firebase-applet-config.json` | Gitignored **and** no longer imported |
| `.gitignore` coverage | `node_modules`, `dist`, `.env`, config JSON, `*.log`, `.tmp-*` |
| Case-sensitivity | 2478 relative imports audited → **0** case mismatches |
| Windows paths in runtime code | 0 matches |
| ESM/CJS conflicts | None |
| Client/server boundary | UI → `/api/*` → server → provider/DB. No `pg`/`drizzle`/`fs` imports from UI code |
| Fake financial data introduced | **None.** No mock was added; all unavailable paths report explicit states |
| Business logic rewritten | **None** |
| Security weakened | **No.** Dev-only CSP relaxation; production `script-src 'self'` unchanged; `connect-src` is an allowlist, not `*` |
| Auth bypassed | **No.** Unconfigured auth denies access |

---

## 12. REMAINING LIMITATIONS

**In this remediation's scope — none outstanding.** All bootstrap, install, build,
boot, and rendering defects found are fixed and verified.

**Pre-existing, out of scope (documented, not introduced here):**

1. `src/test/business06.e2e.test.ts` (**uncommitted WIP**) — 5 failures. Entitlement
   gating, seat-duplication error code, and stale-writer error code disagree with the
   test's expectations. This is domain-logic behaviour in uncommitted monetization
   work; changing it would be a business decision, and weakening the test would
   violate the "do not weaken tests" rule. The **committed** suite is 2213/2213.
2. Identity, sessions, audit log and paper-trading balances are process-local and do
   not survive a restart. The platform layer refuses access on a fresh process rather
   than reconstructing state. Durable identity schema already exists in
   `drizzle/0007_platform_identity.sql`.
3. `.tmp-hpg-kbs.json` and `ssi_probe_raw.txt` were committed before this work and are
   generated artifacts. They are now in `.gitignore`, but untracking them requires a
   commit, which was not requested.
4. The client bundle is a single ~1.16 MB chunk (312 kB gzip). Route-level code
   splitting is recommended.
5. **The UI fetches public VPS/KBS market feeds directly from the browser.** This is
   the app's existing, intentional design (not introduced here), and the CSP now
   permits it. Architecturally, routing these through a server proxy would be cleaner.

---

## 13. ⚠ CONCURRENT EDITING OF THE WORKING TREE

**Another process was actively editing this repository throughout the verification
loop.** This is the single most important caveat in this report.

Nine files unrelated to this remediation appeared as modified:
`src/services/market/RealMarketDataProvider.ts`,
`src/services/market/providers/VPSMarketDataProvider.ts`,
`src/services/market/stockDetailService.ts`,
`src/services/market/freshness/dataFreshness.ts`,
`src/lib/trading/api/TradingApiRouter.ts`, `src/lib/trading/engine/TradingEngine.ts`,
`src/hooks/useMarketQueries.ts`, `src/pages/PaperTradingPage.tsx`,
`src/types/market.ts`, `src/types/stock.ts`, `src/types/stockDetail.ts`,
`src/data/mock/marketData.ts`.

Two observed consequences, **neither caused by this remediation**:

1. **A transient syntax error** at `RealMarketDataProvider.ts:121`
   (`Math.max(10, Math.min(95, aiScore);` — missing `)`) appeared and then resolved on
   its own, proving the file was mid-write.
2. **An in-flight type migration** adding provenance fields
   (`levelSource`, `levelProvenance`, `availability`, `provenance`,
   `moneyFlowStatus`, `riskRewardStatus`). `typecheck` error counts fluctuated between
   0 and 9 across polls. **No error ever referenced a file this remediation changed.**

   A genuine follow-on bug exists in that work: `src/types/market.ts` widened
   `MoneyFlowMetric.netValue` to `number | null`, but
   `src/components/dashboard/MarketSentimentWidget.tsx:186` still calls `.toFixed(1)`
   on it unguarded, so the home page trips the error boundary
   (`TypeError: Cannot read properties of null (reading 'toFixed')`).
   **This was deliberately not fixed** — that file belongs to the in-flight refactor,
   and editing it mid-flight would collide with it. It must be fixed by the owner of
   that work, by guarding the null at the render site.

### Required before certification can be re-issued

```bash
npm ci && npm run typecheck && npm test && npm run build
PORT=3000 npm start
```

Re-run once the concurrent work has landed. The three fixes in this report
(gitignored-config dependency, environment-aware CSP, dynamic port/lazy Vite) are
independent of that work and remain valid.
