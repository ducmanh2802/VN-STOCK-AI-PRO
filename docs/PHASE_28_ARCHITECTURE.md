# PHASE 28 — PORTFOLIO INTELLIGENCE: ARCHITECTURE & ACCEPTANCE

**Version**: `v1.0.0-phase28` | **Date**: 2026-10-04 | **Lane**: Core Backend

## 1. Design Principles

- Pure financial math in `src/lib/portfolio/**` (no I/O, no clock, explicit `asOfDate`).
- Orchestration + provider failure mapping in `src/services/portfolio/**`.
- Reuse, never rewrite: `PortfolioRiskMetrics` (exposure/VaR/drawdown/stress) stays
  authoritative; Phase 28 complements it (sector/asset-class/correlation/covariance/
  beta/factor/allocation/benchmark/scenario). No protected-system edits.
- Fail-closed vocabulary (PR-01 compatible):
  `CURRENT | STALE | UNAVAILABLE | INVALID` for freshness;
  `INSUFFICIENT_DATA` for sub-sample guards. `null` = unavailable, never zero.

## 2. Module Map (new files only)

```text
src/lib/portfolio/types.ts                          canonical contracts + lineage
src/lib/portfolio/PortfolioExposureEngine.ts        weights, sector/asset-class exposure, allocation drift
src/lib/portfolio/ConcentrationEngine.ts            max/top-N/sector/HHI + limit enforcement (20/30 defaults)
src/lib/portfolio/CovarianceEngine.ts               returns validation, covariance/correlation N×N,
                                                    portfolio volatility, beta/tracking vs benchmark
src/lib/portfolio/FactorExposureEngine.ts           value-weighted factor aggregation + coverage
src/lib/portfolio/AllocationEngine.ts               equal/inverse-vol/min-variance (ridge)/Black-Litterman-lite
src/lib/portfolio/PortfolioDiagnosticsEngine.ts     benchmark comparison, scenario shocks, diagnostics verdicts
src/lib/portfolio/PortfolioIntelligenceSnapshotBuilder.ts  pure orchestrator → PortfolioIntelligenceSnapshot
src/lib/portfolio/index.ts                          barrel
src/services/portfolio/PortfolioDataProvider.ts     abstract provider (returns/sector/factors/benchmark/quotes)
src/services/portfolio/PortfolioIntelligenceService.ts   async orchestration, freshness mapping, fail-closed
src/lib/portfolio/__tests__/PortfolioEngines.test.ts
src/lib/portfolio/__tests__/PortfolioFailClosed.test.ts
```

No migration. No shared-file edits. No Learning-namespace contact. Stable interface for a
future Learning consumer (`PortfolioIntelligenceSnapshot` is serializable; no Learning
import is made from this lane).

## 3. Data Flow

```text
BrokerAccount / positions (qty, price, sectorId, assetClass)
 + historicalReturns {symbol: number[]} (validated, decimals)
 + benchmarkReturns {series} (explicit VN-INDEX/VN30)
 + factorScores {symbol: {value,quality,momentum,growth,size,lowVol}}
 + policy limits + scenario shocks + asOfDate
   → pure engines (deterministic)
   → PortfolioIntelligenceSnapshot {exposure, concentration, covarianceMeta,
      correlation, volatility, beta, factorExposure, allocation, benchmark,
      scenarios, diagnostics, lineage, warnings, limitations}
```

Provider errors → `UNAVAILABLE`; quote staleness → `STALE`; schema violations → `INVALID`;
short series → `INSUFFICIENT_DATA`. Empty portfolio (no equity exposure) → genuine zeros
with `OK`, consistent with `PortfolioRiskMetrics` semantics.

## 4. Key Formulas (documented on every metric)

- Weight: `w_i = mv_i / Σmv` (mv = qty × markPrice; cash tracked separately).
- Sector/asset-class exposure: `Σ w_i` over members; HHI: `Σ w_i² × 10000`.
- Sample covariance: `cov = Σ(r_i−μ_i)(r_j−μ_j)/(n−1)` on pairwise-complete aligned tails;
  correlation `ρ = cov/(σ_i σ_j)`; zero-variance → `null` (not 0).
- Portfolio vol (annualized): `σ_p = sqrt(wᵀΣw) × sqrt(252)`.
- Beta: `cov(r_p, r_b)/var(r_b)` on overlapping tail; |var|≈0 → fail-closed.
- Historical VaR: delegated to existing `PortfolioRiskMetrics` (no fork).
- Factor exposure: `f_k = Σ w_i × f_{i,k}` over covered weight; coverage = covered/total.
- Allocations: equal `1/N`; inverse-vol ` (1/σ_i)/Σ(1/σ_j)` (σ from diagonal, fallback equal);
  min-variance `Σ⁻¹1 / 1ᵀΣ⁻¹1` with ridge `λ=1e-6` fallback to inverse-vol, flagged;
  Black-Litterman-lite: `w_bl = (1−τ)w_ref + τ w_view` with `τ∈[0,1]` (default ref = inverse-vol).
- Scenario loss: `mv × shockRate` per named scenario; worst reported.

## 5. Acceptance Checklist (must all pass for CERTIFIED)

- [ ] All pure engines accept explicit `asOfDate`, deterministic re-run identical.
- [ ] Empty / single / multi / zero-weight / concentrated / correlated fixtures correct.
- [ ] Missing / stale / invalid / short-series fixtures fail closed with documented status.
- [ ] Concentration limits enforced deterministically (20% position, 30% sector defaults,
      configurable; top-N + HHI reported).
- [ ] Correlation/covariance/beta/tracking verified against hand-computed fixtures.
- [ ] Factor aggregation coverage math verified; no imputation.
- [ ] Allocation weights sum to 1 (±1e-9), non-negative, documented fallbacks.
- [ ] Snapshot carries lineage + warnings + survivorship/KBS/ETF-derivatives limitations.
- [ ] `npm run typecheck`, `npm run build` (vite), `vitest run portfolio` green;
      full-suite regression shows no new failures vs baseline.
- [ ] Ownership: changed files ⊆ portfolio lane; no Learning/protected/shared diffs.
