# GOOGLE AI STUDIO — PROJECT BOOTSTRAP & RUNABILITY AUTOFIX

## MISSION

You are an autonomous senior full-stack engineer responsible for making the current project:

> **fully loadable, installable, buildable, and runnable inside Google AI Studio / Google AI Studio coding environment**

The project currently cannot be loaded or run correctly in Google AI Studio.

Your job is to:

```text
DISCOVER
→ DIAGNOSE
→ FIX
→ VERIFY
→ RE-RUN
→ FIX AGAIN
→ FINAL AUDIT
```

Do NOT merely explain the problem.

Do NOT stop after identifying errors.

Automatically fix all issues that can safely be fixed.

Continue until the project can actually boot and run.

---

# 1. ABSOLUTE OBJECTIVE

The final state must satisfy:

```text
PROJECT LOAD
    ↓
DEPENDENCIES INSTALL
    ↓
ENVIRONMENT INITIALIZATION
    ↓
TYPECHECK
    ↓
BUILD
    ↓
SERVER START
    ↓
FRONTEND START
    ↓
API AVAILABLE
    ↓
UI AVAILABLE
    ↓
NO FATAL RUNTIME ERROR
```

Google AI Studio must be able to work with the project without requiring undocumented local-machine assumptions.

---

# 2. IMPORTANT SAFETY RULE

This is a compatibility/bootstrap remediation task.

DO NOT redesign the application.

DO NOT rewrite business logic.

DO NOT remove major features just to make the project boot.

DO NOT replace real functionality with mocks.

DO NOT silently disable validation.

DO NOT weaken security.

DO NOT bypass authentication.

DO NOT remove database requirements without explicitly implementing a safe fallback architecture.

DO NOT fabricate financial data.

DO NOT replace production logic with demo data.

Preserve the existing architecture and domain behavior.

---

# 3. INITIAL REPOSITORY DISCOVERY

Immediately inspect:

```bash
pwd
ls
find . -maxdepth 2 -type f | sort | head -500
```

Then inspect:

```text
package.json
package-lock.json
npm-shrinkwrap.json
pnpm-lock.yaml
yarn.lock
vite.config.*
tsconfig*.json
README*
.env*
.gitignore
.gitmodules
Dockerfile*
docker-compose*
server.*
src/**
```

Determine:

```text
runtime
package manager
Node version
frontend framework
backend framework
build system
entry points
dev server
production server
database
environment variables
external services
filesystem assumptions
network assumptions
port assumptions
```

Do not assume npm if another package manager is canonical.

---

# 4. DETECT GOOGLE AI STUDIO CONSTRAINTS

Audit the project for assumptions that commonly break in browser/cloud coding environments.

Check for:

```text
localhost assumptions
127.0.0.1 assumptions
hardcoded Windows paths
C:\...
D:\...
backslashes in paths
absolute filesystem paths
Windows-only commands
PowerShell-only commands
cmd.exe commands
Unix-only commands
shell scripts
native binaries
local certificates
Docker-only dependencies
local databases
local services
hardcoded ports
hardcoded hostnames
process.env assumptions
missing environment variables
secret files
file permissions
case-sensitive import problems
ESM/CJS conflicts
Node version conflicts
browser/server boundary violations
server-side imports in frontend
client-side imports in backend
dynamic imports unsupported by build
path aliases
module aliases
workspace assumptions
symlink assumptions
Git submodules
large generated directories
node_modules committed to repository
dist committed to repository
```

---

# 5. PACKAGE MANAGER AUDIT

Determine exactly which package manager the project expects.

Examples:

```text
package-lock.json → npm
pnpm-lock.yaml → pnpm
yarn.lock → yarn
```

If package manager metadata is inconsistent:

```text
DO NOT randomly delete lockfiles.
```

Determine the canonical package manager from:

```text
package.json
lockfile
README
scripts
CI configuration
```

Then make the project internally consistent.

---

# 6. NODE VERSION AUDIT

Inspect:

```text
package.json engines
.nvmrc
.node-version
CI workflows
Dockerfile
README
```

Determine required Node version.

If the project currently requires a version unavailable in the Google AI Studio runtime:

1. determine whether compatibility can safely be achieved
2. prefer a supported LTS Node version
3. update only where necessary
4. run full regression

Do NOT blindly downgrade dependencies.

