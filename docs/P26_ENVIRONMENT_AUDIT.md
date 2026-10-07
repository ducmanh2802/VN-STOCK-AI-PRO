# P26 — ENVIRONMENT AUDIT (PHASE A)

Read-only audit. Nothing was modified during this phase.

Audited at: 2026-10-07 (UTC 13:15–13:35)

---

## 1. GIT

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `46388e1` (`üpdate:`) |
| Working tree before P26 execution | clean except the untracked P26 prompt document itself |
| Tracked secrets | none — `.env.example` only; no `.env` is tracked |
| `dist/` | git-ignored (`.gitignore:3`) |

Pre-existing untracked file at audit time:

    docs/P26 — TAILSCALE PUBLIC RUNTIME HARDENING → AUTO-FIX → FINAL PUBLIC RUNTIME PASS.md

---

## 2. DOCKER IMAGES

| Image | ID | Created | Size |
|---|---|---|---|
| `vn-stock-ai-pro:p25` | `sha256:13f48f5ec355acae43b763d5733c72a3e46b2a90c478f2b5649542afada15533` | 2026-10-06T12:35:13Z | 732 MB |
| `vn-stock-ai-pro:p24-final` | `f20cacd1b915` | — | 732 MB |
| `vnstock-p23:test` | `c5386648ad22` | — | 906 MB |
| `node:22-alpine` | `0a7108bf6c7b` | — | 238 MB |
| `postgres:16-alpine` | `721873c34ceb` | — | 420 MB |

Expected production image `vn-stock-ai-pro:p25` **exists** → no rebuild performed (Phase B).

---

## 3. CONTAINERS

`docker ps -a`:

| Container | Image | Status | Ports | Name |
|---|---|---|---|---|
| `35ccc360a7fd` | `vn-stock-ai-pro:p25` | Up, **healthy** | `0.0.0.0:10000 -> 10000/tcp` | `vn-p25` |

Only one container exists (no stopped sidecars, no Postgres container).

`docker inspect vn-p25`:

| Property | Value |
|---|---|
| Container ID | `35ccc360a7fd3f5a0caf7e729ccaf968fe3c9ef51d0c710b9e8dbfc2479c61d0` |
| Created | 2026-10-07T12:09:36Z |
| Image | `sha256:13f48f5ec355…` (`vn-stock-ai-pro:p25`) |
| Entrypoint | `docker-entrypoint.sh` |
| **Cmd** | `["node","dist/server.cjs"]` |
| **PID 1** | `node dist/server.cjs` (verified in-container via `/proc/1/cmdline`) |
| **User** | `app` (uid **100**, non-root) |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `10000` |
| `LOG_LEVEL` | `INFO` |
| Exposed ports | `10000/tcp` only |
| Port binding | `0.0.0.0:10000 -> 10000/tcp` (`PublishAllPorts=false`) |
| Restart policy | `unless-stopped` |
| Health | `healthy` (healthcheck: `GET /api/health` every 30s, 3 retries, 20s start period) |
| Mounted volumes | **none** (no source-code mount) |
| Network mode | `bridge` |
| RestartCount | `0` |
| OOMKilled | `false` |

Environment variables inside the container (complete list):

    PORT=10000
    NODE_ENV=production
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    NODE_VERSION=22.23.3
    YARN_VERSION=1.22.22
    HOST=0.0.0.0
    LOG_LEVEL=INFO

No database credentials, no API keys, no `.env` file inside the image.

