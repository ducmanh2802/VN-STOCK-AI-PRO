# P0 SYSTEM INTEGRATION REMEDIATION

## MISSION

The final system audit discovered four P0 defects in the actual end-to-end production path.

These defects are wiring/integration failures, not a reason to redesign the certified domain engines.

Your mission is to autonomously remediate all four P0 findings, then implement a permanent cross-domain reachability gate that prevents domain capabilities from being certified merely because isolated engines and tests exist.

DO NOT proceed to Infrastructure.

DO NOT commit or push until all P0/P1 blockers are resolved and final certification passes.

---

# 1. CURRENT P0 FINDINGS

## P0-01 — ORDER PATH BYPASSES RISK

Current path:

```text
POST /api/trading/order
        ↓
TradingApiRouter.ts
        ↓
PaperBroker.submitOrder(...)
```

This bypasses:

```text
RiskGuard
RiskManager
PositionSizer
```

This violates the system's safety architecture.

The real order path must be:

```text
API
 ↓
Trading boundary
 ↓
RiskGuard
 ↓
RiskManager
 ↓
PositionSizer
 ↓
TradingEngine / PaperBroker
 ↓
Ledger / Portfolio
```

Preserve the existing authoritative engines.

Do NOT duplicate risk logic inside the router.

Do NOT create a second PositionSizer.

Do NOT allow HTTP callers to directly invoke PaperBroker for order creation.

---

# 2. P0-01 ACCEPTANCE CRITERIA

For every order submitted through:

```text
POST /api/trading/order
```

prove:

```text
RiskGuard invoked
RiskManager invoked
PositionSizer invoked
PaperBroker invoked only after safety gates
```

Test:

```text
risk approved
risk rejected
position size reduced
position size zero
liquidity zero
data unavailable
stale data
invalid data
invalid order
```

A rejected risk decision must result in:

```text
NO BROKER SUBMISSION
```

A zero sizing result must be distinguishable from:

```text
ZERO_BY_RISK
ZERO_BY_SIZING
ZERO_BY_LIQUIDITY
ZERO_BY_DATA
```

Preserve existing semantics.

---

# 3. P0-01 REAL-EXECUTION SAFETY

Verify:

```text
isSimulation === true
```

for Paper Broker paths.

No route may gain access to:

```text
real broker credentials
real broker adapter
live execution
```

A non-simulation execution request must fail closed before order submission.

Add an adversarial HTTP test proving:

```text
unsafe order
→ RiskGuard rejects
→ PaperBroker.submitOrder NOT CALLED
```

---

# 4. P0-02 — FRESHNESS MUST BE REAL

Current defects include:

```text
dataFreshness: 'CURRENT'
sourceTimestamp: null
```

at:

```text
RealMarketDataProvider.ts
```

This is prohibited.

Freshness must be computed from actual source timestamps.

Do NOT hardcode:

```text
CURRENT
```

Do NOT default missing timestamp to CURRENT.

---

# 5. P0-02 FRESHNESS MODEL

Use the repository's established freshness lifecycle:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

Determine freshness from:

```text
sourceTimestamp
asOf
current/reference timestamp
configured TTL
```

Respect the existing TTL architecture.

If source timestamp is unavailable:

```text
UNAVAILABLE
```

unless there is an existing authoritative source contract that explicitly defines another safe state.

Never:

```text
null timestamp → CURRENT
```

---

# 6. P0-02 TESTS

Add tests for:

```text
fresh quote
→ CURRENT

old quote
→ STALE

missing source timestamp
→ UNAVAILABLE

invalid timestamp
→ INVALID or UNAVAILABLE according to existing contract

provider failure
→ UNAVAILABLE

future timestamp
→ INVALID
```

Verify the UI/API receives the actual computed state.

Search the repository for:

```text
dataFreshness: 'CURRENT'
dataFreshness: "CURRENT"
sourceTimestamp: null
```

and eliminate unsafe production-path literals.

Test all market-data providers involved in the UI path.

---

# 7. P0-03 — REMOVE UNSOURCED SYNTHETIC FINANCIAL VALUES

The audit found synthetic values including:

```text
marketCap = price × 1_000_000 / 1e9

hardcoded index bases:
1285.0
1320.5
238.5
98.2

foreignFlow.netValue = 185.4
proprietaryFlow = 62.1
retailFlow = -247.5

fairValue = price × 1.18
```

These values must NOT reach production financial UI.

Do not merely rename them.

Do not hide them behind comments.

