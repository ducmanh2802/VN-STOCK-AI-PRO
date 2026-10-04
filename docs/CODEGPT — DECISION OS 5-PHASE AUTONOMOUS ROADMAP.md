# CODEGPT — DECISION OS 5-PHASE AUTONOMOUS ROADMAP

## 0. MISSION

You are the **Investment Decision OS Agent** for `VN-STOCK-AI-PRO`.

Your mission is to transform the existing analytical capabilities into a coherent, evidence-based investment decision operating system.

Execute these five phases sequentially:

```text
DECISION-01 — Investment Decision Chain
DECISION-02 — Investment Thesis Engine
DECISION-03 — Risk Decision Engine
DECISION-04 — Position Sizing & Decision Integration
DECISION-05 — Monitoring & Decision Review
```

Then perform:

```text
FULL DECISION OS AUDIT
        ↓
REMEDIATION
        ↓
REGRESSION
        ↓
CERTIFICATION
```

The objective is NOT to create another dashboard.

The objective is:

> REAL DATA → VALIDATED DATA → ANALYSIS → THESIS → RISK → POSITION SIZE → DECISION → EXECUTION/PAPER → MONITORING → REVIEW.

---

# 1. PREREQUISITE

Before implementation, verify:

```text
DATA-01→05
Phase 24
Phase 25
Phase 26
Phase 27
Phase 28
Phase 29
```

Do not assume certification.

Inspect actual repository and certification documents.

If Data Foundation has P0/P1 unresolved issues that directly invalidate Decision OS:

> STOP and report the blocker.

Do not compensate with mocks.

---

# 2. GOVERNANCE

Read:

```text
docs/AGENT_PARALLEL_EXECUTION.md
```

Then inspect relevant:

```text
docs/DATA_*.md
docs/PHASE_24_*.md
docs/PHASE_25_*.md
docs/PHASE_26_*.md
docs/PHASE_27_*.md
docs/PHASE_28_*.md
docs/PHASE_29_*.md
```

Inspect actual implementation before designing anything.

---

# 3. OWNERSHIP

Primary ownership:

```text
src/lib/decision/**
src/services/decision/**
src/lib/db/decision/**
tests/decision/**
docs/DECISION_*.md
```

UI changes may be made only where needed to expose Decision OS.

Do NOT casually modify:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
FinancialConservation
MarketDataIntegrityGuard
TradingDataValidator
Data Foundation
Portfolio engines
Strategy engines
Macro engines
Multi-Asset engines
Learning
```

Use existing capabilities through stable contracts.

---

# 4. CORE PRINCIPLE

The Decision OS must distinguish:

```text
ANALYSIS
vs
DECISION
```

A system may produce:

```text
BUY_SCORE = 82
```

without that automatically becoming:

```text
BUY
```

Decision requires evidence, constraints, risk and portfolio context.

---

# 5. DECISION-01 — INVESTMENT DECISION CHAIN

## Objective

Create a canonical decision pipeline.

Target:

```text
REAL DATA
 ↓
DATA VALIDATION
 ↓
MACRO REGIME
 ↓
INDUSTRY / SECTOR
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
EXECUTION / PAPER
 ↓
MONITORING
 ↓
REVIEW
```

---

## 5.1 Decision object

Create a canonical decision record containing, where applicable:

```text
decisionId
instrumentId
asOfDate
decisionType
decisionStatus
evidence
thesis
valuation
strategy
portfolioContext
riskContext
positionSizing
constraints
confidence
dataQuality
provenance
createdAt
version
```

Do not store arbitrary unstructured blobs when structured fields are appropriate.

---

## 5.2 Decision statuses

Use explicit states such as:

```text
PENDING
ELIGIBLE
APPROVED
REJECTED
BLOCKED
EXECUTED
MONITORING
CLOSED
REVIEW_REQUIRED
```

Do not conflate recommendation with execution.

---

## 5.3 Decision types

Support:

```text
BUY
ADD
HOLD
REDUCE
SELL
AVOID
WATCH
EXIT
```

Preserve existing strategy semantics.

A strategy returning `HOLD` must not be silently converted into `BUY`.

---

## 5.4 Decision evidence

Every decision should answer:

```text
Why?
Based on what?
As of when?
Using which data?
What invalidates it?
What is the risk?
What is the expected reward?
```

---

## 5.5 Fail closed

If critical evidence is unavailable:

```text
DATA_UNAVAILABLE
ANALYSIS_INCOMPLETE
RISK_UNAVAILABLE
VALUATION_UNAVAILABLE
PORTFOLIO_CONTEXT_UNAVAILABLE
```

Do not manufacture a decision.

---

## 5.6 Acceptance

Test:

- complete chain
- missing inputs
- stale inputs
- invalid inputs
- conflicting signals
- HOLD preservation
- blocked decisions
- deterministic decision output

---

# 6. DECISION-02 — INVESTMENT THESIS ENGINE

## Objective

Convert analytical evidence into an explicit investment thesis.

---

## 6.1 Thesis structure

Support:

```text
THESIS
  ├─ Core thesis
  ├─ Supporting evidence
  ├─ Catalysts
  ├─ Risks
  ├─ Valuation argument
  ├─ Competitive / industry context
  ├─ Macro context
  ├─ Expected outcome
  ├─ Time horizon
  └─ Invalidation conditions
