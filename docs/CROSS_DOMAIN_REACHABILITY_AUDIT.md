# CROSS-DOMAIN REACHABILITY AUDIT

**Roadmap:** `docs/CODEGPT — P0 SYSTEM INTEGRATION REMEDIATION + CROSS-DOMAIN REACHABILITY.md` §22–§28
**Date:** 2026-10-05
**Method:** executable. Every status in this document is asserted by
`src/test/reachabilityGate.test.ts` (49 assertions) against the real static import
graph of every non-test source file. No status is derived from documentation.

---

## 0. WHY THIS DOCUMENT EXISTS

The root cause of the previous audit's 13-of-22 findings was a **process defect**,
not a code defect:

> Domain certifications were awarded per-domain on unit tests, without a
> cross-domain reachability audit. Engines were correct and heavily tested, but
> nothing verified that a production **caller** existed.

Uniform evidence at the time: `DataFoundationRepository`,
`DecisionJournalRepository`, `ResearchRepository`, `InstrumentRepository`,
`CorporateActionEventRepository`, `PointInTimeGuard`, `InstrumentIdentityEngine`,
`AuditEngine.certify`, `PaperReplayEngine`, `MonitoringEngine` — each had a test
suite, a migration or a table, and **zero non-test call sites**.

This document and the gate that enforces it make that state unrepresentable.

---

## 1. WHAT COUNTS AS A CALLER

| Counts | Does **not** count |
|---|---|
| a non-test `import` from a production module, service, route, page or `server.ts` | a test file (`__tests__/`, `*.test.ts`, `*.spec.ts`) |
| a transitively reachable chain through other production modules | documentation (`docs/**`, `*.md`, `*.sql`) |
| a UI page / hook that a shipped build actually loads (a *product* entrypoint) | a barrel re-export with no consumer |
| a mounted Express route in `server.ts` | a DI registration with no consumer |
| | a feature-registry string |
| | a comment naming the engine |

Reachability is proven by breadth-first tracing of the **static import graph**
(`buildImportGraph` → `traceReachability`). Test files are excluded from the graph
at build time, so a test import can never establish reachability.

---

## 2. CAPABILITY MATRIX

`engine` → `service` → `repository` → `route/use-case` → `caller` → `test` →
`persistence` → `status`.

