# PHASE 30 — DISCOVERY REPORT

**Phase**: PHASE-30 Discovery & Architecture Audit (READ-ONLY — NO implementation)
**Date**: 2026-10-04 | **Lane**: Core Backend (CodeGPT) | **Branch**: `main` | **HEAD**: `c00dced`
**Predecessors**: `e67a656 feat(portfolio): integrate phase 28 portfolio intelligence` + `c00dced feat(multi-asset): integrate phase 29 multi-asset quant`
**Status**: DISCOVERY COMPLETE — implementation NOT STARTED

> Scope: DISCOVERY + ARCHITECTURE AUDIT + GAP ANALYSIS + SCOPE DEFINITION + ACCEPTANCE CRITERIA + GO/NO-GO.
> No Phase 30 production code, no migrations, no engine modifications, no Learning/Phase-27 edits in this task.

---

## 1. Executive Summary

After Phase 24 → Phase 29, VN-STOCK-AI-PRO can **describe** what a multi-asset portfolio *is* (Phase 28 analytics + Phase 29 valuation/aggregation) and can **simulate** single-symbol histories (dual backtest stacks), but it cannot answer the one question every investor actually asks:

> **"What should I change, under my real constraints, at what cost — or is my target infeasible?"**

- Phase 28 emits **unconstrained** allocations (`AllocationEngine`: equal / inverse-vol / min-variance-ridge / BL-lite-blend) with documented fallbacks but **no constraint enforcement** and **no `INFEASIBLE` outcome**.
- Phase 29 emits **cost-blind** rebalance hints (`MultiAssetPortfolioEngine.rebalance`: lot-100 / contract-truncation value deltas) with **no fee/tax/slippage, no turnover metric, no turnover cap**.
- Verified by grep: `turnover|INFEASIBLE|transaction` = **zero hits** in `src/lib/portfolio/**`; only one comment hit (`cost/share` doc) in `src/lib/multi-asset/types.ts:33`. No cost engine, no turnover engine, no constraint solver exists anywhere in the 28/29 surface.
- All inputs required for that decision layer **already exist**: canonical cost truth (`DEFAULT_TRADING_COST_CONFIG` 0.15%/0.15%/0.10%/0.10% in `src/lib/trading/types/trading.ts`), lot rule (`VietnamLotRule`, lot 100), futures economics (multiplier 100,000 / tick 0.1 / expiry-required in `src/lib/multi-asset/`), margin/leverage aggregation (Phase 29), covariance/vol/beta/factor/allocation (Phase 28), and the full safety stack (RiskGuard / RiskManager / PositionSizer / IntegrityGuard / Validator / conservation / paper ledger).
- No new vendor, no new infrastructure, no mandatory persistence is required.

**Recommended Phase 30**: **(A) Constraint-aware, cost-aware rebalancing & optimization decision layer** (`rebalancing-decision`) — pure engines that project reference targets onto a feasible set, reason about turnover vs. cost, return `INFEASIBLE` with violated-constraint reasons on contradiction, and emit a reproducible, auditable, recommend-only decision. It **reuses/extends** Phase 28/29, never duplicates them.

**GO / NO-GO**: **READY WITH BLOCKERS** — architecture clear, data exists, acceptance testable. Blockers are *hygiene*, not Phase-30-internal: (1) Phase 28/29 selective-commit hygiene (never blanket-commit Learning/unrelated files), (2) carried missing-expiry ACCEPT-or-FIX decision from the 28–29 audit. No Phase 30 data or dependency blocker.

**Phase 31 candidate**: Portfolio-level historical backtesting & decision review (multi-position portfolio backtest with costs, corporate-action-adjusted path, turnover accounting, walk-forward/OOS at portfolio level).
**Phase 32 candidate**: Risk decomposition & attribution (marginal/component VaR, factor contribution, active-risk decomposition, expanded stress library) — gated on factor-history availability proof.

---

## 2. Repository Baseline

| Item | Evidence (2026-10-04) |
|---|---|
| Branch / HEAD | `main`, HEAD `c00dced feat(multi-asset): integrate phase 29 multi-asset quant`; parent `e67a656 feat(portfolio): integrate phase 28 portfolio intelligence`; base `ddf5560 refactor(ui): rebuild presentation as a dense quant terminal` |
| matches prompt claim | YES — both verified commits from the Phase 30 mission exist in `git log --oneline -15` |
| Working tree | DIRTY (expected): ~52 modified (Phase 24–27 hardening: earnings, strategy, capital-cycle, macro-regime, UI shell) + ~36 untracked (Learning lane `src/lib/learning/**`, `src/services/learning/**`, `src/components/learning/**`, Learning pages/schemas, `docs/LEARNING_*`, `docs/OPEN_CODE_*`, `drizzle/0002_phase27_macro.sql`, `CODEGPT_PHASE30_*` prompts). Full list in `git status --short` |
| `git diff --stat` scope | `src/lib/earnings/*`, `src/lib/strategy/*`, `src/lib/capital-cycle/*`, `src/lib/macro-regime/*`, `src/services/earnings/*`, `src/services/macro-regime/*`, `src/services/macro/*`, `src/services/strategy/*`, `src/pages/*`, `src/App.tsx`, `src/components/common/Sidebar.tsx` — none belong to Phase 30; **untouched by this audit** |
| Phase 28/29 files | PRESENT in worktree, lane-certified: `src/lib/portfolio/` (8 engines + types + barrel + 2 test files), `src/services/portfolio/` (2 files), `src/lib/multi-asset/` (3 engines + types + barrel + 2 test files), `src/services/multi-asset/` (1 file). `git ls-files` shows them committed via `e67a656`/`c00dced` (unlike the pre-integration `ddf5560`-only state described in older notes) |
| Drizzle | `drizzle/0000_phase24_earnings.sql`, `0001_phase26_capital_cycle.sql`, `0002_phase27_macro.sql` (untracked). No portfolio/multi-asset/rebalancing migration exists — correct, none required |
| Typecheck / tests / build | Claimed PASS in mission baseline. Lane evidence: Phase 29 cert records `vitest 1620/1620 (156 files)`, `tsc --noEmit` clean, `npm run build` success. This discovery task does **not** re-run the full suite (read-only audit); regression re-verification is a Phase 30 slice-30.5 gate |
| Policy compliance | No `git add ./-A`, no reset/clean/restore/stash, no commit, no production-code edits. Only the two Phase 30 audit documents are written |

---

## 3. Phase 24 → 29 Capability Map

Classification: `IMPLEMENTED` / `PARTIAL` / `MISSING` / `DUPLICATED` / `BLOCKED` / `DEFERRED`.

### 3.1 Intelligence phases

| Phase | Domain | Key paths | Verdict |
|---|---|---|---|
| 24 | Earnings & Financial Statements | `src/lib/earnings/*` (Income/Balance/CashFlow/Eps/Growth/Margin/Quality/Restatement/Calendar/SnapshotBuilder, `ENGINE 24.0.0-PROD`), `src/services/earnings/*`, `drizzle/0000_phase24_earnings.sql`, `financial_facts_v2` + `earnings_calendar` tables | IMPLEMENTED (audited fundamentals, TTM with `publicationDate<=asOfDate`, EPS corporate-action-adjusted via Phase 23 bridge; unparseable periods skipped, never synthesized) |
| 25 | Strategy Factory | `src/lib/strategy/*` (`AssetClass` EQUITY/DERIVATIVE/ETF/CROSS_ASSET, `SignalDirection` LONG/SHORT/FLAT/HOLD/CLOSE/REBALANCE, conviction 0–100, `StrategyFactory` 5 canonical strategies, `UniversalSignalNormalizer` fail-closed HOLD/FLAT, `asOfDate`+lineage per signal) | IMPLEMENTED (signal contract reused read-only by Phase 29 quant snapshot; HOLD/FLAT never upgraded by analytics) |
| 26 | Industry Capital Cycle & Policy | `src/lib/capital-cycle/*`, `CapitalCycleRepository` (read-only) + `policy_events/strategic_projects/project_beneficiaries/legal_governance_events` tables, `drizzle/0001_phase26_capital_cycle.sql` | IMPLEMENTED (evidence-tiered beneficiaries, `publicationDate<=asOfDate`, TIER_4 excluded; context only, never direct BUY signals) |
| 27 | Macro Regime & Economic Cycle | `src/lib/macro-regime/*` (Normalizer/Classifier/Orchestrator), `src/services/macro-regime/*` (Service + DataProvider), `MacroRepository`, `macro_observations` + `macro_regime_snapshots` tables, `drizzle/0002_phase27_macro.sql` | IMPLEMENTED (5 sub-states + 7-state regime, coverage FULL→UNAVAILABLE, vintage triple-date, `AI never determines the regime` invariant in `macro-regime/types.ts:14`) |
| 28 | Portfolio Intelligence | `src/lib/portfolio/*`, `src/services/portfolio/*`, `docs/PHASE_28_*` | IMPLEMENTED (lane-certified 19 tests; §7). No persistence by design; no API consumer yet (§12) |
| 29 | Multi-Asset Quant | `src/lib/multi-asset/*`, `src/services/multi-asset/*`, `docs/PHASE_29_*` | IMPLEMENTED (lane-certified 11 tests + 1620 full; §8). Hints-only; margin/pnl caller-supplied; no cost/turnover |

