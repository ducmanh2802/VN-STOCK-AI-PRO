# BUSINESS-01→05 BUSINESS / MONETIZATION
# AUTONOMOUS IMPLEMENTATION + AUDIT + CERTIFICATION ROADMAP

## 0. ROLE

You are the autonomous Business / Monetization engineering agent for:

`VN-STOCK-AI-PRO`

Your responsibility is to transform the already-built:

```text
CORE INVESTMENT INTELLIGENCE
        ↓
DATA FOUNDATION
        ↓
DECISION OS
        ↓
RESEARCH / BACKTEST / VALIDATION
        ↓
PRODUCT
        ↓
PAPER REPLAY
        ↓
PLATFORM
        ↓
BUSINESS / MONETIZATION
```

into a technically sound, auditable, commercially extensible business platform.

You MUST work from the actual repository state.

Do NOT assume that previous phase reports are correct merely because they exist.

Verify the implementation, tests, schemas, APIs, services, UI, migrations, and runtime behavior.

The goal is NOT to create a fake SaaS layer.

The goal is to establish a real commercial architecture on top of the existing investment intelligence platform.

---

# 1. MASTER OBJECTIVE

Build and certify:

```text
BUSINESS-01
MONETIZATION FOUNDATION
        ↓
BUSINESS-02
COMMUNITY
        ↓
BUSINESS-03
STRATEGY / RESEARCH MARKETPLACE
        ↓
BUSINESS-04
B2B / ORGANIZATION / TRAINING
        ↓
BUSINESS-05
BILLING / ENTITLEMENT / COMMERCIAL AUDIT
        ↓
BUSINESS FULL AUDIT
        ↓
BUSINESS CERTIFICATION
```

The final system must support:

```text
individual user
      ↓
free / premium / pro
      ↓
usage entitlement
      ↓
research
      ↓
learning
      ↓
portfolio
      ↓
strategy
      ↓
paper replay
      ↓
community
      ↓
marketplace
      ↓
organization
      ↓
B2B
```

without compromising:

- financial correctness
- data integrity
- risk controls
- auditability
- privacy
- security
- reproducibility
- fail-closed behavior
- existing platform architecture.

---

# 2. NON-NEGOTIABLE RULES

## 2.1 NO FABRICATED BUSINESS DATA

Never fabricate:

- revenue
- subscription counts
- customer counts
- payment status
- marketplace performance
- strategy returns
- user statistics
- conversion rates
- usage numbers
- financial metrics.

If real data does not exist:

```text
UNAVAILABLE
```

or:

```text
NOT_YET_AVAILABLE
```

must be used.

Never silently substitute fake numbers.

---

# 3. FINANCIAL SAFETY BOUNDARY

This Business lane MUST NOT weaken:

```text
RiskGuard
RiskManager
PositionSizer
TradingEngine
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
PaperBroker
Execution boundaries
Data provenance
Decision provenance
```

Business features must NEVER:

- override risk controls
- override position sizing
- bypass data validation
- execute real trades
- convert a subscription into trading authority
- let marketplace creators bypass risk
- let an administrator bypass financial safety controls.

Commercial entitlement is NOT financial authorization.

---

# 4. REAL MONEY BOUNDARY

The platform may eventually integrate payment providers.

However:

BUSINESS phases MUST NOT assume a specific payment provider unless the repository already contains one.

Create a provider abstraction where appropriate.

For example:

```text
PaymentProvider
SubscriptionProvider
InvoiceProvider
EntitlementProvider
```

The initial implementation may use:

```text
provider abstraction
+
internal deterministic test adapter
```

but must clearly distinguish:

```text
TEST
SANDBOX
PRODUCTION
```

Never represent a test payment as a real payment.

Never allow test payment state to grant production financial privileges.

---

# 5. REGULATORY / COMPLIANCE BOUNDARY

This platform is investment-related.

Business functionality MUST NOT make unsupported claims such as:

- guaranteed returns
- guaranteed profits
- risk-free investment
- guaranteed strategy performance
- guaranteed trading signals
- guaranteed investment outcomes.

Marketplace and community content must support:

```text
educational content
research
analysis
strategy methodology
paper performance
historical results
```

with appropriate status and provenance.

Do not implement regulated financial-advisory behavior unless explicitly authorized by a future goal.

---

# 6. ARCHITECTURAL PRINCIPLE

Prefer:

```text
existing modular monolith
```

over premature microservices.

Business layer should sit approximately here:

```text
                PLATFORM
                   ↓
        BUSINESS / COMMERCIAL
                   ↓
        PRODUCT / APPLICATION
                   ↓
       INVESTMENT INTELLIGENCE
                   ↓
              DATA
```

