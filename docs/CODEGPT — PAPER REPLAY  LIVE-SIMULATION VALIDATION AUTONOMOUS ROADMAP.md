# CODEGPT — PAPER REPLAY / LIVE-SIMULATION VALIDATION
# AUTONOMOUS BUILD + FULL CERTIFICATION

You are the **Paper Replay / Live-Simulation Validation Agent** for `VN-STOCK-AI-PRO`.

Your mission is to validate that certified:

```text
DATA FOUNDATION
→ DECISION OS
→ RESEARCH / BACKTEST
→ PRODUCT
```

can safely connect to the existing:

```text
Paper Broker
→ Orders
→ Fills
→ Ledger
→ Portfolio
→ Risk
→ Monitoring
→ Decision Review
```

without introducing real-money execution.

This is a **validation and paper-execution phase**.

It is NOT a live trading phase.

It is NOT an autonomous trading phase.

It must NEVER send real orders to an exchange or broker.

---

# 1. PRIMARY OBJECTIVE

Build a production-grade:

```text
PAPER REPLAY / LIVE-SIMULATION VALIDATION LAYER
```

that can answer:

> "If a certified strategy/research result were allowed to operate through the existing decision and execution path, what would have happened under realistic paper-market conditions?"

The system must preserve:

```text
DATA INTEGRITY
RISK CONSTRAINTS
FINANCIAL CONSERVATION
PAPER-ONLY EXECUTION
PROVENANCE
REPRODUCIBILITY
AUDITABILITY
```

---

# 2. CORE FLOW

The target architecture is:

```text
CERTIFIED RESEARCH / BACKTEST
             ↓
       STRATEGY VERSION
             ↓
       REPLAY DATASET
             ↓
        DECISION OS
             ↓
       RISK VALIDATION
             ↓
      POSITION SIZING
             ↓
       PAPER ORDER
             ↓
       PAPER FILL
             ↓
          LEDGER
             ↓
         PORTFOLIO
             ↓
        MONITORING
             ↓
      DECISION REVIEW
```

The replay system must NOT bypass:

```text
RiskGuard
RiskManager
PositionSizer
TradingEngine
FinancialConservation
TradingDataValidator
MarketDataIntegrityGuard
PaperBroker
Ledger
```

where those systems already provide the authoritative contract.

---

# 3. FIRST ACTION — DISCOVERY

Before modifying anything:

```text
inspect Git status
inspect repository structure
inspect PaperBroker
inspect TradingEngine
inspect RiskGuard
inspect RiskManager
inspect PositionSizer
inspect FinancialConservation
inspect Ledger
inspect Portfolio
inspect Decision OS
inspect Research / Backtest
inspect DATA Foundation
inspect Monitoring
inspect Product
inspect existing replay/simulation code
inspect tests
inspect migrations
inspect agent governance
```

Determine actual state:

```text
IMPLEMENTED
PARTIALLY IMPLEMENTED
DOCUMENTED ONLY
MISSING
```

Do NOT assume the PaperBroker is safe merely because it exists.

---

# 4. CRITICAL SAFETY RULE

This phase must be:

```text
PAPER ONLY
```

There must be no path from this feature to:

```text
real broker
real exchange
real order submission
real account
real money
```

The architecture must make this boundary explicit.

If an execution provider exists, verify that replay cannot reach it.

---

# 5. ABSOLUTE PROHIBITIONS

NEVER:

```text
send real orders
connect replay to production broker
bypass RiskGuard
bypass PositionSizer
bypass TradingEngine
bypass FinancialConservation
invent market prices
invent fills
silently assume liquidity
silently assume zero costs
convert paper order into real order
modify historical backtest results
rewrite historical decisions
```

If required market data is unavailable:

```text
FAIL CLOSED
```

Do not fabricate a fill.

---

# 6. REPLAY MODES

Support clearly separated modes.

## MODE A — HISTORICAL REPLAY

Replay certified historical data.

Example:

```text
2024-01-01
→
2025-12-31
```

The replay must use point-in-time valid data.

No future information.

---

## MODE B — FORWARD PAPER SIMULATION

Use current/near-current market data to generate paper decisions.

Architecture:

