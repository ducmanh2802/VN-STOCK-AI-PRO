# AI STUDIO DEV — `src/middleware/auth.ts` ROOT CAUSE

**Scope:** Google AI Studio DEV launcher only.
**Non-goals:** no production change, no authentication rewrite, no test change, no financial-data change.

---

## 1. OBSERVED ERROR

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/app/applet/src/middleware/auth.ts'
imported from /app/applet/server.ts
```

Failing launcher command (AI Studio's forced DEV path):

```
tsx server.ts --port 3000 --host 0.0.0.0
```

which is `package.json` → `"dev": "tsx server.ts"`.

Reported to recur after: environment-variable update, dependency installation,
`bun install`, dev-server restart.

---

## 2. EXACT IMPORT CHAIN

```
server.ts:25
  import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
        │
        ├─► src/middleware/auth.ts:2
        │     import { adminAuth, AdminAuthUnavailableError }
        │       from '../lib/firebase-admin.ts';
        │
        └─► consumed at server.ts:249
              app.get('/api/users/me', requireAuth, handler)
```

Production chain (the same module, bundled):

```
server.ts:25
  └─► npm run build  (esbuild --bundle --format=cjs --outfile=dist/server.cjs)
        └─► Dockerfile CMD ["node", "dist/server.cjs"]
```

Verified in the current build artifact:

| grep in `dist/server.cjs` | matches |
|---|---|
| `requireAuth` | 2 |
| `AUTH_CONFIGURATION_REQUIRED` | 3 |

---

## 3. REPOSITORY EVIDENCE

### 3.1 The file exists — in every layer of Git

| Layer | Result |
|---|---|
| Working tree | `src/middleware/auth.ts` present, **1352 bytes**, mtime unchanged by this session |
| Index (`git ls-files`) | tracked: `src/middleware/auth.ts` |
| `HEAD` (`ab59a986080693a6939b28e8c37eba1f075c0d78`) | blob `deb166dadea6ec438a6565b809912dc96509dbc3`, 1352 B |
| `origin/main` | identical commit `ab59a98…` (local main is **0 ahead / 0 behind**) |
| Working tree vs `HEAD` | `git diff -- src/middleware/auth.ts` → **empty** (byte-identical) |

### 3.2 Git history (question F)

```
$ git log --oneline -- src/middleware/auth.ts
b0ae4d4 update
8a5ce61 feat: initialize stock analysis platform codebase

$ git log --diff-filter=D -- src/middleware/auth.ts
(no output — never deleted)

