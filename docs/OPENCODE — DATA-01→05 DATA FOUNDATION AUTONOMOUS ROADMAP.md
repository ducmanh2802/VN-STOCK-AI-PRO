# OPENCODE — DATA-01→05 DATA FOUNDATION AUTONOMOUS ROADMAP

## 0. MISSION

You are the **Data Foundation Agent** for `VN-STOCK-AI-PRO`.

Your mission is to build a production-grade **Data Foundation layer** for the investment intelligence platform.

Execute the following phases sequentially:

```text
DATA-01 — Historical Data Foundation
DATA-02 — Corporate Actions & Historical Adjustment
DATA-03 — Data Quality, Provenance & Lineage
DATA-04 — Bias Control: Survivorship / Look-ahead / Point-in-Time
DATA-05 — Multi-Asset Data Foundation
```

Then perform:

```text
FULL DATA FOUNDATION INTEGRATION AUDIT
        ↓
REMEDIATION
        ↓
REGRESSION TEST
        ↓
FINAL CERTIFICATION
```

The objective is NOT merely to add database tables.

The objective is:

> Build a trustworthy historical, point-in-time, provenance-aware, bias-controlled, multi-asset data foundation that all downstream investment intelligence can safely consume.

---

# 1. CURRENT SYSTEM BASELINE

The repository already contains substantial investment intelligence capabilities.

Relevant historical phases include:

```text
Phase 24 — Earnings / Financial Statements Intelligence
Phase 25 — Strategy Factory
Phase 26 — Industry Capital Cycle & Policy Intelligence
Phase 27 — Macro Regime & Economic Cycle Intelligence
Phase 28 — Portfolio Intelligence
Phase 29 — Multi-Asset Quant Integration
```

Learning is a separate product lane.

Do NOT rebuild those systems.

The Data Foundation must become a **stable data layer underneath them**.

---

# 2. READ GOVERNANCE FIRST

Before modifying anything, inspect:

```text
docs/AGENT_PARALLEL_EXECUTION.md
```

Then inspect relevant current architecture:

```text
docs/PHASE_24_*.md
docs/PHASE_25_*.md
docs/PHASE_26_*.md
docs/PHASE_27_*.md
docs/PHASE_28_*.md
docs/PHASE_29_*.md
```

Also inspect:

```text
src/lib/
src/services/
src/lib/db/
drizzle/
server.ts
```

Identify:

- existing market data providers
- existing historical storage
- existing OHLCV models
- existing fundamentals storage
- earnings storage
- macro storage
- portfolio inputs
- multi-asset inputs
- freshness semantics
- provenance fields
- existing validation
- existing migrations

Do not assume a capability is absent merely because its name differs.

---

# 3. CRITICAL EXISTING DATA RULES

The existing system has strict source-of-truth and fail-closed requirements.

Preserve them.

Known data source hierarchy includes:

```text
KBS
VPS
VNDIRECT fallback
```

Existing semantics include:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

Existing protections include:

```text
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
RiskGuard
TradingEngine
RiskManager
PositionSizer
```

Do not weaken these.

Do not replace real providers with mocks.

Do not introduce synthetic fallback.

---

# 4. OWNERSHIP

Primary ownership:

```text
src/lib/data/**
src/services/data/**
src/lib/db/data/**
tests/data/**
docs/DATA_*.md
```

Additional domain-specific files are allowed only when architecturally justified.