```text
CURRENT MARKET DATA
        ↓
DATA VALIDATION
        ↓
DECISION
        ↓
RISK
        ↓
PAPER ORDER
        ↓
PAPER FILL
```

This remains paper-only.

---

## MODE C — DETERMINISTIC REPLAY

Same:

```text
dataset
strategy
parameters
seed
execution model
cost model
risk model
```

must produce equivalent results.

This mode is mandatory for certification.

---

# 7. REPLAY MANIFEST

Every replay must have an immutable manifest.

Minimum:

```text
replayId
createdAt
datasetId
datasetVersion
strategyId
strategyVersion
decisionVersion
riskModelVersion
positionSizingVersion
executionModelVersion
costModelVersion
universe
startDate
endDate
initialCapital
currency
seed
mode
configuration
```

Also record:

```text
code version
schema version
provider/source
data quality state
corporate-action policy
point-in-time policy
```

The manifest must allow another user/process to reproduce the replay.

---

# 8. REPLAY STATE MACHINE

Define explicit lifecycle:

```text
CREATED
→ VALIDATING
→ READY
→ RUNNING
→ PAUSED
→ COMPLETED
```

Failure states:

```text
INVALID
DATA_UNAVAILABLE
DATA_INVALID
RISK_BLOCKED
EXECUTION_BLOCKED
FAILED
CANCELLED
```

Never represent an incomplete replay as successful.

---

# 9. EVENT MODEL

Replay must be event-driven where architecture permits.

Events may include:

```text
SESSION_START
MARKET_DATA
CORPORATE_ACTION
SIGNAL
DECISION
RISK_CHECK
ORDER_CREATED
ORDER_ACCEPTED
ORDER_REJECTED
FILL
FEE
SLIPPAGE
MARGIN
POSITION_UPDATE
MARK_TO_MARKET
REBALANCE
SESSION_CLOSE
REPLAY_COMPLETE
```

Every event must have:

```text
eventId
replayId
timestamp / effective date
sequence
eventType
payload
provenance
```

Ordering must be deterministic.

---

# 10. NO LOOK-AHEAD

The replay engine must guarantee:

```text
decision(t)
```

can only consume information available at or before:

```text
t
```

It must never consume:

```text
future close
future earnings
future corporate action
future benchmark value
future constituent membership
future macro release
future revised data
```

unless explicitly modeled as available at that historical point.

---

# 11. POINT-IN-TIME DATA

Use the DATA Foundation contracts.

Distinguish:

```text
observationDate
publicationDate
effectiveDate
ingestionDate
```

For historical replay:

```text
publicationDate > replayDecisionDate
```

must not be available to the decision engine.

If point-in-time validity cannot be proven:

```text
BLOCK REPLAY
```

Do not guess.

---

# 12. SURVIVORSHIP CONTROL

Historical replay must not silently use today's universe.

Respect:

```text
historical constituents
delisted instruments
listing dates
delisting dates
corporate actions
symbol changes
instrument identity
```

If historical universe cannot be reconstructed:

```text
MARK AS LIMITATION
```

and, where material:

```text
BLOCK CERTIFICATION
```

---

# 13. ORDER LIFECYCLE

Validate:

```text
SIGNAL
→ DECISION
→ RISK CHECK
→ ORDER
→ ACCEPTANCE
→ FILL / REJECT
→ POSITION
→ LEDGER
```

Orders must preserve:

```text
orderId
replayId
decisionId
instrument
side
quantity
orderType
limitPrice where applicable
timestamp
status
rejectionReason
```

---

# 14. PAPER FILL MODEL

Use the existing certified execution model wherever possible.

Do NOT create a second incompatible fill engine.

Fill behavior must explicitly account for:

```text
price
quantity
lot constraints
tick constraints
slippage
fees
tax
liquidity
spread
partial fills
order rejection
```

Only model features actually supported by the system.

Unsupported execution behavior must be explicit:

```text
UNSUPPORTED
NOT_MODELED
DATA_UNAVAILABLE
```

Never silently assume perfect execution.

---

# 15. VIETNAMESE MARKET SEMANTICS

Preserve certified semantics:

```text
equity / ETF lot = 100

futures multiplier = 100,000 VND

futures tick = 0.1

cash face value semantics
```

Do not alter these definitions inside the replay layer.

