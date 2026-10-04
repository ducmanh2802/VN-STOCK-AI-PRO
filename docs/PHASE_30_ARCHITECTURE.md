# PHASE 30 — ARCHITECTURE

**Domain**: Constraint-Aware Cost-Aware Rebalancing Decision (`rebalancing-decision`)
**Version**: `v1.0.0-phase30` (proposed) | **Date**: 2026-10-04 | **Lane**: Core Backend
**Status**: ARCHITECTURE ONLY — NOT IMPLEMENTED. Predecessors: Phase 28 (`v1.0.0-phase28`, `e67a656`) + Phase 29 (`v1.0.0-phase29`, `c00dced`), integrated + verified.
**Discovery**: `docs/PHASE_30_DISCOVERY_REPORT.md` (this document is its buildable companion; no code, no migrations, no UI, no Learning edits).

---

## 1. Target Architecture

```text
Providers (existing, real) + caller constraints
  ↓  (services acquire fail-closed: UNAVAILABLE/INVALID/INSUFFICIENT_DATA)
Service (orchestration: RebalancingDecisionService)
  ↓  (validated DTO: current weights, reference targets, constraints, costs, asOfDate)
Pure Engines (deterministic, side-effect free, no DB/provider/clock)
  ↓  (constrained weights | INFEASIBLE + turnover + costed plan + diagnostics)
Result / Diagnostic (serializable snapshot with lineage + caveats)
```

Hard bans: `Engine → Database | Provider | UI | Current Time`. `evaluatedAt` exists only in services (wall-clock stamp, excluded from determinism contract).

### Goals

1. Enforce real-world constraints on top of proven Phase 28 allocations (min/max weight, sector/factor/liquidity/cash/leverage/margin/asset-class/benchmark-relative bands, turnover cap) — contradiction yields `INFEASIBLE` with reasons, never a silently-clipped guess.
2. Make rebalancing cost-aware with the repo's canonical cost truth (`DEFAULT_TRADING_COST_CONFIG` 0.15%/0.15%/0.10%/0.10% in `src/lib/trading/types/trading.ts` + lot-100 truncation via `VietnamLotRule`), estimating a **lower-bound** cost and penalizing turnover; never invent spread/impact curves.
3. Emit a reproducible, auditable decision (constrained weights + turnover + costed execution plan + provenance + caveats) that **recommends only** — never mutates strategy intent (HOLD/FLAT/BUY/SELL) and never bypasses RiskGuard/TradingEngine/PositionSizer/conservation/integrity gates.

### Non-Goals

New return estimators; HRP / max-Sharpe / max-diversification / CVaR-opt / robust-opt; factor-return/risk/attribution (no factor history exists); live execution or broker integration; persistence by default (optional audit slice only); UI redesign; AI-as-truth; cloud/infra (K8s/microservices/queues/Redis/Kafka/GPU/paid APIs); Learning-lane work.

---

## 2. Domain Boundaries

| Domain | Owner | Phase 30 relationship |
|---|---|---|
| Unconstrained analytics (weights, cov/corr/vol/beta/tracking, factor exposure, equal/inv-vol/min-var/BL-blend, benchmark/scenario) | Phase 28 OWNS | Phase 30 **consumes as inputs** (reference targets, vols, coverage, limits). Extend, do not fork |
| Multi-asset valuation (lot-100 hints, notional×100k, margin/pnl required, expired→INVALID, cash face, NAV never substituted) | Phase 29 OWNS | Phase 30 **consumes** (current weights, margin/leverage, hints as starting point). Preserved verbatim |
| Constraint enforcement + feasibility (`INFEASIBLE`) | **Phase 30 OWNS** | Absent in P28 (detection only) and P29 (limit *checks* only). New |
| Turnover + transaction-cost reasoning | **Phase 30 OWNS** | Absent everywhere (grep-verified zero hits). New |
| Execution / safety gates (RiskGuard, TradingEngine, RiskManager, PositionSizer, ledger, conservation, integrity) | Trading stack OWNS (protected) | Phase 30 **must not touch; recommend-only**. Reference lot math, never bypass |
| Factor returns/risk/attribution, advanced estimators | OUT | Explicitly excluded (data-blocked). No speculative estimators |
| Strategy intent (HOLD/FLAT/BUY/SELL) | Strategy Factory OWNS | Phase 30 summarizes only, never mutates |

No-duplication rule enforced: if a capability exists in P28/P29/strategy/macro/capital-cycle/earnings — **REUSE → INTEGRATE → EXTEND**, never recreate.

---

## 3. Module Boundaries

