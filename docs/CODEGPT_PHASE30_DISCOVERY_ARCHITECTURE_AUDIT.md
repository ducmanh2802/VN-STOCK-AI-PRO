# CODEGPT — PHASE 30 DISCOVERY & ARCHITECTURE AUDIT

## SYSTEM

Project:

```text
VN-STOCK-AI-PRO
```

Current certified baseline:

```text
Phase 24 — Earnings & Financial Statements Intelligence
Phase 25 — Strategy Factory / Universal Multi-Asset Strategy Abstraction
Phase 26 — Industry Capital Cycle & Policy Intelligence
Phase 27 — Macro Regime & Economic Cycle Intelligence
Phase 28 — Portfolio Intelligence
Phase 29 — Multi-Asset Quant Integration
```

Current product direction:

> VN-STOCK-AI-PRO is evolving into an Investment Operating System / Multi-Asset Quant Intelligence Platform.

---

# 0. MISSION

Perform:

> **PHASE 30 — DISCOVERY & ARCHITECTURE AUDIT**

This is a:

> READ-ONLY DISCOVERY + ARCHITECTURE + GAP ANALYSIS

Do NOT implement Phase 30.

Do NOT modify source code.

Do NOT modify schema.

Do NOT create migrations.

Do NOT modify frontend/UI.

Do NOT add dependencies.

Do NOT modify Learning.

Do NOT commit.

Do NOT stash.

Do NOT reset.

Do NOT merge.

Do NOT cherry-pick.

Do NOT start Phase 31.

The purpose of this phase is to determine:

1. What Phase 30 actually should be.
2. Why Phase 30 belongs after Phase 28–29.
3. What already exists.
4. What is missing.
5. What architecture should be introduced.
6. What data is actually available.
7. What must NOT be invented.
8. What acceptance criteria should define Phase 30.
9. Whether Phase 30 is READY FOR IMPLEMENTATION.

---

# 1. CRITICAL PRINCIPLE

Do NOT assume the next phase from a prompt, filename, previous conversation, or guessed roadmap.

The repository is the source of truth.

You MUST inspect:

- actual Git state
- existing roadmap documents
- Phase 28 architecture
- Phase 29 architecture
- existing portfolio engines
- existing multi-asset engines
- strategy infrastructure
- risk infrastructure
- market-data infrastructure
- macro infrastructure
- factor infrastructure
- valuation infrastructure
- backtesting infrastructure
- database/schema
- tests
- configuration
- protected systems

Then derive the correct Phase 30 scope.

If existing documentation proposes a Phase 30 scope, verify it against actual implementation.

If documentation and implementation disagree:

> implementation + tests + actual data availability take precedence over assumptions.

---

# 2. HARD SAFETY / GOVERNANCE RULES

## 2.1 READ-ONLY

This phase is strictly read-only.

Forbidden:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git push --force
git commit
git merge
git cherry-pick
git stash
```

Do not modify:

```text
src/
server.ts
package.json
package-lock.json
schema
migrations
.env
configuration
frontend
tests
docs
Learning files
```

Documentation output is allowed ONLY if explicitly necessary to create the Phase 30 audit report.

Prefer producing the report without modifying the repository if possible.

If a report file is created, it must be documentation-only and must not alter application behavior.

---

# 3. REPOSITORY BASELINE AUDIT

First inspect the repository.

Run:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -30
git diff --stat
git diff --name-only
git diff --cached --stat
git diff --cached --name-only
```

Determine:

```text
HEAD
branch
working tree state
uncommitted files
untracked files
recent phase commits
```

Do NOT assume the repository is clean.

If Phase 28/29 integration work remains uncommitted, report it.

Do not repair it during Phase 30 discovery.

---

# 4. ESTABLISH THE CERTIFIED BASELINE

Inspect:

```text
docs/PHASE_28_DISCOVERY_REPORT.md
docs/PHASE_28_ARCHITECTURE.md
docs/PHASE_28_CERTIFICATION.md

docs/PHASE_29_ARCHITECTURE.md
docs/PHASE_29_CERTIFICATION.md
```

Also inspect relevant:

```text
docs/
.clinerules/
```

Determine:

- exact Phase 28 capabilities
- exact Phase 29 capabilities
- known limitations
- deferred capabilities
- known data limitations
- known architectural constraints
- known technical debt
- explicit next-phase recommendations

Do not treat certification documents as proof of current repository state without cross-checking implementation.

---

# 5. FULL ARCHITECTURE DISCOVERY

Map the actual backend architecture.

Inspect:

```text
src/lib/**
src/services/**
src/lib/db/**
src/schemas/**
tests/**
```

Identify major engine families.

At minimum search for:

```text
portfolio
multi-asset
risk
factor
allocation
optimization
benchmark
scenario
stress
correlation
covariance
beta
tracking
volatility
drawdown
concentration
strategy
backtest
macro
regime
valuation
fundamental
technical
money-flow
earnings
capital-cycle
derivatives
ETF
corporate-actions
market-data
```

Produce a capability inventory.

For every relevant capability classify:

```text
EXISTS
PARTIAL
MISSING
DEPRECATED
DUPLICATED
UNUSED
UNKNOWN
```

---

# 6. DETERMINE THE TRUE PHASE 30 DOMAIN

This is one of the most important tasks.

Do not simply assume:

```text
Phase 30 = <whatever the previous agent suggested>
```

Instead derive Phase 30 from:

1. Phase 28 completed capability surface.
2. Phase 29 completed capability surface.
3. Existing roadmap.
4. Deferred architecture.
5. Existing engines.
6. Data availability.
7. Current product direction.
8. Missing high-value portfolio/investment capabilities.
9. Architectural dependency ordering.
10. Risk and correctness requirements.

Answer explicitly:

```text
WHY PHASE 30 EXISTS

WHAT PROBLEM IT SOLVES

WHY IT MUST FOLLOW PHASE 28–29

WHAT USER / INVESTOR WORKFLOW IT ENABLES

WHAT PREVIOUS PHASES ALREADY PROVIDE

WHAT PHASE 30 ADDS
```

If more than one candidate domain is plausible, rank them.

Example:

```text
Candidate A
Candidate B
Candidate C
```

Then select exactly one recommended Phase 30 scope based on evidence.

---

# 7. PHASE 30 SHOULD NOT DUPLICATE PHASE 28–29

Explicitly map boundaries.

Create a table:

| Capability | Phase 28 | Phase 29 | Proposed Phase 30 |
|---|---|---|---|

Identify overlapping responsibilities.

Prevent:

- duplicate portfolio engines
- duplicate risk engines
- duplicate allocation logic
- duplicate asset semantics
- duplicate factor aggregation
- duplicate benchmark logic
- duplicate scenario logic

If an existing engine should be extended instead of duplicated, state so.

---

# 8. PORTFOLIO INTELLIGENCE GAP AUDIT

Perform a deep gap analysis around:

## Portfolio Construction

Inspect whether the system has:

- strategic allocation
- tactical allocation
- constraint-aware optimization
- turnover constraints
- transaction-cost-aware optimization
- minimum/maximum asset weights
- sector constraints
- factor constraints
- liquidity constraints
- cash constraints
- leverage constraints
- margin constraints
- asset-class constraints
- benchmark-relative constraints

Classify each:

```text
EXISTS
PARTIAL
MISSING
NOT APPLICABLE
```

---

# 9. RISK MODEL GAP AUDIT

Inspect:

- covariance model
- correlation
- volatility
- beta
- tracking error
- factor exposure
- factor contribution
- marginal risk contribution
- component risk contribution
- total portfolio risk
- volatility contribution
- concentration risk
- liquidity risk
- drawdown risk
- stress risk
- scenario risk
- tail risk
- VaR
- CVaR / Expected Shortfall
- benchmark-relative risk
- active risk