### 3.2 Full capability matrix (at least the 20 mandated rows)

| Capability | Status | Evidence |
|---|---|---|
| Market Data (OHLCV/quote) | IMPLEMENTED | KBS `KbsHistoricalProvider.getDailyHistory` (`data_day`, `DD-MM-YYYY`, `KbsApiError` on `st:err`), VPS `VpsProvider` quote (kVND×1000→VND verified HPG 2026-09-06); TTLs quote 15s / history 60s / fundamentals 5min; `QUOTE_CROSSCHECK_TOLERANCE ±10%` advisory only |
| Data Quality | IMPLEMENTED | `MarketDataIntegrityGuard` (11 checks), `TradingDataValidator` (OHLC/volume/timestamp/ceiling-floor/session/deviation), `BacktestDataAdapter` fail-closed normalize; errors never cached |
| Fundamentals | IMPLEMENTED | VPS V1..V4 + `financial_statements/financial_ratios` via `FundamentalRepository`; legacy path hard-`0` for yield/growth/mcap (new provider returns `null`) |
| Earnings | IMPLEMENTED | Phase 24 (see §3.1); `AuthoritativeDocumentPipeline` SSC/HOSE/HNX/Issuer-IR, VAS Code21/Code36; `proposed≠paid` rejected |
| Valuation | IMPLEMENTED | `ValuationEngine` (DCF/Graham/P-E/P-B/EV-EBITDA/DDM) + `valuation_results` table; deterministic, AI never sources fair value |
| Macro Regime | IMPLEMENTED | Phase 27; `macro_observations` vintage-aware, 60s cache, best-effort persist CURRENT/STALE only |
| Industry Cycle | IMPLEMENTED | Phase 26; ANNOUNCED≠COMMITTED≠DISBURSED, OFFICIAL-only confirmed beneficiaries |
| Strategy Factory | IMPLEMENTED | Phase 25; 5 generators incl. `DividendCapture` (ex-date sensitive), `RegimeAdaptive`, basis/NAV arbitrage |
| Portfolio Intelligence | IMPLEMENTED | §7 — exposure/concentration/covariance/beta/factor/allocation/benchmark/scenario/snapshot |
| Multi-Asset | IMPLEMENTED | §8 — 4-class valuation, aggregation, quant snapshot; lot-100 / multiplier-100k / tick-0.1 / expiry-required preserved |
| Risk | IMPLEMENTED | `RiskGuard` / `RiskManager` (20% position, 80% exposure, 1%/trade, 3% daily-loss, 10 positions, RR≥2, 3% deviation, 120s staleness), `PortfolioRiskMetrics` (exposure/concentration/cash/daily-loss/drawdown/historical-VaR-P95-min30/stress/risk-approved-capital) |
| Position Sizing | IMPLEMENTED | `PositionSizer` (risk-budget/lot-rounddown/fee+slip-aware) + `TradeCapitalAllocation` (`min(cash, exposure-headroom, risk-approved-capital)`); protected, reuse-only |
| Paper Trading | IMPLEMENTED | `PaperBroker` (reservation anti-double-spend, VWAP avg, fee/tax/slip, emergency-stop), `PaperExecutionEngine` (Integrity→Validator→RiskGuard→Lot→cash/position→broker→ledger), `PaperTradeLedger` (11-field audit entry), `PaperReconciliationEngine`, `FinancialConservationValidator` (11 laws, `Math.round` VND) |
| Execution Boundary | IMPLEMENTED | `TradingEngine` (Validator→Recommendation→RiskManager→Allocation→Sizer→OrderManager→BrokerAdapter, per-symbol lock, no-short, lot≥100), `OrderManager`, `BrokerAdapter`, `OrderStateMachine` (NEW→VALIDATED→AUTHORIZED→SUBMITTED, terminal immutability) |
| Monitoring | PARTIAL | `PortfolioPage` (PaperBroker `/api/trading/portfolio|positions|status`, fail-closed `—`), `RiskCenterPage` (RiskGuard metrics + fixed shocks), `PaperPnL` (position/portfolio/realized), `EtfPerformanceEngine` (d1..y1/vol/MDD). No optimizer-aware monitoring, no RebalancingDecision view |
| Decision Support | PARTIAL | Recommendations/strategy signals + portfolio/risk analytics exist but are **disconnected**: no constrained proposal, no turnover/cost, no INFEASIBLE, no approval workflow. **This is the Phase 30 gap** |
| Backtesting | PARTIAL | §9 — dual engines strong on costs/slippage/look-ahead/walk-forward/OOS, but single-symbol long-only, no portfolio backtest, corporate-action path unwired, no turnover, benchmark only buy-and-hold-same-symbol |
| Scenario Analysis | PARTIAL | `PortfolioDiagnosticsEngine.scenarios` (`mv×shockRate` per named shock), `EtfPerformanceEngine`, `StrategyValidationEngine.runFrictionStressTest` (3 friction scenarios). No stress library, no historical scenarios |
| Stress Testing | PARTIAL | `PortfolioRiskMetrics.buildStress` (fixed shock multiplication) + P28 linear shocks only. No CVaR/ES, no factor-stress, no liquidity-stress |
| Research | PARTIAL | `StrategyValidationEngine` (chronological split 60/20/20, walk-forward 3×60/20/20, friction/param-sensitivity/regime/distribution/sample-size), `StatisticalValidator` (MonteCarlo 1000 seeded Mulberry32, bootstrap 1000, Sharpe/Sortino/Calmar, edge-consistency, profit-concentration, reality-check), `CrossGeneralizationValidator` (asset×period×regime matrix, min-trades 30/50/100), `AcceptanceGate 17.10.0` (QG-01..QG-10, fingerprint `FPR_sha256`). Portfolio-level research MISSING |
| Learning | IMPLEMENTED (other lane) | `src/lib/learning/**`, `src/services/learning/**`, Learning pages/schemas — **explicitly out of scope, never touched** |
| Audit / Provenance | PARTIAL | Snapshot lineage (`sources/engine/calculationVersion/asOfDate`) on earnings/macro/capital-cycle/ETF/derivatives/strategy/portfolio/multi-asset; `snapshotId`, `inputHash` pattern (strategy `FNV-1a`), `PaperTradeLedger` audit entries, `ReplayValidator` sha256 tamper check. No optimization-run persistence yet (§13); services stamp wall-clock `evaluatedAt` (reproducibility caveat §11) |

Overlap / duplication check: **no DUPLICATED financial engines**. `trading/backtest/BacktestEngine` (618L, RiskManager-integrated, next-open, lot-100, warmup-25) vs `analysis/backtest/BacktestEngine` (research stack + `TradeSimulator` + `LookAheadGuard` + acceptance/statistical/generalization validators) are **intentionally dual** (execution-simulation vs strategy-research) — complement, do not consolidate in Phase 30. `PortfolioRiskMetrics` (exposure/VaR/drawdown/stress) vs Phase 28 (sector/class/correlation/beta/factor/allocation/benchmark/scenario) are **complementary by design** (certified: complement, not fork). No conflicting metric definitions found.

---

## 4. Current Architecture

Engine families under `src/lib/` (services mirror under `src/services/`, persistence under `src/lib/db/` + `src/db/schema.ts`):

