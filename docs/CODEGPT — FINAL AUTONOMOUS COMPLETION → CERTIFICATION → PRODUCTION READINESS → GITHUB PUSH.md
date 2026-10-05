# CODEGPT — FINAL AUTONOMOUS COMPLETION ROADMAP

## MASTER MISSION

Take the existing `VN-STOCK-AI-PRO` repository from its current state through the remaining completion, integration, certification, production-readiness, and final GitHub publication stages.

You are authorized to work autonomously.

Do NOT stop merely because a phase has findings.

For every phase:

```text
DISCOVER
→ AUDIT
→ IMPLEMENT
→ TEST
→ EVIDENCE AUDIT
→ SELF-REVIEW
→ REMEDIATE
→ REGRESSION
→ CERTIFY
→ CONTINUE
```

Continue automatically until the complete roadmap defined below is finished.

At the very end:

```text
FINAL AUDIT
→ FINAL TEST
→ FINAL SECURITY AUDIT
→ FINAL GIT AUDIT
→ COMMIT
→ PUSH TO GITHUB
→ VERIFY REMOTE
→ FINAL REPORT
```

The final objective is a repository that is:

- functionally integrated;
- persistent;
- secure;
- authenticated;
- authorized;
- reproducible;
- auditable;
- paper-trading safe;
- commercially coherent;
- production-ready where evidence supports it;
- fully tested;
- cleanly committed;
- pushed to GitHub.

---

# 0. ABSOLUTE SAFETY RULES

These rules override convenience.

