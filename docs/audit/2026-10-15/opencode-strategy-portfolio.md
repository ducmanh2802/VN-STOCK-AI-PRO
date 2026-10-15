# strategy-portfolio — OpenCode audit (2026-10-15)

## Map

### Purpose
This audit maps the "strategy-portfolio" area of the repo, covering recommendation/strategy contracts used by the UI, missing modules, fail-open constraint checks, and determinism violations. The area includes: `src/lib/strategy/**`, `src/lib/decision/**`, `src/lib/portfolio/**`, `src/lib/rebalancing-decision/**`, `src/services/strategy/**`, `src/services/scenario/**, `src/services/portfolio/**`, `src/types/recommendation.ts`, `src/lib/analysis/strategy/**`.

### Entry points
- `RecommendationEngine.rankUniverse` — ranks universe of stocks for a given horizon
- `RecommendationEngine.generateMultiHorizon` — generates recommendations for all 3 horizons
- `RecommendationEngine.generate` — single-horizon recommendation generation
- `SignalEngine.generate` / `SignalEngine.generateFromScoreResult` — score-to-signal mapping
- `StrategyFactory.evaluate` — evaluates a strategy against context
- `RebalancingDecisionBuilder.build` — builds a rebalancing decision snapshot
- `RiskDecisionEngine.evaluate` — risk guard evaluation for paper trading

### Key files
| Path | Role |
|---|---|
| `src/types/recommendation.ts` | InvestmentHorizon, RecommendationSignal, HORIZON_LABELS, ScoreWeights, DEFAULT_WEIGHTS_BY_HORIZON, HORIZON_HOLDING_DAYS, investment interfaces |
| `src/lib/analysis/strategy/RecommendationEngine.ts` | Multi-horizon recommendation generation, target/stop loss calculation, risk/reward |
| `src/lib/analysis/strategy/SignalEngine.ts` | Score → signal (BUY/HOLD/SELL) mapping with thresholds |
| `src/lib/analysis/strategy/StrategyScorer.ts` | Normalized strategy score (0-100) from component weights |
| `src/lib/analysis/strategy/RiskRewardEngine.ts` | Risk/reward ratio, position sizing, suggested shares |
| `src/services/strategy/StrategyIntelligenceService.ts` | Strategy evaluation service, context aggregation |
| `src/lib/strategy/StrategyFactory.ts` | Strategy registry and execution |
| `src/lib/portfolio/ConcentrationEngine.ts` | max-position, top-N, sector/class/HHI computation |
| `src/lib/portfolio/AllocationEngine.ts` | Equal-weight, inverse-vol, min-var, Black-Litterman allocation |
| `src/lib/rebalancing-decision/RebalancingDecisionBuilder.ts` | Full rebalancing decision builder (constraints, turnover, cost) |
| `src/lib/rebalancing-decision/ConstraintEngine.ts` | Constraint validation, contradiction detection |
| `src/lib/rebalancing-decision/ConstrainedAllocator.ts` | Bounded simplex projection |
| `src/lib/decision/RiskDecisionEngine.ts` | Risk state evaluation (ACCEPTABLE/CAUTION/BLOCKED) |
| `src/lib/decision/DecisionChainBuilder.ts` | Canonical decision pipeline: data → validation → risk → position size → decision |
| `src/services/strategy/StrategyApiRouter.ts` | Express router for strategy service |
| `src/services/scenario/ScenarioApiRouter.ts` | Express router for scenario service |

### Wiring
- UI routes import from `src/services/strategy/StrategyApiRouter` and `src/services/scenario/ScenarioApiRouter`
- `RecommendationEngine.generate` and `generateMultiHorizon` are the primary UI entry points for generating investment recommendations
- `RankingResult` from `rankUniverse` feeds the ranking UI table
- `StrategyIntelligenceService.evaluateSignal` wires StrategyFactory → UniversalSignalNormalizer for strategy signals
- `ScenarioApiRouter.post/evaluate` feeds `ScenarioEngine.run` for what-if analysis
- `RiskDecisionEngine.evaluate` is consumed by the paper trading RiskGuard in the execution pipeline: Recommendation → TradingDataValidator → RiskGuard → PaperBroker/Ledger → Audit
- `RebalancingDecisionBuilder.build` is called by portfolio services to compute constrained weights

### Tests
- `src/lib/analysis/strategy/SignalEngine.test.ts` — 12+ test cases covering BUY/HOLD/SELL, boundaries, determinism, invalid scores, custom thresholds
- `src/lib/analysis/strategy/StrategyScorer.test.ts` — strategy scoring tests
- `src/lib/portfolio/PortfolioFailClosed.test.ts` — portfolio fail-closed tests
- `src/lib/rebalancing-decision/__tests__/ConstraintEngine.test.ts` — constraint validation tests
- `src/lib/rebalancing-decision/__tests__/ConstrainedAllocator.test.ts` — projection tests
- `src/lib/rebalancing-decision/__tests__/RebalancingDecisionFailClosed.test.ts` — redecision fail-closed tests
- Known: many tests import modules that reference non-existent exports due to commit a277613 deletions

### Health
- **tsc**: 563 errors (baseline, unchanged by this task — documentation-only)
- **Compilation**: `src/lib/rebalancing-decision/ConstraintEngine.ts` and `ConstrainedAllocator.ts` import `./types.ts` which does not exist → compilation failure for that directory
- **Runtime**: `StrategyIntelligenceService.evaluateSignal` references `StrategyContextAggregator` which does not exist → runtime crash if that code path is executed
- **Broken imports**: 3 files have imports from non-existent `types.ts` or missing modules
- **Determinism**: `RecommendationEngine.generate` uses `new Date()` on lines 274-275, violating the no-clock rule for pure engines

### Gotchas
- The `HORIZON_LABELS` in `src/types/recommendation.ts` defines Vietnamese/English holding period labels; these are used by the UI but may not align with actual Vietnam board lot conventions (100-share board lots)
- Commit a277613 deleted 241 files and rewrote 62 files to older versions; many callers now use exports that no longer exist
- The `generateMultiHorizon` and `rankUniverse` methods are pure (no `Date.now`/`Math.random`) except for the `new Date()` calls in `generate`
- Signal thresholds are centralized in `DEFAULT_THRESHOLDS_BY_HORIZON`; custom thresholds flow through `SignalEngineInput.customThresholds`
- Vietnam market: 100-share board lots; position sizing must respect lot multiples

---

## Findings

| # | Severity | Category | Location | Title |
|---|-----|----------|----------|-------|
| F1 | critical | missing module | `src/services/strategy/StrategyIntelligenceService.ts:3` | Import of non-existent `StrategyContextAggregator` module |
| F2 | critical | missing types | `src/lib/rebalancing-decision/ConstraintEngine.ts:20` | Import of non-existent `types.ts` causes compilation failure |
| F3 | critical | missing types | `src/lib/rebalancing-decision/ConstrainedAllocator.ts:15` | Import of non-existent `types.ts` causes compilation failure |
| F4 | high | determinism | `src/lib/analysis/strategy/RecommendationEngine.ts:274` | Uses `new Date().toISOString()` breaking deterministic requirement |
| F5 | high | fail-open | `src/lib/analysis/strategy/RecommendationEngine.ts:142` | Fail-open default `estimatedWinRate = 0.5` when score is null |
| F6 | high | fail-open | `src/lib/portfolio/ConcentrationEngine.ts:25-38` | Returns `0` for all concentration metrics when portfolio empty instead of `null` |
| F8 | medium | wrong provenance | `src/lib/analysis/strategy/RecommendationEngine.ts:217` | Evidence calculation `ROE-based scoring (roe x 3.5 + 15, clamped to 20-95)` does not match actual implementation — raw score passed through unchanged |
| F9 | medium | fail-open default | `src/lib/analysis/strategy/RecommendationEngine.ts:176-182` | Valuation reason references `potentialUpside` that may be null, presenting disclaimer only conditionally |

---

### F1 — Critical: Import of non-existent `StrategyContextAggregator` module

**Location**: `src/services/strategy/StrategyIntelligenceService.ts:3`

**Evidence**:
```ts
3: import { StrategyContextAggregator } from '../../lib/strategy/StrategyContextAggregator.ts';
```

**Why it is a defect**: `StrategyIntelligenceService.evaluateSignal` at line 30 imports `StrategyContextAggregator.buildContext` but the file `StrategyContextAggregator.ts` does not exist in `src/services/strategy/`. This will cause a `Module not found` runtime error whenever the strategy evaluation code path is triggered through the service layer. The module is referenced in the canonical execution path `Recommendation → TradingDataValidator → RiskGuard → PaperBroker/Ledger → Audit` via the strategy intelligence service.

**Minimal fix**: Create `src/services/strategy/StrategyContextAggregator.ts` with the `buildContext` method, or remove/redirect the import if the context aggregation logic is handled elsewhere.

---

### F2 — Critical: Import of non-existent `types.ts` in rebalancing-decision

**Location**: `src/lib/rebalancing-decision/ConstraintEngine.ts:20`

**Evidence**:
```ts
20: } from './types.ts';
```

**Why it is a defect**: `ConstraintEngine.ts` imports from `./types.ts` on line 20, but the file `types.ts` does not exist in `src/lib/rebalancing-decision/`. This causes a TypeScript compilation error for any project that includes this directory. The file was likely deleted or renamed during commit a277613 which "deleted 241 files and rewrote 62 files back to older versions."

**Minimal fix**: Create `src/lib/rebalancing-decision/types.ts` with the canonical decision types (DecisionType, DecisionStatus, DecisionFailCode, EvidenceRef, DecisionProvenance, DecisionObject, ThesisStatus, ThesisScenario, InvestmentThesis, RiskState, SizeState, SizingDecision, MonitorTrigger, DecisionReview, DECISION_OS_VERSION) that are currently imported from the missing file.

---

### F3 — Critical: Import of non-existent `types.ts` in rebalancing-decision

**Location**: `src/lib/rebalancing-decision/ConstrainedAllocator.ts:15`

**Evidence**:
```ts
15: import type { RebalancingConstraints } from './types.ts';
```

**Why it is a defect**: `ConstrainedAllocator.ts` imports `RebalancingConstraints` type from `./types.ts` on line 15, but the file does not exist in `src/lib/rebalancing-decision/`. This causes a compilation error. The `RebalancingConstraints` interface is also used by `ConstraintEngine.ts` (F2) and `RebalancingDecisionBuilder.ts`, so this is a blocker for the entire rebalancing-decision module.

**Minimal fix**: Create `src/lib/rebalancing-decision/types.ts` with the type definitions listed in F2's fix (the same file covers both import requirements).

---

### F4 — High: Determinism violation — `new Date()` in pure engine

**Location**: `src/lib/analysis/strategy/RecommendationEngine.ts:274`

**Evidence**:
```ts
274:       generatedAt: new Date().toISOString(),
275:       asOfDate: new Date().toISOString().split('T')[0],
```

**Why it is a defect**: `RecommendationEngine.generate` and `generateMultiHorizon` are pure functions that should accept an explicit `asOf` timestamp and never read the system clock. Using `new Date()` makes the output non-deterministic — two calls with the same inputs at different times produce different `generatedAt` and `asOfDate` values. The project rules (00-core-project-rules.md §2) state: "Pure engines are deterministic: no `Math.random()`, no `Date.now()` / `new Date()` inside strategy or financial logic — take an explicit `asOf`."

**Minimal fix**: Accept `asOfDate` as a parameter in `RecommendationGenerateParams` (or alongside the existing params) and use it for `generatedAt` and `asOfDate` instead of `new Date()`.

---

### F5 — High: Fail-open default of `estimatedWinRate` to `0.5` when score is null

**Location**: `src/lib/analysis/strategy/RecommendationEngine.ts:142`

**Evidence**:
```ts
142:     const estimatedWinRate = score !== null ? Math.min(0.85, Math.max(0.35, score / 100)) : 0.5;
```

**Why it is a defect**: When `score` is `null` (insufficient data), the code presents `0.5` as the estimated win rate, which appears to be a calculated value but is actually a hard-coded default. This is a fail-open: the system outputs a seemingly precise number rather than acknowledging insufficient data. The project rules (01-market-data-integrity.md §4) require: "MUST NOT silently default invalid numerical metrics to `0`, `NaN`, `Infinity`, or placeholder estimates." The win rate should be `null` when the score is unavailable, not `0.5`.

**Minimal fix**: Change line 142 to `const estimatedWinRate = score !== null ? Math.min(0.85, Math.max(0.35, score / 100)) : null;` and propagate `null` through the recommendation output, adding a warning when win rate is null.

---

### F6 — High: Fail-open returns `0` for all concentration metrics when portfolio empty

**Location**: `src/lib/portfolio/ConcentrationEngine.ts:25-38`

**Evidence**:
```ts
25:     if (symbols.length === 0) {
26:       return {
27:         maxPositionPercent: 0,
28:         maxPositionSymbol: null,
29:         topNPercent: 0,
30:         topNSymbols: [],
31:         maxSectorPercent: 0,
33:         maxAssetClassPercent: 0,
35:         hhi: 0,
36:         breaches: [],
37:         withinLimits: true,
38:       };
39:     }
```

**Why it is a defect**: When the portfolio has no symbols, `ConcentrationEngine.compute` returns `0` for `maxPositionPercent`, `topNPercent`, `hhi`, and sets `withinLimits: true`. This presents a seemingly valid result when no portfolio exists — a fail-open default. The project rules (04-trading-risk-integrity.md §5) require financial conservation invariants, and returning `0` with `withinLimits: true` for an empty portfolio is misleading; the status should be `INSUFFICIENT_DATA` or the values should be `null`.

**Minimal fix**: Return `null` for all numeric metrics and set `withinLimits: null` when the portfolio is empty, or add a `status` field to indicate `DATA_UNAVAILABLE`.

---

### F8 — Medium: Evidence calculation description does not match actual implementation

**Location**: `src/lib/analysis/strategy/RecommendationEngine.ts:217`

**Evidence**:
```ts
217:     if (scores.fundamentalScore !== null) {
218:       evidence.push({
219:         metric: 'Fundamental Quality Score',
220:         value: scores.fundamentalScore,
221:         period: 'TTM / Latest Quarter',
222:         // P27 §9 provenance: label what actually produced the score. The endpoint
223:         // scores ROE from VPS statements — it does not run Piotroski/DuPont here.
224:         source: 'VPS Financial Statements (ROE)',
225:         calculation: 'ROE-based scoring (roe x 3.5 + 15, clamped to 20-95)',
226:         confidence: 'HIGH',
227:       });
228:     }
```

**Why it is a defect**: The `calculation` field claims `'ROE-based scoring (roe x 3.5 + 15, clamped to 20-95)'` but the actual code passes through `scores.fundamentalScore` unchanged — no `roe x 3.5 + 15` transformation or clamping is applied. The evidence presents a calculation that is not performed, which violates the data provenance requirement (01-market-data-integrity.md §5): every derived metric must retain accurate source provenance. Presenting a fabricated calculation as if it were real is a fail-open presenting fabricated numbers as real.

**Minimal fix**: Update the `calculation` field to accurately reflect the implementation, e.g., `'ROE score from VPS statements (pass-through, no transformation)'`, or implement the claimed formula if it is intended.

---

### F9 — Medium: Valuation reason references `potentialUpside` that may be null

**Location**: `src/lib/analysis/strategy/RecommendationEngine.ts:176-182`

**Evidence**:
```ts
176:     if (scores.valuationScore !== null && scores.valuationScore >= 60) {
177:       reasons.push(
178:         potentialUpside !== null
179:           ? `Định giá hấp dẫn với biên an toàn ước tính ${potentialUpside.toFixed(1)}%.`
180:           : `Điểm định giá đạt ${scores.valuationScore}/100, nhưng chưa có mức giá trị hợp lý có thẩm quyền để tính biên an toàn.`
181:       );
182:     }
```

**Why it is a defect**: When `valuationScore >= 60` but `potentialUpside` is null (which occurs when no authoritative `fairValuePrice` or `resistancePrice` was supplied), the reason correctly shows a disclaimer. However, the very presence of a `valuationScore >= 60` suggests the valuation has some data, yet the system cannot compute `potentialUpside`. This inconsistency — a high valuation score paired with no actionable target — is a fail-open condition where the system rates the valuation favorably without having the required authoritative inputs. The UI may display "Định giá hấp dẫn" (attractive valuation) even though no valid target price exists.

**Minimal fix**: Ensure that `valuationScore` is only set when an authoritative fair value is actually available, or add an additional guard to deprioritize the valuation reason when `potentialUpside` is null.

---

## Not checked / unsure

- `StrategyContextAggregator` full implementation — the module doesn't exist, so its internal logic could not be verified beyond the broken import
- `RebalancingDecisionBuilder` unevaluated constraint behavior with the missing `types.ts` — verified the import breakage only
- `RiskDecisionEngine` interaction with actual `RiskGuard` — the engine exists but its real-world inputs (portfolio flags, riskGuardStatus) could not be fully assessed without the surrounding pipeline
- `ScenarioEngine` full — `ScenarioApiRouter` references `ScenarioEngine` from `../../lib/product/scenario/ScenarioEngine.ts` which was not explored in this audit
- Any UI-level display issues — only source code was examined; runtime behavior in the UI was not observed

---