Determine whether existing implementations are:

```text
ANALYTICAL
SIMPLIFIED
PRODUCTION-READY
PARTIAL
DEMO-LIKE
```

Do not upgrade the classification without evidence.

---

# 10. OPTIMIZATION GAP AUDIT

Search for actual optimization capabilities.

Inspect:

```text
minimum variance
mean variance
risk parity
inverse volatility
Black-Litterman
hierarchical risk parity
maximum diversification
maximum Sharpe
CVaR optimization
robust optimization
constraint solver
turnover-aware optimization
transaction cost optimization
```

Determine:

- what exists
- what is simplified
- what is mathematically incomplete
- what has tests
- what has production data
- what depends on synthetic data
- what can safely be expanded

Do not propose advanced optimization merely because it sounds sophisticated.

Prioritize:

> correctness + explainability + data availability + maintainability.

---

# 11. FACTOR MODEL AUDIT

Inspect the current factor infrastructure.

Determine:

- available factors
- factor data source
- factor history
- factor coverage
- missingness
- factor aggregation
- exposure calculation
- factor returns
- factor contribution
- factor covariance
- factor risk
- idiosyncratic risk

Explicitly determine whether the system has:

```text
FACTOR EXPOSURE
FACTOR RETURN
FACTOR RISK
FACTOR ATTRIBUTION
FACTOR PORTFOLIO OPTIMIZATION
```

Do not conflate these concepts.

No silent imputation.

No invented factor values.

---

# 12. DATA AVAILABILITY AUDIT

This is mandatory.

Map every data dependency required by the candidate Phase 30 architecture.

For each dataset record:

```text
DATASET
SOURCE
PROVIDER
HISTORICAL DEPTH
UPDATE FREQUENCY
ASSET COVERAGE
DATA QUALITY
MISSING DATA BEHAVIOR
FRESHNESS
FAILURE MODE
```

Inspect actual provider implementations.

At minimum investigate:

```text
KBS
VPS
VNDIRECT
ETF data
derivatives data
stock_daily
fundamental data
macro data
factor data
benchmark data
```

Do not claim a dataset exists because a type/interface exists.

Verify the provider.

---

# 13. HISTORICAL DATA DEPTH

Explicitly audit:

```text
equities
ETF
futures
benchmark
macro
factors
```

Determine actual historical lookback.

Identify:

- insufficient history
- survivorship bias
- hardcoded universe
- missing delisted securities
- corporate action adjustment limitations
- symbol changes
- liquidity history limitations

If an advanced model requires data that does not exist:

> mark it as unavailable rather than inventing a fallback.

---

# 14. SURVIVORSHIP BIAS AUDIT

Investigate whether portfolio research depends on:

```text
hardcoded symbol universe
current constituents
current sector classification
current ETF holdings
current index membership
```

Determine whether historical backtesting can distinguish:

```text
historical universe
current universe
survivorship-biased universe
```

This is critical for any Phase 30 research or optimization feature.

---

# 15. CORPORATE ACTION / PRICE SEMANTICS

Inspect:

- split handling
- dividend handling
- adjusted price
- unadjusted price
- total return
- corporate actions
- futures expiry
- contract rollover
- ETF NAV vs market price

Determine whether Phase 30 needs:

```text
price return
total return
cash return
portfolio return
benchmark return
```

Ensure these are not accidentally mixed.

---

# 16. TRANSACTION COST / TURNOVER AUDIT

Determine whether the system has real support for:

```text
commission
tax
slippage
spread
market impact
turnover
rebalance cost
liquidity constraint
```

Do not assume zero transaction costs are acceptable.

If transaction costs are absent, identify the architectural implications for any proposed optimization/rebalancing system.

---

# 17. MULTI-ASSET SEMANTICS AUDIT

