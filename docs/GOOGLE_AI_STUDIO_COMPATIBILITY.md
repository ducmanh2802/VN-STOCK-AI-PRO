# GOOGLE AI STUDIO COMPATIBILITY

Runtime, configuration, and command reference for running **VN STOCK AI PRO** in
Google AI Studio (Cloud Run) or any clean checkout.

---

## 1. SUPPORTED RUNTIME

| Item | Value |
|---|---|
| Node.js | `>= 22.12.0` (declared in `package.json` `engines`; verified on v24.12.0 and on v22.23.3 inside `node:22-alpine`) |
| npm | **`>= 11`** — see §8. `npm ci` fails on npm 10 for a hoisting reason, not an out-of-sync lockfile. |
| Module system | ESM (`"type": "module"`) for source; the production server is bundled to CJS |
| Package manager | **npm** (`package-lock.json` is canonical) |
| Frontend | React 19 + Vite 6 + Tailwind CSS 4 |
| Backend | Express 4 (TypeScript, run through `tsx` in dev, bundled by esbuild for prod) |
| Database | PostgreSQL (Drizzle ORM) — **optional at boot**, required for `/api/stocks*` and `/api/signals` |
| Auth | Firebase Admin (server-side ID-token verification) — **optional**; unset ⇒ protected routes answer `401` |
| Market data | VPS realtime + KBS historical (real, fail-closed — never mocked) |
| Processes / ports | **one** Node process, **one** listening port |

---

## 2. INSTALL

```bash
npm ci          # canonical, uses package-lock.json — requires npm >= 11
```

> **Do not regenerate `package-lock.json` to fix an install error.** The lockfile is
> platform-divergent by construction: npm prunes optional platform binaries for the
> platform it runs on, so a lock written on Linux breaks Windows and vice versa. See §8.

> Do **not** use `--force`, `--legacy-peer-deps`, or `--ignore-scripts`. The tree
> installs clean without them.

---

## 3. ENVIRONMENT VARIABLES

The server **boots with none of these set**. Missing services degrade into explicit
states reported by `GET /api/health`; they are never faked. Full annotated contract
lives in [`.env.example`](../.env.example).

> **Nothing is required to boot, build, start or publish.** `PORT` is injected by the
> platform and `NODE_ENV` is set by the run configuration. Every other name in this
> document is optional. The lists below say what each one *unlocks*, not what must be
> filled in.

### Injected by the platform

| Variable | Purpose |
|---|---|
| `PORT` | Cloud Run forwards a dynamic port. The app reads `process.env.PORT`; it is never hardcoded. |
| `NODE_ENV` | `production` serves `dist/` statically and skips the Vite middleware. **Required for the production path** — without it `npm start` tries to load Vite, which is a devDependency. |

### Optional — each unlocks one capability

| Variable | Unlocks |
|---|---|
| `GEMINI_API_KEY` | Server-side only, for `POST /api/ai/chat`. Without it the copilot answers `GEMINI_CONFIGURATION_REQUIRED`. |
| `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` | PostgreSQL. Required for `/api/stocks*` and `/api/signals`. Add `SQL_PORT` / `SQL_SSL` for a managed instance. |
| `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` | Migration CLI (`drizzle-kit`) only — not used at runtime. |
| `FIREBASE_PROJECT_ID` | `GET /api/users/me`. Falls back to `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` on Cloud Run. Credentials come from **Application Default Credentials** (attached service account) — never mount a service-account JSON key. |

### Optional runtime knobs

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind address. Must be `0.0.0.0` on Cloud Run. |
| `LOG_LEVEL` | `INFO` | `DEBUG` \| `INFO` \| `WARN` \| `ERROR` |
| `DISABLE_HMR` | `false` | AI Studio sets this to `true` to stop HMR/watch flicker during agent edits. Honoured in **both** the config file and the inline Vite options in `server.ts`. |

### Currently unread — safe to leave blank

| Variable | Status |
|---|---|
| `VITE_FIREBASE_*` (7) | Read only by `src/lib/firebase.ts`, which **no module imports**. Tree-shaken out of the bundle (verified: 0 occurrences in `dist/assets/index-*.js`). Kept for a future client sign-in UI. |
| `APP_URL` | No module reads it. |

### Public build variables (`VITE_*`)

> Everything in a `VITE_*` variable is **inlined into the browser bundle** and is
> readable by every visitor. Only the public Firebase *web* values belong here.
> Never place a secret, a database password, or `GEMINI_API_KEY` in one.

---

## 4. DATABASE REQUIREMENTS

PostgreSQL, reached through Drizzle. Schema migrations are in `drizzle/*.sql`.

- The pool is created **lazily** (`src/db/index.ts`), so a missing database never
  prevents startup.
- Routes that need it return an explicit `500` with a Vietnamese error message.
  They never return synthetic rows, placeholder prices, or fabricated fundamentals.
- `drizzle-kit` intentionally refuses to run without `SQL_HOST` / `SQL_DB_NAME` /
  `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` — that is the desired actionable failure.

**Not configured is a supported state.** Market data (`/api/market-data/*`,
`/api/analysis/*`, `/api/stocks/:symbol/recommendations`) and the paper-trading
router work fully without PostgreSQL.

---

## 5. COMMANDS

