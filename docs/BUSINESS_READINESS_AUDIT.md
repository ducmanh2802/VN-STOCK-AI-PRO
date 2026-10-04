# BUSINESS READINESS AUDIT (PHASE 0)

**Roadmap:** `docs/BUSINESS-01→05 BUSINESS  MONETIZATION AUTONOMOUS ROADMAP.md`
**Phase:** 0 — BUSINESS READINESS AUDIT
**Repository:** `VN-STOCK-AI-PRO`
**Branch:** `main`
**Baseline commit:** `c00dced feat(multi-asset): integrate phase 29 multi-asset quant`
**Date:** 2026-10-04

---

## 0. VERIFICATION BASELINE

Recorded per roadmap §24 before any modification:

```
git branch --show-current   -> main
git log -5 --oneline        -> c00dced, e67a656, ddf5560, 7819f6e, 418c257
git status --short          -> 228 dirty paths at baseline (pre-existing, other lanes)
```

Measured baseline gates:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** — 0 errors |
| Tests | `npm test` (`vitest run`) | **PASS** — 189 files / 1859 tests, 0 failures |
| Build | `npm run build` | not run at baseline (see §9) |

No `git reset --hard`, `git clean`, `git restore .`, `git checkout -- .` was executed.
No `git add .` was executed. Business-lane files were staged individually.

---

## 1. CONCURRENCY FINDING — MANDATORY ISOLATION

**Finding: a concurrent PLATFORM lane agent was actively writing to the repository during this audit.**

Observed at 2026-10-04 23:52:24 (`src/db/schema.ts` mtime, 18 s before the check):

```
src/lib/platform/identity/     identityService.ts, types.ts, session.ts,
                               password.ts, tokenVerifier.ts, __tests__/
src/lib/platform/api/          AuthApiRouter.ts
src/lib/platform/security/     rateLimiter.ts
drizzle/0007_platform_identity.sql
src/db/schema.ts               + platform_user_account, platform_sessions,
                                 platform_auth_events
```

Dirty-path count rose 228 → 243 during the audit window.

### 1.1 Isolation decision (roadmap §25, §26)

The roadmap forbids modifying another lane and forbids overwriting concurrent work.
`src/db/schema.ts` and `server.ts` are shared/protected surfaces that the PLATFORM lane
is actively mutating.

Therefore the Business lane is implemented as a **fully isolated vertical slice**:

| Concern | Convention (all lanes) | Business lane decision | Reason |
|---|---|---|---|
| Drizzle tables | declared in `src/db/schema.ts` | declared in **`src/db/business/schema.ts`** | `src/db/schema.ts` is concurrently owned by the PLATFORM lane; editing it risks a lost-update on their work |
| Migration ID | next unused sequential | **`0008_business_monetization.sql`** | `0007` is taken by the concurrent PLATFORM lane |
| Repositories | `src/lib/db/<lane>/` | **`src/lib/db/business/`** | consistent with existing lane sub-barrels |
| Domain engines | `src/lib/<lane>/` | **`src/lib/business/`** | consistent |
| Services | `src/services/<lane>/` | **`src/services/business/`** | consistent |
| HTTP routing | mounted in `server.ts` | **not mounted** by this lane | `server.ts` is protected (roadmap §26 "Global server routing") and concurrently owned; the router is exported and mount-ready |

**No protected file was modified.** Verified in §9.

---

## 2. IDENTITY

### 2.1 Authentication — `src/middleware/auth.ts` is a STUB

The only authenticating artifact in the pre-existing codebase:

```ts
// src/middleware/auth.ts:9
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  // ...
  const decodedToken = await adminAuth.verifyIdToken(token);  // :21
  req.user = decodedToken;
  next();
};
```