Do NOT rewrite the application architecture.

Do NOT introduce microservices merely for theoretical scalability.

Do NOT introduce Kubernetes.

Do NOT introduce cloud infrastructure.

Do NOT introduce distributed queues unless the current architecture actually requires them.

---

# 7. REQUIRED EXECUTION LOOP

For EACH business phase:

```text
1. DISCOVERY
2. ARCHITECTURE AUDIT
3. GAP ANALYSIS
4. ACCEPTANCE CRITERIA
5. IMPLEMENTATION
6. UNIT TESTS
7. INTEGRATION TESTS
8. SECURITY TESTS
9. TYPECHECK
10. BUILD
11. EVIDENCE AUDIT
12. REMEDIATION
13. REGRESSION TEST
14. CERTIFICATION
15. NEXT PHASE
```

Do not declare a phase complete merely because code compiles.

---

# 8. PHASE 0 — BUSINESS READINESS AUDIT

Before BUSINESS-01:

Audit:

```text
PLATFORM-01
PLATFORM-02
PLATFORM-03
PLATFORM-04
PLATFORM-05

PRODUCT
PAPER REPLAY

DATA FOUNDATION
DECISION OS
RESEARCH

Phase 24–29
```

Verify actual repository state.

Audit:

### Identity

- user model
- session model
- authentication
- authorization
- organization
- workspace
- role
- permission

### Product

- journal
- research workspace
- scenarios
- AI assistant
- alerts
- monitoring

### Research

- experiment
- backtest
- certification
- strategy
- dataset
- reproducibility

### Paper

- replay
- order
- fill
- ledger
- portfolio
- risk
- review

### Audit

- audit log
- provenance
- correlation IDs
- actor identity

Produce:

```text
docs/BUSINESS_READINESS_AUDIT.md
```

Do not implement business functionality until this audit is complete.

---

# BUSINESS-01
# MONETIZATION FOUNDATION

## Objective

Create the commercial entitlement foundation.

The platform must understand:

```text
USER
PLAN
SUBSCRIPTION
ENTITLEMENT
USAGE
LIMIT
FEATURE
```

without requiring payment-provider lock-in.

---

## 01.1 Plans

Design extensible plans.

Example:

```text
FREE
PREMIUM
PRO
TEAM
BUSINESS
ENTERPRISE
```

Do NOT hard-code business logic throughout the application.

Use a centralized plan/entitlement model.

Example conceptual structure:

```text
Plan
PlanFeature
PlanLimit
Subscription
SubscriptionStatus
Entitlement
```

---

## 01.2 Subscription lifecycle

Support explicit states:

```text
TRIALING
ACTIVE
PAST_DUE
PAUSED
CANCELLED
EXPIRED
INCOMPLETE
UNAVAILABLE
```

Do not assume cancellation immediately deletes access.

Define:

```text
current period
effective date
expiration
grace period
```

where appropriate.

---

## 01.3 Feature entitlement

Create a centralized entitlement engine.

Conceptually:

```text
canAccess(user, feature)
canUse(user, capability)
remainingUsage(user, resource)
```

Entitlement evaluation should consider:

```text
user
organization
workspace
plan
subscription
feature
usage
limits
status
```

---

## 01.4 Feature registry

Create a canonical feature registry.

Potential capabilities:

```text
LEARNING
ADVANCED_LEARNING
RESEARCH
BACKTEST
PAPER_REPLAY
PORTFOLIO
ADVANCED_PORTFOLIO
SCENARIO
AI_ASSISTANT
ALERTS
MARKET_DATA
ADVANCED_MARKET_DATA
STRATEGY_PUBLISH
MARKETPLACE
TEAM_WORKSPACE
B2B_TRAINING
API_ACCESS
EXPORT
```

These are examples only.

Audit actual product capabilities first.

Do not create dead features that have no implementation.

---

## 01.5 Usage metering

Create usage concepts without inventing consumption.

Possible usage dimensions:

```text
AI_REQUESTS
BACKTEST_RUNS
PAPER_REPLAYS
RESEARCH_EXPERIMENTS
EXPORTS
ALERTS
API_CALLS
STORAGE
TEAM_SEATS
```

Usage must be:

```text
observable
auditable
idempotent
time-bounded
```

Avoid race conditions.

A usage event must not be counted twice because of request retry.

---

## 01.6 Free tier

Free tier must be explicit.

Do not implement:

```text
if user then free
```

throughout the application.

Instead:

```text
FREE PLAN
↓
FEATURE ENTITLEMENTS
↓
LIMITS
```

---

## 01.7 Commercial isolation

Financial/trading code must not directly inspect:

```text
plan === PRO
```

Instead:

```text
EntitlementService
```

must mediate commercial capability.

---

## 01.8 BUSINESS-01 tests

Test:

- plan resolution
- entitlement
- feature access
- usage limits
- expired subscription
- cancelled subscription
- trial
- organization entitlement
- user entitlement
- concurrent usage
- duplicate usage event
- authorization interaction
- fail-closed behavior.

Certification:

```text
BUSINESS-01 CERTIFIED
```

only if entitlement behavior is deterministic and auditable.

---

# BUSINESS-02
# COMMUNITY

## Objective

Create a safe research/learning community around the platform.

Community is NOT merely a social feed.

It must connect to:

```text
Learning
Research
Strategy
Paper Replay
Decision Journal
Knowledge
```

---

# 02.1 Community entities

Potential entities:

```text
Profile
Post
Comment
Reaction
Follow
Bookmark
Tag
Collection
Report
ModerationAction
ReputationEvent
```

Audit actual needs.

Do not build unnecessary social features.

---

# 02.2 Research sharing

Users should be able to share:

```text
research
analysis
learning notes
strategy methodology
paper replay
scenario
decision journal entry
```

But every shared artifact must retain provenance.

Example:

```text
Author
CreatedAt
UpdatedAt
Version
Source
Dataset
StrategyVersion
ResearchVersion
PaperReplayVersion
Visibility
```

---

# 02.3 Visibility

Support explicit visibility:

```text
PRIVATE
WORKSPACE
COMMUNITY
UNLISTED
PUBLIC
```

Do not expose private research accidentally.

---

# 02.4 Privacy boundary

Enforce:

```text
owner
workspace
organization
community
public
```

server-side.

Never rely only on frontend hiding.

Test IDOR.

---

# 02.5 Moderation

Create moderation architecture.

Possible states:

```text
VISIBLE
HIDDEN
FLAGGED
UNDER_REVIEW
REMOVED
SUSPENDED
```

Moderation must be auditable.

---

# 02.6 Investment content safety

Community content must not be presented as guaranteed financial advice.

Support appropriate labels such as:

```text
EDUCATIONAL
RESEARCH
PAPER_ONLY
HYPOTHESIS
PERSONAL_VIEW
```

Do not automatically label content as trustworthy merely because the author has high reputation.

---

# 02.7 Reputation

If reputation is implemented:

It must be based on explicit events.

Examples:

```text
helpful contribution
verified research
learning completion
quality feedback
moderation history
```

Do NOT use reputation as a substitute for financial truth.

---

# 02.8 BUSINESS-02 tests

Test:

- privacy
- visibility
- ownership
- organization access
- IDOR
- moderation
- report flow
- content deletion
- content versioning
- provenance
- community safety
- audit events.

Certify:

```text
BUSINESS-02 CERTIFIED
```

only when privacy and authorization are proven.

---

# BUSINESS-03
# STRATEGY / RESEARCH MARKETPLACE

## Objective

Create a marketplace/discovery architecture for:

```text
strategies
research
templates
learning material
paper-tested ideas
```

without creating a fake performance marketplace.

---

# 03.1 Strategy publishing

A strategy publication should include:

```text
Strategy ID
Version
Author
Description
Universe
Asset Class
Rules
Parameters
Risk Model
Execution Model
Cost Model
Dataset
Backtest Version
Validation Status
Paper Replay
Publication Status
```

---

# 03.2 Performance provenance

Never display:

```text
+37.4%
```

without knowing:

```text
dataset
period
strategy version
cost model
execution model
validation state
```

Performance must link to certified research where available.

---

# 03.3 Marketplace status

