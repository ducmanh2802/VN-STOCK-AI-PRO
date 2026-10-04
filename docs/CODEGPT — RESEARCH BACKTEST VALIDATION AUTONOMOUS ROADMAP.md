# CODEGPT — RESEARCH / BACKTEST / VALIDATION AUTONOMOUS ROADMAP

## 0. MISSION

You are the **Research & Validation Agent** for `VN-STOCK-AI-PRO`.

Build a trustworthy research and backtesting foundation.

The system must answer:

> "If this strategy or decision process had been applied historically using only information available at that time, what would have happened?"

The system must NOT optimize for impressive backtest returns.

It must optimize for:

```text
POINT-IN-TIME CORRECTNESS
+
REPRODUCIBILITY
+
BIAS CONTROL
+
REALISTIC EXECUTION
+
TRANSACTION COSTS
+
RISK MEASUREMENT
+
ROBUSTNESS
+
AUDITABILITY
```

---

# 1. PREREQUISITES

Verify:

```text
DATA-01→05
DECISION-01→05
Phase 24
Phase 25
Phase 26
Phase 27
Phase 28
Phase 29
```

If DATA-04 point-in-time controls are not trustworthy:

> DO NOT build a misleading backtest engine.

Stop and report the blocker.

---

# 2. GOVERNANCE

Read:

```text
docs/AGENT_PARALLEL_EXECUTION.md
```

Inspect:

```text
docs/DATA_*.md
docs/DECISION_*.md
docs/PHASE_24_*.md
docs/PHASE_25_*.md
docs/PHASE_26_*.md
docs/PHASE_27_*.md
docs/PHASE_28_*.md
docs/PHASE_29_*.md
```

Inspect actual code before designing.

---

# 3. SCOPE

Build these capabilities:

```text
RESEARCH-01 — Research Dataset & Experiment Foundation
RESEARCH-02 — Event-Driven Backtesting Engine
RESEARCH-03 — Realistic Execution / Transaction Cost Model
RESEARCH-04 — Walk-Forward / Robustness / Validation
RESEARCH-05 — Backtest Audit / Reproducibility / Research Certification
```

Then:

```text
FULL RESEARCH AUDIT
↓
REMEDIATION
↓
REGRESSION
↓
CERTIFICATION
```

---

# 4. OWNERSHIP

Primary:

```text
src/lib/research/**
src/services/research/**
src/lib/db/research/**
tests/research/**
docs/RESEARCH_*.md
```

Do not rewrite:

```text
Data Foundation
RiskGuard
TradingEngine
RiskManager
PositionSizer
Portfolio engines
Strategy Factory
Decision OS
Multi-Asset
```

Consume them through contracts.

---

# 5. RESEARCH-01 — RESEARCH DATASET & EXPERIMENT FOUNDATION

## Objective

Create reproducible research experiments.

---

## 5.1 Research experiment

Support:

```text
experimentId
name
description
strategy
universe
startDate
endDate
asOfSemantics
dataVersion
strategyVersion
executionModelVersion
riskModelVersion
parameters
createdAt
status
```

---

## 5.2 Research dataset

A dataset must specify:

```text
instruments
date range
data sources
point-in-time rules
corporate-action mode
adjustment mode
universe definition
```

No hidden current-state universe.

---

## 5.3 Parameter configuration

Parameters must be explicit.

Example:

```text
lookback
rebalance frequency
entry threshold
exit threshold
risk budget
position limit
stop/invalidation
transaction costs
slippage
```

No hidden defaults for material research assumptions.

---

## 5.4 Reproducibility

Given identical:

```text
dataset version
strategy version
parameters
execution model
risk model
random seed where applicable
```

the experiment must reproduce the same result.

---

## 5.5 Acceptance

Test:

- experiment creation
- dataset definition
- version capture
- parameter capture
- deterministic execution
- invalid dataset
- missing point-in-time data

---

# 6. RESEARCH-02 — EVENT-DRIVEN BACKTESTING ENGINE

## Objective

Build a proper event-driven backtesting engine.

Avoid simplistic:

```text
signal → close price → return
```

when that creates unrealistic execution.

---

## 6.1 Event model

Support events such as:

```text
MARKET_OPEN
MARKET_DATA
SIGNAL
ORDER
FILL
CORPORATE_ACTION
MARKET_CLOSE
REBALANCE
RISK_EVENT
```

Use actual available market-calendar semantics.

---

## 6.2 Backtest lifecycle

Conceptually:

```text
DATA
 ↓
STRATEGY
 ↓
SIGNAL
 ↓
RISK
 ↓
POSITION SIZE
 ↓
ORDER
 ↓
EXECUTION
 ↓
FILL
 ↓
PORTFOLIO
 ↓
P&L
 ↓
NEXT EVENT
```

---

## 6.3 No future information

At every event time:

```text
strategy can only see information available at that time
```

This must be enforced by architecture, not merely documented.

---

## 6.4 Order model

Support where justified:

```text
MARKET
LIMIT
STOP
```

Do not implement unsupported order semantics merely for completeness.

---

## 6.5 Portfolio accounting

Track:

```text
cash
positions
market value
realized P&L
unrealized P&L
fees
slippage
turnover
exposure
leverage
drawdown
```

Preserve FinancialConservation semantics.

---

## 6.6 Acceptance

Test:

- event ordering
- no look-ahead
- order lifecycle
- fills
- portfolio accounting
- cash conservation
- corporate actions
- missing data
- invalid order

---

# 7. RESEARCH-03 — REALISTIC EXECUTION / TRANSACTION COST MODEL

## Objective

Prevent unrealistic backtests.

---

## 7.1 Cost components

Support:

```text
brokerage fee
tax
exchange fee
slippage
spread
market impact
financing
margin cost
```

Only implement costs for which valid domain assumptions exist.

---

## 7.2 Configuration

Every cost model must be explicit:

```text
costModelVersion
fee schedule
slippage model
spread model
impact model
```

---

## 7.3 Slippage

Support models such as:

```text
FIXED
BPS
SPREAD
VOLUME_BASED
```

only where data supports them.

---

## 7.4 Liquidity constraints

Orders may be limited by:

```text
available volume
participation rate
lot size
market liquidity
```

Do not assume infinite liquidity.

---

## 7.5 Futures

Preserve Phase 29:

```text
multiplier = 100,000 VND
tick = 0.1
```

---

## 7.6 Equity / ETF

Preserve:

```text
lot = 100
```

---

## 7.7 Acceptance

Test:

- fees
- tax
- slippage
- spread
- lot rounding
- liquidity
- futures multiplier
- futures tick
- cost versioning

---

# 8. RESEARCH-04 — WALK-FORWARD / ROBUSTNESS / VALIDATION

## Objective

Determine whether a strategy works outside the exact historical sample used to design it.

---

# 8.1 Train / validation / test

Support explicit periods:

```text
TRAIN
VALIDATION
TEST
```

Never mix them silently.

---

# 8.2 Walk-forward

Support:

```text
train window
validation window
test window
step
```

Example:

```text
TRAIN → VALIDATE → TEST
       ↓
       roll forward
```

---

# 8.3 Parameter sensitivity

Evaluate parameter ranges.

Example:

```text
lookback 20 / 40 / 60
threshold 1% / 2% / 3%
```

Do not optimize endlessly.

---

# 8.4 Robustness

Measure:

```text
performance stability
drawdown stability
turnover stability
parameter sensitivity
regime sensitivity
asset sensitivity
```

---

# 8.5 Regime validation

Where Phase 27 provides regime information, evaluate strategy performance across:

```text
bull
bear
sideways
high volatility
low volatility
macro regimes
```

Do not fabricate regimes.

---

# 8.6 Out-of-sample

Clearly distinguish:

```text
IN_SAMPLE
OUT_OF_SAMPLE
WALK_FORWARD
```

---

# 8.7 Acceptance

Test:

- train/validation/test separation
- walk-forward
- parameter sensitivity
- out-of-sample
- regime segmentation
- deterministic results

---

