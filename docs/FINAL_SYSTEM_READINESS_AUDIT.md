# FINAL SYSTEM READINESS AUDIT

**Roadmap:** `docs/CODEGPT — FINAL AUTONOMOUS COMPLETION → CERTIFICATION → PRODUCTION READINESS → GITHUB PUSH.md` §8
**Date:** 2026-10-05
**Method:** read-only cross-domain audit. Every claim below was verified by direct inspection,
not accepted from a prior report. Concatenated evidence commands are recorded inline.
**Verdict:** `NOT_READY` — **P0 = 4, P1 = 9**

> This audit deliberately does **not** accept the roadmap's §1 premise that Platform is
> `P0 = 0, P1 = 0`. Four P0 findings were verified by reading the code, and none appears in
> any existing certification document. The most serious is a risk-stack bypass on the only
> reachable order endpoint.

---

## 0. MEASURED BASELINE

```
tsc --noEmit          0 errors
vitest run            205 files / 2213 tests / 0 failures
npm run build         PASS
git HEAD              1068f39  (== origin/main, nothing to push)
uncommitted           2 dirs — src/lib/db/business06/, src/services/business06/ (CONCURRENT)
```

---

## 1. THE 19-DOMAIN CHAIN — VERDICT PER LINK

| # | Domain | Wired? | Persisted? | Verdict |
|---|---|---|---|---|
| 1 | REAL DATA | partially | **NO canonical bar/provenance/quality table** | **P0** |
| 2 | DATA VALIDATION | partially | guards exist but unreachable | **P0** |
| 3 | MACRO | yes | yes | OK |
| 4 | INDUSTRY | yes | partially | P2 |
| 5 | FUNDAMENTALS | **synthesised** | no | **P0** |
| 6 | VALUATION | **synthesised** (`price × 1.18`) | no | **P0** |
| 7 | STRATEGY | yes | no | P2 |
| 8 | PORTFOLIO | yes | yes | OK |
| 9 | RISK | **bypassed at the live order path** | n/a | **P0** |
| 10 | POSITION SIZE | **bypassed at the live order path** | n/a | **P0** |
| 11 | DECISION | engine yes | **repo has 0 callers** | P1 |
| 12 | RESEARCH / BACKTEST | engine yes | **0 routes, 0 importers** | P1 |
| 13 | PAPER REPLAY | engine yes | **0 routes, 0 non-test callers** | P1 |
| 14 | MONITORING | on-demand only | no scheduler exists | P1 |
| 15 | DECISION REVIEW | engine yes | unreachable | P2 |
| 16 | PRODUCT | yes | **localStorage only** | P2 |
| 17 | PLATFORM | yes | yes | OK |
| 18 | BUSINESS | yes | domain certified, **router unmounted** | P1 |
| 19 | LEARNING | yes | **localStorage only** | P2 |

**The chain is built and typed; it is not connected.** The dominant defect pattern is
**orphaned persistence**: migrations and repositories shipped with no call sites.

---

## 2. P0 FINDINGS

### P0-01 — The only reachable order endpoint bypasses the entire risk stack

**Verified:**
```
$ grep -rn "import { RiskGuard }" src --include=*.ts | grep -v __tests__
src/lib/trading/paper/PaperExecutionEngine.ts:48      <- the ONLY importer

$ OrderManager.submitOrder            (src/lib/trading/execution/OrderManager.ts:129)
  async submitOrder(request) {
    const result = await this.broker.submitOrder(request);   // <- straight to broker
    ...
  }

$ TradingApiRouter.ts:263
  const orderResult = await engine.getOrderManager().submitOrder({ ... });
```

`POST /api/trading/order` therefore reaches `PaperBroker` with **no `RiskGuard`, no
`RiskManager`, no `PositionSizer`**. `PaperExecutionEngine` — the only file that imports
`RiskGuard` — is itself instantiated only by the legacy `ReplayEngine`
(`src/lib/trading/replay/ReplayEngine.ts:176`), which no HTTP route reaches.

Pre-trade checks in the router (`TradingApiRouter.ts:123-262`) are hand-rolled: idempotency,
kill switch, price band, short-sell, anti-pyramiding, cash. **No position sizing.**

**This directly violates the roadmap's own §0** ("Do not bypass RiskGuard / RiskManager /
PositionSizer") and §19. **P0.**

### P0-02 — Freshness labels are literals in the path that serves the UI

**Verified:**
```
$ grep -n "dataFreshness: 'CURRENT'" src/services/market/RealMarketDataProvider.ts
133:          dataFreshness: 'CURRENT',
504:        dataFreshness: 'CURRENT',
```

`RealMarketDataProvider.ts` stamps **every** `StockSummary` `'CURRENT'` with
`sourceTimestamp: null` (`:135`) and performs **no age comparison anywhere in the file**.
`getStockDetail` (`:468-512`) re-stamps `'CURRENT'` at `:504` regardless of cached age, so a
STALE value re-presents as CURRENT.