```

---

## 6.2 Thesis must be evidence-linked

Do not allow:

```text
"Company looks good."
```

without supporting evidence.

Prefer:

```text
Thesis claim
 ↓
Metric / event / analysis
 ↓
Source
 ↓
As-of date
```

---

## 6.3 Bull / Base / Bear

Where enough data exists, support:

```text
BULL
BASE
BEAR
```

Each scenario should have:

```text
assumptions
drivers
risks
valuation implication
probability where justified
```

Do not invent probabilities.

---

## 6.4 Invalidation

Every actionable thesis should define what would make it wrong.

Examples:

```text
earnings deterioration
margin compression
debt increase
valuation breach
industry regime change
macro regime change
technical invalidation
risk limit breach
```

Only use criteria supported by actual system data.

---

## 6.5 Thesis lifecycle

```text
DRAFT
ACTIVE
CHALLENGED
INVALIDATED
CONFIRMED
CLOSED
```

Historical thesis states must remain auditable.

---

## 6.6 Acceptance

Test:

- thesis creation
- evidence linking
- scenarios
- invalidation
- lifecycle
- historical immutability
- missing evidence

---

# 7. DECISION-03 — RISK DECISION ENGINE

## Objective

Move from:

> "Is this investment attractive?"

to:

> "Is this investment acceptable given the risk?"

---

## 7.1 Risk dimensions

Integrate existing risk capabilities where available:

```text
market risk
volatility
drawdown
concentration
sector exposure
correlation
beta
liquidity
valuation risk
fundamental risk
macro risk
industry risk
strategy risk
portfolio interaction
```

Do not duplicate existing RiskGuard logic.

---

## 7.2 Risk state

Create explicit states:

```text
ACCEPTABLE
CAUTION
HIGH_RISK
BLOCKED
UNKNOWN
```

---

## 7.3 Hard constraints

Hard constraints must be authoritative.

Examples:

```text
max position
max sector
max portfolio concentration
minimum liquidity
minimum margin of safety
maximum drawdown tolerance
risk budget
```

Use existing configured risk policies.

Do not hard-code arbitrary investment rules.

---

## 7.4 Risk override hierarchy

Define explicitly:

```text
SAFETY / HARD RISK CONSTRAINT
        >
POSITION SIZE
        >
DECISION
        >
SCORE / SIGNAL
```

An AI recommendation cannot override RiskGuard.

---

## 7.5 Acceptance

Test:

- risk pass
- risk fail
- missing risk
- conflicting constraints
- concentration
- correlation
- invalid risk input
- fail-closed behavior

---

# 8. DECISION-04 — POSITION SIZING & DECISION INTEGRATION

## Objective

Connect decision quality to actual position sizing without allowing UI or AI to bypass the sizing engine.

---

## 8.1 Inputs

Where available:

```text
portfolio NAV
current position
entry price
stop/invalidation
risk budget
volatility
correlation
portfolio exposure
liquidity
asset class
lot size
multiplier
```

---

## 8.2 Existing engine preservation

Use existing:

```text
PositionSizer
RiskManager
RiskGuard
Portfolio Intelligence
Multi-Asset Quant
```

Do NOT reimplement them.

---

## 8.3 Position size states

```text
FULL
REDUCED
MINIMUM
ZERO
BLOCKED
```

---

## 8.4 Zero means different things

Distinguish:

```text
ZERO_BY_NO_SIGNAL
ZERO_BY_RISK
ZERO_BY_CONSTRAINT
ZERO_BY_DATA_UNAVAILABLE
ZERO_BY_PORTFOLIO_LIMIT
```

Never collapse these into generic zero.

---

## 8.5 Lot / multiplier

Preserve:

```text
Equity/ETF lot = 100
Futures multiplier = 100,000 VND
Futures tick = 0.1
```

Do not change Phase 29 semantics.

---

## 8.6 Acceptance

Test:

- sizing
- portfolio interaction
- risk budget
- lot rounding
- futures multiplier
- blocked sizing
- missing data
- HOLD/FLAT preservation

---

# 9. DECISION-05 — MONITORING & DECISION REVIEW

## Objective

A decision is not complete when it is made.

The system must determine whether the original thesis remains valid.

---

## 9.1 Monitoring state

Track:

```text
decision
thesis
risk
portfolio
market
fundamentals
macro
industry
valuation
strategy
```

---

## 9.2 Trigger conditions

Support:

```text
THESIS_INVALIDATED
RISK_LIMIT_BREACHED
TARGET_REACHED
STOP_TRIGGERED
VALUATION_CHANGED
FUNDAMENTAL_CHANGED
MACRO_CHANGED
INDUSTRY_CHANGED
DATA_INVALID
POSITION_CHANGED
```

---

## 9.3 Decision review

Create:

```text
Decision Review
```

with:

```text
original thesis
original evidence
original decision
actual outcome
what changed
what was correct
what was wrong
lessons
new decision
```

---

## 9.4 Decision journal

Preserve historical decisions.

Never rewrite history silently.

---

## 9.5 Monitoring cadence

Do not hard-code one universal cadence.

Use domain-specific freshness and monitoring requirements.

---

## 9.6 Acceptance

Test:

- trigger detection
- thesis invalidation
- risk breach
- review creation
- historical decision preservation
- changed decision
- unavailable data
- false-trigger prevention

---

# 10. CROSS-PHASE INTEGRATION

Final architecture:

```text
DATA FOUNDATION
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
PAPER / EXECUTION
       ↓
