# VN-STOCK-AI-PRO — P23
## DEPLOYMENT RECOVERY → AUTO-FIX → SINGLE SERVER DEPLOY → PUBLIC RUNTIME PASS

### MODE

**AUTONOMOUS EXECUTION — DO NOT STOP AT AUDIT**

You are operating as a senior full-stack / backend / deployment engineer on the existing `VN-STOCK-AI-PRO` repository.

Your mission is NOT to redesign the architecture.

Your mission is:

> **Recover the existing deployment path, simplify only what is unnecessary, automatically fix all blockers, deploy the existing application to ONE public server, and prove the PUBLIC runtime actually works.**

Execution model:

```text
FORENSIC AUDIT
      ↓
DEPLOYMENT RECOVERY
      ↓
DEPENDENCY / ENV RECONCILIATION
      ↓
AUTO-FIX
      ↓
LOCAL BUILD
      ↓
LOCAL RUNTIME
      ↓
SINGLE-SERVER DEPLOY
      ↓
PUBLIC RUNTIME
      ↓
REAL API / DATA VALIDATION
      ↓
GOLDEN-PATH TEST
      ↓
FAILURE → FIX → REBUILD → REDEPLOY → RETEST
      ↓
P23 PUBLIC RUNTIME PASS
```

Do NOT stop after reporting problems.

Do NOT ask for confirmation for normal engineering decisions.

Do NOT declare PASS from static inspection.

Do NOT fabricate credentials, data, API responses, health results, deployment results, screenshots, or test results.

---

# 0. NON-NEGOTIABLE RULES

## 0.1 Preserve existing architecture

Do NOT rewrite the project into a new architecture.

Do NOT replace working systems merely because a simpler architecture exists.

Do NOT delete existing Infra blindly.

Do NOT delete Kubernetes/cloud/observability/deployment code simply because it is not required right now.

Instead classify infrastructure as:

```text
ACTIVE
OPTIONAL
DEFERRED
UNUSED
BLOCKING
BROKEN
```

Only remove code/configuration when forensic evidence proves it is:

- unused,
- duplicate,
- broken and unnecessary,
- or actively preventing deployment.

Prefer:

```text
disable
defer
feature flag
profile
configuration
```

over destructive deletion.

---

# 1. PRIMARY OBJECTIVE

The application must eventually satisfy:

```text
PUBLIC URL
   ↓
Frontend loads
   ↓
Backend responds
   ↓
Health endpoint works
   ↓
Database works
   ↓
Market-data providers work
   ↓
Freshness / fail-closed rules remain intact
   ↓
Research / recommendation APIs work
   ↓
Trading API preserves RiskGuard chain
   ↓
Core UI works
```

Target architecture for this phase:

```text
                INTERNET
                   │
                   ▼
          ┌─────────────────┐
          │ SINGLE SERVER   │
          │                 │
          │ Node / Express  │
          │ React/Vite      │
          │ Existing Core   │
          └────────┬────────┘
                   │
             ┌─────┴─────┐
             ▼           ▼
        PostgreSQL    Real Providers
                     KBS / VPS /
                     VNDIRECT
```

If an existing external PostgreSQL instance is already configured and functional, preserve it.

Do NOT migrate database technology merely to simplify deployment.

Do NOT replace PostgreSQL with SQLite unless forensic evidence proves PostgreSQL is genuinely unnecessary and the migration is explicitly safe.

---

# 2. PHASE A — FORENSIC DEPLOYMENT AUDIT

First inspect the complete repository.

Audit at minimum:

```text
package.json
package-lock.json
vite.config.*
tsconfig.*
server.ts
Express entrypoints
frontend entrypoints
database configuration
Drizzle configuration
Dockerfile*
docker-compose*
render.yaml
railway.json
fly.toml
vercel.json
netlify.toml
Procfile
.env*
.env.example*
deployment scripts
CI/CD
GitHub Actions
Firebase configuration
cloud configuration
Kubernetes
Terraform
Helm
Redis
queues
workers
cron
background jobs
observability
monitoring
health endpoints
CORS
proxy configuration
API routes
static serving
```

Also inspect:

```text
README
deployment docs
architecture docs
environment documentation
scripts
tests
integration tests
runtime tests
```

Do not assume documentation is correct.

Compare:

```text
DOCUMENTED ARCHITECTURE
vs
ACTUAL CODE
vs
ACTUAL STARTUP PATH
vs
ACTUAL BUILD OUTPUT
```

Produce an internal dependency map:

```text
build
  ↓
frontend
  ↓
server
  ↓
database
  ↓
providers
  ↓
API routes
  ↓
business engines
```