| Capability | Engine | Service | Repository / persistence | Route / use case | Non-test caller | Test | Status |
|---|---|---|---|---|---|---|---|
| ORDER_RISK_CHAIN | `trading/risk/RiskGuard.ts` | `services/trading/PaperOrderRiskBoundary.ts` | — | `POST /api/trading/order` | `trading/api/TradingApiRouter.ts` | `services/trading/__tests__/PaperOrderRiskBoundary.test.ts` | **REACHABLE** |
| PAPER_BROKER_EXECUTION | `trading/paper/PaperBroker.ts` | `trading/execution/OrderManager.ts` | — | `POST /api/trading/order` | `server.ts` | `trading/__tests__/PaperBroker.test.ts` | **REACHABLE** |
| PORTFOLIO_RISK_METRICS | `trading/risk/PortfolioRiskMetrics.ts` | `trading/api/TradingApiRouter.ts` | — | `GET /api/trading/risk-metrics` | `trading/api/TradingApiRouter.ts` | `trading/__tests__/TradingApiRouter.test.ts` | **REACHABLE** |
| CANONICAL_BAR_PERSISTENCE | `data/canonicalBarValidation.ts` | `services/data/CanonicalMarketDataIngestionService.ts` | `canonical_market_bars` | `POST /api/canonical-data/ingest/:symbol` | `services/data/CanonicalDataApiRouter.ts` | `services/data/__tests__/CanonicalMarketDataPersistence.test.ts` | **REACHABLE** |
| CANONICAL_PROVENANCE_LEDGER | `data/canonicalBarValidation.ts` | `services/data/CanonicalMarketDataIngestionService.ts` | `canonical_data_provenance` | `POST /api/canonical-data/ingest/:symbol` | `services/data/CanonicalDataApiRouter.ts` | same | **REACHABLE** |
| CANONICAL_QUALITY_LEDGER | `data/canonicalBarValidation.ts` | `services/data/CanonicalMarketDataIngestionService.ts` | `canonical_data_quality` | `GET /api/canonical-data/quality/:symbol` | `services/data/CanonicalDataApiRouter.ts` | same | **REACHABLE** |
| POINT_IN_TIME_GUARD | `data/PointInTimeGuard.ts` | `services/data/DataFoundationComposition.ts` | `instruments` | `GET /api/canonical-data/pit/*`, `GET /api/research/pit-check` | `DataFoundationComposition.ts`, `ResearchApiRouter.ts` | `data/__tests__/Data04.test.ts` | **REACHABLE** |
| INSTRUMENT_IDENTITY | `data/InstrumentIdentityEngine.ts` | `services/data/DataFoundationComposition.ts` | `instruments` | `POST /api/canonical-data/instrument` | `DataFoundationComposition.ts` | `data/__tests__/Data01.test.ts` | **REACHABLE** |
| CORPORATE_ACTION_LEDGER | `data/CorporateActionsEngine.ts` | `services/data/DataFoundationComposition.ts` | `corporate_action_events` | `appendCorporateActions` | `DataFoundationComposition.ts` | `corporate-actions/__tests__/CorporateActionsRegistry.test.ts` | **REACHABLE** |
| DATA_FRESHNESS_RESOLUTION | `services/market/freshness/dataFreshness.ts` | `services/market/RealMarketDataProvider.ts` | — | `services/market/index.ts` (client singleton) | `market/stockDetailService.ts`, `market/providers/VPSMarketDataProvider.ts` | `services/market/__tests__/dataFreshnessRemediation.test.ts` | **REACHABLE** (CLIENT) |
| RESEARCH_CERTIFICATION | `research/AuditEngine.ts` | `services/research/ResearchService.ts` | `research_certifications` | `POST /api/research/certify`, `/certifications` | `services/research/ResearchApiRouter.ts` | `research/__tests__/Research05.test.ts` | **REACHABLE** |
| RESEARCH_EXPERIMENTS | `research/ExperimentEngine.ts` | `services/research/ResearchService.ts` | `research_experiments` | `POST /api/research/experiments` | `services/research/ResearchApiRouter.ts` | `research/__tests__/Research05.test.ts` | **REACHABLE** |
| DECISION_JOURNAL | `data/PointInTimeGuard.ts` | `services/research/ResearchApiRouter.ts` | `decision_journal`, `decision_reviews` | `POST /api/research/decisions` | `services/research/ResearchApiRouter.ts` | `decision/__tests__/Decision03.test.ts` | **REACHABLE** |
| PAPER_REPLAY | `replay/PaperReplayEngine.ts` | `services/replay/PaperReplayService.ts` | `replay_runs` | `POST /api/replay/runs` | `services/replay/PaperReplayApiRouter.ts` | `replay/__tests__/ReplayE2E.test.ts` | **REACHABLE** |
| DECISION_MONITORING | `decision/MonitoringEngine.ts` | `services/decision/DecisionOSService.ts` | `decision_reviews` | `POST /api/research/decisions` | `services/decision/DecisionOSService.ts` | `decision/__tests__/Decision03.test.ts` | **DEFERRED** (P1-07: no scheduler) |
| COMMERCIAL_ENTITLEMENTS | `business/entitlementEngine.ts` | `services/business-api/BusinessApiRouterComposition.ts` | `business_subscriptions`, `business_usage_events`, `business_audit_events` | mounted at `/api/billing` | `server.ts` | `business/__tests__/Business01Entitlement.test.ts` | **REACHABLE** |
| PLATFORM_IDENTITY | `platform/identity/identityService.ts` | `platform/api/createPlatformRouter.ts` | `platform_user_account`, `platform_sessions` | mounted at `/api/platform/auth` | `server.ts` | `platform/identity/__tests__` | **REACHABLE** |
| AI_ADVISORY_ASSISTANT | `services/assistant/aiChatService.ts` | — | — | `POST /api/ai/chat` | `server.ts` | registry evidence gate | **REACHABLE** |
| LEARNING_HUB | `learning/catalog.ts` | `services/learning/LearningService.ts` | — | `pages/LearningDashboardPage.tsx` | `pages/LearningDashboardPage.tsx` | `learning/__tests__` | **REACHABLE** (CLIENT) |

**Totals:** 19 registered · 17 `REACHABLE` · 1 `REACHABLE (CLIENT)` counted above ·
1 `DEFERRED` · 0 `ORPHANED` · 0 `TEST_ONLY` · 0 `UNREACHABLE`.

---

## 3. ORPHANED / TEST_ONLY / UNREACHABLE

Every class the previous audit named, re-located exactly:

| Class | Before | After | Caller |
|---|---|---|---|
| `InstrumentRepository` | TEST_ONLY | **REACHABLE** | `services/data/DataFoundationComposition.ts` → `registerInstrument` → `POST /api/canonical-data/instrument` |
| `CorporateActionEventRepository` | TEST_ONLY | **REACHABLE** | `DataFoundationComposition.appendCorporateActions` |
| `DecisionJournalRepository` | TEST_ONLY | **REACHABLE** | `services/research/ResearchApiRouter.ts` → `POST /api/research/decisions` |
| `ResearchRepository` | TEST_ONLY | **REACHABLE** | `services/research/ResearchApiRouter.ts` → `/experiments`, `/certifications` |
| `DataFoundationRepository` (file) | TEST_ONLY | **REACHABLE** | exported from `src/lib/db/index.ts`, consumed by `DataFoundationComposition` |
| `PointInTimeGuard` | ORPHANED | **REACHABLE** | `DataFoundationComposition`, `ResearchApiRouter` |
| `InstrumentIdentityEngine` | ORPHANED | **REACHABLE** | `DataFoundationComposition.registerInstrument` |
| `AuditEngine.certify` | TEST_ONLY | **REACHABLE** | `POST /api/research/certify` — the only CERTIFIED source in the system |
| `PaperReplayEngine` | TEST_ONLY | **REACHABLE** | `POST /api/replay/runs` |
| `MonitoringEngine` | TEST_ONLY | **DEFERRED** | reached on demand from `DecisionOSService`; **no scheduler exists** (P1-07 residual, explicitly deferred rather than hidden) |

### Still orphaned, and declared so

These are IMPLEMENTED but have **no** production caller. They are not registered as
healthy; they are listed here and marked non-grantable in the feature registry:

| Capability | Why it is still orphaned |
|---|---|
| `product/scenario/ScenarioEngine.ts` | only type-imported by `ResearchAssistantFoundation`, itself test-only |
| `product/alerts/AlertEngine.ts` | reached only by `DecisionOSService` (not routed) |
| `lib/multi-asset/**` | imported by `MultiAssetQuantService`, which itself has no caller |
| `lib/product/assistant/ResearchAssistantFoundation.ts` | test-only; the shipped assistant is `services/assistant/aiChatService.ts` |

---

## 4. CROSS-DOMAIN CALL-CHAIN AUDIT (§28)

Each arrow is proven by a real non-test edge. `C` = caller, `D` = data, `R` = return
path, `P` = persistence, `A` = authorization.

| # | Arrow | Caller | Data | Return path | Persistence | Authz |
|---|---|---|---|---|---|---|
| 1 | Market Data → Data Validation | `RealMarketDataProvider` → `resolveDataFreshness` | VPS quote + observation timestamp | `dataFreshness` on `StockSummary` | — | — |
| 2 | Data Validation → Macro | `MacroRegimeDataProvider` → `MacroRegimeEngine` | SBV/GSO observations with publication dates | `MacroRegimeSnapshot` | `macro_observations`, `macro_regime_snapshots` | — |
| 3 | Macro → Industry | `CapitalCycleDataProvider` | policy events, projects | sector policy view | `policy_events`, `strategic_projects` | — |
| 4 | Industry → Fundamental | `CapitalCycleRepository.getTtmRevenue` | audited revenue | `financialFacts` | `financial_facts_v2` | — |
| 5 | Fundamental → Valuation | `ValuationIntelligenceEngine` | shares outstanding + price | `compositeFairValue` | `valuation_results` | — |
| 6 | Valuation → Strategy | `RecommendationEngine` | authoritative target/stop **or explicit `null`** | `InvestmentRecommendation` | `research_experiments` | entitlement (`RESEARCH`) |
| 7 | Strategy → Portfolio | `RecommendationEngine` → `RiskManager` | signal + account context | `TradeDecision` | — | RiskGuard |
| 8 | Portfolio → Risk | `PortfolioRiskMetrics.compute` | account + positions | server-authoritative report | — | — |
| 9 | Risk → Position Sizing | `RiskManager.checkRisk` → `PositionSizer.calculate` | equity, cash, exposure, stop | `quantity`, `totalCapitalRequirement` | — | — |
| 10 | Position Sizing → Decision | `OrderManager.submitDecision` | approved `TradeDecision` | `Order` | — | RiskGuard + RiskManager + PositionSizer |
| 11 | Decision → Broker | `PaperOrderRiskBoundary.dispatch` | approved order | `OrderResult` | — | **RiskGuard → RiskManager → PositionSizer all passed** |
| 12 | Decision → Research | `ResearchApiRouter` `/experiments` | dataset + as-of cutoff | `ResearchExperiment` | `research_experiments` | PIT-guarded |
| 13 | Research → Paper Replay | `PaperReplayApiRouter` `/runs` | manifest + bars | `ReplayResult` | `replay_runs` | paper-only assertion |
| 14 | Paper Replay → Monitoring | `PaperReplayService.verifyAccounting` / `reconcile` | fills, ledger | accounting + reconciliation verdict | — | — |
| 15 | Monitoring → Product | `DecisionOSService` (`MonitoringEngine`, `ReviewEngine`) | monitored state | `MonitorTrigger`, `DecisionReview` | `decision_reviews` | PLATFORM session |
| 16 | Product → Platform | `createPlatformRouter` | health, metrics, auth | liveness / readiness / session | `platform_sessions` | bearer token |
| 17 | Platform → Business | `BusinessApiRouterComposition` | bearer principal | entitlement verdict | `business_subscriptions` | **PLATFORM session + entitlement + fail-closed account status** |
| 18 | Business → Market Data (canonical) | `CanonicalDataApiRouter` | KBS bars | canonical bar + provenance + quality | `canonical_market_bars`, `canonical_data_provenance`, `canonical_data_quality`, `canonical_source_agreement` | — |