Filesystem inside the container (`/app`):

    /app/dist/index.html
    /app/dist/assets/*
    /app/dist/server.cjs        (881 KB)
    /app/dist/server.cjs.map
    /app/node_modules           (production deps only)
    /app/package.json

No `src/`, no `vite.config.*`, no `tsx`, no dev toolchain at runtime.

---

## 4. LISTENING PORTS (HOST)

| Address | PID | Process |
|---|---|---|
| `0.0.0.0:10000` | 20752 | `com.docker.backend.exe` (Docker Desktop published port) |
| `127.0.0.1:10000` (connection) | 4940 | `tailscaled.exe` — Tailscale Funnel ingress |
| `[::1]:10000` | 16468 | `wslrelay.exe` (WSL2 relay, OS-level, not an application listener) |

No dev-server port is listening: **no `3000`, no `5173`, no `8080`.**

---

## 5. TAILSCALE

| Item | Value |
|---|---|
| Client version | `1.102.4-t3caf7d9e7` |
| Node | `windows-pc` (100.78.237.31), `ducmanh2802@`, Windows, **online** |
| Other node | `duc-manh` (android) offline |
| Funnel | **on** |
| Public listener | `https://windows-pc.tailbc6a27.ts.net` |
| Funnel target | `/ -> proxy http://127.0.0.1:10000` |

---

## 6. BUILD / ENTRYPOINT / SCRIPTS

`package.json` scripts:

    build      vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs
    start      cross-env NODE_ENV=production node dist/server.cjs
    typecheck  tsc --noEmit
    test       vitest run
    dev        tsx server.ts        <- development only, never used by the production container

`Dockerfile` (single Dockerfile, multi-stage: deps → prod-deps → build → runtime):

- base `node:22-alpine`
- runtime stage copies **prod-deps node_modules + package.json + dist only**
- `USER app`, `EXPOSE 10000`, `ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000`
- `HEALTHCHECK` against `/api/health`
- `CMD ["node", "dist/server.cjs"]`

No `docker-compose.yml` exists — the architecture is deliberately a **single container**.

---

## 7. HEALTH ENDPOINTS (LOCAL, container `vn-p25`)

| Endpoint | HTTP | Content-Type |
|---|---|---|
| `/` | 200 | text/html |
| `/api/health` | 200 | application/json |
| `/api/platform/healthz` | 200 | application/json |
| `/api/platform/readyz` | 200 | application/json |
| `/api/trading/status` | 200 | application/json |
| `/api/macro/status` | 200 | application/json |

---

## 8. DETECTED RISKS

| # | Risk | Severity | Classification |
|---|---|---|---|
| R1 | No production PostgreSQL: `database` probe = `UNAVAILABLE (optional: true)`. DB-backed routes (`/api/stocks`, `/api/stocks/search`, `/api/stocks/:symbol`, `/api/signals`) return **500 JSON error**, never fabricated data. | High for feature coverage, **out of P26 scope** (§0 forbids introducing a database) | Known limitation, documented since P23 §5 |
| R2 | Index **level** is `null` / rendered `--` because no authoritative index-level feed exists; `changePercent` is the arithmetic mean of real constituent quotes and is labelled by `levelProvenance: NO_AUTHORITATIVE_INDEX_FEED`. | Low | Truthful degradation — no fabrication |
| R3 | `/api/health` top-level status is `degraded` (not `ok`) because optional dependencies are absent. Healthcheck still returns 200 by design so an optional outage cannot cause a restart loop. | Low | By design (P23 F1) |
| R4 | Container log history shows 5 process starts; the only `die` event in the last 6h was `exitCode=137` (SIGKILL from `docker stop`/desktop restart), **not** an application crash. No `uncaughtException`, no `unhandledRejection`, `RestartCount=0`, `OOMKilled=false`. | Low | Verified not a restart loop |
| R5 | Google AI Studio forced dev launcher (`npm run dev` / `tsx server.ts`, `applet/src/middleware/auth.ts`) — `applet/` does not exist in this repo. | None for production | `AI_STUDIO_DEV_PATH_BLOCKED` if ever triggered |

No risk required a code change.

---

## 9. PHASE A VERDICT

    P25_PRODUCTION_ARTIFACT = AVAILABLE
    RUNNING_CONTAINER        = vn-p25 (vn-stock-ai-pro:p25, healthy, non-root, PID 1 = node dist/server.cjs)
    FUNNEL                   = ON -> http://127.0.0.1:10000
    AUTO-FIXES REQUIRED      = NONE (Phase C: DO NOTHING, certify as-is)