The `CURRENT | STALE | UNAVAILABLE | INVALID` model exists (`src/types/stock.ts:7`) and is
correctly implemented in `MacroRegimeEngine.ts:205-211` ("STALE is never masked by CURRENT").
It is simply not used on the path the UI actually reads. A second instance:
`CorporateActionSnapshotBuilder.ts:109-112` forces `freshness = 'CURRENT'` when
`actions.length === 0`. **P0** — this is the exact failure the state model exists to prevent.

### P0-03 — Unsourced synthetic financial values presented as real

**Verified:**
```
$ sed -n '115p' src/services/market/RealMarketDataProvider.ts
  marketCap: Number((price * 1_000_000 / 1e9).toFixed(1)), // Estimated cap in tỷ VND
```
and `:493` identical, plus `:178-199, 227, 244, 250-278` (index levels from hardcoded bases
`1285.0` / `1320.5` / `238.5` / `98.2` with synthesised sparklines), and `:621-635` where
`foreignFlow.netValue = 185.4`, `proprietaryFlow = 62.1`, `retailFlow = -247.5` are **plain
literals with no data source at all**.

`src/services/product/stockDetailService.ts` compounds it: `fairValue = price × 1.18`,
`dcfValue = fairValue × 1.04`, `pbBookValue × 0.95`, `grahamValue = price × 1.12`
(`:140, 191-194`), `confidence: 88` (`:164`), `foreignOwnershipPercent: 32.4` (`:185`).

To be precise about what is **not** wrong: no price is `Math.random()`-generated
(only 6 `Math.random()` hits, all paper-trading ID strings), and `src/data/mock/marketData.ts`
is reachable only from the unused `src/db/seed.ts`. The defect is **hardcoded literals in
production market paths**, presented without `isDemo`. **P0.**

### P0-04 — Canonical bars, provenance and quality have no table at all

`drizzle/0003_data_foundation.sql` creates exactly 2 tables: `instruments` (17 cols) and
`corporate_action_events` (21 cols). There is **no** canonical bar table, **no** provenance
record table, **no** quality record table. The only bar persistence is
`stock_daily`, written by a one-off script hardcoded to `'HPG'`
(`src/scripts/import-hpg-kbs.ts:21, 115`) with no `source`, `quality` or `retrievedAt` column.

Historical bars are the substrate for every backtest, model and certification in the system.
Without them nothing downstream is reproducible. **P0.**

---

## 3. P1 FINDINGS

| ID | Finding | Evidence |
|---|---|---|
| P1-01 | **All four persistence repositories are dead code.** `InstrumentRepository`, `CorporateActionEventRepository`, `DecisionJournalRepository`, `ResearchRepository` each have **0 callers** and are absent from `src/lib/db/index.ts`. Every decision, corporate action and experiment is silently dropped. | grep: definitions only |
| P1-02 | **Research lane entirely unreachable.** `grep -rn "services/research" src server.ts` → 0; `grep -c research server.ts` → 0. `AuditEngine.certify` (the 8-condition gate) is called only from `Research05.test.ts:63-64`. `ResearchReport.certification` is never populated. | verified |
| P1-03 | **The business feature registry overstates reachability.** `src/lib/business/features.ts:105-113` marks `RESEARCH`, `BACKTEST`, `RESEARCH_CERTIFICATION` as `IMPLEMENTED` with evidence paths. The engines exist but **no route reaches them**. The registry answers "does an engine exist", not "is it reachable" — a real semantic gap in my own BUSINESS-01 code. | verified |
| P1-04 | **Performance metrics are computed then discarded.** `research_certifications` = 6 columns, `research_experiments` = 13 columns, **zero metrics columns**. `AuditEngine.metrics` returns 14 fields; `recordCertification`'s signature does not accept them. Sharpe/CAGR/drawdown are never written anywhere. | verified |
| P1-05 | **PIT guard is dead code.** `PointInTimeGuard` (`:20`), `InstrumentIdentityEngine` (`:46`) and `DataFoundationService` are unreachable. Production PIT enforcement rests on `LookAheadGuard` alone. | verified |
| P1-06 | **Decision journal provenance break.** `DecisionJournalRepository.ts:15-29` never writes `createdAt` — `DecisionObject.createdAt` is accepted by the type then dropped, so the row falls back to `DEFAULT now()`. **Insert time masquerades as decision time.** `decision_journal` and `decision_reviews` have no author column. | verified |
| P1-07 | **No scheduler exists.** No `node-cron`, no `setInterval`, no `scheduleJob` repo-wide. `MonitoringEngine` is request-driven only, so nothing ever re-evaluates a decision or produces a review. | verified |
| P1-08 | **Business router unmounted.** `createBusinessApiRouter` is exported but not registered; `server.ts` has no `/api/billing`. The certified commercial layer is unreachable over HTTP. | verified |
| P1-09 | **Paper replay lane unreachable.** `PaperReplayEngine` / `PaperReplayService` have **0 non-test callers**; `server.ts` has **zero** `/replay/*` routes. Confirms the roadmap's own Phase C2 finding. | verified |