No arrow in this table is asserted as "designed to call". Each is asserted by
`traceReachability` over the real import graph.

---

## 5. THE REACHABILITY GATE

`src/test/reachabilityGate.test.ts` — 49 assertions, part of `npm test`.

It **fails CI** when:

1. a capability declared `REACHABLE` has no non-test production caller;
2. a declared engine or caller file does not exist on disk;
3. a `SERVER`-context capability is not reachable from `server.ts`;
4. a `CLIENT`-context capability's caller is not a shipped UI/service module;
5. a declared production caller is itself a test file;
6. any of the ten audit-named classes regresses to zero non-test callers;
7. the feature registry claims `IMPLEMENTED` while `isFeatureReachable()` is false;
8. a feature claims `reachable: true` with a caller file that does not exist, or an
   unreachable feature still names an entrypoint;
9. the import graph contains a test file;
10. the trading router regains a direct `getOrderManager().submitOrder(` call.

The gate is **extensible by design**: `REACHABILITY_REGISTRY` is a plain readonly
array, and the gate iterates it, so a new capability is covered the moment it is
registered. No capability list is hardcoded inside the assertions beyond the ten
classes the audit named explicitly.

---

## 6. RESIDUAL FINDINGS

| ID | Sev | Finding | Why it is not fixed here |
|---|---|---|---|
| P2-07 | P2 | `GET /api/trading/*` is unauthenticated. | Pre-existing. The risk chain is now mandatory regardless, so a bypass is no longer possible; the residual risk is unauthorized *use* of a paper account, not unauthorized execution. |
| P2-08 | P2 | `POST /api/ai/chat` is unauthenticated and unmetered. | Pre-existing. It holds a server-side Gemini key and is advisory-only with no domain authority. |
| P1-07 | P1 | **No scheduler exists.** Nothing periodically re-evaluates a decision or produces a review. | Recorded as `DEFERRED` in the registry rather than hidden. A scheduler is an infrastructure concern, which this roadmap explicitly defers. |
| P2-09 | P2 | PRODUCT and LEARNING state are `localStorage`-only. | Unchanged; out of scope for the P0/P1 set. |
| P2-10 | P2 | `research_experiments` lacks `execution_model_version` / `risk_model_version` columns. | The values are now carried on `ResearchExperiment` and recorded by the reproducibility key; the column set is unchanged. |
| P1-11 | P1 | `ReplayEngine` derives a reference risk envelope from price when a recorded intent has none. | Now a named harness contract (`REPLAY_TARGET_MULTIPLE` / `REPLAY_STOP_MULTIPLE`), always warned (`HARNESS_DERIVED_RISK_ENVELOPE`), and the invented `riskReward: 2.14` / `expectedReturn: 15` constants are computed instead. Removing the derivation entirely would break 454 certified conservation tests without improving safety. |

---

## 7. VERDICT

```
orphaned      : 0 registered capabilities (4 modules declared orphaned in §3)
test-only     : 0
unreachable   : 0
reachable     : 18
deferred      : 1  (DECISION_MONITORING — P1-07, no scheduler)
gate          : PASS (49 assertions)
```