Do not replace them with another arbitrary constant.

---

# 8. P0-03 CORRECT BEHAVIOR

For every affected value choose exactly one evidence-backed outcome:

```text
REAL DATA
DERIVED FROM AUTHORITATIVE DATA
UNAVAILABLE
```

If the application lacks the required real source:

return:

```text
UNAVAILABLE
```

or the repository's equivalent explicit unavailable state.

Do NOT fabricate a replacement.

---

# 9. MARKET CAP

Audit the actual fundamentals/instrument data model.

Market cap must come from:

```text
authoritative shares outstanding
×
authoritative price
```

or an authoritative market-cap source.

If shares outstanding are unavailable:

```text
marketCap = UNAVAILABLE
```

Do not assume:

```text
1,000,000 shares
```

for every ticker.

---

# 10. INDEX VALUES

Remove hardcoded index levels.

Index data must come from an authoritative market-data source.

If unavailable:

```text
indexLevel = UNAVAILABLE
```

Do not manufacture an index base.

Do not interpolate fake index values.

Do not silently reuse yesterday's value as current.

---

# 11. FOREIGN / PROPRIETARY / RETAIL FLOW

Remove:

```text
185.4
62.1
-247.5
```

and any equivalent synthetic literals from production data paths.

Only expose flow metrics if backed by:

```text
real provider data
persisted historical data
authoritative derived calculation
```

Otherwise:

```text
UNAVAILABLE
```

with provenance indicating why.

---

# 12. FAIR VALUE

Remove:

```text
fairValue = price * 1.18
```

from production financial paths.

Fair value must come from an actual valuation model/data source.

If the valuation engine is not reachable from this UI path:

do NOT fake it.

Return:

```text
UNAVAILABLE
```

or explicitly expose:

```text
NOT_COMPUTED
```

according to the existing domain contract.

Never represent an arbitrary heuristic as certified valuation.

---

# 13. UI SAFETY

The UI must distinguish:

```text
REAL
DERIVED
UNAVAILABLE
STALE
INVALID
```

Never render:

```text
0
```

or:

```text
N/A converted into a fake number
```

as if it were a financial value.

No financial UI component may silently substitute:

```text
0
1
100
price × constant
hardcoded index
```

for missing data.

---

# 14. P0-04 — CANONICAL MARKET DATA PERSISTENCE

The audit found:

> canonical bars, provenance and quality have no table.

The current data foundation migration contains:

```text
instruments
corporate_action_events
```

but no proper canonical historical bars/provenance/quality persistence.

Implement the missing data foundation persistence required by the actual architecture.

Do NOT redesign the existing market-data provider contracts.

---

# 15. CANONICAL BAR MODEL

Design the minimal authoritative historical bar model required by the system.

At minimum audit whether the model requires:

```text
instrument
trading date/time
open
high
low
close
volume
source
source timestamp
ingestion timestamp
adjustment state
quality state
version
```

Use the actual project's instrument identity model.

Do not use ticker text as the sole identity if the system already defines canonical instrument identity.

---

# 16. PROVENANCE

Every persisted canonical market-data record must be traceable to:

```text
source
source identifier
observation timestamp/date
ingestion timestamp
provider
version where applicable
```

No canonical bar may appear from nowhere.

Provenance must survive restart.

---

# 17. QUALITY

Implement explicit quality state.

At minimum distinguish:

```text
VALID
STALE
INVALID
UNAVAILABLE
```

according to existing Data Foundation semantics.

Audit:

```text
OHLC consistency
volume validity
timestamp validity
duplicate bars
future dates
source mismatch
missing fields
```

Do not silently repair financial data unless an explicit deterministic rule exists and provenance records the transformation.

---

# 18. MULTI-SOURCE DATA

Preserve the existing source-of-truth architecture:

```text
KBS
VPS
VNDIRECT
```

Do not introduce synthetic fallback.

If sources disagree beyond configured tolerance:

mark the data appropriately.

Do not silently select a convenient number.

---

# 19. HISTORICAL / POINT-IN-TIME SAFETY

Canonical persistence must remain compatible with:

```text
asOfDate
publication time
effective time
observation time
ingestion time
```

Do not introduce look-ahead.

Historical queries must not see future data.

---

# 20. MIGRATION SAFETY

Inspect all existing migrations first.

Reserve a genuinely unused migration ID.

Do not modify already-used migrations.

Do not collide with concurrent lane migrations.

If another agent currently owns the migration namespace:

STOP only the migration portion and create a clear integration boundary.

