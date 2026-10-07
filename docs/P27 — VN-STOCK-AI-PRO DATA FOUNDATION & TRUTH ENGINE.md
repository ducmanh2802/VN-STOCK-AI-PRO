# VN-STOCK-AI-PRO — P27
# DATA FOUNDATION & TRUTH ENGINE
# REAL MARKET DATA → VALIDATION → FRESHNESS → FALLBACK → CERTIFY

STATUS: EXECUTE AUTONOMOUSLY

---

# 0. MISSION

Continue from:

    P26 — TAILSCALE PUBLIC RUNTIME PASS

Current certified baseline:

    BUILD: PASS
    TYPESCRIPT: PASS
    TESTS: 210 files / 2409 tests
    PRODUCTION: node dist/server.cjs
    CONTAINER: vn-stock-ai-pro:p25
    TAILSCALE FUNNEL: PASS
    PUBLIC RUNTIME: PASS
    DATA TRUTH: PASS

Known limitations:

    1. PostgreSQL unavailable
    2. DB routes fail closed with JSON 500
    3. No authoritative index level
    4. Index UI renders "--" rather than fabricated data

P27 objective:

    BUILD A TRUSTWORTHY REAL-MARKET-DATA FOUNDATION

Focus ONLY on:

    MARKET DATA
    PROVIDERS
    VALIDATION
    FRESHNESS
    FALLBACK
    INDEX DATA
    DATA CONTRACTS
    OBSERVABILITY
    TESTING

Do NOT add large product features.

Do NOT add trading execution.

Do NOT add fake data.

Do NOT introduce PostgreSQL unless existing architecture proves it is strictly required for the data foundation.

---

# 1. NON-NEGOTIABLE DATA TRUTH

ABSOLUTE RULE:

Never fabricate financial data.

Never hardcode production:

- prices
- OHLC
- VN-INDEX
- VN30
- HNX
- UPCOM
- volume
- market cap
- foreign flow
- P/E
- P/B
- EPS
- revenue
- profit
- DCF
- valuation
- macro data

If data cannot be obtained from an authoritative/validated provider:

    DATA_UNAVAILABLE

The UI MUST render an explicit unavailable state.

Never convert:

    UNKNOWN → 0

    UNAVAILABLE → CURRENT

    STALE → CURRENT

    INVALID → CURRENT

---

# 2. FIRST STEP — FULL DATA AUDIT

Before modifying code, inspect the entire existing data architecture.

Inspect:

    src/
    server/
    providers/
    services/
    api/
    tests/
    docs/
    package.json

Search for:

    market data
    quote
    candle
    index
    VN-INDEX
    VN30
    HNX
    UPCOM
    foreign flow
    market cap
    fundamentals
    freshness
    cache
    provider
    fallback
    DATA_UNAVAILABLE
    CURRENT
    STALE
    INVALID

Also inspect the existing P26 certification.

Determine:

- current provider implementations
- provider priority
- fallback behavior
- cache layer
- TTLs
- freshness calculation
- source attribution
- timestamp handling
- error handling
- synthetic/demo data
- hardcoded values
- index implementation
- API contracts
- UI consumers

Create:

    docs/P27_DATA_AUDIT.md

Do not change code until the audit is complete.

---

# 3. EXISTING DATA POLICY

Preserve the project's established freshness targets unless audit proves they are incorrect.

Expected baseline:

    QUOTES       15s
    HISTORY      60s
    GUARD        120s
    FUNDAMENTALS 300s

Cache tolerance:

    10%

Freshness states:

    CURRENT
    STALE
    UNAVAILABLE
    INVALID

Do not silently extend TTLs to make stale data appear current.

---

# 4. DATA CONTRACT

Establish or harden a common data contract.

Every provider result should expose, where applicable:

    data
    source
    retrievedAt
    dataTimestamp
    freshness
    status
    errorCode
    errorMessage

Example conceptual state:

    {
      status: "CURRENT",
      source: "...",
      dataTimestamp: "...",
      retrievedAt: "...",
      freshnessSeconds: ...
    }

Do not expose secrets.

Do not expose internal stack traces.

---

# 5. PROVIDER ABSTRACTION

Create or harden:

    MarketDataProvider

Required conceptual capabilities:

    getQuote(symbol)
    getQuotes(symbols)
    getHistory(symbol, timeframe, range)
    getIndex(indexSymbol)
    getMarketBreadth()
    getForeignFlow()

Only implement capabilities for which legitimate data exists.

Unsupported capability:

    DATA_UNAVAILABLE

Do not create fake implementations.

---

# 6. PROVIDER PRIORITY

Audit existing providers first.

Expected known provider history includes:

    KBS historical / data_day
    VPS getliststockdata / baseinfo
    VNDIRECT fallback
    VCI