Phase 30 must preserve Phase 29 semantics.

Verify architecture boundaries for:

### Equity

```text
lot = 100
```

### ETF

```text
lot = 100
```

### Futures

```text
multiplier = 100000
tick = 0.1
expiry required
margin required
unrealized P&L required
```

### Cash

Preserve face-value semantics.

### NAV

NAV calculations must not mutate market price semantics.

### Strategy

Never override:

```text
HOLD
FLAT
BUY
SELL
```

based on portfolio optimization.

Optimization may recommend an allocation.

It must not silently mutate execution intent.

---

# 18. RISKGUARD / TRADING SAFETY BOUNDARY

Inspect:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
PaperBroker
Ledger
Replay
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
```

Determine how Phase 30 can integrate without bypassing them.

Hard rule:

> Phase 30 may recommend, analyze, optimize, or simulate.

It must not bypass:

```text
RiskGuard
TradingEngine
PositionSizer
financial conservation
market-data integrity
```

Any proposed live-execution integration must be explicitly separated from research/decision logic.

---

# 19. PURE ENGINE ARCHITECTURE

Determine which Phase 30 components should be:

```text
src/lib/<domain>/
```

and which should be:

```text
src/services/<domain>/
```

Required principle:

### Pure engines

Must be:

- deterministic
- side-effect free
- explicit-input driven
- `asOfDate` aware where temporal
- independently testable

Must NOT:

- call database
- call providers
- read current time
- mutate global state
- silently fetch missing data

### Services

May handle:

- orchestration
- provider calls
- cache
- persistence
- dependency injection
- fail-closed data acquisition

---

# 20. PERSISTENCE AUDIT

Determine whether Phase 30 actually needs database persistence.

Inspect:

```text
schema
migrations
repositories
portfolio tables
strategy tables
backtest tables
risk tables
factor tables
market-data tables
```

For any proposed persistent entity define:

```text
ENTITY
WHY PERSISTENCE IS REQUIRED
SOURCE OF TRUTH
RETENTION
VERSIONING
AS-OF SEMANTICS
USER OWNERSHIP
AUDITABILITY
```

Do not create persistence merely because it is convenient.

---

# 21. USER / MULTI-PORTFOLIO ARCHITECTURE

Determine whether Phase 30 introduces:

```text
user-specific portfolios
multiple portfolios
model portfolios
saved allocations
optimization runs
risk snapshots
scenario results
```

If yes, audit:

- user identity
- ownership
- authorization
- tenant isolation
- data leakage risk
- persistence
- versioning
- audit trail

Do not assume Firebase authentication automatically solves authorization.

---

# 22. REPRODUCIBILITY

Every Phase 30 analytical result must be reproducible.

Determine required inputs:

```text
asOfDate
market data snapshot
portfolio snapshot
benchmark
factor dataset
constraints
optimization parameters
risk parameters
transaction-cost assumptions
```

Define how the system prevents:

```text
same input → different result
```

unless stochastic behavior is explicitly required and seeded.

---

# 23. SYNTHETIC / SIMULATED DATA BOUNDARY

Search for:

```text
Math.random
seeded random
demo generators
mock providers
fake data
sample portfolios
synthetic prices
```

Classify every occurrence.

The following distinction is mandatory:

```text
REAL MARKET DATA
EDUCATIONAL EXAMPLE
TEST FIXTURE
SYNTHETIC RESEARCH DATA
DEMO DATA
```

Phase 30 must never present:

```text
synthetic
test
demo
educational
```

as real investment evidence.

---

# 24. FAILURE / FAIL-CLOSED DESIGN

For every proposed Phase 30 capability define behavior when:

- data missing
- stale
- invalid
- inconsistent
- insufficient history
- covariance singular
- optimization infeasible
- constraints contradictory
- factor coverage insufficient
- benchmark unavailable
- price unavailable
- futures expiry missing
- margin missing
- transaction cost missing

Preferred behavior:

```text
EXPLICIT FAILURE
INSUFFICIENT_DATA
UNAVAILABLE
INVALID
STALE
INFEASIBLE
```

Never silently substitute fabricated values.

---

# 25. PERFORMANCE / SCALE AUDIT

Estimate computational requirements for:

```text
N assets
N×N covariance
factor models
optimization
scenario analysis
Monte Carlo if proposed
stress testing
multi-portfolio analysis
```

Determine:

- expected complexity
- memory requirements
- caching requirements
- batch vs synchronous execution
- server-side vs client-side computation

Do not prematurely introduce infrastructure.

---

# 26. API / SERVICE ARCHITECTURE

If Phase 30 requires backend APIs, design:

```text
route
request
validation
service
engine
repository
response
error model
```

Do NOT implement them.

Determine:

- synchronous vs asynchronous
- idempotency
- versioning
- authorization
- auditability

---

# 27. FRONTEND BOUNDARY

Do NOT modify UI.

Determine only whether Phase 30 eventually needs:

```text
new page
new panel
portfolio optimizer
risk dashboard
scenario workspace
allocation workspace
research workspace
```

UI remains outside this discovery implementation.

The Phase 30 architecture must expose backend contracts that a future frontend can consume.

---

# 28. TEST ARCHITECTURE

Define required tests for Phase 30.

At minimum consider:

### Unit

- deterministic calculations
- edge cases
- missing inputs
- boundary constraints

### Mathematical

- known analytical cases
- conservation properties
- monotonicity where applicable
- invariants

### Integration

- service/provider behavior
- persistence
- data validation

### Regression

- Phase 24
- Phase 25
- Phase 26
- Phase 27
- Phase 28
- Phase 29

### Safety

- RiskGuard isolation
- no execution bypass
- no financial conservation violation
- no strategy-state mutation

---

# 29. ACCEPTANCE CRITERIA DESIGN

Before implementation, create explicit acceptance criteria.

Each criterion must be:

```text
observable
testable
deterministic
evidence-based
```

Avoid vague criteria such as:

```text
works well
high quality
production ready
AI powered
advanced
robust
```

Use concrete criteria such as:

```text
Given X input and Y data availability,
engine returns Z deterministic result.

