# PLATFORM-01 — IDENTITY / AUTHENTICATION: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Implementation
| File | Purpose |
| --- | --- |
| `src/lib/platform/identity/types.ts` | statuses, error codes, principal/session/event types, event sink |
| `src/lib/platform/identity/password.ts` | scrypt hasher, password policy |
| `src/lib/platform/identity/session.ts` | session store port, SessionManager (issue/verify/revoke/renew/logout) |
| `src/lib/platform/identity/tokenVerifier.ts` | external ID-token port + static test verifier |
| `src/lib/platform/identity/identityService.ts` | authentication rules, lockout, account lifecycle |
| `src/lib/platform/api/AuthApiRouter.ts` | HTTP boundary (login/logout/me/password change/reset/session) |
| `src/lib/platform/security/rateLimiter.ts` | auth/expensive/public buckets, critical bypass |
| `src/lib/platform/api/createPlatformRouter.ts` | composition root + documented storage honesty |
| `drizzle/0007_platform_identity.sql` | additive identity/session/auth-event tables |

## §13 acceptance evidence (26 domain + 8 HTTP tests, all pass)
| Requirement | Proof |
| --- | --- |
| Valid credentials → authenticated | session issued, `principal.userId`, `LOGIN_SUCCESS` event |
| Invalid credentials → rejected | `INVALID_CREDENTIALS`, zero sessions created |
| Disabled user → rejected | `ACCOUNT_DISABLED`; previously issued token now `SESSION_REVOKED` |
| Expired session → rejected | virtual clock past TTL ⇒ `SESSION_EXPIRED` |
| Revoked session → rejected | logout ⇒ `SESSION_REVOKED` |
| Logout invalidates session | `/logout` then `/me` ⇒ 401 |
| Password change invalidates prior credential | old password rejected, new accepted, all sessions revoked |
| No account enumeration | unknown-user body ≡ wrong-password body ≡ malformed body (HTTP level) |
| No plaintext secrets | stored record + audit blob scanned for the password string |
| Provider failure explicit | throwing verifier ⇒ `PROVIDER_UNAVAILABLE`, no local fallback |
| Timing-safe comparisons | `timingSafeEqual` for token and password checks |
| Rate limiting | 12th auth attempt refused; `critical` bucket never throttled |

## Bugs found by these tests and fixed
1. **Login never returned the bearer token** — an HTTP client could not have logged in at all.
   `AuthResult` now carries `token` (null for external ID tokens, so no second secret is minted).
2. **Third-party `disabled` flag was ignored** — a disabled Firebase account could authenticate
   when the local row was stale. Provider disabled state is now authoritative.
3. **`createUser` persistence branch used `void ?? x`**, which is a no-op pattern; replaced with an
   explicit `storeAccount` helper.
4. Two test-authoring errors corrected against real semantics (duplicate-user case needed a seeded
   store; lockout triggers on the Nth failure, not the N+1).

## Phase gate (§64)
- Implementation complete: yes
- Tests pass: `npx vitest run src/lib/platform` → 2 files / 34 tests pass
- Typecheck: `npx tsc --noEmit` → exit 0
- Build: `npm run build` → success (`dist/server.cjs`)
- Security checks: pass (no plaintext, no enumeration, no error leakage, rate limited)
- Evidence audit: pass (§13 table above)
- P0 = 0, P1 = 0
- Certification document: this file

## Regression
Full suite re-run after the phase: 185 files / 1827 tests pass (see PLATFORM foundation audit for
the phase-by-phase ledger).