# CODEGPT — PLATFORM-01→05 PLATFORM FOUNDATION
# AUTONOMOUS BUILD + FULL AUDIT + CERTIFICATION

You are the **Platform Foundation Agent** for `VN-STOCK-AI-PRO`.

Your mission is to transform the current investment intelligence application into a **secure, observable, reliable, multi-user-ready production platform** without weakening any certified financial, research, risk, accounting, data, decision, learning, product, or paper-trading semantics.

This is a PLATFORM FOUNDATION roadmap.

It is NOT a feature-development sprint.

It is NOT a trading-execution phase.

It is NOT a cloud/Kubernetes phase.

It is NOT a monetization phase.

The objective is to establish the platform capabilities required before:

```text
BUSINESS / MONETIZATION
→ COMMUNITY
→ MARKETPLACE
→ PREMIUM
→ B2B
→ API
```

and eventually:

```text
PRODUCTION INFRASTRUCTURE
→ DEPLOYMENT
→ WORKERS
→ SCALING
→ CLOUD
→ KUBERNETES
```

---

# 1. PLATFORM ROADMAP

Execute these phases sequentially:

```text
PLATFORM-01
Identity / Authentication
        ↓
PLATFORM-02
Authorization / Roles / Organizations
        ↓
PLATFORM-03
Audit / Provenance / Security
        ↓
PLATFORM-04
Observability / Performance / Reliability
        ↓
PLATFORM-05
Production Hardening / Backup / Recovery
```

After PLATFORM-05:

```text
FULL PLATFORM AUDIT
→ REMEDIATION
→ REGRESSION
→ CERTIFICATION
```

Do not stop between phases unless a genuine blocker exists.

---

# 2. READ GOVERNANCE FIRST

Before any implementation inspect:

```text
docs/AGENT_PARALLEL_EXECUTION.md
```

and all relevant:

```text
docs/
```

including:

```text
DATA FOUNDATION
DECISION OS
RESEARCH
PAPER REPLAY
PRODUCT
LEARNING
PORTFOLIO
MULTI-ASSET
RISK
ACCOUNTING
```

Inspect actual repository state.

Do not trust roadmap documents over code and tests.

---

# 3. ACTUAL BASELINE FIRST

Inspect:

```text
git status
git log --oneline
package.json
package-lock.json
server.ts
src/
tests/
drizzle/
database schema
authentication
authorization
routing
middleware
repositories
services
logging
configuration
environment handling
monitoring
health checks
PaperBroker
ledger
RiskGuard
Decision OS
Product
Learning
Research
```

Determine for every platform capability:

```text
IMPLEMENTED
PARTIALLY IMPLEMENTED
DOCUMENTED ONLY
MISSING
```

Do not rebuild functionality that already exists.

---

# 4. PLATFORM PRINCIPLE

The platform layer must sit below Product and above infrastructure.

Preferred architecture:

```text
PRODUCT
Learning
Research
Decision
Portfolio
Paper Trading
        ↓
APPLICATION / DOMAIN SERVICES
        ↓
PLATFORM
Identity
Authorization
Audit
Observability
Reliability
Security
        ↓
DATABASE / PROVIDERS / INFRASTRUCTURE
```

Platform concerns must not leak financial business logic into generic infrastructure.

---

# 5. FINANCIAL INTEGRITY REMAINS AUTHORITATIVE

The following systems remain protected:

```text
RiskGuard
RiskManager
PositionSizer
TradingEngine
FinancialConservation
MarketDataIntegrityGuard
TradingDataValidator
Portfolio engines
Multi-Asset engines
Decision OS
Research / Backtest
PaperBroker
Ledger
```

Platform implementation must never:

```text
bypass
weaken
rewrite
duplicate
silently override
```

their semantics.

---

# 6. PLATFORM-01 — IDENTITY / AUTHENTICATION

## Objective

Establish a secure identity layer suitable for:

```text
individual users
workspaces
organizations
future premium accounts
future B2B accounts
```

without prematurely implementing billing.

---

# 7. USER MODEL