```text
trading/{risk,engine,validation,paper,replay,backtest,snapshot,api}  execution/safety/history
portfolio/ + multi-asset/                                            analytics (P28/P29, pure)
analysis/backtest/                                                   research (strategies, TradeSimulator,
                                                                     LookAheadGuard, PerformanceMetrics,
                                                                     HistoricalSignalVerifier, validation/*)
strategy/                                                            signals (Factory, Normalizer, ContextAggregator,
                                                                     5 generators)
derivatives/ + etf/ + corporate-actions/                             asset semantics + adjustment
                                                                     P_ex=(P_prev-C+I·P_issue)/(1+S+B+I)
earnings/ + capital-cycle/ + macro-regime/ + analysis/macro/ + macro/ fundamental/context inputs
indicators/                                                          technicals (SMA/EMA/RSI/MACD/BB/vol)
```

Cross-cutting: providers real (VPS quote, KBS history, VPS derivatives/ETF, DB macro-regime, DB price cache) vs interface-only (portfolio/multi-asset market inputs, `market/MarketDataProvider` barrel); `marketDataCache` in-memory only; no `Math.random` in math paths (only deprecated `stockHistory.ts:39-58` LCG marked FORBIDDEN, ID-only randoms, seeded validation RNG `SeededRandom` Mulberry32); AI explains only (§15).

Purity boundary holds: `src/lib/portfolio` + `src/lib/multi-asset` contain **zero** `Date.now`/`Math.random`/fetch/fs (verified by grep; only `*.test.ts` fixtures and the two *services* use wall-clock `evaluatedAt=new Date().toISOString()`). `asOfDate` is explicit on snapshot inputs and threaded to `snapshotId`/`provenance`/`dataLineage` (`portfolio-{asOfDate}-{n}`, `quant-{asOfDate}-{n}`).

---

## 5. Investment Decision Chain Audit

Conceptual chain with per-edge verdict (`EXISTS` / `PARTIAL` / `MISSING`):

```text
REAL DATA ──EXISTS──→ DATA VALIDATION ──EXISTS──→ MACRO REGIME ──EXISTS──→ INDUSTRY REGIME
  ──EXISTS──→ FUNDAMENTAL ──EXISTS──→ VALUATION ──EXISTS──→ STRATEGY ──EXISTS──→ PORTFOLIO
  ──EXISTS──→ RISK ──EXISTS──→ POSITION SIZE ──PARTIAL──→ DECISION ──MISSING──→ PAPER EXECUTION
  ──EXISTS──→ MONITORING ──PARTIAL──→ DECISION REVIEW ──MISSING──→ (loop back)
```

| Edge | Verdict | Evidence |
|---|---|---|
| Real data → validation | EXISTS | KBS/VPS → `MarketDataIntegrityGuard` (11 checks) + `TradingDataValidator` (RR≥2, confidence, OHLC, volume, ceiling/floor, session, deviation ≤3%, staleness ≤120s) |
| Validation → macro | EXISTS | `MacroRegimeService` vintage-gated (`publicationDate<=asOfDate`), coverage FULL→UNAVAILABLE |
| Macro → industry | EXISTS | Both context snapshots carry `asOfDate`+lineage; `StrategyContextAggregator` assembles joint `StrategyContext` |
| Industry → fundamental | EXISTS | `CapitalCycleRepository.getTtmRevenue` bridge to `financial_facts_v2`; earnings TTM prefers direct `TTM-*` else 4-quarter sum |
| Fundamental → valuation | EXISTS | `FundamentalScoreEngine`/`FinancialHealthEngine` → `ValuationEngine`; `valuation_results` persisted per model |
| Valuation → strategy | EXISTS | `StrategyContext` carries valuation + earnings + macro + derivatives/ETF/corporate-action snapshots into 5 generators |
| Strategy → portfolio | EXISTS | Phase 29 quant snapshot rolls up strategy signals (counts by direction, mean conviction, HOLD/FLAT dominance preserved — engine never upgrades HOLD/FLAT) + Phase 28 reference link for equity/ETF slice |
| Portfolio → risk | EXISTS | Phase 28 snapshot (exposure/concentration/vol/beta/factor/allocation/benchmark/scenario) + `PortfolioRiskMetrics` (VaR/drawdown/stress) feed `RiskGuard`/`RiskManager` limits |
| Risk → position size | EXISTS | `PositionSizer` + `TradeCapitalAllocation`; RiskGuard-compatible defaults (20% position / 30% sector) mirrored in `DEFAULT_PORTFOLIO_POLICY` |
| Position size → **decision** | PARTIAL | Lot/contract-rounded **hints** exist (`rebalance()` deltas, lot-100 truncation, contract truncation) but **no constrained target, no cost estimate, no turnover, no INFEASIBLE**. The edge computes numbers that are not yet decisions |
| Decision → paper execution | MISSING | No decision object exists to execute; execution stack (`TradingEngine`→`PaperExecutionEngine`→`PaperBroker`→`Ledger`) is production-ready but has no optimizer input. Phase 30 must remain **recommend-only** (no auto-execution) |
| Paper execution → monitoring | EXISTS | `/api/trading/portfolio|positions|status` → `PortfolioPage`/`RiskCenterPage`/`PaperTradingPage`; `PaperPnL`; ledger queryable by symbol/status/snapshot/recommendation |
| Monitoring → decision review | PARTIAL | `PaperReconciliationEngine` (RECONCILED/MISMATCH/INVALID), `ReplayValidator` (hash-verified determinism), `BacktestMetrics`/`PerformanceMetrics` (return/CAGR/win-rate/profit-factor/MDD/Sharpe/Sortino). Portfolio-level review MISSING |
| Review → next decision | MISSING | No closed loop: no optimization-run record, no versioned proposal history, no approve/relax-constraints workflow |

**The single most important Phase 30 question is answered**: the chain is complete and production-grade *except* the **POSITION-SIZE → DECISION → (PAPER) EXECUTION → REVIEW** link. Phase 30 closes exactly that link on the decision side (recommend-only), without touching execution.

---

## 6. Data Audit

All Phase 30 decision inputs resolve to **REAL** providers or explicit caller inputs — no new vendor needed.