Potential statuses:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
PUBLISHED
SUSPENDED
DEPRECATED
ARCHIVED
```

---

# 03.4 Verification

Separate:

```text
PUBLISHED
```

from:

```text
VERIFIED
```

and:

```text
CERTIFIED
```

Do not let publication imply validation.

---

# 03.5 Strategy versioning

A strategy update must create a new version.

Never mutate historical performance silently.

Example:

```text
Strategy A v1
Strategy A v2
Strategy A v3
```

Each version must retain independent research references.

---

# 03.6 Marketplace discovery

Possible filters:

```text
asset class
market
strategy type
risk
drawdown
holding period
validation status
paper status
author
```

Do not expose misleading rankings.

Avoid:

```text
highest return = best strategy
```

as the sole ranking.

---

# 03.7 Marketplace ranking

If ranking exists, consider:

```text
risk-adjusted performance
drawdown
sample size
validation status
stability
turnover
cost sensitivity
out-of-sample quality
```

A ranking must expose methodology.

---

# 03.8 Commercial model

Possible:

```text
FREE
ONE_TIME
SUBSCRIPTION
BUNDLE
ORGANIZATION_LICENSE
```

Do not implement actual payment settlement unless provider integration is explicitly authorized.

Create provider-neutral interfaces.

---

# 03.9 Creator economics

If revenue sharing is introduced:

Keep:

```text
gross revenue
platform fee
creator share
refund
tax
payout status
```

separate.

Never fabricate payout balances.

---

# 03.10 BUSINESS-03 tests

Test:

- strategy versioning
- publication
- certification
- performance provenance
- ranking
- visibility
- ownership
- marketplace entitlement
- commercial state
- no fake performance
- no version mutation
- audit.

Certify:

```text
BUSINESS-03 CERTIFIED
```

---

# BUSINESS-04
# B2B / ORGANIZATION / TRAINING

## Objective

Turn the platform into an organization-ready product.

The existing Platform organization model must be extended, not duplicated.

---

# 04.1 Organization

Support:

```text
Organization
Workspace
Team
Member
Role
Permission
Seat
```

Reuse PLATFORM authorization architecture.

Do NOT create a second role system.

---

# 04.2 B2B use cases

Potential use cases:

```text
investment research team
training center
financial education
internal investment team
corporate learning
research organization
```

---

# 04.3 Training

Connect Business training to:

```text
Learning Hub
Courses
Paths
Lessons
Exercises
Assessment
Certification
Progress
Instructor
```

Do not duplicate Learning engines.

---

# 04.4 Instructor

Potential roles:

```text
INSTRUCTOR
MENTOR
REVIEWER
TRAINING_ADMIN
```

Map them through Platform authorization.

---

# 04.5 Organization content

Organizations may own:

```text
courses
research
strategies
workspaces
training programs
datasets
reports
```

Ownership must be explicit.

---

# 04.6 Seats

Seat management:

```text
AVAILABLE
ASSIGNED
SUSPENDED
REVOKED
```

Seat count must be consistent.

Concurrent seat assignment must be safe.

---

# 04.7 Organization entitlements

Commercial hierarchy:

```text
Organization
    ↓
Subscription
    ↓
Plan
    ↓
Entitlements
    ↓
Workspace
    ↓
Users
```

Define precedence clearly.

For example:

```text
organization entitlement
overrides individual plan
```

ONLY if explicitly designed and documented.

Do not accidentally allow privilege escalation.

---

# 04.8 B2B analytics

Potential metrics:

```text
learning completion
research usage
workspace activity
training progress
seat utilization
```

Do not expose private user information beyond organization policy.

---

# 04.9 B2B export

Potential exports:

```text
training report
completion report
research report
organization activity
audit report
```

Exports must honor authorization.

---

# 04.10 BUSINESS-04 tests

Test:

- organization ownership
- workspace ownership
- seats
- roles
- permissions
- training
- instructor
- learner
- organization entitlement
- private data isolation
- export authorization
- concurrent membership
- organization deletion/deactivation.

Certify:

```text
BUSINESS-04 CERTIFIED
```

---

# BUSINESS-05
# BILLING / ENTITLEMENT / COMMERCIAL AUDIT

## Objective

Complete the commercial operating system.

This phase connects:

```text
plans
subscriptions
entitlements
usage
billing
invoice
payment
refund
marketplace
organization
audit
```

without compromising financial correctness.

---

# 05.1 Payment abstraction

Define provider-neutral architecture.

Conceptual:

```text
PaymentProvider
CustomerProvider
SubscriptionProvider
InvoiceProvider
RefundProvider
```

Provider adapters must be isolated.

---

# 05.2 Payment state

Explicitly distinguish:

```text
PAYMENT_PENDING
PAYMENT_SUCCEEDED
PAYMENT_FAILED
PAYMENT_REFUNDED
PAYMENT_CANCELLED
PAYMENT_UNKNOWN
```

`PAYMENT_UNKNOWN` must NOT silently become success.

---

# 05.3 Subscription state machine

Define legal transitions.

Example:

```text
TRIALING
    ↓
ACTIVE
    ↓
PAST_DUE
    ↓
ACTIVE / CANCELLED

ACTIVE
    ↓
CANCELLED
    ↓