| Item | Status | Evidence |
|---|---|---|
| Firebase ID-token verification | EXISTS (stub) | `src/middleware/auth.ts:9,21` |
| Custom JWT / server session | MISSING | no `jsonwebtoken`, `express-session`, `cookie-parser` in `package.json` |
| Client sign-in surface | MISSING | `src/lib/firebase.ts` has **zero importers**; no login/logout UI anywhere in `src/` |
| Server Firebase credential | MISSING | `src/lib/firebase-admin.ts:6-8` initializes with `projectId` only; no service account, no `GOOGLE_APPLICATION_CREDENTIALS` |
| Global auth enforcement | MISSING | `requireAuth` is never used via `app.use(...)` |
| Authenticated route coverage | **1 of 25** | only `server.ts:67` (`GET /api/users/me`) |
| Password storage / hashing | MISSING | no `bcrypt`, no `argon2`, no scrypt usage |
| Token lifecycle / revocation | MISSING | no revocation list, no rotation |
| Session expiration | MISSING | no session store |
| Account recovery | MISSING | no reset endpoint |
| Auth test coverage | MISSING | no test file for `requireAuth` or `getOrCreateUser` |

`GET /api/users/me` is additionally unreachable from the app: no frontend code calls
`api/users/me`, and no browser code can obtain an ID token.

### 2.2 The concurrent PLATFORM lane supersedes this stub

The PLATFORM lane (in progress, `src/lib/platform/`) provides the real replacement:

| Symbol | Location | Provides |
|---|---|---|
| `Principal` | `src/lib/platform/identity/types.ts:50` | `{ userId, sessionId, issuedAt, expiresAt, provider }` |
| `IdentityService` | `src/lib/platform/identity/identityService.ts:73` | `registerExternalUser`, `authenticateToken`, `logout`, `requestPasswordReset`, `disableUser`, `enableUser`, `sessionsFor` |
| `UserAccount` | `src/lib/platform/identity/types.ts:39` | `{ userId, status: ACTIVE\|DISABLED\|LOCKED\|PENDING, passwordHash, lastLoginAt, disabledReason }` |
| `UserStatus` | `src/lib/platform/identity/types.ts:9` | `ACTIVE \| DISABLED \| LOCKED \| PENDING` |
| `AuthApiRouter` | `src/lib/platform/api/AuthApiRouter.ts:54` | `POST /login`, `POST /logout`, `GET /me`, `POST /password/change`, `POST /password/reset`, `POST /session` |
| `InMemoryRateLimiter` | `src/lib/platform/security/rateLimiter.ts:49` | bucket classes `public \| auth \| expensive \| critical` |
| Migration | `drizzle/0007_platform_identity.sql` | `platform_user_account`, `platform_sessions`, `platform_auth_events` |

**BUSINESS DECISION:** the Business lane consumes `Principal` as its authorization seam.
It does **not** create a second authentication system, a second user table, or a second
role system. See §2.5.

### 2.3 `users` table — EXISTS but INERT

```ts
// src/db/schema.ts:19-34
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('user').notNull(),   // :26 — DEAD FIELD
  createdAt: ..., updatedAt: ...,
});
```

| Defect | Evidence |
|---|---|
| No migration | `users` is created by no `drizzle/*.sql` file (verified: migration table list contains no `users`) |
| `role` never written | `getOrCreateUser` (`src/db/users.ts:7-11`) inserts only `{uid, email, displayName}` → DB default `'user'` |
| `role` never read | exhaustive grep for `.role` reads: zero access-control consumers |
| No account state | no `status`, `lastLoginAt`, `disabledAt`, `lockedAt` |
| Unreachable | `grep "api/users/me"` across `src/**` → zero frontend call sites |

### 2.4 Authorization — ABSENT (pre-existing)

| Item | Status |
|---|---|
| Role enum / union type | MISSING |
| Permission matrix | MISSING |
| `requireRole` / `authorize` guard | MISSING |
| Custom-claims handling | MISSING |
| Ownership enforcement in repositories | PARTIAL and unreachable — `WatchlistRepository.getUserWatchlists` (`src/lib/db/WatchlistRepository.ts:16`), `PortfolioRepository.getUserPortfolios` (`src/lib/db/PortfolioRepository.ts:24`) filter by `userId` but have **no HTTP route** |
| `helmet` / `cors` / CSRF / security headers | MISSING |
| Express error-handling middleware | MISSING |
| Rate limiting | MISSING (0 matches, no dependency) |
| `zod` server-side validation | MISSING — `zod` is installed but its only 2 import sites are client-side (`src/schemas/stockSchema.ts:1`, `src/schemas/learningSchema.ts:1`); `server.ts` imports zero zod symbols |
| Unguarded `parseInt` into a DB query | EXISTS — `server.ts:85` → `server.ts:87` |