Validate tick/lot constraints before creating paper orders.

---

# 16. FUTURES

For futures replay verify:

```text
contract identity
expiry
multiplier
tick
margin
mark-to-market
roll logic where supported
expiry handling
```

If:

```text
expiryDate <= asOfDate
```

and the contract should no longer be tradable:

```text
BLOCK / CLOSE / ROLL
```

according to the certified contract semantics.

Never invent roll behavior.

---

# 17. PAPER ACCOUNTING

Every fill must flow through authoritative accounting.

Track:

```text
cash
positions
average cost
realized P&L
unrealized P&L
fees
tax
slippage
market value
NAV
exposure
leverage
margin
```

where applicable.

Do NOT duplicate FinancialConservation logic.

---

# 18. ACCOUNTING INVARIANT

At every applicable checkpoint validate:

```text
NAV
=
cash
+
position market value
+
other valid portfolio components
```

subject to the certified accounting model.

Validate conservation after:

```text
fill
fee
tax
slippage
corporate action
mark-to-market
rebalance
close
```

If the invariant fails:

```text
FAIL REPLAY
```

Do not continue silently.

---

# 19. CORPORATE ACTIONS

Replay must process certified corporate-action semantics.

Potential events:

```text
cash dividend
stock dividend
split
reverse split
rights issue
symbol change
other supported adjustment
```

Use the DATA Foundation corporate-action model.

Never apply an adjustment twice.

Never silently mix:

```text
adjusted price
unadjusted price
```

without explicit semantics.

---

# 20. RISK PATH

Every paper order must pass through the authoritative risk path.

Conceptually:

```text
ORDER INTENT
     ↓
RISK GUARD
     ↓
RISK MANAGER
     ↓
POSITION SIZER
     ↓
TRADING ENGINE
     ↓
PAPER BROKER
```

Do not recreate risk rules inside Product or Replay.

---

# 21. RISK REJECTION

A rejected order is valid behavior.

Record:

```text
riskRejected = true
reason
rule
timestamp
decisionId
```

Do NOT modify the strategy result to hide the rejection.

Replay reports must distinguish:

```text
strategy wanted trade
risk allowed trade
risk rejected trade
execution rejected trade
fill occurred
```

---

# 22. POSITION SIZING

Use the certified PositionSizer.

Preserve:

```text
lot size
risk budget
portfolio constraints
concentration limits
cash limits
margin limits
```

Distinguish:

```text
ZERO_BY_STRATEGY
ZERO_BY_RISK
ZERO_BY_SIZING
ZERO_BY_LIQUIDITY
ZERO_BY_DATA
```

These are not equivalent outcomes.

---

# 23. DECISION PROVENANCE

Each paper order must trace back to:

```text
replay
strategy
signal
decision
thesis where applicable
risk check
position sizing
execution
fill
ledger
portfolio
```

Provide a traceable chain:

```text
WHY DID THIS PAPER TRADE HAPPEN?
```

The system must be able to answer that question.

---

# 24. REPLAY vs BACKTEST

Do not treat these as identical.

BACKTEST:

```text
research evaluation
```

PAPER REPLAY:

```text
execution-path validation
```

The replay should validate whether the certified research result survives:

```text
realistic order lifecycle
risk constraints
paper execution
accounting
monitoring
decision review
```

---

# 25. REPLAY COMPARISON

Provide comparison:

```text
BACKTEST
vs
PAPER REPLAY
```

Compare:

```text
return
CAGR
volatility
Sharpe
Sortino
max drawdown
turnover
fees
slippage
trade count
exposure
cash
risk rejection count
execution rejection count
filled quantity
```

where applicable.

Do not force metrics that are not meaningful.

---

# 26. DIVERGENCE ANALYSIS

When backtest and replay differ, classify divergence:

```text
DATA
EXECUTION
SLIPPAGE
FEES
TAX
LIQUIDITY
RISK
POSITION SIZING
CORPORATE ACTION
TIMING
STRATEGY
ACCOUNTING
```

Do not simply say:

```text
results differ
```

The system should explain:

```text
WHY
```

within available evidence.

---

# 27. PAPER LIVE-SIMULATION

For current-market paper simulation:

```text
market data
→ validate freshness
→ generate decision
→ risk
→ position size
→ paper order
→ paper fill
```