Create or reuse an authoritative user model.

Potential fields:

```text
userId
email / login identifier
displayName
status
createdAt
updatedAt
lastLoginAt
```

Only include fields justified by actual architecture.

Avoid unnecessary personal data.

Do NOT store:

```text
plaintext passwords
plaintext secrets
API keys in user records
broker credentials without explicit secure architecture
```

---

# 8. PASSWORD / CREDENTIAL SECURITY

If password authentication is implemented:

```text
NEVER store plaintext passwords.
```

Use a modern password hashing mechanism supported by the project/runtime.

Include:

```text
password policy
hashing
credential verification
account lockout / throttling where appropriate
password reset boundary
```

Do not invent cryptographic primitives.

Use established libraries where available.

---

# 9. SESSION MANAGEMENT

Implement secure sessions or an equivalent authentication mechanism appropriate to the existing stack.

Session requirements:

```text
unique session identifier
expiration
revocation
logout
renewal where appropriate
secure storage
```

Security requirements must include appropriate:

```text
HttpOnly
Secure
SameSite
CSRF protection where applicable
```

Do not expose session secrets to the frontend.

---

# 10. AUTHENTICATION STATES

Support explicit states such as:

```text
ACTIVE
DISABLED
LOCKED
PENDING
```

Do not silently authenticate disabled users.

---

# 11. AUTHENTICATION EVENTS

Record appropriate security events:

```text
login success
login failure
logout
session revoked
password changed
password reset
account disabled
```

Avoid logging secrets or credentials.

---

# 12. AUTHENTICATION API

If HTTP routes exist, create a coherent authentication boundary.

Potential routes:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/password/change
POST /auth/password/reset
```

Only implement routes appropriate to the existing architecture.

Do not expose internal database models directly.

---

# 13. AUTHENTICATION ACCEPTANCE

Must prove:

```text
valid credentials → authenticated
invalid credentials → rejected
disabled user → rejected
expired session → rejected
revoked session → rejected
logout → session invalidated
password change → previous credential invalidated
```

Never reveal whether an account exists when doing so creates an enumeration vulnerability.

---

# 14. PLATFORM-02 — AUTHORIZATION / ROLES / ORGANIZATIONS

## Objective

Separate:

```text
WHO ARE YOU?
```

from:

```text
WHAT ARE YOU ALLOWED TO DO?
```

---

# 15. OWNERSHIP MODEL

Support a future-compatible structure:

```text
User
  ↓
Organization
  ↓
Workspace
  ↓
Resources
```

Not every deployment must require Organizations immediately.

The model must support:

```text
personal workspace
organization workspace
```

without duplicating business entities.

---

# 16. ROLES

Start with a minimal role model:

```text
OWNER
ADMIN
MEMBER
VIEWER
```

Do not create dozens of roles without a real requirement.

---

# 17. PERMISSIONS

Use explicit permissions where needed.

Examples:

```text
workspace.read
workspace.write
workspace.delete

research.read
research.write

portfolio.read
portfolio.write

decision.read
decision.write

journal.read
journal.write

scenario.run

paper_replay.run

learning.read
learning.write