| Command | What it does |
|---|---|
| `npm ci` | Clean install from the lockfile. |
| `npm run dev` | Dev server: `tsx server.ts`, Vite middleware in-process, HMR on. |
| `npm run build` | `vite build` (SPA → `dist/`) then `esbuild server.ts` (server → `dist/server.cjs`). |
| `npm start` | Production server: `cross-env NODE_ENV=production node dist/server.cjs`. Serves `dist/` statically. |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit`. |
| `npm test` | `vitest run`. |
| `npm run preview` | Vite's own static preview (frontend only, no API). |
| `npm run clean` | Removes `dist/` cross-platform (no `rm -rf`). |

---

## 6. ENDPOINTS

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness **plus honest dependency states** (`database`, `auth`, `gemini`). |
| `GET /api/platform/healthz` | Liveness only — touches no dependency. Safe for probes. |
| `GET /api/platform/readyz` | Readiness, returns `503` when a required dependency is unusable. |
| `GET /api/platform/metrics` | Prometheus exposition (counts/latencies only, never user values). |
| `GET /api/market-data/quote/:symbol` | Real VPS quote, KBS cross-check. |
| `GET /api/market-data/history/:symbol` | Real KBS historical OHLCV + indicators. |
| `GET /api/analysis/:symbol` | Real technical analysis (KBS candles → `StockAnalysisEngine`). |
| `POST /api/ai/chat` | Gemini copilot. Advisory-only; cannot move money. |

All data routes return `dataStatus: "OK" | "DATA_UNAVAILABLE" | "INSUFFICIENT_DATA"`
so the UI can distinguish "no data" from "no data configured".

---

## 7. ARCHITECTURE NOTES THAT AFFECT DEPLOYMENT

**Vite is loaded lazily.** `server.ts` uses `await import('vite')` inside the
non-production branch. A static top-level import would have emitted
`require("vite")` into `dist/server.cjs` and killed the production server whenever
devDependencies are pruned. `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` and
`drizzle-kit` are therefore `devDependencies` only.

**Content Security Policy is environment-aware** (`buildContentSecurityPolicy()`):

- *Production*: `script-src 'self'` — no inline script execution.
- *Development*: adds `'unsafe-inline'` to `script-src`, because the Vite dev server
  injects an inline React-Refresh preamble. Without this the dev server rendered a
  **completely blank page**.

Both modes allow `connect-src` to the two public market-data origins
(`bgapidatafeed.vps.com.vn`, `kbbuddywts.kbsec.com.vn`) and the Google Fonts CDN,
because the SPA fetches those directly. This is an explicit allowlist, not `*`.

**CORS is not configured** — frontend and API are same-origin in both the Vite
middleware mode and the production static build, so no cross-origin request is made.
No credentialed cross-origin access exists to protect.

---

## 8. THE npm VERSION TRAP (read before debugging an install failure)

`npm ci` fails on Linux under npm 10 with a message that blames the lockfile:

```text
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
      package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: @opentelemetry/api@1.9.1 from lock file
npm error Missing: @emnapi/core@1.11.3 from lock file
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

The lockfile is **in sync**. The cause is a hoisting difference:

`@tailwindcss/oxide-wasm32-wasi` — the WASM *fallback*, never executed on linux-x64 or
win32-x64 — declares `@emnapi/core` and `@emnapi/runtime` as real dependencies.
**npm 10** hoists them to the tree root and demands top-level lockfile entries.
**npm 11** leaves them nested under the wasm package and is satisfied by the committed
lock.

| npm | Platform | `npm ci` |
|---|---|---|
| 11.6.2 | linux-x64 (alpine) | 508 packages, exit 0 |
| 11.6.2 | win32-x64 | 505 packages, exit 0 |
| 10.9.9 | linux-x64 (alpine) | **EUSAGE** |

**Fix:** use npm 11. The `Dockerfile` does this with `npm install -g npm@11` in both
install stages, so every container build is covered. `node:22-alpine` ships npm 10.9.9,
so the pin is load-bearing.

**Do not "fix" this by regenerating the lockfile on the failing platform.** npm prunes
optional platform binaries for the platform it resolves on, so a Linux-generated lock
drops the Windows and Android `@tailwindcss/oxide` variants and `lightningcss-win32`,
and then `npm ci` fails on the dev machine with `Missing:
@tailwindcss/oxide-android-arm64@4.3.3 from lock file`. There is no single-platform
regeneration that satisfies both.

---

## 9. KNOWN LIMITATIONS

1. **Identity/session/audit state is process-local.** The platform layer
   (`src/lib/platform/`) uses in-memory stores, so sessions do not survive a restart
   and the audit trail is not durable. Durable identity schema is already reserved in
   `drizzle/0007_platform_identity.sql`. A fresh process **refuses** access rather than
   reconstructing state.
2. **Paper trading is process-local.** `PaperBroker` holds balances in memory, so they
   reset on restart.
3. **`/api/stocks*` requires PostgreSQL.** Without it those routes return `500`.
   The real-data market endpoints do not need it.
4. **Firebase sign-in needs configuration.** Without `FIREBASE_PROJECT_ID` +
   Application Default Credentials, protected routes answer `401` with
   `AUTH_CONFIGURATION_REQUIRED`. Access is denied, never bypassed.
5. **Google Fonts are loaded from a CDN.** In a fully air-gapped environment the app
   falls back to system fonts.
6. **The client bundle is ~1.17 MB** (314 kB gzip) in a single chunk. Route-level code
   splitting is recommended but not required for correctness.
7. **Deep links only resolve for the routes in `PATH_TO_VIEW`**
   (`src/store/useAppStore.ts`). An unrecognised path falls through to the dashboard,
   which is served correctly with HTTP 200 — the SPA never shows a server error, but it
   also does not invent a page.

---

## 10. VERIFIED DEPLOYMENT EVIDENCE

Full P24 audit, defect list with before/after measurements, container runtime results,
and the final certification matrix:
[`docs/P24_GOOGLE_AI_STUDIO_DEPLOYMENT.md`](./P24_GOOGLE_AI_STUDIO_DEPLOYMENT.md).
