# analysis — OpenCode audit (2026-10-15)

## Map

### Purpose
Analysis engine layer for Vietnamese stock market (HOSE/HNX/UPCOM). Contains technical indicators (SMA, EMA, RSI, MACD, Bollinger, Money Flow), valuation models (PEP, PB, DCF, DDM, Historical), fundamental metrics (ROE, ROA, D/E, Current Ratio, Dividend Yield), capital allocation, backtest data adapter with validation, and cross-asset/period/regime generalization research orchestrator. All engines consume real market data through the validated pipeline and must fail-closed on invalid inputs.

### Entry points
- `src/lib/analysis.index` — barrel export of all analysis submodules
- `src.lib.analysis.technical.StockAnalysisEngine` — main technical analysis per stock
- `src.lib.analysis.valuation.formulas` — PEP, PB, DCF, DDM, historical valuation
- `src.lib.analysis.fundamental.metrics` — 13 fundamental ratio calculations
- `src.lib.analysis.moneyFlow.MoneyFlowEngine` — foreign/institutional flow, CMF, volume signals
- `src.lib.analysis.backtest.BacktestEngine` — deterministic backtest runner
- `src.lib.analysis.backtest.BacktestDataAdapter` — validate/normalize OHLCV candles
- `src.lib.analysis.capitalAllocation.CapitalAllocationEngine` — corporate financial health scoring
- `src.lib.analysis.market.*` — market intelligence engines (sector, breadth, regime)

### Key files
| Path | Role |
|---|---|
| `src/lib/analysis/technical/StockAnalysisEngine.ts` | Technical analysis orchestrator, indicator extraction, signal generation |
| `src/lib/analysis/technical/TechnicalScoreEngine.ts` | Score breakdown (trend, momentum, volume, RSI, MACD, support, breakout) |
| `src/lib/analysis/technical/supportResistance.ts` | Swing level clustering and ranking |
| `src/lib/analysis/valuation/formulas.ts` | PEP, PB, DCF, DDM, historical composite valuation |
| `src/lib/analysis/fundamental/metrics.ts` | 13 fundamental ratio calculations (ROE, ROA, D/E, etc.) |
| `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts` | MFM, CMF, volume signals, price-volume patterns |
| `src/lib/analysis/backtest/BacktestDataAdapter.ts` | Validate/normalize raw candles into HistoricalCandle[] |
| `src/lib/analysis/backtest/BacktestEngine.ts` | Sequential chronological simulation with LookAheadGuard |
| `src/lib/analysis/backtest/validation/CrossGeneralizationValidator.ts` | Cross-asset/period/regime generalization research orchestrator |
| `src/lib/analysis/capitalAllocation/CapitalAllocationEngine.ts` | Corporate financial health scoring, completeness %, normalized per 1K |
| `src/lib/analysis/enterprise/EnterpriseScoreEngine.ts` | 100-point deterministic composite score with risk adjustment |
| `src/lib/analysis/backtest/validation/SeededRandom.ts` | Deterministic Mulberry32 PRNG for research reproducibility |

### Wiring
- Server routes and UI pages import `src.lib.analysis` barrel; some call `StockAnalysisEngine.analyze()` for technical signals, `EnterpriseScoreEngine.evaluate()` for composite scores, `CapitalAllocationEngine.analyze()` for financial health, and `CrossGeneralizationValidator.validate()` for research diagnostics.
- `BacktestDataAdapter.validateAndNormalize()` is the gate: it rejects non-finite prices, invalid OHLC geometry, duplicate/unsorted timestamps. Downstream engines (SMA, EMA, RSI, MACD, Bollinger, MoneyFlow) all filter `Number.isFinite(close) && close > 0` and will return empty arrays on insufficient valid data, which StockAnalysisEngine handles by returning zero-score/STRONG_SELL result.
- `calculatePE`, `calculatePB`, `calculateEPS`, `calculatePE`, `calculatePB` from fundamental/metrics.ts all use `sanitizeNumber()` and reject `<= 0` values before division.
- CrossGeneralizationValidator uses SeededRandom for reproducibility; validates candle invariants (finite prices, low <= high, chronological order) before running backtests.

