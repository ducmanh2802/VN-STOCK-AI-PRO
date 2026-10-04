# PLATFORM-05 — PRODUCTION HARDENING: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Discovery
| Area | State before |
| --- | --- |
| Config management | **PARTIAL** — `process.env` read ad hoc in `server.ts`; no profiles, no validation |
| Startup validation | **MISSING** — the app starts with missing/invalid config and fails later, confusingly |
| Secret hygiene | **MISSING** — a real Firebase web config was committed to Git and shipped in the bundle |
| Timeouts | **PARTIAL** — some fetch paths have none; no shared primitive |
| Retry policy | **MISSING** — no bounded retry, no rule protecting writes |
| Circuit breaker | **MISSING** |
| Resource limits | **MISSING** |
| Graceful shutdown | **MISSING** — no SIGTERM handling, no drain, pool never closed |
| Backup / restore | **MISSING** (no infrastructure in repo) |
| Migration safety | **DOCUMENTED ONLY** |

## Architecture
```text
config/env.ts          profiles + startup validation (dev | test | production)
resilience/resilience  withTimeout · bounded retry · CircuitBreaker · explicit limits
lifecycle/gracefulShutdown  ordered drain → stopJobs → closeDatabase
hardening/repoGuards   secret scan (§43) + migration audit (§44) — executable, CI-blocking
docs/PLATFORM_05_BACKUP_AND_DR.md   backup/restore/DR with DESIGNED vs VERIFIED split
```

## Configuration (§41/§42)
`loadConfig(env)` is pure and returns a typed `PlatformConfig` or throws `ConfigError` listing
**every** problem. In production it *requires* `GEMINI_API_KEY`, `SQL_PASSWORD`, `SQL_HOST`,
`SQL_USER`, `SQL_DB_NAME`, and rejects `LOG_LEVEL=DEBUG` (routinely leaks payloads into log
storage). There is no silent fallback path: a misconfigured deployment fails at startup.
`configPublicView()` exposes secret **presence** flags only, never values.

## Resilience (§49/§39/§51)
- `withTimeout` — no infinite waits anywhere.
- `canRetry(op)`: **writes are never retried**. A duplicated order or fill would corrupt accounting
  invariants, so a non-idempotent operation fails fast instead.
- `CircuitBreaker` — pure state machine (CLOSED → OPEN → HALF_OPEN) with injected clock; `run()`
  rejects with `CIRCUIT_OPEN` instead of hammering a dead provider.
- `DEFAULT_LIMITS` — page size 200, query symbols 50, AI context 12k chars, JSON body 1 MB,
  replay candles 5000. Checks return `{ok, reason}` so callers refuse before doing the work.

## Graceful shutdown (§48)
Ordering is the point: mark not-ready → drain (with deadline) → stop jobs → close DB. A stuck drain
records `DRAIN_TIMEOUT` and still closes the pool, so no in-flight financial operation is left
against a half-closed connection. The coordinator never calls `process.exit`; the caller owns
process lifetime, which keeps it unit-testable.

## Repo guards (§43/§44)
- **Secret scan**: 10 credential shapes (private keys, service-account JSON, `AIza…`, `sk-…`,
  `AKIA…`, `xox*`, `postgres://user:pass@`, JWTs, hardcoded password/API-key assignments). Findings
  report the file/line and a **redacted** excerpt — never the secret itself.
  Allowlists are deliberately narrow: synthetic `password:`/`apiKey:` values in `__tests__` (a
  redaction test must contain a fake password), and a Firebase **Web** key only in the
  gitignored web config and its bundle. Private keys, service accounts and JWTs are never
  allowlisted by path.
- **Migration audit**: sequential IDs from `0000`, no duplicates, no gaps, and zero destructive
  statements (`DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `DROP COLUMN`).

### Real finding remediated
The scan found `firebase-applet-config.json` **tracked in Git** (not gitignored) with a Firebase Web
API key that was being bundled into `dist/server.cjs`. Remediation:
`git rm --cached` (file preserved on disk, no runtime breakage) · added to `.gitignore` · committed a
safe `firebase-applet-config.example.json` template. Note the Web key is a public Firebase identifier
(the Admin SDK authenticates with service-account credentials, not this key) — the exposure was a
hygiene problem, not an authentication bypass. `src/lib/firebase-admin.ts` uses only `projectId`.

## Backup / DR honesty (§45–§47)
`docs/PLATFORM_05_BACKUP_AND_DR.md` marks automated backup as **DESIGNED ONLY** (with frequency,
retention, encryption, restore runbook and a verification checklist), restore testing as **NOT
POSSIBLE HERE**, and RPO/RTO as **TARGET**. No automated backup, scheduler or storage credential is
claimed to exist, because none does.

## Known limitations
- `installSignalHandlers` exists but is not yet mounted in `server.ts` (needs the real pool-close hook).
- Identity/audit stores remain in-memory, so "restart ⇒ lose state" is real, and graceful shutdown
  correctness is proven by unit tests rather than a live kill test.
- `express.json()` still uses the default body limit; `DEFAULT_LIMITS.maxJsonBodyBytes` is defined
  but not yet enforced at the HTTP layer (tracked as P2).