Do not blindly preserve an old provider order.

For every provider determine:

    AUTHORITY
    AVAILABILITY
    LATENCY
    DATA QUALITY
    RATE LIMIT
    WAF / BLOCKING
    FRESHNESS
    COVERAGE

Create a provider matrix.

Example:

    Provider | Quote | History | Index | Fundamentals | Status

Do not invent provider capabilities.

---

# 7. PROVIDER HEALTH

Implement provider health classification:

    HEALTHY
    DEGRADED
    BLOCKED
    UNAVAILABLE
    INVALID

Provider failures must be observable.

Examples:

    HTTP 403
    timeout
    malformed payload
    stale payload
    schema mismatch

must not be silently swallowed.

---

# 8. FALLBACK ENGINE

Implement deterministic fallback.

Example:

    PRIMARY
       ↓ failure
    SECONDARY
       ↓ failure
    TERTIARY
       ↓ failure
    DATA_UNAVAILABLE

Fallback MUST NOT:

- fabricate data
- mix timestamps without recording it
- mark fallback data as primary
- hide provider failures

Every result must retain:

    actual source

---

# 9. QUOTE ENGINE

Harden quote retrieval.

Required fields where legitimately available:

    symbol
    price
    change
    changePercent
    bid
    ask
    volume
    timestamp
    source
    freshness

If a provider does not provide a field:

    field = unavailable/null

Do NOT use:

    0

as a substitute for missing data.

---

# 10. INDEX ENGINE

This is a P27 priority.

Support:

    VN-INDEX
    VN30
    HNX
    UPCOM

BUT ONLY when authoritative data is available.

For each index:

    value
    change
    changePercent
    timestamp
    source
    freshness

If unavailable:

    value = null
    status = UNAVAILABLE

The UI must show:

    --

or the project's established unavailable presentation.

Never:

    1234.56

just because the UI expects a number.

---

# 11. INDEX SOURCE VALIDATION

Identify the most authoritative currently usable source for index values.

Do not infer VN-INDEX from:

- constituent prices
- previous close
- cached UI values
- random fixtures
- approximate calculations

unless the source itself explicitly provides an authoritative index value.

If an authoritative source cannot be verified:

    INDEX_STATUS = UNAVAILABLE

Document the blocker.

---

# 12. MARKET BREADTH

Audit existing implementation for:

    advance
    decline
    unchanged
    ceiling
    floor

Only expose real values.

Validate:

    advances + declines + unchanged

against the actual covered universe when possible.

If coverage is partial:

    expose coverage metadata.

Do not represent partial market breadth as complete market breadth.

---

# 13. FOREIGN FLOW

Audit foreign-flow data.

Required metadata:

    source
    timestamp
    market/session
    coverage
    freshness

Never synthesize:

    foreignBuy
    foreignSell
    foreignNet

If unavailable:

    DATA_UNAVAILABLE

---

# 14. MARKET CAP / FUNDAMENTALS

Audit existing market-cap and fundamental data.

Specifically search for previous synthetic/fallback implementations.

Verify:

    marketCap
    sharesOutstanding
    EPS
    P/E
    P/B
    revenue
    profit

are sourced from real provider data.

If provider data is unavailable:

    null / DATA_UNAVAILABLE

Never generate a value merely to satisfy UI rendering.

---

# 15. FRESHNESS ENGINE

Implement or harden one centralized freshness calculation.

Concept:

    now - dataTimestamp

Classification:

    CURRENT
    STALE
    UNAVAILABLE
    INVALID

Freshness MUST use:

    dataTimestamp

NOT:

    requestTimestamp

A provider returning an old quote at 19:00 must remain STALE.

---

# 16. CLOCK / TIMEZONE

Normalize internal timestamps.

Preferred:

    UTC

Convert only at presentation boundaries.

Handle:

- timezone offsets
- market sessions
- weekends
- holidays
- missing timestamps
- malformed timestamps

Do not infer freshness from local machine clock without documenting the assumption.

---

# 17. CACHE

Audit current cache implementation.

Requirements:

- explicit TTL
- source retained
- timestamp retained
- stale state retained
- invalidation behavior documented

Cache must not turn:

    stale → current

Cache may provide:

    stale data

ONLY if the API/UI explicitly marks it STALE.

---

# 18. REQUEST DEDUPLICATION

If multiple UI components request the same quote simultaneously:

    deduplicate in-flight requests

Avoid:

    20 UI components
        ↓
    20 provider requests

Use a safe request coalescing mechanism where architecture allows.

Do not introduce unnecessary infrastructure.

---

# 19. RATE LIMIT / PROVIDER PROTECTION

Providers must be protected against excessive requests.

