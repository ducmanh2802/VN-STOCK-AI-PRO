# PHASE 28 — PORTFOLIO INTELLIGENCE: DISCOVERY REPORT

**Date**: 2026-10-04
**Lane**: Core Backend (CodeGPT)
**Worktree**: `D:/Stock/VN-STOCK-AI-PRO` (branch `main`, ahead of origin by 2; expected
`agent/codegpt-phase28` / `D:\Stock\VN-STOCK-AI-PRO-codegpt` does not exist — using current
worktree per prompt fallback rule, no worktree switch performed)
**Status**: DISCOVERY COMPLETE — proceeding to architecture/implementation

---

## 1. Git / Worktree Verification

- `git rev-parse --show-toplevel` → `D:/Stock/VN-STOCK-AI-PRO`
- Branch: `main` (expected `agent/codegpt-phase28` absent — no switch, work in place)
- `git worktree list` → single worktree only. No OpenCode worktree present on disk.
- `git status`: `main...origin/main [ahead 2]`, ~51 modified + ~20 untracked files.
  Modified scope = Phase 24–27 hardening (earnings, strategy, capital-cycle, macro-regime,
  UI shell). Untracked scope includes OpenCode Learning lane:
  `src/lib/learning/**`, `src/services/learning/**`, `src/components/learning/**`,
  `src/pages/Learning*.tsx`, `src/pages/PracticeLabPage.tsx`, `src/schemas/learningSchema.ts`,
  `docs/LEARNING_*`, `docs/OPEN_CODE_*`, `docs/prompts/`. **These are NOT touched.**
- Git safety: no reset/clean/restore/checkout/force-push will be used.

## 2. Phase 24–27 Dependency Audit (verified by reading code, not filenames)

| Phase | Domain | Verdict |
|---|---|---|
| 24 Earnings & Financial Statements | `src/lib/earnings/*`, `src/services/earnings/*`, `drizzle/0000_phase24_earnings.sql` | PRESENT, usable as context only |
| 25 Strategy Factory | `src/lib/strategy/*` (`AssetClass EQUITY/DERIVATIVE/ETF/CROSS_ASSET`, fail-closed signals, `asOfDate` explicit) | PRESENT, multi-asset signal contract reused read-only |
| 26 Industry Capital Cycle & Policy | `src/lib/capital-cycle/*`, `drizzle/0001_phase26_capital_cycle.sql` | PRESENT, context only |
| 27 Macro Regime & Economic Cycle | `src/lib/macro-regime/*`, `src/services/macro-regime/*`, `drizzle/0002_phase27_macro.sql` | PRESENT (as-built code labels macro-regime as Phase 27; capability-matrix reconciliation note confirms matrix-scope Portfolio Intelligence remains unimplemented — no substitution assumed) |
| 20 Capability Matrix | `docs/PHASE_20_CAPABILITY_MATRIX.md` | Confirms Portfolio `PARTIAL` (beta/vol/drawdown/sector-limit/position-cap DONE; correlation matrix, factor-aggregate, Markowitz/Black-Litterman MISSING) |

No certified Phase 24–27 file needs rewriting for Phase 28. Integration is read-only.

## 3. Portfolio Architecture Audit (actual implementation read)

- `src/lib/trading/risk/PortfolioRiskMetrics.ts` (500 lines, pure, deterministic, fail-closed):
  exposure, concentration (max-position only), cash utilization, daily loss, drawdown
  (needs equity history), historical VaR (needs `historicalReturns`, min 30 samples),
  stress loss (needs shock map), risk-approved capital. Empty equity exposure → genuine
  zero risk, NOT missing data. Missing inputs → `null` + `INSUFFICIENT_DATA`/`DATA_UNAVAILABLE`.
- `src/lib/trading/risk/RiskGuard.ts` / `RiskManager.ts` / `PositionSizer.ts` /
  `TradeCapitalAllocation.ts`: max 20% single position, 80% portfolio exposure, lot rule.
  **Protected — no modification planned.**
- `src/lib/trading/paper/*`, `execution/*`, `integrity/*`, `replay/*`: accounting + guards.
  **Protected — no modification planned.**
- `src/lib/portfolio/**`, `src/services/portfolio/**`, `src/lib/quant/**`,
  `src/lib/multi-asset/**`, `tests/portfolio/**`: **DO NOT EXIST** (glob confirmed).
  This is the Phase 28/29 implementation surface — no collision.
- `src/pages/PortfolioPage.tsx`, `RiskCenterPage.tsx`: thin UI shells only; no computation
  changes planned in this lane.

### Gaps confirmed (nothing inferred)

1. No sector exposure / asset-class exposure aggregation.
2. No top-N concentration, no sector-concentration enforcement, no HHI.
3. No N×N covariance / correlation matrix engine (only weighted VaR approximation).
4. No portfolio beta vs benchmark, no tracking error, no benchmark comparison.
5. No portfolio-level factor-exposure aggregation (single-stock scores only).
6. No allocation optimizer (only Kelly fraction / vol-parity sizing in `TradeCapitalAllocation`).
7. No scenario / stress-testing engine beyond fixed shock multiplication.
8. No multi-asset position abstraction (equity vs ETF vs derivative vs cash semantics).

