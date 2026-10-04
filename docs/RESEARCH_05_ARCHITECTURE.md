# RESEARCH-05 — BACKTEST AUDIT / REPRODUCIBILITY / CERTIFICATION: ARCHITECTURE

**Version**: `v1.0.0-research05` | **Date**: 2026-10-04 | **Status**: IMPLEMENTED — 7/7 tests

## Research report

`ResearchReport` carries: experiment, dataset, strategy, parameters, period,
universe, executionModel, costModel, riskModel, metrics (CAGR/annualized/
volatility/Sharpe/Sortino/maxDD/Calmar/win-rate/profit-factor/turnover/
average-trade/exposure), drawdown, turnover, exposure, benchmark, limitations,
warnings, biases, manifest, certification.

## Metric guards

`null` (not `Infinity`/`NaN`/fake numbers) when the sample can't support the
metric; `sampleSizeWarning` set when total trades < 30; CAGR requires
final>0, ≥20 equity points, and ≥0.1y span; Sharpe/Sortino require σ>0.0001.

## Benchmark

Explicit only: `benchmarkCheck` rejects a missing universe vintage
(`BENCHMARK_UNIVERSE_VINTAGE_MISSING`) — no silent comparison against
current index constituents.

## Statistical warnings (8)

small sample, high turnover, high parameter sensitivity, unstable regime,
survivorship risk, look-ahead risk, data gaps, insufficient out-of-sample.

## Evidence-based confidence

No AI confidence score. Confidence is the evidence manifest: sample size,
OOS coverage, stability, bias checks, cost sensitivity, regime robustness.

## Manifest

`ReproducibilityManifest` (dataset version, sources, strategy version, code
identifier, parameters, execution model, cost model, risk model, universe,
date range, seed) — a certified result reproduces from the manifest.

## Certification gate

8 conditions: PIT valid, no look-ahead, survivorship controlled, cost model
present, OOS tested, reproducible, accounting valid, limitations documented.
Any `false` → NON_CERTIFIED. Bias present → NON_CERTIFIED.

## Biases (explicit codes)

`LOOK_AHEAD_BIAS / SURVIVORSHIP_BIAS / CURRENT_UNIVERSE_LEAK /
DATA_SNOOPING_RISK / OVERFITTING_RISK`.

## Data snooping

`SnoopingLedger` records iteration+parameters+validation-set+result; final
certification requires `finalTestSeparation(finalTestSet)` — the test set
never appears as a validation set in the ledger.

## Corporate actions & delisted securities

Backtests respect CA via the Data Foundation engine (explicit events /
adjusted series). Delisted instruments remain in the historical universe
(`includeDelisted` in `getUniverseAsOf`) rather than being silently dropped;
regression test `survivorship: historical ≠ current` exists in
`Research05.test.ts`.

## Accounting invariant

`AuditEngine.checkNav(cash, positionValue, nav, costs)` — NAV = cash +
position − costs − liabilities, tested across buys/sells/fees/taxes/
dividends/splits/futures/margin via the engine tests.

## Randomness

`seededShuffle` only; seed in manifest; never uncontrolled.

## AI boundary

AI may hypothesise/explain/anomaly-explain/summarize. It must NOT patch
prices, override accounting, hide bias warnings, alter results, or claim
certification — enforced by keeping all certification inputs deterministic.

## Tests

Metrics+guard, benchmark vintage, 8 warnings, bias set, manifest+gate,
NAV invariant, snooping separation, survivorship universe inequality.

## Files

```text
src/lib/research/AuditEngine.ts (+ __tests__/Research05.test.ts)
src/lib/db/research/ResearchRepository.ts (append-only experiments + certifications)
src/db/schema.ts (§33–34) + drizzle/0005_research.sql
```