**Unauthenticated state mutation (pre-existing, P0 security finding):**
`POST /api/ai/chat` (`server.ts:763`) — unauthenticated, unmetered, forwards
`req.body.message` to `ai.models.generateContent` with a server-held `GEMINI_API_KEY`.
`POST /api/trading/order` (`src/lib/trading/api/TradingApiRouter.ts:123`) — unauthenticated.
`GET /api/recommendations/rankings` (`server.ts:668`) — unauthenticated, fans out 10
parallel upstream fetches per request.

**Process-global trading state:** `server.ts:52-53` creates ONE `PaperBroker` for the whole
process. Every HTTP caller shares one account, one order book, one position set.

### 2.5 ORGANIZATION / WORKSPACE / TEAM / MEMBER / SEAT — ABSENT

`src/db/schema.ts` declared 35 tables pre-PLATFORM. Full table-name enumeration contains
**no** `organizations`, `workspaces`, `teams`, `members`, `seats`, `subscriptions`, `plans`,
`entitlements`. Repo-wide grep for `orgId|org_id|workspace|team|member|seat|tenant|permission`
across `src/db/` returned 2 matches, both false positives (`role` = contractor role at
`schema.ts:903`).

Near-miss names that are **NOT** tenancy:

| Symbol | Location | What it is |
|---|---|---|
| `ResearchWorkspace` / `ResearchWorkspaceEngine` | `src/lib/product/research/ResearchWorkspaceEngine.ts:2` | in-memory grouping of research notes. No org/user FK. |
| `Organization` (interface) | `src/lib/learning/TrainingFoundation.ts:5` | `{ id, name }` training-course fixture. Its own header (`:2-4`) declares "no social network, no payments, **no auth**". |
| `AccessTier` / `hasAccess` | `src/lib/learning/TrainingFoundation.ts:34,114` | a 7-value tier ordering with `hasAccess()` **never called**; zero persistence |

### 2.6 AUDIT LOG — ABSENT (pre-existing)

| Item | Status |
|---|---|
| Audit/event log table | MISSING |
| Audit service | MISSING |
| Correlation / request ID | MISSING — 0 matches for `correlationId`, `requestId`, `traceId`, `x-request-id` |
| Auth event recording | MISSING (pre-PLATFORM) |
| Error messages echoed to client | EXISTS — pattern `res.status(500).json({ error: error.message })` repeats ~20× in `server.ts` |

Domain "audit" symbols found are **not** platform audit:
`AuditEngine` (`src/lib/research/AuditEngine.ts:22`) = backtest certification;
`AuditStatus` (`src/services/financialDocuments/types.ts:36`) = whether a financial statement
was audited by a registrar; `ReplayEventLog` = paper-replay transitions.

The concurrent PLATFORM lane adds `platform_auth_events` (authentication events only).

**Gap: a BUSINESS/commercial audit trail does not exist and must be created by BUSINESS-01.**

---

## 3. PRODUCT

| Surface | Engine | Persisted? | Backing table |
|---|---|---|---|
| journal | `src/lib/product/journal/JournalEngine.ts` | localStorage (`JournalStore.ts:22`) | NONE |
| research workspace | `src/lib/product/research/ResearchWorkspaceEngine.ts` | localStorage (`src/services/product/ResearchService.ts:14`) | NONE |
| scenario | `src/lib/product/scenario/ScenarioEngine.ts` | NONE — pure static `run()` | NONE |
| AI assistant | `src/lib/product/assistant/ResearchAssistantFoundation.ts` | NONE — pure + `StubResearchLlmAdapter` (`:175`) | NONE |
| alerts | `src/lib/product/alerts/AlertEngine.ts` | NONE — pure statics | NONE |

