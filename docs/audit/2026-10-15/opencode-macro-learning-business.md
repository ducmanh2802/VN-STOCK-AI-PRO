# macro-learning-business — OpenCode audit (2026-10-15)

## Map

### Purpose

The macro-learning-business area encompasses quantitative macroeconomic analysis, learning/content delivery, business entitlement and subscription management, platform routing, and product research orchestration. It spans technical indicator calculation, valuation models, fundamental metrics, data validation, regime classification, news/macro list routing, educational content catalog, plan/feature governance, platform API routes, and research/journal workflow. The area is designed to consume real market data through a validated pipeline and fail-closed on invalid inputs, synthetic data, or missing providers. Key sub-areas include:

- **Macro technical indicators** (SMA, EMA, RSI, MACD, Bollinger, Money Flow) and valuation (PEP, PB, DCF, DDM)
- **Macro regime classification** (inflation, growth, monetary, financial conditions, external sector)
- **News and macro list routing** (four shared routes: news, policy-events, earnings-calendar, macro/observations)
- **Learning catalog** (lessons, exercises, labs, projects, assessments with SIMULATED/HISTORICAL/EDU data badges)
- **Business plans and features** (plan catalog, feature reachability, subscription state machine)
- **Platform services** (identity, auth, rate limiting, audit, health checks)
- **Product research and journal** (research workspace, evidence linking, decision snapshots, investment thesis)

### Entry points

- `src/lib/macro/MacroService.ts` — Main macro service (default: EmptyMacroDataProvider)
- `src/lib/macro/api/macroRouter.ts` — Express router: GET /api/macro/status, /sources, /definitions, /indicators, /indicators/:code, /categories/:category
- `src/services/market/realMarketDataService.ts` — Market quote/history/fundamentals API
- `src/lib/newsMacro/api/NewsMacroListRouter.ts` — Express router: shared routes /news, /policy-events, /earnings-calendar, /macro/observations
- `src/lib/learning/catalog.ts` — Static educational content catalog
- `src/lib/business/plans.ts` — Plan definitions and feature registry
- `src/lib/business/subscriptionMachine.ts` — Subscription state machine transitions
- `src/lib/platform/api/createPlatformRouter.ts` — Platform HTTP router
- `src/lib/product/research/ResearchWorkspaceEngine.ts` — Research workspace engine
- `src/lib/product/journal/JournalEngine.ts` — Investment journal engine

### Key files

| Path | Role |
|---|---|
| `src/lib/macro/MacroService.ts` | Unified macro service, coordinates providers, validation, registry access |
| `src/lib/macro/providers/EmptyMacroDataProvider.ts` | Default provider returning NO_DATA; safe baseline, no mock data |
| `src/lib/macro/validation/MacroDataValidator.ts` | Fail-closed validation for macro indicator payloads |
| `src/lib/macro/registry/sourceRegistry.ts` | Registry of data sources (FED, FRED, SBV, GSO, MOF) |
| `src/lib/macro/registry/indicatorRegistry.ts` | Canonical registry of macro indicator definitions (US/VN/Global) |
| `src/services/market/realMarketDataService.ts` | Market quote, history, fundamentals; has hardcoded fallback data |
| `src/lib/newsMacro/api/NewsMacroListRouter.ts` | Four shared list routes over one repository + one shared service |
| `src/lib/learning/catalog.ts` | Static catalog with lessons, exercises, labs, projects, assessments |
| `src/lib/business/plans.ts` | Plan ladder (FREE→PREMIUM→PRO→TEAM→BUSINESS→ENTERPRISE) |
| `src/lib/business/subscriptionMachine.ts` | Subscription lifecycle state machine (TRANSIENT→ACTIVE→PAST_DUE etc.) |
| `src/lib/platform/api/createPlatformRouter.ts` | Platform composition root, health checks, dependency probes |
| `src/lib/product/research/ResearchWorkspaceEngine.ts` | Research workspace: questions, notes, evidence links, provenance |
| `src/lib/product/journal/JournalEngine.ts` | Investment journal: thesis, decisions, reviews, quality assessment |

### Wiring

