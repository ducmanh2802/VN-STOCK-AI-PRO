# BUSINESS-06 — PERSISTENCE & INTEGRATION

## MISSION

Complete the missing production-grade persistence and integration layer for BUSINESS-01→05.

The BUSINESS lane currently has:

- BUSINESS-01 Monetization Foundation — CERTIFIED
- BUSINESS-02 Community — CERTIFIED
- BUSINESS-03 Marketplace — CERTIFIED
- BUSINESS-04 B2B / Organization — CERTIFIED_WITH_LIMITATIONS because 2 P1 findings remain
- BUSINESS-05 Billing / Commercial Audit — CERTIFIED
- Business lane tests: 236 passing
- Full regression: 2213 tests passing
- Typecheck: PASS
- Build: PASS
- P0 = 0
- P1 = 2
- P2/P3 documented

The remaining gap is not domain design. It is durable persistence and production integration.

The primary objective is:

> Turn the currently certified business domain contracts into a durable, end-to-end, restart-safe, authenticated and authorized business system without weakening any existing financial, risk, data, decision, research, paper-trading, platform, or learning boundaries.

Do NOT start Infrastructure.

Do NOT start BUSINESS-07.

Do NOT redesign BUSINESS-01→05.

Do NOT rewrite existing domain engines merely to make persistence easier.

---

# 1. REQUIRED WORKING METHOD

Execute autonomously:

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
```

Do not stop after implementation.

Do not report success merely because tests pass.

Evidence must prove that the actual end-to-end business journey works.

---

# 2. FIRST — READ THE ACTUAL SYSTEM

Before changing anything, inspect:

```text
docs/AGENT_PARALLEL_EXECUTION.md

docs/BUSINESS*
docs/PLATFORM*
docs/PAPER_REPLAY*
docs/DATA*
docs/DECISION*
docs/RESEARCH*