---

# 7. INSTALLATION TEST

Perform a clean dependency installation using the canonical package manager.

Use the lockfile.

Prefer:

```bash
npm ci
```

or equivalent.

Capture the complete error.

If installation fails:

```text
classify
→ identify root cause
→ fix
→ reinstall
```

Do not simply use:

```text
--force
--legacy-peer-deps
--ignore-scripts
```

unless you have verified why it is safe.

Do not permanently hide dependency problems.

---

# 8. PACKAGE.JSON AUDIT

Inspect all scripts.

Required functionality should include equivalents of:

```text
dev
build
start
test
typecheck
```

If missing, add appropriate scripts.

Example target architecture:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "start": "...",
    "test": "...",
    "typecheck": "..."
  }
}
```

Use the existing project architecture.

Do not invent unnecessary tooling.

---

# 9. FRONTEND ENTRYPOINT AUDIT

Find:

```text
index.html
main.ts
main.tsx
App.tsx
App.vue
routes
router
```

Verify:

```text
index.html
    ↓
frontend entry
    ↓
root application
    ↓
router
    ↓
main page
```

Fix:

- missing root element
- broken imports
- wrong paths
- case mismatch
- incorrect aliases
- invalid dynamic imports
- missing assets

---

# 10. BACKEND ENTRYPOINT AUDIT

Find the actual server entrypoint.

Examples:

```text
server.ts
server.js
src/server.ts
src/index.ts
app.ts
```

Verify:

```text
process start
    ↓
server initialization
    ↓
middleware
    ↓
routes
    ↓
database
    ↓
listen
```

The server must not crash simply because optional environment variables are missing.

However:

> Never silently replace required production services with fake data.

Use explicit states such as:

```text
CONFIGURATION_REQUIRED
DATABASE_UNAVAILABLE
EXTERNAL_SERVICE_UNAVAILABLE
```

where appropriate.

---

# 11. PORT / HOST AUDIT

Google AI Studio environments may expose a dynamic or forwarded port.

Search for:

```text
3000
3001
5173
8080
localhost
0.0.0.0
```

Avoid hardcoding the external public URL.

Server should generally bind appropriately for the environment.

Prefer:

```text
HOST = process.env.HOST || "0.0.0.0"
PORT = Number(process.env.PORT || existingDefault)
```

Do not change the application's API contract unnecessarily.

---

# 12. VITE / FRONTEND ENVIRONMENT AUDIT

Inspect:

```text
VITE_*
import.meta.env
process.env
```

Ensure browser code does not depend on server-only environment variables.

Fix:

```text
process is not defined
Buffer is not defined
global is not defined
fs cannot be resolved
path cannot be resolved
crypto server API used in browser
```

Do not expose secrets through:

```text
VITE_*
```

or frontend bundles.

---

# 13. SERVER / CLIENT BOUNDARY AUDIT

This is critical.

Detect frontend imports of:

```text
fs
path
crypto
net
tls
child_process
os
pg
drizzle server modules
database repositories
server-only services
secrets
private environment variables
```

Detect backend imports of browser-only APIs:

```text
window
document
localStorage
sessionStorage
navigator
```

Fix architecture rather than hiding errors.

Preferred:

```text
UI
 ↓
API/service boundary
 ↓
server
 ↓
database
```

not:

```text
UI
 ↓