Identify every blocker preventing:

```bash
npm install
npm run build
npm run start
```

and public deployment.

---

# 3. PHASE B — STARTUP PATH FORENSICS

Trace the real startup path.

Determine:

```text
Which command starts the server?
Which file is the entrypoint?
Which port is used?
Which HOST is used?
How is frontend built?
Where is frontend output?
How is Express serving frontend?
How are API routes mounted?
How is database initialized?
Which ENV variables are mandatory?
Which ENV variables are optional?
Which ENV variables are obsolete?
Which services are required at startup?
```

The server must be able to bind to the hosting environment.

Prefer:

```text
HOST=0.0.0.0
PORT=<platform-provided PORT>
```

Do not hard-code localhost-only behavior.

Do not hard-code one provider's development port.

---

# 4. PHASE C — ENVIRONMENT VARIABLE FORENSICS

Perform a complete ENV audit.

Build a table internally:

```text
VARIABLE
SOURCE
USED BY
REQUIRED?
BUILD-TIME?
RUNTIME?
SECRET?
DEFAULT?
VALID?
ACTION
```

Inspect variables such as:

```text
HOST
PORT
NODE_ENV
LOG_LEVEL

DATABASE_URL
DATABASE_*

KBS_*
VPS_*
VNDIRECT_*

FIREBASE_*
VITE_FIREBASE_*

DISABLE_HMR
```

and every additional ENV variable actually referenced by code.

## Critical rule

Do NOT ask the user to provide a variable simply because it exists in an `.env.example`.

Trace actual usage first.

Classify:

```text
REQUIRED
OPTIONAL
LEGACY
UNUSED
DEFERRED
```

If Firebase is actually required:

```text
KEEP
```

If Firebase is not required for the core application:

```text
DISABLE/DEFER
```

Do not invent Firebase credentials.

Do not insert placeholder secrets and call the deployment valid.

Do not expose server-side secrets through `VITE_*`.

---

# 5. PHASE D — ENV PROFILE

Introduce or normalize deployment profiles without breaking the existing architecture.

Minimum conceptual profiles:

```text
LOCAL
SINGLE_SERVER
FULL_INFRA
```

Default for this phase:

```text
SINGLE_SERVER
```

The profile must make advanced infrastructure optional.

For example:

```text
Redis
Workers
Queues
Cron
Kubernetes
Advanced telemetry
External orchestration
Multi-service deployment
```

must NOT prevent the core application from starting if they are not required by the actual application path.

Do not fake these dependencies.

If unavailable:

```text
DISABLED / DEFERRED
```

not:

```text
MOCKED
```

---

# 6. PHASE E — DEPENDENCY RECOVERY

Audit:

```text
missing npm packages
incorrect versions
duplicate dependencies
unused dependencies
incorrect import paths
ESM/CJS incompatibilities
Node version mismatch
TypeScript mismatch
Vite configuration
Express startup
database driver
Drizzle configuration
build scripts
production scripts
```

Use the existing package manager.

Do NOT blindly upgrade the entire dependency tree.

Prefer minimal compatible changes.

Every dependency change must be justified by an actual build/runtime blocker.

---

# 7. PHASE F — BUILD RECOVERY

Run the real build.

At minimum:

```bash
npm install
npm run typecheck
npm run build
```

or the project's actual equivalent commands.

If any command fails:

```text
READ ERROR
↓
LOCATE ROOT CAUSE
↓
PATCH
↓
RERUN
```

Do not hide errors.

Do not weaken TypeScript strictness simply to make build pass.

Do not remove tests merely to get green.

Do not disable important lint/type/test gates without documented evidence that they are irrelevant to deployment.

---

# 8. PHASE G — SERVER RUNTIME RECOVERY

Start the actual production-style server.

Validate:

```text
process starts
port binds
HOST binds correctly
database connection
frontend static serving
API routing
health endpoint
error middleware
logging
shutdown
```

The server must remain alive after startup.

Test:

```text
GET /
GET /api/health
```

and all important API namespaces.

If `/api/health` does not exist, implement a minimal truthful health endpoint.

Health must not return fake `"healthy"`.

It should distinguish at minimum:

```text
PROCESS_OK
DATABASE_OK / DEGRADED
PROVIDERS_AVAILABLE / DEGRADED
```

Do not make optional provider failure look like total system health if the application can still operate in a degraded state.

---

# 9. PHASE H — DATABASE RECOVERY

Trace the actual database path.

Validate:

```text
DATABASE_URL
driver
connection
schema
Drizzle
migrations
repositories
startup behavior
runtime queries
```

Run safe database connectivity checks.

Do NOT silently create destructive schema changes.

Do NOT drop production tables.

Do NOT reset database.

Do NOT destroy user data.

If migration is needed:

```text
generate/inspect
→ validate
→ apply safely
→ test
```

---

# 10. PHASE I — MARKET DATA INTEGRITY

This is a financial application.

Preserve the existing source-of-truth policy:

```text
KBS
VPS
VNDIRECT fallback
```

and existing provider logic.

Do NOT replace real providers with:

```text
mock
fake quote
synthetic OHLCV
random data
hard-coded market prices
```

Never fabricate a successful market-data response.

Preserve:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

and existing TTL/freshness rules.

Validate real runtime behavior.

If a provider is unavailable:

```text
DATA_UNAVAILABLE
```

or the existing truthful degraded state must be returned.

Never silently substitute fake numbers.

---

# 11. PHASE J — CRITICAL TRADING SAFETY CHECK

Before declaring runtime success, trace:

```text
POST /api/trading/order
        ↓
Trading API
        ↓
RiskGuard
        ↓
RiskManager
        ↓
TradingEngine
        ↓
PaperBroker
```

The previous known dangerous pattern was:

```text
TradingApiRouter
        ↓
PaperBroker.submitOrder()
```

which could bypass risk controls.

Therefore:

## HARD REQUIREMENT

There must be NO direct production trading route that bypasses:

```text
RiskGuard
RiskManager
TradingEngine
```

unless the architecture explicitly proves an equivalent safety boundary.

Test rejection paths.

Test invalid orders.

Test risk limits.

Test fail-closed behavior.

Do not weaken trading controls to make deployment pass.

---

# 12. PHASE K — API CONTRACT VALIDATION

Enumerate all major routes.

At minimum inspect:

```text
health
market data
quotes
candles
fundamentals
research
recommendation
AI score
risk
paper trading
portfolio
replay
business
learning / non-financial auxiliary APIs if present
```

For each route classify:

```text
WORKING
DEGRADED
BROKEN
UNUSED
PLACEHOLDER
```

Remove accidental placeholder responses from production paths.

Do not invent API responses.

---

# 13. PHASE L — FRONTEND RECOVERY

Build and load the real frontend.

Validate:

```text
root page
routing
assets
CSS
JS
API base URL
environment variables
CORS
production mode
refresh on nested route
404 handling
```

Critical:

A production browser request such as:

```text
https://PUBLIC_HOST/research
```

must not incorrectly return a server 404 if the frontend uses client-side routing.

Configure SPA fallback correctly.

---

# 14. PHASE M — SINGLE SERVER DEPLOYMENT

Use the simplest compatible hosting provider available.

Preferred principle:

```text
ONE WEB SERVICE
ONE APPLICATION
ONE PUBLIC URL
```

If Render Free is suitable for the existing project, it may be used.

If another already-configured provider is materially easier, use that instead.

Do not introduce:

```text
Kubernetes
Terraform
service mesh
Redis cluster
Kafka
Celery
multi-region
microservice split
complex CI/CD
```

for this phase.

These may remain in the repository as:

```text
DEFERRED
```

---

# 15. DEPLOYMENT CONFIGURATION

Create/fix only the minimum deployment configuration needed.

Potential files:

```text
Dockerfile
render.yaml
start script
production config
health configuration
```

Do not create unnecessary configuration files.

Production startup must be deterministic.

Example conceptual flow:

```text
npm install
npm run build
npm run start
```

or the project's correct equivalent.

The platform-provided:

```text
PORT
```

must be respected.

The server must bind:

```text
0.0.0.0
```

when required by the host.

---

# 16. PUBLIC DEPLOYMENT LOOP

Deployment is NOT complete when the platform says:

```text
Deploy successful
```

It is complete only when the actual public URL works.

Execute:

```text
DEPLOY
↓
WAIT FOR REAL DEPLOYMENT
↓
GET PUBLIC URL
↓
HTTP REQUEST
↓
HEALTH CHECK
↓
FRONTEND CHECK
↓
API CHECK
↓
DATABASE CHECK
↓
REAL DATA CHECK
↓
TRADING SAFETY CHECK
```

If failure:

```text
PUBLIC FAILURE
↓
READ LOGS
↓
IDENTIFY ROOT CAUSE
↓
FIX CODE/CONFIG
↓
COMMIT-SAFE CHANGE
↓
BUILD
↓
DEPLOY AGAIN
↓
RETEST
```