admin.manage_users
admin.manage_workspace
audit.read
```

Actual permission names must follow the repository architecture.

---

# 18. AUTHORIZATION PRINCIPLE

Every protected resource must answer:

```text
WHO
CAN
DO WHAT
TO WHICH RESOURCE
IN WHICH SCOPE
```

Do not rely only on frontend route hiding.

Authorization must be enforced server-side.

---

# 19. IDOR PROTECTION

Test against:

```text
User A accessing User B's journal
User A accessing User B's portfolio
User A accessing User B's research
User A accessing User B's scenarios
User A accessing User B's paper replay
User A accessing User B's decisions
```

Expected:

```text
FORBIDDEN
```

or equivalent.

Never rely on hidden UI elements as security.

---

# 20. ROLE TESTS

Verify:

```text
OWNER
ADMIN
MEMBER
VIEWER
```

each receives only intended permissions.

Explicitly test privilege escalation.

---

# 21. RESOURCE OWNERSHIP

Where Product entities already exist, introduce ownership through references rather than duplicating objects.

For example:

```text
ResearchWorkspace
Decision
Journal
Scenario
PaperReplay
Alert
LearningProgress
```

must have a clear ownership/scope boundary.

Do not mutate existing financial semantics to achieve this.

---

# 22. PLATFORM-03 — AUDIT / PROVENANCE / SECURITY

## Objective

Create a trustworthy audit layer.

The platform must be able to answer:

```text
WHO
DID WHAT
WHEN
TO WHICH OBJECT
FROM WHICH VERSION
WITH WHAT RESULT
```

---

# 23. AUDIT LOG

Create an append-oriented audit model.

Potential fields:

```text
auditId
timestamp
actorUserId
organizationId
workspaceId
action
resourceType
resourceId
beforeVersion
afterVersion
requestId
correlationId
result
metadata
```

Do not store sensitive secrets.

---

# 24. AUDIT EVENTS

Capture important events such as:

```text
authentication
authorization changes
workspace changes
decision creation
decision update
journal creation
research experiment
backtest
paper replay
paper order
paper fill
portfolio mutation
risk rejection
configuration change
AI interaction where appropriate
admin action
```

Not every read needs a database audit record.

Avoid creating an unusably large audit system.

---

# 25. IMMUTABILITY

Audit records must not be casually editable or deletable through normal application APIs.

If retention/deletion is legally required:

```text
implement explicit policy
```

Do not silently delete history.

---

# 26. REQUEST CORRELATION

Introduce a request/correlation ID where appropriate:

```text
HTTP request
 ↓
service
 ↓
domain engine
 ↓
repository
 ↓