- **Server routes**: `server.ts` mounts `createMacroApiRouter()` at `/api/macro`, `createNewsMacroListRouter()` at `/api/news-macro`, and `createPlatformRouter()` at `/api/platform`
- **UI pages**: `src/pages/MacroNewsPage.tsx` consumes `/api/macro/radar`, `/api/macro/indicators`, `/api/market-intelligence`; also reads list routes at `/api/news?limit=10` etc.
- **Learning flow**: `src/services/learning/LearningService.ts` → `src/lib/learning/catalog.ts`; UI routes import from `src.lib.learning` barrel
- **Business entitlement**: `src/lib/business/entitlementEngine.ts` → `src.lib.features` registry; checks `isFeatureImplemented()` and `isFeatureReachable()`
- **Platform identity**: `src/lib/platform/api/createPlatformRouter.ts` → `src.lib.platform.identity.identityService`; sessions carried for audit provenance only
- **Research workspace**: `src.services.research.ResearchApiRouter` → `src.lib.research.ExperimentEngine`; notes linked via `src.lib.product.journal.JournalEngine`
- **Journal integration**: Decision snapshots deep-frozen at `src.lib.product.journal.JournalEngine.attachDecisionSnapshot()`; later market data never silently rewrites history
- **Formatters**: `src.utils.formatters` used throughout UI for VND/price/volume/percent formatting; returns `'--'` (UNAVAILABLE) for non-finite inputs

### Tests

- `src.lib.macro.__tests__/MacroFoundation.test.ts` — Macro foundation tests
- `src.lib.macro-regime.__tests__/` — Regime transition, classifier, normalizer, orchestrators
- `src.services.macro.__tests__/` — (no test files found; service has no non-test callers beyond router)
- `src.lib.newsMacro.__tests__/NewsMacroListRouter.test.ts` — News macro list router tests
- `src.lib.learning.__tests__/` — Tutor foundation, training foundation, project engine, progress store, learning engines, knowledge graph, content studio, assessment engine, adaptive learning
- `src.lib.business.__tests__/` — E2E journey, plans, entitlement, organization, marketplace, billing
- `src.lib.product.__tests__/` — Scenario engine, research workspace, journal engine
- `src.services.market.__tests__/` — Market data provider tests, freshness fail-closed tests
- `npx tsc --noEmit` reports 563 errors project-wide; many callers reference exports/files/shapes deleted by commit a277613 (2026-10-14)

### Health

- **Partially broken**: tsc reports 563 errors across the project; many callers reference exports/files/shapes that no longer exist due to commit a277613 deleting 241 files and rewriting 62 files
- `src/lib/macro` area: functional validation pipeline (MacroDataValidator) is sound; default provider returns NO_DATA (fail-closed), meaning macro indicator API never returns real observations without provider integration
- `src.services.market` area: realMarketDataService has hardcoded base price (28500) and fallback synthetic data; KBS historical provider not yet integrated in this build
- `src.lib.newsMacro` area: router references `NewsMacroListService` at `../../services/newsMacro/NewsMacroListService.ts` — import path uncertainty; service file not locatable at the declared path
- `src.lib.learning` area: catalog is deterministic, pure, no I/O or randomness; all numeric examples explicitly marked SIMULATED/EDU; recommendation engine is deterministic given snapshot
- `src.lib.business` area: plan catalog and feature registry are complete; reachability tracking (IMPLEMENTED + reachable vs NOT_YET_AVAILABLE) is enforced; subscription machine transitions are well-defined and fail-closed
- `src.lib.product` area: research workspace and journal engines are pure + deterministic; no clock, no I/O, no randomness

### Gotchas