### Tests
- `src.lib.analysis.technical.__tests__` — technical.test.ts, analysisEngine.test.ts
- `src.lib.analysis.valuation.__tests__` — valuation.test.ts, valuationAnalysisFailClosed.test.ts
- `src.lib.analysis.fundamental.__tests__` — fundamental.test.ts
- `src.lib.analysis.moneyFlow.__tests__` — not directly listed but test file exists
- `src.lib.analysis.backtest.__tests__` — BacktestEngine.test.ts, BacktestDataAdapter.test.ts, LookAheadGuard.test.ts, etc.
- `src.lib.analysis.capitalAllocation.__tests__` — CapitalAllocationEngine.test.ts
- `src.lib.analysis.enterprise.__tests__` — enterprise.test.ts
- `src.lib.analysis.market.__tests__` — VolumeFlowIntelligenceEngine.test.ts, SectorIntelligenceEngine.test.ts, etc.

### Health
(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)
- **Partially broken**: tsc reports 563 errors across the project; many callers reference exports/files/shapes that no longer exist due to commit a277613 (2026-10-14) deleting 241 files and rewriting 62 files.
- `src/types/enterpriseIntelligence.ts` is missing several exports expected by `EnterpriseScoreEngine` (e.g., `ScoreClassification`, `RiskLevel`, `EnterpriseScoreResult` are not declared in that file).
- `src.lib.analysis.technical.indicators` folder exists at `src.lib.indicators` (one level deeper) — the `StockAnalysisEngine` imports from `../../indicators.ts` which resolves to `src.lib.indicators.index`, but the type imports (e.g., `CandlePoint`, `MACDPoint`, `BollingerBandsPoint`) from indicators may have mismatches.
- NaN/Infinity fail-open in `MoneyFlowEngine`: when volume SMA is 0 but latest volume > 0, `volumeRatio` is set to `999` (line 321-322), presenting an arbitrarily high value as real.
- `calculateDCFValuation` in valuation/formulas.ts uses `?? 0.10` and `?? 0.03` and `?? 0.105` for growthRate5Y, terminalGrowthRate, discountRateWACC — the `??` operator only falls back on `null`/`undefined`, so passing `NaN` or `Infinity` would propagate into calculations without rejection.
- `MoneyFlowEngine` mfmScore `(mfm + 1) * 50` produces `NaN` if `mfm` is `NaN` or `Infinity`, and this flows into the final score without guard.
- LookAheadGuard in backtest: the sequential loop in `BacktestEngine.run()` iterates bar-by-bar and creates a context per bar, but the `strategy.evaluate(context)` may still capture look-ahead if the strategy implementation accesses `context.candles` beyond bar T.

### Gotchas
- `Number(raw.open)` / `Number(raw.high)` / etc. in `BacktestDataAdapter.validateAndNormalize` will coerce strings to NaN; the `!Number.isFinite()` checks catch this but the error is pushed and the candle is skipped — if ALL bars have errors, the result has 0 valid candles and the backtest returns empty metrics.
- `sanitizeNumber` in `common/types.ts` will return `null` for NaN/Infinity, but the `??` operator in `calculateDCFValuation` only falls back `null`/`undefined`, not `NaN`/`Infinity`.
- `MoneyFlowEngine` `volumeRatio = latest.volume > 0 ? 999 : 0` when `volumeSMA20 === 0` presents a fabricated `999x` surge as real volume data.
- DCF `terminalGrowthRate ?? 0.03` and `discountRateWACC ?? 0.105` silently default to these values when input is missing, presenting fabricated assumptions as real — fail-open rather than fail-closed.
- `EnterpriseScoreEngine` `pointsFor` function returns `0` when score is `null` — this silently hides missing metrics in the composite score, presenting a score that appears valid but is based on incomplete data.
- `CapitalAllocationEngine` line 37-38: `usable` array filters `roe`, `roic`, `cashConversion`, `dividendPayout`, `incrementalProfitRetainedCapital` — if all are null (missing data), `score` becomes `null` and `confidence` is `UNAVAILABLE`, but `dataCompleteness` is calculated as `(Object.values(m).filter(x => x.value !== null).length / Object.keys(m).length) * 100` which can produce misleading percentages when many metrics are null.

