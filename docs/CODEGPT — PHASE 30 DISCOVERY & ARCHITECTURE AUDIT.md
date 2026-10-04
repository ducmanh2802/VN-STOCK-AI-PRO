# CODEGPT — PHASE 30 DISCOVERY & ARCHITECTURE AUDIT

## MISSION

Phase 28 and Phase 29 are now officially integrated and verified.

Verified commits:

```text
e67a656 feat(portfolio): integrate phase 28 portfolio intelligence
c00dced feat(multi-asset): integrate phase 29 multi-asset quant
```

Current status:

```text
PHASE 28 = INTEGRATED + VERIFIED
PHASE 29 = INTEGRATED + VERIFIED
EXPIRY CONTRACT = FIXED + TESTED + DOCUMENTED
TYPECHECK = PASS
TESTS = PASS
BUILD = PASS
```

Your next authorized task is:

> **PHASE 30 — DISCOVERY & ARCHITECTURE AUDIT ONLY**

Do NOT implement Phase 30 yet.

---

# 1. ABSOLUTE SCOPE

This task is:

```text
DISCOVERY
+
ARCHITECTURE AUDIT
+
GAP ANALYSIS
+
SCOPE DEFINITION
+
ACCEPTANCE CRITERIA
+
GO / NO-GO
```

It is NOT implementation.

Do not add Phase 30 production code.

Do not create Phase 30 migrations.

Do not modify existing production engines.

Do not refactor unrelated code.

Do not modify Learning.

Do not modify Phase 27.

Do not modify UI unless the audit only requires documenting an observed boundary.

---

# 2. IMPORTANT — DO NOT ASSUME THE PHASE 30 DOMAIN

Do NOT assume Phase 30 means:

```text
Quant Research
Portfolio Optimization
Risk Intelligence
Backtesting
Decision Intelligence
```

Any of these may be appropriate.

But Phase 30 scope must be DERIVED from evidence.

Answer:

> After Phase 24 → Phase 29, what is the highest-value missing capability required to evolve VN-STOCK-AI-PRO into an Investment Operating System?

Rank candidate domains.

Do not manufacture a phase simply because the roadmap previously suggested one.

---

# 3. READ FIRST

Inspect:

```text
docs/AGENT_PARALLEL_EXECUTION.md

docs/PHASE_28_DISCOVERY_REPORT.md
docs/PHASE_28_ARCHITECTURE.md
docs/PHASE_28_CERTIFICATION.md

docs/PHASE_29_ARCHITECTURE.md
docs/PHASE_29_CERTIFICATION.md
```

Also inspect all relevant existing architecture and roadmap documentation.

Then inspect actual source code.

Do NOT rely only on documentation.

---

# 4. CURRENT CAPABILITY AUDIT

Build a capability map covering at least:

```text
Market Data
Data Quality
Fundamentals
Earnings
Valuation
Macro Regime
Industry Cycle
Strategy Factory
Portfolio Intelligence
Multi-Asset
Risk
Position Sizing
Paper Trading
Execution Boundary
Monitoring
Decision Support
Backtesting
Scenario Analysis
Stress Testing
Research
Learning
Audit / Provenance
```

For every capability classify:

```text
IMPLEMENTED
PARTIAL
MISSING
DUPLICATED
BLOCKED
DEFERRED
```

Identify overlap.

Identify architectural gaps.

---

# 5. INVESTMENT DECISION CHAIN AUDIT

Determine whether the system can currently execute this conceptual chain:

```text
REAL DATA
 ↓
DATA VALIDATION
 ↓
MACRO REGIME
 ↓
INDUSTRY REGIME
 ↓
FUNDAMENTAL
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
PAPER EXECUTION
 ↓
MONITORING
 ↓
DECISION REVIEW
```

For each edge determine:

```text
EXISTS
PARTIAL
MISSING
```

This is one of the most important Phase 30 questions.

---

# 6. PORTFOLIO / MULTI-ASSET AUDIT

Now that Phase 28 and Phase 29 are integrated, audit their real capabilities.

Inspect:

```text
src/lib/portfolio/**
src/services/portfolio/**

src/lib/multi-asset/**
src/services/multi-asset/**
```

Determine:

- what is genuinely reusable;
- what is still isolated;
- what lacks persistence;
- what lacks service/API integration;
- what lacks historical data;
- what lacks validation;
- what lacks scenario support;
- what lacks transaction-cost semantics;
- what lacks turnover semantics;
- what lacks reproducibility;
- what lacks production integration.

Do not duplicate existing Phase 28/29 functionality in Phase 30.

---

# 7. RESEARCH / BACKTESTING AUDIT

Determine the actual state of:

```text
historical simulation
strategy backtesting
portfolio backtesting
transaction costs
slippage
turnover
corporate actions
survivorship bias
look-ahead bias
walk-forward testing
out-of-sample testing
benchmarking
performance attribution
```

Do not assume these are missing.

Inspect first.

If they exist, assess their quality.

If they do not exist, determine whether they belong in Phase 30 or a later phase.

---

# 8. DATA FOUNDATION AUDIT

Inspect actual data capabilities:

```text
OHLCV
fundamentals
earnings
corporate actions
macro
industry
ETF
futures
cash
historical constituents
delisted securities
```

For each:

```text
source
history depth
freshness
adjustment semantics
provenance
quality
failure behavior
```

Identify gaps that would invalidate future quantitative research.

---

# 9. NUMERICAL CORRECTNESS

Audit:

```text
NAV
returns
PnL
weights
risk
volatility
beta
covariance
correlation
factor exposure
portfolio optimization
futures multiplier
futures tick
lot size
cash
fees
turnover
```

Determine which calculations are:

```text
CERTIFIED
TESTED
PARTIAL
MISSING
```

Do not modify them during this discovery task.