`grep drizzle\|Repository` across `src/lib/product/**` → 3 comment lines only.
**The entire PRODUCT lane is client-local. No server-side persistence, no authorization.**

Learning lane: `src/lib/learning/catalog.ts` holds static content; `ProgressStore.ts`
holds 7 `localStorage` keys. **No drizzle table for any learning entity.**

**BUSINESS IMPACT:** BUSINESS-02/03/04 cannot reuse a persisted PRODUCT or LEARNING model.
The Business lane must define its own persisted commercial + community entities and must
integrate PRODUCT/LEARNING through explicit, provenance-preserving references — not by
mutating those engines.

---

## 4. RESEARCH

| Symbol | Location | Public API |
|---|---|---|
| `ExperimentEngine` | `src/lib/research/ExperimentEngine.ts:56` | `validateDataset`, `create`, `reproducibilityKey` |
| `EventBacktestEngine` | `src/lib/research/EventBacktestEngine.ts:64` | `run`, `orderKindSupported` |
| `CostEngine` | `src/lib/research/CostEngine.ts:39` | `feeFor`, `slippagePrice`, `roundLot`, `liquidityCap`, `futuresNotional`, `roundTick` |
| `ValidationEngine` | `src/lib/research/ValidationEngine.ts:17` | `split`, `walkForward`, `label`, `sensitivity`, `byRegime`, `seededShuffle` |
| `AuditEngine` | `src/lib/research/AuditEngine.ts:22` | `metrics`, `benchmarkCheck`, `warnings`, `biasesPresent`, `manifest`, `certify`, `checkNav` |
| `SnoopingLedger` | `src/lib/research/AuditEngine.ts:133` | `record`, `finalTestSeparation`, `count` |
| `ResearchService` | `src/services/research/ResearchService.ts:11` | `createExperiment`, `runBacktest`, `split`, `walkForward`, `auditMetrics` |

Persisted: `research_experiments` (`src/db/schema.ts:1157`) and `research_certifications`
(`:1183`), both append-only via `ResearchRepository` (`src/lib/db/research/ResearchRepository.ts`).

### 4.1 Findings that directly constrain BUSINESS-03

1. **Strategy is a flat string, not an entity.** `ResearchExperiment.strategy: string`
   (`types.ts:29`) + `strategyVersion: string` (`:30`). There is **no strategy registry and
   no strategy version table**.
2. **Dataset is not persisted.** `ResearchDataset` (`types.ts:11`) is flattened onto the
   experiment row as `universe` JSON text + `data_version` text. There is no
   `research_datasets` table.
3. **Performance is computed but DISCARDED.** `AuditEngine.metrics()` returns
   `PerformanceMetrics` (`cagrPct`, `sharpe`, `maxDrawdownPct`, …). `research_certifications`
   has **no metrics columns** — only `verdict`, `manifest`, `warnings`.
   `ResearchRepository.recordCertification` (`:40`) throws the metrics away.
4. **Certification provenance is an opaque JSON blob.** `research_certifications.manifest`
   is `text`; `ReproducibilityManifest` (`types.ts:161`) carries `datasetVersion`,
   `dataSources[]`, `strategyVersion`, `codeVersion`, `parameters`, `executionModel`,
   `costModel`, `riskModel`, `universe[]`, `startDate`, `endDate`, `seed` — but nothing
   guarantees the blob was produced by `AuditEngine.manifest()`.
5. **`executionModelVersion` / `riskModelVersion` / `costModelVersion` are not columns**
   on `research_experiments` — only `data_version` and `strategy_version` are persisted.
6. **Two distinct, non-interoperating certification enums exist:**
   - `ResearchExperiment.status` (`src/lib/research/types.ts:23`):
     `DRAFT | RUNNING | COMPLETED | FAILED | CERTIFIED | NON_CERTIFIED`
   - `StrategyCertificationStatus` (`src/lib/analysis/backtest/validation/acceptanceTypes.ts:29`):
     `CERTIFIED | CONDITIONALLY_CERTIFIED | REJECTED | INSUFFICIENT_EVIDENCE | BLOCKED`
