# PLATFORM FOUNDATION — ARCHITECTURE
Status: IMPLEMENTED (lane-local, uncommitted) | Date: 2026-10-04

## Purpose
A platform layer that sits **below** product/financial semantics and **above** infrastructure, in the
architecture the roadmap mandates (§4):

```text
PRODUCT · Learning · Research · Decision · Portfolio · Paper Trading
                            ↓
              APPLICATION / DOMAIN SERVICES
                            ↓
                        PLATFORM
     Identity · Authorization · Audit · Observability · Reliability · Security
                            ↓
              DATABASE / PROVIDERS / INFRASTRUCTURE
```

No financial business logic leaked into the platform layer, and no platform concern was pushed into
the financial engines (protected lanes were read, imported, and never modified).

## Baseline truth (nothing rebuilt)
| Capability | Before | After |
| --- | --- | --- |
| Token verification | Firebase ID tokens via `src/middleware/auth.ts` | **Kept as a provider adapter** — no duplicate identity model |
| Password auth | missing | scrypt hasher + policy + verification |
| Sessions | missing (stateless tokens, no revocation) | issue/expiry/revoke/renew/logout, hash-only token storage |
| Account status | missing | `ACTIVE · DISABLED · LOCKED · PENDING` |
| Lockout | missing | 5/15min lock, applied to unknown identifiers too |
| Auth HTTP API | missing | `/api/platform/auth/*` |
| Authorization | missing | 3-gate model (who / permission / scope+ownership) |
| IDOR protection | missing | proven at HTTP level for 8 resource types |
| Audit trail | missing | append-only, hash-chained, redacted, verified |
| Correlation ids | missing | requestId on every route |
| Security headers | missing | CSP, nosniff, frame deny, referrer/permissions |
| Structured logs | ad-hoc console | JSON logger with redaction + level discipline |
| Metrics | missing | counters/gauges/histograms + Prometheus, financial values impossible |
| Health | single unconditional `ok` | liveness ≠ readiness, 503 with named blockers |
| Config | ad-hoc `process.env` | profiles + fail-fast startup validation |
| Secrets hygiene | **committed Firebase config (real finding)** | untracked + gitignored + template + CI scan |
| Timeouts / retry / breaker | missing | explicit timeouts, writes never retried, breaker |
| Graceful shutdown | missing | mark-not-ready → drain → stop jobs → close DB |
| Migration safety | documentation only | executable ordering/additive-only audit |
| Backup / DR | missing | DESIGNED + runbook + verification checklist (explicitly *not* claimed as implemented) |

## Layer map

```text
src/lib/platform/
  identity/      types · password · session · tokenVerifier · identityService
  authorization/ types · authorizationService
  audit/         auditLog (+ AuthEventAuditSink)
  security/      rateLimiter · redaction · pathSafety
  observability/ logger · metrics · health
  config/        env
  resilience/    resilience (timeout · retry · breaker · limits)
  lifecycle/     gracefulShutdown
  hardening/     repoGuards (secret scan · migration audit)
  api/           AuthApiRouter · createPlatformRouter (composition root)

src/middleware/platform/
  security.ts             correlationMiddleware · securityHeaders · sendSafeError
  requirePermission.ts    requirePrincipal · requirePermission · requireResource
```

## Design decisions that carry the security model
1. **Ports & adapters everywhere.** Store, clock, token provider, hasher and audit sink are all
   injected. Every §13/§19/§20 rule is provable offline, and no provider is hard-wired.
2. **Three independent authorization gates.** Role never substitutes for scope; scope never
   substitutes for permission. Personal resources are isolated even from ADMIN (§19).
3. **Anti-enumeration by construction.** Identical error code *and* comparable CPU work for unknown
   accounts; a disabled account only reveals itself when the password is correct.
4. **Redaction before persistence.** Audit and logs pass through one chokepoint, so a secret is never
   written and then hidden.
5. **Metrics cannot carry financial values.** The metric-name guard rejects `nav|cash|balance|equity|
   profit|pnl|quantity|value|holdings` tokens, and undeclared labels (e.g. `userId`) are dropped
   before storage.
6. **Writes are never retried.** Accounting invariants outrank availability; reads retry within a
   bounded budget and providers are protected by a circuit breaker.
7. **Honest degradation.** `UNAVAILABLE` is never converted to a 200 with a fabricated value;
   `STALE` is surfaced as degraded; probes that throw or hang report `UNAVAILABLE`, never OK.

## Financial integrity (§5/§70)
The platform imports Decision OS, portfolio, journal, research and alert engines read-only. It never
reinterprets, wraps, or overrides their semantics: risk state strings, decision statuses, paper-only
execution markers and accounting statuses pass through unchanged (visible in the §68 E2E assertions).
No real execution path was added or enabled.

## Ownership discipline (§60–§62)
- OWNED: `src/lib/platform/**`, `src/middleware/platform/**`, `drizzle/0007_platform_identity.sql`,
  `src/test/platform.e2e.test.ts`, `docs/PLATFORM_*`.
- SHARED (minimal, documented): `server.ts` (2 imports + correlation/headers + one `/api/platform`
  mount), `src/db/schema.ts` (**append-only**, 83 insertions / 0 deletions).
- Foreign lanes untouched: `src/lib/business/**`, Learning, Product, Decision OS, Portfolio, Macro,
  Strategy, Capital-cycle, Earnings, Derivatives, ETF, Replay.
- No destructive git commands; no commits; no `git add .`.

## Known limitations (stated, not hidden)
1. Identity/session/membership/audit state is **process-local** — sessions do not survive restart and
   the audit trail is not durable. Migration 0007 reserves the durable schema; adapters are next.
2. Backup automation is **DESIGNED**, not implemented; RPO/RTO are **TARGETS**.
3. `installSignalHandlers` is not yet mounted in `server.ts`.
4. `defaultProbes()` is empty until a durable DB/provider pool exists, so readiness currently reports
   OK by construction.
5. `express.json()` still uses the default body limit (`DEFAULT_LIMITS.maxJsonBodyBytes` is defined
   but not yet enforced at the HTTP layer).
6. Authorization is enforced on platform routes; pre-existing single-tenant feature routers are not yet
   behind `requirePermission` (tracked P2).
7. Audit is tamper-**evident**, not tamper-proof (no external WORM sink).