| Dataset | Source / provider | Depth / freshness | Adjustment / provenance | Quality / failure |
|---|---|---|---|---|
| OHLCV (equity) | KBS `KbsHistoricalProvider` (`data_day`, `DD-MM-YYYY`) | Effective ≤355d (`KBS_MAX_LOOKBACK_DAYS=355`; vendor `4000014 range-exceeded` beyond); UI windows up to 1300d but capped; `HISTORY_TTL 60s` | Raw preserved; adjustment is separate Phase 23 layer (`AdjustedPriceBar`, `K=P_ex/P_prev`); KBS↔VPS ±10% cross-check advisory only | `validateRawBar` skips bad rows; empty = `DATA_UNAVAILABLE`, never synthesized |
| Quote + fundamentals | VPS `VpsProvider` (`getliststockdata`/`getliststockbaseinfo`) | Quote 15s, fundamentals 5min | kVND×1000→VND (except `closePrice` already VND); lots×10→shares; `fetchedAt` vs `sourceTimestamp` distinct | `VpsApiError` (INVALID_SYMBOL/NETWORK/TIMEOUT/MALFORMED/NO_DATA); new provider `null`-fills, never `0`-fills |
| Benchmark (VN-INDEX/VN30) | KBS + `realMarketDataService` cross-check | 45d cross-check window; consumed as explicit input series | Never synthesized; benchmark returns caller-supplied in P28/P29 | Missing → `DATA_UNAVAILABLE`, insufficient overlap → fail-closed beta/tracking `null` |
| Earnings/fundamentals (audited) | `EarningsDataProvider` ← `AuthoritativeDocumentPipeline` (SSC/HOSE/HNX/Issuer-IR) | `financial_facts_v2` unique `(symbol,statementType,reportType,periodId,metric,source,reportId,publicationDate)`; TTM direct-or-4Q | VAS Code21/Code36; EPS adjusted via `CorporateActionEntitlementEngine.parseRatio`; `publicationDate<=asOfDate` | Unparseable → skip+issue; `null`=unavailable; calendar `reportDate null=UNKNOWN` |
| Corporate actions | In-memory registry + `CorporateAction*Engine` (Date/Entitlement/Adjustment/SnapshotBuilder) + `VietnamCorporateActionsRegistry`; no drizzle table | `STATUTORY_VIETNAM_HOLIDAYS 2024-27`; ex-date = 1 trading day before record (T+2) | Exact non-destructive `adjustPriceSeries` (`K_tau=Πk`, `P_adj=P_raw·K`, `V_adj=round(V_raw/K)`); needs caller actions; no live VSDC feed | Missing actions → unadjusted path (documented limitation, §10) |
| Macro | Persisted `macro_observations` only (`MacroRegimeDataProvider`); no crawler | Vintage triple-date; `publicationCutoffDate==asOfDate`; 60s cache | Tiers T1-statutory/T2-exchange/T3-secondary (T4 excluded); `revisionVersion`; validation VALID/PROVISIONAL/SUSPECT/INVALID | Empty/unreachable → `UNKNOWN/UNAVAILABLE`; best-effort persist CURRENT/STALE only |
| Industry / capital-cycle | Persisted `policy_events/strategic_projects/project_beneficiaries/legal_governance_events` + `financial_facts_v2` bridge; `CapitalCycleRepository` read-only | `lte(publicationDate,asOfDate)` desc reads | 7 policy types / 8 statuses / 7 capital stages / 11 project cats / 12 project statuses / 11 beneficiary roles × 7 evidence tiers (OFFICIAL-only confirmed) | TIER_4 excluded; unconfirmed never promoted |
| ETF | `EtfDataProvider` (VPS quote + KBS bars); no table | Same KBS cap; quote 15s | NAV (OFFICIAL_EOD) vs iNAV (INTRADAY basket+cash) never substituted; premium PAR band ±0.2%, STALE if intraday delta >5min; holdings Σ=100% | Any null price / empty basket / `creationUnit≤0` → `DATA_UNAVAILABLE` |
| Futures | `DerivativesDataProvider` (VPS points, NOT ×1000; lot=contracts); no table | 15s cache if CURRENT; **no historical futures-bars provider** (continuous-futures needs caller `contractBars`) | Registry (VN30/VN100, 1M/2M/1Q/2Q, mult 100k, tick 0.1, HNX, 3rd-Thu expiry, 14:45 ICT cutoff); basis/OI/term-structure/regime/continuous-series (UNADJUSTED/RATIO/BACKWARD-DIFF) | OI often `null` (vendor omits); missing/expired/malformed expiry → `INVALID` (P29; missing-expiry leniency carried — ACCEPT-or-FIX before build) |
| Cash | `portfolios/positions/transactions` tables + engines (`CASH` asset-class, qty IS VND) | Ledger-current | Face value, 0 return; ETF `cashComponent` separate | Negative/non-finite → `INVALID` |
| Universe / constituents | Static `stockUniverse.ts` (~70 symbols, 30× `isVN30`, 17 sectors) | Current-only; `MarketIntelligenceService` batches 10, per-symbol try/catch → coverage ratio | `sectorId` ICB-aligned | **Survivorship limitation**: no historical constituents; explicit caveat in `portfolio/types.ts:183`, `multi-asset/types.ts:118` |
| Delisted | `stocks.isActive`, `EtfStatus ACTIVE/DELISTED`, `ContractStatus EXPIRED/PENDING` flags only | No archive, no feed | — | Suspended/delisted bars → `NO_DATA/UNAVAILABLE` |

Interface-only gaps that stay caller-supplied **by design**: `PortfolioDataProvider.getMarketInputs`, `MultiAssetDataProvider.getInputs` (declared inside `MultiAssetQuantService.ts`, no separate file — certified). Failure modes already fail-closed (`UNAVAILABLE/INVALID/INSUFFICIENT_DATA`) and Phase 30 inherits them plus adds `INFEASIBLE`.

---

## 7. Research Audit

Exists as the Phase 17.x strategy-research stack (`src/lib/analysis/backtest/validation/*`): chronological split (60/20/20, minBars 60), walk-forward (3 windows, 60/20/20), OOS degradation gate (>15% or IS>0&OOS≤0 → degraded → hard reject), friction stress (BASE / +slippage / HIGH), parameter sensitivity (stable ≤15% spread, overfit >25%), regime analysis (`RegimeDetector` SMA20/50 + 14-bar range, 4 states, MIN_LOOKBACK 50), trade-distribution / profit-concentration (top1 ≥50% / top3 ≥80% flags), sample power (INSUFFICIENT <30 / MODERATE 50 / ADEQUATE 100), MonteCarlo 1000 + bootstrap 1000 (seed 42, conf 0.95, rf 0.045), benchmark comparison (buy-and-hold-same-symbol), edge-consistency, reality-check, friction-integrity (`frictionDragPct`), cross-asset/period/regime generalization matrix, `AcceptanceGate 17.10.0` (QG-01..QG-10, fingerprint `FPR_sha256`, BLOCKED>REJECTED>INSUFFICIENT>CONDITIONAL>CERTIFIED).

**Quality**: strong for single-strategy research. **Gap for Phase 30**: no portfolio-level research (no multi-position backtest, no portfolio walk-forward/OOS, no attribution). Phase 30 does **not** need to rebuild this stack — it consumes its verdicts as context and adds only the decision-layer acceptance (constraint/cost/turnover/INFEASIBLE math tests). Portfolio-level research belongs to **Phase 31**.

---

## 8. Backtest Audit

| Dimension | Verdict | Evidence |
|---|---|---|
| Historical simulation | EXISTS (dual, single-symbol) | `trading/backtest/BacktestEngine` (RiskManager-gated, `close[T]`→`open[T+1]`, `pendingOrder`, intrabar stop/target, `closeAtEnd`, warmup 25, `BacktestDataProvider` KBS real data) + `analysis/backtest/BacktestEngine` (`HistoricalStrategy`, `TradeSimulator` queued BUY/SELL, `boardLot 100`, SL 7% / TP 20% / maxHold 250d, cash never negative) |
| Strategy backtesting | EXISTS | `TrendFollowing` (`Close>SMA20>SMA50 & RSI≥50`), `BreakoutConfirmation` (20 bars, vol 1.3×), `MeanReversion` (BB20×2, RSI 35/55); `HistoricalSignalVerifier` ranks top-WinRate/MDD |
| Portfolio backtesting | MISSING | One position per symbol at a time; cross-asset = aggregation of independent runs; no multi-symbol portfolio simulator |
| Transaction costs | EXISTS | Canonical 0.15%/0.15%/0.10%/0.10% everywhere; `totalFees/totalTax/totalSlippageCost` tracked; `FrictionStressSummary` + `FrictionIntegrityReport` (`grossProfit/netProfit/totalCommission/totalSellTax/estimatedSlippage/frictionDragPct`) |
| Slippage | EXISTS (conservative) | `BUY open·(1+s) / SELL open·(1−s)`, stop `min(open,stop·(1−s))`, target `max(open,target·(1−s))`, `closeAtEnd lastClose·(1−s)`, ceiling/floor clamp, stop-wins-if-both-hit; stress 0.10%→0.20%→0.50% |
| Turnover | MISSING | No `turnover`/`turnoverRatio`/capacity metric in either result type; only `averageHoldingPeriod/Days` + trade counts. `secondaryTurnoverRatio` is ETF liquidity, not strategy turnover. **Phase 30 gap** |
| Corporate actions | PARTIAL (engine exists, unwired) | `adjustPriceSeries` + entitlement/date engines exist but have **zero imports** from either backtest stack; backtests consume raw KBS OHLCV; no dividend credit, no split/bonus/rights adjustment |
| Survivorship bias | MISSING | No delisted archive, no point-in-time constituents, no universe control |
| Look-ahead bias | EXISTS (strong) | `LookAheadGuard` slice isolation + `validateLookbackSlice(excludeCurrentBar)` + `verifyNoFutureLeakage`; `visibleCandles=slice(0,t+1)`; `T close→T+1 open` both stacks; `RegimeDetector` strictly `[0..T]`; QG-01..QG-04 + seeded determinism |
| Walk-forward | EXISTS | `runWalkForwardValidation` (aggregateOosReturn/WinRate, `profitableWindowRatio`, stable ≥50% & >0) + `CrossGeneralizationValidator` Early/Middle/Recent split |
| Out-of-sample | EXISTS | `splitChronologically` + `runOOSValidation` (`returnDegradationPct/winRateDelta/degradationRatio/isOosDegraded/isOosProfitable`), enforced in verdict + acceptance gate |
| Benchmarking | PARTIAL | Buy-and-hold-same-symbol (`excessReturn/drawdownAdvantage/outperformed`), ETF-vs-index (`trackingDifference/trackingError/beta/corr/R²`), strategy-vs-strategy ranking. No VNINDEX market benchmark in backtest metrics |
| Performance attribution | MISSING | Only concentration/robustness proxies (trade distribution, profit concentration, edge-consistency excl-best/top3/worst, regime PnL split, cross-dimension matrix) — no sector/factor/Brinson attribution |