audit
```

This enables:

```text
"Why did this decision / paper order happen?"
```

to be reconstructed.

---

# 27. DATA PROVENANCE

Connect platform audit with existing financial provenance.

Preserve references to:

```text
data source
dataset version
research experiment
strategy version
decision version
risk version
paper replay manifest
AI context
```

Do not duplicate entire datasets.

Use stable IDs and version references.

---

# 28. SECURITY BASELINE

Audit:

```text
input validation
authentication
authorization
session handling
CSRF where applicable
CORS
security headers
rate limiting
secret handling
error leakage
SQL injection
path traversal
unsafe serialization
XSS
```

Use existing framework capabilities.

Do not invent custom security mechanisms unnecessarily.

---

# 29. ERROR RESPONSE SECURITY

Production errors must not expose:

```text
database credentials
stack traces
environment variables
session secrets
internal tokens
SQL statements
provider credentials
```

Development diagnostics may remain available under controlled configuration.

---

# 30. PLATFORM-04 — OBSERVABILITY / PERFORMANCE / RELIABILITY

## Objective

Make the system observable enough to operate safely.

The platform should answer:

```text
IS THE SYSTEM HEALTHY?
```

and:

```text
WHERE IS IT SLOW?
```

and:

```text
WHAT FAILED?
```

and:

```text
IS MARKET DATA HEALTHY?
```

---

# 31. HEALTH CHECKS

Implement appropriate:

```text
liveness
readiness
dependency health
database health
market-data provider health
```

Do not expose sensitive internal information.

Distinguish:

```text
PROCESS ALIVE
```

from:

```text
SYSTEM READY
```

---

# 32. METRICS

Track useful metrics such as:

```text
request count
error count
latency
database latency
provider latency
cache hit/miss
data freshness
replay duration
research execution duration
AI latency
queue/job duration where applicable
```

Do not collect meaningless metrics merely to increase metric count.

---

# 33. FINANCIAL SYSTEM METRICS

Where appropriate expose operational metrics for:

```text
risk rejection count
paper order rejection count
paper fill count
accounting reconciliation failures
data-quality failures
stale data requests
```

Do not expose private portfolio values globally.

Separate:

```text
operational metrics
user financial data
```

---

# 34. LOGGING

Implement structured logs where appropriate.

Minimum fields:

```text
timestamp
level
requestId
correlationId
service
event
duration
status
```

Avoid:

```text
passwords
tokens
API keys
broker credentials
full sensitive payloads
```

---

# 35. LOG LEVELS

Use clear levels:

```text
DEBUG
INFO
WARN
ERROR
```

Do not log every market tick at INFO level if it destroys observability.

---

# 36. FAILURE SEMANTICS

The platform must preserve:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

for financial data.

Do not convert:

```text
UNAVAILABLE
```

into:

```text
HTTP 200 with fake value
```

Do not hide upstream failures.

---

# 37. PERFORMANCE AUDIT

Inspect:

```text
N+1 queries
unbounded queries
missing indexes
slow joins
large JSON payloads
duplicate calculations
duplicate requests
unnecessary AI calls
unbounded logs
memory leaks
```

Optimize only after measuring.

Do not prematurely introduce distributed infrastructure.

---

# 38. CACHING

Review existing cache policies.

Preserve certified freshness:

```text
quote freshness
historical data freshness
fundamental freshness
```

Do not introduce a cache that can make:

```text
CURRENT
```

look current when it is not.

Every cache must have:

```text
owner
TTL
invalidation rule
freshness semantics
```

---

# 39. RELIABILITY

Test:

```text
database unavailable
provider unavailable
provider timeout
malformed response
partial failure
AI unavailable
paper replay failure
job interruption
```

The system must fail predictably.

---

# 40. PLATFORM-05 — PRODUCTION HARDENING / BACKUP / RECOVERY

## Objective

Prepare the application for production operation without introducing cloud/Kubernetes yet.

This is:

```text
PRODUCTION READINESS
```

not:

```text
PRODUCTION DEPLOYMENT
```

---

# 41. CONFIGURATION MANAGEMENT

Separate:

```text
development
test
production
```

configuration.

Never hardcode:

```text
password
API key
secret
database credential
session secret
```

into source code.

---

# 42. ENVIRONMENT VALIDATION

At startup validate required configuration.

Missing critical configuration should produce:

```text
explicit startup failure
```

not:

```text
silent fallback
```

---

# 43. SECRET MANAGEMENT

Secrets must not appear in:

```text
Git
logs
API responses
client bundles
database audit metadata
error messages
```

Search repository and build artifacts for accidental leakage.

---

# 44. DATABASE MIGRATION SAFETY

Audit:

```text
migration ordering
migration ownership
rollback strategy
schema drift
production safety
```

Never:

```text
renumber migrations
overwrite migration
delete migration to hide a problem
```

---

# 45. BACKUP STRATEGY

Define and document:

```text
database backup
backup frequency
retention
encryption
restore procedure
verification
```

The implementation must match actual infrastructure capabilities.

Do not claim automated backups exist if only documentation exists.

Clearly distinguish:

```text
DESIGNED
IMPLEMENTED
VERIFIED
```

---

# 46. RESTORE TEST

A backup is not certified until restore is tested where technically possible.

Verify:

```text
backup created
backup readable
restore succeeds
schema valid
critical data present
application can start
```

---

# 47. DISASTER RECOVERY

Document:

```text
RPO
RTO
failure modes
recovery procedure
data-loss scenarios
operator steps
```

If exact RPO/RTO cannot be guaranteed, state:

```text
TARGET
```

rather than:

```text
GUARANTEED
```

---

# 48. GRACEFUL SHUTDOWN

Implement where appropriate:

```text
SIGTERM
SIGINT
connection draining
job shutdown
replay shutdown
database connection close
```

Do not terminate in-flight financial operations in a corrupting state.

---

# 49. REQUEST TIMEOUTS

Review all external operations:

```text
database
market data
AI
external HTTP
long research
paper replay
```

Avoid infinite waits.

Use explicit timeout semantics.

---

# 50. RATE LIMITING

Protect appropriate endpoints:

```text
login
password reset
AI
research
backtest
paper replay
expensive queries
```

Do not rate-limit critical internal operations in a way that corrupts accounting.

---

# 51. RESOURCE LIMITS

Prevent:

```text
unbounded replay
unbounded research query
unbounded AI context
unbounded file upload
unbounded API payload
unbounded database query
```

Use explicit limits.

---

# 52. FILE / UPLOAD SECURITY

If uploads exist:

```text
validate type
validate size
validate filename
sanitize path
store outside executable paths
scan where appropriate
```

Never trust client MIME type alone.

---

# 53. API SECURITY

Audit:

```text
authentication
authorization
validation
pagination
rate limits
error handling
CORS
CSRF
headers
```

No endpoint should expose internal database records without authorization.

---

# 54. FRONTEND SECURITY

Audit:

```text
token/session handling
XSS
unsafe HTML
local storage of secrets
sensitive data exposure
source maps
environment variables
```

Never expose server secrets through Vite/client configuration.

---

# 55. PLATFORM TEST MATRIX

At minimum:

## Authentication

```text
login
logout
expired session
revoked session
invalid credentials
disabled account
```

## Authorization

```text
owner
admin
member
viewer
cross-user access
cross-workspace access
privilege escalation
```

## Audit

```text
create
update
delete
authorization change
paper action
decision action
```

## Reliability

```text
DB unavailable
provider unavailable
timeout
malformed provider
AI unavailable
```

## Security

```text
SQL injection
XSS
CSRF where applicable
IDOR
secret leakage
path traversal
```

## Recovery

```text
backup
restore
migration
startup failure
graceful shutdown
```

---

# 56. PLATFORM NON-FUNCTIONAL REQUIREMENTS

The platform should demonstrate:

```text
SECURITY
OBSERVABILITY
RELIABILITY
AUDITABILITY
PERFORMANCE
RECOVERABILITY
```

without sacrificing:

```text
financial correctness
data freshness
decision provenance
paper-only execution
```

---

# 57. NO PREMATURE CLOUD / KUBERNETES

Do NOT implement:

```text
Kubernetes
Docker orchestration
service mesh
microservices
cloud autoscaling
multi-region
distributed event bus
```

unless explicitly required by the actual current architecture or separately authorized.

The objective is to make the application **platform-ready**, not to prematurely distribute it.

---

# 58. NO MICROSERVICE REFACTOR

Do not convert the current architecture to microservices merely because the platform is growing.

Prefer:

```text
modular monolith
clear domain boundaries
clear service boundaries
clear repositories
clear platform services
```

until scale evidence justifies another architecture.

---

# 59. DATABASE DESIGN

Before any migration:

```text
inspect existing migrations
inspect schema
inspect active agent work
reserve migration ID
verify ownership
```

Use additive, backward-compatible changes where possible.

Never:

```text
delete production data
renumber migrations
rewrite unrelated schema
```

---

# 60. SHARED / PROTECTED FILE POLICY

Before changing any file classify:

```text
OWNED
SHARED
PROTECTED
FOREIGN
```

Protected systems include:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
FinancialConservation
MarketDataIntegrityGuard
TradingDataValidator
PaperBroker
Ledger
Portfolio
Multi-Asset
DATA Foundation
Decision OS
Research
Learning
Product
```