Implement if missing:

    request throttling
    retry policy
    exponential backoff
    timeout
    circuit breaker

Rules:

- no infinite retries
- no retry storms
- no retry of clearly invalid requests
- no retry of permanent 4xx failures unless explicitly justified

---

# 20. API CONTRACTS

Audit all market-data endpoints.

Every endpoint must distinguish:

    SUCCESS
    STALE
    UNAVAILABLE
    INVALID

Unknown API routes must remain JSON 404.

Internal errors must remain JSON.

Do not expose stack traces.

Do not return HTTP 200 with fake financial data.

---

# 21. UI DATA TRUTH

Audit:

- market ribbon
- VN-INDEX
- VN30
- HNX
- UPCOM
- watchlist
- stock detail
- market overview
- heatmap
- foreign flow
- fundamentals

For every displayed number determine:

    SOURCE
    TIMESTAMP
    FRESHNESS

If unavailable:

    display --

or existing truthful unavailable state.

No placeholder financial numbers.

---

# 22. DATA SOURCE INDICATOR

Where practical, display:

    Source
    Freshness

Example:

    VN-INDEX
    1,234.56
    CURRENT · ProviderName

or:

    VN-INDEX
    --
    UNAVAILABLE

Do not clutter every UI component if the existing UX has a global source/freshness indicator.

---

# 23. TEST FIXTURES

Synthetic fixtures are allowed ONLY in:

    tests/

Every fixture must be clearly named:

    TEST_FIXTURE_ONLY

Production code MUST NOT import test fixtures.

Add tests for:

- valid provider payload
- malformed payload
- stale payload
- unavailable provider
- fallback provider
- provider timeout
- provider 403
- duplicate candle
- missing timestamp
- invalid OHLC
- missing field
- index unavailable

---

# 24. ANTI-FABRICATION TESTS

Create explicit regression tests proving:

### Test 1

Provider unavailable:

    quote = DATA_UNAVAILABLE

NOT:

    quote = 0

### Test 2

Provider returns old timestamp:

    status = STALE

NOT:

    CURRENT

### Test 3

Index provider unavailable:

    VN-INDEX = --

NOT:

    hardcoded index

### Test 4

Provider fallback:

    source = actual fallback provider

### Test 5

Malformed provider response:

    status = INVALID

### Test 6

Provider returns null field:

    field remains null/unavailable

### Test 7

Cache contains stale data:

    stale data remains STALE

---

# 25. SECURITY

Search for:

    API keys
    tokens
    credentials
    cookies
    passwords

Never commit secrets.

Use:

    .env.example

Never print credentials into logs.

Provider error logs must redact sensitive headers.

---

# 26. NO DATABASE EXPANSION

P27 MUST NOT introduce PostgreSQL simply because P26 reported:

    DB routes fail closed

The DB limitation is OUT OF SCOPE unless the existing market-data architecture genuinely requires persistence.

Use:

    in-memory cache
    existing storage
    existing filesystem mechanisms

where appropriate.

If persistence is required for a future feature:

    DOCUMENT IT

but do not introduce heavyweight infrastructure in P27.

---

# 27. PERFORMANCE

Measure:

- provider latency
- cache hit rate
- fallback rate
- provider failure rate
- request deduplication
- response latency

Do not optimize prematurely.

No new paid services.

---

# 28. TESTING

Run existing regression suite first.

Baseline:

    210 files
    2409 tests

Then add P27 tests.

Required:

    unit
    integration
    provider contract
    freshness
    fallback
    anti-fabrication
    API
    UI data-state

Do not delete or weaken existing tests.

---

# 29. BUILD

Run:

    npm run build

    npx tsc --noEmit

    npx vitest run

If project scripts differ, use the existing scripts.

Expected:

    ALL EXISTING TESTS PASS

Test count may increase.

Unexpected decrease is a blocker.

---

# 30. AUTO-FIX

If defects are found:

    AUDIT
      ↓
    DIAGNOSE
      ↓
    FIX
      ↓
    TEST
      ↓
    REGRESSION

Allowed fixes:

- provider parsing
- freshness calculation
- fallback routing
- cache logic
- timeout
- retry
- validation
- API state handling
- truthful UI state

Do NOT:

- weaken data validation
- hardcode market numbers
- bypass RiskGuard
- fabricate index values
- disable tests
- hide provider failures

---

# 31. RISK / TRADING LOGIC PROTECTION

P27 is a DATA phase.

Do not modify:

    RiskGuard
    TradingEngine
    PositionSizer
    strategy logic
    portfolio calculations

unless a data contract change requires a minimal compatibility fix.

If changed:

    document exactly why

and run complete regression.

---

# 32. BROWSER QA

Run browser-level QA against:

    https://windows-pc.tailbc6a27.ts.net/