database
```

---

# 14. TYPESCRIPT CONFIGURATION AUDIT

Inspect all:

```text
tsconfig*.json
```

Check:

```text
module
moduleResolution
target
lib
jsx
paths
baseUrl
allowImportingTsExtensions
verbatimModuleSyntax
esModuleInterop
skipLibCheck
```

Fix incompatible combinations.

Do not blindly use:

```text
skipLibCheck=true
noEmit=true
```

as a workaround for real architectural errors.

---

# 15. ESM / COMMONJS AUDIT

Search for mixed usage:

```text
require()
import
module.exports
exports.
type: module
```

Determine canonical module system.

Fix:

```text
ERR_REQUIRE_ESM
Cannot use import statement outside a module
require is not defined
module is not defined
```

Do not create random dual-module hacks.

---

# 16. CASE-SENSITIVITY AUDIT

Google AI Studio/Linux environments may expose import casing errors that Windows hides.

Find cases such as:

```text
./Services/UserService
./services/UserService
```

when actual directory is:

```text
services/
```

Use exact filesystem casing everywhere.

Audit:

```text
.ts
.tsx
.js
.jsx
.vue
.css
.json
```

imports.

---

# 17. WINDOWS PATH AUDIT

This project has historically been developed on Windows.

Search for:

```text
C:\
D:\
\\
Documents
Users
Windows
PowerShell
cmd
```

No application runtime code may depend on:

```text
D:\Stock\...
C:\Users\...
```

Replace with:

```text
process.cwd()
path.resolve()
path.join()
environment variables
```

where appropriate.

Do NOT convert user-facing financial/business data paths blindly.

---

# 18. FILESYSTEM AUDIT

Find code assuming directories already exist.

For writable directories:

```text
create directory
if missing
```

Use safe portable paths.

Do not write into:

```text
src/
node_modules/
```

at runtime.

Avoid assuming:

```text
CWD = repository root
```

unless explicitly guaranteed.

---

# 19. DATABASE BOOTSTRAP AUDIT

Determine whether the application requires:

```text
PostgreSQL
SQLite
MySQL
other
```

Inspect:

```text
DATABASE_URL
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

Determine whether Google AI Studio can access the required database.

If database is required:

- document exact required variables
- create safe startup diagnostics
- avoid fake database
- avoid synthetic financial data
- avoid silently switching to SQLite
- avoid changing production schema semantics

If local development can safely support an embedded database, only introduce it if it preserves the application's domain semantics and does not contaminate production behavior.

---

# 20. ENVIRONMENT CONFIGURATION

Find all environment variables:

```bash
grep -R "process.env" src server* --exclude-dir=node_modules
grep -R "import.meta.env" src --exclude-dir=node_modules
```

Create/update:

```text
.env.example
```

with:

```text
VARIABLE_NAME=
```

Never put real secrets in it.

Classify each:

```text
REQUIRED
OPTIONAL
DEVELOPMENT
PRODUCTION
SECRET
PUBLIC
```

---

# 21. SECRET SCAN

Search for:

```text
API_KEY
SECRET
TOKEN
PASSWORD
PRIVATE_KEY
SERVICE_ACCOUNT
DATABASE_URL
```

Check:

```text
.env
credentials
JSON credential files
firebase config
cloud credentials
```

Never commit secrets.

If a credential is accidentally present:

```text
remove from tracked source
gitignore
replace with environment variable
document configuration
```

Do not print secrets into logs.

---

# 22. GOOGLE AI / API DEPENDENCY AUDIT

If the project uses Google AI / Gemini APIs:

determine:

```text
SDK
API key variable
model configuration
server/client location
```

API keys must remain server-side when appropriate.

Never expose secret keys through:

```text
VITE_
frontend source
HTML
client bundle
```

If AI functionality is optional:

```text
AI_ENABLED=false
```

may be supported.

But do not replace AI results with fake financial analysis.

---

# 23. EXTERNAL SERVICE AUDIT

Enumerate every external dependency:

```text
database
market data
AI API
authentication
storage
email
payments
analytics
```

For each:

```text
SERVICE
REQUIRED?
CONFIG
STARTUP BEHAVIOR
FAILURE BEHAVIOR
MOCK?
```

Required services must fail explicitly.

Optional services must degrade safely.

Never silently fabricate results.

---

# 24. MARKET / FINANCIAL DATA SAFETY

If this project contains financial functionality:

ABSOLUTELY PROHIBITED:

```text
fake price
fake quote
fake index
fake market cap
fake fair value
fake flow
fake fundamentals
fake trading result
```

Do not introduce synthetic data merely to make the UI appear functional.

If real data is unavailable:

```text
UNAVAILABLE
```

or:

```text
CONFIGURATION_REQUIRED
```

must be surfaced.

---

# 25. BUILD AUDIT

Run the actual build.

Example:

```bash
npm run build
```

Fix all:

```text
TypeScript errors
Vite errors
Rollup errors
ESM errors
asset errors
path errors
environment errors
```

Do not stop at the first error if multiple independent errors exist.

---

# 26. TYPECHECK

Run the canonical typecheck.

Fix all real errors.

Do not:

```text
delete types
replace with any
disable TypeScript
```

unless technically justified and documented.

---

# 27. TEST AUDIT

Run:

```text
unit tests
integration tests
API tests
frontend tests
```

Fix environment-specific failures.

Separate:

```text
REAL FAILURE
ENVIRONMENT FAILURE
TEST CONFIGURATION FAILURE
```

Do not weaken tests.

---

# 28. DEV SERVER BOOT TEST

Actually start the application.

Use the project's canonical command.

Example:

```bash
npm run dev
```

or:

```bash
npm start
```

Verify:

```text
process remains alive
no fatal startup exception
port is listening
frontend responds
backend responds
```

---

# 29. HTTP SMOKE TEST

Once server is running, test:

```text
/
health
api health
main application route
```

Use available tools:

```bash
curl
wget
node fetch
```

Verify HTTP status.

Expected:

```text
200
```

or an intentional application status.

Do not consider:

```text
process started
```

sufficient.

The application must respond.

---

# 30. FRONTEND SMOKE TEST

Verify:

```text
HTML loads
JS bundle loads
CSS loads
main application mounts
router initializes
API requests resolve or fail explicitly
```

Look for:

```text
blank screen
uncaught exception
hydration error
chunk loading failure
CORS error
API 404
API 500
```

Fix root causes.

---

# 31. API ROUTE AUDIT

Enumerate registered routes.

Verify frontend calls match backend routes.

Detect:

```text
/api/foo
/api/v1/foo
/foo
```

mismatches.

Detect:

```text
trailing slash
HTTP method
query parameters
body format
CORS
```

issues.

---

# 32. CORS AUDIT

If frontend and backend run on different origins:

configure CORS explicitly.

Do NOT use:

```text
Access-Control-Allow-Origin: *
```

blindly when credentials are involved.

Keep security appropriate.

---

# 33. PROXY AUDIT

Inspect Vite/dev proxy configuration.

If frontend expects:

```text
/api
```

verify the proxy routes correctly.

Avoid hardcoded local-only URLs.

Prefer environment-based API origin where appropriate.

---

# 34. STATIC ASSET AUDIT

Verify:

```text
favicon
images
fonts
CSS
JSON
icons
```

Resolve:

```text
404
case mismatch
absolute path
relative path
```

issues.

---

# 35. LARGE FILE AUDIT

Find:

```text
node_modules
dist
build
coverage
.cache
tmp
logs
generated datasets
large binaries
```

Do not unnecessarily send generated artifacts to Google AI Studio.

Check `.gitignore`.

Do not delete source files.

---

# 36. GIT REPOSITORY AUDIT

Check:

```bash
git status
git ls-files
```

Ensure:

```text
node_modules → ignored
dist → ignored where appropriate
.env → ignored
secrets → ignored
temporary files → ignored
```

Check for accidentally tracked secrets.

---

# 37. DOCUMENTATION

Create:

```text
docs/GOOGLE_AI_STUDIO_COMPATIBILITY.md
```

Include:

```text
Supported runtime
Package manager
Install command
Environment variables
Database requirements
Dev command
Build command
Start command
Health endpoint
API endpoint
Known limitations
```

Also update README only if necessary.

---

# 38. GOOGLE AI STUDIO QUICKSTART

Create or update:

```text
GOOGLE_AI_STUDIO_QUICKSTART.md
```

It must provide the shortest reliable workflow:

```text
1. Install
2. Configure env
3. Start dependencies
4. Run app
5. Verify health
6. Open UI
```

No unnecessary theory.

---

# 39. AUTOMATED REPAIR LOOP

After every fix:

```text
install
→ typecheck
→ test
→ build
→ start
→ HTTP smoke
```

If a new error appears:

```text
diagnose
→ fix
→ rerun
```

Continue automatically.

Do not stop after the first successful build.

---

# 40. COMPATIBILITY MATRIX

Create:

```text
docs/GOOGLE_AI_STUDIO_COMPATIBILITY_MATRIX.md
```

Example:

| Area | Status | Evidence |
|---|---|---|
| Repository load | | |
| Dependencies | | |
| Node runtime | | |
| TypeScript | | |
| Frontend build | | |
| Backend build | | |
| Database | | |
| Environment | | |
| API | | |
| Frontend | | |
| CORS | | |
| Static assets | | |
| Tests | | |
| Production start | | |

Only mark PASS with actual evidence.

---

# 41. FINAL ACCEPTANCE GATE