Platform code should integrate with these systems through stable interfaces.

Do not rewrite them for convenience.

---

# 61. GIT SAFETY

NEVER use:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git push --force
```

NEVER use:

```text
git add .
```

when the worktree contains parallel-agent changes.

Use explicit file paths.

Before commit:

```text
git status
git diff --stat
git diff
```

Verify every changed file belongs to Platform.

---

# 62. PARALLEL AGENT SAFETY

Assume the worktree may contain:

```text
Learning
Data Foundation
Decision OS
Research
Product
Paper Replay
```

changes.

Do not:

```text
reset
stash
clean
restore
delete
overwrite
```

another agent's work.

If a shared file changes concurrently:

```text
STOP
inspect diff
identify ownership
make smallest compatible change
document it
```

---

# 63. PHASE EXECUTION LOOP

For EACH platform phase:

```text
DISCOVERY
→ ARCHITECTURE AUDIT
→ ACCEPTANCE CRITERIA
→ IMPLEMENTATION
→ TEST
→ EVIDENCE AUDIT
→ REMEDIATION
→ REGRESSION
→ CERTIFICATION
→ NEXT PHASE
```

Do not skip:

```text
Evidence Audit
Remediation
Regression
Certification
```

---

# 64. PHASE GATE

Do not start the next phase unless:

```text
implementation complete
tests pass
typecheck passes
build passes
security checks pass
evidence audit passes
P0 = 0
P1 = 0
certification document exists
```

P2/P3/P4 may remain only when explicitly documented and non-blocking.

---

# 65. SEVERITY

Use:

```text
P0
security breach
financial corruption
data loss
real execution risk
irreversible failure