Verify:

- market ribbon
- VN-INDEX
- VN30
- HNX
- UPCOM
- watchlist
- stock detail
- unavailable states
- stale states
- source labels
- no console errors

If browser automation is unavailable:

    BROWSER_QA = NOT_AVAILABLE

Never fabricate browser PASS.

---

# 33. PRODUCTION VERIFICATION

After successful tests:

Verify production build:

    node dist/server.cjs

Verify:

    /api/health
    /api/platform/healthz

Then verify public runtime:

    https://windows-pc.tailbc6a27.ts.net/

No dev runtime.

No Vite.

No HMR.

---

# 34. DOCUMENTATION

Create:

    docs/P27_DATA_FOUNDATION_CERTIFICATION.md

Include:

## DATA SOURCES

Provider matrix.

## FRESHNESS

TTL and state rules.

## FALLBACK

Provider priority and behavior.

## INDEX

VN-INDEX/VN30/HNX/UPCOM source and status.

## MARKET DATA

Quote/history status.

## FUNDAMENTALS

Status and limitations.

## FOREIGN FLOW

Status and limitations.

## CACHE

Architecture and TTL.

## ANTI-FABRICATION

Test evidence.

## DATABASE

Explicitly state:

    PostgreSQL remains OUT OF SCOPE.

## REGRESSION

Before/after test counts.

## PUBLIC RUNTIME

Public URL and health status.

---

# 35. CERTIFICATION GATES

P27 PASS requires:

[ ] Full data audit complete
[ ] Provider matrix documented
[ ] Data contract hardened
[ ] Provider abstraction hardened
[ ] Fallback deterministic
[ ] Freshness centralized
[ ] CURRENT/STALE/UNAVAILABLE/INVALID correct
[ ] Quote data truthful
[ ] History data truthful
[ ] VN-INDEX source verified OR explicitly unavailable
[ ] VN30 source verified OR explicitly unavailable
[ ] HNX source verified OR explicitly unavailable
[ ] UPCOM source verified OR explicitly unavailable
[ ] Foreign flow truthful
[ ] Fundamentals truthful
[ ] Market cap truthful
[ ] No synthetic production data
[ ] Anti-fabrication tests PASS
[ ] Provider failure tests PASS
[ ] Cache tests PASS
[ ] Regression PASS
[ ] TypeScript PASS
[ ] Build PASS
[ ] Browser QA PASS or NOT_AVAILABLE
[ ] Public runtime PASS
[ ] Documentation complete
[ ] No secrets
[ ] RiskGuard untouched/protected

---

# 36. FINAL CERTIFICATION FORMAT

Print:

============================================================
VN-STOCK-AI-PRO — P27 CERTIFICATION
============================================================

STATUS:
<PASS | PASS WITH LIMITATIONS | BLOCKED>

DATA FOUNDATION:
<PASS>

PROVIDER HEALTH:
<PASS>

FRESHNESS:
<PASS>

FALLBACK:
<PASS>

ANTI-FABRICATION:
PASS

VN-INDEX:
<REAL / UNAVAILABLE>

VN30:
<REAL / UNAVAILABLE>

HNX:
<REAL / UNAVAILABLE>

UPCOM:
<REAL / UNAVAILABLE>

FOREIGN FLOW:
<REAL / UNAVAILABLE>

FUNDAMENTALS:
<REAL / UNAVAILABLE>

MARKET CAP:
<REAL / UNAVAILABLE>

DATABASE:
OUT OF SCOPE

BUILD:
PASS

TYPESCRIPT:
PASS

TESTS:
<PASS — N files / N tests>

BROWSER QA:
<PASS | NOT_AVAILABLE>

PUBLIC RUNTIME:
PASS

PUBLIC:
https://windows-pc.tailbc6a27.ts.net/

SYNTHETIC FINANCIAL DATA:
NONE

AUTO-FIXES:
<N>

SOURCE CHANGES:
<N>

============================================================
FINAL STATUS:
<PASS | PASS WITH LIMITATIONS | BLOCKED>
============================================================

---

# 37. EXECUTION ORDER

Execute autonomously:

    AUDIT
      ↓
    DATA ARCHITECTURE
      ↓
    PROVIDER AUDIT
      ↓
    IMPLEMENT
      ↓
    VALIDATE
      ↓
    TEST
      ↓
    AUTO-FIX
      ↓
    REGRESSION
      ↓
    BUILD
      ↓
    PUBLIC QA
      ↓
    CERTIFY

Do not ask for confirmation for routine safe operations.

Do not stop because one provider is unavailable.

Use fallback if legitimate.

If all legitimate providers fail:

    DATA_UNAVAILABLE

is a PASS for data truth.

Never replace unavailable data with fabricated numbers.

END P27.