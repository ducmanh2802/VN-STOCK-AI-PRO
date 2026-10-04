# PLATFORM-01 — IDENTITY / AUTHENTICATION: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Discovery: what actually existed (nothing rebuilt)
| Capability | Actual state before this phase |
| --- | --- |
| Token verification | **IMPLEMENTED** — `src/middleware/auth.ts` verifies Firebase ID tokens via `adminAuth` |
| User row | **PARTIAL** — `users` table (uid/email/displayName) + `getOrCreateUser` upsert |
| Password auth | **MISSING** |
| Sessions (issue/expire/revoke) | **MISSING** — tokens are stateless, so no revocation possible |
| Account status | **MISSING** — no ACTIVE/DISABLED/LOCKED/PENDING state |
| Lockout / throttling | **MISSING** |
| Auth events | **MISSING** |
| Auth HTTP routes | **MISSING** — only `GET /api/users/me` existed |
| Password hashing | **MISSING** |

Decision: keep Firebase ID-token verification as the provider adapter (no duplicate identity
model) and build the missing platform capabilities around injectable ports.

## Architecture (ports & adapters, all core logic pure)
```text
src/middleware/auth.ts (existing Firebase verify) ──┐
                                                     ├─→ TokenVerifier port
src/lib/platform/identity/tokenVerifier.ts ─────────┘   (StaticTokenVerifier for tests)

AuthApiRouter (HTTP boundary, §12/§29/§50)
  → IdentityService (rules, no I/O)
      → UserStore port        (InMemoryUserStore)
      → SessionManager        → SessionStore port (InMemorySessionStore)
      → PasswordHasher port   (ScryptPasswordHasher — node:crypto)
      → AuthEventSink port    (InMemoryAuthEventSink → PLATFORM-03 audit)
      → RateLimiter           (PLATFORM security, auth bucket)
```
Every dependency (store, clock, provider, hasher) is injected, so all §13 acceptance rules are
proven offline with a virtual clock — no network, no Firebase credentials, no test flakiness.

## Security decisions
1. **Hashing**: `scrypt` (N=16384, r=8, p=1) from `node:crypto` with a 16-byte random salt,
   64-byte key, self-describing record `scrypt$N$r$p$salt$hash`. No custom crypto invented, no new
   dependency added, parameters can be raised later without invalidating old records.
2. **Plaintext never persisted or logged** — asserted by tests that scan the stored record and the
   full audit trail for the password string.
3. **Anti-enumeration**: unknown account and wrong password return the identical
   `INVALID_CREDENTIALS`; the unknown path still performs a scrypt verification (`dummyVerify`) so
   response timing does not leak existence. A disabled account with a *wrong* password also returns
   `INVALID_CREDENTIALS`; only correct-credential access reveals `ACCOUNT_DISABLED`.
4. **Sessions**: 256-bit random token returned once at issuance; only its SHA-256 is stored, so a
   store dump cannot be replayed. Constant-time comparison. Expiry, revocation, logout, bounded
   renewal (max 12) — renewal past the bound forces re-authentication instead of an immortal session.
5. **Lockout**: 5 failures / 15 min window → 15 min lock, applied to unknown identifiers too, and
   the account row transitions to `LOCKED`. `ACCOUNT_LOCKED` is returned only after the threshold.
6. **Password change** rotates the credential AND revokes every existing session (§13).
7. **Provider boundary**: a third-party `disabled` signal is authoritative — a disabled Firebase
   account cannot authenticate even if the local row is stale. Provider errors surface as
   `PROVIDER_UNAVAILABLE`; there is no silent fallback to local auth.
8. **HTTP responses**: identical 401 body for every credential failure; no stack traces, SQL, env
   vars, or provider internals; password-reset always answers 202.

## Schema (additive, 0007)
`platform_user_account`, `platform_sessions`, `platform_auth_events` (+ indexes). `src/db/schema.ts`
was **appended only** (83 insertions, 0 deletions) — no existing table or column was touched.

## Ownership
- OWNED: `src/lib/platform/**`, `drizzle/0007_platform_identity.sql`, `docs/PLATFORM_*`
- SHARED (minimal, documented): `server.ts` (one import + one `app.use('/api/platform', …)`),
  `src/db/schema.ts` (append-only block)
- PROTECTED: `src/middleware/auth.ts`, `src/db/users.ts`, Decision OS, Product, Learning, Portfolio,
  Paper/Ledger engines — all untouched.

## Known limitations (stated, not hidden)
- Identity/session state is **process-local**: sessions do not survive restart (durable schema already
  reserved in 0007; drizzle adapters are the next step). Restart ⇒ re-login, never silent access.
- No refresh-token rotation table yet; no email verification; no MFA.
- Lockout is per identifier + per row, so it is not a distributed throttle across processes.
- `GET /api/health` is still the pre-existing handler; liveness/readiness split lands in PLATFORM-04.