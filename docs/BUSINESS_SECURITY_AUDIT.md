# COMMERCIAL SECURITY AUDIT — BUSINESS LANE

**Date:** 2026-10-05
**Scope:** `src/lib/business/**`, `src/services/business/**`, `src/db/business/**`,
`drizzle/0008..0012_business_*.sql`
**Method:** static evidence (grep of dangerous sinks, secret shapes, import graph) plus the
236 behavioural tests, which are the primary control.

---

## 1. AUTHENTICATION

| Item | Finding |
|---|---|
| Business-side token verification | **DELEGATED, NOT IMPLEMENTED.** `businessApiRouter.requireActor` calls `deps.identity.authenticateToken(token)` — the PLATFORM `IdentityService`. The Business lane holds no secret, validates no signature and stores no session. |
| Token storage | **NONE.** No cookie, no localStorage, no token persistence anywhere in the lane (`grep localStorage` → 0 hits). |
| Token leakage | Token is read from the `Authorization` header, never echoed, never logged, never persisted. |
| Password handling | **OUT OF SCOPE** — no password field exists in this lane. |
| Session expiration | Enforced by `actorFromPrincipal(principal, status, nowMs, …)`, which rejects `expiresAt <= nowMs`. Tested. |
| Account disabled/locked | `actorFromPrincipal` rejects `DISABLED`, `LOCKED`, `PENDING`. Tested (`fails closed on every doubt`, 5 cases). Defence in depth: `EntitlementService.check` re-checks `platformUserStatus !== 'ACTIVE'` so a hand-constructed actor cannot bypass. |

**No P0.** The lane cannot weaken authentication because it does not implement any.

---

## 2. AUTHORIZATION

| Threat | Control | Test |
|---|---|---|
| **IDOR — cross-owner subscription** | `EntitlementEngine` gate 3: `sub.subjectId !== subject.subjectId` → `DENIED_SUBJECT_MISMATCH` | `denies a subscription that belongs to a different subject (IDOR, roadmap §02.4)` |
| **IDOR — cross-owner community artifact** | `canView` owner check; `canEdit` author-only; `canDelete` author-or-moderator | 3-matrix IDOR suite + ownership suite |
| **IDOR — cross-organization membership** | `can()` rejects `MEMBERSHIP_ORG_MISMATCH` | `denies a membership belonging to a different organization (cross-tenant)` |
| **IDOR — cross-organization workspace** | `workspacesOf` filters by `organizationId`; no join table exists | `never returns another organization's workspaces` |
| **Privilege escalation via entitlement precedence** | 5 properties in `resolveEntitlementPrecedence`, incl. 4 named ESCALATION TESTs | 4 dedicated tests |
| **Privilege escalation via plan change** | `changePlan` refuses a plan incompatible with the subject kind | `rejects a plan change that the subject kind does not permit` |
| **Privilege escalation via role change** | Last active OWNER cannot be demoted; SUSPENDED owner is not a safety net | 2 tests |
| **Privilege escalation via moderator flag** | `canModerate` only widens access on explicit `forModeration: true`, never on the normal read path | `IDOR MATRIX: withdrawn content is invisible to everyone but moderators` (attacker holds `canModerate: true`) |
| **Marketplace ownership** | `submitForPublication` requires `viewer.userId === v.authorUserId` | `refuses submission by a non-author` |
| **Billing ownership** | No route takes a subject id parameter. `/subscription`, `/entitlements`, `/usage`, `/audit` all read the **caller's** subject. There is no identifier to tamper with. | by construction |
| **Last-owner lockout** | `CANNOT_DEMOTE_THE_LAST_OWNER` | 2 tests |
| **Role capability map integrity** | `roleHas` reads `ROLE_CAPABILITIES`; every role has a non-empty, duplicate-free list | `has a non-empty, non-overlapping-by-accident capability map for every role` |

**No P0.** One P1 recorded: seat-assignment repository transaction discipline (B-02/O-03).

---

## 3. PAYMENT SECURITY