| Capability | Phase 28 | Phase 29 | Phase 30 (new) |
|---|---|---|---|
| Unconstrained analytics | OWNS — extend, do not fork | references (equity/ETF slice link) | consumes (inputs) |
| Multi-asset valuation | — | OWNS — preserved verbatim | consumes (current weights, margin/leverage, hints) |
| Constraint enforcement + feasibility | absent | absent (limit *checks* only) | **OWNS** |
| Turnover + transaction-cost reasoning | absent | absent (cost-blind hints) | **OWNS** |
| Execution / safety gates | — | — | **must not touch; recommend-only** |
| Factor returns/risk/attribution, advanced estimators | absent | absent | explicitly OUT |

### File-level architecture (proposed, NOT created)

```text
src/lib/rebalancing-decision/
  types.ts                        constraints, costs, decision + lineage contracts
  ConstraintEngine.ts             validation/normalization, contradiction detection
  ConstrainedAllocator.ts         bounded simplex projection over AllocationEngine refs
  TurnoverCostEngine.ts           turnover metric + lower-bound cost estimator
  RebalancingDecisionBuilder.ts   pure orchestrator → RebalancingDecision snapshot
  index.ts                        barrel

src/services/rebalancing-decision/
  RebalancingDecisionService.ts   orchestration + provider acquisition (fail-closed)
  (RebalancingDataProvider interface declared inside, mirroring
   PortfolioDataProvider / MultiAssetDataProvider interface-only precedent)

src/lib/rebalancing-decision/__tests__/
  ConstraintEngine.test.ts
  ConstrainedAllocator.test.ts
  TurnoverCost.test.ts
  RebalancingDecisionFailClosed.test.ts
  RebalancingDecisionDeterminism.test.ts
```

Do not create these files in discovery. This is architecture only.

---

## 4. Pure Engine Design

All pure: deterministic, side-effect free, explicit-input driven, `asOfDate`-aware where temporal, independently testable. Must NOT call database/providers, read current time, mutate global state, or silently fetch missing data. Verified pattern: zero `Date.now`/`Math.random`/fetch/fs in `src/lib/portfolio` + `src/lib/multi-asset` (grep-clean) — same bar applies.

- **`ConstraintEngine`** — validates/normalizes the constraint set (bounds sanity: no NaN/Inf/negative where illegal; band ordering: min ≤ target ≤ max; contradictory-pair detection: e.g. cash-floor + full-investment, leverage-cap + concentration-floor, zero-turnover + off-target). Each violation → typed reason `{constraintId, kind, detail}`. Missing constraint data (factor coverage < threshold, liquidity unknown, benchmark unavailable) → constraint marked `UNEVALUATED` and proposal fail-closed (`INFEASIBLE` or constrained-skip with warning at builder policy), never defaulted to zero.
- **`ConstrainedAllocator`** — wraps `AllocationEngine` reference weights (equal/inv-vol/min-var/BL-lite, **reused not duplicated**): projects onto the feasible set via deterministic bounded simplex projection (iterative clip-and-renormalize, fixed iteration cap e.g. ≤1000, tolerance e.g. 1e-9, documented; ridge `1e-6` inherited for singular covariance). Empty feasible set / contradictory bands / non-positive budget / `NON_CONVERGED` at cap → `INFEASIBLE`, no weights emitted. Long-only clip preserved; weights renormalized to sum 1 ±1e-9.
- **`TurnoverCostEngine`** — turnover = Σ|w_new − w_current| / 2 (long-only; two-sided extension documented for short-futures notional). Cost lower bound from `DEFAULT_TRADING_COST_CONFIG` applied on turnover notional (buyFee 0.15% + sellFee 0.15% + sellTax 0.10% + slippage 0.10%; `Math.round` integer-VND to match paper/replay conservation — document the `toFixed(2)`-vs-`Math.round` divergence in backtests as known non-uniformity). Lot-100 / contract truncation via `VietnamLotRule` math (**reuse, not rewrite**); execution-step quantities lot-rounded, pure weights kept unrounded. Large/illiquid symbols flagged cost-uncertain (no invented impact curves). Missing cost config → `INSUFFICIENT_DATA` (never assume zero cost). Zero-turnover assumption never accepted silently.
- **`RebalancingDecisionBuilder`** — pure orchestrator: assembles `RebalancingDecision` (status `OK|INFEASIBLE|INSUFFICIENT_DATA|INVALID`, constrained weights|null, turnover, cost breakdown `{fees, tax, slippage, total, lowerBound:true}`, execution-step list with lot-rounded quantities, violated/unevaluated constraints, warnings, survivorship + cost-lower-bound + history-window (≤355d) + factor-partial caveats, full lineage: sources/engine versions (`v1.0.0-phase30` + P28/P29 versions consumed)/params/constraints/benchmark/input-hash/`asOfDate`).