MONITORING
       ↓
REVIEW
       ↓
LEARNING
```

Learning should consume decision history as educational material only where appropriate.

It must not alter investment truth.

---

# 11. DECISION EXPLAINABILITY

Every decision should expose:

```text
WHAT
WHY
WHEN
EVIDENCE
RISK
SIZE
INVALIDATION
```

The user should be able to answer:

> "Why did the system tell me to buy this?"

without reading source code.

---

# 12. DECISION PROVENANCE

Each decision must retain references to:

```text
data version
asOfDate
analysis version
strategy version
risk policy version
position sizing version
```

This is essential for later Decision Review and Backtesting.

---

# 13. NO AI AUTHORITY

AI may:

```text
summarize
explain
challenge
suggest
teach
```

AI may NOT:

```text
override risk
invent data
change position size
execute trades autonomously
rewrite decision history
```

---

# 14. TESTING

Each phase requires:

```text
unit tests
integration tests
failure tests
regression tests
```

Final suite must verify:

```text
Phase 24
Phase 25
Phase 26
Phase 27
Phase 28
Phase 29
DATA-01→05
DECISION-01→05
```

---

# 15. FINAL AUDIT

Audit:

```text
Decision chain
Thesis
Risk
Position sizing
Monitoring
Review
Provenance
Historical reproducibility
Fail-closed behavior
AI boundary
```

Classify:

```text
P0
P1
P2
P3
P4
```

Certification requires:

```text
P0 = 0
P1 = 0
```

---

# 16. REQUIRED DOCUMENTS

Create:

```text
docs/DECISION_01_ARCHITECTURE.md
docs/DECISION_01_CERTIFICATION.md

docs/DECISION_02_ARCHITECTURE.md
docs/DECISION_02_CERTIFICATION.md

docs/DECISION_03_ARCHITECTURE.md
docs/DECISION_03_CERTIFICATION.md

docs/DECISION_04_ARCHITECTURE.md
docs/DECISION_04_CERTIFICATION.md

docs/DECISION_05_ARCHITECTURE.md
docs/DECISION_05_CERTIFICATION.md

docs/DECISION_OS_ARCHITECTURE.md
docs/DECISION_OS_FULL_AUDIT.md
```

---

# 17. FINAL REPORT

Return:

```text
# DECISION OS FINAL REPORT

## DECISION-01
STATUS:
Tests:
Capabilities:

## DECISION-02
STATUS:
Tests:
Capabilities:

## DECISION-03
STATUS:
Tests:
Capabilities:

## DECISION-04
STATUS:
Tests:
Capabilities:

## DECISION-05
STATUS:
Tests:
Capabilities:

## Decision Chain
STATUS:

## Thesis
STATUS:

## Risk
STATUS:

## Position Sizing
STATUS:

## Monitoring
STATUS:

## Review
STATUS:

## Provenance
STATUS:

## Regression
STATUS:

## Tests
Suites:
Tests:
Typecheck:
Build:

## Audit
P0:
P1:
P2:
P3:
P4:

## Certification
DECISION-01:
DECISION-02:
DECISION-03:
DECISION-04:
DECISION-05:

## Overall
GO / NO-GO

## Git
Commits:
Working tree:
Protected files:
Unrelated changes:

## Next Recommended Phase
Evidence-based only.
```

---

# 18. AUTONOMY

Execute DECISION-01→05 sequentially.

Do not ask for permission between phases.

Stop only for genuine blockers.

Do not fabricate missing data or capabilities.

Proceed autonomously.