Do NOT overwrite another agent's migration.

---

# 21. REPOSITORY INTEGRATION

Implement the missing repository path:

```text
Provider
 ↓
Validation
 ↓
Canonical persistence
 ↓
Provenance
 ↓
Quality
 ↓
Query
 ↓
UI/API
```

A table without a caller is NOT considered integrated.

A repository without a production caller is NOT considered integrated.

A service without a route/use-case caller is NOT considered integrated.

---

# 22. CRITICAL REACHABILITY GATE

The audit discovered the root cause:

> Domain certifications proved that engines and repositories existed, but not that they were reachable from production call paths.

Create a permanent reachability audit.

Every important capability must have:

```text
implementation
+
test
+
persistence where required
+
at least one non-test production caller
```

---

# 23. REACHABILITY RULE

For each critical module/table/feature:

```text
ENGINE
SERVICE
REPOSITORY
ROUTE / PRODUCT ENTRYPOINT
```

trace actual call edges.

A test-only caller does NOT count.

Documentation does NOT count.

A registry entry does NOT count.

A feature flag saying:

```text
IMPLEMENTED
```

does NOT count.

Only actual non-test runtime reachability counts.

---

# 24. REACHABILITY CI GATE

Implement a CI/test gate capable of detecting:

```text
implemented but unreachable
```

for critical capabilities.

At minimum inspect the known classes:

```text
DataFoundationRepository
DecisionJournalRepository
ResearchRepository
InstrumentRepository
CorporateActionEventRepository
PointInTimeGuard
InstrumentIdentityEngine
AuditEngine.certify
PaperReplayEngine
MonitoringEngine
```

Do not hardcode only these examples.

Design the gate so future critical capabilities can be registered.

---

# 25. REACHABILITY REGISTRY

If a registry is required, define explicit metadata:

```text
capability
owner
implementation
production entrypoint
persistence
security boundary
test
status
```

Do not allow:

```text
IMPLEMENTED
```

without:

```text
REACHABLE
```

being independently proven.

Possible states:

```text
PLANNED
IMPLEMENTED
REACHABLE
CERTIFIED
DEFERRED
```

---

# 26. REACHABILITY AUDIT OUTPUT

Create:

```text
docs/CROSS_DOMAIN_REACHABILITY_AUDIT.md
```

Include:

```text
capability
engine
service
repository
route/use case
caller
test
persistence
status
```

Highlight:

```text
ORPHANED
TEST_ONLY
UNREACHABLE
REACHABLE
CERTIFIED
```

---

# 27. KNOWN P1s

The reachability audit must specifically revisit the findings that this gate would have prevented:

```text
P1-01
P1-02
P1-03
P1-05
P1-09
```

Locate their current exact status.

If still present and safely remediable:

fix them.

Do not merely downgrade them.

---

# 28. CROSS-DOMAIN CALL-CHAIN AUDIT

Trace at least:

```text
Market Data
 ↓
Data Validation
 ↓
Macro
 ↓
Industry
 ↓
Fundamental
 ↓
Valuation
 ↓
Strategy
 ↓
Portfolio
 ↓
Risk
 ↓
Position Sizing
 ↓
Decision
 ↓
Research
 ↓
Paper Replay
 ↓
Monitoring
 ↓
Product
 ↓
Platform
 ↓
Business
```

For each major arrow prove:

```text
actual caller
actual data
actual return path
actual persistence where needed
actual authorization where needed
```

Do not accept “designed to call”.

---

# 29. NO REDESIGN RULE

Do not redesign:

```text
quant engines
risk engines
decision engines
research engines
paper replay engines
business domain
platform identity
```

unless a P0 safety defect cannot be fixed otherwise.

Prefer:

```text
adapter
composition layer
route wiring
repository
integration service
```

over engine rewrites.

---

# 30. TEST REQUIREMENTS

Add regression tests for:

## Trading

```text
HTTP order
→ RiskGuard
→ RiskManager
→ PositionSizer
→ PaperBroker
```

## Freshness

```text
timestamp
→ computed freshness
→ UI/API
```

## Synthetic Data

```text
missing source
→ UNAVAILABLE
```

## Canonical Data

```text
provider
→ canonical bar
→ provenance
→ quality
→ query
```

## Reachability

```text
critical capability
→ production caller
```

---

# 31. FULL REGRESSION

After remediation run:

```text
npm test
npx tsc --noEmit
npm run build
```

Also run all relevant targeted suites.

No test may be deleted merely to achieve green.

