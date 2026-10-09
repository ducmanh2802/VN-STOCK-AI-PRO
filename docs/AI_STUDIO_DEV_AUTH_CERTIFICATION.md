# AI STUDIO DEV — AUTH MODULE CERTIFICATION

## STATUS

```
EXTERNAL_RUNTIME_BLOCKED
```

The repository is **proven correct**. No repository defect was found, so no
repository code was changed. The failure exists only inside Google AI Studio's
DEV container, whose workspace file tree no longer matches the git-tracked
repository.

| Phase-2 root-cause classification | `UNKNOWN_BLOCKED` |
|---|---|
| Phase-3 disposition | `AI_STUDIO_DEV_BLOCKED — EXTERNAL RUNTIME ISSUE` |
| Phase-7 status | `EXTERNAL_RUNTIME_BLOCKED` |
| Production regression | **PASS — no change** |

---

## 1. ROOT CAUSE

`server.ts:25` imports `./src/middleware/auth.ts`. That module **exists** in the
working tree, the git index, `HEAD` (`ab59a986080693a6939b28e8c37eba1f075c0d78`)
and `origin/main`, byte-identical to `HEAD`, and was never deleted, renamed or
moved in history. The import is genuine repository content, committed in
`8a5ce61` — it is not injected by AI Studio.

The failing path `/app/applet/src/middleware/auth.ts` has no counterpart in this
repository: `/app/applet/` is AI Studio's **dev-container workspace layout**.
Because `server.ts` reports line 25 as the first failure, the imports on lines
3–24 resolved inside the container — the container holds a substantially
complete `src/` tree that is missing this one tracked file.

**The container's file tree diverged from the repository. The repository did not
diverge from itself.**

Classification `UNKNOWN_BLOCKED` is applied literally: the five repository-side
causes (`REPOSITORY_MISSING_MODULE`, `BROKEN_IMPORT_PATH`, `RENAMED_MODULE`,
`AI_STUDIO_RUNTIME_INJECTION`, `DEV_ONLY_CONFIGURATION_ERROR`) are each
affirmatively disproven by evidence, and the exact external mechanism inside a
container that offers no observable interface cannot be determined without
guessing — which the protocol forbids.

Full evidence: [`docs/AI_STUDIO_DEV_AUTH_ROOT_CAUSE.md`](./AI_STUDIO_DEV_AUTH_ROOT_CAUSE.md).

---

## 2. EXACT FIX

**Repository: none. No file under `src/`, `server.ts`, `Dockerfile` or any test
was created, edited, deleted or weakened by this protocol.**

Remediation belongs to the AI Studio DEV container and restores a file Git
already tracks — it does not authorise any new authentication code:

```bash
git status --short -- src/middleware/auth.ts   # " D src/middleware/auth.ts"
git restore src/middleware/auth.ts
npm run dev
```

If the container's clone diverged more broadly:

```bash
git fetch origin && git reset --hard origin/main   # container only, never locally
```

---

## 3. FILES CHANGED

| File | Change |
|---|---|
| `docs/AI_STUDIO_DEV_AUTH_ROOT_CAUSE.md` | **New** — Phase 1 audit record |
| `docs/AI_STUDIO_DEV_AUTH_CERTIFICATION.md` | **New** — this file (Phase 7) |

Nothing else. Confirmed by `git diff --name-only -- Dockerfile package.json src/middleware/auth.ts` → **empty**.

*(The working tree also contains pre-existing local work-in-progress and a
concurrent edit session — see §9. None of it was produced by this protocol.)*

---

## 4. TESTS

```
$ npx vitest run
Test Files  223 passed (223)
Tests       2575 passed (2575)
VITEST_EXIT=0
```

Test count **improved** during the audit window (222 files / 2570 tests →
223 files / 2575 tests); no test was deleted, skipped, weakened or rewritten.

---

## 5. BUILD

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **exit 0** |
| `dist/server.cjs` | **1,005,651 bytes**, written by `esbuild … --outfile=dist/server.cjs` |
| `requireAuth` occurrences in `dist/server.cjs` | **2** |
| `AUTH_CONFIGURATION_REQUIRED` occurrences in `dist/server.cjs` | **3** |

Auth is bundled into the production artifact, not conditionally dropped.

---

## 6. DEV SMOKE TEST

The actual DEV path (`tsx server.ts`, port 3000) was exercised on this machine:

```
$ DISABLE_HMR=true npx tsx server.ts
◇ injected env (0) from .env
FATAL: cannot bind 0.0.0.0:3000 — address already in use.
```

This is a **positive** result: ESM linking — which raises
`ERR_MODULE_NOT_FOUND` — completes *before* `httpServer.listen()`. Reaching the
bind line proves every static import in `server.ts`, **including line 25
`./src/middleware/auth.ts`**, resolved and evaluated. The repository does not
reproduce the reported error.

A live DEV server (`node --require …/tsx/dist/preflight.cjs --import …/tsx/dist/loader.mjs server.ts`)
was then verified on `:3000`:

| Endpoint | Result |
|---|---|
| `GET /` | **200** — SPA mounts |
| `GET /api/health` | **200** — truthful `PROCESS_OK`, honest dependency states |
| `GET /api/platform/healthz` | **200** |
| `GET /api/macro/status` | **200** |
| `GET /api/trading/status` | **200** |
| `GET /api/stocks` | **503** — DB unconfigured → honest `DATA_UNAVAILABLE`, never fabricated |
| `GET /api/nope` | `{"error":"NOT_FOUND"}` — JSON 404 guard, not the SPA shell |
| `GET /api/users/me` | **401** `{"error":"Unauthorized: Missing token"}` |
| `ERR_MODULE_NOT_FOUND` | **absent** |
| Process alive / bound | **yes** |

---

## 7. PRODUCTION REGRESSION RESULT

| Check | Result |
|---|---|
| 1. Production entrypoint still builds | **PASS** — `dist/server.cjs` written, `requireAuth` bundled |
| 2. Docker production behaviour unchanged | **PASS** — `git diff -- Dockerfile` empty; `CMD ["node","dist/server.cjs"]`, `USER app` (non-root), `NODE_ENV=production`, `PORT=10000`, `HEALTHCHECK` on `/api/health` |
| 3. No financial data changed | **PASS** — no market-data, provider, engine or repository file touched |
| 4. No synthetic financial data introduced | **PASS** — `DATA_UNAVAILABLE` / `INSUFFICIENT_DATA` semantics untouched; `/api/stocks` still answers 503 rather than an empty 200 |
| 5. No authentication bypass introduced | **PASS** — `/api/users/me` → **401**; `requireAuth` unchanged (`git diff -- src/middleware/auth.ts` empty) |
| 6. No existing route lost protection | **PASS** — the only `requireAuth` consumer (`server.ts:249`) is intact; no import removed |
| 7. No `DATA_UNAVAILABLE` behaviour changed | **PASS** — untouched |
| HMR / dev server absent in production | **PASS** — `vite` is imported dynamically and only when `NODE_ENV !== 'production'` (`server.ts:1016`) |

No production redeploy was performed: **no repository production regression was
discovered.**

---

## 8. SECURITY RESULT

| Control | Result |
|---|---|
| Fake / stub / no-op authentication created | **NO** |
| Always-authenticated or bypass middleware introduced | **NO** |
| Authentication disabled globally | **NO** |
| `requireAuth` import removed to silence the error | **NO** |
| Hardcoded credentials or fake JWT/session/user | **NO** |
| Existing tests deleted, skipped or weakened | **NO** |
| Silent fallback (`try/catch` around the import) | **NO** |
| Financial-data behaviour altered | **NO** |
| Real implementation verified present | **YES** — `src/middleware/auth.ts`, 1352 B, Firebase `adminAuth.verifyIdToken`, fail-closed `AUTH_CONFIGURATION_REQUIRED` |
| Route protection verified at runtime | **YES** — `GET /api/users/me` → **401** on a live DEV server |

**Security posture: unchanged and intact.**

---

## 9. CONCURRENT-MODIFICATION DISCLOSURE

During this audit, this working tree was observed losing **67 git-tracked
files** (21:26–21:28) and later gaining further changes, while other agent
processes were concurrently active in the same directory (a second `opencode`,
Google Antigravity `agy.exe`, and a `browser-automation` run against
`localhost:3000`). `git status` reported these as ` D` — Git retained the files
while the working tree did not.

This is recorded because it is the same *shape* of failure reported for AI
Studio (worktree loses a file that Git still tracks), and because it means the
regression numbers above are a snapshot of a tree that another process is
actively editing.

This protocol deleted nothing: the only non-obvious routine executed
(`repoGuards.scanForSecrets`) is read-only, and no `.ts`/`.tsx`/`.mjs`/`.js`
file in the repository calls `rmSync`, `unlinkSync`, `rm`, `rmdir`,
`git clean`, `git checkout` or `git restore`.

---

## 10. CERTIFICATION

```
STATUS                        : EXTERNAL_RUNTIME_BLOCKED
ROOT CAUSE                    : container workspace divergence; repository correct
EXACT FIX                     : none in repo; `git restore src/middleware/auth.ts` in the container
FILES CHANGED                 : docs/AI_STUDIO_DEV_AUTH_ROOT_CAUSE.md, docs/AI_STUDIO_DEV_AUTH_CERTIFICATION.md
TESTS                         : 223 files / 2575 tests passed (0 failed, 0 skipped)
BUILD                         : tsc exit 0, npm run build exit 0, dist/server.cjs 1,005,651 B
DEV SMOKE                     : PASS — boots, binds, no ERR_MODULE_NOT_FOUND, /api/users/me = 401
PRODUCTION REGRESSION         : PASS — Dockerfile, entrypoint, non-root, NODE_ENV untouched
SECURITY                      : PASS — no bypass, no fake auth, no weakened test
REDEPLOY REQUIRED             : NO
```

A missing `auth.ts` was **not** solved by inventing an authentication
implementation. The truth and security of the existing VN-STOCK-AI-PRO
production system are preserved.

---

*Generated by the `docs/AI Studio fix.md` protocol. Phases 0-7 complete.*