Given missing factor coverage,
engine returns INSUFFICIENT_DATA and does not impute.

Given infeasible constraints,
optimizer returns INFEASIBLE and does not emit an allocation.

Given invalid futures metadata,
multi-asset integration refuses valuation.
```

---

# 30. SECURITY AUDIT

If Phase 30 introduces persistence or user-specific functionality inspect:

- authentication
- authorization
- ownership
- IDOR
- cross-user leakage
- input validation
- parameter tampering
- unsafe optimization parameters
- resource exhaustion
- oversized matrices
- malicious payloads

Do not implement security fixes in this audit.

Report them.

---

# 31. OBSERVABILITY

Determine what Phase 30 needs for:

```text
diagnostics
calculation provenance
data provenance
error reason
model version
parameter version
asOfDate
input snapshot
```

For investment analytics, users should eventually be able to answer:

> Why did the system produce this result?

---

# 32. PROVENANCE

Define provenance requirements for every important Phase 30 output.

Every analytical result should eventually be traceable to:

```text
data source
data timestamp
asOfDate
calculation engine
engine version
parameters
constraints
benchmark
assumptions
```

Do not invent provenance metadata if the repository cannot currently support it.

Identify required architecture.

---

# 33. AI BOUNDARY

If Phase 30 could expose AI-generated explanations, explicitly separate:

```text
DETERMINISTIC FINANCIAL CALCULATION
AI INTERPRETATION
USER EDUCATION
```

AI must never become the source of truth for:

- prices
- portfolio weights
- P&L
- risk metrics
- valuation
- financial conservation
- trading constraints

AI may explain deterministic results.

---

# 34. PHASE 30 ARCHITECTURE PROPOSAL

After discovery, produce a proposed architecture.

Include:

```text
DOMAIN NAME
PURPOSE
BOUNDARY
CORE ENGINES
SERVICES
REPOSITORIES
SCHEMAS
API CONTRACTS
DATA SOURCES
DEPENDENCIES
TEST STRATEGY
FAILURE MODEL
SECURITY MODEL
PROVENANCE MODEL
```

Show dependency direction:

```text
Provider
   ↓