Do NOT casually modify:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
FinancialConservation
MarketDataIntegrityGuard
TradingDataValidator
paper broker
execution
ledger
portfolio engines
multi-asset engines
strategy engines
macro engines
learning systems
```

If a shared interface must change:

1. identify why
2. make the smallest compatible change
3. preserve all existing semantics
4. document it
5. add regression tests

---

# 5. NON-DESTRUCTIVE GIT

NEVER use:

```bash
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git push --force
```

Never delete unrelated work.

Never use:

```bash
git add .
git add -A
```

Stage explicit files only.

---

# 6. CORE DATA PRINCIPLES

The Data Foundation must guarantee:

```text
REAL DATA
+
SOURCE
+
OBSERVATION TIME
+
PUBLICATION TIME
+
EFFECTIVE TIME
+
INGESTION TIME
+
VERSION
+
QUALITY
+
PROVENANCE
+
POINT-IN-TIME SEMANTICS
```

where applicable.

The system must distinguish:

### Observation time

When the underlying event/data occurred.

### Publication time

When information became available to the market/system.

### Effective time

When an action/change became effective.

### Ingestion time

When our system received the data.

Never collapse these timestamps into one generic `date`.

---

# 7. DATA-01 — HISTORICAL DATA FOUNDATION

## Objective

Create a coherent historical data foundation for downstream analytics.

---

## 7.1 Inventory existing historical data

Audit current support for:

```text
Equities
ETFs
Indices
Futures
Macro
Fundamentals
Earnings
Industry
Corporate actions
```

Document:

```text
source
granularity
coverage
start date
end date
symbol identity
timestamp semantics
adjustment semantics
quality status
```

Do not fabricate missing coverage.

---

## 7.2 Canonical instrument identity

Create a stable instrument identity abstraction.

Support:

```text
instrumentId
symbol
exchange
assetClass
currency
country
sector
industry
status
validFrom
validTo
```

The design must handle:

```text
symbol changes
ticker reuse
delisting
listing
merger
rename
exchange migration
```

Do not use ticker symbol as the permanent identity.

---

## 7.3 Historical price data

Create or normalize canonical historical bars:

```text
timestamp/date
instrumentId
open
high
low
close
volume
value
source
quality
```

Support at minimum:

```text
DAILY
```

Design extensibly for:

```text
INTRADAY
WEEKLY
MONTHLY
```

Do not add intraday ingestion unless actual source support exists.

---

## 7.4 Data coverage

Build diagnostics for:

```text
first observation
last observation
missing periods
duplicate periods
gaps
invalid OHLC
zero/negative prices
volume anomalies
```

---

## 7.5 Historical reproducibility

A historical query must be reproducible.

Given:

```text
instrument
date range
data version
adjustment mode
```

the system should return a deterministic dataset.

---

## 7.6 Acceptance criteria

DATA-01 passes only if:

```text
[ ] canonical instrument identity exists
[ ] historical data model is coherent
[ ] date/timestamp semantics are explicit
[ ] duplicate detection exists
[ ] gap detection exists
[ ] invalid OHLC detection exists
[ ] source is preserved
[ ] historical queries are deterministic
[ ] existing provider semantics remain intact
[ ] tests pass
```

---

# 8. DATA-02 — CORPORATE ACTIONS & HISTORICAL ADJUSTMENT

## Objective

Make historical prices and corporate events mathematically and temporally coherent.

---

## 8.1 Corporate action model

Support extensibly:

```text
DIVIDEND
CASH_DIVIDEND
STOCK_DIVIDEND
STOCK_SPLIT
REVERSE_SPLIT
RIGHTS_ISSUE
BONUS
MERGER
DEMERGER
SYMBOL_CHANGE
```

Only implement actions supported by actual data.

---

## 8.2 Event dates

Where relevant distinguish:

```text
announcementDate
recordDate
exDate
paymentDate
effectiveDate
```

Do not treat them as interchangeable.

---

## 8.3 Adjustment model

Support explicit modes:

```text
RAW
ADJUSTED
```

Potential future modes may include:

```text
TOTAL_RETURN
PRICE_RETURN
```

but do not implement unsupported semantics.

---

## 8.4 Adjustment engine

The adjustment engine must be:

- deterministic
- pure where possible
- date-aware
- version-aware
- testable

Never mutate raw source data to create adjusted data.

Raw and derived adjusted values must remain distinguishable.

---

## 8.5 Corporate action validation

Detect:

```text
duplicate events
impossible dates
missing required dates
invalid split ratios
negative dividend values
overlapping events
conflicting symbol changes
```

---

## 8.6 Acceptance criteria

DATA-02 passes only if:

```text
[ ] raw data remains immutable
[ ] corporate actions are independently represented
[ ] adjustment mode is explicit
[ ] adjustment calculations are deterministic
[ ] ex-date/effective-date semantics are correct
[ ] historical queries can request raw or adjusted data
[ ] tests cover splits/dividends/symbol changes
[ ] invalid events fail closed
```

---

# 9. DATA-03 — DATA QUALITY, PROVENANCE & LINEAGE

## Objective

Make every important dataset auditable.

---

# 9.1 Data quality framework

Create explicit quality states:

```text
VALID
WARNING
STALE
INVALID
UNAVAILABLE
```

If existing system terminology differs, integrate rather than duplicate.

---

## 9.2 Quality dimensions

Support checks such as:

```text
completeness
correctness
consistency
timeliness
uniqueness
range validity
cross-source consistency
referential integrity
```

---

## 9.3 Provenance

Each important dataset/result should be traceable to:

```text
source
provider
endpoint/query where appropriate
retrieval time
observation time
publication time
ingestion time
data version
transformation
adjustment
quality state
```

Do not store secrets.

Do not expose provider credentials.

---

# 9.4 Lineage

The system should be able to answer:

> "Where did this number come from?"

Example:

```text
Decision
 ↓
