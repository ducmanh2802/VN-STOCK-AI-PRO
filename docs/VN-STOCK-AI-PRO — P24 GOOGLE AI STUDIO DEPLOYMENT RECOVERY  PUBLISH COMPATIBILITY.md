# VN-STOCK-AI-PRO — P24
## GOOGLE AI STUDIO DEPLOYMENT RECOVERY → COMPLEXITY AUDIT → SAFE REVERT → PUBLISH COMPATIBILITY → PUBLIC RUNTIME

### EXECUTION MODE

**AUTONOMOUS — AUDIT → DECIDE → FIX → BUILD → RUN → PUBLISH TEST → AUTO-FIX → RETEST**

You are a senior full-stack, Node.js, React, deployment and Google AI Studio compatibility engineer.

Your mission:

> Determine exactly what the existing `VN-STOCK-AI-PRO` project requires to run and publish through Google AI Studio. If the current deployment architecture is unnecessarily complex or incompatible with Google AI Studio, safely revert only the problematic deployment changes and simplify the runtime path until the project can be built, run and published successfully.

Do NOT stop at an audit report.

Do NOT blindly delete infrastructure.

Do NOT blindly revert the entire repository.

Do NOT invent credentials.

Do NOT use mock/synthetic market data.

Do NOT fake a successful publish.

The final objective is:

```text
CURRENT PROJECT
      ↓
FORENSIC DEPLOYMENT AUDIT
      ↓
IDENTIFY TRUE REQUIREMENTS
      ↓
COMPLEXITY / COMPATIBILITY DECISION
      ↓
SAFE REVERT IF NECESSARY
      ↓
SIMPLIFY DEPLOYMENT PATH
      ↓
GOOGLE AI STUDIO COMPATIBILITY
      ↓
BUILD
      ↓
RUN
      ↓
PUBLISH
      ↓
PUBLIC RUNTIME TEST
      ↓
AUTO-FIX
      ↓
REBUILD / REPUBLISH
      ↓
P24 GOOGLE AI STUDIO PUBLISH PASS
```

---

# 1. PRIMARY OBJECTIVE

The project must have a deployment path that is:

```text
Simple
Deterministic
Reproducible
Google AI Studio compatible
Node/Express compatible
React/Vite compatible
Database-aware
Real-data aware
Safe for financial logic
```

The target is NOT:

> “Build the most sophisticated infrastructure possible.”

The target is:

> **“Make the existing application publishable and runnable through Google AI Studio with the minimum necessary deployment complexity.”**

---

# 2. CRITICAL PRINCIPLE

First determine whether the current architecture is actually too complex.

Do NOT assume it is.

Do NOT assume it is not.

Measure it.

Build a dependency graph:

```text
Google AI Studio
       ↓
Build
       ↓
Frontend
       ↓
Node / Express
       ↓
API
       ↓
Database
       ↓
Market Providers
```

Then identify everything that is outside this minimum path:

```text
Kubernetes
Docker orchestration
Terraform
Redis
Queues
Workers
Cron
Cloud services
Firebase
OAuth infrastructure
Observability stacks
Reverse proxies
Service discovery
Load balancers
Multi-server architecture
Background workers
External deployment controllers
```

Classify every item:

```text
REQUIRED
OPTIONAL
DEFERRED
UNUSED
BROKEN
BLOCKING
```

---

# 3. STEP 1 — FORENSIC REPOSITORY AUDIT

Inspect the complete repository.

At minimum:

```text
package.json
package-lock.json
vite.config.*
tsconfig.*
server.ts
server/
src/
client/
frontend/
api/
routes/
services/
providers/
db/
drizzle.*
Dockerfile*
docker-compose*
render.yaml
app.yaml
cloudbuild.*
firebase.*
terraform/
k8s/
helm/
.github/
scripts/
.env*
README*
deployment docs
```

Also inspect all recent deployment-related changes.

Determine:

```text
What was added?
Why was it added?
Is it actually used?
Does Google AI Studio need it?
Does it block startup?
Does it block build?
Does it block publish?
```

---

# 4. STEP 2 — IDENTIFY THE REAL STARTUP PATH

Trace the actual application startup.

Determine exactly:

```text
ENTRYPOINT
BUILD COMMAND
START COMMAND
PORT
HOST
FRONTEND OUTPUT
STATIC SERVING
API MOUNT
DATABASE INITIALIZATION
ENV REQUIREMENTS
```

Produce an internal graph:

```text
npm run build
      ↓
frontend build
      ↓
server build
      ↓
production artifact
      ↓
npm run start
      ↓
Express
      ↓
React static files
      +
API
```

If the current project uses another valid structure, preserve it.

---

# 5. STEP 3 — GOOGLE AI STUDIO COMPATIBILITY AUDIT

Check specifically whether the project assumes capabilities that Google AI Studio does not provide automatically.