EXPIRED
```

Illegal transitions must be rejected.

---

# 05.4 Idempotency

Payment/webhook processing MUST be idempotent.

Duplicate events must not create:

- duplicate subscription
- duplicate invoice
- duplicate entitlement
- duplicate refund
- duplicate payout.

---

# 05.5 Webhooks

If provider integration exists or is introduced:

Verify:

```text
signature
timestamp
event ID
provider
payload
```

Store processing state.

Example:

```text
RECEIVED
VALIDATED
PROCESSING
PROCESSED
FAILED
RETRY_REQUIRED
```

Never trust client-side payment success.

---

# 05.6 Billing ledger

Do not mix:

```text
commercial billing ledger
```

with:

```text
investment FinancialConservation ledger
```

They are different accounting domains.

Create clear boundaries.

Investment accounting:

```text
cash
position
NAV
P&L
fees
```

Commercial accounting:

```text
invoice
payment
refund
credit
platform fee
creator share
```

Never cross-contaminate them.

---

# 05.7 Entitlement reconciliation

Create reconciliation between:

```text
subscription
billing
payment
entitlement
usage
organization
```

Detect:

```text
subscription ACTIVE
but payment UNKNOWN

payment SUCCEEDED
but entitlement missing

entitlement ACTIVE
but subscription expired
```

These should become explicit reconciliation states.

Never silently repair without an auditable event.

---

# 05.8 Refund handling

Refund must update:

```text
payment
invoice
subscription
entitlement
marketplace economics
```

according to defined policy.

Do not automatically remove historical research ownership unless policy explicitly requires it.

---

# 05.9 Commercial audit

Audit events should include:

```text
subscription_created
subscription_changed
subscription_cancelled
payment_received
payment_failed
refund_issued
entitlement_granted
entitlement_revoked
usage_recorded
plan_changed
seat_assigned
seat_removed
marketplace_purchase
creator_payout
```

Every event must contain sufficient provenance.

---

# 05.10 BUSINESS-05 tests

Test:

- state transitions
- idempotency
- duplicate webhook
- payment failure
- payment unknown
- refund
- subscription expiration
- entitlement reconciliation
- organization billing
- marketplace billing
- commercial ledger
- audit
- authorization.

Certify:

```text
BUSINESS-05 CERTIFIED
```

only if commercial state is deterministic and auditable.

---

# 9. COMMERCIAL SECURITY AUDIT

After BUSINESS-05 perform a dedicated security audit.

Inspect:

## Authentication

- session handling
- password storage if applicable
- token lifecycle
- session expiration
- logout
- account recovery

## Authorization

- IDOR
- privilege escalation
- organization isolation
- workspace isolation
- marketplace ownership
- billing ownership

## Payment

- webhook verification
- idempotency
- replay attacks
- signature validation
- secret handling
- client-side trust

## Data

- PII
- private research
- organization data
- billing data
- exports

## API

- rate limits
- request validation
- pagination
- injection
- mass assignment
- unsafe deserialization

## Frontend

- XSS
- unsafe HTML
- token leakage
- sensitive data in local storage
- authorization UI assumptions

---

# 10. BUSINESS DATA MODEL AUDIT

Inspect all new tables.

Every table must have:

```text
primary key
createdAt
updatedAt
ownership where applicable
status where applicable
version where required
```

Sensitive entities should have appropriate:

```text
audit reference
actor reference
organization reference
workspace reference
```

where applicable.

Avoid unnecessary PII.

---

# 11. MIGRATION RULES

Every schema change requires:

```text
explicit migration
```

Never modify production schema manually.

Migration IDs must be checked against the actual repository.

Never reuse an existing migration ID.

Never delete historical migrations casually.

Never use destructive migration to hide architectural mistakes.

---

# 12. API DESIGN

Business APIs should be:

```text
authenticated
authorized
validated
auditable
idempotent where required
```

Do not expose internal database structures directly.

Prefer domain-level APIs.

Example:

```text
GET /api/billing/subscription
GET /api/entitlements
GET /api/usage
POST /api/community/posts
POST /api/research/publications
POST /api/marketplace/strategies
GET /api/organizations
GET /api/training
```

These are examples only.

Audit existing routing conventions first.

---

# 13. FRONTEND BUSINESS EXPERIENCE

Do NOT turn the product into a generic SaaS dashboard.

Preserve:

```text
Premium Institutional / TradingView-inspired terminal
```

Business UI should remain visually consistent.

Potential surfaces:

```text
Account
Plan
Usage
Entitlements
Billing
Community
Research Marketplace
Strategy Marketplace
Organization
Training
Commercial Audit
```

Avoid:

- excessive cards
- marketing-dashboard aesthetics
- fake KPI numbers
- fake revenue charts
- fake user counts.

If data is unavailable, show:

```text
NO DATA
```

or:

```text
UNAVAILABLE
```

---

# 14. AI BOUNDARY

AI may assist with:

```text
content discovery
research summarization
learning recommendations
community moderation assistance
strategy explanation
commercial support
```

AI MUST NOT:

- invent financial performance
- invent billing state
- approve payment
- grant unauthorized entitlement
- override authorization
- execute real trades
- override risk
- fabricate marketplace verification
- fabricate strategy certification.

AI suggestions must remain suggestions unless an explicit deterministic system action is invoked.

---

# 15. MARKETPLACE SAFETY

Every marketplace strategy must distinguish:

```text
AUTHORED
PUBLISHED
VERIFIED
BACKTESTED
OUT_OF_SAMPLE_TESTED
PAPER_TESTED
CERTIFIED
```

Do not collapse these states.

A strategy being popular does NOT mean it is validated.

A strategy having high historical return does NOT mean it is safe.

---

# 16. COMMUNITY + MARKETPLACE PROVENANCE

The following chain should be traceable:

```text
USER
 ↓