Service
   ↓
Pure Engine
   ↓
Result / Diagnostic
```

Never:

```text
Engine → Database
Engine → Provider
Engine → UI
Engine → Current Time
```

---

# 35. FILE-LEVEL ARCHITECTURE

Propose concrete file paths.

Example pattern:

```text
src/lib/<phase30-domain>/
  types.ts
  <EngineA>.ts
  <EngineB>.ts
  diagnostics.ts
  index.ts

src/services/<phase30-domain>/
  <Domain>Service.ts

src/lib/db/
  <Domain>Repository.ts

tests/<domain>/
```

Do not create these files.

This is architecture only.

---

# 36. MIGRATION STRATEGY

Determine whether Phase 30 requires migration.

If yes:

Define:

```text
migration purpose
entities
keys
indexes
constraints
ownership
versioning
rollback considerations
```

Migration IDs must be reserved before implementation.

Do not create migration files now.

If no migration is required, explicitly justify why.

---

# 37. DEPENDENCY AUDIT

Determine whether new packages are required.

Prefer existing dependencies.

For every potential dependency:

```text
PACKAGE
PURPOSE
WHY EXISTING LIBRARIES ARE INSUFFICIENT
SECURITY
MAINTENANCE
BUNDLE / RUNTIME IMPACT
```

Do not install anything.

---

# 38. PERFORMANCE / NUMERICAL CORRECTNESS

For numerical algorithms proposed in Phase 30, define:

- numerical precision
- conditioning
- singular matrices
- regularization
- convergence
- infeasibility
- bounds
- deterministic solver behavior
- reproducibility

Do not hide numerical problems with arbitrary fallback values.

If ridge regularization is required, make it explicit.

If a solver cannot converge:

```text
INFEASIBLE
NON_CONVERGED
NUMERICALLY_UNSTABLE
```

must be possible outcomes.

---

# 39. NO OVER-ENGINEERING RULE

Do NOT automatically propose:

- Kubernetes
- microservices
- distributed workers
- Kafka
- Redis
- cloud infrastructure
- GPU
- external paid APIs

unless the repository evidence demonstrates a real Phase 30 requirement.

The project currently prioritizes:

> correctness → architecture → evidence → maintainability → scale.

---

# 40. ROADMAP POSITIONING

Determine where Phase 30 fits relative to:

```text
Portfolio Intelligence
Multi-Asset Integration
Learning Platform
Macro Intelligence
Strategy Factory
Backtesting
Risk
AI Tutor
future community
future B2B/API
```

Prevent cross-lane contamination.

Learning remains owned by the Learning lane.

Do not implement Learning functionality.

---

# 41. PHASE 30 IMPLEMENTATION SLICING

If Phase 30 is READY, divide implementation into logical sub-phases.

Example:

```text
PHASE 30.1 — Foundation
PHASE 30.2 — Core Engines
PHASE 30.3 — Service/Data Integration
PHASE 30.4 — Persistence/API
PHASE 30.5 — Verification
```

But do NOT force this exact structure.

Derive the slices from architecture.

Each slice must have:

```text
scope
dependencies
acceptance criteria
tests
risk
evidence
```

---

# 42. DEFERRED SCOPE

Explicitly identify what should NOT be part of Phase 30.

Examples may include:

```text
UI redesign
AI assistant
cloud infrastructure
Kubernetes
community
customer training
live execution
broker integration
```

Only include exclusions supported by architectural boundaries.

---

# 43. PHASE 30 GO / NO-GO

At the end classify Phase 30:

### READY FOR IMPLEMENTATION

Architecture is clear, data exists, dependencies are understood, acceptance criteria are testable, and no blocker exists.

### READY WITH BLOCKERS

Architecture is understood but one or more dependencies must be resolved first.

### DISCOVERY CONTINUES

Important unknowns remain.

### NOT JUSTIFIED

The proposed capability duplicates existing functionality or lacks sufficient product/data justification.

Do not call Phase 30 READY merely because it is technically possible.

---

# 44. REQUIRED OUTPUT DOCUMENTS

Produce:

```text
docs/PHASE_30_DISCOVERY_REPORT.md
docs/PHASE_30_ARCHITECTURE.md
```

If repository policy uses different naming conventions, follow the established convention.

These documents must contain:

## PHASE_30_DISCOVERY_REPORT.md

```text
Executive Summary
Current Baseline
Phase 28/29 Capability Map
Repository Architecture Map
Candidate Phase 30 Domains
Selected Phase 30 Domain
Why Phase 30 Exists
Gap Analysis
Data Availability
Historical Data Audit
Survivorship Bias
Corporate Actions
Transaction Costs
Multi-Asset Semantics
Risk Boundary
Persistence
Security
Performance
Testing
Known Limitations
Deferred Scope
Risks
GO / NO-GO
```

## PHASE_30_ARCHITECTURE.md

```text
Domain
Goals
Non-Goals
Architecture
Module Boundaries
Engine Design
Service Design
Repository Design
Data Contracts
API Contracts
Persistence
Error Model
Fail-Closed Model
Provenance
Reproducibility
Numerical Correctness
Security
Testing Strategy
Acceptance Criteria
Implementation Slices
Dependencies
Migration Strategy
Future Extensions
```

---

# 45. EVIDENCE QUALITY

Every important architectural claim must be backed by repository evidence.

Use:

```text
file path
symbol/class/function
test file
existing documentation
data provider
schema
```

Do not write:

> "The system supports X"

without identifying where X actually exists.

Do not write:

> "Data is available"

without identifying the provider/path.

Do not write:

> "Production ready"

without concrete evidence.

---

# 46. FINAL REPORT FORMAT

Return exactly this high-level structure:

```text
================================================================================
PHASE 30 — DISCOVERY & ARCHITECTURE AUDIT
================================================================================