If live market data is:

```text
STALE
UNAVAILABLE
INVALID
```

the simulation must not silently trade.

Use:

```text
NO_ACTION_DATA_UNAVAILABLE
```

or equivalent explicit status.

---

# 28. MARKET CLOSE / SESSION HANDLING

Respect the actual market session model supported by the platform.

Handle:

```text
session start
session end
non-trading days
market holidays
missing sessions
```

Do not invent trading sessions.

---

# 29. PAUSE / RESUME

Historical and forward paper replay should support safe:

```text
pause
resume
cancel
```

where architecture supports it.

Resume must not duplicate:

```text
orders
fills
fees
ledger entries
```

Replay state must be idempotent.

---

# 30. IDEMPOTENCY

Repeated processing of the same event must not duplicate financial effects.

Test:

```text
same event
same replay
same sequence
```

multiple times.

Expected:

```text
one financial effect
```

not:

```text
two fills
two fees
two ledger entries
```

---

# 31. FAILURE RECOVERY

Test interruption during:

```text
order creation
fill
ledger update
portfolio update
monitoring
```

The system must recover without corrupting accounting.

If atomic recovery is not supported:

```text
FAIL CLOSED
```

and mark replay:

```text
FAILED / REQUIRES_RECONCILIATION
```

---

# 32. RECONCILIATION

At replay completion reconcile:

```text
orders
fills
positions
ledger
cash
portfolio
NAV
fees
tax
```

Expected:

```text
NO ORPHAN ORDERS
NO ORPHAN FILLS
NO ORPHAN LEDGER ENTRIES
NO UNEXPLAINED CASH DELTA
NO UNEXPLAINED POSITION DELTA
```

Any unexplained discrepancy is a certification blocker.

---

# 33. REPLAY CHECKPOINTS

Persist or reconstruct checkpoints at meaningful intervals.

Checkpoint should include:

```text
sequence
timestamp
cash
positions
NAV
risk state
open orders
manifest fingerprint
```

The checkpoint must be deterministic.

---

# 34. REPLAY FINGERPRINT

At completion calculate a deterministic fingerprint over:

```text
manifest
events
orders
fills
ledger
portfolio snapshots
metrics
```

Same replay input should produce the same fingerprint under deterministic conditions.

Use this to prove reproducibility.

---

# 35. SEED

If randomness is required for:

```text
slippage
partial fills
execution simulation
```

the seed must be:

```text
explicit
stored
reproducible
```

Never use uncontrolled randomness in certified replay.

---

# 36. OUTPUT MODEL

Replay result should contain:

```text
replayId
status
manifest
fingerprint
startDate
endDate
initialCapital
finalCapital
finalNAV
return
riskMetrics
tradeMetrics
executionMetrics
accountingStatus
reconciliationStatus
riskRejectionCount
executionRejectionCount
dataWarnings
limitations
```

---

# 37. AUDIT TRAIL

Every material state transition should be traceable.

At minimum:

```text
decision
order
fill
risk rejection
execution rejection
ledger entry
portfolio update
alert
review
```

---

# 38. PRODUCT INTEGRATION

Where Product layer exists, integrate replay results into:

```text
Research Workspace
Decision Journal
Scenario
Decision Review
Monitoring
```

Example:

```text
Research experiment
      ↓
Certified backtest
      ↓
Paper replay
      ↓
Execution divergence
      ↓
Research Workspace
      ↓
Decision Review
```

Do not create duplicate research records.

---

# 39. UI REQUIREMENTS

If UI is required by the existing architecture, create a professional:

```text
Paper Replay Console
```

with:

```text
Replay ID
Mode
Strategy
Dataset
Period
Initial Capital
Status
Progress
Current NAV
Orders
Fills
Risk Rejections
Execution Rejections
Accounting Status
Reconciliation
Fingerprint
```

Use existing:

```text
Premium Institutional
TradingView-inspired
dark terminal
dense financial UI
```

Do not build a generic SaaS dashboard.

---

# 40. LIVE-SIMULATION SAFETY UI

The UI must make the environment impossible to confuse.

Clearly display:

```text
PAPER ONLY
NO REAL ORDERS
SIMULATION
```