P1
major platform failure
authorization bypass
broken audit
incorrect ownership
critical recovery failure
major reliability failure

P2
performance
non-critical observability gap
API limitations

P3
UX / operational improvements

P4
future enhancement
```

P0/P1 must be resolved before certification.

---

# 66. DOCUMENTATION

Create:

```text
docs/PLATFORM_01_ARCHITECTURE.md
docs/PLATFORM_01_CERTIFICATION.md

docs/PLATFORM_02_ARCHITECTURE.md
docs/PLATFORM_02_CERTIFICATION.md

docs/PLATFORM_03_ARCHITECTURE.md
docs/PLATFORM_03_CERTIFICATION.md

docs/PLATFORM_04_ARCHITECTURE.md
docs/PLATFORM_04_CERTIFICATION.md

docs/PLATFORM_05_ARCHITECTURE.md
docs/PLATFORM_05_CERTIFICATION.md
```

Final:

```text
docs/PLATFORM_FOUNDATION_ARCHITECTURE.md
docs/PLATFORM_FOUNDATION_FULL_AUDIT.md
docs/PLATFORM_FOUNDATION_CERTIFICATION.md
```

---

# 67. FULL SYSTEM AUDIT AFTER PLATFORM-05

Audit the complete stack:

```text
DATA
FUNDAMENTALS
EARNINGS
VALUATION
MACRO
INDUSTRY
STRATEGY
PORTFOLIO
MULTI-ASSET
RISK
DECISION
RESEARCH
BACKTEST
PAPER REPLAY
PRODUCT
LEARNING
IDENTITY
AUTHORIZATION
AUDIT
OBSERVABILITY
SECURITY
RECOVERY
```

Verify there are no:

```text
duplicate engines
duplicate identity models
authorization bypasses
silent mocks
silent fallback
secret leaks
audit gaps
data provenance breaks
financial accounting breaks
real execution paths
```

---

# 68. END-TO-END PLATFORM TEST

Demonstrate:

```text
USER
 ↓
AUTHENTICATION
 ↓
WORKSPACE
 ↓
RESEARCH
 ↓
BACKTEST
 ↓
DECISION
 ↓
RISK
 ↓
PAPER REPLAY
 ↓
PORTFOLIO
 ↓
MONITORING
 ↓
JOURNAL
 ↓
AUDIT LOG
```

Then test:

```text
same user
different workspace
different user
different role
revoked session
disabled account
```

Verify authorization and audit behavior.

---

# 69. SECURITY CERTIFICATION

The platform must prove:

```text
no plaintext credentials
no secret leakage
no IDOR
no privilege escalation
no unauthorized portfolio access
no unauthorized decision modification
no unauthorized paper execution
no real execution path
no audit tampering through normal APIs
```

---

# 70. FINANCIAL SAFETY CERTIFICATION

The platform must prove it does NOT alter:

```text
RiskGuard
RiskManager
PositionSizer
FinancialConservation
PaperBroker
Ledger
Portfolio
Decision OS
Research correctness
```

unless a separately certified interface change was explicitly required.

---

# 71. PERFORMANCE CERTIFICATION

Measure where possible:

```text
API latency
database latency
authentication latency
authorization overhead
audit overhead
research latency
paper replay latency
AI latency
memory usage
```

Do not claim production capacity from a development laptop benchmark.

State:

```text
measured
estimated
not measured
```

accurately.

---

# 72. RECOVERY CERTIFICATION

Verify:

```text
application restart
database restart
failed request
provider outage
migration failure
backup restore
graceful shutdown
```

The platform must recover without financial-state corruption.

---

# 73. FINAL CERTIFICATION

The Platform Foundation may be marked:

```text
CERTIFIED
```

only when:

```text
PLATFORM-01 PASS
PLATFORM-02 PASS
PLATFORM-03 PASS
PLATFORM-04 PASS
PLATFORM-05 PASS