$ git ls-tree HEAD src/middleware/
100644 blob deb166d… src/middleware/auth.ts
040000 tree 2185798… src/middleware/platform
```

* Added in `8a5ce61` (the initial code import).
* Modified once in `b0ae4d4`.
* **Never deleted, never renamed, never moved.**
* The only commit in `git rev-list HEAD` that lacks the path is the true root
  commit `323ad45` ("Initial commit"), whose tree contains **only `README.md`** —
  it predates the entire codebase, so it is not evidence of a deletion.

### 3.3 Content is a real implementation, not a stub

```ts
// src/middleware/auth.ts (abridged)
export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const decodedToken = await adminAuth.verifyIdToken(token);
  ...
  if (error instanceof AdminAuthUnavailableError) {
    return res.status(401).json({ status: 'AUTH_CONFIGURATION_REQUIRED' });
  }
  return res.status(401).json({ error: 'Unauthorized: Invalid token' });
};
```

Real Firebase ID-token verification, fail-closed when Firebase Admin is
unconfigured. Never lets a request through.

### 3.4 Repository-wide search

```
$ grep -R -n --exclude-dir=node_modules --exclude-dir=.git "middleware/auth" .
```

31 matches. Only **one** of them is executable code that references the module
path:

* `server.ts:25` — the import (the only importer).

All other matches are documentation (`docs/*`) describing the same module.
There is **no second, competing auth implementation** elsewhere in the tree
(`src/lib/platform/identity/tokenVerifier.ts` explicitly reuses
`src/middleware/auth.ts` rather than duplicating it).

### 3.5 AI Studio configuration in the repository

| Candidate | Present? |
|---|---|
| `.idx/`, `.aistudio/`, `aistudio.json`, `firebase.json`, `app.json`, `Procfile` | **No** |
| `.gitignore` / `.dockerignore` exclusions covering `src/middleware` | **No** |
| `metadata.json` | Yes — an AI Studio app manifest (`name`, `majorCapabilities`), **contains no file list and no path config** |
| Scripts that prune source files | **No** (`scripts/` = `ssi-iboard-probe.mjs`, `verify-real-backtest.ts`) |
| `postinstall` / lifecycle scripts | **No** (only `dev`, `build`, `start`, `preview`, `clean`, `lint`, `typecheck`, `test`, `test:watch`, `verify:backtest:real`) |
| `vite.config.ts` | No custom `outDir`; build writes to `dist/` only |

Nothing in the repository can exclude, prune, or relocate
`src/middleware/auth.ts`.

---

## 4. LOCAL DEV REPRODUCTION (repository proven correct)

The real DEV command was executed on this machine:

```
$ DISABLE_HMR=true npx tsx server.ts
◇ injected env (0) from .env
FATAL: cannot bind 0.0.0.0:3000 — address already in use.
```

**This failure is itself proof:** `ERR_MODULE_NOT_FOUND` is raised during ESM
linking, which happens at module load — *before* `startServer()` reaches
`httpServer.listen()`. Reaching the "cannot bind" line means every static
import in `server.ts`, **including line 25 `./src/middleware/auth.ts`**, was
resolved and evaluated successfully. The repository does not reproduce the
error.

A DEV server was also confirmed already running on `:3000`:

| Check | Result |
|---|---|
| Process command | `node --require …/tsx/dist/preflight.cjs --import …/tsx/dist/loader.mjs server.ts` |
| `GET /` | **200** |
| `GET /api/health` | **200** (`PROCESS_OK`, honest `degraded` dependency states) |
| `GET /api/platform/healthz` | **200** |
| `GET /api/macro/status` | **200** |
| `GET /api/trading/status` | **200** |
| `GET /api/stocks` | **503** — no DB configured → honest `DATA_UNAVAILABLE`, never fabricated |
| `GET /api/nope` | `{"error":"NOT_FOUND"}` (JSON 404 guard, not the SPA shell) |
| `GET /api/users/me` | **401** `{"error":"Unauthorized: Missing token"}` — **auth is live, not bypassed** |
| `ERR_MODULE_NOT_FOUND` | **absent** |

---

## 5. ANSWERS TO PHASE-1 QUESTIONS

| # | Question | Answer |
|---|---|---|
| **A** | Does the repository contain an authentication middleware? | **Yes** — `src/middleware/auth.ts`, 1352 B, real Firebase ID-token verification, fail-closed. |
| **B** | Does `server.ts` import a file that does not exist in the repository? | **No.** The target exists in worktree, index, `HEAD` and `origin/main`. |
| **C** | Is the import generated/injected by AI Studio? | **No.** Committed in `8a5ce61`, unchanged in the working tree; `server.ts`'s auth import is byte-identical to `HEAD`. |
| **D** | Is there an equivalent implementation under another path? | **Not applicable** — `src/middleware/auth.ts` *is* the implementation; nothing duplicates it. |
| **E** | Required by production, or DEV-only? | **Both.** `server.ts:249` guards `/api/users/me`; esbuild bundles it into `dist/server.cjs`, which the Docker `CMD` runs. |
| **F** | Did Git history show the file deleted/renamed/moved? | **No.** Added `8a5ce61`, modified `b0ae4d4`, never deleted. |
| **G** | Does the production build depend on it? | **Yes** — `requireAuth` and `AUTH_CONFIGURATION_REQUIRED` are present in `dist/server.cjs`. |

---

## 6. PRODUCTION IMPACT ASSESSMENT

| Item | State |
|---|---|
| `Dockerfile` | **Unchanged** by this session (`git diff -- Dockerfile` → empty) |
| Production entrypoint | `CMD ["node", "dist/server.cjs"]` |
| Container user | `USER app` (non-root) |
| `NODE_ENV` | `production` |
| Vite / HMR | imported **dynamically and only** when `NODE_ENV !== 'production'` (`server.ts:1016`) |
| Auth | enforced; no bypass introduced |
| Financial data / RiskGuard / TradingEngine / providers / `DATA_UNAVAILABLE` | untouched |
| Tests | untouched; none skipped, weakened, or rewritten |

**Production impact of this investigation: NONE.**

---

## 7. AI STUDIO IMPACT ASSESSMENT

The failing path prefix is **`/app/applet/`**:

* `/app/applet/` has **no counterpart anywhere in this repository**
  (`grep -R "applet"` finds only `firebase-applet-config*.json`, which is an
  unrelated, gitignored Firebase web-config filename).
* `/app/applet/` is therefore **Google AI Studio's dev-container workspace
  layout**, not a repository path.
* The import specifier `./src/middleware/auth.ts` resolves relative to the
  importer, so the container resolved it to
  `/app/applet/src/middleware/auth.ts` — i.e. **the container's copy of the
  workspace contains `server.ts` and `src/` but is missing
  `src/middleware/auth.ts`.**
* Because `server.ts` reported line 25 as the *first* failure, the imports on
  lines 3–24 (`./src/db/bootstrapEnv.ts`, `./src/lib/db/index.ts`,
  `./src/lib/analysis/index.ts`, …) **did resolve inside the container**. The
  container holds a substantially complete `src/` tree — the absence is
  specific, not a wholesale missing workspace.

**Conclusion:** the container's file tree has diverged from the git-tracked
repository. The repository has not.

### 7.1 Corroborating observation made during this audit

While this audit was running, **this same working tree was observed losing
67 git-tracked files** (`src/lib/macro/index.ts`, `src/lib/tokens.ts`,
`src/db/seed.ts`, `src/data/mock/marketData.ts`, `src/components/ui/index.ts`,
`src/lib/analysis/enterprise/*`, `src/lib/business/*`, …) between **21:26 and
21:28**, while *other* agent processes were concurrently active in this
directory (a second `opencode`, Google Antigravity `agy.exe`, and a
`browser-automation` QA run against `localhost:3000`).

That event has exactly the signature reported for AI Studio:

* `git status` reports ` D <file>` — **Git still has the file**;
* the working tree does not — **the running environment does not**;
* `tsc --noEmit`, `npm run build` and `vitest run` all still passed, because
  the deleted files were unreferenced.

This session did **not** delete anything: `repoGuards.scanForSecrets` (the only
non-obvious routine executed) is read-only (`readFileSync`/`readdirSync`/
`statSync`), and no `rm`/`rmSync`/`unlink` call exists in any `.ts`/`.tsx`/
`.mjs`/`.js` file in the repository.

**This is corroborating evidence, not proof** of what happens inside AI Studio's
container — the container is not observable from here. It does establish that
"worktree file deleted, git intact" is a real failure mode for this project's
environments, and it is the mechanism that reproduces the reported error
byte-for-byte.

---

## 8. ROOT CAUSE CLASSIFICATION

```
UNKNOWN_BLOCKED
```

Applied literally, by elimination:

| Candidate | Verdict |
|---|---|
| `REPOSITORY_MISSING_MODULE` | **Disproven** — module present in worktree, index, `HEAD`, `origin/main`. |
| `BROKEN_IMPORT_PATH` | **Disproven** — `./src/middleware/auth.ts` correctly targets an existing file. |
| `RENAMED_MODULE` | **Disproven** — never deleted, renamed or moved in history. |
| `AI_STUDIO_RUNTIME_INJECTION` | **Disproven for the import** — the import is genuine, committed repository content, unmodified in the working tree (Phase-1 question C = NO). |
| `DEV_ONLY_CONFIGURATION_ERROR` | **Disproven as a repository cause** — no AI Studio config, no pruning script, no ignore rule, no lifecycle hook in this repository can remove the file. |
| `UNKNOWN_BLOCKED` | **Selected.** |

What is *proven* beyond doubt: **the defect is not in the repository.**
What is *not* provable from inside the repository: the exact external mechanism
(partial workspace materialisation, in-container agent deletion, or stale
snapshot) — the AI Studio dev container offers no observable interface from
here. Per Phase 2, "If evidence is insufficient, choose `UNKNOWN_BLOCKED`.
Never guess."

Related classifications also recorded:

* Phase 3 → `AI_STUDIO_DEV_BLOCKED — EXTERNAL RUNTIME ISSUE`
* Phase 7 → `EXTERNAL_RUNTIME_BLOCKED`

### Non-causal observation (recorded, not fixed)

`tsx server.ts --port 3000 --host 0.0.0.0` passes `--port`/`--host` as argv,
but `server.ts:78-79` reads `process.env.PORT` / `process.env.HOST` only. The
flags are silently ignored. The defaults (`3000`, `0.0.0.0`) happen to match
what AI Studio asks for, so this is **not** the cause of
`ERR_MODULE_NOT_FOUND`, and per Phase 0 rule 7 the production entrypoint was
not touched to satisfy AI Studio.

---

## 9. RECOMMENDED FIX

**Repository: no change.** Phase 3 permits a fix only when the audit proves the
correct target; no repository defect was found, so no repository edit is
justified. Fabricating a module to satisfy a launcher is explicitly forbidden.

**AI Studio DEV container (outside the repository) — restore the file that Git
already tracks:**

```bash
# 1. Confirm the divergence inside the container
git status --short -- src/middleware/auth.ts      # expect: " D src/middleware/auth.ts"

# 2. Restore the tracked file (no new code is written)
git restore src/middleware/auth.ts

# 3. Restart the DEV launcher
npm run dev
```

If the container's clone diverged more broadly, re-materialise the workspace
from the trusted remote (this is the throwaway AI Studio container only —
**never run reset --hard on the local working tree**):

```bash
git fetch origin
git reset --hard origin/main     # ab59a986080693a6939b28e8c37eba1f075c0d78
```

If AI Studio cannot restore its workspace from `origin/main`, then the AI Studio
DEV launcher cannot be certified from this repository — and per Phase 0 rule 10
that fact is documented here rather than papered over with a fabricated module.

---

## 10. REJECTED UNSAFE FIXES

| Rejected fix | Why |
|---|---|
| Create `src/middleware/auth.ts` as a stub / no-op / always-authenticated middleware | Phase 0 rule 1-2 — invents authentication; would silently unprotect `/api/users/me`. |
| Fake user / fake session / fake JWT validation | Phase 0 rule 2; destroys the security guarantee. |
| Hardcoded credentials | Explicitly forbidden (Phase 3). |
| Remove `server.ts:25` "because it causes the error" | Phase 0 rule 4 — would strip `requireAuth` from `/api/users/me`. |
| Disable authentication globally / add a bypass | Phase 0 rule 3; Phase 4 check 5. |
| Replace financial-data behaviour, RiskGuard, TradingEngine, provider truth, freshness or `DATA_UNAVAILABLE` semantics | Phase 0 rule 6; unrelated to this defect. |
| Change the production entrypoint / `Dockerfile` to satisfy AI Studio | Phase 0 rule 7. |
| Delete, skip, weaken or rewrite existing tests so the suite passes | Phase 0 rule 8. |
| Silent fallback (e.g. `try { import } catch {}`) | Phase 0 rule 9 — hides a real failure. |
| Edit this repository to "look correct" for a container we cannot inspect | Phase 0 rule 10 — would corrupt the repository to mask an external condition. |

---

*Generated by the `docs/AI Studio fix.md` protocol. Phases 0-3 complete.*