---

## 5. Service Design

`RebalancingDecisionService` (mirrors `PortfolioIntelligenceService` / `MultiAssetQuantService` patterns): owns provider acquisition (current portfolio via P28/P29 services or direct positions+marks; covariance vols via P28 slice; costs via config), maps provider throw → fail-closed decision (never fabricated series), stamps `evaluatedAt` (wall-clock, service-only), threads `quoteFreshness` through. Provider interface `RebalancingDataProvider` stays caller-implementable (interface-only precedent). `QuoteFreshness` mapping inherits the certified `statusFromFreshness` semantics (including the documented `__provider__`-key quirk — preserve, do not silently change certified behavior; note it in code comments).

---

## 6. Repository Design

No repository in the base slice (compute-only, reproducible without persistence — same rationale as P28/P29 "no migration by design"). Optional audit slice adds `OptimizationRunRepository` + `RiskSnapshotRef` behind `src/lib/db/` conventions (insert-only runs keyed by `(runId,inputHash)` + engine version; user-owned rows; retention/versioning defined at implementation time; `onConflictDoNothing` append-only, never overwrite). Must define entity/ownership/retention/versioning/as-of/user-isolation before any migration.

---

## 7. Data Flow

```text
BrokerAccount / positions (qty, price, sectorId, assetClass)
 + historicalReturns {symbol: number[]} (validated tails, minObs 30)
 + benchmarkReturns {series} (explicit VN-INDEX/VN30, never synthesized)
 + factorScores {symbol: FactorVector} (explicit, coverage-gated, never imputed)
 + current weights (P28/P29 output) + reference/target weights + method tag
 + constraint set (per-asset min/max, sector/class/factor bands, cash floor,
    leverage cap, margin-coverage floor, derivative-notional cap,
    benchmark-relative bands, turnover cap, cost budget)
 + cost config (default canonical, overridable with provenance)
 + lot/margin semantics (constants + caller margin/pnl) + asOfDate + benchmark id
   → ConstraintEngine (validate) → ConstrainedAllocator (project | INFEASIBLE)
   → TurnoverCostEngine (turnover + lower-bound cost + lot-rounded steps)
   → RebalancingDecisionBuilder (decision + lineage + caveats)
```

---

## 8. Failure Flow

Per-capability mapping (extends P28/P29 vocab with `INFEASIBLE`):

```text
invalid positions/marks/constraints ──→ INVALID (null weights)
stale quotes ──→ STALE (values kept, flagged)
provider throw / missing series ──→ UNAVAILABLE (nulls, never fabricated)
short history / zero factor coverage ──→ INSUFFICIENT_DATA
singular covariance ──→ ridge-guarded projection, else INSUFFICIENT_DATA (flagged)
contradictory constraints / over-budget cost / zero-turnover-off-target ──→ INFEASIBLE + violated list (no weights)
projection non-convergence at iteration cap ──→ NON_CONVERGED → INFEASIBLE
numerical instability ──→ NUMERICALLY_UNSTABLE → INFEASIBLE
missing futures expiry (carried leniency) ──→ inherit P29 refusal until ACCEPT-or-FIX recorded, then conform
missing cost config ──→ INSUFFICIENT_DATA (never zero-cost)
```

No silent substitution anywhere. `INFEASIBLE` is a first-class success outcome (correct refusal), not an error.

---

## 9. Provenance

Every decision carries: data sources + timestamps, `asOfDate`, engine `v1.0.0-phase30` + P28/P29 versions consumed, full constraint + cost-param snapshot, benchmark id, **input hash** (replace/augment collision-prone `snapshotId=date+count` pattern), caveats (survivorship, ≤355d history, cost-lower-bound, factor-partial, futures-bars caller-supplied, BL-lite stays blend, covariance simplified). Same input + same versions → byte-identical output (no clock/random in engines; stochastic methods explicitly excluded). Users can eventually answer: *"Why did the system produce this result?"* from the decision record alone.

---

## 10. Persistence

Base: **no migration** (justification §13 discovery: decisions are pure functions of versioned inputs; auditability via returned lineage, not rows). Optional slice: two tables (`optimization_runs`, `decision_snapshots`) with keys `(runId,inputHash)`, indexes `(userId,asOfDate)`, constraints (owner FK, immutability), rollback = drop-only additive migration. Migration files **not created** in discovery; numbering follows `drizzle/0003_phase30_*` reservation at implementation. Must define ownership/retention/versioning/as-of/user-isolation first.