Repository:
Branch:
HEAD:

Baseline:
Phase 28:
Phase 29:

Repository cleanliness:
PASS / FAIL

Phase 30 candidate domains:

1.
2.
3.

Selected Phase 30 domain:

WHY:

Existing capabilities:

Missing capabilities:

Data availability:

Historical limitations:

Architecture recommendation:

Core engines:

Services:

Persistence:

APIs:

Migration:

Security:

Performance:

Testing:

Acceptance criteria:

Deferred scope:

Major risks:

Blocking dependencies:

GO / NO-GO:

PHASE 30 IMPLEMENTATION:
NOT STARTED
```

---

# 47. ABSOLUTE STOP CONDITION

After producing the discovery and architecture audit:

STOP.

Do not implement.

Do not commit.

Do not begin Phase 30 implementation.

Do not begin Phase 31.

Do not modify Learning.

Do not modify frontend.

Do not modify protected systems.

The next action will be authorized explicitly after reviewing the audit.

---

# 48. FINAL COMMAND

Start now.

First inspect the actual repository.

Then inspect Phase 28 and Phase 29.

Then derive the true Phase 30 scope from evidence.

Then produce:

```text
PHASE 30 DISCOVERY REPORT
PHASE 30 ARCHITECTURE
```

No implementation.

No speculative capability.

No fabricated data.

No silent assumptions.

No scope creep.

> **DISCOVER → VERIFY → ARCHITECT → DEFINE ACCEPTANCE → STOP**