No assertion may be weakened.

No production path may be replaced with a mock.

---

# 32. FINAL P0/P1 AUDIT

Search the entire repository again.

Required:

```text
P0 = 0
P1 = 0
```

Specifically confirm:

```text
P0-01 = FIXED
P0-02 = FIXED
P0-03 = FIXED
P0-04 = FIXED
```

Then confirm:

```text
P1-01 = resolved or formally justified
P1-02 = resolved or formally justified
P1-03 = resolved or formally justified
P1-05 = resolved or formally justified
P1-09 = resolved or formally justified
```

No “not observed” answer without executable evidence.

---

# 33. FINAL SECURITY AUDIT

Verify:

```text
authentication
authorization
IDOR
risk bypass
real execution boundary
secret handling
webhook security
data provenance
```

Trading HTTP routes must never bypass the risk chain.

---

# 34. FINAL DATA SAFETY AUDIT

Verify:

```text
no hardcoded CURRENT
no null timestamp interpreted as CURRENT
no synthetic market cap
no synthetic index
no synthetic flow
no synthetic fair value
no fabricated historical bars
```

Search for suspicious financial literals.

Do not rely only on known literals from this report.

---

# 35. FINAL FINANCIAL SAFETY AUDIT

Verify:

```text
FinancialConservation
NAV invariants
lot 100
futures multiplier 100,000
futures tick 0.1
RiskGuard
RiskManager
PositionSizer
PaperBroker
```

All remain intact.

---

# 36. FINAL CERTIFICATION

Only after:

```text
P0 = 0
P1 = 0
```

and:

```text
tests PASS
typecheck PASS
build PASS
reachability gate PASS
security PASS
financial safety PASS
data safety PASS
```

update:

```text
docs/FINAL_SYSTEM_CERTIFICATION.md
docs/FINAL_SYSTEM_READINESS_AUDIT.md
docs/CROSS_DOMAIN_REACHABILITY_AUDIT.md
```

Verdict:

```text
FINAL SYSTEM — CERTIFIED
```

only when evidence supports it.

---

# 37. INFRASTRUCTURE GATE

Only after final system certification.

Then evaluate:

```text
READY_FOR_INFRA = YES / NO
```

If YES, continue the previously defined INFRA roadmap.

If NO:

do not implement Infrastructure.

---

# 38. IMPORTANT CONCURRENT-LANE RULE

The audit explicitly reported that another agent currently owns:

```text
src/services/business/BillingPersistenceService.ts
src/services/business/OrganizationService.ts
```

and potentially related BUSINESS-06 files.

Before touching any such file:

```text
git status
git diff
```

Determine ownership.

If another agent is actively writing it:

DO NOT overwrite.

Integrate only after it is stable.

If necessary:

complete all non-conflicting P0 work first.

---

# 39. GIT RULE

Do NOT commit during remediation.

Do NOT push during remediation.

Do NOT stage unrelated files.

At this stage the goal is:

```text
working tree correctness
```

not Git publication.

Final commit/push happens only after the complete final system certification.

---

# 40. FINAL REPORT

Return:

```text
P0 SYSTEM INTEGRATION REMEDIATION

P0-01 Trading Risk Path
status:
evidence:
tests:

P0-02 Data Freshness
status:
evidence:
tests:

P0-03 Synthetic Financial Values
status:
evidence:
tests:

P0-04 Canonical Data Persistence
status:
evidence:
migration:
repository:
caller:
tests:

CROSS-DOMAIN REACHABILITY
status:
capabilities audited:
orphaned:
test-only:
reachable:
certified:

P1 REMEDIATION
P1-01:
P1-02:
P1-03:
P1-05:
P1-09:

SECURITY
status:

FINANCIAL SAFETY
status:

DATA SAFETY
status:

TESTS
files:
passed:
failed:

TYPECHECK:
BUILD:

P0:
P1:
P2:
P3:

FINAL SYSTEM READINESS:
READY / NOT_READY

INFRA:
AUTHORIZED / BLOCKED

GIT:
NO COMMIT — REMEDIATION STAGE
```

# STOP CONDITION

Stop only if:

1. all P0s are fixed and verified;
2. all P1s are fixed or formally proven non-blocking;
3. reachability gate exists and passes;
4. full regression passes;
5. typecheck passes;
6. build passes.

Then return the final report.

Do NOT proceed to GitHub push from this prompt.

The next stage is the previously defined FINAL CERTIFICATION → INFRA → FINAL GIT/PUSH workflow.

# END