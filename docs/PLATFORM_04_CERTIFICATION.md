# PLATFORM-04 — OBSERVABILITY / PERFORMANCE / RELIABILITY: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Implementation
| File | Purpose |
| --- | --- |
| `src/lib/platform/observability/logger.ts` | structured JSON logger, level filter, pluggable sinks |
| `src/lib/platform/observability/metrics.ts` | counter/gauge/histogram registry, Prometheus exposition, privacy guard |
| `src/lib/platform/observability/health.ts` | liveness/readiness, dependency classification, probe timeouts |
| `src/lib/platform/observability/__tests__/observability.test.ts` | 18 tests (incl. HTTP health endpoints) |
| `src/lib/platform/api/createPlatformRouter.ts` | `/healthz`, `/readyz`, `/metrics` wiring |

## Acceptance evidence (92 platform tests total, all pass)
| Requirement | Proof |
| --- | --- |
| §34 minimum log fields | all fields asserted on an emitted line; output is valid JSON |
| §35 level discipline | DEBUG/INFO suppressed under WARN; no tick flood |
| Secrets never logged | password + authorization redacted in log output |
| §32 metric set | all documented metrics registered and queryable |
| §33 no financial values | `portfolio_value_vnd`, `user_nav` rejected at registration |
| Cardinality + identity bound | undeclared `userId`/`secretNote` labels dropped, not exposed |
| Prometheus output | `# TYPE`, `_count`/`_sum` histogram lines asserted |
| §31 liveness ≠ readiness | DB-down: `/readyz` 503 while `/healthz` stays 200 |
| §36 STALE preserved | degraded but ready, never silently OK |
| §36 INVALID blocking | readiness false |
| §39 provider failure | throwing probe ⇒ UNAVAILABLE (not OK) |
| §39 no infinite wait | hanging probe times out ⇒ UNAVAILABLE |
| Optional dependency | AI-style probe degrades without blocking readiness |
| No internals in bodies | no `password`, `postgres://`, `stack`, hostnames |

## Bugs found by these tests and fixed
1. **Privacy/correctness bug in metrics**: undeclared labels were excluded from the series *key* but
   still stored in the exposed label set — a `userId` would have leaked into `/metrics`. Labels are
   now sanitised once, before storage.
2. **False-positive privacy guard**: the substring rule matched `nav` inside `provider_unavailable_total`,
   making the registry unusable. Replaced with snake_case token matching.
3. **Port too strict**: `DependencyProbe.check` only allowed `Promise<DependencyStatus>`; it now
   accepts sync or async probes (`withTimeout(Promise.resolve(...))`).

## Findings
| Sev | Finding | Disposition |
| --- | --- | --- |
| P2 | `defaultProbes()` is empty — no durable DB/provider pool in this build, so readiness reports OK by construction | Stated explicitly in the architecture doc and the composition root; no fabricated probe exists. Real probes are PLATFORM-05 config work |
| P3 | No tracing, no alerting rules, no long-term log store | Deferred; not blocking platform readiness |

P0 = 0, P1 = 0.

## Phase gate (§64)
Implementation complete · tests pass (`src/lib/platform` → 6 files / 92 tests) · typecheck clean for
platform scope · `npm run build` success · evidence audit pass · certification document present.