Inspect for:

```text
Docker daemon
Kubernetes
Docker Compose
systemd
nginx
Redis server
Postgres server running locally
external worker
background daemon
cron daemon
filesystem persistence
fixed public IP
custom DNS
TLS termination
reverse proxy
multiple ports
multiple processes
privileged OS access
native binaries
GPU requirements
long-running background jobs
```

Classify:

```text
SUPPORTED
NOT REQUIRED
REQUIRES EXTERNAL SERVICE
BLOCKS PUBLISH
UNKNOWN
```

Do not invent support.

---

# 6. STEP 4 — ENVIRONMENT FORENSICS

Scan every environment variable referenced by code.

Build an internal matrix:

| Variable | Used By | Required | Build/Runtime | Secret | Google AI Studio Needed |
|---|---|---:|---|---:|---:|

Pay special attention to:

```text
HOST
PORT
NODE_ENV
LOG_LEVEL
DATABASE_URL

KBS_*
VPS_*
VNDIRECT_*

FIREBASE_*
VITE_FIREBASE_*

DISABLE_HMR
```

Do NOT assume every variable shown in an environment-variable UI is required.

Trace actual references.

Remove/defer unused configuration only after evidence.

---

# 7. STEP 5 — FIREBASE AUDIT

Determine whether Firebase is genuinely required.

Search:

```text
firebase
firebase-admin
Firebase Auth
Firestore
Storage
Analytics
```

Classify:

```text
CORE REQUIRED
OPTIONAL
LEGACY
UNUSED
```

If Firebase is not required for the core application:

```text
DO NOT REQUIRE FIREBASE FOR BASIC STARTUP
```

Do not fabricate:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_APP_ID
FIREBASE_PROJECT_ID
```

If Firebase is genuinely required:

```text
DOCUMENT EXACTLY WHICH CREDENTIALS ARE REQUIRED
```

Never put server secrets into frontend `VITE_*` variables.

---

# 8. STEP 6 — DEPLOYMENT COMPLEXITY SCORE

Calculate an internal deployment complexity score.

Count:

```text
number of services
number of external dependencies
number of required ENV variables
number of startup processes
number of ports
number of deployment configuration files
number of infrastructure technologies
number of mandatory cloud resources
number of background workers
number of persistent storage assumptions
```

Classify:

```text
LOW
MEDIUM
HIGH
EXCESSIVE
```

### Automatic decision rule

If deployment can run with:

```text
ONE NODE PROCESS
ONE PORT
ONE BUILD
ONE START COMMAND
```

prefer this.

If current deployment requires:

```text
multiple processes
multiple services
orchestration
manual infrastructure provisioning
```

and these are NOT essential to core application functionality:

```text
SIMPLIFY
```

---

# 9. STEP 7 — SAFE REVERT DECISION

If the current deployment architecture is excessively complex:

DO NOT execute:

```bash
git reset --hard
git clean -fd
git clean -fdx
git restore .
```

These are forbidden.

Instead:

```text
identify deployment-related changes
↓
inspect diffs
↓
identify files introduced/modified by deployment work
↓
revert only unnecessary deployment modifications
↓
preserve application/business/data/risk logic
```

Never revert:

```text
RiskGuard
TradingEngine
market providers
data freshness
research engine
recommendation engine
AI scoring
paper trading
database business logic
existing passing tests
```

unless the deployment change itself directly modified them and the change is demonstrably broken.

---

# 10. STEP 8 — MINIMAL DEPLOYMENT TARGET

Normalize the project toward:

```text
                   GOOGLE AI STUDIO
                          │
                          ▼
                  ┌──────────────┐
                  │ Node/Express │
                  │              │
                  │ React/Vite   │
                  │ API          │
                  └──────┬───────┘
                         │
                    PostgreSQL
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
             KBS                   VPS
              │
              └──── VNDIRECT fallback