---

## 11. API Boundary (proposed, not implemented)

`POST /api/rebalancing/decision` (sync, idempotent on input-hash, versioned `v1`): request = §12 contracts + `portfolioReference`; response = decision snapshot (status, weights|INFEASIBLE reasons, turnover, cost breakdown, execution steps, warnings, lineage, caveats); errors typed (`INVALID_CONSTRAINTS`, `INSUFFICIENT_DATA`, `UNAVAILABLE`, `INFEASIBLE`) with constraint-level reasons. Auth = existing session; authorization = user owns portfolio ref (IDOR-checked) if persistence enabled. **No execution endpoint** (recommend-only boundary). Sync (not async/queued) — per-decision compute is O(N²)–O(N³) with N≤1000 cap, no background infra needed.

---

## 12. Data Contracts (inputs, all explicit)

Current weights (P28/P29 output), reference/target weights + method tag (`EQUAL|INVERSE_VOL|MIN_VAR|BL_LITE`), constraint set (per-asset min/max, sector/class/factor bands, cash floor, leverage cap, margin-coverage floor, derivative-notional cap, benchmark-relative bands, turnover cap, cost budget), cost config (default canonical, overridable with provenance), lot/margin semantics (constants + caller margin/pnl), covariance/vol snapshot ref, factor coverage map, `asOfDate` (YYYY-MM-DD), benchmark id, options (projection iteration cap, tolerance). Every nullable input documents its fail-closed mapping (§8). Futures `expiryDate` required (missing/blank/malformed → `INVALID`); margin + unrealized required (missing → `DATA_UNAVAILABLE`); NAV never substituted for mark price.

---

## 13. Frontend Boundary

No UI changes in Phase 30 (discovery + implementation boundary). The architecture exposes backend contracts a future frontend consumes (§11 + decision-snapshot view model). Eventual views (optimizer workspace, allocation-review panel with approve/relax-constraints affordance, turnover/cost breakdown, INFEASIBLE explainer, scenario/decision panels) belong to a later UI slice. Current pages (`PortfolioPage`, `RiskCenterPage`, `PaperTradingPage`) remain PaperBroker-bound; they must not be retrofitted inside the `rebalancing-decision` lane (UI owned by another lane per git rules).

---

## 14. Testing Architecture

- **Unit** (`src/lib/rebalancing-decision/__tests__/`): constraint validation matrix, projection on hand-computed 2–3-asset cases, turnover/cost arithmetic, INFEASIBLE triggers, lot-truncation reconciliation, missing/blank/malformed futures metadata, all P28/P29 edge fixtures (empty/single/concentrated/correlated/zero-variance/missing/stale/invalid/short/zero-coverage).
- **Mathematical**: sum-to-1 (±1e-9), non-negativity, cost monotonic in turnover, feasibility monotone in relaxed constraints, hint↔weight reconciliation tolerance, conservation (no value created/destroyed by rounding — rounding reported separately).
- **Integration**: service fail-closed on provider throw, freshness propagation, P28/P29 service composition.
- **Regression**: P24–P29 suites green (baseline ≥1620), lane tests added, `tsc` clean, vite+server build succeeds.
- **Safety**: assert engines import none of `trading/` execution paths; assert no HOLD/FLAT/BUY/SELL mutation (signal passthrough untouched); assert no RiskGuard/PositionSizer/conservation bypass.
- **Bias/replay**: survivorship caveat asserted present; factor gate asserted (no imputation); input-hash replay asserted byte-identical. Synthetic data confined to fixtures.

---

## 15. Migration Strategy

No migration in base slice (§10). If the optional audit slice is authorized: purpose = auditable proposal history + decision review; entities = `optimization_runs` (inputs hash, constraints, params, result ref, status incl. INFEASIBLE reasons, provenance) + `decision_snapshots` refs; keys = `(runId,inputHash)`; indexes = `(userId,asOfDate)`; constraints = owner FK + immutability; ownership = user-isolated rows; versioning = engine-version column; rollback = drop-only additive file. Migration IDs reserved at implementation time (`drizzle/0003_phase30_*`), following the additive `IF NOT EXISTS` convention of `0000_phase24/0001_phase26/0002_phase27_macro`. Never renumber, never overwrite another lane's migration.

---

## 16. Performance Strategy