**Numerical non-uniformities to normalize in Phase 30/31** (do not fix in discovery): CAGR day-count (365.25 vs 252 vs 365 across `trading/backtest`, `analysis/backtest`, cross-asset evaluator); Sharpe/Sortino annualization (equity-curve `·√252` with `dailyRf/252` vs trade-return `·√min(252,trades)` vs per-trade-Rf vs `mean·252/std·√252`); fee rounding (`toFixed(2)` in backtests vs `Math.round` integer-VND in paper/replay → VND-level divergence).

---

## 9. Portfolio Audit (Phase 28 — real capabilities)

`src/lib/portfolio/` (pure) + `src/services/portfolio/` (orchestration). Verified file-by-file; purity holds (no clock/random/I-O in lib).

- `types.ts`: canonical contracts, `PORTFOLIO_CALCULATION_VERSION=v1.0.0-phase28`, `DEFAULT_PORTFOLIO_POLICY` (20% position / 30% sector / top-3), fail-closed vocab `OK|STALE|DATA_UNAVAILABLE|INSUFFICIENT_DATA|INVALID`, `null`=unavailable never 0, survivorship caveat §183-186.
- `PortfolioExposureEngine.ts`: `w_i=mv_i/Σmv` (mv=qty×markPrice, cash separate), sector/asset-class `Σw`, `asOfDate` accepted (currently unused dead param — noted, harmless). Invalid (qty/price/cash illegal, blank symbol) → `INVALID`; empty (`total≤0`) → genuine zeros `OK` (consistent with `PortfolioRiskMetrics`).
- `ConcentrationEngine.ts`: max/top-N/sector/class/HHI (`Σw²×10000`), breach strings, `withinLimits=breaches==0`. No status strings here (caller maps).
- `CovarianceEngine.ts`: sample cov `Σ(r_i−μ_i)(r_j−μ_j)/(n−1)` on pairwise-complete aligned tails, `ρ=cov/(σ_iσ_j)` (zero-var → `null` not 0), `σ_p=√(wᵀΣw)·√252`, diversification ratio, `beta=cov(r_p,r_b)/var(r_b)` on overlapping tail (|var|≈0 → fail-closed), `minObservations=30`, `insufficient` flag, date-blind/order-only (no corporate-action awareness — inherited limitation).
- `FactorExposureEngine.ts`: value-weighted `f_k=Σw_i·f_{i,k}` over covered weight, coverage ratio, **no imputation**; `coverage==0→DATA_UNAVAILABLE`, `0<coverage<1→STALE`+warning (STALE-for-partial-coverage is a certified quirk — preserve, do not silently change).
- `AllocationEngine.ts`: equal (`1/N`, **throws** on empty — only throw in scope), inverse-vol (`(1/σ_i)/Σ(1/σ_j)`, fallback equal), min-variance (`Σ⁻¹1/1ᵀΣ⁻¹1`, ridge `1e-6`, fallback inverse-vol, long-only clip, `fallbackUsed`+notes), BL-lite (`(1−τ)w_ref+τw_view`, τ∈[0,1] clamped, default ref inverse-vol, no-views → ref + `fallbackUsed`). **All unconstrained** — this is the extension point, not a fork target.
- `PortfolioDiagnosticsEngine.ts`: `scenarios` (`loss=round(mv·rate)` per named shock; empty → `null`), `benchmark` (either null/non-finite → `null`), `verdict` (EMPTY/CONCENTRATED/DATA_LIMITED/INSUFFICIENT/WATCH on coverage<0.5 or HHI>2500).
- `PortfolioIntelligenceSnapshotBuilder.ts`: pure orchestrator → `PortfolioIntelligenceSnapshot` (exposure/concentration/covariance/corr/vol/beta/factor/allocation/benchmark/scenarios/diagnostics/lineage/warnings/limitations, `snapshotId=portfolio-{asOfDate}-{n}`, `statusFromFreshness` mapping, empty→genuine-zeros, missing→`DATA_UNAVAILABLE/STALE`, short→`INSUFFICIENT_DATA` value-kept, alloc-no-syms→`DATA_UNAVAILABLE` else always `OK` via fallbacks). Determinism tested (`JSON.stringify` equality).
- `PortfolioDataProvider.ts`: **interface only** — zero implementations in repo (confirmed). `PortfolioIntelligenceService.ts`: async orchestration, `evaluatedAt` wall-clock (only `Date` use), provider-throw → build with empty series + `__provider__:UNAVAILABLE` (never fabricated; known quirk: that key never matches a symbol so exposure stays `OK` while cov/beta/factor correctly go `DATA_UNAVAILABLE`).
- Tests: `PortfolioEngines.test.ts` (12) + `PortfolioFailClosed.test.ts` (7) = 19, covering empty/single/multi/concentrated/correlated/zero-variance/missing/short/stale/unavailable/invalid/zero-factor-coverage + determinism.

**Genuinely reusable** (Phase 30 consumes as-is): weights, sector/class exposure, concentration limits, covariance/corr/vol, beta/tracking, factor aggregation + coverage, allocation methods as reference targets, benchmark/scenario primitives, snapshot lineage pattern.
**Still isolated**: zero API/route/hook consumers (grep `PortfolioIntelligenceService` = definition only); `PortfolioPage` renders PaperBroker state + hardcoded `DATA_UNAVAILABLE` allocation panel, not P28 output.
**Lacks**: persistence (by design), transaction-cost semantics, turnover semantics, constraint enforcement, `INFEASIBLE`, historical-data fetching (raw `number[]` tails only), scenario library, reproducibility hash (collision-prone `snapshotId`, wall-clock `evaluatedAt`).

---

## 10. Multi-Asset Audit (Phase 29 — real capabilities)

`src/lib/multi-asset/` (pure) + `src/services/multi-asset/MultiAssetQuantService.ts` (provider interface declared inside the service file — no separate DataProvider file, certified).

Asset semantics (binding, preserved verbatim by Phase 30):

| Class | Qty | Value | Return basis | Guards |
|---|---|---|---|---|
| EQUITY | shares, integer (lot 100; fractional → `INVALID`; non-multiple-of-100 integers pass valuation, odd-lot tolerant) | qty×price | simple price return | price null/neg → `DATA_UNAVAILABLE` |
| ETF | shares, integer (same lot rule) | qty×price (**NAV tracked separately, never substituted**); registry membership informational | simple price return; premium/discount informational | same as equity |
| DERIVATIVE | contracts, signed (+long/−short); `qty==0→OK/FLAT/0` | notional=qty×price×100,000; equity contribution = margin + unrealized (**supplied, never invented**) | return on notional; tick 0.1 informational semantic constant (`FUTURES_TICK_SIZE_POINTS`, not consumed by valuation path) | **expiryDate required**: missing/blank/malformed → `INVALID` (never estimated); expired (vs `asOfDate`, lexicographic ISO, 14:45 ICT cutoff) → `INVALID`; non-integer qty → `INVALID`; price ≤0 → `DATA_UNAVAILABLE`; margin null/neg → `DATA_UNAVAILABLE`; pnl null → `DATA_UNAVAILABLE` |
| CASH | VND | face value | 0 | negative → `INVALID` |