Repeat until:

```text
PASS
```

or a genuine external blocker prevents completion.

---

# 17. PUBLIC RUNTIME TEST MATRIX

Perform actual HTTP/browser/runtime checks.

Minimum:

### A. Availability

```text
PUBLIC URL reachable
HTTP 200 or expected redirect
```

### B. Frontend

```text
landing page loads
JS executes
CSS loads
no fatal console error
```

### C. SPA routing

Test several nested routes.

Refresh them directly.

Expected:

```text
frontend route loads correctly
```

### D. Health

```text
/api/health
```

must return truthful runtime status.

### E. Database

Perform a safe real query through the application.

### F. Market data

Request at least one real supported market-data path.

Verify:

```text
source
timestamp
freshness
status
```

No fake values.

### G. Research

Test a real research endpoint.

### H. Recommendation

Test the actual recommendation chain where available.

### I. Risk

Test risk validation.

### J. Paper trading

Test safe paper-order path.

Verify:

```text
RiskGuard
→ RiskManager
→ TradingEngine
→ PaperBroker
```

### K. Failure mode

Force or simulate an unavailable provider only through the existing supported failure mechanism.

Verify:

```text
DATA_UNAVAILABLE
```

or equivalent truthful state.

---

# 18. GOLDEN PATH — PUBLIC USER JOURNEY

Execute a real public golden path:

```text
Open public URL
      ↓
Dashboard
      ↓
Market index
      ↓
Stock search
      ↓
Stock detail
      ↓
Quote
      ↓
Historical chart
      ↓
Fundamentals
      ↓
Research
      ↓
AI Score
      ↓
Recommendation
      ↓
Risk
      ↓
Paper Trading
```

Every step must use actual application behavior.

No mocked navigation.

No fabricated API responses.

Record failures and fix them.

---

# 19. PERFORMANCE BASELINE

Do not over-engineer performance.

Check:

```text
initial page load
API response latency
database query latency
frontend bundle
memory usage
startup time
```

Identify obvious production blockers.

Do NOT introduce complex optimization before proving the application works.

---

# 20. SECURITY MINIMUM

Before PASS verify:

```text
no secret committed
no DATABASE_URL exposed to frontend
no private credentials in VITE variables
CORS is intentional
production errors do not expose secrets
SQL injection protections remain
authentication/authorization paths remain intact
trading endpoints are protected
```

Search repository for:

```text
password=
api_key=
secret=
token=
DATABASE_URL=
private_key
```

Classify findings.

Do not leak actual secrets into logs or reports.

---

# 21. LOGGING

Maintain useful production logs:

```text
startup
server listening
database failure
provider failure
API error
deployment/runtime error
```

Do not implement a full observability platform in this phase.

Deferred:

```text
Prometheus
Grafana
OpenTelemetry
ELK
distributed tracing
advanced alerting
```

unless already required and already working.

---

# 22. INFRA CLASSIFICATION

At the end of the audit, classify every advanced infrastructure component:

```text
ACTIVE
REQUIRED FOR CURRENT SINGLE SERVER
OPTIONAL
DEFERRED
UNUSED
BROKEN
```

Do not delete deferred infrastructure.

Update documentation so it no longer falsely implies that deferred infrastructure is required for the current deployment.

---

# 23. GOOGLE AI STUDIO COMPATIBILITY

The project must remain runnable in Google AI Studio where previously supported.

Check:

```text
npm install
build
runtime
ENV handling
port
filesystem assumptions
browser APIs
server startup
```

Do not make Google AI Studio dependent on unavailable production infrastructure.

If a feature is genuinely environment-specific:

```text
detect
degrade truthfully
```

Never fake production data.

---

# 24. AUTO-FIX POLICY

For every blocker:

```text
AUDIT
→ ROOT CAUSE
→ MINIMAL SAFE PATCH
→ TYPECHECK
→ TEST
→ BUILD
→ RUNTIME
→ REGRESSION
```

Fix automatically when safe.

Do NOT:

```text
delete tests
disable strict mode
remove financial validation
remove risk controls
replace providers with mocks
hard-code successful responses
hide errors
disable fail-closed behavior
delete complex code merely because it looks unused
```

---

# 25. REGRESSION GATE

After every meaningful deployment fix rerun:

```text
typecheck
tests
build
server startup
health
database
provider
critical API
frontend
trading safety
public runtime
```

Do not trust an earlier PASS after changing shared infrastructure.

---

# 26. EVIDENCE REQUIREMENTS

Create/update a deployment evidence document:

```text
docs/P23_DEPLOYMENT_EVIDENCE.md
```

It must contain actual evidence:

```text
date/time
commit/version
Node version
npm version
build command
build result
test result
server command
deployment provider
deployment URL
health response
database result
provider result
frontend result
critical API result
trading safety result
golden path result
known limitations
deferred infrastructure
```

Do NOT paste secrets.

Do NOT claim results that were not actually executed.

---

# 27. FINAL CERTIFICATION MATRIX

The final report must contain:

| Gate | Status | Evidence |
|---|---|---|
| Repository audit | PASS/BLOCKED | actual evidence |
| Dependency recovery | PASS/BLOCKED | actual evidence |
| ENV audit | PASS/BLOCKED | actual evidence |
| Build | PASS/BLOCKED | command/result |
| Typecheck | PASS/BLOCKED | command/result |
| Tests | PASS/BLOCKED | command/result |
| Local runtime | PASS/BLOCKED | actual result |
| Database | PASS/BLOCKED | actual result |
| Market data | PASS/BLOCKED | real provider result |
| Frontend | PASS/BLOCKED | actual result |
| API | PASS/BLOCKED | actual result |
| Risk chain | PASS/BLOCKED | traced/tested |
| Single-server deploy | PASS/BLOCKED | deployment evidence |
| Public URL | PASS/BLOCKED | actual URL/runtime |
| Public health | PASS/BLOCKED | actual response |
| Public frontend | PASS/BLOCKED | actual runtime |
| Public API | PASS/BLOCKED | actual runtime |
| Golden path | PASS/BLOCKED | actual test |
| Regression | PASS/BLOCKED | actual result |
| Google AI Studio | PASS/BLOCKED | actual result |

---

# 28. HARD PASS CONDITION

You may declare:

```text
P23 SINGLE-SERVER PUBLIC RUNTIME — PASS
```

ONLY IF:

```text
[PASS] Application builds
[PASS] Application starts
[PASS] Database works
[PASS] Real market data path works
[PASS] Frontend works
[PASS] API works
[PASS] Risk chain remains protected
[PASS] Single-server deployment succeeds
[PASS] Public URL is reachable
[PASS] Public health works
[PASS] Public frontend works
[PASS] Public API works
[PASS] Golden path works
[PASS] No critical runtime crash
[PASS] No fake/mock/synthetic production data
[PASS] No critical secret exposure
[PASS] Regression suite passes
```

Then:

```text
P23 SINGLE-SERVER PUBLIC RUNTIME — PASS
```

---

# 29. BLOCKED CONDITION

If a genuine external blocker exists:

```text
missing real credential
provider outage
hosting outage
database inaccessible
physical/network restriction
account permission
```

declare:

```text
P23 — BLOCKED
```

with:

```text
EXACT BLOCKER
WHY IT BLOCKS
WHAT WAS ALREADY FIXED
WHAT REMAINS
EXACT NEXT ACTION
```

Never convert:

```text
BLOCKED
```

into:

```text
PASS
```

---

# 30. FINAL OUTPUT

At completion report:

```text
P23 DEPLOYMENT RECOVERY RESULT

Architecture:
...

Deployment:
...

Public URL:
...

Build:
...

Tests:
...

Database:
...

Market Data:
...

Frontend:
...

API:
...

Risk Chain:
...

Golden Path:
...

Google AI Studio:
...

Infra:
ACTIVE:
DEFERRED:
DISABLED:

Remaining blockers:
...

Final:
P23 SINGLE-SERVER PUBLIC RUNTIME — PASS
```

If blocked:

```text
P23 SINGLE-SERVER PUBLIC RUNTIME — BLOCKED
```

with exact evidence.

---

# 31. EXECUTION COMMAND

START NOW.

Do not merely produce an audit report.

Perform the complete loop:

```text
AUDIT
→ RECOVER
→ FIX
→ BUILD
→ TEST
→ RUN
→ DEPLOY
→ PUBLIC TEST
→ FIX
→ REBUILD
→ REDEPLOY
→ RETEST
→ REGRESSION
→ CERTIFY
```

Continue autonomously until:

```text
P23 SINGLE-SERVER PUBLIC RUNTIME — PASS
```

or a genuine external blocker makes PASS impossible.

**Never fake PASS.**
**Never use mock market data.**
**Never bypass financial risk controls.**
**Never destroy existing working architecture.**
**Never introduce unnecessary infrastructure.**

The goal is simple:

> **Make the existing VN-STOCK-AI-PRO application actually run, deploy it on one server, expose it publicly, and prove that the real application works end-to-end.**