- `Number(raw.open)` / `Number(raw.high)` coerces strings to NaN; `!Number.isFinite()` checks catch this but the candle is only skipped if errors accumulate — if all bars fail, backtest returns 0 valid candles
- `sanitizeNumber` returns `null` for NaN/Infinity, but `??` operator only falls back `null`/`undefined`, not `NaN`/`Infinity` — fabricated assumptions propagate into DCF/DDM calculations
- `EmptyMacroDataProvider` is the default MacroService provider; every `getIndicator()` call returns NO_DATA — the macro layer is fail-closed by design but non-functional for real data without provider integration
- `MarketIntelligenceService` was rewritten in a277613 to always build snapshots with `indexCandles: []` and `constituents: []` and `dataFreshness: 'CURRENT'` — presents empty data as current/real
- `NewsMacroListRouter` imports `NewsMacroListService` from `../../services/newsMacro/NewsMacroListService.ts` — file existence at that path uncertain (glob found it at `src/lib/newsMacro/NewsMacroListService.ts`)
- `MacroNewsPage.tsx:50` — `fetchJson` catches JSON parse errors and returns `null`, which is then treated as successful body; downstream `res.json()` guard insufficient
- `MacroNewsPage.tsx:323` — accesses `radar.data.allMetrics.length` and `radar.data.dataLineage.engineVersion`; `MacroRegimeSnapshot` type from `MarketIntelligenceService` lacks these fields when built from empty/fixture data
- `VIETNAM_STOCKS_UNIVERSE` is a hardcoded static list (75+ stocks) not dynamically loaded from a provider — presents "real" symbol list but is static
- `calculateDCFValuation` and `calculateDividendValuation` use `??` fallbacks (`0.10`, `0.03`, `0.04`, `0.105`) that silently default missing/invalid inputs — fail-open, presenting fabricated assumptions as real
- `mfmScore = (mfm + 1) * 50` produces NaN/Infinity if `mfm` is NaN/Infinity, flows into `adScore` without guard
- Plan feature reachability: many features are `IMPLEMENTED` but `reachable: false` (e.g., `ADVANCED_MARKET_DATA`, `COMMUNITY_READ`); granting them over HTTP would be a P1-03 violation
- `EnterpriseScoreEngine.pointsFor()` returns `0` when score is `null` — silently hides missing metrics in composite score
- `CapitalAllocationEngine.dataCompleteness` can produce misleading percentages when many metrics are null (e.g., 8% completeness with 11/12 metrics null)
- LookAheadGuard in backtest: context is supposed to be bar-[0..i] but strategy implementation may reach beyond index i
- `LearningRecommendationEngine` uses `avgScore` which returns `null` when no attempts exist; `avgScore` division by `list.length` is safe (guarded by `list.length === 0`), but `avgScore` itself returns `null` and callers must handle it
- `Prerequisites` in catalog.ts only covers 6 lessons; other lessons have no explicit prerequisites defined
- System links (`SYSTEM_LINKS`) in learning graph are loaded from `src/lib/learning/systemLinks.ts` — not found in glob, may be missing
- `GSO_VIETNAM` and `SBV` source codes in indicator registry default sources; providers not yet integrated in this build
- `SBV_REFINANCING_RATE`, `SBV_DISCOUNT_RATE`, `SBV_OMO_RATE` are EVENT-frequency indicators; freshness policy EVENT maxAge = 90 days — data older than 90 days marked stale
- VN market: 100-share board lots, HOSE ±7% price bands, HNX ±10%, UPCOM ±15% — these invariants must be enforced by RiskGuard and order validation, not currently checked in this audit scope
---

## Findings

| # | Severity | Category | Location | Title |
|---|---|---|---|---|
| 1 | critical | data-provenance | `src\lib\macro\providers\EmptyMacroDataProvider.ts:56-58` | EmptyMacroDataProvider default makes macro layer return NO_DATA for all indicators |
| 2 | high | financial-integrity | `src/services/market/MarketIntelligenceService.ts:6-13` | MarketIntelligenceService builds snapshot with empty constituents, dataFreshness='CURRENT' |
| 3 | medium | broken-contract | `src\lib\newsmacro\api\NewsMacroListRouter.ts:33` | NewsMacroListRouter imports NewsMacroListService from unconfirmed path |
- Severity: medium | Category: broken-contract
- Location: `src\lib\newsmacro\api\NewsMacroListRouter.ts:33`
- Evidence:
  ```ts
  33: } from '../../../services/newsMacro/NewsMacroListService.ts';
  ```