POST
 ↓
RESEARCH
 ↓
STRATEGY VERSION
 ↓
DATASET
 ↓
BACKTEST
 ↓
VALIDATION
 ↓
PAPER REPLAY
 ↓
PUBLICATION
```

Where evidence does not exist, the chain must explicitly show:

```text
NOT_AVAILABLE
```

rather than fabricate provenance.

---

# 17. COMMERCIAL ENTITLEMENT CHAIN

Canonical chain:

```text
USER
 ↓
ORGANIZATION
 ↓
WORKSPACE
 ↓
PLAN
 ↓
SUBSCRIPTION
 ↓
ENTITLEMENT
 ↓
FEATURE
 ↓
USAGE
 ↓
LIMIT
```

All capability checks should converge on a deterministic entitlement mechanism.

---

# 18. PRODUCT INTEGRATION

Integrate Business into existing product capabilities.

Examples:

```text
Learning
Research
Portfolio
Decision Journal
Strategy
Paper Replay
Alerts
AI
Community
Marketplace
Organization
```

Do NOT duplicate existing engines.

Use existing domain services where possible.

---

# 19. TEST STRATEGY

Each business phase must add focused tests.

Minimum categories:

### Unit

```text
plan resolution
entitlement
usage
subscription state
marketplace state
community visibility
organization access
```

### Integration

```text
user → plan → entitlement
organization → plan → member
strategy → research → marketplace
payment → subscription → entitlement
refund → subscription → entitlement
```

### Security

```text
IDOR
privilege escalation
cross-organization access
private research leakage
billing access
marketplace ownership
webhook spoofing
duplicate webhook
```

### Property / invariant tests

Examples:

```text
duplicate payment event => one economic effect
duplicate usage event => one usage effect
unauthorized user => no access
private resource => inaccessible cross-owner
expired entitlement => denied
```

---

# 20. FULL BUSINESS END-TO-END TEST

At the end run a realistic scenario:

```text
CREATE USER
    ↓
ASSIGN FREE PLAN
    ↓
USE FREE FEATURES
    ↓
HIT LIMIT
    ↓
START TRIAL
    ↓
ACTIVATE PREMIUM
    ↓
GAIN ENTITLEMENT
    ↓
RUN RESEARCH
    ↓
CREATE STRATEGY
    ↓
BACKTEST
    ↓
PAPER REPLAY
    ↓
PUBLISH RESEARCH
    ↓
COMMUNITY SHARE
    ↓
MARKETPLACE PUBLICATION
    ↓
ORGANIZATION INVITATION
    ↓
ASSIGN SEAT
    ↓
TRAINING
    ↓
SUBSCRIPTION CHANGE
    ↓
REFUND / CANCELLATION
    ↓
ENTITLEMENT RECONCILIATION
    ↓