- `MultiAssetPortfolioEngine`: net = Σ signed notionals + equity MV + cash (+pnl); gross = Σ absolute; leverage = gross/netAssets (`null` if net ≤0); margin coverage = cash/margin-requirement (`null` if margin ≤0); `rebalance()` → target-weight value deltas + lot-100 / contract-truncation **hints** (never baked into weights; `netAssets≤0` / null MV / non-finite-or-negative target → `null`; weights need not sum to 1 — no validation).
- `QuantPlatformIntegrationEngine`: `QuantPlatformSnapshot` = multi-asset portfolio + Phase-28 reference link (informational id only, no computation reuse) + strategy-signal rollup (counts by direction, mean conviction, HOLD/FLAT dominance preserved — **never upgrades a signal**) + limit checks (leverage cap default 2.0, derivative-notional cap, cash-floor %, margin-coverage ≥1; unknown → `passed:null` fail-closed, never `INFEASIBLE`) + lineage/warnings/limitations. Pure, deterministic, explicit `asOfDate` (`snapshotId=quant-{asOfDate}-{n}`).
- `MultiAssetQuantService`: same orchestration pattern as P28 service (wall-clock `evaluatedAt`, provider-throw → empty + `__provider__:UNAVAILABLE`, same `OK`-exposure quirk).
- Tests: 6 engine + 5 fail-closed = 11 (equity/ETF/cash/long-short-futures, expired→INVALID, missing-expiry→INVALID, missing price/margin/pnl→UNAVAILABLE, fractional→INVALID, leverage/margin/rebalance, empty-signal snapshot, determinism).

**Genuinely reusable**: per-position valuation, net/gross/leverage/margin, hint-rounding math, limit-check pattern, snapshot lineage.
**Still isolated**: zero consumers outside tests; no route/hook; no persistence; history only via reference id; scenario = none beyond P28 link; **no cost/turnover** (rebalance is cost-blind); no `INFEASIBLE`.

Do not duplicate any of the above in Phase 30 — **REUSE → INTEGRATE → EXTEND**.

---

## 11. Risk Audit

Safety stack (all protected — Phase 30 **recommends only**, never bypasses):

- `RiskGuard.evaluate` → `VALID|BLOCKED|INVALID` / `AUTHORIZED_FOR_PAPER_TRADING|BLOCKED|INVALID` (emergency → enabled → market-hours → equity/cash → daily-loss → max-positions → no-pyramiding → ceiling/floor → deviation → signal → sizing → exposure → RR).
- `RiskManager.checkRisk/evaluateTrade` → `APPROVED_TRADE|NO_TRADE` + `PositionSizer.calculate` (risk-budget, risk-per-share, round-down-to-lot, `totalCapitalRequirement=buyCost+round(buyCost·fee)+round(buyCost·slip)`).
- `MarketDataIntegrityGuard` (11 checks incl. duplicate-candle, session, ceiling/floor, reference, deviation, source) → `TradingDataValidator` (RR≥2, confidence≥MEDIUM, OHLC/volume/timestamp/symbol-regex/session) → `VietnamLotRule` (100, `isValidLot/roundDownToLot/toLotCount`) → `TradeCapitalAllocation` → `OrderManager` → `PaperBroker` (reservation, VWAP, `fee=gross·rate/tax/slip`, realized `netProceeds−qty·avgCost`) → `PaperTradeLedger` → `PaperReconciliationEngine` (RECONCILED/MISMATCH/INVALID_INPUT, incl. board-lot check) → replay (`ReplayEngine` dual isolated runs, `ReplayValidator` sha256, `OrderStateMachine` canonical pipeline, `FinancialConservationValidator` 11 laws).
- `PortfolioRiskMetrics` (historical VaR P95 min-30, `maxDrawdown`, `buildStress`, `riskApprovedCapital`).
- Research governance: `AcceptanceGate` QG-01..QG-10 + fingerprint + `BLOCKED>REJECTED>INSUFFICIENT>CONDITIONAL>CERTIFIED`.

**Phase 30 integration rule**: engines must import **none** of `trading/` execution paths (assert in tests); strategy directions (HOLD/FLAT/BUY/SELL) are summarized only, never mutated; live-execution integration explicitly out of scope (costed plan + hints only).

---

## 12. Bias / Reproducibility Audit

| Bias | Status | Evidence / mitigation required in Phase 30 |
|---|---|---|
| Look-ahead | GUARDED (research) / MUST-PRESERVE (decision) | `LookAheadGuard`, `validateLookbackSlice`, `verifyNoFutureLeakage`, `T close→T+1 open`, `RegimeDetector [0..T]`, `publicationDate<=asOfDate` (earnings/macro/capital-cycle), `publicationCutoffDate==asOfDate`. Phase 30: every decision carries `asOfDate`; engines never read clock; `evaluatedAt` service-only |
| Survivorship | EXPLICIT & UNHANDLED | Static universe (~70, current constituents/sector/ETF-holdings/index-membership); no delisted archive; no historical constituents; no delisting feed. Both P28/P29 limitation lists disclose it. Phase 30 must stamp the caveat on **every** proposal and must not present constrained backtests as survivorship-free |
| Selection | PARTIAL | `MarketIntelligenceService` per-symbol try/catch → coverage ratio (omission visible); factor coverage ratio (uncovered sorted, never imputed); benchmark overlap guard. Phase 30: missing factor coverage for a factor-constrained symbol → `INSUFFICIENT_DATA` (or constraint UNEVALUATED→INFEASIBLE), never default-to-zero |
| Data leakage | GUARDED | Frozen `HistoricalContext`, `minWarmupBars`, final-bar `NO_EXECUTION`, `SeededRandom` determinism, `AcceptanceGate` QG-01..QG-04. Phase 30: same-input + same versions → byte-identical output; stochastic methods excluded from base slice |

Reproducibility fields every quantitative result must capture: `asOfDate`, data snapshot (or input hash), engine version (`v1.0.0-phase28/29/30`), full configuration (constraints + cost params + projection cap/tolerance), universe (static-list version), corporate-action state (adjusted vs raw, factor `K`), benchmark id. Current gaps to fix in Phase 30 design: collision-prone `snapshotId` (date+count → replace/augment with input hash), wall-clock `evaluatedAt` (keep out of pure engines; document as service stamp), caller `__provider__` freshness quirk (document, do not silently change certified behavior).

---

## 13. Persistence Audit

- Schema: `src/db/schema.ts` (28 tables: users, stocks, stock_daily, stock_intraday, technical_indicators, financial_statements, financial_ratios, valuation_results, money_flows, foreign_trading, news, watchlists/items, portfolios/positions/transactions, signals, analysis_results, ai_analysis, alerts, financial_facts_v2, earnings_calendar, policy_events, strategic_projects, project_beneficiaries, legal_governance_events, macro_observations, macro_regime_snapshots). Migrations additive `IF NOT EXISTS`, no alters/seeds.
- Repos: 12 in `src/lib/db/` (`Stock/Price/Technical/Fundamental/Valuation/Signal/Watchlist/Portfolio/MoneyFlow/EarningsFacts/CapitalCycle(read-only)/Macro`). Conventions: unique filing/snapshot indexes + `onConflictDoNothing` append-only (new) vs `onConflictDoUpdate` (legacy); `getObservationsAsOf(lte publicationDate)`; `appendSnapshot doNothing` on id.
- `PortfolioRepository` covers `portfolios/positions/transactions` only — **no `optimization_runs` / `risk_snapshots` / covariance / allocation tables**. `stockSchema.ts` = Zod validation only.
- **Not persisted** (in-memory `marketDataCache` only): corporate-action registry, ETF/derivatives quotes/snapshots, strategy/multi-asset/portfolio intelligence snapshots, market-intelligence snapshot.
- Phase 30 decision: **no migration in the base slice** (justification: decisions are pure functions of versioned inputs + `asOfDate` + engine version; auditability via returned lineage — same rationale as P28/P29 "no migration by design"). Optional audit slice adds `optimization_runs` (input hash, constraints, params, result ref, status incl. INFEASIBLE reasons, provenance) + `decision_snapshots` refs — entity/ownership/retention/versioning/as-of/user-isolation defined at implementation time; migration IDs reserved then (`drizzle/0003_phase30_*`), **files not created now**.

---

## 14. Performance / Scale Audit

| Scale | Requirement | Assessment |
|---|---|---|
| 1 stock | trivial | O(1) per metric; current engines instantaneous |
| 100 stocks | N×N covariance = 10k cells | O(N²) memory (~80KB floats), closed-form inversion O(N³) = 1M ops — acceptable sync, client or server |
| 1,000 stocks | 1M cells | ~8MB covariance; inversion 1B ops — **must cap**: reject N>1000 → `INVALID` with reason, or batch/chunk; ridge guard `1e-6` inherited; projection loop fixed cap (≤1000 iters, `NON_CONVERGED→INFEASIBLE`) |
| 10,000 instruments | 100M cells | OUT OF SCOPE for base slice — document limit; future: factor-model covariance, shrinkage/EWMA options, background jobs (NOT Phase 30) |
| 1 / 100 portfolios | per-decision pure compute | Stateless, idempotent on input-hash; no cache required; optional memo on `(inputHash, engineVersion)` |
| 10,000 users | multi-tenant | Compute-only slice has no new auth surface; persistence slice needs user-ownership/tenant-isolation/IDOR checks (see §16) |

