# PLATFORM FOUNDATION — FULL SYSTEM AUDIT
Type: READ-ONLY AUDIT (§67) | Date: 2026-10-04 | Scope: platform layer + whole-stack checks

> Audited after PLATFORM-05. Findings are recorded with severity per §65. Ownership of pre-existing
> lanes is respected: foreign-lane issues are reported, not fixed.

## 1. Summary

| Severity | Open | Fixed during this lane | Notes |
| --- | --- | --- | --- |
| P0 | 0 | 0 | no credential auth bypass, no real execution path, no financial corruption |
| P1 | 0 | 1 | committed Firebase config (found by the secret scan, remediated) |
| P2 | 6 | 0 | all documented and non-blocking |
| P3 | 4 | 0 | UX / operational polish |

The platform foundation is **materially hardened but not production-deployed**: identity, audit and
membership state are process-local and backup automation is DESIGNED only. That is stated as a
limitation rather than papered over.

## 2. Audit by domain (§67)

### IDENTITY / AUTHORIZATION
| Check | Result |
| --- | --- |
| Plaintext credentials anywhere | none — scrypt records only, asserted by test |
| Account enumeration | prevented (identical code + comparable timing), HTTP-verified |
| Session revocation / logout / expiry | implemented + tested |
| Disabled account authentication | blocked (local status **and** provider signal) |
| Privilege escalation | blocked by permission + rank, tested for all four roles |
| IDOR | blocked server-side for journal/portfolio/research/decision/scenario/paper_replay/alert/learning |
| Cross-workspace access | blocked in both directions |
| Real/simulation confusion | n/a to platform; paper-only paths verified unchanged |
| Authorization gaps | P2-1 (feature routers not yet gated), P2-2 (owner-level durability) |

### AUDIT / DATA PROVENANCE
| Check | Result |
| --- | --- |
| Who/what/when/which-object/versions/result | all fields present |
| Append-only | no update/delete API; reflection test |
| Tamper evidence | hash chain detects mutation, deletion, reordering |
| Tamper-proofing | **P3-1** — evidence only, no external WORM sink |
| Secrets in audit metadata | redacted pre-persistence (key-based + value-shape) |
| Request correlation | requestId on every route; correlationId sanitised |
| Audit durability | **P2-3** — process-local |

### DATA / MARKET DATA
| Check | Result |
| --- | --- |
| Fabricated market values introduced by platform | none — platform touches no market data |
| `UNAVAILABLE` → 200 with fake value | prohibited; `sendSafeError` + readiness semantics |
| Stale data as current | `STALE` surfaced as degraded, never silently OK |
| Mock data in runtime path | `src/data/mock/marketData.ts` is reachable **only** from `src/db/seed.ts`, which nothing imports at runtime → not a production path (P3-2) |

### FINANCIAL INTEGRITY (§5/§70)
| Protected system | Change |
| --- | --- |
| RiskGuard / RiskManager / PositionSizer | none — platform imports and records results only |
| TradingEngine / PaperBroker | none — still `new PaperBroker()` in `server.ts` |
| Ledger / FinancialConservation / reconciliation | none |
| Portfolio + Multi-asset engines | none (imported read-only in tests) |
| Decision OS / Research / Backtest | none |
| MarketDataIntegrityGuard / TradingDataValidator | none |

Verified in the §68 E2E: `RiskDecision.state`, `decisionStatus`, `accountingStatus` and
`reconciliationStatus` pass through untouched.

### OBSERVABILITY
| Check | Result |
| --- | --- |
| Liveness vs readiness separated | yes; DB outage does not flap liveness |
| Dependency health | probe framework + statuses; **P2-4** no probes registered yet |
| Metrics useful (not padded) | 9 metrics, each actionable |
| Financial values in metrics | impossible (name guard + label sanitisation) |
| Log fields / levels / redaction | complete |
| Production error leakage | `sendSafeError` strips internals in production |
| Performance claims | **not claimed** — no production capacity inferred from this repo (§71) |

