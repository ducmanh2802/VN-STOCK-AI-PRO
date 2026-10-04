# PLATFORM-04 — OBSERVABILITY / PERFORMANCE / RELIABILITY: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Discovery
| Capability | State before |
| --- | --- |
| Structured logging | **MISSING** — ad-hoc `console.log/error`, no fields, no redaction |
| Metrics | **MISSING** |
| Liveness vs readiness | **MISSING** — a single `/api/health` returning `{status:'ok'}` unconditionally |
| Dependency health | **MISSING** |
| Request correlation | **MISSING** (added in PLATFORM-03) |
| Failure semantics | Partial — market services do distinguish unavailable/stale in places, but there is no platform-level contract |

## Architecture
```text
StructuredLogger (§34 fields, redaction via PLATFORM-03)
MetricsRegistry  (§32 counters/gauges/histograms, Prometheus text output)
HealthService    (§31 liveness / readiness / dependency probes)
  ├── GET /api/platform/healthz   → liveness only (200 while the process runs)
  ├── GET /api/platform/readyz    → readiness, 503 when a required dependency is unusable
  └── GET /api/platform/metrics   → Prometheus exposition
```

## Logging (§34/§35)
- One JSON object per line with `timestamp · level · service · event · requestId · correlationId ·
  durationMs · status`, plus redacted custom fields.
- Explicit `DEBUG|INFO|WARN|ERROR` thresholds; market-data DEBUG ticks are suppressed by default so a
  tick storm cannot destroy observability (§35).
- **Every field passes the PLATFORM-03 redaction chokepoint** — a password or bearer token cannot be
  logged even by accident.
- Sinks are pluggable (`ConsoleLogSink`, `MemoryLogSink`); the core never depends on a logger library.

## Metrics (§32/§33)
Registered set is exactly the operational set an operator acts on:
`http_requests_total`, `http_errors_total`, `http_request_duration_ms` (histogram),
`auth_login_total`, `auth_rate_limited_total`, `audit_records_total`, `data_stale_requests_total`,
`provider_unavailable_total`, `market_data_freshness_ms` (gauge).

Two safety properties, both tested:
1. **Financial values can never be exported.** A metric name whose snake_case tokens include
   `nav|cash|balance|equity|profit|pnl|quantity|value|holdings` is rejected at registration
   (`METRIC_REJECTS_FINANCIAL_VALUE`). Token-based matching avoids false positives such as
   `provider_unavailable_total`.
2. **Bounded cardinality and no identity leakage.** Only declared label names are retained; extra
   labels (e.g. a `userId`) are dropped before storage, so no user identifier can reach exposition.

## Health & failure semantics (§31/§36/§39)
- `runHealthCheck` classifies every dependency as `OK | STALE | UNAVAILABLE | INVALID | DEGRADED`.
- **Liveness never depends on a dependency** (a DB outage must not cause a restart loop); readiness
  does, returning 503 and naming only the blocking dependency.
- A probe that throws or hangs is `UNAVAILABLE` after an explicit timeout — probes never hang
  readiness and never silently report OK.
- `STALE` ⇒ degraded but **still ready** (freshness is surfaced, not hidden).
- Optional dependencies (e.g. the AI provider) degrade without blocking readiness.
- `UNAVAILABLE` is never converted into HTTP 200 with a fabricated value; production error bodies
  carry only a public message (`sendSafeError`).

## Honest status of probes
`defaultProbes()` currently returns an **empty** probe set because no durable database/provider pool
exists in this build. Readiness therefore reports OK by construction — it is not faked, and the gap is
stated rather than papered over. Wiring real probes is part of PLATFORM-05 configuration work.

## Known limitations
- No Prometheus/Grafana deployment in this repo; `/metrics` is a standard exposition endpoint that an
  operator can scrape.
- No tracing (only request/correlation ids), no long-term log store, no alerting rules.
- Histograms keep raw samples in memory (bounded by traffic, reset on restart) — acceptable for a
  single-process build, documented for the multi-process case.
- Performance numbers are not claimed here; §71 forbids deriving production capacity from this repo.