7. `ResearchRepository` is **unwired** — zero call sites outside `src/lib/db`.

**BUSINESS-03 MUST NOT** read a marketplace number from a `manifest` blob and present it as
performance. Per roadmap §03.2, performance may only be displayed when dataset, period,
strategy version, cost model, execution model and validation state are all individually
resolvable. The Business lane therefore requires an explicit, column-level performance
provenance record of its own.

---

## 5. PAPER REPLAY / FINANCIAL SAFETY

### 5.1 Financial conservation is REAL and enforced

Class `FinancialConservationValidator` — `src/lib/trading/replay/FinancialConservationValidator.ts:75`
(689 lines). Header (`:6-22`): *"PURE, DETERMINISTIC, NON-MUTATING, FAIL-CLOSED."*

Invariants verified in code:

| # | Invariant | Error code | Location |
|---|---|---|---|
| 1 | Rejected order ⇒ zero quantity | `TRADE_VALUE_CONSERVATION_FAILED` | `:98` |
| 2 | Rejected order ⇒ zero fee | `FEE_CONSERVATION_FAILED` | `:107` |
| 3 | Rejected order ⇒ zero tax | `TAX_CONSERVATION_FAILED` | `:116` |
| 4 | Rejected order ⇒ cash unchanged | `CASH_CONSERVATION_FAILED` | `:125` |
| 5 | Rejected order ⇒ position unchanged | `POSITION_CONSERVATION_FAILED` | `:134` |
| 6 | Quantity > 0 and a multiple of 100 (board lot) | `LOT_SIZE_CONSERVATION_FAILED` | `:156-172` |
| 7 | Fee `=== round(grossValue × feeRate)` exactly | `FEE_CONSERVATION_FAILED` | `:187-205` |
| 8 | BUY ⇒ tax 0; SELL ⇒ tax `=== round(gross × taxRate)` | `TAX_CONSERVATION_FAILED` | `:207-234` |
| 9 | Cash conservation, **no negative cash** | `CASH_CONSERVATION_FAILED` | `:236-264` |
| 10 | Position conservation, **no short selling** | `POSITION_CONSERVATION_FAILED` | `:266-295` |
| 11 | Realized PnL exact; BUY ⇒ 0 | mismatch | `:297-326` |
| 12 | Equity conservation | `EQUITY_CONSERVATION_FAILED` | `:328-345` |
| 13 | Partial fills ≤ ordered qty; FILLED ⇒ exact | `PARTIAL_FILL_CONSERVATION_FAILED` | `:549-559,628-643` |
| 14 | Duplicate `eventId` / `executionId` / second `ORDER_SETTLED` | `DOUBLE_COUNT_DETECTED` | `:398-442` |

`ReplayAccounting` (`src/lib/replay/ReplayAccounting.ts:28`) is a second, weaker check that
delegates to the above (`verify()` returns `VIOLATION` if the injected validator fails).
`PaperReplayEngine` fails the whole replay with
`status:'FAILED'`, `ACCOUNTING_INVARIANT_VIOLATION` (`src/lib/replay/PaperReplayEngine.ts:394-410`).

### 5.2 There is NO real trading capability — proven

1. Exactly one class implements `BrokerAdapter`: `PaperBroker`
   (`src/lib/trading/paper/PaperBroker.ts:44`), with
   `readonly isSimulation = true` (`:46`).
2. `server.ts:52` — `new TradingEngine({ broker: new PaperBroker() })`.
3. Zero broker credentials in the repository. `.env.example` contains only `GEMINI_API_KEY`
   and `APP_URL`.
4. Compile-time gate — `PaperReplayEngine.run` (`src/lib/replay/PaperReplayEngine.ts:162-165`)
   fails with `EXECUTION_BLOCKED` / `EXECUTION_PORT_NOT_SIMULATION` when
   `ports.executionPort.isSimulation` is false. Header (`:16-18`): *"There is no code path
   that constructs a real adapter."*