Portfolio calculation
 ↓
Price series
 ↓
Adjusted series
 ↓
Corporate action
 ↓
Source dataset
 ↓
Provider
```

For fundamentals:

```text
Valuation
 ↓
Financial metric
 ↓
Financial statement
 ↓
Filing/report
 ↓
Publication timestamp
 ↓
Source
```

---

# 9.5 Data quality reports

Create diagnostics for:

```text
coverage
missingness
staleness
provider disagreement
invalid observations
lineage completeness
```

---

# 9.6 Cross-source validation

Where multiple providers exist:

```text
source A
vs
source B
```

compare only when semantically comparable.

Do not silently choose a winner.

Record discrepancy.

---

# 9.7 Acceptance criteria

DATA-03 passes only if:

```text
[ ] quality states explicit
[ ] provenance available
[ ] lineage available
[ ] source preserved
[ ] transformation traceable
[ ] provider discrepancies detectable
[ ] invalid data fails closed
[ ] audit output reproducible
```

---

# 10. DATA-04 — SURVIVORSHIP / LOOK-AHEAD / POINT-IN-TIME CONTROL

## Objective

Prevent historical research from accidentally using information that was not available at the time.

This is one of the highest-priority Data Foundation capabilities.

---

# 10.1 Point-in-time model

Historical queries must support an explicit:

```text
asOfDate
```

or equivalent point-in-time timestamp.

For information-driven datasets, distinguish:

```text
eventDate
publicationDate
effectiveDate
```

---

# 10.2 Availability semantics

For a query at time T:

Only data satisfying:

```text
publicationTime <= T
```

may be used as known information.

Unless the data type has explicitly different semantics.

---

# 10.3 Look-ahead prevention

Build reusable guards for:

```text
future earnings
future fundamentals
future corporate actions
future index membership
future instrument metadata
future macro releases
future strategy inputs
```

---

# 10.4 Survivorship bias

Historical universe queries must support:

```text
active at date
listed at date
delisted before date
index membership at date
sector/industry classification at date
```

Do not assume current constituents were always constituents.

---

# 10.5 Delisted securities

Historical research must not automatically remove delisted instruments.

A delisted instrument can remain valid historical data.

---

# 10.6 Point-in-time APIs

Prefer APIs like:

```text
getInstrumentAsOf(instrumentId, asOf)
getFundamentalAsOf(instrumentId, asOf)
getUniverseAsOf(asOf)
getIndexConstituentsAsOf(index, asOf)
getCorporateActionsAsOf(instrumentId, asOf)
```

Do not expose only current-state APIs to historical engines.

---

# 10.7 Bias diagnostics

Create explicit diagnostics:

```text
LOOKAHEAD_DETECTED
SURVIVORSHIP_RISK
CURRENT_CONSTITUENT_LEAK
FUTURE_PUBLICATION
FUTURE_METADATA
```

---

# 10.8 Acceptance criteria

DATA-04 passes only if:

```text
[ ] point-in-time queries exist
[ ] publication time is respected
[ ] future information is rejected
[ ] delisted assets remain queryable
[ ] historical universes are supported
[ ] historical metadata can be queried
[ ] look-ahead tests exist
[ ] survivorship tests exist
[ ] reproducibility is demonstrated
```

---

# 11. DATA-05 — MULTI-ASSET DATA FOUNDATION

## Objective

Create a unified data foundation for multiple asset classes without destroying asset-specific semantics.

---

# 11.1 Asset classes

Support architecture for:

```text
EQUITY
ETF
INDEX
FUTURE
CASH
```

Design extensibly for:

```text
BOND
FX
COMMODITY
CRYPTO
```

but do not implement unsupported live sources.

---

# 11.2 Canonical market data

Create common abstractions for:

```text
Instrument
Quote
Bar
CorporateAction
MarketCalendar
ContractMetadata
```

But preserve asset-specific fields.

---

# 11.3 Futures

Preserve existing Phase 29 semantics:

```text
multiplier = 100,000 VND
tick = 0.1
```

Do not change existing Phase 29 semantics.

Support where available:

```text
expiryDate
contractCode
underlying
multiplier
tickSize
tickValue
margin
```

---

# 11.4 Equities / ETFs

Preserve:

```text
lot size = 100
```

Do not reinterpret existing position semantics.

---

# 11.5 Cash

Cash must not be treated as a tradable price series.

Preserve face-value semantics.

---

# 11.6 Market calendars

Create explicit market-calendar abstraction.

Support:

```text
trading day
holiday
session
timezone
```

Do not hard-code calendar assumptions throughout engines.

---

# 11.7 Cross-asset normalization

Normalize:

```text
currency
units
timestamps
price precision
volume
notional
```

without destroying original source precision.

---

# 11.8 Acceptance criteria

DATA-05 passes only if:

```text
[ ] asset identity is explicit
[ ] equity/ETF/index/futures/cash semantics preserved
[ ] Phase 29 futures semantics preserved
[ ] lot-size semantics preserved
[ ] market calendar abstraction exists
[ ] units/currency are explicit
[ ] cross-asset queries are deterministic
[ ] unsupported asset classes fail clearly
```

---

# 12. DATA FOUNDATION ARCHITECTURE

The target architecture should conceptually become:

```text
                 DATA SOURCES
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
        KBS         VPS      VNDIRECT
          │          │          │
          └──────────┼──────────┘
                     ↓
             INGESTION LAYER
                     ↓
             RAW DATA STORAGE
                     ↓
          DATA VALIDATION / QUALITY
                     ↓
              PROVENANCE
                     ↓
             CORPORATE ACTIONS
                     ↓
          POINT-IN-TIME / BIAS LAYER
                     ↓
          CANONICAL DATA ACCESS
                     ↓
      ┌──────────────┼──────────────┐
      ↓              ↓              ↓
 Historical       Current        Multi-Asset
 Analytics         Data            Data
      │              │              │
      └──────────────┼──────────────┘
                     ↓
          CORE INTELLIGENCE