src/lib/business/**
src/services/business/**
src/lib/db/business/**
src/lib/platform/**
src/services/platform/**
src/lib/auth/**
src/services/auth/**
src/db/schema.ts
drizzle/**
server.ts
package.json
```

Also inspect current Git status.

There are concurrent lanes.

NEVER:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git stash
```

Never stage unrelated files.

Never modify Learning files unless required by a demonstrated integration dependency.

Never modify protected financial modules unless an explicit architecture defect makes it unavoidable.

---

# 3. CONCURRENT-LANE SAFETY

The previous audit explicitly reported concurrent editing of:

```text
src/db/schema.ts
server.ts
```

Therefore:

- do not overwrite concurrent work;
- do not revert concurrent changes;
- do not resolve unrelated diffs;
- do not take ownership of files belonging to another lane;
- use lane-owned modules and adapters wherever possible.

If server.ts is protected/concurrent:

create a lane-owned route/module composition boundary and document the final mount requirement rather than editing unrelated concurrent work.

If migration IDs conflict:

STOP and reserve another unused migration ID.

Never rewrite another lane's migration.

---

# 4. BUSINESS-06 TARGET ARCHITECTURE

Establish this logical architecture:

```text
HTTP / Product
      ↓
Authentication
      ↓
Authorization
      ↓
Business Services
      ↓
Domain Engines
      ↓
Repositories
      ↓
PostgreSQL
```

For billing:

```text
Payment Provider
      ↓
Webhook Adapter
      ↓
Webhook Verification
      ↓
Idempotency
      ↓
Billing Service
      ↓
Commercial Ledger
      ↓
Subscription / Entitlement
```

For organization:

```text
User
 ↓
Organization
 ↓
Membership
 ↓
Role
 ↓
Seat
 ↓
Entitlement
 ↓
Resource Access
```

For marketplace:

```text
Creator
 ↓
Artifact
 ↓
Version
 ↓
Publication
 ↓
Verification / Certification
 ↓
Entitlement
 ↓
Consumer
```

---

# 5. DURABLE IDENTITY

Connect Platform identity to durable persistence.

At minimum audit whether these need repositories:

```text
User
Credential
Session
Session Revocation
Organization
Membership
Role
Permission
```

Identity state must survive:

```text
process restart
server restart
application redeploy
multiple application instances
```

Do not persist plaintext passwords.

Do not persist raw session tokens if the existing platform architecture hashes tokens.

Preserve:

- scrypt password hashing;
- session expiry;
- revocation;
- renewal;
- lockout;
- anti-enumeration;
- authorization semantics.

Do not duplicate the Platform identity engine.

Business must consume the existing Platform contracts.

---

# 6. ORGANIZATION / MEMBERSHIP PERSISTENCE

Implement durable repositories and services where missing.

Required invariants:

```text
User ∈ Organization only through Membership
Membership has explicit role
Role does not imply ownership unless explicitly defined
Organization boundary is server-side enforced
Cross-organization access is denied
Seat limits are enforced transactionally
```

Test:

```text
owner
admin
member
viewer
```

against:

```text
organization A
organization B
```

Include IDOR tests.

---

# 7. SUBSCRIPTION PERSISTENCE

Implement durable subscription persistence.

At minimum represent:

```text
subscriptionId
organization/user owner
plan
status
provider
providerSubscriptionId
billing period
current period start
current period end
trial state
cancel state
createdAt
updatedAt
version
```

Do not invent fields that are not required by actual business contracts.

Use explicit state transitions.

Example:

```text
PENDING
→ ACTIVE
→ PAST_DUE
→ CANCELED
→ EXPIRED
```

Actual states must follow the existing BUSINESS domain contract if different.

Never allow arbitrary state mutation from HTTP input.

---

# 8. ENTITLEMENT PERSISTENCE

Entitlements must be derivable from durable state.

Avoid:

```text
if (user.plan === "PRO") ...
```

scattered throughout the application.

Use the centralized entitlement contract.

Test precedence between:

```text
user entitlement
organization entitlement
plan entitlement
role/permission
trial
subscription state
override
```

according to the existing BUSINESS-04 contract.

Explicitly test:

```text
expired subscription
canceled subscription
active subscription
trial
downgrade
upgrade
seat exhaustion
organization override
```

---

# 9. SEAT PERSISTENCE

Implement durable seat allocation if the current domain requires it.

Invariant:

```text
allocated seats <= purchased seats
```

Concurrency must not allow:

```text
seat count = purchased + 1
```

through simultaneous requests.

Use appropriate database constraints/transactions.

Test:

```text
single allocation
duplicate allocation
concurrent allocation
seat release
seat reassignment
plan downgrade
organization deletion
```

---

# 10. COMMERCIAL LEDGER

Implement the missing persistence boundary for the existing commercial ledger.

IMPORTANT:

The commercial ledger is NOT:

```text
FinancialConservation
InvestmentLedger
PortfolioLedger
TradingLedger
```

Never merge them.

Commercial accounting may contain:

```text
invoice
charge
refund
credit
subscription event
payment event
fee
tax
adjustment
```

depending on existing BUSINESS contracts.

Preserve immutable/audit-oriented semantics.

If a commercial event is duplicated, idempotency must prevent double accounting.

---

# 11. PAYMENT PROVIDER ABSTRACTION

Create a provider-neutral boundary.

Conceptually:

```text
PaymentProvider
 ├── createCustomer
 ├── createCheckout
 ├── retrieveSubscription
 ├── cancelSubscription
 └── verifyWebhook
```

Do not hard-code Stripe/PayPal/etc unless the actual project already selected one.

If no provider exists:

implement the abstraction and deterministic test adapter.

Do NOT use fake production payments.

Explicitly distinguish:

```text
TEST
SANDBOX
PRODUCTION
```

---

# 12. WEBHOOK PERSISTENCE

Webhook processing must be durable and idempotent.

Persist:

```text
provider
eventId
eventType
receivedAt
verifiedAt
processingStatus
payloadHash
processedAt
failureReason
```

Do not trust:

```text
status supplied by client
status embedded in an unverified payload
```

Verify according to the provider abstraction.

Idempotency invariant:

```text
same provider + eventId
→ processed once
```

Retrying the same webhook must not:

- duplicate subscription;
- duplicate invoice;
- duplicate ledger entry;
- duplicate entitlement;
- duplicate seat allocation.

---

# 13. TRANSACTION BOUNDARIES

Identify operations requiring atomicity.

At minimum inspect:

```text
subscription creation
subscription state transition
seat allocation
seat release
payment event processing
refund
entitlement activation
entitlement expiration
commercial ledger posting
webhook processing
```

Use database transactions where required.

Never rely on:

```text
"in-memory sequence"
"best effort"
"probably won't happen twice"
```

for financial/commercial invariants.

---

# 14. REPOSITORY CONTRACT

Repository APIs should be explicit.

Avoid leaking ORM internals into domain engines.

Prefer:

```text
BusinessService
    ↓
Repository interface
    ↓
Drizzle/PostgreSQL adapter
```

The domain layer must remain testable without PostgreSQL.

Keep pure engines pure.

---

# 15. HTTP INTEGRATION

Audit existing BUSINESS routes.

The final system must expose only authenticated and authorized operations.

Potential surface:

```text
/auth/*
/organizations/*
/memberships/*
/subscriptions/*
/entitlements/*
/billing/*
/webhooks/*
/marketplace/*
```

Do not invent unnecessary routes.

All routes must have:

```text
authentication
authorization
ownership/scope enforcement
input validation
safe error handling
idempotency where needed
audit events where appropriate
```

Read/write permissions must be explicit.

---

# 16. SERVER MOUNTING

The audit reported:

> router not mounted because server.ts is protected/concurrent.

Resolve this without violating concurrent-lane ownership.

Preferred:

```text
businessRoutes.ts
businessRouteRegistry.ts
businessTransport.ts
```

with a minimal composition point.

If server.ts cannot safely be changed in this lane:

document the exact mount contract and produce a machine-verifiable integration test around the composition boundary.

Do not falsely claim the routes are production-mounted if they are not.

---

# 17. END-TO-END BUSINESS JOURNEY

This is the most important BUSINESS-06 gate.

Prove the complete flow:

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
PAYMENT / PAYMENT EVENT
 ↓
WEBHOOK
 ↓
ENTITLEMENT ACTIVE
 ↓
ALLOCATE SEAT
 ↓
ACCESS PREMIUM RESOURCE
 ↓
AUDIT EVENT
 ↓
RENEW
 ↓
CANCEL
 ↓
ENTITLEMENT REMOVED
 ↓
ACCESS DENIED
```

The test must use the actual persistence boundary.

Do not substitute pure mocks for the database journey.

---

# 18. RESTART / DURABILITY TEST

Prove:

```text
create subscription
→ persist
→ restart process
→ reload state
→ entitlement remains correct
```

Also test:

```text
create organization
→ restart
→ membership remains
```

and:

```text
process webhook
→ restart
→ duplicate webhook
→ no duplicate business effect
```

This is mandatory.

---

# 19. CONCURRENCY TESTS

Test race conditions around:

```text
seat allocation
subscription transitions
webhook processing
commercial ledger posting
entitlement activation
```

At minimum prove the database constraints prevent invalid final state.

---

# 20. SECURITY REGRESSION

Re-run the previous findings.

Especially verify:

### D-03

The real content shape is:

```text
entity.author.userId
```

or whatever the actual schema currently defines.

Never assume:

```text
authorUserId
```

unless it actually exists.

Test:

```text
owner can access own resource
non-owner cannot
moderator behavior follows explicit permission
organization member boundary works
cross-org access denied
```

### D-11

Prove a paid subscription can actually be created through the real integration path.

---

# 21. AUDIT / PROVENANCE

Every commercially meaningful transition should be traceable.

At minimum consider:

```text
actor
organization
resource
action
request/correlation id
before state
after state
version
timestamp
result
```

Do not log:

```text
password
raw session token
payment secret
provider secret
unredacted sensitive payload
```

Preserve Platform audit semantics.

---

# 22. MIGRATIONS

Create only the migrations actually required.

Never modify old migrations that have already been used.

For every migration verify:

```text
forward migration
constraints
indexes
foreign keys
unique constraints
nullability
rollback/recovery strategy
```

Migration IDs must be unique.

The current lane already used:

```text
0008–0012
```

Do not assume these IDs remain available.

Inspect the actual migration directory first.

---

# 23. DATABASE CONSTRAINTS

Domain validation is not sufficient.

Where appropriate enforce:

```text
unique provider event id
unique provider subscription id
unique membership
unique seat allocation
foreign keys
non-negative seat quantities
valid subscription ownership
commercial ledger references
```

Do not duplicate business logic unnecessarily in SQL.

Use DB constraints for invariants that must survive concurrent requests.

---

# 24. TEST MATRIX

Add tests for:

### Identity

```text
registration
login
session persistence
revocation
expiry
restart
```

### Organization

```text
creation
membership
role
scope
cross-org denial
IDOR
```

### Subscription

```text
creation
activation
renewal
cancel
expiry
restart
```

### Seats

```text
allocation
release
limits
concurrency
```

### Billing

```text
payment event
webhook verification
idempotency
refund
commercial ledger
reconciliation
```

### Entitlement

```text
activation
expiration
upgrade
downgrade
precedence
```

### HTTP

```text
auth
authz
validation
safe errors
ownership
idempotency
```

### E2E

```text
register → subscribe → pay → webhook → entitlement → access → cancel → deny
```

---

# 25. FAILURE SEMANTICS

Never silently convert:

```text
DATABASE_UNAVAILABLE
```

into:

```text
FREE_USER
```

Never silently convert:

```text
BILLING_UNAVAILABLE
```

into:

```text
PAYMENT_SUCCESS
```

Never silently convert:

```text
ENTITLEMENT_UNKNOWN
```

into:

```text
ALLOW
```

Default secure behavior must be explicit.

Do not weaken existing:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

data semantics.

---

# 26. AI BOUNDARY

AI may:

```text
explain plan
summarize billing
explain entitlement
assist support
recommend configuration
```

AI may NOT:

```text
invent payment status
override authorization
grant entitlement
bypass billing
modify commercial ledger
approve refunds autonomously
execute financial transactions
```

---

# 27. PERFORMANCE

Measure where evidence exists.

At minimum inspect:

```text
DB query count
subscription lookup latency
entitlement lookup latency
membership lookup latency
webhook processing
authorization overhead
```

Do not prematurely introduce Redis or distributed infrastructure.

Cache only when freshness/invalidation semantics are explicit.

---

# 28. EVIDENCE AUDIT

After implementation perform an adversarial audit.

Ask:

```text
Can a paid user exist only in memory?
Can billing state disappear after restart?
Can duplicate webhook double-charge?
Can duplicate webhook double-grant entitlement?
Can a user access another organization?
Can seat allocation exceed purchased seats?
Can authorization compare the wrong object path?
Can an unauthenticated user access a business route?
Can a client claim payment success?
Can an AI path grant entitlement?
Can a database failure silently become FREE?
Can a process restart corrupt business state?
```

Every answer must be:

```text
NO
```

with test/evidence.

---

# 29. REQUIRED DOCUMENTATION

Create/update:

```text
docs/BUSINESS_06_ARCHITECTURE.md
docs/BUSINESS_06_CERTIFICATION.md
docs/BUSINESS_06_FULL_AUDIT.md
docs/BUSINESS_PERSISTENCE_ARCHITECTURE.md
docs/BUSINESS_PERSISTENCE_READINESS.md
```

Update existing:

```text
docs/BUSINESS_MONETIZATION_ARCHITECTURE.md
docs/BUSINESS_FULL_AUDIT.md
```

only where necessary.

Do not rewrite historical certification evidence.

---

# 30. CERTIFICATION GATE

BUSINESS-06 is CERTIFIED only when:

```text
P0 = 0
P1 = 0

Business tests PASS
Full regression PASS
Typecheck PASS
Build PASS

Durable identity PASS
Durable organization PASS
Durable subscription PASS
Durable seat PASS
Durable entitlement PASS
Commercial ledger PASS
Webhook idempotency PASS
Payment abstraction PASS

Authentication PASS
Authorization PASS
IDOR PASS

Restart durability PASS
Concurrency invariants PASS

E2E commercial journey PASS
Audit/provenance PASS
Security PASS
```

If a real payment provider is not configured:

the provider integration may remain:

```text
PROVIDER_ABSTRACTION_READY
```

but the production payment path must not be falsely marked live.

---

# 31. BUSINESS FINAL CERTIFICATION

After BUSINESS-06:

perform a complete BUSINESS-01→06 re-audit.

Required final matrix:

```text
BUSINESS-01  Monetization Foundation
BUSINESS-02  Community
BUSINESS-03  Marketplace
BUSINESS-04  B2B / Organization
BUSINESS-05  Billing / Commercial Audit
BUSINESS-06  Persistence & Integration
```

No phase may be marked CERTIFIED merely because its old tests still pass.

Revalidate the integrated system.

Target:

```text
BUSINESS LANE — CERTIFIED
P0 = 0
P1 = 0
```

If only limitations remain:

```text
CERTIFIED_WITH_LIMITATIONS
```

must be used honestly.

---

# 32. POST-BUSINESS READINESS AUDIT

Before Infrastructure, create:

```text
docs/POST_BUSINESS_READINESS_AUDIT.md
```

Audit:

```text
Core Intelligence
Data Foundation
Decision OS
Research
Product
Paper Replay
Platform
Business
Learning
Security
Persistence
Observability
Financial safety
Commercial safety
```

Explicitly determine:

```text
READY_FOR_INFRA
```

or:

```text
NOT_READY_FOR_INFRA
```

Do not begin INFRA-01 automatically.

---

# 33. STOP CONDITION

When BUSINESS-06 and final Business certification are complete:

STOP.

Do not implement:

```text
INFRA-01
INFRA-02
INFRA-03
INFRA-04
INFRA-05
```

Do not implement Kubernetes.

Do not implement cloud deployment.

Do not implement payment-provider production credentials.

Do not create Business-07.

Return the evidence report and wait for explicit authorization.

---

# 34. FINAL REPORT FORMAT

Return:

```text
BUSINESS-06 FINAL RESULT

1. Architecture
2. Persistence implemented
3. Repositories
4. Migrations
5. Identity durability
6. Organization durability
7. Subscription durability
8. Seat durability
9. Entitlement durability
10. Commercial ledger
11. Payment abstraction
12. Webhook idempotency
13. HTTP integration
14. E2E journey
15. Restart durability
16. Concurrency validation
17. Security audit
18. Audit/provenance
19. Tests
20. Full regression
21. Typecheck
22. Build
23. P0/P1/P2/P3 findings
24. Remaining limitations
25. BUSINESS-01→06 final certification
26. POST-BUSINESS READINESS
27. READY_FOR_INFRA / NOT_READY_FOR_INFRA
28. Exact changed files
29. Exact migrations
30. Git status
31. Next authorized phase
```

Never claim a phase is certified when evidence says conditional.

# END — BUSINESS-06