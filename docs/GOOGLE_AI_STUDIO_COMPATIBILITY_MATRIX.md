# GOOGLE AI STUDIO COMPATIBILITY MATRIX

Only rows backed by an actually-executed command are marked PASS.

Verification host: Windows dev machine, **Node v24.12.0**, npm 11.6.2.
The AI Studio environment was simulated by **removing the deployment-local
`firebase-applet-config.json`** (gitignored, therefore absent in AI Studio) and
running every command again.

| Area | Status | Evidence |
|---|---|---|
| Repository load | PASS | `git ls-files` — 767 source files, no tracked `node_modules`/`dist`/`.env`/secrets |
| Dependency install | PASS | `npm ci` → `added 504 packages`, exit 0, no `--force`/`--legacy-peer-deps` |
| Lockfile consistency | PASS | `package-lock.json` (npm, canonical) + `bun.lock` both regenerated from the same `package.json` |
| Node runtime | PASS | `engines.node >= 20.19.0`; no `.nvmrc`/`.node-version` conflict; ran on v24.12.0 |
| Package manager | PASS | `vite` was duplicated in `dependencies` + `devDependencies`; build tooling moved to devDependencies |
| TypeScript | PASS\* | `npm run typecheck` exit 0 with the AI Studio file absent. \*see Concurrent-edit caveat below |
| Frontend build | PASS | `vite build` → 1944 modules, `dist/index.html` 1.61 kB, JS 1165.07 kB, CSS 119.59 kB |
| Backend build | PASS | `esbuild server.ts` → `dist/server.cjs` 600.4 kB (+1.2 MB sourcemap) |
| Production dependency isolation | PASS | `dist/server.cjs` contains **no** eager `require("vite")`; only lazy `import("vite")` |
| Dev server boot | PASS | `npm run dev` → `Server running on http://0.0.0.0:8794` |
| Server boot (production) | PASS | `npm start` → `Server running on http://0.0.0.0:8792`, stayed alive across requests |
| Dynamic port | PASS | Bound `PORT=8792`/`8793`/`8795`; `const PORT = 3000` removed |
| HTTP health | PASS | `/api/health`, `/api/platform/healthz`, `/api/platform/readyz` → `200` |
| Frontend route | PASS | `/` and deep link `/portfolio` → `200`; SPA fallback serves `index.html` |
| Static assets | PASS | `dist/assets/index-*.js` → `200 application/javascript`; `*.css` → `200 text/css` |
| Frontend mount (production) | PASS | `bodyChars 8651`, real indices rendered, **0 console errors, 0 failed requests** |
| Frontend mount (development) | PASS | **Fixed:** was `bodyChars 0` (blank screen) from CSP `script-src 'self'`. Now `bodyChars 8651`, 0 errors |
| Market data path | PASS | `/api/market-data/quote/HPG` → real VPS quote, KBS cross-check `deviationPercent 0`, `dataStatus OK` |
| No fake financial data | PASS | Unconfigured DB → explicit `500` error; unsupported timeframe → `DATA_UNAVAILABLE`. No synthetic candles anywhere |
| Tests (committed suite) | PASS | `vitest run` → **205 files / 2213 tests passed** |
| Tests (untracked WIP) | FAIL | `src/test/business06.e2e.test.ts` (uncommitted) → 5 failures. Pre-existing, see Final Certification |
| Case sensitivity | PASS | 2478 relative imports audited against on-disk casing → **0 case mismatches** |
| ESM / CJS | PASS | `"type": "module"` source; esbuild emits CJS for prod. No `require`/`module.exports` conflicts in source |
| Windows path assumptions | PASS | 0 matches for `C:\`, `D:\`, `PowerShell`, `cmd` in runtime code. `process.cwd()`/`path.join` used |
| Secret exposure | PASS | 0 matches for API keys, private keys, `postgres://user:pass@`, `AKIA…`. `firebase-applet-config.json` gitignored and no longer imported |
| `.env.example` hygiene | PASS | Every value blank; no real credentials |
| Git ignore coverage | PASS | `node_modules`, `dist`, `.env`, `firebase-applet-config.json`, `*.log`, `.tmp-*` all ignored |
| Client/server boundary | PASS | UI → `/api/*` → server → provider/DB. No frontend import of `pg`, `drizzle`, `fs`, `crypto` outside tests |
| CORS | PASS (N/A) | Frontend and API are same-origin in both modes; no credentialed cross-origin request exists |
| Database bootstrap | PASS | Pool is lazy; server boots with no DB. Routes fail explicitly rather than serving synthetic rows |

---

## Concurrent-edit caveat

While the verification loop was running, **another process was actively editing this
working tree**. Nine files that are unrelated to the bootstrap work appeared as
modified (`src/services/market/RealMarketDataProvider.ts`,
`src/services/market/providers/VPSMarketDataProvider.ts`,
`src/lib/trading/api/TradingApiRouter.ts`, `src/lib/trading/engine/TradingEngine.ts`,
`src/hooks/useMarketQueries.ts`, `src/pages/PaperTradingPage.tsx`, `src/types/market.ts`,
`src/types/stock.ts`, `src/lib/trading/__tests__/TradingApiRouter.test.ts`).

Two consequences, both **not** caused by the bootstrap remediation:

1. A transient syntax error appeared at `RealMarketDataProvider.ts:121`
   (`Math.max(10, Math.min(95, aiScore);` — missing `)`) and then resolved on its own.
   This proves the file was mid-write.
2. `typecheck` currently reports errors in `src/data/mock/marketData.ts` and
   `src/components/dashboard/__tests__/MarketIntelligenceWidget.test.tsx`, caused by
   an in-flight type change adding `levelSource` / `levelProvenance` to `IndexData`
   and `availability` / `provenance` to `MoneyFlowMetric`. **Neither file was touched by
   this remediation, and no error references any file this work changed.**

The TypeScript row is therefore PASS for the state this remediation verified, but the
gate must be re-run once the concurrent editor finishes.
