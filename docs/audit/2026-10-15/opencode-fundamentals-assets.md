# fundamentals-assets — OpenCode audit (2026-10-15)
## Map
### Purpose
Core financial engines for Vietnamese stock fundamentals: earnings statement normalization (income/balance/cash flow), EPS computation, corporate action adjustments (ex-right price, entitlement), capital cycle stage classification, ETF NAV/premium-discount, derivatives term structure, and multi-asset portfolio aggregation. All engines consume real market data through the validated pipeline and must fail-closed on invalid inputs.

### Entry points
- `src.lib.earnings` — barrel export of earnings engines (EpsEngine, CashFlowEngine, IncomeStatementEngine, BalanceSheetEngine, EarningsQualityEngine, MarginEngine, RestatementEngine)
- `src.lib.corporate-actions` — corporate action adjustment and entitlement engines
- `src.lib.capital-cycle` — capital cycle classification and policy/project engines
- `src.lib.etf` — ETF NAV, holdings, and premium/discount engines
- `src.lib.derivatives` — term structure, regime, and expiration engines
- `src.lib.multi-asset` — portfolio engine, position engine, and integration engine
- `src.services.earnings` — EarningsIntelligenceService, EarningsDataProvider
- `src.services.corporate-actions` — CorporateActionIntelligenceService
- `src.services.etf` — EtfIntelligenceService
- `src.services.capital-cycle` — PolicyIntelligenceService
- `src.services.derivatives` — DerivativesIntelligenceService
- `src.services.multi-asset` — QuantPlatformIntegrationEngine

### Key files
| Path | Role |
|---|---|
| `src/lib/earnings/EpsEngine.ts` | EPS computation with corporate-action adjustment, fail-closed on missing shares |
| `src/lib/earnings/CashFlowEngine.ts` | FCF = OperatingCashFlow - |CAPEX|, canonical sign convention |
| `src/lib/earnings/IncomeStatementEngine.ts` | Income statement normalization from canonical facts |
| `src/lib/earnings/BalanceSheetEngine.ts` | Balance sheet normalization, distinct current/long-term liability keys |
| `src/lib/earnings/EarningsQualityEngine.ts` | Cash conversion, accrual ratio, quality classification |
| `src/lib/earnings/MarginEngine.ts` | Margin ratios (gross/operating/ebitda/net) from income/cash flow |
| `src/lib/corporate-actions/CorporateActionAdjustmentEngine.ts` | Ex-reference price and cumulative adjustment factors (HOSE/HNX rules) |
| `src/lib/corporate-actions/CorporateActionEntitlementEngine.ts` | Ratio parsing and fractional share allocation (FLOOR policy) |
| `src/lib/capital-cycle/CapitalCycleEngine.ts` | Classifies industry into 6 stages (EARLY_CYCLE..CAPITAL_DESTRUCTION) |
| `src/lib/etf/EtfNavEngine.ts` | iNAV computation, premium/discount regime classification |
| `src/lib/etf/EtfHoldingsEngine.ts` | Constituent weights, concentration, sector breakdown |
| `src/lib/etf/EtfIntelligenceService.ts` | ETF snapshot service (returns hardcoded synthetic values) |
| `src/lib/derivatives/TermStructureEngine.ts` | Curve shape evaluation and regime classification |
| `src/lib/derivatives/VietnamDerivativesRegistry.ts` | Contract code formatting and underlying spec lookup |
| `src/lib/multi-asset/MultiAssetPortfolioEngine.ts` | Portfolio aggregation, leverage, margin coverage, rebalancing |
| `src/lib/multi-asset/QuantPlatformIntegrationEngine.ts` | Unifies portfolio + strategy signals + limit checks |
| `src/services/earnings/EarningsIntelligenceService.ts` | Orchestrates earnings snapshot from restatement store |
| `src/services/corporate-actions/CorporateActionIntelligenceService.ts` | Corporate action snapshot service |
| `services/etf/EtfIntelligenceService.ts` | ETF intelligence snapshot (hardcoded values) |
| `services/capital-cycle/PolicyIntelligenceService.ts` | Policy + project + governance graph builder |