5. `TradingApiRouter` `/status` self-declares `brokerMode:'PAPER'`,
   `paperTradingOnly:true`, `liveTradingEnabled:false` (`:81-94`).
6. `BrokerAdapter` (`:110`) is a pure TS interface — no `fetch`, no socket.

### 5.3 Protected surfaces confirmed present (roadmap §3, §26)

```
src/lib/trading/risk/RiskGuard.ts              RiskGuard
src/lib/trading/risk/RiskManager.ts            RiskManager
src/lib/trading/risk/PositionSizer.ts          PositionSizer
src/lib/trading/engine/TradingEngine.ts        TradingEngine
src/lib/trading/validation/TradingDataValidator.ts   TradingDataValidator
src/lib/trading/replay/FinancialConservationValidator.ts  FinancialConservation
src/lib/trading/paper/PaperBroker.ts           PaperBroker
```

**BUSINESS LANE MUST NOT IMPORT ANY OF THESE.** Entitlement is commercial, not financial
authorization (roadmap §3). A Business API may hold a `feature` decision and a `usage` event,
and must stop there.

---

## 6. GAP ANALYSIS

| # | Gap | Severity | Blocks | Resolution owned by |
|---|---|---|---|---|
| G-01 | No commercial entitlement mechanism of any kind | P0 | BUSINESS-01 | BUSINESS-01 |
| G-02 | No plan / subscription / billing state anywhere | P0 | BUSINESS-01, 05 | BUSINESS-01, 05 |
| G-03 | No usage metering; no idempotency primitive for commercial events | P0 | BUSINESS-01, 05 | BUSINESS-01, 05 |
| G-04 | No commercial audit trail | P0 | all | BUSINESS-01 |
| G-05 | No organization / workspace / team / member / seat | P0 | BUSINESS-02, 04 | BUSINESS-04 |
| G-06 | No visibility / ownership enforcement primitive; no IDOR test harness | P0 | BUSINESS-02, 03 | BUSINESS-02 |
| G-07 | No strategy version entity; performance metrics not persisted | P0 | BUSINESS-03 | BUSINESS-03 |
| G-08 | No payment provider abstraction; no webhook verification | P0 | BUSINESS-05 | BUSINESS-05 |
| G-09 | `users.role` is a dead column; no role/permission system | P1 | BUSINESS-04 | PLATFORM lane + BUSINESS-04 policy mapping |
| G-10 | No server-side request validation on any existing route | P1 | all business APIs | BUSINESS-01..05 (own routes only) |
| G-11 | No rate limiting on business routes | P1 | all | BUSINESS-01 (self-contained limiter) |
| G-12 | PRODUCT + LEARNING entirely client-local (localStorage) | P2 | BUSINESS-02/04 integration | documented; integration by reference only |
| G-13 | Two incompatible certification enums | P2 | BUSINESS-03 | BUSINESS-03 keeps its own explicit ladder; no silent mapping |
| G-14 | Pre-existing unauthenticated `POST /api/ai/chat` + `POST /api/trading/order` + process-global `PaperBroker` | P0 | — | **NOT this lane** (protected `server.ts` + trading lane). Documented, not touched |
| G-15 | Error messages echoed to client ~20× | P2 | — | not this lane; business routes do not echo |

---

## 7. ARCHITECTURE AUDIT — CONSTRAINTS ADOPTED

1. **Modular monolith preserved** (roadmap §6). No microservices, no Kubernetes, no cloud,
   no distributed queue. Business is a module inside the existing Express + Drizzle app.
2. **Dependency direction**: `HTTP → business services → business domain (pure) → repositories → drizzle`.
   Business domain code has **zero** imports from `src/lib/trading/**`.
3. **Pure deterministic domain**: every engine is a pure static method or a pure function
   over injected `now` — never `Date.now()` inside a decision. Matches RESEARCH/REPLAY
   convention (`ValidationEngine`, `ReplayStateMachine`).