---

## 4. P2 / P3 FINDINGS

| ID | Sev | Finding |
|---|---|---|
| P2-01 | P2 | No VNDIRECT provider exists (only the ticker `VND` in mock data); `RealMarketDataProvider` has **no fallback** — history is KBS-only, quote/fundamentals VPS-only, every failure throws |
| P2-02 | P2 | `TradingEngine.ts:643-784` — the SELL leg of `executeCycle` never calls `riskManager`/`PositionSizer`; only BUY does (`:510, :564`). Asymmetric risk enforcement. |
| P2-03 | P2 | `TradingEngine.ts:435-442` invents `targetPrice = entry×1.15`, `stopLoss = entry×0.95`, `riskReward = 2.0` when a recommendation omits them — synthetic risk params feed real sizing |
| P2-04 | P2 | `JournalService.ts:58, 79` reuses one user-typed `EvidenceRef` for the `risk` and `sizing` stages → a chain can reach `ELIGIBLE` with a fabricated risk reference |
| P2-05 | P2 | `EventBacktestEngine.ts:162` pushes a literal `RISK_EVENT / 'risk check pass'` with no risk evaluation — a fake event in an audit-grade stream |
| P2-06 | P2 | Two incompatible VPS clients (`providers/VpsProvider.ts`, `providers/VPSMarketDataProvider.ts:48`); which is source-of-truth is undeclared |
| P2-07 | P2 | Quote cross-check `MISMATCH` still returns `dataStatus: 'OK'` (`realMarketDataService.ts:234, 263`) — a 10 %-deviant VPS price is accepted |
| P2-08 | P2 | `VietnamCorporateActionsRegistry.ts` — a 562-line hardcoded const array; 14 events pinned `fetchedAt: '2026-10-01'`, `dataFreshness: 'CURRENT'`, never refreshed |
| P2-09 | P2 | PRODUCT + LEARNING are `localStorage`-only; no server-side persistence, so they cannot work for a second device or a second user |
| P2-10 | P2 | `research_experiments` lacks `status`, `execution_model_version`, `risk_model_version`, so the reproducibility manifest is not fully reconstructible from the row |
| P3-01 | P3 | `src/App.tsx:141-148` renders `state: 'TRADING', isDemo: true` before any fetch resolves (correctly flagged) |
| P3-02 | P3 | `src/db/seed.ts` unused; `src/data/mock/marketData.ts` reachable only from it. Delete or DEV-guard. |

---

## 5. CROSS-CUTTING AUDITS

### 5.1 §17 — AI SAFETY: **PASS**

```
$ grep -rn "generateContent|GoogleGenAI" src/lib/trading src/lib/research src/lib/data
  (no hits)
$ grep -rln "generateContent|new GenAI" src server.ts
  server.ts
```

AI is confined to a single unauthenticated chat proxy in `server.ts`. It cannot reach market
data, research, risk or trading code. **No AI decision authority exists. No P0/P1.**

*(Separately noted, pre-existing, not AI authority: `POST /api/ai/chat` is unauthenticated
and unmetered while holding a server-side `GEMINI_API_KEY`.)*

### 5.2 §18 — DATA SAFETY: **FAIL** (see P0-02, P0-03)

KBS ✓, VPS ✓, **VNDIRECT ✗ does not exist**. No declared per-field source-of-truth registry
(`grep sourceOfTruth` → 0). The four-state model exists but is bypassed by P0-02. No
`Math.random()` prices. No silent mock in a runtime path.

### 5.3 §19 — FINANCIAL SAFETY: **FAIL**

| Requirement | Result |
|---|---|
| `FinancialConservationValidator` invariants | intact (14 documented invariants, `:75`) |
| Board lot 100 | preserved — `FinancialConservationValidator.ts:76` |
| Futures multiplier 100,000 VND | preserved — `CostEngine.ts:35` |
| Futures tick 0.1 | preserved — `CostEngine.ts:36` |
| **On the live order path** | **FinancialConservationValidator is imported by exactly one non-test file, `ReplayValidator.ts`, which no HTTP route reaches** |
| **Risk enforcement on the live order path** | **absent — P0-01** |

The *engines* are correct. The *wiring* is not.

### 5.4 §21 — SECURITY SCAN: **PASS**