| Threat | Control | Test |
|---|---|---|
| **Webhook spoofing** | HMAC-style signature over the **raw body** | `rejects a forged signature and applies nothing` |
| **Body tampering after signing** | Signature computed over the raw string, never a re-serialised object | `rejects a tampered body even with a valid signature over the original` |
| **Replay attack** | `UNIQUE(event_id)` + absolute ±300 s timestamp window | `rejects a replayed old webhook`, `rejects a future-dated timestamp equally` |
| **Duplicate webhook** | Dedupe claims `eventId` **before** verification; duplicate returns the original record with no new effect | `PROPERTY: duplicate webhook => exactly one economic effect` |
| **Client-side payment trust** | The request envelope carries only `{eventId, provider, eventType, rawBody, signature, timestamp}`. Payment status is read **from the provider**. The payload's own status field is never read. | `does not read the payment status from the payload (never trust client-side success)` — body claims FAILED under a `succeeded` event; provider state wins |
| **Unknown provider / event type** | `UNKNOWN_PROVIDER`, `UNSUPPORTED_EVENT_TYPE` — fail closed | 1 test |
| **Secret handling** | Secrets are **resolved per request** via `deps.resolveSecret(provider)`; never stored on a record, never logged. `business_webhook_records` stores a payload **digest**, never the signature. | code evidence + migration comment |
| **Production privilege escalation** | `assertSettleable` throws for `PRODUCTION` and for `canSettle: false`. No PRODUCTION adapter exists. | `refuses to treat any provider as PRODUCTION` |
| **Unknown payment defaulting** | `getPayment(unknownRef)` returns `PAYMENT_UNKNOWN`, never success/failure | `returns UNKNOWN for an unrecognised payment reference, never a default` |
| **Amount fabrication** | `moneySource` ⇄ amount coupling enforced in code AND in SQL CHECK | `PROPERTY: the ledger never accepts an unsourced amount at any point in the journey` |
| **Refund abuse** | `refund()` refuses an unsettled payment; refund ≤ paid is a ledger invariant | `refuses to refund an unsettled payment`, `detects a refund exceeding what was paid` |

**No P0.**

---

## 4. DATA / PRIVACY

| Item | Finding |
|---|---|
| PII collected | `userId`, `organizationId`, `displayName` only. **No** email, phone, address, national ID. No PII column was added to any business table. |
| Private research leakage | `canView` enforces 6 visibility tiers server-side; SQL filtering is an optimisation only. |
| Organization isolation | Every organization-scoped query filters by `organizationId`; `UNIQUE(subject_id)`; `CHECK (subject_id = organization_id)` on `business_organizations`. |
| Bulk disclosure | `visibleFeed` returns `redactedWithReasons` so a client cannot infer hidden content exists by absence. |
| Billing data | Money columns are NULL until a provider reports an amount. `marketplace_purchases` has **no amount column at all**. |
| Exports | `authorizeExport` maps every `OrgExportKind` to a capability; `AUDIT_REPORT` escalates to `ORG_MANAGE`; unknown kinds refused. |
| Analytics | **Aggregate only.** `business_org_analytics_snapshots` has no per-member activity column, by design (§04.8). |
| PII in logs | `redact()` drops credential-shaped keys at the write path; values >512 chars truncated. |
| Secrets in the DB | Webhook signature not persisted. Sandbox signing secret held only in an in-memory map, never written. |
| localStorage | **Zero** uses in the business lane. Nothing sensitive is stored client-side. |
| Errors echoed to client | Business routes return coded reasons (`UNKNOWN_FEATURE`, `FORBIDDEN:NOT_THE_AUTHOR`), never `error.message` from an internal throw — except `messageOf(error)` in the generic 500 path, which **can** surface an internal SCREAMING_SNAKE code. Codes are designed to be non-sensitive (no values, ids of other users, or stack traces). **Logged as P2-04** rather than P0/P1. |

---

## 5. API

| Threat | Control | Status |
|---|---|---|
| Authentication required | Every business route except `GET /plans` calls `requireActor` → 401/403 | OK |
| Request validation | Explicit, fail-closed: `feature` required; `quantity` integer 1..1000; `usageEventId` string ≤200; `periodKey` regex `^\d{4}-\d{2}$`; `status` allow-list; `limit`/`offset` bounded (≤100 / ≤100000) | OK |
| Mass assignment | Routes read **named** fields from `req.body` and never spread it. No route passes a body into a repository. | OK |
| Pagination | All list paths bounded and clamped in the repository (`Math.min(Math.max(limit,1),50)` etc.) | OK |
| Unbounded queries | No `select()` without a `where` + `limit` in `src/lib/db/business`. Verified by grep. | OK |
| Injection | Drizzle parameterised throughout. The only dynamic values are `Math.min/max` clamps. No string-built SQL. | OK |
| SQL injection via filters | No business route accepts a free-text filter into a query. | OK |
| Rate limiting | Not applied by the business router. PLATFORM's `InMemoryRateLimiter` exists and is not yet wired here. **P2-01.** | Gap |
| Security headers | Owned by PLATFORM's `securityHeaders` middleware (now mounted in `server.ts` by that lane). | OK |
| CORS / CSRF | No cookie auth in this lane ⇒ no CSRF surface. Token is header-based. | OK |
| Unsafe deserialization | `JSON.parse` in `parsePayload` / `toPost` is wrapped in try/catch with a typed fallback. No `eval`, no `Function`, no object revival. | OK |
| XSS | No rendering code in this lane. `grep dangerouslySetInnerHTML|innerHTML|eval|new Function|document.write` → **0 hits**. | OK |
| Denial of service | `quantity` capped at 1000; `limit` capped; `WEBHOOK_MAX_AGE_SECONDS` bounds replay; signature compare is fixed-length. | OK |