### Wiring
- `/api/stocks/:symbol/fundamentals` (server.ts:425) — FundamentalRepository.getStatements/Ratios uses earnings engines
- `/api/stocks/:symbol/valuation-analysis` (server.ts:529) — ValuationEngine.evaluate uses per-share figures
- `/api/stocks/:symbol/money-flow-analysis` (server.ts:569) — MoneyFlowEngine.evaluate from earnings
- `/api/stocks/:symbol/technical-analysis` (server.ts:480) — TechnicalScoreEngine (analysis area, not fundamentals-assets)
- `/api/analysis/:symbol` (server.ts:750) — StockAnalysisEngine.analyze (analysis area)
- `/api/stocks/:symbol/recommendations` (server.ts:813) — RecommendationEngine.generateMultiHorizon references fundamentals
- `/api/recommendations/rankings` (server.ts:917) — RecommendationEngine.rankUniverse references fundamentals
- `/api/strategy` (server.ts:192) — StrategyApiRouter uses QuantPlatformIntegrationEngine
- Research routes (`/api/research`, `/api/macro/radar`) use PolicyIntelligenceService, DerivativesIntelligenceService
- EtfIntelligenceService.getSnapshot is imported in server context but returns hardcoded synthetic data

### Tests
- `src/lib/earnings/__tests__/` — comprehensive test suites for all engines (EPS, cash flow, income statement, balance sheet, quality, margin, fail-closed)
- `src/lib/corporate-actions/__tests__/` — adjustment entitlement test suites
- `src/lib/capital-cycle/__tests__/` — capital cycle classification tests
- `src/lib/etf/__tests__/` — ETF nav, holdings, registry tests
- `src/lib/derivatives/__tests__/` — term structure and regime tests
- `src/lib/multi-asset/__tests__/` — portfolio and integration engine tests
- Test files that import missing modules due to a277613 failures are at most medium severity

### Health
**(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)**
- **Mostly works**: Core engines (EpsEngine, CashFlowEngine, IncomeStatementEngine, BalanceSheetEngine) properly use `finite()`, `safeDivide()`, `percentOf()` for fail-closed behavior. tsc reports 563 errors project-wide; many callers reference exports/files/shapes that no longer exist due to commit a277613 (2026-10-14) deleting 241 files and rewriting 62 files.
- **Partially broken**: `EtfIntelligenceService.getSnapshot` returns hardcoded synthetic values (F2). `QuantPlatformIntegrationEngine` has `?? NaN` patterns that produce NaN in limit details (F3). Corporate action adjustment defaults to 0 for optional fields (F4). `TermStructureEngine.evaluateCurveShape` lacks `Number.isFinite()` guard (F5).
- **Broken imports**: Several test files cannot load because they import modules deleted by a277613; callers of deleted strategy exports fail at runtime.

### Gotchas
- `Number(raw.open)` / `Number(raw.high)` coerce strings to NaN; `!Number.isFinite()` checks catch this but the candle is only skipped if errors accumulate — if all bars fail, backtest returns 0 valid candles
- `??` operator only falls back on `null`/`undefined`, so `NaN`/`Infinity` propagates into DCF, DDM, and other valuation calculations without rejection
- Defaults to `0` for optional corporate-action fields (cashAmountVnd, ratio fields, issuePriceVnd) can produce incorrect ex-reference prices when "not applicable" should differ from zero
- `isNaN()` in TermStructureEngine can silently coerce non-number types; `Number.isFinite()` should be used for strict validation
- `?? NaN` in QuantPlatformIntegrationEngine: when `byClass.DERIVATIVE`, `netAssets`, `cashBalance` are null, `?? NaN` produces NaN which breaks `Number.isFinite()` checks and produces "unknown" detail strings
- VietnamDerivativesRegistry `parseContractSymbol` assumes 2000s century (`2000 + yy`) — Y2K-like century cutoff
- EQUITY_STANDARD_LOT = 100 shares (board lot rule) enforced in multi-asset lot-sizing calculations

---
## Findings
| # | Severity | Category | Location | Title |
|---|---|---|---|---|
| F1 | high | financial-integrity | `src/services/etf/EtfIntelligenceService.ts:18-21` | Hardcoded synthetic NAV/market prices in getSnapshot |
| F2 | high | financial-integrity | `src/lib/multi-asset/QuantPlatformIntegrationEngine.ts:99-118` | `?? NaN` patterns produce NaN in leverage/cash flow limits |
| F3 | medium | financial-integrity | `src/lib/corporate-actions/CorporateActionAdjustmentEngine.ts:66-90` | Optional fields default to 0, producing incorrect adjustment factors |
| F4 | medium | data-provenance | `src/lib/derivatives/TermStructureEngine.ts:38-39` | `isNaN()` coerce without `Number.isFinite()` guard |
| F5 | low | dead-code | `src/lib/strategy/` — files deleted by a277613, broken imports |
| F6 | medium | fail-open | `src/lib/multi-asset/QuantPlatformIntegrationEngine.ts:117-118` | `marginCoverage ?? NaN` produces NaN in coverage detail |

