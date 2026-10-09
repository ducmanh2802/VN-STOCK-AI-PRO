You are working on the existing `VN-STOCK-AI-PRO` repository.

CURRENT STATUS:
- Production baseline is already certified PUBLIC RUNTIME PASS.
- Do NOT weaken or break production behavior.
- Do NOT create fake/mock authentication merely to satisfy AI Studio.
- Do NOT fabricate financial data.
- Do NOT delete, skip, weaken, or rewrite existing tests just to make them pass.

AI STUDIO DEV ERROR:

`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/applet/src/middleware/auth.ts' imported from /app/applet/server.ts`

The error occurs repeatedly after:
- environment variable update
- dependency installation
- `bun install`
- dev server restart

The failing command is:

`tsx server.ts --port 3000 --host 0.0.0.0`

OBJECTIVE:

Find the REAL root cause of the missing `src/middleware/auth.ts` dependency and make the smallest safe correction required for the DEV environment, while preserving the certified production architecture.

============================================================
PHASE 0 — HARD SAFETY RULES
============================================================

1. Do NOT immediately create `src/middleware/auth.ts`.
2. Do NOT create a stub such as:
   - `export const auth = ...`
   - no-op middleware
   - always-authenticated middleware
   - fake user/session
   - fake JWT validation
3. Do NOT disable authentication globally.
4. Do NOT remove an import merely because it causes the error.
5. Do NOT change financial-data behavior.
6. Do NOT modify RiskGuard, TradingEngine, provider truth, freshness, DATA_UNAVAILABLE semantics, or production Docker behavior unless proven necessary.
7. Do NOT change the existing production entrypoint solely to satisfy AI Studio.
8. Preserve all existing tests.
9. No silent fallback.
10. If the AI Studio runtime itself is injecting/modifying `server.ts`, document that fact instead of corrupting the repository.

============================================================
PHASE 1 — AUDIT FIRST
============================================================

Inspect:

- `server.ts`
- `package.json`
- `tsconfig.json`
- `vite.config.*`
- `src/middleware/**`
- `src/lib/**`
- `src/auth/**`
- `src/**/auth*`
- all imports referencing:
  - `auth`
  - `middleware`
  - `requireAuth`
  - `authenticate`
  - `session`
  - `jwt`
- AI Studio-specific configuration if present
- Dockerfile
- production build configuration

Run repository-wide searches equivalent to:

`grep -R -n --exclude-dir=node_modules --exclude-dir=.git "middleware/auth" .`

`grep -R -n --exclude-dir=node_modules --exclude-dir=.git "auth.ts" .`

`grep -R -n --exclude-dir=node_modules --exclude-dir=.git "requireAuth\|authenticate\|session\|jwt" src server.ts`

Determine exactly:

A. Does the repository actually contain an authentication middleware?

B. Does `server.ts` import a file that does not exist in the repository?

C. Is the import generated/injected by AI Studio?

D. Is there an equivalent existing authentication implementation under another path?

E. Is this import required by production or only by a DEV-specific path?

F. Does Git history show that `auth.ts` was deleted/renamed/moved?

G. Does the current production build depend on this module?

Do not modify code until this audit is complete.

Create:

`docs/AI_STUDIO_DEV_AUTH_ROOT_CAUSE.md`

containing:
- observed error
- exact import chain
- repository evidence
- production impact assessment
- AI Studio impact assessment
- root cause classification
- recommended fix
- rejected unsafe fixes

============================================================
PHASE 2 — CLASSIFY ROOT CAUSE
============================================================

Classify exactly one:

`REPOSITORY_MISSING_MODULE`

or

`BROKEN_IMPORT_PATH`

or

`RENAMED_MODULE`

or

`AI_STUDIO_RUNTIME_INJECTION`

or

`DEV_ONLY_CONFIGURATION_ERROR`

or

`UNKNOWN_BLOCKED`

If evidence is insufficient, choose `UNKNOWN_BLOCKED`.

Never guess.

============================================================
PHASE 3 — SAFE FIX
============================================================

Only implement a fix if the audit proves the correct target.

Allowed fixes may include:

- correcting an import path to an existing real module
- restoring a genuinely missing repository file if Git history proves it existed
- separating DEV-only authentication bootstrap from production
- conditionally loading an existing auth integration only when its real dependency is available
- fixing an incorrect AI Studio configuration
- removing an obsolete import if repository evidence proves it is dead code

NOT allowed:

- fake auth
- always-pass auth
- empty middleware
- fake session
- fake JWT
- fake user
- hardcoded credentials
- bypassing security

If the problem is proven to originate entirely from AI Studio runtime injection, do NOT modify production source code just to hide the problem.

Instead document:

`AI_STUDIO_DEV_BLOCKED — EXTERNAL RUNTIME ISSUE`

============================================================
PHASE 4 — REGRESSION
============================================================

Run:

`npm run build`

`npx tsc --noEmit`

`npx vitest run`

Preserve or improve the existing test count.

Verify specifically:

1. Production entrypoint still builds.
2. Docker production behavior is unchanged.
3. No financial data changed.
4. No synthetic financial data introduced.
5. No authentication bypass introduced.
6. No existing route lost protection.
7. No DATA_UNAVAILABLE behavior changed.

============================================================
PHASE 5 — DEV SMOKE TEST
============================================================

If the repository-side fix is valid:

Run the actual DEV command:

`npm run dev -- --port 3000 --host 0.0.0.0`

Verify:
- process stays alive
- server binds successfully
- `/`
- `/api/health`
- one representative API route
- no `ERR_MODULE_NOT_FOUND`

If AI Studio still injects `/app/applet/src/middleware/auth.ts` after the repository is proven correct, classify it as external AI Studio DEV runtime behavior rather than modifying the application to fake compatibility.

============================================================
PHASE 6 — PRODUCTION SAFETY CHECK
============================================================

Verify that the already-certified production architecture remains intact:

- `dist/server.cjs`
- Docker production entrypoint
- non-root container
- `NODE_ENV=production`
- no HMR/dev server
- no auth bypass
- no synthetic financial data

Do NOT redeploy production unless an actual repository production regression is discovered.

============================================================
PHASE 7 — FINAL CERTIFICATION
============================================================

Produce:

`docs/AI_STUDIO_DEV_AUTH_CERTIFICATION.md`

with:

STATUS:
- FIXED
- EXTERNAL_RUNTIME_BLOCKED
- BLOCKED

Include:
- root cause
- exact fix
- files changed
- tests
- build
- DEV smoke test
- production regression result
- security result

IMPORTANT:

A missing `auth.ts` must NEVER be solved by inventing an authentication implementation.

The highest-priority requirement is preserving the truth and security of the existing VN-STOCK-AI-PRO production system.