# 9. RESEARCH-05 — BACKTEST AUDIT / REPRODUCIBILITY / RESEARCH CERTIFICATION

## Objective

Make every research result auditable.

---

# 9.1 Research report

A research result must include:

```text
experiment
dataset
strategy
parameters
period
universe
execution model
cost model
risk model
results
drawdown
turnover
exposure
benchmark
limitations
```

---

# 9.2 Performance metrics

Support, where appropriate:

```text
CAGR
annualized return
volatility
Sharpe
Sortino
max drawdown
Calmar
win rate
profit factor
turnover
average trade
exposure
```

Do not present metrics where sample size is insufficient without warning.

---

# 9.3 Benchmark

Support explicit benchmark definition.

Do not silently compare against current index constituents.

---

# 9.4 Statistical warnings

Flag:

```text
small sample
high turnover
high parameter sensitivity
unstable regime
survivorship risk
look-ahead risk
data gaps
insufficient out-of-sample
```

---

# 9.5 Research confidence

Do NOT produce a fake "AI confidence score".

Instead expose evidence:

```text
sample size
out-of-sample coverage
stability
bias checks
cost sensitivity
regime robustness
```

---

# 9.6 Reproducibility manifest

Every certified research result should be reproducible from a manifest containing:

```text
dataset version
data sources
strategy version
code/version identifier
parameters
execution model
cost model
risk model
universe
date range
random seed if applicable
```

---

# 9.7 Research certification

A strategy cannot be certified merely because:

```text
CAGR is high
Sharpe is high
```

Certification requires:

```text
point-in-time valid
no material look-ahead
survivorship controlled
cost model present
out-of-sample tested
reproducible
accounting valid
limitations documented
```

---

# 10. BIAS CONTROL

Explicitly detect:

```text
LOOK_AHEAD_BIAS
SURVIVORSHIP_BIAS
CURRENT_UNIVERSE_LEAK
DATA_SNOOPING_RISK
OVERFITTING_RISK
```

Where a bias cannot be ruled out:

> mark the result as NON-CERTIFIED.

Do not hide uncertainty.

---

# 11. DATA SNOOPING

Research infrastructure must avoid silently reusing test data during optimization.

Capture:

```text
research iteration
parameter search
validation dataset
final test dataset
```

---

# 12. CORPORATE ACTIONS

Backtests must respect:

```text
dividends
splits
symbol changes
mergers
delistings
```

according to Data Foundation semantics.

Never manually patch historical prices inside the backtest engine.

---

# 13. DELISTED SECURITIES

A historical universe must include instruments that were valid at the historical date even if they no longer exist.

Do not remove delisted securities because they are absent today.

---

# 14. SURVIVORSHIP TEST

Create explicit regression test:

```text
historical universe at T
```

must NOT equal:

```text
current universe
```

unless they actually are equal by evidence.

---

# 15. LOOK-AHEAD TEST

Create adversarial tests where:

```text
future publication date
```

would improve the strategy result.

The engine must reject or exclude that information.

---

# 16. ACCOUNTING INVARIANTS

Backtest must preserve:

```text
cash
+
position value
=
portfolio NAV
```

subject to explicitly modelled liabilities/costs.

Test:

- buys
- sells
- fees
- taxes
- dividends
- splits
- futures
- margin
- closing positions

---

# 17. RANDOMNESS

If any research algorithm uses randomness:

- require explicit seed
- record seed
- reproduce results
- never use uncontrolled randomness

---

# 18. PERFORMANCE

Design for large historical datasets.

Identify:

```text
repeated queries
repeated indicator calculations
universe scans
event processing
portfolio recalculation
```

Optimize only after correctness is established.

Never trade correctness for speed.

---

# 19. PURE ENGINE RULE

Backtesting engines should be deterministic where possible.

Never use:

```text
Date.now()
Math.random()
```

inside core deterministic logic without explicit injection/control.

---

# 20. AI BOUNDARY

AI may assist research with:

```text
hypothesis generation
result explanation
research summarization
anomaly explanation
question generation
```

AI must NOT:

```text
modify historical data
override backtest accounting
hide bias warnings
alter results
claim certification automatically
```

