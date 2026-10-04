# PLATFORM-05 — PRODUCTION HARDENING: CERTIFICATION
Status: CERTIFIED_WITH_LIMITATIONS (lane-local) | Date: 2026-10-04

## Implementation
| File | Purpose |
| --- | --- |
| `src/lib/platform/config/env.ts` | env profiles, startup validation, secret-presence view |
| `src/lib/platform/resilience/resilience.ts` | timeouts, bounded retry (writes excluded), circuit breaker, resource limits |
| `src/lib/platform/lifecycle/gracefulShutdown.ts` | ordered drain → stopJobs → closeDatabase + signal installer |
| `src/lib/platform/hardening/repoGuards.ts` | secret scanner + migration auditor |
| `src/lib/platform/hardening/__tests__/hardening.test.ts` | 15 tests |
| `src/lib/platform/hardening/__tests__/repoGuards.test.ts` | 7 tests (incl. live repo scan) |
| `docs/PLATFORM_05_BACKUP_AND_DR.md` | backup/restore/DR with DESIGNED vs VERIFIED split |

## Acceptance evidence (114 platform tests total, all pass)
| Requirement | Proof |
| --- | --- |
| §41 profiles | dev/test/production parsed; unknown `NODE_ENV` rejected |
| §42 explicit startup failure | missing production secrets + DB settings → `ConfigError` listing **all** issues |
| No silent fallback | invalid `PORT`/`LOG_LEVEL` rejected, not coerced; `DEBUG` refused in production |
| Secret values never exposed | `configPublicView` contains presence flags only |
| §49 no infinite waits | `withTimeout` rejects slow work; hanging drain times out |
| §49 retry safety | `canRetry('write')` → `write_not_retried`; bounded attempts + capped backoff |
| §39 provider failure | breaker opens after threshold, `CIRCUIT_OPEN` raised, provider NOT called |
| §51 resource limits | page size, symbol list, AI context bounded with typed reasons |
| §48 shutdown order | `markNotReady → drain → stopJobs → closeDatabase` asserted by call order |
| §48 stuck drain | timeout recorded, jobs still stopped, DB still closed |
| §48 failing step | error recorded, sequence still completes (DB always closes) |
| §43 secret scan | **live scan of `src`, `server.ts`, `drizzle`, `scripts`, `dist`, firebase config` → zero findings** |
| Scanner efficacy | all 9 credential shapes detected from runtime-assembled samples |
| No over-blocking | benign `process.env.GEMINI_API_KEY` lines not flagged |
| §44 migrations | sequential from `0000`, no gaps/duplicates, zero destructive statements, `0007` present |

## Real finding found and remediated (P0-class process defect)
| Sev | Finding | Action |
| --- | --- | --- |
| P1 | `firebase-applet-config.json` was **tracked in Git** and not gitignored; its Firebase Web API key was bundled into `dist/server.cjs` | `git rm --cached` (file kept on disk — no runtime breakage), added to `.gitignore`, committed `firebase-applet-config.example.json` template, scanner allowlist narrowed to the Web key only |

Assessed as P1 rather than P0 after inspection: the value is a Firebase **Web** API key (a public
project identifier by Firebase design), `src/lib/firebase-admin.ts` uses only `projectId`, and the
Admin SDK authenticates via service-account credentials. No service-account key or private key exists
anywhere in the repository — the scanner now asserts that (`service-account-private-key` and
`service-account-type` patterns).

## Findings
| Sev | Finding | Disposition |
| --- | --- | --- |
| P2 | `express.json()` body limit not yet set to `DEFAULT_LIMITS.maxJsonBodyBytes` | Tracked; limit constant + checker exist and are tested |
| P2 | `installSignalHandlers` not mounted in `server.ts` (needs a real pool-close hook) | Documented; coordinator itself is tested |
| P2 | Automated backup/restore is DESIGNED only | Stated explicitly; runbook + verification checklist provided |
| P3 | RPO/RTO are targets, not guarantees | Stated as targets per §47 |

P0 = 0, P1 = 0 remaining (one P1 found and fixed).

## Phase gate (§64)
Implementation complete · tests pass (`src/lib/platform` → 8 files / 114 tests) · typecheck clean for
platform scope · `npm run build` success · security checks pass (live secret scan green, migration
audit green) · evidence audit pass · certification document present.

## Certification decision
**CERTIFIED_WITH_LIMITATIONS** — the platform foundation is materially hardened (config validation,
secrets hygiene, timeouts, breaker, limits, shutdown sequencing, executable repo guards), but backup
automation and durable identity/audit storage remain DESIGNED/in-memory and must not be represented
as production-ready in a deployment claim.