NEVER execute:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git stash
git push --force
git push -f
```

Never delete another lane's work.

Never overwrite unexplained modifications.

Never blanket-stage:

```text
git add .
git add -A
```

unless the final Git audit has explicitly classified every changed file as intended.

Do not fabricate data.

Do not introduce silent mocks.

Do not introduce synthetic financial data.

Do not weaken fail-closed behavior.

Do not bypass:

```text
RiskGuard
RiskManager
PositionSizer
TradingEngine
FinancialConservation
MarketDataIntegrityGuard
TradingDataValidator
PaperBroker
```

Do not create real broker execution.

Do not add real-money execution.

Do not introduce Kubernetes merely for appearance.

Do not introduce cloud infrastructure merely because the roadmap mentions it.

Do not claim production-ready functionality without evidence.

---

# 1. CURRENT SYSTEM BASELINE

The repository already contains substantial certified work:

```text
Phase 24–29
DATA-01→05
DECISION-01→05
RESEARCH-01→05
Learning MVP
Product foundations
Paper Replay
Platform
Business-01→05
```

Current known status includes:

### Platform

```text
PLATFORM-01→05
CERTIFIED_WITH_LIMITATIONS
P0 = 0
P1 = 0
```

Known limitations include:

- identity/audit state previously process-local;
- backup designed but not fully implemented;
- dependency probes may be incomplete;
- production infrastructure not yet fully established.

### Business

```text
BUSINESS-01→05
CONDITIONAL / LIMITATIONS
```

The intended next step is:

```text
BUSINESS-06 Persistence & Integration
```

### Paper Replay

```text
CERTIFIED_WITH_LIMITATIONS
```

Known remediation targets include:

```text
production port composition
read-only /replay/* transport
fingerprint hardening
```

### Learning

Learning MVP is already complete.

Do NOT expand Learning until the core production path is stable.

---

# 2. PHASE EXECUTION ORDER

Execute exactly this sequence:

```text
PHASE A
BUSINESS-06 Persistence & Integration

        ↓

PHASE B
BUSINESS-01→06 Final Certification

        ↓

PHASE C
PAPER-REPLAY-REMEDIATION-01

        ↓

PHASE D
Paper Replay Final Certification

        ↓

PHASE E
FINAL SYSTEM READINESS AUDIT

        ↓

PHASE F
INFRA-01 Production Deployment Foundation

        ↓

PHASE G
INFRA-02 Background Jobs / Scheduling

        ↓

PHASE H
INFRA-03 Performance / Cache / Scaling

        ↓

PHASE I
INFRA-04 Cloud / Production Operations

        ↓

PHASE J
INFRA-05 Kubernetes / High Availability
ONLY IF EVIDENCE JUSTIFIES IT

        ↓

PHASE K
POST-INFRA FINAL SYSTEM CERTIFICATION

        ↓

PHASE L
OPTIONAL LEARNING-09→15 DEEPENING
ONLY IF THE FINAL AUDIT DETERMINES IT IS NOW JUSTIFIED

        ↓

PHASE M
FINAL REPOSITORY AUDIT

        ↓

PHASE N
COMMIT + GITHUB PUSH + REMOTE VERIFICATION
```

Do not skip phases.

Do not reorder phases unless a hard technical dependency makes the order impossible.

If a phase is not justified, formally certify it as:

```text
DEFERRED_BY_EVIDENCE
```

rather than implementing unnecessary infrastructure.

---

# 3. PHASE A — BUSINESS-06

Implement the complete durable persistence and integration layer.

Verify and implement where actually missing:

```text
User
Session
Organization
Membership
Role
Subscription
Entitlement
Seat
Webhook
Commercial Ledger
Marketplace state
Community state
```

Requirements:

```text
database persistence
repository layer
transactions
constraints
foreign keys
unique constraints
idempotency
restart durability
authorization
HTTP integration
audit trail
```

Payment provider must remain abstract unless a real provider already exists.

Separate:

```text
Commercial Ledger
≠
Investment Ledger
≠
FinancialConservation
≠
Paper Trading
```

Do not allow Business to alter investment state.

---

# 4. BUSINESS-06 E2E GATE

Prove:

```text
REGISTER
↓
LOGIN
↓
CREATE ORGANIZATION
↓
ASSIGN ROLE
↓
SELECT PLAN
↓
CREATE SUBSCRIPTION
↓
PAYMENT / TEST PROVIDER
↓
WEBHOOK VERIFY
↓
ENTITLEMENT ACTIVE
↓
ALLOCATE SEAT
↓
ACCESS PREMIUM RESOURCE
↓
AUDIT
↓
RENEW
↓
CANCEL
↓
ENTITLEMENT REMOVED
↓
ACCESS DENIED
```

Then:

```text
RESTART PROCESS
↓
READ SAME STATE
```

Then:

```text
DUPLICATE WEBHOOK
↓
NO DUPLICATE BUSINESS EFFECT
```

---

# 5. PHASE B — BUSINESS FINAL CERTIFICATION

Audit:

```text
BUSINESS-01
BUSINESS-02
BUSINESS-03
BUSINESS-04
BUSINESS-05
BUSINESS-06
```

Run:

```text
unit tests
integration tests
HTTP tests
authorization tests
security tests
E2E tests
restart tests
concurrency tests
idempotency tests
failure-mode tests
full regression
typecheck
build
```

Required:

```text
P0 = 0
P1 = 0
```

Only then:

```text
BUSINESS — CERTIFIED
```

If P2/P3 remain, document them honestly.

---

# 6. PHASE C — PAPER REPLAY REMEDIATION

Fix ONLY the remaining certified limitations.

## C1 — Production Port Composition

Create a thin composition layer connecting existing authoritative components:

```text
PaperExecutionEngine
PositionSizer
RiskGuard
PaperBroker
FinancialConservation
Monitoring
Reconciliation
```

Do not rewrite those engines.

Do not duplicate their logic.

---

## C2 — Read-only Replay API

Implement, if still missing:

```text
GET /replay/runs
GET /replay/runs/:id
GET /replay/runs/:id/events
GET /replay/runs/:id/metrics
GET /replay/runs/:id/divergence
GET /replay/runs/:id/reconciliation
```

Requirements:

```text
authentication
ownership
authorization
read-only
no real execution path
safe errors
```

---

## C3 — Fingerprint Hardening

Fingerprint all material replay inputs.

At minimum inspect:

```text
dataset/version
strategy/version
decision/version
risk model
sizing model
execution model
cost model
universe
date range
capital
seed
configuration
event structure
result structure
```

Requirements:

```text
same material inputs → same fingerprint

any material input change
→ different fingerprint
```

---

# 7. PHASE D — PAPER REPLAY FINAL CERTIFICATION

Run:

```text
historical replay
forward simulation
deterministic replay
```

Verify:

```text
no look-ahead
PIT enforcement
survivorship control
risk preservation
position sizing
lot constraints
futures multiplier
futures tick
accounting conservation
corporate actions
reconciliation
fingerprint determinism
```

Preserve:

```text
equity/ETF lot = 100
futures multiplier = 100,000 VND
futures tick = 0.1
```

No real execution.

Certification target:

```text
PAPER REPLAY — CERTIFIED
```

or honestly:

```text
CERTIFIED_WITH_LIMITATIONS
```

If any remaining P0/P1 exists:

STOP and remediate before Infrastructure.

---

# 8. PHASE E — FINAL SYSTEM READINESS AUDIT

Perform a complete cross-domain audit.

Audit this chain:

```text
REAL DATA
↓
DATA VALIDATION
↓
MACRO
↓
INDUSTRY
↓
FUNDAMENTALS
↓
VALUATION
↓
STRATEGY
↓
PORTFOLIO
↓
RISK
↓
POSITION SIZE
↓
DECISION
↓
RESEARCH / BACKTEST
↓
PAPER REPLAY
↓
MONITORING
↓
DECISION REVIEW
↓
PRODUCT
↓
PLATFORM
↓
BUSINESS
↓
LEARNING
```

Check for:

```text
broken integration
duplicate logic
missing persistence
security holes
authorization gaps
stale data bypass
look-ahead
silent fallback
financial invariant violation
commercial invariant violation
AI authority leakage
real-execution path
missing audit trail
missing provenance
```

Create:

```text
docs/FINAL_SYSTEM_READINESS_AUDIT.md
```

Classify:

```text
P0
P1
P2
P3
P4
```

Automatically remediate P0/P1 where safely possible.

Repeat the audit until:

```text
P0 = 0
P1 = 0
```

or clearly document an external blocker that cannot safely be resolved in this repository.

---

# 9. PHASE F — INFRA-01

Only start if:

```text
READY_FOR_INFRA = YES
```

Implement production deployment foundation.

Audit and implement where justified:

```text
reproducible build
production configuration
environment validation
secret handling
migration safety
deployment
rollback
health
readiness
liveness
graceful shutdown
timeouts
request IDs
safe errors
```

Docker is optional.

Use it only if it materially improves reproducibility/deployment.

Do not create unnecessary infrastructure.

---

# 10. PHASE G — INFRA-02

Implement background jobs only where the actual application requires them.

Requirements:

```text
job abstraction
states
idempotency
locking
retry
backoff
scheduling
failure handling
observability
```

Financial jobs must be especially safe.

Never allow duplicate:

```text
billing
ledger
webhook
portfolio
paper execution
```

effects.

---

# 11. PHASE H — INFRA-03

Measure before optimizing.

Establish:

```text
p50
p95
p99
DB latency
query performance
connection pool
cache hit/miss
provider latency
replay performance
```

Only introduce caching where freshness semantics remain explicit.

Preserve:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

Do not cache invalid financial state as valid.

Do not introduce Redis or other infrastructure without evidence.

---

# 12. PHASE I — INFRA-04

Perform evidence-based production/cloud architecture.

Do not assume a specific cloud provider.

Create:

```text
docs/CLOUD_DECISION.md
docs/PRODUCTION_TOPOLOGY.md
docs/BACKUP_RESTORE.md
docs/INCIDENT_RESPONSE.md
docs/DISASTER_RECOVERY.md
docs/PRODUCTION_RUNBOOK.md
```

Verify:

```text
TLS
reverse proxy
database production configuration
backup
restore
monitoring
alerting
incident handling
RPO
RTO
secret management
```

RPO/RTO must be stated as targets unless actually measured.

---

# 13. PHASE J — INFRA-05

Kubernetes is NOT mandatory.

First establish:

```text
KUBERNETES_JUSTIFICATION
```

Implement Kubernetes only if evidence demonstrates that:

```text
horizontal scaling
availability
workload isolation
deployment requirements
job orchestration
resource management
```

justify it.

If not justified:

```text
INFRA-05 = DEFERRED_BY_EVIDENCE
```

This is a valid outcome.

Never deploy Kubernetes merely because it exists in the roadmap.

---

# 14. PHASE K — POST-INFRA FINAL CERTIFICATION

Run the entire repository verification again.

Required:

```text
all applicable tests PASS
tsc --noEmit PASS
npm run build PASS
security audit PASS
authorization audit PASS
financial conservation PASS
commercial reconciliation PASS
paper replay PASS
data integrity PASS
backup/restore evidence PASS
deployment evidence PASS
observability PASS
failure recovery PASS
```

Perform a final adversarial audit.

Ask:

```text
Can data silently become valid when unavailable?
Can authorization be bypassed?
Can commercial events duplicate?
Can paper orders reach real execution?
Can AI override risk?
Can a restart lose critical state?
Can backup restoration corrupt state?
Can migration break invariants?
Can a stale cache become a current truth?
Can an unknown entitlement become ALLOW?
Can a provider failure become SUCCESS?
```

All must have explicit safe behavior.

---

# 15. PHASE L — LEARNING DEEPENING

Only after the core system is stable.

Before starting:

```text
LEARNING_READINESS_AUDIT
```

Determine whether the Learning lane benefits from real system capabilities now available.

If justified, execute:

```text
LEARNING-09 Adaptive Learning
LEARNING-10 Applied / Project Learning
LEARNING-11 Assessment / Certification
LEARNING-12 Knowledge Graph
LEARNING-13 AI Tutor
LEARNING-14 Instructor / Admin Studio
LEARNING-15 Customer Training / Community
```

Important:

Learning must consume actual system knowledge.

It must connect to:

```text
DATA
RESEARCH
DECISION
PORTFOLIO
RISK
PAPER REPLAY
PRODUCT
```

Do not create a generic LMS detached from VN-STOCK-AI-PRO.

AI Tutor must NOT invent financial facts.

Learning recommendations must use real provenance.

If the audit concludes Learning deepening is not yet justified:

```text
LEARNING-09→15 = DEFERRED
```

and continue.

---

# 16. FINAL PRODUCT / SYSTEM UX AUDIT

Do not redesign the entire UI.

Verify that the terminal remains:

```text
Premium Institutional
TradingView-inspired
dark navy/charcoal
dense
professional
financial-terminal oriented
```

Ensure new surfaces remain consistent:

```text
Business
Paper Replay
Research
Decision
Platform
Infrastructure
Learning
```

No landing-page redesign.

No generic AI-dashboard aesthetic.

---

# 17. FINAL AI SAFETY AUDIT

Search the entire repository for AI decision authority.

AI may:

```text
summarize
explain
teach
challenge
generate research ideas
assist
```

AI may NOT:

```text
invent market data
override risk
override authorization
grant paid entitlement
modify financial conservation
execute real orders
bypass Paper Broker
bypass TradingEngine
```

Any violation is P0/P1.

---

# 18. FINAL DATA SAFETY AUDIT

Verify all market data continues to obey:

```text
KBS
VPS
VNDIRECT
```

as established source-of-truth/fallback architecture.

Preserve:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

No synthetic market values.

No silent mocks.

No fabricated fundamentals.

No fabricated historical prices.

No fabricated performance.

---

# 19. FINAL FINANCIAL SAFETY AUDIT

Verify:

```text
FinancialConservation
NAV invariants
cash
positions
fees
tax
slippage
corporate actions
P&L
reconciliation
```

No Business or Infrastructure feature may silently modify investment accounting.

---

# 20. FULL REGRESSION

Run the maximum applicable test suite.

Report exact:

```text
test files
tests
passed
failed
skipped
duration
```

Run:

```text
npx tsc --noEmit
npm run build
```

No hidden failures.

No ignored failures.

No weakening test assertions simply to obtain green status.

---

# 21. FINAL SECURITY SCAN

Inspect for:

```text
secrets
credentials
tokens
API keys
private keys
firebase config leakage
hard-coded passwords
unsafe environment handling
```

Verify:

```text
.gitignore
tracked files
build artifacts
dist
logs
test fixtures
```

No real secret may be committed.

If a tracked secret is discovered:

1. remove it safely;
2. rotate/revoke if necessary;
3. verify Git history implications;
4. do not merely hide it in `.gitignore`.

---

# 22. FINAL GIT AUDIT

Before committing:

```text
git status --short
git diff --stat
git diff --name-only
git diff
git ls-files
```

Classify every change:

```text
INTENDED
PRE-EXISTING
CONCURRENT
GENERATED
UNKNOWN
```

Rules:

```text
UNKNOWN → STOP
CONCURRENT → DO NOT COMMIT
PRE-EXISTING → DO NOT COMMIT unless explicitly part of final work
GENERATED → commit only if intentionally versioned
INTENDED → eligible
```

Never commit unrelated user work.

---

# 23. DOCUMENTATION COMPLETENESS

Verify all major certifications have evidence.

Required major documentation should include, where applicable:

```text
DATA architecture/certification
DECISION architecture/certification
RESEARCH architecture/certification
PAPER REPLAY architecture/certification
PLATFORM architecture/certification
BUSINESS architecture/certification
INFRA architecture/certification
FINAL SYSTEM READINESS
FINAL CERTIFICATION
```

Do not generate meaningless duplicate documents.

Documents must reflect actual repository state.

---

# 24. FINAL CERTIFICATION MATRIX

Create:

```text
docs/FINAL_SYSTEM_CERTIFICATION.md
```

with:

```text
CORE INTELLIGENCE
DATA FOUNDATION
DECISION OS
RESEARCH
PRODUCT
PAPER REPLAY
PLATFORM
BUSINESS
INFRASTRUCTURE
LEARNING
SECURITY
FINANCIAL SAFETY
COMMERCIAL SAFETY
OPERABILITY
```

Each gets:

```text
CERTIFIED
CERTIFIED_WITH_LIMITATIONS
CONDITIONAL
DEFERRED
NOT_READY
```

with evidence.

---

# 25. FINAL BLOCKING RULE

The repository cannot receive the final:

```text
PRODUCTION_READY
```

designation if:

```text
P0 > 0
P1 > 0
tests fail
typecheck fails
build fails
critical security issue exists
critical authorization issue exists
financial conservation fails
real-execution safety fails
commercial reconciliation fails
```

---

# 26. FINAL GIT COMMIT

Only after every previous gate passes.

Create clean, logical commits.

Preferred structure:

```text
feat(business): complete persistence and integration
fix(paper-replay): harden production composition and replay API
feat(infra): establish production foundation
feat(infra): add operational reliability
feat(infra): add production operations
docs(certification): finalize system readiness
```

However:

DO NOT create unnecessary commits merely to follow this example.

Use the actual changes.

Do not squash unrelated concurrent work.

Do not rewrite historical commits.

---

# 27. GITHUB PUSH

Before push verify:

```text
git remote -v
git branch --show-current
git status --short
```

Determine:

```text
current branch
upstream
remote
```

Never assume `origin/main`.

If the current branch is appropriate and upstream is configured:

push normally.

If the repository uses another established branch strategy:

follow the actual repository configuration.

NEVER force push.

NEVER overwrite remote history.

If push is rejected because remote has new commits:

STOP.

Do not force push.

Fetch and inspect divergence.

Integrate safely.

Re-run tests after integration.

Then push normally.

---

# 28. VERIFY GITHUB

After successful push:

verify:

```text
git status
git log -n 5 --oneline
git rev-parse HEAD
git rev-parse @{u}
```

The final local HEAD and upstream commit must match.

Confirm working tree is clean except for explicitly documented unrelated concurrent work.

If unrelated work remains:

do NOT delete it.

Report it.

---

# 29. FINAL REPORT

Return:

```text
============================================================
VN-STOCK-AI-PRO — FINAL AUTONOMOUS COMPLETION REPORT
============================================================

1. BUSINESS-06
   status
   implementation
   persistence
   E2E
   restart
   idempotency

2. BUSINESS FINAL CERTIFICATION
   BUSINESS-01
   BUSINESS-02
   BUSINESS-03
   BUSINESS-04
   BUSINESS-05
   BUSINESS-06
   verdict

3. PAPER REPLAY REMEDIATION
   composition
   API
   fingerprint
   result

4. PAPER REPLAY FINAL CERTIFICATION
   verdict

5. FINAL SYSTEM READINESS
   P0
   P1
   P2
   P3
   P4
   verdict

6. INFRA-01
7. INFRA-02
8. INFRA-03
9. INFRA-04
10. INFRA-05
    implemented OR deferred with evidence

11. LEARNING
    whether LEARNING-09→15 was executed
    justification

12. SECURITY
    result

13. FINANCIAL SAFETY
    result

14. COMMERCIAL SAFETY
    result

15. DATA SAFETY
    result

16. FULL TEST
    files
    tests
    passed
    failed

17. TYPECHECK
    result

18. BUILD
    result

19. BACKUP / RESTORE
    result

20. DEPLOYMENT
    result

21. OBSERVABILITY
    result

22. FINAL CERTIFICATION
    verdict

23. GIT
    branch
    commits
    changed files
    working tree

24. GITHUB
    remote
    pushed commit
    remote verification

25. REMAINING LIMITATIONS
    exact list

26. DEFERRED WORK
    exact list

27. FINAL RECOMMENDATION
============================================================
```

---

# 30. ABSOLUTE COMPLETION CONDITION

Do not stop merely because one phase is complete.

Continue until:

```text
BUSINESS-06
        +
BUSINESS FINAL CERTIFICATION
        +
PAPER REPLAY REMEDIATION
        +
PAPER REPLAY CERTIFICATION
        +
FINAL SYSTEM READINESS
        +
APPLICABLE INFRA PHASES
        +
FINAL CERTIFICATION
        +
FINAL GIT AUDIT
        +
GITHUB PUSH
        +
REMOTE VERIFICATION
```

are complete.

The only valid reasons to stop early are:

```text
1. destructive/unsafe operation would be required;
2. credentials or external authorization are required and unavailable;
3. another concurrent lane owns a required file and safe integration is impossible;
4. GitHub push would require force-push or destructive history rewrite;
5. a fundamental external dependency cannot be resolved safely.
```

In those cases:

- preserve all work;
- do not destroy anything;
- document exact blocker;
- provide exact next action.

Otherwise continue autonomously.

# END MASTER AUTONOMOUS ROADMAP