Opportunities (design, not build now): batch covariance builds, `snapshotId`/input-hash memoization, incremental re-computation on delta-weights, snapshotting decisions for review UI, background portfolio-backtest workers (Phase 31). No Redis/Kafka/GPU/K8s/microservices — explicitly out (correctness → architecture → evidence → maintainability → scale).

---

## 15. AI Boundary

- No `src/services/ai/*`; no GenAI/Vertex/OpenAI client in `src`. Only `ai_analysis.model_version default 'gemini-2.5-flash'` column.
- Invariants: `AI never determines the regime; AI is purely an explanatory translation layer` (`macro-regime/types.ts:14`); Phase 26 policy/capital/backlog are EVIDENCE layers, NEVER direct BUY signals; Phase 27 regimes are analytical context, NEVER BUY/SELL.
- `ai_analysis{aiScore/confidence/sentiment/coreThesis/technicalInsight/fundamentalInsight/catalysts/riskWarnings}` = narrative. `stockDetailService.getFullStockDetail aiSignal` (BUY≥75/SELL≤40 else HOLD, target=price×1.15, stop=support×0.97, fairValue=price×1.18) = **fixed formulas/templates**, not LLM output.
- Binding order for Phase 30 (and all investment analytics):

```text
REAL DATA → VALIDATION → DETERMINISTIC ENGINE → EVIDENCE → AI EXPLANATION
```

AI must never source prices, weights, P&L, risk metrics, valuation, conservation, or constraints. AI may **explain** a deterministic `RebalancingDecision` (why INFEASIBLE, what turnover/cost means) — never generate it.

---

## 16. Frontend Boundary

UI currently consumes (no optimizer integration):

- `PortfolioPage` (374L): `useTradingPortfolio/Positions/Status` → `/api/trading/portfolio|positions|status` (PaperBroker canonical `BrokerAccount/BrokerPosition`); presentation-only formatting; unavailable → `—`; allocation panel hardcoded `DATA_UNAVAILABLE` (`:351-357`) — **not wired to P28/P29**.
- `RiskCenterPage`: `useTradingPortfolio` + RiskGuard metrics + fixed shocks only — **not wired to P28/P29 scenario/beta/factor**.
- `PaperTradingPage`, `DataStatusPage`, `RecommendationsPage`, `StockDetailPage`: trading/market signals only.
- No route/hook/controller references `PortfolioIntelligenceService`/`MultiAssetQuantService` (grep = definitions only).

Phase 30 **requires no UI changes** (discovery boundary). It must expose backend contracts a future frontend can consume: `POST /api/rebalancing/decision` (proposed, versioned `v1`, idempotent on input-hash) + decision-snapshot view model (status, weights|INFEASIBLE reasons, turnover, cost breakdown, execution steps, warnings, lineage, caveats). Future views (optimizer workspace, allocation review, scenario/decision panels) belong to a later UI slice — do not redesign UI in Phase 30.

---

## 17. Security

- Compute-only slice: validate numeric bounds (reject NaN/Inf/negative where illegal), cap universe size (N>1000 → `INVALID`), cap matrix memory (N×N guard), cap projection iterations, validate constraint payloads (bounds, band ordering, matrix shapes). No new secrets, no new packages (pure TypeScript; existing deps suffice — dependency audit: none required).
- Persistence slice (if enabled): existing session auth; authorization = user owns portfolio ref (IDOR-checked); tenant isolation (no cross-user leakage); insert-only runs keyed by `(runId,inputHash)`; retention/versioning policy; audit trail on runs.
- Threats to test: parameter tampering (contradictory bands → must yield `INFEASIBLE`, not clamping), oversized matrices (resource exhaustion → `INVALID`), malicious payloads (schema-validated DTO, Zod where applicable).

---

## 18. Testing

Required for Phase 30 (each observable + testable; synthetic data confined to fixtures, never presented as evidence):

- **Unit**: constraint validation matrix (bounds sanity, band ordering, contradictory-pair detection); projection on hand-computed 2–3-asset cases; turnover/cost arithmetic vs hand fixtures; `INFEASIBLE` triggers; lot/contract truncation reconciliation; missing/blank/malformed futures metadata; empty/single/concentrated/correlated/zero-variance/missing/stale/invalid/short-series/zero-factor-coverage edges.
- **Property / mathematical**: weights sum to 1 (±1e-9), non-negativity (long-only), cost monotone in turnover, feasibility monotone in relaxed constraints, conservation (Σ hints reconcile to weights within tolerance).
- **Determinism**: identical-input re-run byte-identical (`JSON.stringify` equality, as in P28/P29 tests); no clock/random in engines.
- **Contract**: provider-throw → fail-closed decision (`UNAVAILABLE`, no fabricated series); freshness propagation (`STALE`/`UNAVAILABLE`/`INVALID`/`INSUFFICIENT_DATA`); `UNEVALUATED` constraint handling.
- **Integration**: service orchestration (P28/P29 services or direct positions+marks → decision); freshness threading; `quoteFreshness` mapping.
- **Historical replay**: decision replay on frozen inputs yields identical output (input-hash idempotency).
- **Bias detection**: survivorship caveat present on every output; factor-coverage gate (no imputation); futures-expiry refusal inherited.
- **Failure semantics**: every §12 prompt failure mode mapped (`INVALID/STALE/UNAVAILABLE/INSUFFICIENT_DATA/INFEASIBLE/NON_CONVERGED/NUMERICALLY_UNSTABLE`); cost-config missing → `INSUFFICIENT_DATA` (never assume zero cost); zero-turnover-budget with off-target weights → `INFEASIBLE` (not zero-cost plan).
- **Regression**: Phases 24–29 suites green (baseline ≥1620 tests); lane tests under `src/lib/rebalancing-decision/__tests__/`; `tsc` clean; vite+server build succeeds.
- **Safety**: engines import none of `trading/` execution paths; no HOLD/FLAT/BUY/SELL mutation (signal passthrough untouched); no RiskGuard/PositionSizer/conservation bypass.

---

## 19. Candidate Phase Ranking

Three evidence-derived candidates (a fourth — full "Investment Operating System orchestration" — is deferred as the composition of 30+31+32, not a single phase).

### Candidate 1 — (A) Constraint-aware, cost-aware rebalancing & optimization decision layer

| Field | Assessment |
|---|---|
| Why it matters | Closes the only broken edge in the investment chain (position-size → decision). Turns unexecutable unconstrained targets into achievable constrained proposals with explicit cost — or explicit `INFEASIBLE`. Highest investor workflow value |
| Existing capability | P28 unconstrained allocations + concentration/covariance/factor/beta; P29 valuation/aggregation/hints/limit-checks; canonical cost config; lot/margin/leverage; full safety stack |
| Missing capability | Constraint model + projection/feasibility solver; turnover metric + cap; cost estimator + budget; `INFEASIBLE` + violated-list; costed execution plan; decision lineage |
| Dependencies | Read-only on P28/P29 engines + `AllocationEngine` + `VietnamLotRule` + `DEFAULT_TRADING_COST_CONFIG` + `PositionSizer` math (reference) + KBS/VPS/DB providers (existing). No new dependency |
| Data requirements | None new — all REAL (positions/marks, history ≤355d, benchmark series, costs, lot/margin, sector map, caller factors with coverage gate, macro/earnings/capital-cycle as optional overlays) |
| Architectural impact | New isolated namespace `src/lib/rebalancing-decision/` + service; extends `AllocationEngine`, consumes concentration/covariance/vols; zero protected-system edits; zero migrations in base slice |
| Risk | LOW — pure deterministic math, recommend-only, fail-closed, fully testable against hand fixtures |
| Complexity | MEDIUM — bounded simplex projection (iterative clip-and-renormalize, fixed cap) + turnover/cost arithmetic; no new estimators, no stochastic search |
| User value | HIGHEST — first executable output in the system (review → approve/relax, no auto-execution) |
| Business value | HIGHEST — differentiates "analytics dashboard" from "investment operating system"; auditable advice trail |

