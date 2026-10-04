# PLATFORM-05 — PRODUCTION READINESS: BACKUP / RECOVERY / DR (§45–§48)

> **Status honesty (§45, §47, §77).** This document separates what is *DESIGNED*,
> what is *IMPLEMENTED AND VERIFIED* in this repository, and what is *TARGET* only.
> Nothing below claims an automated backup exists when only a procedure is written down.

## Summary table

| Capability | Status | Evidence |
| --- | --- | --- |
| Config profiles + startup validation | **IMPLEMENTED + VERIFIED** | `src/lib/platform/config/env.ts`, 6 tests |
| Secret-leak scanning of source + bundle | **IMPLEMENTED + VERIFIED** | `src/lib/platform/hardening/repoGuards.ts`, CI-blocking test |
| Migration safety (ordering, additive-only) | **IMPLEMENTED + VERIFIED** | `auditMigrations()` + tests |
| Explicit timeouts / no infinite waits | **IMPLEMENTED + VERIFIED** | `resilience.ts`, breaker + deadline tests |
| Bounded retries (writes never retried) | **IMPLEMENTED + VERIFIED** | `canRetry('write') === false` test |
| Circuit breaker for flaky providers | **IMPLEMENTED + VERIFIED** | breaker state-machine tests |
| Resource limits (page/symbols/AI context) | **IMPLEMENTED + VERIFIED** | `DEFAULT_LIMITS` tests |
| Graceful shutdown sequencing | **IMPLEMENTED + VERIFIED** | `GracefulShutdownCoordinator` tests |
| Signal wiring (SIGTERM/SIGINT) in `server.ts` | **DESIGNED** (installer exists; not yet mounted — needs the DB-close hook) | `installSignalHandlers` |
| Automated database backup | **DESIGNED ONLY** | procedure below; no scheduler, no credentials in repo |
| Restore test | **NOT POSSIBLE HERE** | needs a real PostgreSQL instance; procedure + verification checklist provided |
| RPO / RTO | **TARGET** | stated as targets, never as guarantees |

## Backup design (§45)

| Item | Decision |
| --- | --- |
| What | Full PostgreSQL dump (`pg_dump -Fc`) of the application database |
| Frequency | Target: daily full + continuous WAL archiving for PITR |
| Retention | Target: 7 daily, 4 weekly, 6 monthly |
| Encryption | Target: at-rest encryption of the dump + encrypted offsite copy |
| Location | Target: object storage bucket in a different account/region than the primary |
| Verification | `pg_restore --list` must succeed; periodic restore into an ephemeral DB, then row-count + checksum comparison on critical tables (`users`, `stocks`, `decision_journal`, `replay_runs`) |
| Ownership | Platform team; runbook owned by the release manager |

**Implementation status: DESIGNED.** This repository contains no cron entry, no backup
credentials, and no storage bucket. The migration-safety test (§44) and the schema inventory are
implemented, but the dump/restore automation itself is not.

### Restore procedure (runbook)

```text
1. Stop writers (set platform to not-ready; drain traffic).
2. Provision a clean PostgreSQL instance in the target region.
3. psql -d <target> -c 'CREATE DATABASE vnstock_restore;'
4. pg_restore -d vnstock_restore --clean --if-exists --no-owner <latest.dump>
5. Verify schema:      compare \dt output against the migration list.
6. Verify critical data: users, stocks, prices, decision_journal, research_*, replay_runs row counts.
7. Apply any migrations newer than the dump.
8. Start the app in read-only/staging mode; run /api/platform/readyz.
9. Only then repoint production traffic.
```

### Restore verification checklist (§46)

| Check | How | Pass criteria |
| --- | --- | --- |
| Backup created | `pg_dump` exit code + non-zero file size | exit 0, size > 0 |
| Backup readable | `pg_restore --list` | exit 0 |
| Restore succeeds | `pg_restore` into ephemeral DB | exit 0 |
| Schema valid | `\dt` vs migration list | all expected tables present |
| Critical data present | row counts on critical tables | matches source snapshot |
| App starts | `npm run build && npm start` + `/api/platform/readyz` | 200 `ready:true` |

## Disaster recovery (§47)

| Target | Value | Notes |
| --- | --- | --- |
| RPO | **≤ 15 min** (target) | achievable only with WAL archiving; a daily-dump-only deployment has RPO = 24h |
| RTO | **≤ 2 h** (target) | restore + verification + traffic cutover |
| Database unavailable | app must fail readiness (503) and never serve fabricated data | implemented + tested |
| Provider unavailable | circuit breaker opens; AI path degrades; market data surfaces `UNAVAILABLE` | implemented + tested |
| Corrupt/partial dump | restore into a scratch DB first; never overwrite the primary | runbook |

**These are TARGETS, not guarantees.** They depend on infrastructure (managed Postgres with PITR,
object storage, IaC) that this repository does not contain.

## Failure-mode inventory (§39) with current behaviour

| Failure | Current behaviour | Verified by |
| --- | --- | --- |
| Database unavailable | readiness 503, liveness stays 200 | observability tests |
| Provider unavailable (AI) | `PROVIDER_UNAVAILABLE` auth code; breaker opens after threshold | identity + resilience tests |
| Provider timeout | explicit timeout, no infinite wait | `withTimeout` tests |
| Malformed provider response | provider layer rejects; platform never substitutes a value | existing market data guards (foreign lane) |
| Job interruption | graceful shutdown drains then stops jobs before closing the DB | shutdown tests |
| Account disabled mid-session | sessions revoked; token returns `SESSION_REVOKED` | identity tests |

## Graceful shutdown (§48)

```text
SIGTERM/SIGINT
  → markNotReady()        readiness → 503 (load balancer stops sending traffic)
  → drain(timeout)       await in-flight requests; on timeout, continue but record it
  → stopJobs()            replays/research jobs stop BEFORE the DB closes
  → closeDatabase()       pool closed last
  → STOPPED               caller then exits the process
```

A stuck drain never leaves the DB open: the coordinator records `DRAIN_TIMEOUT` and still stops jobs
and closes the pool, so no writer can hit a half-closed connection during a financial operation.

## Outstanding work before real production

1. Mount `installSignalHandlers` in `server.ts` with a real pool-close hook.
2. Register real dependency probes (DB pool, market-data provider) so readiness reflects reality.
3. Stand up managed Postgres with PITR + an offsite bucket; then execute the restore checklist once
   and attach the result to this document (moving backup from DESIGNED → VERIFIED).
4. Replace in-memory identity/audit stores with the drizzle adapters reserved by migration 0007.