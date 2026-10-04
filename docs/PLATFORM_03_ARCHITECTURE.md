# PLATFORM-03 — AUDIT / PROVENANCE / SECURITY: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Discovery
| Capability | State before |
| --- | --- |
| Audit log / trail | **MISSING** — no append-oriented record of who did what |
| Request/correlation id | **MISSING** — no way to answer "why did this happen?" |
| Security headers | **MISSING** — no CSP, nosniff, frame protection |
| Secret redaction | **MISSING** — `console.error` used ad hoc; no redaction layer |
| Path/upload safety | **MISSING** (no upload feature exists yet either) |
| CORS / CSRF / rate limiting | **MISSING** (rate limiting added in PLATFORM-01 for auth) |

## Architecture
```text
HTTP request
  → correlationMiddleware      requestId (always) + sanitized inbound correlationId
  → securityHeaders            CSP, nosniff, DENY frames, referrer/permissions policy
  → identity / authorization   (PLATFORM-01/02)
  → domain services            (product lanes — unchanged)
  → AuditLog.record(...)       append-only, redacted, hash-chained
        ↑
        └── AuthEventAuditSink  (PLATFORM-01 auth events → audit trail)
```

## Audit model (§23)
`auditId · occurredAt · actorUserId · organizationId · workspaceId · action · resourceType ·
resourceId · beforeVersion · afterVersion · requestId · correlationId · result · metadata ·
prevHash · hash`

Covered actions include auth.*, authz.*, workspace.*, decision.*, journal.*, research.experiment,
backtest.run, paper_replay.run, paper_order.submit, paper_fill.record, portfolio.mutate,
risk.rejection, config.change, ai.interaction, admin.action. Reads are intentionally **not** audited
(§24 "avoid an unusably large audit system").

## Immutability (§25)
- `AuditLog` exposes `record` / `query` / `verifyIntegrity` — **there is no update or delete method**,
  asserted by a test that reflects over the API surface.
- Every record embeds `prevHash`; `hash = sha256(canonical(record) + prevHash)`. `verifyIntegrity()`
  walks the chain and detects mutated fields, deleted records, and reordering.
- Honest limitation: this is **tamper-EVIDENT, not tamper-proof**. An operator with write access to
  the store could rewrite the chain. Real immutability requires an external append-only sink
  (WORM bucket / signed batches) — documented, not implemented.

## Secret redaction (§28/§43) — applied before persistence
Single chokepoint `redact()` used by audit and (in PLATFORM-04) the logger:
1. **key-based** — `password|secret|token|api_key|authorization|cookie|session_id|credential|
   private_key|refresh|access_token|client_secret|otp|mfa|pin` (case-insensitive), at any depth.
2. **value-shape based** — `Bearer …`, JWT triples, PEM private-key blocks, ≥40-char opaque
   secrets, ≥64-char hex. Catches secrets stored under an innocent key.
3. **bounds** — depth cap, array/item caps, string truncation, so a hostile payload cannot bloat a record.

## File/upload safety (§52)
`resolveWithin()` resolves paths strictly inside a base directory (rejects `..`, absolute paths,
NUL bytes); `validateUploadFilename()` enforces an extension allow-list + size cap and never trusts
client MIME. Provided as a pure, tested guard for future endpoints — no upload feature exists today.

## Error response safety (§29)
`sendSafeError()` returns only a public message in production; diagnostics are attached **only**
outside production. No stack traces, SQL, env vars, or provider credentials reach clients.

## Known limitations
- Audit + identity + membership state are process-local (not durable) — see the composition root's
  explicit storage-honesty note; migration 0007 reserves the durable schema.
- No retention/expiry policy yet (legal retention requirements must be decided with the business lane).
- No DB adapter, so `verifyIntegrity()` currently guards only the in-process log.
- CORS is not configured: the SPA is same-origin. Adding CORS is intentionally deferred until a
  deployment needs it (an open CORS policy would be a P0 risk, so silence is safer).