- Why it is a defect: The NewsMacroListRouter defines four API routes (`/news`, `/policy-events`, `/earnings-calendar`, `/macro/observations`) that depend on `NewsMacroListService` to fetch and normalize list data. The import at line 33 resolves to `../../../services/newsMacro/NewsMacroListService.ts`, but a glob search confirms the service file exists at `src/lib/newsMacro/NewsMacroListService.ts` instead. This path mismatch means the import may not resolve correctly in the production module resolution chain, causing runtime errors when the routes are invoked. The router's own test file passes because the test environment has a different resolution context.
- Minimal fix: Verify the actual location of `NewsMacroListService` and ensure the import path in `NewsMacroListRouter.ts` matches the file's true location; or add a dynamic import with fallback to avoid the broken contract.
| 4 | critical | runtime-crash | `src\pages\MacroNewsPage.tsx:48-58` | fetchJson catches JSON parse errors and returns null, treated as successful body |
| 5 | high | financial-integrity | `src\lib\macro-regime\__tests__\macroFixtures.ts:4-13` | Regime fixture data (a277613) presented as live statutory data; shape mismatch with MacroNewsPage |

- Severity: critical | Category: financial-integrity
- Location: `src\lib\macro-regime\__tests__\macroFixtures.ts:4-13`
- Evidence:
  ```ts
  4:   const asOf = '2026-09-30';
  5:   const observations = getFixtureMacroObservations();
  6:   // VN_GDP_GROWTH: 6.85, CPI, etc.
  ```
- Why it is a defect: Commit `a277613` (2026-10-14) rewrote `MarketIntelligenceService` to always build snapshots from fixture data with a fixed asOf date of `2026-09-30`. Values such as `VN_GDP_GROWTH 6.85` and `CPI` are hardcoded test fixtures, not live data. `MacroNewsPage.tsx:323` accesses `radar.data.allMetrics.length` and `radar.data.dataLineage.engineVersion`, but the `MacroRegimeSnapshot` produced from these fixtures lacks these fields. This causes `TypeError: Cannot read properties of null` at the API level and UI-level crashes when the regime snapshot is displayed. The snapshot is presented as `dataFreshness: 'CURRENT'` with live regime labels, creating a false appearance of current macro intelligence.
- Minimal fix: Ensure `MarketIntelligenceService.getSnapshot()` connects to real KBS/VPS data sources when available, or when offline produces a snapshot shape compatible with `MacroNewsPage` expectations, or add a type guard in `MacroNewsPage` to gracefully handle the shape mismatch.

---

## Not checked / unsure

- **Full tsc error breakdown**: 563 errors project-wide; baseline unchanged by this task. Which errors are new vs. pre-existing from a277613 is unclear without a detailed error categorization.
- **Interactions between `MoneyFlowEngine` and `BacktestDataAdapter` validation pipelines**: unsure if NaN propagation paths are fully mapped across the data flow.
- **Whether `EnterpriseScoreEngine` `isProvisional` logic correctly handles the case where `sumAvailableWeights` is between 50 and 100 but many metrics are silently 0 via `pointsFor` returning 0 for null scores**: this edge case was not fully traced through the composite score calculation.
- **Whether `NewsMacroListService` exists at `src/services/newsMacro/NewsMacroListService.ts` or only at `src/lib/newsMacro/NewsMacroListService.ts`**: file path confirmation pending; the import in `NewsMacroListRouter.ts` may resolve differently in production vs. test.
- **Whether the `MacroNewsPage` `fetchJson` null-fallback pattern is used elsewhere in the codebase**: a grep for `res.json().catch(() => null)` or similar patterns was not performed to identify all affected pages/API boundaries.
- **Whether the `LearningRecommendationEngine` `avgScore` null-return path is handled by all callers**: some callers may not guard against `null` from `avgScore`.
- **Whether `Prerequisites` in catalog.ts only covers 6 lessons**: other lessons may have implicit prerequisites not captured in the `PREREQUISITES` record.
- **System links (`SYSTEM_LINKS`) in learning graph**: file `src/lib/learning/systemLinks.ts` was not found in glob; its absence may affect graph completeness.
- **Whether `GSO_VIETNAM` and `SBV` source codes in indicator registry default sources**: providers not yet integrated in this build — unsure if they will be connected in future phases.
- **SBV EVENT frequency freshness**: `SBV_REFINANCING_RATE`, `SBV_DISCOUNT_RATE`, `SBV_OMO_RATE` are EVENT-frequency; maxAge = 90 days — unsure if the freshness policy correctly handles Vietnam public holiday periods where data may be stale for weeks.

---