```
$ git ls-files | grep -iE "^\.env$|credentials|secret"
.env.example                                  <- template only
$ cat firebase-applet-config.example.json
  "apiKey": "REPLACE_WITH_YOUR_FIREBASE_WEB_API_KEY"   <- fully placeholder
$ git check-ignore -v firebase-applet-config.json
.gitignore:12:firebase-applet-config.json      <- real config correctly ignored
$ grep -n "env|secret|key" .gitignore
  7:.env*   8:!.env.example   10-12: firebase config
```

**No real secret is committed.** The only credential-shaped string in tracked source is
`const SECRET = 'whsec_test_secret'` — a test fixture in `Business05Billing.test.ts:40`.
`.env*` ignored with `.env.example` explicitly re-included.

### 5.5 §25 — REAL EXECUTION SAFETY: **PASS**

```
$ grep -rn "implements BrokerAdapter" src
src/lib/trading/paper/PaperBroker.ts:44   <- the only implementation
$ grep -n "isSimulation" src/lib/trading/paper/PaperBroker.ts
46:  readonly isSimulation = true;
$ grep -rniE "fpt\.com\.vn|api\.fpt|binance|alpaca|interactive.?brokers"
  (no hits)
```

One adapter, hard-wired `isSimulation = true`, no live-broker host, no broker credential.
**No real-execution path exists.** Note this is a *separate* question from P0-01: a simulated
order bypassing risk simulation is a control defect, not a real-money hazard.

### 5.6 §14 — KUBERNETES JUSTIFICATION: **NO EVIDENCE**

No deployment target, no orchestration requirement, no workload-isolation need, no HA
requirement, no cluster. `INFRA-05 = DEFERRED_BY_EVIDENCE`.

---

## 6. ROOT-CAUSE PATTERN

One pattern explains 13 of the 22 findings:

> **Certifications were awarded per-domain on unit tests, without a cross-domain reachability
> audit.** Engines are correct and heavily tested, but nothing verified that a *caller* exists.

The evidence is uniform: `DataFoundationRepository`, `DecisionJournalRepository`,
`ResearchRepository`, `InstrumentRepository`, `CorporateActionEventRepository`,
`PointInTimeGuard`, `InstrumentIdentityEngine`, `AuditEngine.certify`,
`PaperReplayEngine`, `MonitoringEngine` — every one has tests, a migration or a table, and
**zero non-test call sites**.

This is a process defect, not a code defect, and it is the single most important thing this
audit found. The remedy is a **reachability gate**: every persisted entity and every feature
flag must have at least one non-test caller, verified in CI.

---

## 7. READINESS DETERMINATION

| Roadmap gate | Required | Actual | Met |
|---|---|---|---|
| P0 = 0 | 0 | **4** | **NO** |
| P1 = 0 | 0 | **9** | **NO** |
| Financial conservation fails | no | yes (P0-01) | **NO** |
| Critical authorization issue | no | yes (P0-01) | **NO** |
| Critical security issue | no | no | YES |
| Real-execution safety | pass | pass | YES |
| Commercial reconciliation | pass | pass | YES |

§8 instructs: *"Automatically remediate P0/P1 where safely possible. Repeat the audit until
P0 = 0 and P1 = 0, or clearly document an external blocker."*

**Remediation was not performed in this session** because the user selected audit-only scope
after a live concurrent lane was detected. Recorded for the next session:

### P0 remediation order (dependency-ordered)

| Order | Action | Closes |
|---|---|---|
| 1 | Route `POST /api/trading/order` through `RiskManager` + `PositionSizer` before `OrderManager.submitOrder` | P0-01 |
| 2 | Replace the two `'CURRENT'` literals with a real age comparison; remove the `CorporateActionSnapshotBuilder` override | P0-02 |
| 3 | Stamp synthesised values (`marketCap`, index levels, flow literals, fair-value multipliers) with `isDemo: true` / `UNAVAILABLE` | P0-03 |
| 4 | Add canonical bar + provenance + quality tables and a general loader (not the `'HPG'`-hardcoded script) | P0-04 |

P1 remediation: add the reachability gate (P1-01…05, 09), fix `createdAt` (P1-06), add the
scheduler (P1-07), mount the business router (P1-08), correct the feature registry to
distinguish *implemented* from *reachable* (P1-03).

---

## 8. FINAL VERDICT

```
P0 = 4
P1 = 9
P2 = 10
P3 = 2

FINAL SYSTEM READINESS:  NOT_READY
PRODUCTION_READY:         DENIED   (roadmap §25 — P0 > 0 and P1 > 0)
```

The system is **not** production-ready. This is not a close call: the only reachable order
endpoint bypasses the risk stack, and unsourced synthetic financial values reach the UI
without a demo flag.

What is genuinely sound, and should not be re-litigated: the quant engines, the conservation
invariants, the research reproducibility machinery, the business entitlement/marketplace/
billing domain (236 tests), the security scan, the AI boundary, and the real-execution
boundary. **The defects are in wiring, not in reasoning.**