AUDIT
```

Verify every transition.

No fake payment.

No fake performance.

No unauthorized access.

No broken provenance.

---

# 21. BUSINESS FULL AUDIT

After BUSINESS-05 create:

```text
docs/BUSINESS_FULL_AUDIT.md
```

Audit:

## A. Architecture

- domain boundaries
- dependency direction
- service boundaries
- database boundaries

## B. Commercial

- plans
- subscriptions
- entitlement
- usage
- billing
- refund
- marketplace economics

## C. Security

- authentication
- authorization
- IDOR
- privacy
- payment security

## D. Financial safety

- investment ledger untouched
- risk controls intact
- no real execution
- no financial bypass

## E. Data

- provenance
- versioning
- auditability
- PII

## F. Product

- Learning integration
- Research integration
- Paper Replay integration
- Community
- Marketplace
- Organization

## G. Reliability

- idempotency
- retries
- duplicate events
- reconciliation
- failure states

## H. UX

- terminal consistency
- no fake metrics
- explicit unavailable states

---

# 22. BUSINESS CERTIFICATION MATRIX

Create:

```text
docs/BUSINESS_CERTIFICATION.md
```

Matrix:

| Area | Requirement | Status |
|---|---|---|
| BUSINESS-01 | Monetization Foundation | |
| BUSINESS-02 | Community | |
| BUSINESS-03 | Marketplace | |
| BUSINESS-04 | B2B / Organization | |
| BUSINESS-05 | Billing / Commercial Audit | |
| Security | Passed | |
| Authorization | Passed | |
| Privacy | Passed | |
| Idempotency | Passed | |
| Reconciliation | Passed | |
| Provenance | Passed | |
| Financial Safety | Passed | |
| Regression | Passed | |
| Typecheck | Passed | |
| Build | Passed | |

Certification requires:

```text
P0 = 0
P1 = 0
```

and no unresolved security-critical issue.

P2/P3/P4 issues must be explicitly documented.

---

# 23. REQUIRED DOCUMENTS

At minimum create:

```text
docs/BUSINESS_READINESS_AUDIT.md

docs/BUSINESS_01_ARCHITECTURE.md
docs/BUSINESS_01_CERTIFICATION.md

docs/BUSINESS_02_ARCHITECTURE.md
docs/BUSINESS_02_CERTIFICATION.md

docs/BUSINESS_03_ARCHITECTURE.md
docs/BUSINESS_03_CERTIFICATION.md

docs/BUSINESS_04_ARCHITECTURE.md
docs/BUSINESS_04_CERTIFICATION.md

docs/BUSINESS_05_ARCHITECTURE.md
docs/BUSINESS_05_CERTIFICATION.md

docs/BUSINESS_MONETIZATION_ARCHITECTURE.md
docs/BUSINESS_FULL_AUDIT.md
docs/BUSINESS_CERTIFICATION.md
```

---

# 24. GIT SAFETY

Before modifying anything:

```bash
git status --short
git branch --show-current
git log -5 --oneline
```

Record baseline.

Never use:

```bash
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
```

Never delete unrelated work.

Never blanket-stage:

```bash
git add .
```

Stage only files belonging to the current business phase.

Before every commit:

```text
git diff --stat
git diff --name-only
git status --short
```

Verify commit purity.

---

# 25. PARALLEL AGENT SAFETY

The repository may contain:

```text
OpenCode Learning
CodeGPT Core Quant
Product lane
Phase 27
Data Foundation
Decision OS
Research
Paper Replay
Platform
```

Do NOT modify another lane.

If a file is concurrently changing:

```text
STOP
```

or isolate the work.

Never overwrite concurrent work.

Never “clean up” unrelated dirty files.

---

# 26. PROTECTED FILES

Treat these as highly protected:

```text
RiskGuard
RiskManager
PositionSizer
TradingEngine
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
PaperBroker
Execution
Market Data Providers
Core accounting
Core schema
Global server routing
Authentication
Authorization
```

If modification is absolutely necessary:

```text
document reason
document impact
test regression
```

Never weaken existing controls to make Business tests pass.

---

# 27. PERFORMANCE

Business features must not introduce unnecessary:

```text
N+1 queries
unbounded queries
unbounded feed loading
unbounded community search
unbounded usage aggregation
```

Use:

```text
pagination
cursor pagination where appropriate
indexes
bounded queries
aggregation
caching where safe
```

Do not cache authorization decisions longer than the system can safely tolerate.

Commercial entitlement changes must become effective deterministically.

---

# 28. OBSERVABILITY

Business operations should emit structured operational events where appropriate.

Important events:

```text
subscription_changed
entitlement_changed
payment_received
payment_failed
refund
marketplace_purchase
publication
moderation
organization_membership_changed
seat_changed
```

Never log:

```text
password
secret
payment credentials
access tokens
sensitive personal information
```

---

# 29. FAILURE SEMANTICS

Never hide failures.

Use explicit states such as:

```text
UNAVAILABLE
INVALID
UNKNOWN
PENDING
REQUIRES_RECONCILIATION
FORBIDDEN
LIMIT_REACHED
PAYMENT_REQUIRED
```

Do NOT convert:

```text
PAYMENT_UNKNOWN
```

into:

```text
ACTIVE
```

Do NOT convert:

```text
ENTITLEMENT_UNKNOWN
```

into:

```text
ALLOWED
```

Security-sensitive defaults should fail closed.

---

# 30. DEFINITION OF DONE

Business is complete ONLY when:

```text
BUSINESS-01 CERTIFIED
AND
BUSINESS-02 CERTIFIED
AND
BUSINESS-03 CERTIFIED
AND
BUSINESS-04 CERTIFIED
AND
BUSINESS-05 CERTIFIED
```

AND:

```text
BUSINESS_FULL_AUDIT complete
BUSINESS_CERTIFICATION complete
security audit passed
authorization audit passed
privacy audit passed
idempotency tests passed
reconciliation tests passed
full regression passed
typecheck passed
build passed
```

AND:

```text
P0 = 0
P1 = 0
```

---

# 31. FINAL REPORT

Create:

```text
docs/BUSINESS_FINAL_REPORT.md
```

Include:

## Executive Summary

```text
BUSINESS STATUS:
CERTIFIED / CONDITIONAL / BLOCKED
```

## Phase status

```text
BUSINESS-01:
BUSINESS-02:
BUSINESS-03:
BUSINESS-04:
BUSINESS-05:
```

## Architecture

Summarize:

```text
Plan
Subscription
Entitlement
Usage
Community
Marketplace
Organization
Billing
Audit
```

## Security

Report:

```text
authentication
authorization
IDOR
privacy
payment security
webhook security
```

## Financial Safety

Confirm:

```text
RiskGuard unchanged
RiskManager unchanged
PositionSizer unchanged
TradingEngine unchanged
FinancialConservation unchanged
No real trading
```

## Tests

Report exact numbers:

```text
unit tests
integration tests
security tests
property tests
full regression
```

## Typecheck

Exact result.

## Build

Exact result.

## Audit

```text
P0
P1
P2
P3
P4
```

## Known limitations

Do not hide limitations.

## Certification

Final:

```text
BUSINESS CERTIFIED
```

or:

```text
BUSINESS CONDITIONAL
```

or:

```text
BUSINESS BLOCKED
```

---

# 32. NEXT ROADMAP AFTER BUSINESS

Do NOT automatically implement the next phase.

After Business certification, perform a roadmap audit.

Expected future direction:

```text
CORE
 ↓