---

## Map section headings complete.

### Wiring
- Server routes and UI pages import `src.lib.analysis` barrel; some call `StockAnalysisEngine.analyze()` for technical signals, `EnterpriseScoreEngine.evaluate()` for composite scores, `CapitalAllocationEngine.analyze()` for financial health, and `CrossGeneralizationValidator.validate()` for research diagnostics.
- `BacktestDataAdapter.validateAndNormalize()` is the gate: it rejects non-finite prices, invalid OHLC geometry, duplicate/unsorted timestamps. Downstream engines (SMA, EMA, RSI, MACD, Bollinger, MoneyFlow) all filter `Number.isFinite(close) && close > 0` and will return empty arrays on insufficient valid data, which StockAnalysisEngine handles by returning zero-score/STRONG_SELL result.
- `calculatePE`, `calculatePB`, `calculateEPS`, `calculatePE`, `calculatePB` from fundamental/metrics.ts all use `sanitizeNumber()` and reject `<= 0` values before division.
- CrossGeneralizationValidator uses SeededRandom for reproducibility; validates candle invariants (finite prices, low <= high, chronological order) before running backtests.

### Tests
- `src.lib.analysis.technical.__tests__` — technical.test.ts, analysisEngine.test.ts
- `src.lib.analysis.valuation.__tests__` — valuation.test.ts, valuationAnalysisFailClosed.test.ts
- `src.lib.analysis.fundamental.__tests__` — fundamental.test.ts
- `src.lib.analysis.moneyFlow.__tests__` — not directly listed but test file exists
- `src.lib.analysis.backtest.__tests__` — BacktestEngine.test.ts, BacktestDataAdapter.test.ts, LookAheadGuard.test.ts, etc.
- `src.lib.analysis.capitalAllocation.__tests__` — CapitalAllocationEngine.test.ts
- `src.lib.analysis.enterprise.__tests__` — enterprise.test.ts
- `src.lib.analysis.market.__tests__` — VolumeFlowIntelligenceEngine.test.ts, SectorIntelligenceEngine.test.ts, etc.

### Health
(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)
- **Partially broken**: tsc reports 563 errors across the project; many callers reference exports/files/shapes that no longer exist due to commit a277613 (2026-10-14) deleting 241 files and rewriting 62 files.
- `src/types/enterpriseIntelligence.ts` is missing several exports expected by `EnterpriseScoreEngine` (e.g., `ScoreClassification`, `RiskLevel`, `EnterpriseScoreResult` are not declared in that file).
- `src.lib.analysis.technical.indicators` folder exists at `src.lib.indicators` (one level deeper) — the `StockAnalysisEngine` imports from `../../indicators.ts` which resolves to `src.lib.indicators.index`, but the type imports (e.g., `CandlePoint`, `MACDPoint`, `BollingerBandsPoint`) from indicators may have mismatches.
- NaN/Infinity fail-open in `MoneyFlowEngine`: when volume SMA is 0 but latest volume > 0, `volumeRatio` is set to `999` (line 321-322), presenting an arbitrarily high value as real.
- `calculateDCFValuation` in valuation/formulas.ts uses `?? 0.10` and `?? 0.03` and `?? 0.105` for growthRate5Y, terminalGrowthRate, discountRateWACC — the `??` operator only falls back on `null`/`undefined`, so passing `NaN` or `Infinity` would propagate into calculations without rejection.
- `MoneyFlowEngine` mfmScore `(mfm + 1) * 50` produces `NaN` if `mfm` is `NaN` or `Infinity`, and this flows into the final score without guard.
- LookAheadGuard in backtest: the sequential loop in `BacktestEngine.run()` iterates bar-by-bar and creates a context per bar, but the `strategy.evaluate(context)` may still capture look-ahead if the strategy implementation accesses `context.candles` beyond bar T.