```

Everything else should be:

```text
OPTIONAL
DEFERRED
```

unless proven essential.

---

# 11. STEP 9 — DATABASE STRATEGY

Determine how Google AI Studio accesses the database.

Possible states:

```text
EXTERNAL POSTGRES
LOCAL POSTGRES
EMBEDDED DATABASE
NO DATABASE
```

Preferred:

> Preserve the existing PostgreSQL architecture if already functional.

Do NOT blindly migrate to SQLite.

Do NOT assume Google AI Studio provides a persistent production PostgreSQL database.

Do NOT introduce a new database service merely to make deployment appear simpler.

If database credentials are missing:

```text
BLOCKED
```

unless the project genuinely supports a safe database-free mode.

---

# 12. STEP 10 — MARKET DATA STRATEGY

Preserve real providers:

```text
KBS
VPS
VNDIRECT fallback
```

Do NOT replace providers with:

```text
mock
fixture
sample quote
synthetic OHLCV
hard-coded price
fake API
```

If providers cannot be accessed from the runtime environment:

return the existing truthful state:

```text
DATA_UNAVAILABLE
```

Do not make publish PASS simply because frontend rendering works.

---

# 13. STEP 11 — BUILD RECOVERY

Run the actual commands.

At minimum:

```bash
npm install
npm run typecheck
npm run build
```

Use actual project scripts if names differ.

For every failure:

```text
READ
↓
ROOT CAUSE
↓
MINIMAL PATCH
↓
TYPECHECK
↓
BUILD
↓
TEST
```

Do not weaken compiler settings.

Do not delete tests.

Do not hide warnings/errors.

---

# 14. STEP 12 — LOCAL RUNTIME

Start the application using the same production-style command intended for Google AI Studio.

Verify:

```text
process starts
HOST correct
PORT correct
frontend served
API served
database connected
health endpoint
market provider behavior
```

If necessary implement:

```text
GET /api/health
```

It must return truthful state.

---

# 15. STEP 13 — GOOGLE AI STUDIO RUN

Use the actual Google AI Studio runtime/publish workflow available to the project.

Do not merely claim compatibility because:

```text
npm run build
```

passes.

Actually test:

```text
IMPORT/OPEN
↓
INSTALL
↓
BUILD
↓
RUN
↓
PREVIEW
↓
PUBLISH
```

where supported.

---

# 16. STEP 14 — PUBLISH BLOCKER DETECTION

If Google AI Studio reports an error:

capture the actual error.

Examples:

```text
missing dependency
missing ENV
invalid startup command
wrong port
wrong host
unsupported runtime
filesystem assumption
database unavailable
Firebase initialization failure
frontend build failure
API proxy failure
server crash
```

Fix the root cause.

Do not work around an error by fabricating a successful response.

---

# 17. STEP 15 — SINGLE PROCESS TARGET

Where technically possible, ensure production startup is:

```text
ONE PROCESS
ONE PORT
```

Example conceptual structure:

```text
Node
 ├── Express API
 └── React static build
