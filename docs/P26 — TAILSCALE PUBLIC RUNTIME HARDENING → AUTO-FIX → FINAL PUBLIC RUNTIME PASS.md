# VN-STOCK-AI-PRO — P26
# TAILSCALE PUBLIC RUNTIME HARDENING → AUTO-FIX → FINAL PUBLIC RUNTIME PASS

STATUS: EXECUTE AUTONOMOUSLY

## 0. MISSION

Harden and re-certify the existing VN-STOCK-AI-PRO production runtime.

The current production architecture is intentionally:

    SOURCE
      ↓
    npm run build
      ↓
    dist/server.cjs
      ↓
    Docker production image vn-stock-ai-pro:p25
      ↓
    single production container
      ↓
    Tailscale Funnel
      ↓
    PUBLIC RUNTIME

DO NOT migrate to Cloud Run in this phase.

DO NOT introduce new infrastructure.

DO NOT introduce a database, auth service, Redis, queue, Kubernetes, Terraform, CI/CD platform, or paid infrastructure.

The goal is:

    PUBLIC RUNTIME PASS

using the already-certified production container and Tailscale Funnel.

---

# 1. NON-NEGOTIABLE RULES

## 1.1 Production artifact protection

Treat the P25 production artifact as the baseline.

Expected production command:

    node dist/server.cjs

Expected container behavior:

    PID 1 = node dist/server.cjs

Production runtime MUST NOT use:

    npm run dev
    tsx server.ts
    vite
    Vite HMR
    development middleware
    AI Studio dev launcher

Do not change production startup architecture merely to satisfy Google AI Studio's forced development runtime.

---

## 1.2 No fake data

ABSOLUTE RULE:

Never fabricate financial data.

Do not create fake:

- prices
- OHLC
- volume
- market cap
- index values
- foreign flow
- fundamentals
- P/E
- P/B
- DCF
- FCF
- macro indicators
- portfolio values
- signals
- scores
- AI recommendations
- provider timestamps

If real data is unavailable:

    DATA_UNAVAILABLE

or the existing truthful equivalent MUST be returned.

Never replace unavailable data with:

    0
    random values
    hardcoded values
    demo values
    mock market data
    synthetic market data

unless an explicitly isolated test fixture is being executed by the test suite.

---

## 1.3 Fail closed

Preserve:

- RiskGuard
- TradingEngine
- PositionSizer
- provider truthfulness
- freshness semantics
- DATA_UNAVAILABLE semantics
- CURRENT / STALE / UNAVAILABLE / INVALID states

Never bypass safety logic.

Never make an unavailable provider appear CURRENT.

Never infer freshness from request time.

---

# 2. CURRENT BASELINE

P25 previously certified:

- npm run build PASS
- TypeScript PASS
- Vitest PASS
- 210 test files
- 2409 tests
- production bundle exists
- dist/server.cjs exists
- production server starts with node dist/server.cjs
- Docker production image builds
- container runs as non-root
- listener binds 0.0.0.0
- no eager Vite runtime
- no HMR in production
- public Tailscale Funnel runtime works

Known public endpoint:

    https://windows-pc.tailbc6a27.ts.net/

Treat this URL as the current public-runtime candidate.

DO NOT assume it is still healthy.

VERIFY IT LIVE.

---

# 3. PHASE A — ENVIRONMENT AUDIT

Inspect:

- git status
- git branch
- current commit
- Docker images
- running containers
- Tailscale status
- Tailscale Funnel configuration
- listening ports
- environment variables
- production build
- server entrypoint
- Dockerfile(s)
- package.json
- deployment scripts
- health endpoints

Commands may include:

    git status --short
    git rev-parse --short HEAD
    docker images
    docker ps
    docker ps -a
    tailscale status
    tailscale funnel status

Do not modify anything yet.

Produce:

    P26_ENVIRONMENT_AUDIT.md

with:

- current commit
- working tree state
- production image
- image ID/digest if available
- running container
- host port
- container port
- Tailscale node
- Funnel endpoint
- runtime command
- detected risks