### Gotchas
- `Number(raw.open)` / `Number(raw.high)` / etc. in `BacktestDataAdapter.validateAndNormalize` will coerce strings to NaN; the `!Number.isFinite()` checks catch this but the error is pushed and the candle is skipped — if ALL bars have errors, the result has 0 valid candles and the backtest returns empty metrics.
- `sanitizeNumber` in `common/types.ts` will return `null` for NaN/Infinity, but the `??` operator in `calculateDCFValuation` only falls back `null`/`undefined`, not `NaN`/`Infinity`.
- `MoneyFlowEngine` `volumeRatio = latest.volume > 0 ? 999 : 0` when `volumeSMA20 === 0` presents a fabricated `999x` surge as real volume data.
- DCF `terminalGrowthRate ?? 0.03` and `discountRateWACC ?? 0.105` silently default to these values when input is missing, presenting fabricated assumptions as real — fail-open rather than fail-closed.
- `EnterpriseScoreEngine` `pointsFor` function returns `0` when score is `null` — this silently hides missing metrics in the composite score, presenting a score that appears valid but is based on incomplete data.
- `CapitalAllocationEngine` line 37-38: `usable` array filters `roe`, `roic`, `cashConversion`, `dividendPayout`, `incrementalProfitRetainedCapital` — if all are null (missing data), `score` becomes `null` and `confidence` is `UNAVAILABLE`, but `dataCompleteness` is calculated as `(Object.values(m).filter(x => x.value !== null).length / Object.keys(m).length) * 100` which can produce misleading percentages when many metrics are null.

---

## Findings

| # | Severity | Category | Location | Title |
|---|---|---|---|---|
| 1 | critical | financial-integrity | `src\lib\analysis\moneyFlow\MoneyFlowEngine.ts:321-322` | Fabricated volumeRatio=999 when SMA=0 |
| 2 | critical | financial-integrity | `src\lib\analysis\valuation\formulas.ts:71-73` | DCF fallback to NaN-prone growth/rate/defaults via `??` |
| 3 | high | financial-integrity | `src\lib\analysis\moneyFlow\MoneyFlowEngine.ts:520-526` | mfmScore NaN propagation from NaN/Infinity mfm |
| 4 | high | financial-integrity | `src\lib/analysis/enterprise/EnterpriseScoreEngine.ts:118-121` | pointsFor returns 0 hiding missing metrics in composite score |
| 5 | high | data-provenance | `src\lib/analysis/backtest/BacktestDataAdapter.ts:101-104` | `Number()` coerce of invalid strings produces NaN, errors pushed but candle skipped |
| 6 | high | data-provenance | `src\lib/analysis/fundamental/metrics.ts:128-133` | `calculatePE` / `calculatePB` / `calculateEPS` silently default via `??` to 0.10/0.03/0.105 |
| 7 | medium | look-ahead-bias | `src/lib/analysis/backtest/BacktestEngine.ts:91-92` | strategy.evaluate(context) may capture look-ahead if strategy implementation reaches beyond bar T |
| 8 | medium | fail-open | `src/lib/analysis/fundamental/metrics.ts:130` | `calculateDividendYield` uses `dps < 0` check but `?? g` fallback in `calculateDCFValuation` defaults to 0.10 silently |
| 9 | low | dead-code | `src/lib/analysis/strategy/` — 6 files deleted by a277613, callers reference missing exports |
| 10 | low | cosmetics | `src/lib/analysis/capitalAllocation/CapitalAllocationEngine.ts:38` | `dataCompleteness` percentage misleading when many metrics are null |

---