---
## F1 — high — financial-integrity — `src/services/etf/EtfIntelligenceService.ts:18-21`
**Evidence:**
```ts
16:     const fetcher = async () => {
17:       return {
18:         nav: {
19:           navPerShare: 24500,
20:           marketPrice: 24550,
21:           premiumDiscountPct: 0.20,
22:         },
```
**Why it is a defect:** The `getSnapshot` method returns hardcoded synthetic values (navPerShare=24500, marketPrice=24550, premiumDiscountPct=0.20) regardless of the actual symbol or market data. These fabricated prices are presented as real, violating the fail-closed principle and the anti-mock data directive.
**Minimal fix:** Replace with actual data fetches from the ETF NavEngine or VPS provider; return `DATA_UNAVAILABLE` when real data is not accessible.

---
## F2 — high — financial-integrity — `src/lib/multi-asset/QuantPlatformIntegrationEngine.ts:99-118`
**Evidence:**
```ts
98:     if (input.derivativeNotionalCap !== undefined && input.derivativeNotionalCap !== null) {
99:       const dNot = Math.abs(summary.byClass.DERIVATIVE ?? NaN);
100:       limits.push({
101:         limit: `|derivative notional| <= ${input.derivativeNotionalCap}`,
102:         passed: Number.isFinite(dNot) ? dNot <= (input.derivativeNotionalCap as number) : null,
103:         detail: Number.isFinite(dNot) ? `Derivative notional ${Math.round(dNot)} VND.` : 'Derivative notional unknown.',
104:       });
105:     }
106:     if (input.cashFloorPercent !== undefined && input.cashFloorPercent !== null) {
107:       const net = summary.netAssets ?? NaN;
108:       const cash = summary.cashBalance ?? NaN;
109:       const pct = Number.isFinite(net) && net > 0 && Number.isFinite(cash) ? (cash / net) * 100 : NaN;
110:       limits.push({
111:         limit: `cash >= ${input.cashFloorPercent}% of net assets`,
112:         passed: Number.isFinite(pct) ? pct >= (input.cashFloorPercent as number) : null,
113:         detail: Number.isFinite(pct) ? `Cash ${pct.toFixed(2)}%.` : 'Cash ratio unknown.',
114:       });
115:     }
116:    if (summary.totalMarginRequired !== null && (summary.totalMarginRequired as number) > 0) {
117:      const cov = summary.marginCoverage ?? NaN;
118:      limits.push({
```
**Why it is a defect:** The `?? NaN` pattern: when `summary.byClass.DERIVATIVE` is `null`, `?? NaN` produces `NaN`, which fails `Number.isFinite(dNot)` on line 102, causing `passed: null` and detail "Derivative notional unknown." Same pattern on lines 107-109: when `netAssets` or `cashBalance` are null, `?? NaN` produces `NaN`, which makes `Number.isFinite(pct)` fail on line 112-113, presenting "Cash ratio unknown." as the detail instead of a meaningful value. Presenting `NaN` as a hidden failure mode is a fail-open default.
**Minimal fix:** Replace `?? NaN` with `?? null` and add explicit `null` checks before computing percentages/ratios; or use `finite()` from earnings helpers to convert NaN to null.

---
## F3 — medium — financial-integrity — `src/lib/corporate-actions/CorporateActionAdjustmentEngine.ts:66-90`
**Evidence:**
```ts
65:     const c = input.cashAmountVnd !== undefined && input.cashAmountVnd !== null ? input.cashAmountVnd : 0;
66:     if (!Number.isFinite(c) || c < 0) {
67:       throw new Error(`Invalid cashAmountVnd: "${c}". Cannot be negative.`);
68:     }
69: 
71:     const s = input.stockDividendRatio !== undefined && input.stockDividendRatio !== null ? input.stockDividendRatio : 0;
72:     if (!Number.isFinite(s) || s < 0) {
73:       throw new Error(`Invalid stockDividendRatio: "${s}". Cannot be negative.`);
74:     }
76: 
77:     const b = input.bonusRatio !== undefined && input.bonusRatio !== null ? input.bonusRatio : 0;
78:     if (!Number.isFinite(b) || b < 0) {
79:       throw new Error(`Invalid bonusRatio: "${b}". Cannot be negative.`);
80:     }
82: 
83:     let i = input.rightsRatio !== undefined && input.rightsRatio !== null ? input.rightsRatio : 0;
84:     if (!Number.isFinite(i) || i < 0) {
85:       throw new Error(`Invalid rightsRatio: "${i}". Cannot be negative.`);
86:     }
87: 
92:     const pIssue = input.issuePriceVnd !== undefined && input.issuePriceVnd !== null ? input.issuePriceVnd : 0;
93:     if (!Number.isFinite(pIssue) || pIssue < 0) {
94:       throw new Error(`Invalid issuePriceVnd: "${pIssue}". Cannot be negative.`);
95:     }
```
**Why it is a defect:** Optional parameters `cashAmountVnd`, `stockDividendRatio`, `bonusRatio`, `rightsRatio`, and `issuePriceVnd` all default to `0` when not provided (lines 65, 71, 77, 83, 92). When a corporate action does not involve a cash component (e.g., a pure stock split), defaulting `cashAmountVnd` to `0` and `issuePriceVnd` to `0` can produce incorrect ex-reference prices and adjustment factors. A `0` cash amount in the numerator `prevClose - c + (i * pIssue)` changes the result, and `issuePriceVnd = 0` in the OTM check `pIssue >= prevClose` always evaluates to false, potentially incorrectly applying the rights dilution factor. These silent defaults present `0` as a real value when the field should signify "not applicable."
**Minimal fix:** Propagate `null`/undefined when the field is not provided, and adjust the calculation logic to skip terms whose input is `null`/unset rather than defaulting to `0`.