Weights/decimals renormalized to sum 1 ±1e-9, non-negative enforced, lot-rounding kept out of pure weights (execution steps only). Conditioning: inherit ridge `1e-6`; projection loop fixed cap (≤1000) with `NON_CONVERGED→INFEASIBLE`. Bounds validated before math. Solver deterministic (no heuristic search in base slice). Caps: N>1000 → `INVALID` with reason (N×N memory guard); matrix ops O(N²) memory / O(N³) inversion acceptable sync for N≤~500 client-or-server-side. No cache required (stateless, idempotent on input-hash); optional memo on `(inputHash,engineVersion)`. No GPU/queue/Redis/Kafka — future scale (10k instruments, 10k users, multi-portfolio batch) via factor-model covariance + background workers belongs to post-32 design, not Phase 30.

---

## 17. Security

Compute-only slice: validate numeric bounds (no NaN/Inf/negative where illegal), cap universe/matrix/iterations, validate constraint payloads (bounds, band ordering, matrix shapes), no new secrets, no new packages. Persistence slice: user-ownership checks, tenant isolation, no cross-user leakage, audit trail on runs, IDOR prevention on portfolio refs. Threats to cover in tests: parameter tampering (contradiction → `INFEASIBLE`, not silent clamp), oversized matrices (→ `INVALID`), malicious payloads (schema-validated DTO).

---

## 18. Integration Strategy

Depends **read-only** on: P28 engines + snapshot (`AllocationEngine` methods, `ConcentrationEngine` limits, `CovarianceEngine` vols, snapshot lineage pattern), P29 valuation/aggregation + snapshot (current weights, margin/leverage, hint math), `VietnamLotRule`, `DEFAULT_TRADING_COST_CONFIG`, `PositionSizer` math (reference only), KBS/VPS/DB providers (existing, via P28/P29 services). Touches **nothing** protected (no RiskGuard/TradingEngine/RiskManager/PositionSizer/IntegrityGuard/Validator/conservation/ledger edits). Consumes strategy signals as reference (rollup only). Context inputs (macro-regime, capital-cycle, earnings) are optional overlays via `StrategyContext`-style references — never trading triggers. Future extensions (post-30, each requiring its own data-availability proof): factor-history–gated attribution, shrinkage/EWMA covariance options, multi-portfolio/batch optimization, persisted run analytics UI, portfolio-backtest harness (Phase 31), risk decomposition (Phase 32).

---

## 19. Implementation Slices

- **30.1 Foundation**: types + constraint model + error/provenance contracts + barrel; tests for validation matrix.
- **30.2 Core engines**: `ConstraintEngine` + `ConstrainedAllocator` (projection) + hand-fixture math tests.
- **30.3 Cost & decision**: `TurnoverCostEngine` + `RebalancingDecisionBuilder` + INFEASIBLE/edge tests.
- **30.4 Service integration** (+ optional persistence design): `RebalancingDataProvider` + `RebalancingDecisionService` + provider-failure tests; migration IDs reserved, files still not created until authorized.
- **30.5 Verification**: full regression + `tsc` + build + docs cross-check + GO gate for execution-adjacent work (which stays out).

Each slice: scope, dependencies, acceptance criteria, tests, risk, evidence. Slices 30.1–30.3 are pure (no I/O); 30.4 is the only impure slice; 30.5 is verification-only.

---

## 20. Acceptance Criteria (each observable + testable)

1. Given feasible constraints + complete inputs, engine returns weights summing to 1 (±1e-9), all within bands, deterministic across re-runs.
2. Given contradictory constraints, engine returns `INFEASIBLE` with the exact violated-constraint list and emits no weights.
3. Given missing factor coverage for a factor-constrained symbol, engine returns `INSUFFICIENT_DATA` (or constraint UNEVALUATED→INFEASIBLE) and does not impute.
4. Given zero turnover budget with off-target current weights, engine returns `INFEASIBLE` (not a zero-cost plan).
5. Given valid inputs, cost estimate equals hand-computed fee+tax+slippage lower bound on turnover notional (±rounding documented); lot-rounded steps reconcile to weights within stated tolerance.
6. Given invalid futures metadata (missing price/margin/pnl, expired), decision inherits P29 refusal (no valuation smuggled into weights).
7. Given provider throw, service returns fail-closed decision (`UNAVAILABLE`) with no fabricated series.
8. Strategy signals, where attached for reference, are summarized only — no direction mutated by optimization (HOLD/FLAT/BUY/SELL preserved).
9. Full regression (≥1620 tests baseline) stays green; `tsc` clean; vite+server build succeeds.
10. Ownership clean: new files ⊆ `rebalancing-decision` lane; no Learning/protected/shared/migration diffs in base slice.