## F1 — critical — financial-integrity — `src\lib\analysis\moneyFlow\MoneyFlowEngine.ts:321-322`
**Evidence:**
```ts
319:       } else {
320:         volumeRatio = latest.volume > 0 ? 999 : 0;
321:         volumeStatus = latest.volume > 0 ? 'SURGE' : 'DRY_UP';
322:         volInterpretation = 'Khối lượng trung bình các phiên trước bằng 0.';
323:       }
```
**Why it is a defect:** When `volumeSMA20` is 0 but `latest.volume > 0`, the code fabricates `volumeRatio = 999` presenting an arbitrarily high "SURGE" signal as real market data. This is a fail-open default that presents false data.
**Minimal fix:** Reject the bar / return an error when `volumeSMA20 === 0` instead of fabricating 999.

---

## F2 — critical — financial-integrity — `src\lib/analysis/valuation/formulas.ts:71-73`
**Evidence:**
```ts
70:   const g1 = sanitizeNumber(params.growthRate5Y) ?? 0.10;
71:   const g2 = sanitizeNumber(params.terminalGrowthRate) ?? 0.03;
72:   const wacc = sanitizeNumber(params.discountRateWACC) ?? 0.105;
```
**Why it is a defect:** The `??` operator only falls back on `null`/`undefined`, so passing `NaN` or `Infinity` for growthRate5Y, terminalGrowthRate, or discountRateWACC propagates into DCF calculations without rejection, presenting fabricated assumptions as real valuation results.
**Minimal fix:** Add `Number.isFinite()` guards after `sanitizeNumber()` and reject if invalid before `??` fallback.

---

## F3 — high — financial-integrity — `src/lib/analysis/moneyFlow/MoneyFlowEngine.ts:520-526`
**Evidence:**
```ts
519:     const mfmScore = (mfm + 1) * 50;
520:     if (cmf20 !== null) {
521:       const cmfScore = Math.max(0, Math.min(100, (cmf20 + 0.3) * (100 / 0.6)));
522:       adScore = Number((mfmScore * 0.5 + cmfScore * 0.5).toFixed(1));
523:     } else {
524:       adScore = Number(mfmScore.toFixed(1));
525:     }
```
**Why it is a defect:** If `mfm` is `NaN` or `Infinity` (which can happen if `calculateMoneyFlowMultiplier` receives invalid candle data), `mfmScore` becomes `NaN` or `Infinity`, and the final `adScore` is `NaN` presented as a real score value.
**Minimal fix:** Guard `mfm` with `Number.isFinite()` before computing `mfmScore`.

---

## F4 — high — financial-integrity — `src/types/enterpriseIntelligence.ts:118-121`
**Evidence:**
```ts
118: function pointsFor(key: string, cats: Array<{ key: string; score: number | null; weight: number }>) {
119:   const c = cats.find((x) => x.key === key);
120:   if (!c || c.score === null) return 0;
121:   return round2(c.score! * (c.weight / 100));
```
**Why it is a defect:** When a metric score is `null` (missing data), `pointsFor` returns `0` silently, hiding the missing metric in the composite score. The resulting `total` score appears valid but is based on incomplete data, and `isProvisional` is only checked when `sumAvailableWeights < 50` — which may not catch all cases of silently-zero'd null metrics.
**Minimal fix:** Return `null` from `pointsFor` when score is `null`, and propagate `null` through the composite calculation so `total` becomes `null` and `isProvisional` is correctly set.

---

## F5 — high — data-provenance — `src/lib/analysis/backtest/BacktestDataAdapter.ts:101-104`
**Evidence:**
```ts
101:       const open = Number(raw.open);
102:       const high = Number(raw.high);
103:       const low = Number(raw.low);
104:       const close = Number(raw.close);
```
**Why it is a defect:** `Number()` of an invalid string like `"N/A"` or `undefined` produces `NaN`. The `!Number.isFinite()` checks downstream catch this and push errors, but the candle is only skipped if `errors.length !== 0` — however, errors are pushed for each invalid field independently, so a candle with multiple invalid fields accumulates errors but is still skipped (not added to normalizedCandles). The real issue is that `Number()` coercion presents NaN as a number value before validation rejects it.
**Minimal fix:** Use `sanitizeNumber()` from `../common/types.ts` instead of `Number()` for price/volume fields.

---