## 4. Data Availability Audit

- Equity history: `KbsHistoricalProvider.getDailyHistory` (KBS `data_day`, `DD-MM-YYYY`
  query, error envelope `st:err` surfaced as `KbsApiError`, empty array = genuine no-data,
  never fabricated). Known limitation: vendor range-exceeded error on long lookbacks;
  provider failure must surface as `UNAVAILABLE`, never as empty series.
- Universe: `VIETNAM_STOCKS_UNIVERSE` static list (~80 symbols) + `SECTOR_MAP` (16 sectors).
  **Survivorship limitation**: no historical constituents; documented, never fabricated.
- ETF: `VietnamEtfRegistry` (10 HOSE ETFs), NAV/premium/tracking/holdings engines present;
  ETF historical bars contract exists (`EtfHistoricalBarsResult`) — availability depends on
  provider wiring, treated as optional with fail-closed fallback.
- Derivatives: `VietnamDerivativesRegistry` + `ExpiryCalendarEngine` + `BasisEngine` +
  `OpenInterestEngine` + `TermStructureEngine` + `ContinuousFuturesEngine`. Conventions:
  multiplier 100,000 VND/pt, tick 0.1, HNX, cash settlement, 3rd-Thursday expiry.
  Historical availability = continuous-futures series when supplied; otherwise `UNAVAILABLE`.
- Benchmark returns (VN-INDEX/VN30): consumed as explicit input series; never synthesized.
- Factor scores: consumed as explicit per-symbol input; never invented.

## 5. Migration Audit

- `drizzle/0000_phase24_earnings.sql`, `0001_phase26_capital_cycle.sql`,
  `0002_phase27_macro.sql` exist. No portfolio migration exists.
- Decision: **NO new migration for Phase 28.** Portfolio Intelligence is a deterministic
  compute layer over (broker account + validated market inputs). No new table required;
  avoids migration-number collision with parallel Learning lane. Revisit only if a genuine
  persistence requirement emerges in Phase 29 (still prefer provider abstraction).

## 6. Ownership Audit

- Owned (new, isolated): `src/lib/portfolio/**`, `src/services/portfolio/**`,
  `tests` under same, `docs/PHASE_28_*`.
- Protected, read-only: `RiskGuard`, `TradingEngine`, `RiskManager`, `PositionSizer`,
  `MarketDataIntegrityGuard`, `TradingDataValidator`, `FinancialConservation`,
  `services/market/providers/**`, Phase 21 derivatives conventions, `package.json`,
  `server.ts`, drizzle migrations, routing, auth.
- Learning-owned (never touch): `src/lib/learning/**`, `src/services/learning/**`,
  `tests/learning/**`, `docs/learning/**`, `src/components/learning/**`,
  Learning pages, schemas, AI Tutor, Practice Lab.

## 7. Phase 28 Acceptance Criteria (binding)

1. Pure engines: explicit `asOfDate`, deterministic, no `Date.now()`/`Math.random()` in
   math paths, no hidden I/O, no UI dependency.
2. Fail-closed: missing/invalid/stale inputs → `null` + `UNAVAILABLE`/`STALE`/`INVALID`
   /`INSUFFICIENT_DATA`; never `0`, never synthetic series, never silent `[]`.
3. Concentration: max-position (20%), sector (30%), top-3/top-5, asset-class, HHI with
   deterministic enforcement verdicts matching RiskGuard-compatible defaults.
4. Correlation/covariance: full N×N engines with pairwise-complete observations, minimum
   sample guard, zero-variance → `null` correlation (not 0), documented windows.
5. Beta / tracking: portfolio beta vs explicit benchmark series; insufficient overlap →
   fail-closed.
6. Factor exposure: value-weighted aggregation over explicit per-symbol factor vectors;
   missing coverage → partial status with coverage ratio, never imputed.
7. Allocation: equal-weight / inverse-volatility / min-variance (closed-form, ridge-guarded)
   / Black-Litterman-blended (views-optional, fully documented); weights sum to 1,
   non-negative (long-only), lot-size rounding reported separately from pure weights.
8. Diagnostics snapshot: single orchestrated snapshot with lineage
   (`sources/engine/calculationVersion/asOfDate`), warnings, limitations incl.
   survivorship + KBS lookback + ETF/derivatives history caveats.
9. Tests: unit + edge (empty/single/concentrated/correlated/missing/stale/invalid) +
   determinism (fixed seed regression) + typecheck + build + lint + existing regression.
10. No Learning files, no protected-system edits, no migration, no fabricated data.

## 8. Risks / Known Limitations (carried into certification)

- KBS long-lookback range errors; ETF/derivatives history may be short or absent.
- Static universe → survivorship bias for historical research; flagged on every snapshot.
- Factor inputs depend on upstream single-stock engines; uncovered symbols reduce coverage.
- Min-variance with near-singular covariance uses ridge guard; flagged, never hidden.