### SECURITY (§28)
| Area | Status |
| --- | --- |
| Input validation | zod on auth routes; limits defined (`DEFAULT_LIMITS`) |
| Authentication / authorization / sessions | implemented + tested |
| CSRF | n/a — token-based API, no cookie session; noted in audit |
| CORS | not configured (same-origin SPA). **P3-3** — deliberate; open CORS would be P0 |
| Security headers | CSP, nosniff, DENY, referrer, permissions, COOP/CORP |
| Rate limiting | auth / expensive / public; `critical` bypass protects accounting |
| Secret handling | scan green across `src`, `server.ts`, `drizzle`, `scripts`, `dist` |
| Error leakage | uniform 401s, no stack traces/SQL/env in production |
| SQL injection | no string-concatenated SQL introduced; platform uses in-memory stores (drizzle uses parameterised queries) |
| Path traversal | `resolveWithin` + upload allow-list (guard for future endpoints) |
| XSS | no `dangerouslySetInnerHTML` added; CSP restricts script sources |
| Unsafe serialisation | metadata redacted + bounded |

### RECOVERY (§72)
| Scenario | Status |
| --- | --- |
| Application restart | works; sessions lost by design (denied, not faked) |
| Database unavailable | readiness 503, liveness 200 |
| Provider unavailable / timeout | breaker + explicit timeout |
| Failed request | error paths return typed codes |
| Migration failure | audit detects destructive/renumbered migrations (guard) |
| Backup restore | **P2-5** — runbook only, not executed |
| Graceful shutdown | sequencing implemented + tested; signal wiring pending (P2-6) |

### PERFORMANCE (§37)
Measured in-repo (honest labelling):

| Metric | Status |
| --- | --- |
| Platform HTTP overhead | not measured — would need a load test; **not claimed** |
| Auth latency (scrypt N=16384) | intentionally ~100 ms per verification by design; caching risk decisions is a documented follow-up |
| Audit overhead | in-memory append + one sha256 per record |
| N+1 in platform code | none (platform issues no SQL) |
| Unbounded queries | platform issues none; pre-existing repositories lack `.limit()` in places → **P2-7** (foreign lane) |
| Duplicate calculations | none introduced |

## 3. §67 prohibited-pattern checklist
| Pattern | Found? |
| --- | --- |
| duplicate engines | no — Decision OS / portfolio / learning engines reused, not reimplemented |
| duplicate identity models | no — Firebase provider adapter kept, platform layers around it |
| authorization bypasses | no (P2-1 is missing gating on legacy single-tenant routes, not a bypass of a multi-user path) |
| silent mocks | no — `StaticTokenVerifier` is test-only and explicitly named |
| silent fallback | no — config fails fast; `UNAVAILABLE` never becomes a fake 200 |
| secret leaks | none remaining (one found and fixed) |
| audit gaps | auth + platform actions covered; reads intentionally not audited |
| data provenance breaks | none introduced |
| financial accounting breaks | none |
| real execution paths | none — `server.ts` still constructs `PaperBroker` only |

## 4. Findings register

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| F-01 | P1 (fixed) | `firebase-applet-config.json` tracked in Git, key bundled into `dist/server.cjs` | untracked (`git rm --cached`, file kept), gitignored, example template committed, scanner narrowed to the public Web key only |
| F-02 | P2 | Legacy single-tenant routers (`/api/stocks/**`, `/api/trading`, `/api/macro`) not behind `requirePermission` | documented; not a bypass while those routes hold no cross-user data |
| F-03 | P2 | Identity/session/audit/membership state is process-local | documented in the composition root; migration 0007 reserves durable schema; restart denies rather than fabricates |
| F-04 | P2 | `defaultProbes()` empty → readiness reports OK by construction | stated explicitly; real probes pending a durable pool |
| F-05 | P2 | Backup/restore not implemented | DESIGNED + runbook + checklist; no claim of automation |
| F-06 | P2 | `installSignalHandlers` not mounted in `server.ts` | coordinator tested; mounting needs the pool-close hook |
| F-07 | P2 | `express.json()` body limit not set to `DEFAULT_LIMITS.maxJsonBodyBytes` | constant + checker exist and are tested |
| F-08 | P2 | Pre-existing repositories use no `.limit()` (unbounded reads) | foreign lane; reported, not modified |
| F-09 | P3 | Audit is tamper-evident, not tamper-proof | documented; needs external WORM sink |
| F-10 | P3 | `src/data/mock/marketData.ts` reachable only from the unused seed script | not a runtime path; recommend deletion or explicit DEV-only guard |
| F-11 | P3 | 23 `console.*` calls remain in `server.ts` | legacy logging; platform logs are structured |
| F-12 | P3 | No CSRF layer | n/a for token auth; revisit if cookie sessions are introduced |

## 5. Conclusion
No P0. No open P1. The single P1 found was remediated at the source. Remaining items are documented,
non-blocking, and none of them can corrupt financial state or leak credentials in the current
single-process build.