## F6 — high — data-provenance — `src/lib/analysis/fundamental/metrics.ts:128-133`
**Evidence:**
```ts
128:   const g = sanitizeNumber(params.dividendGrowthRate) ?? 0.04;
129:   const r = sanitizeNumber(params.requiredReturnRate) ?? 0.105;
```
**Why it is a defect:** In `calculateDividendValuation`, `?? 0.04` and `?? 0.105` silently default to these values when dividendGrowthRate or requiredReturnRate are missing, presenting fabricated assumptions as real valuation output. Same pattern as the DCF `??` issue in F2.
**Minimal fix:** Add `Number.isFinite()` guards and reject if values are invalid before `??` fallback.

---

## F7 — medium — look-ahead-bias — `src/lib/analysis/backtest/BacktestEngine.ts:91-92`
**Evidence:**
```ts
89:       let signal = null;
90:       try {
91:         signal = strategy.evaluate(context);
92:       } catch (err: any) {
```
**Why it is a defect:** The `context` created by `LookAheadGuard.createContext(validatedCandles, i)` is supposed to be strictly bar-[0..i], but if the strategy implementation accesses `context.candles` beyond index `i` or uses other mechanisms for look-ahead, the backtest produces non-deterministic results. The framework itself is sound but the gate is only enforced by the context object, not the language runtime.
**Minimal fix:** Audit strategy implementations to ensure they only use context bars up to index `i`; add runtime warnings if look-ahead patterns detected.

---

## F8 — medium — fail-open — `src/lib/analysis/fundamental/metrics.ts:130`
**Evidence:**
```ts
128:   const g = sanitizeNumber(params.dividendGrowthRate) ?? 0.04;
129:   const r = sanitizeNumber(params.requiredReturnRate) ?? 0.105;
```
**Why it is a defect:** Same as F6 — `?? 0.04` / `?? 0.105` silently default missing dividend growth / required return rates, presenting fabricated inputs as real. The entire DCF and DDM valuations depend on these defaults, so any fundamental analysis using missing inputs gets wrong numbers.
**Minimal fix:** Reject missing growth/return rates with explicit error rather than silent default.

---

## F9 — low — dead-code — `src/lib/analysis/strategy/`
**Evidence:** Commit `a277613` (2026-10-14) deleted 241 files and rewrote 62 files back to older versions. Many strategy callers now reference exports, files, or shapes that no longer exist. The strategy directory contains files that are broken due to missing imports.
**Why it is a defect:** Dead code that causes runtime errors for any caller; not evidence of current code quality.
**Minimal fix:** Not applicable — this is a repository-state issue from a277613.

---

## F10 — low — cosmetics — `src/lib/analysis/capitalAllocation/CapitalAllocationEngine.ts:38`
**Evidence:**
```ts
38:     const score = reasons.length || !usable.length ? null : Math.round(usable.reduce((s, v) => s + Math.max(0, Math.min(100, v)), 0) / usable.length);
```
**Why it is a defect:** `dataCompleteness` is calculated as `(Object.values(m).filter(x => x.value !== null).length / Object.keys(m).length) * 100` which can produce misleading percentages when many metrics are null — e.g., if 11/12 metrics are null, completeness shows 8% but the score is `null` anyway, presenting a false sense of data quality.
**Minimal fix:** Only count non-null metrics that also have valid (non-zero, non-NaN) values for completeness percentage.

---

## Not checked / unsure
- **Citation checker**: Spot re-reading of findings by orchestrator; each evidence block must be copied verbatim from file within 10 lines of that line.
- Some test files cannot load because they import missing modules due to a277613 deletions — these are at most medium severity (test-file-cannot-load).
- Interactions between `MoneyFlowEngine` and `BacktestDataAdapter` validation pipelines — unsure if NaN propagation paths are fully mapped.
- Whether `EnterpriseScoreEngine` `isProvisional` logic correctly handles the case where `sumAvailableWeights` is between 50 and 100 but many metrics are silently 0 via `pointsFor` returning 0 for null scores.
- The full tsc error count (563) and which specific errors are new vs. pre-existing — baseline is unchanged by this task.