```

Do not force every provider through unnecessary abstraction.

The architecture must remain practical.

---

# 13. RAW VS DERIVED DATA

The system must distinguish:

```text
RAW
DERIVED
ADJUSTED
AGGREGATED
NORMALIZED
SIMULATED
```

Never overwrite raw observations with derived calculations.

---

# 14. VERSIONING

Where data transformations materially affect results, support:

```text
dataVersion
schemaVersion
adjustmentVersion
calculationVersion
```

Historical research must be reproducible against the correct version.

Do not introduce meaningless version fields everywhere.

Only version what actually needs reproducibility.

---

# 15. FRESHNESS

Preserve existing freshness lifecycle.

At minimum:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

Do not redefine freshness inconsistently in Data Foundation.

Where Data Quality introduces additional states, define clear mapping.

---

# 16. FAIL-CLOSED

If required data is unavailable:

```text
DATA_UNAVAILABLE
```

If data is invalid:

```text
DATA_INVALID
```

If historical point-in-time data cannot be proven:

```text
POINT_IN_TIME_UNAVAILABLE
```

Do NOT:

```text
guess
interpolate silently
use current data
use future data
use synthetic data
return fake confidence
```

---

# 17. NO UI FINANCIAL MATH

Financial calculations remain in backend/domain engines.

UI may:

```text
display
filter
navigate
visualize
```

but must not become the source of financial truth.

---

# 18. PURE ENGINE RULE

Pure Data Foundation engines should:

- accept explicit inputs
- accept explicit dates
- avoid reading current clock
- avoid hidden global state
- be deterministic
- be unit-testable

---

# 19. DATABASE / MIGRATION GOVERNANCE

Before every migration:

1. inspect existing migrations
2. determine highest migration ID
3. reserve next ID
4. verify no concurrent agent uses it
5. create migration
6. test migration
7. document affected tables

Never guess migration numbers.

Never rewrite existing production migrations.

---

# 20. TEST STRATEGY

Every phase must add focused tests.

## DATA-01

Test:

- instrument identity
- historical bars
- gaps
- duplicates
- invalid OHLC
- deterministic queries

## DATA-02

Test:

- dividends
- splits
- symbol changes
- adjustment
- raw/adjusted separation

## DATA-03

Test:

- provenance
- lineage
- quality states
- cross-source discrepancy

## DATA-04

Test:

- point-in-time
- future publication
- look-ahead
- survivorship
- delisted assets
- historical universe

## DATA-05

Test:

- asset classes
- futures
- equities
- ETFs
- cash
- calendars
- units
- currencies

---

# 21. REGRESSION REQUIREMENT

After each phase run:

```bash
npm test
npm run typecheck
npm run build
```

Use repository-equivalent commands if necessary.

Record actual:

```text
suite count
test count
typecheck result
build result
```

Do not claim success from compilation alone.

---

# 22. EXISTING PHASE REGRESSION

Explicitly verify that Data Foundation does not break:

```text
Phase 24
Phase 25
Phase 26
Phase 27
Phase 28
Phase 29
```

Especially:

```text
Portfolio Intelligence
Multi-Asset Quant
Futures multiplier
Futures tick
Lot size
Strategy HOLD/FLAT semantics
Risk boundaries
```

---

# 23. INTEGRATION CONTRACTS

Before changing an existing data contract:

Document:

```text
current behavior
new behavior
compatibility impact
migration requirement
test coverage
```

Prefer additive interfaces.

Avoid breaking existing consumers.

---

# 24. PERFORMANCE

Identify:

- historical query cost
- large date ranges
- instrument universe scans
- point-in-time joins
- corporate-action adjustments
- provenance joins

Add indexes only where justified by actual query patterns.

Do not prematurely optimize.

---

# 25. SECURITY

Audit:

- provider credentials
- source endpoints
- user data
- provenance exposure
- SQL injection
- unsafe dynamic queries
- unauthorized historical data access

Never log:

```text
API keys
tokens
passwords
secrets
```

---

# 26. DATA FOUNDATION DOCUMENTATION

Create:

```text
docs/DATA_01_ARCHITECTURE.md
docs/DATA_01_CERTIFICATION.md