Google AI Studio compatibility is certified only if:

```text
Repository loads                    PASS
Dependencies install                PASS
No fatal install error              PASS
Typecheck                            PASS
Tests                                PASS
Frontend build                      PASS
Backend build                       PASS
Application starts                  PASS
Server remains alive                PASS
HTTP health                         PASS
Frontend route                      PASS
API route                            PASS
No blank screen                     PASS
No fatal browser error              PASS
No hardcoded local path             PASS
No secret exposure                  PASS
No fake financial data introduced   PASS
```

---

# 42. DO NOT STOP AT BUILD SUCCESS

This is extremely important.

The following is NOT sufficient:

```text
npm install ✓
npm build ✓
```

You must also prove:

```text
server starts
+
frontend loads
+
API responds
+
UI mounts
```

---

# 43. IF DATABASE CANNOT BE PROVIDED

If the current Google AI Studio environment cannot provide the required external database:

DO NOT fabricate a database.

Instead:

1. determine whether the application can legitimately boot without DB
2. if yes, implement explicit degraded mode
3. if no, make startup error actionable
4. document exact DB configuration required
5. keep production semantics unchanged

Example:

```text
APPLICATION STATUS:
DATABASE_CONFIGURATION_REQUIRED
```

is acceptable.

A fake financial database is NOT acceptable.

---

# 44. IF EXTERNAL API CANNOT BE PROVIDED

Same principle.

Do not generate fake data.

Use:

```text
DATA_UNAVAILABLE
```

or:

```text
EXTERNAL_SERVICE_CONFIGURATION_REQUIRED
```

where appropriate.

---

# 45. NO ARCHITECTURAL REGRESSION

During compatibility remediation:

DO NOT remove:

```text
security
authorization
risk controls
validation
financial conservation
data freshness
provenance
learning state
```

DO NOT bypass:

```text
business rules
domain services
repositories
API contracts
```

just to make the project run.

---

# 46. FINAL FULL AUDIT

After the project runs successfully:

run another complete audit.

Search again for:

```text
hardcoded Windows paths
localhost assumptions
missing environment variables
secret exposure
client/server violations
ESM/CJS conflicts
case-sensitive imports
broken routes
fake data
startup crashes
```

Then run:

```text
install
typecheck
test
build
start
HTTP smoke
frontend smoke
```

again.

---

# 47. FINAL REPORT

Create:

```text
docs/GOOGLE_AI_STUDIO_FINAL_CERTIFICATION.md
```

Include:

```text
INITIAL PROBLEM
ROOT CAUSES
FIXES
FILES CHANGED
ENVIRONMENT REQUIREMENTS
COMMANDS VERIFIED
TEST RESULTS
BUILD RESULT
STARTUP RESULT
HTTP RESULT
FRONTEND RESULT
DATABASE RESULT
EXTERNAL SERVICES
REMAINING LIMITATIONS
```

---

# 48. FINAL STATUS

Return:

```text
GOOGLE AI STUDIO — FINAL STATUS

Repository Load: PASS/FAIL
Dependency Install: PASS/FAIL
Typecheck: PASS/FAIL
Tests: PASS/FAIL
Build: PASS/FAIL
Server Boot: PASS/FAIL
HTTP Smoke: PASS/FAIL
Frontend Smoke: PASS/FAIL
API Smoke: PASS/FAIL
Environment Audit: PASS/FAIL
Secret Audit: PASS/FAIL
Financial Data Safety: PASS/FAIL

GOOGLE AI STUDIO RUNNABLE:
YES / NO

BLOCKERS:
...

EXACT START COMMAND:
...

EXACT REQUIRED ENV:
...
```

If everything passes:

```text
GOOGLE AI STUDIO RUNNABLE = YES
```

If anything critical remains:

```text
GOOGLE AI STUDIO RUNNABLE = NO
```

Never claim success without actually starting and testing the application.

---

# 49. START IMMEDIATELY

Do not ask for clarification unless a required external credential/service is genuinely unavailable.

Start with:

```text
DISCOVER
→ INSTALL
→ TYPECHECK
→ TEST
→ BUILD
→ START
→ HTTP SMOKE
→ FRONTEND SMOKE
→ DIAGNOSE
→ FIX
→ REPEAT
```

Continue until:

# GOOGLE AI STUDIO RUNNABLE = YES