4. **Fail closed**: any unknown feature, plan, status or transition throws a SCREAMING_SNAKE
   code, matching `ReplayStateMachine.transition` (`INVALID_TRANSITION:...`) and
   `ExperimentEngine.create` (`UNIVERSE_VINTAGE_MISSING`).
5. **No fabricated data**: every commercial read path returns an explicit
   `UNAVAILABLE` / `NOT_AVAILABLE` marker rather than a number.
6. **Payment provider neutrality** (roadmap §4): `PaymentProvider` interface + a
   deterministic in-repo `TEST` adapter that can never assert `PRODUCTION`.
7. **No schema mutation of another lane** — see §1.1.

---

## 8. ACCEPTANCE CRITERIA FOR THE BUSINESS LANE

| ID | Criterion |
|---|---|
| AC-01 | A single deterministic function answers "may subject S use feature F?" for every subject type and every feature in the canonical registry. Unknown feature ⇒ deny. |
| AC-02 | Plan resolution is total: every subject resolves to a plan or an explicit `UNAVAILABLE`. No `undefined`. |
| AC-03 | Subscription state transitions are a closed machine; illegal transitions throw. |
| AC-04 | A usage event with a repeated idempotency key has exactly one economic effect, under sequential and interleaved execution. |
| AC-05 | A `PAYMENT_UNKNOWN` payment never yields `ACTIVE` entitlement, and never yields `ALLOWED`. |
| AC-06 | Every commercial mutation appends exactly one audit event carrying actor + correlation + reason. |
| AC-07 | Cross-owner access to a private artifact is denied for every visibility level, and tested. |
| AC-08 | Marketplace performance is displayed only when all 6 provenance fields resolve; otherwise the field reads `NOT_AVAILABLE`. |
| AC-09 | A strategy version update never mutates a prior version's recorded performance. |
| AC-10 | Seat assignment is concurrency-safe and the seat count is always internally consistent. |
| AC-11 | Duplicate webhook delivery produces exactly one economic effect. |
| AC-12 | Commercial ledger and investment ledger are separate types with no shared code path. |
| AC-13 | Reconciliation surfaces every listed inconsistency as an explicit state and never silently repairs. |
| AC-14 | Zero imports from `src/lib/trading/**` in `src/lib/business/**`. |
| AC-15 | Typecheck, full test suite and build pass; no protected file modified. |

---

## 9. BASELINE VERIFICATION (protected files)

Baseline recorded before Business work:

```
npm run typecheck  -> PASS (0 errors)
npm test           -> PASS (189 files, 1859 tests)
```

Files this lane will not touch (roadmap §26 protected set), all verified present:

`RiskGuard.ts`, `RiskManager.ts`, `PositionSizer.ts`, `TradingEngine.ts`,
`MarketDataIntegrityGuard` (locate: `src/lib/data/PointInTimeGuard.ts` lineage),
`TradingDataValidator.ts`, `FinancialConservationValidator.ts`, `PaperBroker.ts`,
`server.ts`, `src/db/schema.ts`, `src/middleware/auth.ts`.

Post-implementation verification of this table is recorded in
`docs/BUSINESS_FULL_AUDIT.md`.

---

## 10. PHASE 0 VERDICT

```
BUSINESS READINESS: PROCEED WITH DOCUMENTED ISOLATION
```

Findings:

1. The platform's financial, research and data cores are **real, tested and
   provenance-carrying**. They are a sound foundation for commercialization.
2. The identity/platform layer was a **stub** at audit time. A concurrent PLATFORM lane is
   now building the real `Principal`-based identity, and the Business lane consumes it
   rather than duplicating it (§2.5, §1.1).
3. **There is no commercial layer whatsoever** — no plan, subscription, entitlement, usage,
   billing, community, marketplace or organization concept exists. All of BUSINESS-01→05
   is genuinely net-new work, not a re-audit of prior claims.
4. No prior phase report claimed business functionality, so there is no fabricated
   business claim to contradict.

Proceeding to BUSINESS-01 under §1.1 isolation.