docs/DATA_02_ARCHITECTURE.md
docs/DATA_02_CERTIFICATION.md

docs/DATA_03_ARCHITECTURE.md
docs/DATA_03_CERTIFICATION.md

docs/DATA_04_ARCHITECTURE.md
docs/DATA_04_CERTIFICATION.md

docs/DATA_05_ARCHITECTURE.md
docs/DATA_05_CERTIFICATION.md

docs/DATA_FOUNDATION_FULL_AUDIT.md
docs/DATA_FOUNDATION_ARCHITECTURE.md
```

Do not create fake certification documents before evidence exists.

---

# 27. PHASE GATES

At the end of each phase:

```text
IMPLEMENT
↓
TEST
↓
TYPECHECK
↓
BUILD
↓
EVIDENCE CHECK
↓
CERTIFY
↓
NEXT PHASE
```

Do not continue with known P0/P1 issues.

---

# 28. FINAL FULL AUDIT

After DATA-05 perform one complete audit across DATA-01→05.

Audit:

### Identity

- instrument identity
- ticker changes
- delisting

### Historical data

- coverage
- duplicates
- gaps
- OHLC integrity

### Corporate actions

- event dates
- adjustment
- raw/derived separation

### Quality

- freshness
- validity
- completeness
- cross-source

### Provenance

- source
- retrieval
- transformation
- lineage

### Point-in-time

- publication time
- effective time
- as-of queries

### Bias

- look-ahead
- survivorship
- current constituent leakage

### Multi-asset

- equity
- ETF
- index
- futures
- cash

### Existing system

- Phase 24
- Phase 25
- Phase 26
- Phase 27
- Phase 28
- Phase 29

---

# 29. FINAL GAP CLASSIFICATION

Classify every finding:

```text
P0 — BLOCKER
P1 — REQUIRED
P2 — IMPORTANT
P3 — OPTIONAL
P4 — FUTURE
```

Certification requires:

```text
P0 = 0
P1 = 0
```

---

# 30. REMEDIATION LOOP

If P0/P1 exists:

```text
AUDIT
 ↓