### Candidate 2 — (B) Portfolio-level historical backtesting & decision review

| Field | Assessment |
|---|---|
| Why it matters | Validates that constrained decisions would have worked historically; adds turnover accounting and corporate-action-adjusted paths; enables decision review loop |
| Existing capability | Dual single-symbol backtesters (costs/slippage/look-ahead/walk-forward/OOS strong); `CorporateActionAdjustmentEngine` (unwired); `BacktestMetrics`/`PerformanceMetrics`; replay/conservation infra |
| Missing capability | Multi-position portfolio simulator; portfolio-level walk-forward/OOS; turnover/capacity/market-impact; corporate-action wiring; survivorship-free universe; portfolio attribution-lite |
| Dependencies | Requires Candidate 1's decision object as the backtest subject (constraint sets, turnover, costs) — **must follow, not precede** |
| Data requirements | PARTIAL — needs historical futures-bars provider (currently caller-supplied), deeper history (>355d for multi-year validation), delisted archive (missing). Data-blocked for full quality |
| Architectural impact | New `src/lib/portfolio-backtest/` + replay integration; touches both backtest stacks (read-only extension); persistence likely (runs/snapshots) |
| Risk | MEDIUM — survivorship/corporate-action misinterpretation risk; must carry caveats |
| Complexity | HIGH — event-driven multi-asset simulator with corporate actions, costs, turnover, delistings |
| User value | HIGH — but only meaningful once decisions exist to backtest |
| Business value | HIGH — proof-of-efficacy, regulatory-grade auditability |

### Candidate 3 — (C) Risk decomposition & attribution

| Field | Assessment |
|---|---|
| Why it matters | Explains *why* portfolio risk is what it is (marginal/component VaR, factor contribution, active-risk decomposition, expanded stress) |
| Existing capability | VaR (historical P95), vol (`wᵀΣw`), beta/tracking, factor exposure (snapshot, no history), concentration/HHI, linear scenario shocks |
| Missing capability | Marginal/component/vol-contribution, factor contribution/risk/attribution, idiosyncratic/active risk, CVaR/ES, liquidity/tail risk, stress library |
| Dependencies | Requires factor-return history + covariance-model upgrades (shrinkage/EWMA/factor-model) — **neither exists** (factors caller-supplied snapshot-only, `factorScores:{}` default, no factor table/provider) |
| Data requirements | **BLOCKED** — no factor history table/provider; covariance simplified by design; no CVaR inputs |
| Architectural impact | Extends P28 covariance/factor engines + new stress library; read-only |
| Risk | MEDIUM-HIGH — data-blocked models invite imputation temptation (forbidden); must stay caller-supplied |
| Complexity | MEDIUM-HIGH — math is standard but data plumbing is missing |
| User value | MEDIUM — valuable for sophisticated users, but useless without trusted factor data |
| Business value | MEDIUM — table-stakes for institutional positioning, premature for current data maturity |

**Ranking**: **A > B > C**. A is unblocked and unlocks B; C is data-blocked until factor history exists. No candidate duplicates P28/P29 (all REUSE → INTEGRATE → EXTEND).

---

## 20. Recommended Phase 30

**A — `rebalancing-decision` (proposed `src/lib/rebalancing-decision/`)**: pure engines taking (current weights from P28/P29 + target/reference weights + constraints + cost config + lot/margin semantics + `asOfDate`) and returning (**constrained target weights OR `INFEASIBLE` with violated-constraint list** + turnover + costed execution plan + provenance).

It extends `AllocationEngine` (do not duplicate); consumes `ConcentrationEngine` limits, `CovarianceEngine` vols, `PositionSizer` lot math, `DEFAULT_TRADING_COST_CONFIG`, `VietnamLotRule`, P29 margin/leverage; never bypasses RiskGuard/TradingEngine/conservation/strategy HOLD/FLAT; recommend-only (no execution endpoint).

### Why Phase 30 exists

| Question | Answer |
|---|---|
| WHY | Analytics without constraints produce unexecutable targets; hints without costs mislead on turnover |
| PROBLEM SOLVED | Turns "what is optimal unconstrained" into "what is achievable under real constraints at what cost — or explicitly infeasible" |
| WHY AFTER 28–29 | Requires P28 weights/covariance/factor/allocation + P29 multi-asset valuation/margin/rebalance-hint substrate; cannot precede them |
| WORKFLOW ENABLED | Investor reviews constrained proposal → sees turnover/cost/infeasibility reasons → approves or relaxes constraints (no auto-execution) |
| PREVIOUS PROVIDE | P28 unconstrained analytics; P29 cost-blind hints; trading stack cost truth + safety gates |
| PHASE 30 ADDS | Constraint enforcement + cost-awareness + turnover reasoning + INFEASIBLE + auditable decision record |

---

## 21. Deferred Scope (NOT Phase 30)

UI pages/panels (optimizer workspace, allocation review); AI explanations as truth (AI may only explain deterministic results); cloud/K8s/microservices/queues (Redis/Kafka), GPU, external paid APIs; live execution/broker integration; community/B2B; Learning-lane work; new estimators (HRP/max-Sharpe/max-diversification/CVaR-opt/robust-opt); factor-return/risk/attribution (no factor history); multi-portfolio/batch optimization UI; futures cash-flow timing model.

---

## 22. Phase 31 Candidate

**Portfolio-level historical backtesting & decision review** — multi-position simulator consuming Phase 30 decisions (constraints + turnover + costs) over corporate-action-adjusted, survivorship-caveated history; portfolio walk-forward/OOS; turnover/cost accounting; decision-review loop (proposal history, approve/relax workflow design). Prerequisites: Phase 30 decision object stable; historical futures-bars availability proof; delisted-data strategy (caveat vs archive). No scope creep into execution.

## 23. Phase 32 Candidate

**Risk decomposition & attribution** — marginal/component VaR, volatility contribution, factor contribution (gated on factor-history provider proof), idiosyncratic/active risk, CVaR/ES estimation, expanded stress/scenario library (historical + hypothetical), liquidity/tail-risk indicators. Prerequisites: factor-history availability proof; covariance-model upgrade decision (shrinkage/EWMA/factor-model); Phase 31 backtest validation. Still recommend-only, still AI-explains-only.

---

## 24. GO / NO-GO

**READY WITH BLOCKERS** — architecture clear, data exists (all REAL, no new vendor), dependencies understood (read-only on certified predecessors), acceptance criteria testable (hand-computed fixtures + INFEASIBLE matrix + cost arithmetic), no Phase-30-internal blocker.

Blockers (hygiene, resolve before implementation slicing):
1. Selective-commit hygiene for Phase 28/29 (never blanket-commit Learning/unrelated/pending-migration files; preserve dirty worktree per git rules).
2. Missing-expiry ACCEPT-or-FIX recorded (P29 carried leniency: inherit refusal vs tighten — decision must be minuted before Phase 30 build so the decision engine inherits the correct rule).

No data blocker. No dependency blocker. No persistence blocker (base slice needs none). Proceed to implementation slicing only after blockers are minuted.

---

## 25. Acceptance Criteria (summary — full list in `PHASE_30_ARCHITECTURE.md`)

1. Feasible constraints + complete inputs → weights sum to 1 (±1e-9), all within bands, deterministic re-runs.
2. Contradictory constraints → `INFEASIBLE` + exact violated-constraint list, no weights emitted.
3. Missing factor coverage for a factor-constrained symbol → `INSUFFICIENT_DATA` (or UNEVALUATED→INFEASIBLE), no imputation.
4. Zero turnover budget with off-target weights → `INFEASIBLE` (not a zero-cost plan).
5. Cost estimate = hand-computed fee+tax+slippage lower bound on turnover notional (±documented rounding); lot-rounded steps reconcile within tolerance.
6. Invalid futures metadata → inherits P29 refusal (no valuation smuggled into weights).
7. Provider throw → fail-closed `UNAVAILABLE`, no fabricated series.
8. Strategy signals summarized only — no direction mutated.
9. Full regression (≥1620 baseline) green; `tsc` clean; vite+server build succeeds.
10. Ownership clean: new files ⊆ `rebalancing-decision` lane; no Learning/protected/shared/migration diffs in base slice.