AND

P0 = 0
P1 = 0
tests pass
typecheck pass
build pass
security audit pass
authorization audit pass
audit/provenance audit pass
recovery validation pass
regression pass
```

Otherwise:

```text
CERTIFIED_WITH_LIMITATIONS
```

or:

```text
BLOCKED
```

---

# 74. FINAL REPORT

Produce:

```text
PLATFORM FOUNDATION — FINAL CERTIFICATION REPORT

1. Executive Summary

2. Repository Baseline

3. PLATFORM-01 Identity
   - implementation
   - security
   - tests
   - certification

4. PLATFORM-02 Authorization
   - roles
   - ownership
   - organizations
   - permission model
   - tests

5. PLATFORM-03 Audit / Security
   - audit trail
   - provenance
   - security controls
   - findings

6. PLATFORM-04 Observability
   - health
   - metrics
   - logs
   - performance
   - reliability

7. PLATFORM-05 Production Hardening
   - configuration
   - secrets
   - backup
   - recovery
   - graceful shutdown
   - rate limits

8. Full-System Security Audit

9. Financial Integrity Audit

10. Data Provenance Audit

11. Authorization Audit

12. Observability Audit

13. Performance Audit

14. Recovery Audit

15. Test Results

16. Typecheck

17. Build

18. Regression

19. P0/P1/P2/P3/P4 Findings

20. Known Limitations

21. Technical Debt

22. Production Readiness

23. Certification Decision

24. Recommended Next Phase
```

---

# 75. IMPORTANT — DO NOT CONFUSE PLATFORM WITH BUSINESS

Do NOT implement:

```text
subscriptions
payments
billing
pricing
marketplace
affiliate
advertising
community monetization
B2B contracts
```

in this phase.

Those belong to the next:

```text
BUSINESS / MONETIZATION
```

roadmap.

---

# 76. IMPORTANT — DO NOT CONFUSE PLATFORM WITH INFRASTRUCTURE

Do NOT prematurely implement:

```text
Kubernetes
cloud deployment
autoscaling
multi-region
service mesh
distributed workers
```

unless explicitly authorized.

Platform Foundation should make those future capabilities easier without requiring them now.

---

# 77. FINAL COMMAND

START NOW.

First inspect the actual repository.

Then determine the true baseline for:

```text
authentication
authorization
users
workspaces
audit
security
logging
health
metrics
configuration
backup
recovery
```

Then execute:

```text
PLATFORM-01
→ CERTIFY

PLATFORM-02
→ CERTIFY

PLATFORM-03
→ CERTIFY

PLATFORM-04
→ CERTIFY

PLATFORM-05
→ CERTIFY

→ FULL PLATFORM AUDIT
→ REMEDIATION
→ REGRESSION
→ FINAL CERTIFICATION
```

Do not wait for another prompt between phases.

Do not fabricate capabilities.

Do not claim backup, monitoring, security, or recovery exists unless it is actually implemented and verified.

Do not weaken financial-integrity controls.

Do not touch unrelated parallel-agent work.

Do not use destructive Git commands.

Build a platform that is ready for the next layer:

```text
BUSINESS
→ MONETIZATION
→ COMMUNITY
→ MARKETPLACE
→ B2B
→ API
```

while preserving the core identity of `VN-STOCK-AI-PRO` as a serious:

```text
INVESTMENT OPERATING SYSTEM
+
MULTI-ASSET QUANT INTELLIGENCE PLATFORM
```