```

Avoid requiring:

```text
frontend server
+
backend server
+
worker
+
scheduler
+
proxy
```

unless absolutely necessary.

---

# 18. STEP 16 — SPA + API ROUTING

Verify:

```text
/
```

loads frontend.

Verify:

```text
/api/*
```

goes to backend.

Verify direct navigation:

```text
/research
/stock/HPG
/portfolio
/paper-trading
```

does not return an incorrect server 404.

Fix production SPA fallback if necessary.

---

# 19. STEP 17 — FINANCIAL SAFETY REGRESSION

Deployment simplification must NEVER break the financial safety chain.

Trace:

```text
POST /api/trading/order
        ↓
RiskGuard
        ↓
RiskManager
        ↓
TradingEngine
        ↓
PaperBroker
```

Explicitly search for direct:

```text
PaperBroker.submitOrder()
```

calls from HTTP routes.

If a bypass exists:

```text
FIX IT
```

before certification.

---

# 20. STEP 18 — PUBLIC PUBLISH VALIDATION

If Google AI Studio provides a public runtime/published endpoint, test the real endpoint.

Minimum:

```text
HTTP reachable
frontend loads
JS loads
CSS loads
API reachable
health reachable
database reachable
real market-data path tested
research path tested
risk path tested
paper trading safety tested
```

Do not stop at preview if public publishing is the requested goal.

---

# 21. STEP 19 — GOLDEN PATH

Run:

```text
PUBLIC URL
 ↓
Dashboard
 ↓
VN-INDEX / VN30
 ↓
Search stock
 ↓
Stock detail
 ↓
Quote
 ↓
Chart
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

All critical steps must work against the actual deployed runtime.

---

# 22. STEP 20 — AUTO-FIX LOOP

For every failure:

```text
FAIL
 ↓
LOG
 ↓
ROOT CAUSE
 ↓
PATCH
 ↓
TYPECHECK
 ↓
TEST
 ↓
BUILD
 ↓
PUBLISH AGAIN
 ↓
PUBLIC TEST
```

Repeat autonomously.

Do not stop merely because one deployment attempt failed.

---

# 23. REGRESSION PROTECTION

After deployment fixes, rerun:

```text
typecheck
unit tests
integration tests
build
runtime
health
database
market data
research
recommendation
risk
paper trading
frontend
```

Ensure deployment work has not broken:

```text
KBS/VPS/VNDIRECT
freshness
fail-closed behavior
RiskGuard
TradingEngine
PaperBroker
```

---

# 24. WHAT MAY BE SIMPLIFIED

You MAY simplify:

```text
unused deployment scripts
unused cloud config
unused Firebase config
unused workers
unused cron
unused Redis integration
unused monitoring
unused Kubernetes config
unused Terraform
unused reverse proxy
duplicate build commands
duplicate startup scripts
unused environment variables
```

ONLY when evidence shows they are not required for the current Google AI Studio publish path.

---

# 25. WHAT MUST NOT BE SIMPLIFIED AWAY

Never remove:

```text
real market providers
database persistence
freshness validation
fail-closed data behavior
RiskGuard
RiskManager
TradingEngine
PaperBroker
research logic
recommendation logic
AI Score
fundamental analysis
existing passing tests
security boundaries
```

unless there is an independently verified replacement.

---

# 26. NO MOCK POLICY

Absolutely forbidden:

```text
fake market data
fake health status
fake database connection
fake deployment status
fake public URL
fake API responses
fake credentials
synthetic quotes
random stock prices
hard-coded success
```

If something cannot work:

```text
BLOCKED
```

not:

```text
PASS
```

---

# 27. DEPLOYMENT EVIDENCE

Create/update:

```text
docs/P24_GOOGLE_AI_STUDIO_DEPLOYMENT.md
```

Record:

```text
project architecture
startup command
build command
Node version
npm version
required ENV
optional ENV
removed/deferred ENV
database strategy
provider strategy
deployment complexity before
deployment complexity after
changes made
reverted deployment changes
Google AI Studio result
publish result
public runtime result
known limitations
```

Never store secrets.

---

# 28. FINAL CERTIFICATION MATRIX

| Gate | Required |
|---|---|
| Deployment forensic audit | PASS |
| Startup path identified | PASS |
| ENV audit | PASS |
| Dependency audit | PASS |
| Complexity assessment | PASS |
| Safe revert if required | PASS |
| Minimal deployment path | PASS |
| Typecheck | PASS |
| Build | PASS |
| Local runtime | PASS |
| Database | PASS / truthful DEGRADED |
| Real market data | PASS / truthful BLOCKED |
| Frontend | PASS |
| API | PASS |
| Risk chain | PASS |
| Google AI Studio compatibility | PASS |
| Google AI Studio publish | PASS |
| Published runtime | PASS |
| Golden path | PASS |
| Regression | PASS |

---

# 29. HARD PASS CONDITION

Only declare:

```text
P24 GOOGLE AI STUDIO PUBLISH — PASS
```

when the actual project has:

```text
[PASS] Minimal deployment path
[PASS] Build
[PASS] Runtime
[PASS] Frontend
[PASS] API
[PASS] Database
[PASS] Real provider path
[PASS] Risk safety chain
[PASS] Google AI Studio compatibility
[PASS] Actual publish
[PASS] Published runtime
[PASS] Golden path
[PASS] Regression
```

and no critical blocker remains.

---

# 30. BLOCKED CONDITION

If Google AI Studio genuinely cannot publish the current architecture because of an external limitation:

declare:

```text
P24 GOOGLE AI STUDIO PUBLISH — BLOCKED
```

and report:

```text
EXACT LIMITATION
EXACT ERROR
WHAT WAS FIXED
WHAT WAS SIMPLIFIED
WHAT CANNOT BE SOLVED IN CODE
REQUIRED EXTERNAL ACTION
```

Never fake a PASS.

---

# 31. FINAL OUTPUT

At completion output:

```text
P24 GOOGLE AI STUDIO DEPLOYMENT RECOVERY

Before:
Deployment complexity = ...

After:
Deployment complexity = ...

Startup:
...

Build:
...

Runtime:
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

Google AI Studio:
...

Publish:
...

Public Runtime:
...

Golden Path:
...

Reverted:
...

Deferred:
...

Remaining blockers:
...

FINAL:
P24 GOOGLE AI STUDIO PUBLISH — PASS
```

or:

```text
P24 GOOGLE AI STUDIO PUBLISH — BLOCKED
```

with exact evidence.

---

# 32. START NOW

Do not ask for confirmation.

Start with:

```text
AUDIT
→ DETERMINE TRUE DEPLOYMENT REQUIREMENTS
→ MEASURE COMPLEXITY
→ IDENTIFY GOOGLE AI STUDIO BLOCKERS
→ SAFE REVERT IF NECESSARY
→ SIMPLIFY
→ AUTO-FIX
→ BUILD
→ RUN
→ PUBLISH
→ TEST PUBLIC RUNTIME
→ FIX
→ REPUBLISH
→ REGRESSION
→ CERTIFY
```

The final objective is:

> **VN-STOCK-AI-PRO must be publishable through Google AI Studio using the simplest deployment architecture that preserves the real application, real market data, database, financial safety controls, and existing functionality.**

**DO NOT REWRITE THE APP.**

**DO NOT DELETE INFRA BLINDLY.**

**DO NOT FAKE DATA.**

**DO NOT FAKE PUBLISH.**

**DO NOT BYPASS RISK CONTROLS.**

**MAKE THE EXISTING PROJECT RUN.**