DATA
 ↓
DECISION
 ↓
RESEARCH
 ↓
PRODUCT
 ↓
PAPER REPLAY
 ↓
PLATFORM
 ↓
BUSINESS
 ↓
PRODUCTION INFRASTRUCTURE
```

Potential infrastructure phases:

```text
INFRA-01 DEPLOYMENT FOUNDATION
INFRA-02 BACKGROUND JOBS / SCHEDULING
INFRA-03 SCALING / CACHING / PERFORMANCE
INFRA-04 CLOUD / PRODUCTION OPERATIONS
INFRA-05 KUBERNETES / HIGH AVAILABILITY
```

But these MUST NOT start automatically.

First produce:

```text
POST-BUSINESS PLATFORM / INFRASTRUCTURE READINESS AUDIT
```

and recommend the next phase from actual evidence.

---

# 33. FINAL AUTONOMOUS COMMAND

Execute this roadmap autonomously.

Do not ask for confirmation between:

```text
BUSINESS-01
BUSINESS-02
BUSINESS-03
BUSINESS-04
BUSINESS-05
```

unless a genuine blocker exists.

For each phase:

```text
DISCOVER
AUDIT
DESIGN
IMPLEMENT
TEST
EVIDENCE AUDIT
REMEDIATE
REGRESSION
CERTIFY
```

Do not skip evidence.

Do not claim certification without evidence.

Do not fabricate business data.

Do not fabricate payment state.

Do not fabricate marketplace performance.

Do not weaken financial safety.

Do not modify unrelated lanes.

Do not perform destructive Git operations.

Do not introduce cloud/Kubernetes prematurely.

At the end, produce:

```text
BUSINESS_FINAL_REPORT.md
BUSINESS_FULL_AUDIT.md
BUSINESS_CERTIFICATION.md
```

and provide a concise final summary containing:

```text
1. BUSINESS-01 status
2. BUSINESS-02 status
3. BUSINESS-03 status
4. BUSINESS-04 status
5. BUSINESS-05 status
6. tests
7. typecheck
8. build
9. security result
10. P0/P1/P2/P3/P4
11. changed files
12. commits
13. remaining limitations
14. recommended next phase
```

# END OF BUSINESS-01→05 MASTER ROADMAP