---

# 10. BIAS / REPRODUCIBILITY

Audit whether research can be reproduced.

For any quantitative result determine whether the architecture captures:

```text
asOfDate
data snapshot
engine version
configuration
universe
corporate-action state
```

Assess:

```text
look-ahead bias
survivorship bias
selection bias
data leakage
```

This is mandatory for any future backtesting/research phase.

---

# 11. RISK / SAFETY BOUNDARY

Audit integration with:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
paper broker
execution
ledger
```

Verify the Phase 30 architecture cannot bypass them.

Do not modify protected systems.

---

# 12. PURE ENGINE / SERVICE / DATA BOUNDARY

Determine whether the next phase should follow:

```text
src/lib/<domain>/
    pure deterministic engines

src/services/<domain>/
    orchestration / application services

src/lib/db/
    persistence

API
    transport
```

Check:

```text
no Date.now() in pure engines
no hidden I/O
no random behavior
explicit asOfDate
explicit failure states
deterministic outputs
```

Document deviations.

---

# 13. AI BOUNDARY

Audit where AI currently belongs.

AI must remain downstream of verified system evidence:

```text
REAL DATA
 ↓
VALIDATION
 ↓
DETERMINISTIC ENGINE
 ↓
EVIDENCE
 ↓
AI EXPLANATION
```

AI must not become the source of financial truth.

---

# 14. PERSISTENCE AUDIT

Determine whether the next capability requires database persistence.

Inspect:

```text
schema
migrations
repositories
services
```

Determine:

```text
what must persist
why
ownership
versioning
audit
reproducibility
```

Do not create migrations.

---

# 15. PERFORMANCE / SCALE

Estimate architecture requirements for:

```text
1 stock
100 stocks
1,000 stocks
10,000 instruments
1 portfolio
100 portfolios
10,000 users
```

Identify:

```text
batch opportunities
caching
incremental computation
snapshotting
background processing
```

Do not implement infrastructure during discovery.

---

# 16. FRONTEND BOUNDARY

Audit what the UI currently consumes.

Determine whether Phase 30 requires:

```text
new service contracts
new API endpoints
new data views
new research views
new portfolio views
new decision views
```

Do not redesign the UI during discovery.

---

# 17. TEST / CERTIFICATION AUDIT

Determine the required tests for Phase 30.

Include:

```text
unit
property
determinism
numerical invariants
contract
integration
historical replay
bias detection
failure semantics
regression
```

Define measurable acceptance criteria.

---

# 18. CANDIDATE PHASES

Rank at least 3 candidate directions.

For each candidate provide:

```text
Candidate
Why it matters
Existing capability
Missing capability
Dependencies
Data requirements
Architectural impact
Risk
Complexity
User value
Business value
```

Then select:

```text
RECOMMENDED PHASE 30
```

and explain why.

Also identify:

```text
PHASE 31
PHASE 32
```

as likely follow-ups if evidence supports them.

Do NOT implement them.

---

# 19. NO DUPLICATION RULE

Phase 30 must not recreate:

```text
Portfolio Intelligence
Multi-Asset Quant
Strategy Factory
Macro Regime
Industry Cycle
Earnings Intelligence
```

If a candidate phase overlaps existing capabilities:

```text
REUSE
INTEGRATE
EXTEND
```

rather than duplicate.

---

# 20. REQUIRED DOCUMENTS

Create/update exactly:

```text
docs/PHASE_30_DISCOVERY_REPORT.md
docs/PHASE_30_ARCHITECTURE.md
```

The Discovery Report must contain:

```text
Executive Summary
Repository Baseline
Phase 24→29 Capability Map
Current Architecture
Investment Decision Chain
Data Audit
Research Audit
Backtest Audit
Portfolio Audit
Multi-Asset Audit
Risk Audit
Bias Audit
Reproducibility Audit
Persistence Audit
Performance Audit
AI Boundary
Frontend Boundary
Security
Testing
Candidate Phase Ranking
Recommended Phase 30
Deferred Scope
Phase 31 Candidates
Phase 32 Candidates
GO / NO-GO
```

The Architecture document must contain:

```text
Target Architecture
Domain Boundaries
Module Boundaries
Pure Engine Design
Service Design
Repository Design
Data Flow
Failure Flow
Provenance
Persistence
API Boundary
Frontend Boundary
Testing Architecture
Migration Strategy
Performance Strategy
Security
Integration Strategy
Implementation Slices
Acceptance Criteria
```

---

# 21. GIT RULES

This is a READ/DOCUMENTATION audit.

Do not stage unrelated files.

Do not use:

```text
git add .
git add -A
git reset --hard
git clean
git restore .
git stash
```

Preserve the dirty worktree.

Do not touch:

```text
Learning
Phase 27
Phase 28 implementation
Phase 29 implementation
protected financial systems
unrelated remediation
UI owned by another lane
```

Only create/update the two Phase 30 audit documents.

---

# 22. STOP CONDITION

After the two documents are complete:

STOP.

Do not implement Phase 30.

Do not create migrations.

Do not add services.

Do not add engines.

Do not add UI.

Do not commit unrelated work.

---

# 23. FINAL REPORT

Return:

```text
PHASE 30 DISCOVERY:
STATUS: COMPLETE

Repository baseline:
Phase 28:
Phase 29:

Top capability gaps:

Candidate 1:
Candidate 2:
Candidate 3:

RECOMMENDED PHASE 30:
WHY:

PHASE 31:
PHASE 32:

Required data:

Required persistence:

Required dependencies:

Risk:

Acceptance criteria:

GO / NO-GO:

Files created:
- docs/PHASE_30_DISCOVERY_REPORT.md
- docs/PHASE_30_ARCHITECTURE.md

Implementation:
NOT STARTED
```

# END