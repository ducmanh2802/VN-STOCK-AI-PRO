# BUSINESS MONETIZATION ARCHITECTURE

**One-page map of the commercial layer.** Per-phase detail lives in
`BUSINESS_0N_ARCHITECTURE.md`; verification in `BUSINESS_0N_CERTIFICATION.md` and
`BUSINESS_FULL_AUDIT.md`.

---

## 1. WHERE THE COMMERCIAL LAYER SITS

```
                    PLATFORM  (identity, Principal, roles)
                       ↓
                  BUSINESS / COMMERCIAL        ← this layer
                       ↓
                 PRODUCT / APPLICATION         (learning, research, portfolio, paper)
                       ↓
             INVESTMENT INTELLIGENCE           (analysis, backtest, validation)
                       ↓
                        DATA                  (market data, macro, fundamentals)
```

The Business layer sits **above** the product, exactly as §6 requires. It never reaches
downward into financial safety controls.

---

## 2. THE FIVE PHASES IN ONE PICTURE

```
BUSINESS-01  MONETIZATION FOUNDATION
  FeatureId (22)  →  Plan (6)  →  Subscription (8 states)  →  EntitlementVerdict
                                                          →  Usage (idempotent)  →  Limit
  · the ONLY place a capability decision is made
  · metering happens only AFTER an ALLOWED verdict
  · audit trail created (none existed)

BUSINESS-02  COMMUNITY
  Post / Comment  →  Visibility (6 tiers)  →  Moderation (6 states)  →  Provenance chain
  · ~80-line pure privacy boundary, exhaustively matrix-tested
  · a flag is not a takedown
  · reputation is event-derived and is NOT an authorization input

BUSINESS-03  MARKETPLACE
  StrategyVersion (immutable chain)  →  PerformanceGate  →  Evidence ladder  →  Rank
  · a number is displayable ONLY with all 6 provenance fields
  · enforced in type, in the engine, AND by a database constraint
  · PUBLISHED ≠ VERIFIED ≠ CERTIFIED, and v2 never inherits v1's evidence

BUSINESS-04  ORGANIZATION
  Organization  →  Membership (role)  →  Seat  →  EntitlementPrecedence
  · no second role system: OrgRole is resource-scoping, PLATFORM owns identity
  · org plan overrides the individual plan; the individual plan is always retained
  · concurrent seat safety closed by a partial UNIQUE index, not by app logic

BUSINESS-05  BILLING
  PaymentProvider (neutral)  →  WebhookPipeline  →  CommercialLedger  →  Reconciler
  · SANDBOX is the only adapter; PRODUCTION cannot be represented
  · an amount cannot be written without declaring its source
  · reconciliation DETECTS and never REPAIRS
```

---

## 3. THE FOUR INVARIANTS THAT DEFINE THIS LAYER

### I1 — One decision point
Every capability check converges on `EntitlementEngine.evaluate`. No application code
compares a plan string. `grep "plan ==="` → 0 hits.

### I2 — Implementation gates entitlement
A plan may name a capability with no engine behind it; the registry refuses it anyway.
`ENTERPRISE` grants `API_ACCESS`, and `API_ACCESS` still denies because no implementation
exists. This is what makes "no dead features" enforced rather than aspirational.

### I3 — An unavailable answer is an answer
`NOT_AVAILABLE` / `UNAVAILABLE` / `REQUIRES_RECONCILIATION` / `LIMIT_REACHED` /
`PAYMENT_REQUIRED` are first-class values everywhere. No surface substitutes a number for an
unknown.

### I4 — The financial boundary is structural, not conventional
`src/lib/business/**` has **0 imports** from `src/lib/trading/**`. The commercial layer cannot
reach `RiskGuard`, `PositionSizer`, `TradingEngine`, `FinancialConservationValidator` or
`PaperBroker` — not by policy, but because there is no code path.

---

## 4. FAILURE SEMANTICS

| Situation | Decision | Never |
|---|---|---|
| feature not in the registry | `DENIED_UNKNOWN_FEATURE` | an implicit allow |
| feature has no implementation | `DENIED_FEATURE_NOT_IMPLEMENTED` | an allow because a plan names it |
| subscription held by another subject | `DENIED_SUBJECT_MISMATCH` | an allow |
| no subscription | `DENIED_NO_SUBSCRIPTION` | an implicit free-tier branch |
| reconciliation pending | `REQUIRES_RECONCILIATION` | `ALLOWED` |
| cancellation grace elapsed | `DENIED_GRACE_EXPIRED` | a generic inactive denial |
| never had a settled payment | `REQUIRES_PAYMENT` | `ACTIVE` |
| metered limit exhausted | `LIMIT_REACHED` | a negative remaining count |
| payment outcome unknown | `RETRY_REQUIRED` | `PROCESSED` |
| provider unreachable | `RETRY_REQUIRED` | `FAILED`, or success |
| unknown persisted visibility | `UNKNOWN_VISIBILITY:…` | a default to public |
| performance provenance incomplete | `NOT_AVAILABLE` | a partial render |
| unknown payment reference | `PAYMENT_UNKNOWN` | a default to success/failure |
| unsourced money | throw | a written amount |

---

## 5. WHAT IS **NOT** HERE, AND WHY

| Absent | Reason |
|---|---|
| Payment provider | None exists in this repo (§4). A neutral interface + a SANDBOX adapter is the honest maximum. |
| Prices / currency conversion | Fabricating a rate would be fabricating a financial figure (§2.1). |
| Payout balances | No settled ledger entry ⇒ no balance. `NOT_APPLICABLE`, not a number. |
| `API_ACCESS`, `EXPORT` | Declared, unimplemented, therefore denied — by design (§01.4). |
| Frontend surfaces | `server.ts` is protected and was concurrently owned. Mock UI for unmounted endpoints would be a mock. |
| Cloud / Kubernetes / queues / microservices | Explicitly forbidden (§6). Modular monolith only. |
| A second role system | Forbidden (§04.1). PLATFORM owns roles. |
| A duplicated learning engine | Forbidden (§04.3). Referenced by id + version. |

---

## 6. DATA AT A GLANCE

| Area | Tables | Load-bearing constraint |
|---|---|---|
| Commercial foundation | 3 | `UNIQUE(subject_id)`, `UNIQUE(event_id)`, monotonic audit `sequence` |
| Community | 6 | `UNIQUE(post_id, version)`, actor NOT NULL, reason length > 0 |
| Marketplace | 4 | `GENERATED` performance_displayable + CHECK refusing unprovenanced metrics; `UNIQUE(strategy_id, version)` |
| Organization | 6 | partial `UNIQUE` on active seat assignment; `CHECK(subject_id = organization_id)` |
| Billing | 4 | `UNIQUE(idempotency_key)`, `UNIQUE(causation_id)`, `UNIQUE(event_id)` |

**23 tables, 5 migrations (0008–0012).** No ID reused, no historical migration altered, no
destructive migration.

---

## 7. VERIFICATION

```
Typecheck                       0 errors
Tests          205 files / 2213 tests / 0 failures
  business      7 files /  236 tests / 0 failures
Build          1944 modules, 12.65s
P0             0
P1             2   (missing SQL adapters for billing and seat assignment)
Protected      0 files under src/lib/trading/**, auth, or schema.ts modified by this lane
Cross-lane     0 imports from src/lib/trading/** in the business lane
```

Details and limitations: `docs/BUSINESS_FULL_AUDIT.md`, `docs/BUSINESS_SECURITY_AUDIT.md`.