---

## 6. FINANCIAL SAFETY

| Check | Result |
|---|---|
| Imports from `src/lib/trading/**` in the business lane | **0** (grep) |
| Ability to override `RiskGuard` / `RiskManager` / `PositionSizer` / `TradingEngine` / `FinancialConservationValidator` / `PaperBroker` / `TradingDataValidator` | **None** — the lane cannot reach them |
| Ability to execute a trade | **None** — `EntitlementService.check` returns `CapabilityResult`; no order/fill/position type exists in the lane |
| Investment-ledger contamination | **None** — no position/quantity/price/NAV/P&L column in any business table; `assertLedgerDomain` refuses investment kinds |
| Real trading capability | Unchanged; still `PaperBroker` only with `isSimulation: true` (PHASE 0 §5.2) |
| Commercial → trading authority | **Explicitly severed.** §3 of the roadmap: "Commercial entitlement is NOT financial authorization." No code path converts a subscription into trading authority. |

**No P0.**

---

## 7. OBSERVABILITY (§28)

| Event | Emitted |
|---|---|
| `subscription_created` / `_started` / `_changed` / `_cancelled` / `_paused` / `_expired` | yes |
| `plan_changed` | yes |
| `payment_received` / `_failed` / `_unknown` | ledger kinds + reconciliation codes |
| `refund_issued` | ledger kind |
| `entitlement_granted` / `_revoked` / `_denied` | yes |
| `usage_recorded` / `usage_duplicate_ignored` | yes |
| `seat_assigned` / `_removed` / `organization_membership_changed` | **declared in the audit vocabulary; not yet emitted** — the domain transition exists, the service does not. **P2-02** |
| `marketplace_purchase` / `creator_payout` | ledger kinds exist; not yet wired to a service. **P2-02** |
| `content_reported` / `moderation_action` | community `ModerationRecord` is append-only and attributable; commercial audit action declared. **P2-02** |

Never logged: password, secret, payment credential, access token, PII — enforced by
`redact()` on every commercial audit write, and the business lane has no logging call at all.

---

## 8. FINDINGS SUMMARY

| ID | Severity | Finding |
|---|---|---|
| SEC-01 | **P1** | No SQL repository implementations for billing (payments / ledger / webhooks). Domain guarantees are proven; the adapters are not written. |
| SEC-02 | **P1** | Seat-assignment repository transaction discipline not implemented (`SELECT … FOR UPDATE` / conditional update). The partial UNIQUE index prevents the invalid state, but callers get a raw DB error rather than a typed `SEAT_ALREADY_ASSIGNED`. |
| SEC-03 | P2 | Business router not mounted in `server.ts` (protected + concurrently owned). Exported and mount-ready. |
| SEC-04 | P2 | Rate limiting not applied to business routes; PLATFORM's limiter is not yet wired. |
| SEC-05 | P2 | Organization/community/marketplace service layers and HTTP surfaces not written; audit action vocabulary partially unemitted. |
| SEC-06 | P2 | `business_organizations` / `org_memberships` have no FK to PLATFORM tables (concurrent lanes). Resolved at lane merge. |
| SEC-07 | P2 | Sandbox webhook signature is a deterministic stand-in, not a provider signing scheme. |
| SEC-08 | P2 | `error.message` may surface an internal code on a generic 500. Codes are designed non-sensitive. |
| SEC-09 | P3 | `displayName` not persisted on community post rows (cosmetic; join at read time). |

**P0 = 0. P1 = 2.**

Both P1 items are missing adapter code, not missing controls: every invariant they would
carry is already enforced in the domain layer and, for seats, by a database constraint.