---

# 4. PHASE B — PRODUCTION ARTIFACT VERIFICATION

Verify the exact P25 artifact.

Expected:

    vn-stock-ai-pro:p25

If it exists:

    DO NOT rebuild unnecessarily.

Inspect:

    docker inspect vn-p25

Verify:

- PID 1
- command
- environment
- exposed port
- health status
- restart policy
- user
- filesystem
- mounted volumes
- network bindings

The container MUST run production code.

Expected:

    node dist/server.cjs

If P25 image is unavailable, STOP and report:

    P25_PRODUCTION_ARTIFACT_UNAVAILABLE

Do not silently rebuild a different production artifact.

---

# 5. PHASE C — CONTAINER HARDENING

If safe and necessary, harden runtime configuration WITHOUT changing application business logic.

Preferred properties:

- NODE_ENV=production
- non-root user
- restart policy enabled
- health check available
- only required port exposed
- no source-code mount
- no dev dependencies required at runtime
- no Vite runtime
- no tsx runtime
- no hot reload
- no writable application source tree unless required

Do NOT alter:

- RiskGuard
- TradingEngine
- providers
- financial calculations
- decision engine
- data contracts

If the existing P25 container already satisfies these requirements:

    DO NOTHING

and certify it.

---

# 6. PHASE D — LOCAL PRODUCTION RUNTIME TEST

Test the actual production container locally.

Verify:

    /
    /api/health
    /api/platform/healthz
    /api/trading/status
    /api/macro/status
    /api/ai/chat

Also verify all known SPA routes.

Requirements:

- HTTP 200 for valid SPA routes
- valid JSON for API endpoints
- unknown API route returns JSON 404
- stale asset returns 404
- no HTML returned for unknown /api/*
- no stack trace leaked to client
- no dev server banner
- no HMR
- no Vite middleware

Capture representative responses.

Do NOT rewrite unavailable values into fake values.

---

# 7. PHASE E — LOG / PROCESS AUDIT

Inspect production logs.

Search for:

    [vite]
    HMR
    tsx
    npm run dev
    development server
    vite.config
    ECONNREFUSED
    uncaughtException
    unhandledRejection
    crash
    restart loop

Expected:

    ZERO production Vite/HMR markers

Expected runtime:

    node dist/server.cjs

If errors are found:

1. determine whether they are real runtime defects;
2. fix only if the fix is safe;
3. rerun the complete regression suite.

Do NOT hide errors by suppressing logs.

---

# 8. PHASE F — TAILSCALE FUNNEL AUDIT

Verify Tailscale is connected.

Verify Funnel exposes the production runtime.

Expected public endpoint:

    https://windows-pc.tailbc6a27.ts.net/

Check:

    tailscale status
    tailscale funnel status

If Funnel is stopped but the configuration is recoverable:

    AUTO-FIX IT.

Do not introduce another tunnel provider.

Do not create a second public architecture.

---

# 9. PHASE G — PUBLIC RUNTIME TEST

Test the real public URL.

Verify:

    GET /
    GET /api/platform/healthz
    GET /api/health
    GET /api/trading/status
    GET /api/macro/status

Also test representative SPA routes.

Verify:

- HTTP status
- content type
- response body
- API JSON validity
- no redirect loop
- no connection refused
- no timeout
- no mixed HTTP/HTTPS issue
- no broken static assets

The public runtime MUST serve the same production application as the local production container.

---

# 10. PHASE H — PUBLIC/LOCAL PARITY

Compare local production runtime against public runtime.

At minimum compare:

    /
    /api/platform/healthz
    /api/health
    /api/trading/status
    /api/macro/status

Confirm:

    LOCAL PRODUCTION
          ≈
    TAILSCALE PUBLIC PRODUCTION

The public endpoint MUST NOT secretly point at:

- dev server
- Vite
- stale container
- different application
- different source tree

Record:

- container/image identifier
- startup command
- public endpoint
- health result

---

# 11. PHASE I — RESTART / RECOVERY TEST

Test resilience.

Perform a controlled:

    docker restart <production-container>

Then verify:

1. container returns healthy;
2. PID 1 is correct;
3. application responds;
4. Tailscale Funnel still reaches it;
5. public endpoint recovers.

If a restart policy is missing and adding one is safe:

    AUTO-FIX IT.

Do not change application code for this.

---

# 12. PHASE J — DATA TRUTH AUDIT

Audit the public API responses.

Explicitly search for suspicious hardcoded/synthetic values.

Look for:

- fake marketCap
- fake index values
- fake foreignFlow
- fake prices
- fake timestamps
- hardcoded CURRENT
- fallback numbers
- random generators
- demo fixtures leaking into production

Rules:

    REAL DATA → display it

    REAL DATA UNAVAILABLE → DATA_UNAVAILABLE

    STALE DATA → STALE

    INVALID DATA → INVALID

Never:

    UNAVAILABLE → fake CURRENT

If a production data-truth defect is discovered:

    FIX IT

then run all tests again.

---

# 13. PHASE K — AI STUDIO CLASSIFICATION

Google AI Studio may launch:

    npm run dev
    tsx server.ts
    port 3000

If it reports an error such as:

    ERR_MODULE_NOT_FOUND
    /app/applet/src/middleware/auth.ts

DO NOT create a fake auth.ts solely to make AI Studio's development launcher pass.

Classify it as:

    AI_STUDIO_DEV_PATH_BLOCKED

provided that the production artifact remains healthy.

AI Studio development runtime is NOT the production certification target.

Production certification target:

    Docker
      ↓
    node dist/server.cjs
      ↓
    Tailscale Funnel

---

# 14. PHASE L — AUTOMATIC FIX POLICY

You have permission to automatically fix ONLY safe deployment/runtime issues such as:

- wrong Docker restart policy
- incorrect port mapping
- stale container
- stale Funnel configuration
- production environment variable configuration
- missing health check
- incorrect production startup command
- container ownership/user configuration
- public routing configuration

You MUST NOT automatically alter:

- financial formulas
- trading strategy
- RiskGuard
- PositionSizer
- TradingEngine
- provider selection
- provider truthfulness
- portfolio calculations
- DCF calculations
- AI decision logic

unless a concrete production bug is discovered AND the fix is independently validated.

---

# 15. PHASE M — REGRESSION

After every code change:

    npm run build

    npm run typecheck
    OR
    npx tsc --noEmit

    npm test
    OR
    npx vitest run

Target baseline:

    210 test files
    2409 tests

Do not declare PASS if the regression count decreases unexpectedly.

Investigate:

- test failures
- skipped tests
- newly skipped suites
- changed snapshots
- changed coverage behavior

---

# 16. PHASE N — GIT SAFETY

Before changes:

    git status --short

After changes:

    git diff --stat
    git diff

Ensure no accidental changes to:

- secrets
- credentials
- .env files
- generated files
- unrelated source
- test fixtures
- user data

Never commit secrets.

If changes are unnecessary:

    KEEP WORKTREE CLEAN

---

# 17. PHASE O — FINAL BROWSER-LEVEL QA

If browser automation is available, test the real public URL.

Test:

- landing page
- navigation
- watchlist
- market/index UI
- stock detail
- API-backed states
- DATA_UNAVAILABLE states
- loading states
- error states
- responsive basic layout

If browser automation is NOT available:

DO NOT CLAIM BROWSER PASS.

Record:

    BROWSER_QA = NOT_AVAILABLE

and rely on HTTP/runtime verification.

No fabricated browser evidence.

---

# 18. PHASE P — FINAL CERTIFICATION

Create:

    docs/P26_TAILSCALE_PUBLIC_RUNTIME_CERTIFICATION.md

The document MUST contain:

## EXECUTIVE RESULT

One of:

    PUBLIC RUNTIME PASS

or

    PUBLIC RUNTIME PASS WITH LIMITATIONS

or

    PUBLIC RUNTIME BLOCKED

## BUILD

Record:

- build result
- bundle result
- server bundle
- startup command

## TESTS

Record:

- TypeScript result
- Vitest result
- test files
- test count
- regression result

## CONTAINER

Record:

- image
- image ID/digest
- container name
- PID 1
- port
- NODE_ENV
- user
- health status
- restart policy

## PUBLIC RUNTIME

Record:

    Public URL:
    https://windows-pc.tailbc6a27.ts.net/

Record HTTP results for:

- /
- /api/platform/healthz
- /api/health
- /api/trading/status
- /api/macro/status
- representative SPA routes

## TAILSCALE

Record:

- node status
- Funnel status
- public listener
- target port

## DATA TRUTH

Explicitly record:

- provider status
- freshness behavior
- unavailable behavior
- synthetic-data audit
- fake-data audit

## AI STUDIO

If applicable:

    AI Studio DEV path is NOT production certification.

Record any forced-dev failure truthfully.

## BROWSER QA

Either:

    PASS

or:

    NOT_AVAILABLE

Never fabricate.

## REGRESSION

Record:

- source changes
- test changes
- business logic changes
- worktree status

---

# 19. SUCCESS CRITERIA

P26 is PASS only when ALL applicable conditions are true:

[ ] Production image exists
[ ] Production image runs
[ ] PID 1 is node dist/server.cjs
[ ] NODE_ENV=production
[ ] Non-root runtime
[ ] No Vite/HMR in production
[ ] Local production runtime healthy
[ ] Public Tailscale Funnel healthy
[ ] Public / returns 200
[ ] Public health endpoint works
[ ] SPA routes work
[ ] API routes return correct JSON
[ ] Unknown API routes return JSON 404
[ ] No fake financial data
[ ] DATA_UNAVAILABLE remains truthful
[ ] RiskGuard remains protected
[ ] TradingEngine remains protected
[ ] TypeScript PASS
[ ] Vitest PASS
[ ] No unexpected test-count regression
[ ] No secret leakage
[ ] Restart recovery PASS
[ ] Public/local parity PASS
[ ] Browser QA either PASS or explicitly NOT_AVAILABLE
[ ] Certification document created
[ ] Git worktree clean OR all changes explicitly documented

---

# 20. FINAL OUTPUT FORMAT

At the end, print exactly this style:

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
    PASS — <files> files / <tests> tests

    PRODUCTION:
    node dist/server.cjs

    CONTAINER:
    <image>
    PID1=<pid/process>
    HEALTH=<status>

    TAILSCALE:
    CONNECTED
    FUNNEL=PASS

    PUBLIC:
    https://windows-pc.tailbc6a27.ts.net/

    HEALTH:
    PASS

    DATA TRUTH:
    PASS — no synthetic financial data

    AI STUDIO:
    DEV PATH NOT USED FOR PRODUCTION CERTIFICATION

    BROWSER QA:
    <PASS | NOT_AVAILABLE>

    REGRESSION:
    PASS

    GIT:
    <CLEAN | DOCUMENTED CHANGES>

    CERTIFICATION:
    docs/P26_TAILSCALE_PUBLIC_RUNTIME_CERTIFICATION.md

    ============================================================
    FINAL STATUS: PUBLIC RUNTIME PASS
    ============================================================

If any mandatory criterion fails, DO NOT fake PASS.

Instead report the exact blocker and:

    FINAL STATUS: PUBLIC RUNTIME BLOCKED

---

# 21. EXECUTION STYLE

Do not ask for confirmation for routine safe operations.

Execute:

    AUDIT
      ↓
    VERIFY
      ↓
    AUTO-FIX SAFE DEPLOYMENT ISSUES
      ↓
    TEST
      ↓
    PUBLIC VERIFY
      ↓
    RESTART VERIFY
      ↓
    REGRESSION
      ↓
    CERTIFY

Do not stop merely because Cloud Run is unavailable.

Cloud Run is OUT OF SCOPE for P26.

The target is the existing:

    SINGLE SERVER
      +
    PRODUCTION CONTAINER
      +
    TAILSCALE FUNNEL
      =
    PUBLIC RUNTIME PASS