---
## F4 — medium — data-provenance — `src/lib/derivatives/TermStructureEngine.ts:38-39`
**Evidence:**
```ts
37:     if (p1M == null || p2M == null || isNaN(p1M) || isNaN(p2M)) {
38:       return 'DATA_UNAVAILABLE';
39: ```
**Why it is a defect:** The `evaluateCurveShape` method uses `isNaN(p1M)` which performs type coercion — `isNaN("string")` returns `false`, `isNaN(null)` returns `false`, `isNaN(undefined)` returns `false`. This means invalid or missing values can silently pass the `isNaN` check and be treated as valid numbers, leading to incorrect curve shape classification (CONTANGO/BACKWARDATION/FLAT) when the inputs are actually null, undefined, or non-numeric. The method should use `Number.isFinite()` for strict numeric validation before curve evaluation.
**Minimal fix:** Replace `isNaN(p1M)` with `!Number.isFinite(p1M)` and add explicit `p1M == null || p2M == null` check before the `isNaN`/`isFinite` check.

---
## F5 — low — dead-code — `src/lib/strategy/` — files deleted by a277613, broken imports
**Evidence:** Commit `a277613` (2026-10-14) deleted 241 files and rewrote 62 files back to older versions. The strategy directory contains files that are broken due to missing imports; many callers now reference exports, files, or shapes that no longer exist.
**Why it is a defect:** Dead code that causes runtime `Module not found` errors for any caller attempting to import from the strategy directory. This is a repository-state issue from the a277613 commit, not a logic bug in the remaining code.
**Minimal fix:** Not applicable — this is a repository-state issue from a277613. Restore missing files or update all callers to use the new export paths.

---
## F6 — medium — fail-open — `src/lib/multi-asset/QuantPlatformIntegrationEngine.ts:117-118`
**Evidence:**
```ts
116:    if (summary.totalMarginRequired !== null && (summary.totalMarginRequired as number) > 0) {
117:      const cov = summary.marginCoverage ?? NaN;
118:      limits.push({
```
**Why it is a defect:** When `summary.marginCoverage` is `null` (no margin required or fail-closed null), `?? NaN` produces `NaN`. The `Number.isFinite(cov)` check on the detail line then fails, presenting "Margin coverage unknown." as the detail. While the `passed` field correctly becomes `null`, the detail string `NaN` is presented in the output, which is a fail-open default that displays `NaN` as if it were a real coverage ratio. This could mislead operators into thinking the coverage status is undefined rather than simply not applicable.
**Minimal fix:** Replace `?? NaN` with `?? null` and handle the `null` case explicitly in the detail string: `detail: summary.marginCoverage !== null ? `Coverage ${(cov as number).toFixed(2)}x.` : 'Margin coverage not applicable.'`

---
## Not checked / unsure
- **Citation checker**: Spot re-reading of findings by orchestrator; each evidence block must be copied verbatim from file within 10 lines of that line.
- **Full tsc error count (563)**: Baseline is unchanged by this task; specific errors new vs. pre-existing not mapped.
- **Interactions between MoneyFlowEngine and BacktestDataAdapter validation pipelines**: unsure if NaN propagation paths are fully mapped beyond the existing analysis audit findings.
- **Whether EnterpriseScoreEngine `isProvisional` logic correctly handles the case where `sumAvailableWeights` is between 50 and 100 but many metrics are silently 0 via `pointsFor` returning 0 for null scores**: this area overlaps with the analysis audit (F4) and was not re-audited for this file.
- **Exact reachability of EtfIntelligenceService into live server routes**: the service is imported in server.ts context but primarily returns empty data; unsure if its hardcoded values ever propagate into actual API responses in production.
- **Whether CapitalCycleEngine classifyStage truly enforces bar [0..i] window**: the classification uses policy/project drivers, not price bars; unsure if look-ahead bias exists in how drivers are supplied as-of a given date.