Do not use wording such as:

```text
BUY NOW
EXECUTE
SEND ORDER
```

for paper replay controls if it could imply real execution.

Use:

```text
SIMULATE
PAPER ORDER
REPLAY
PAPER FILL
```

---

# 41. API SAFETY

If HTTP/API routes are added, require explicit separation:

```text
/paper/*
/replay/*
```

and NEVER route them into real execution endpoints.

If authentication/authorization exists:

```text
enforce ownership
```

If authentication does not yet exist:

```text
define clear interface boundary
document dependency
```

---

# 42. NO AUTO-EXECUTION

This phase must explicitly certify:

```text
paper replay
≠
automated trading
```

No scheduled real orders.

No broker credentials.

No production exchange adapters.

No live order submission.

---

# 43. PERFORMANCE

Avoid:

```text
loading entire history unnecessarily
recalculating unchanged portfolio state
duplicate fills
duplicate ledger writes
N+1 queries
unbounded event memory
```

Use:

```text
streaming/chunking
checkpoints
pagination
batch processing
incremental accounting
```

where appropriate.

Do not sacrifice correctness for performance.

---

# 44. TEST MATRIX

At minimum test:

## Data

```text
valid
stale
unavailable
invalid
future data
missing session
```

## Orders

```text
accepted
risk rejected
execution rejected
partial fill
full fill
zero fill
```

## Accounting

```text
cash
fees
tax
slippage
corporate action
mark-to-market
NAV
```

## Replay

```text
deterministic
resume
cancel
restart
duplicate event
checkpoint
```

## Risk

```text
concentration
cash limit
position limit
margin
lot
tick
```

## Safety

```text
no real execution path
```

---

# 45. PROPERTY TESTS

Where practical test invariants:

```text
same input → same fingerprint

replaying event twice → one financial effect

paper execution cannot reach real broker

risk rejection → no fill

invalid data → no decision/fill

failed accounting invariant → replay fails

NAV conservation preserved
```

---

# 46. FULL END-TO-END TEST

Create a certified test scenario:

```text
Historical Dataset
      ↓
Strategy
      ↓
Signal
      ↓
Decision
      ↓
Risk
      ↓
Position Size
      ↓
Paper Order
      ↓
Paper Fill
      ↓
Fee / Tax / Slippage
      ↓
Ledger
      ↓
Portfolio
      ↓
NAV
      ↓
Monitoring
      ↓
Decision Review
```

Verify every transition.

---

# 47. BACKTEST → PAPER REPLAY CERTIFICATION

Certification requires:

```text
certified research input
AND
point-in-time valid data
AND
no look-ahead
AND
survivorship controlled
AND
execution model explicit
AND
risk path preserved
AND
accounting conserved
AND
reconciliation passes
AND
deterministic fingerprint
AND
no real execution path
```

---

# 48. P0 / P1 / P2 / P3 / P4

Classify findings:

```text
P0
financial corruption
real-order execution risk
risk bypass
data fabrication
irreversible accounting failure

P1
incorrect replay
incorrect fills
broken provenance
incorrect decision linkage
non-determinism
failed reconciliation

P2
performance
API gaps
missing UI analytics
limited execution model

P3
UX improvements
additional reporting

P4
future enhancements
```

P0/P1 must be resolved before certification.

---

# 49. DOCUMENTATION

Create:

```text
docs/PAPER_REPLAY_DISCOVERY_REPORT.md
docs/PAPER_REPLAY_ARCHITECTURE.md
docs/PAPER_REPLAY_CERTIFICATION.md
docs/PAPER_REPLAY_FULL_AUDIT.md
```

If the architecture contains a live-simulation subsystem:

```text
docs/LIVE_SIMULATION_ARCHITECTURE.md
```

must clearly state:

```text
PAPER ONLY
NO REAL EXECUTION
```

---

# 50. GIT SAFETY