---

# 21. TEST STRATEGY

Required tests include:

### Dataset

- point-in-time
- universe
- version
- reproducibility

### Event engine

- ordering
- signal
- order
- fill
- portfolio

### Costs

- fees
- taxes
- slippage
- spread
- liquidity

### Bias

- look-ahead
- survivorship
- future publication
- current universe leakage

### Validation

- train/test
- walk-forward
- out-of-sample
- sensitivity

### Accounting

- cash
- NAV
- P&L
- corporate actions
- futures

---

# 22. FINAL REGRESSION

Run:

```bash
npm test
npm run typecheck
npm run build
```

Then verify regression against:

```text
DATA-01→05
DECISION-01→05
Phase 24
Phase 25
Phase 26
Phase 27
Phase 28
Phase 29
```

---

# 23. REQUIRED DOCUMENTATION

Create:

```text
docs/RESEARCH_01_ARCHITECTURE.md
docs/RESEARCH_01_CERTIFICATION.md

docs/RESEARCH_02_ARCHITECTURE.md
docs/RESEARCH_02_CERTIFICATION.md

docs/RESEARCH_03_ARCHITECTURE.md
docs/RESEARCH_03_CERTIFICATION.md

docs/RESEARCH_04_ARCHITECTURE.md
docs/RESEARCH_04_CERTIFICATION.md

docs/RESEARCH_05_ARCHITECTURE.md
docs/RESEARCH_05_CERTIFICATION.md

docs/RESEARCH_BACKTEST_ARCHITECTURE.md
docs/RESEARCH_FULL_AUDIT.md
```

---

# 24. FINAL AUDIT

Audit:

```text
Data Foundation integration
Point-in-time
Corporate actions
Universe construction
Event ordering
Execution
Costs
Portfolio accounting
Bias
Walk-forward
Out-of-sample
Reproducibility
Risk
Performance metrics
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

# 25. FINAL CERTIFICATION

Research infrastructure may be certified only when:

```text
[ ] Dataset reproducible
[ ] Point-in-time enforced
[ ] Look-ahead controlled
[ ] Survivorship controlled
[ ] Historical universe supported
[ ] Corporate actions handled
[ ] Event-driven backtest works
[ ] Execution model explicit
[ ] Transaction costs explicit
[ ] Liquidity constraints explicit
[ ] Portfolio accounting conserved
[ ] Walk-forward supported
[ ] Out-of-sample supported
[ ] Robustness analysis supported
[ ] Reproducibility manifest exists
[ ] Bias warnings exist
[ ] Tests pass
[ ] Typecheck passes
[ ] Build passes
[ ] P0 = 0
[ ] P1 = 0
```

---

# 26. FINAL REPORT

Return:

```text
# RESEARCH / BACKTEST / VALIDATION FINAL REPORT

## RESEARCH-01
STATUS:
Tests:
Capabilities:

## RESEARCH-02
STATUS:
Tests:
Capabilities:

## RESEARCH-03
STATUS:
Tests:
Capabilities:

## RESEARCH-04
STATUS:
Tests:
Capabilities:

## RESEARCH-05
STATUS:
Tests:
Capabilities:

## Dataset
STATUS:

## Backtesting
STATUS:

## Execution
STATUS:

## Costs
STATUS:

## Bias Control
STATUS:

## Walk-Forward
STATUS:

## Out-of-Sample
STATUS:

## Reproducibility
STATUS:

## Accounting
STATUS:

## Regression
STATUS:

## Tests
Suites:
Tests:
Typecheck:
Build:

## Final Audit
P0:
P1:
P2:
P3:
P4:

## Certification
RESEARCH-01:
RESEARCH-02:
RESEARCH-03:
RESEARCH-04:
RESEARCH-05:

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

# 27. AUTONOMY

Execute RESEARCH-01→05 sequentially.

Do not ask for permission between phases.

Stop only for genuine blockers.

Never fabricate historical data.

Never fabricate performance.

Never silently use future information.

Never silently use current universe constituents for historical research.

Proceed autonomously.