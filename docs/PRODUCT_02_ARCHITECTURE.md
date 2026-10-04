# PRODUCT-02 — SCENARIO / WHAT-IF: ARCHITECTURE & DESIGN
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Scope
Exploratory "what if I did X?" analysis that MUST NOT touch real portfolio state and MUST NOT
invent causal models. Output is a labeled assumption ledger, never a forecast.

## Architecture
```text
PortfolioPage (existing)  →  ScenarioService (thin)
  → ScenarioEngine (pure, deterministic, versioned)
    → PortfolioExposureEngine / ConcentrationEngine / PortfolioDiagnosticsEngine (certified, reused)
```
- No I/O, no clock, no randomness. `SCENARIO_VERSION` stamped on every result.
- Inputs: `baseline: readonly PortfolioPositionInput[]` + `assumptions[]` + `asOfDate`.
- Assumptions are explicit user inputs: `PRICE_SHOCK`, `ALLOCATION_DELTA`, `CASH_MOVE`, `MACRO_NOTE`.

## Honesty rules (enforced, tested)
1. Baseline copied in via JSON deep copy → caller array provably unmutated.
2. `PRICE_SHOCK` on a symbol with no mark price is SKIPPED with `NOT_AVAILABLE`; no imputation.
3. `MACRO_NOTE` is recorded as an assumption and produces **zero** transmission math — there is no
   certified macro→return mapping in the system, so none is invented.
4. Every derived value carries provenance: `CALCULATED` | `USER_ASSUMPTION` | `NOT_AVAILABLE`.
5. `ALLOCATION_DELTA` must be an integer quantity; negative resulting quantity, negative price, and
   non-finite shocks throw (`SCENARIO_*`) — fail-closed, never coerced.
6. Fractional-lot results (equity not multiple of 100) WARN but are preserved exactly — no silent reshape.

## Reuse vs duplication
No new concentration/covariance/allocation math. Portfolio math is delegated to the certified Phase-28
engines; this module only composes hypothetical position sets and diffs snapshots.

## Known limitations
Single-scenario shocks (no correlation-aware multi-factor solver beyond the certified shock table);
FX/historical replay deferred; no persistence layer (results are view-state only, by design).