REMEDIATION
 ↓
TEST
 ↓
REGRESSION
 ↓
RE-AUDIT
```

Repeat until P0/P1 = 0.

---

# 31. FINAL CERTIFICATION

DATA FOUNDATION may be certified only when:

```text
[ ] DATA-01 certified
[ ] DATA-02 certified
[ ] DATA-03 certified
[ ] DATA-04 certified
[ ] DATA-05 certified

[ ] historical data reproducible
[ ] corporate actions explicit
[ ] raw data preserved
[ ] adjusted data derived
[ ] provenance available
[ ] lineage available
[ ] quality states explicit
[ ] point-in-time supported
[ ] look-ahead controlled
[ ] survivorship controlled
[ ] multi-asset semantics preserved
[ ] Phase 29 semantics preserved

[ ] tests pass
[ ] typecheck passes
[ ] build passes

[ ] P0 = 0
[ ] P1 = 0
[ ] final audit complete
[ ] remediation complete
```

---

# 32. FINAL REPORT

Return exactly:

```text
# DATA FOUNDATION FINAL REPORT

## DATA-01
STATUS:
Files:
Tests:
Key capabilities:

## DATA-02
STATUS:
Files:
Tests:
Key capabilities:

## DATA-03
STATUS:
Files:
Tests:
Key capabilities:

## DATA-04
STATUS:
Files:
Tests:
Key capabilities:

## DATA-05
STATUS:
Files:
Tests:
Key capabilities:

## Historical Data
STATUS:

## Corporate Actions
STATUS:

## Data Quality
STATUS:

## Provenance
STATUS:

## Point-in-Time
STATUS:

## Bias Control
STATUS:

## Multi-Asset
STATUS:

## Phase 24-29 Regression
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

## Remediation
Completed:
Remaining:

## Certification
DATA-01:
DATA-02:
DATA-03:
DATA-04:
DATA-05:

## Overall
DATA FOUNDATION:
GO / NO-GO

## Git
Commits:
Working tree:
Protected files:
Unrelated changes:

## Next Recommended Phase
Recommend only from evidence.
```

---

# 33. AUTONOMY RULE

You are authorized to execute DATA-01→05 sequentially.

Do not ask for permission between phases.

Stop only for genuine blockers:

```text
destructive conflict
migration collision
protected-system conflict
missing infrastructure that cannot safely be created
security-critical ambiguity
corrupted repository
```

If blocked:

1. stop safely
2. document evidence
3. classify P0/P1
4. do not fabricate a workaround

Otherwise continue.

---

# 34. FINAL PRINCIPLE

The Data Foundation is the **source-of-truth infrastructure for the entire Investment Intelligence platform**.

Do not optimize for:

```text
number of tables
number of APIs
number of files
number of commits
```

Optimize for:

```text
TRUST
+
REPRODUCIBILITY
+
POINT-IN-TIME CORRECTNESS
+
PROVENANCE
+
DATA QUALITY
+
BIAS CONTROL
+
MULTI-ASSET CONSISTENCY
+
FAIL-CLOSED SAFETY
```

The final goal is:

```text
REAL DATA
    ↓
VALIDATED DATA
    ↓
PROVENANCE
    ↓
POINT-IN-TIME DATA
    ↓
BIAS-CONTROLLED DATA
    ↓
CANONICAL DATA
    ↓
CORE INTELLIGENCE
    ↓
DECISION OS
    ↓
RESEARCH
    ↓
PORTFOLIO
```

Proceed autonomously.