Never use:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git push --force
```

Never delete parallel-agent work.

Never blanket-stage:

```text
git add .
```

Before committing:

```text
git status
git diff --stat
git diff
```

Verify commit purity.

Use explicit paths.

---

# 51. PARALLEL AGENT SAFETY

Before modifying any file:

```text
OWNED
SHARED
PROTECTED
FOREIGN
```

Do not modify:

```text
Learning lane
Data Foundation
Decision OS
Research lane
Product lane
```

unless a shared contract change is genuinely necessary.

If another agent owns a required file:

```text
do not overwrite it
define interface
document dependency
continue independent work
```

---

# 52. AUTONOMOUS EXECUTION

Execute:

```text
DISCOVERY
→ ARCHITECTURE
→ ACCEPTANCE
→ IMPLEMENTATION
→ TEST
→ EVIDENCE AUDIT
→ REMEDIATION
→ REGRESSION
→ CERTIFICATION
```

Do not stop after implementation.

Do not claim certification based only on tests.

---

# 53. FINAL FULL AUDIT

Audit:

```text
DATA
RESEARCH
BACKTEST
DECISION
RISK
POSITION SIZING
PAPER BROKER
ORDER
FILL
LEDGER
ACCOUNTING
PORTFOLIO
MONITORING
PRODUCT
PROVENANCE
SECURITY
PERFORMANCE
```

Specifically search for:

```text
real execution path
silent mock
fabricated fill
future data
survivorship leak
duplicate accounting
duplicate ledger
non-idempotent replay
broken corporate action
broken lot/tick
risk bypass
AI bypass
```

---

# 54. CERTIFICATION TARGET

Final status should be one of:

```text
CERTIFIED
CERTIFIED_WITH_LIMITATIONS
BLOCKED
```

Never report:

```text
CERTIFIED
```

if P0/P1 remains.

---

# 55. FINAL REPORT

Produce:

```text
PAPER REPLAY / LIVE-SIMULATION VALIDATION
FINAL CERTIFICATION REPORT

1. Executive Summary

2. Repository Baseline

3. Existing PaperBroker Audit

4. Replay Architecture

5. Replay Manifest

6. Event Model

7. Point-in-Time Validation

8. Survivorship Validation

9. Order Lifecycle

10. Fill Model

11. Risk Integration

12. Position Sizing Integration

13. Accounting Validation

14. Corporate Action Validation

15. Reconciliation

16. Deterministic Fingerprint

17. Backtest vs Replay Comparison

18. Divergence Analysis

19. Monitoring Integration

20. Decision Review Integration

21. Product Integration

22. Security / No-Real-Execution Audit

23. Performance

24. Test Results

25. Typecheck

26. Build

27. Regression

28. P0/P1/P2/P3/P4 Findings

29. Known Limitations

30. Certification Decision

31. Recommended Next Phase
```

---

# 56. SUCCESS CRITERIA

The phase is successful when the system can demonstrate:

```text
CERTIFIED RESEARCH
      ↓
REPRODUCIBLE REPLAY
      ↓
VALID DECISION
      ↓
VALID RISK CHECK
      ↓
VALID POSITION SIZE
      ↓
PAPER ORDER
      ↓
REALISTIC PAPER FILL
      ↓
CORRECT LEDGER
      ↓
CORRECT PORTFOLIO
      ↓
CONSERVATION
      ↓
MONITORING
      ↓
DECISION REVIEW
```

while proving:

```text
NO REAL EXECUTION
NO LOOK-AHEAD
NO FABRICATED DATA
NO RISK BYPASS
NO ACCOUNTING CORRUPTION
NO DUPLICATE FINANCIAL EFFECT
NO HIDDEN ASSUMPTIONS
```

---

# 57. FINAL COMMAND

START NOW.

First inspect the actual repository and existing execution architecture.

Do not assume missing components.

Do not duplicate certified engines.

Do not modify unrelated parallel-agent work.

Build only what is required to create a safe:

```text
PAPER REPLAY
+
LIVE PAPER SIMULATION
+
BACKTEST-TO-EXECUTION VALIDATION
```

Then execute the full:

```text
DISCOVERY
→ ARCHITECTURE
→ IMPLEMENTATION
→ TEST
→ EVIDENCE AUDIT
→ REMEDIATION
→ REGRESSION
→ CERTIFICATION
```

The final system must prove that a strategy can travel from:

```text
RESEARCH
→ DECISION
→ RISK
→ PAPER EXECUTION
→ ACCOUNTING
→ PORTFOLIO
→ MONITORING
→ REVIEW
```

without ever crossing the boundary into real-money execution.