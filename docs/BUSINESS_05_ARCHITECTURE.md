# BUSINESS-05 — BILLING / ENTITLEMENT / COMMERCIAL AUDIT ARCHITECTURE

**Status:** IMPLEMENTED + CERTIFIED
**Date:** 2026-10-05
**Tests:** 6 business files / 233 tests / 0 failures

---

## 1. REALITY FIRST

PHASE 0 §5.2 proved there is **no payment provider** in this repository — no SDK, no key, no
merchant account. So BUSINESS-05 builds the *operating system* around payments and settles
nothing:

```
paymentProvider.ts   PaymentProvider interface + SandboxPaymentProvider + environment guards
webhookPipeline.ts   verify → dedupe → process
commercialLedger.ts  append-only commercial ledger, derived balances, domain guard
refundPolicy.ts      what a refund does (and what it must never do)
reconciliation.ts    detect + surface; never repair
```

There is no code path that can mark a payment `PRODUCTION`, because
`assertSettleable()` throws for `PRODUCTION` and for any adapter with `canSettle: false`.
A test payment therefore *cannot* be represented as a real payment — §4's requirement is
structural, not conventional.

Money is **integer minor units only**. There is no float money type, and no FX table:
inventing a conversion rate would be fabricating a financial figure (§2.1).

---

## 2. WEBHOOK PIPELINE (roadmap §05.4, §05.5)

Gate order, each step load-bearing:

```
1. envelope shape        -> MALFORMED_ENVELOPE
2. provider known        -> UNKNOWN_PROVIDER
3. event type supported  -> UNSUPPORTED_EVENT_TYPE          (fail closed)
4. DEDUPE on eventId     -> duplicate returns the ORIGINAL record, no new effect
5. SIGNATURE over RAW body-> INVALID_SIGNATURE
6. timestamp freshness   -> STALE_TIMESTAMP (absolute window, ±300s)
7. read status FROM PROVIDER (never from the payload)
8. apply EXACTLY ONE effect
```

Three decisions worth calling out:

**Dedupe claims before verification.** A replayed valid signature must not cause repeated
work, so the atomic claim happens first. The duplicate path returns `accepted: true` with the
original record rather than an error — providers retry legitimately, and an error would make
them retry forever.

**The signature covers the raw body.** Re-serialising a parsed object to verify it would let
an attacker alter a field that survives serialisation identically. Tested by
`rejects a tampered body even with a valid signature over the original`.

**The payload's own status field is never read.** The test body claims
`status: 'PAYMENT_FAILED'` under a `payment.succeeded` event; the pipeline reads
`PAYMENT_FAILED` from the provider instead. That is §05.5's "never trust client-side payment
success" made structural.

`PAYMENT_UNKNOWN` from the provider ⇒ `RETRY_REQUIRED`, never `PROCESSED`. An unreachable
provider ⇒ `RETRY_REQUIRED`, never `FAILED` and never success.

---

## 3. COMMERCIAL LEDGER (roadmap §05.6)

### Ledger separation

| Domain | Owner | Contents |
|---|---|---|
| Investment | trading lane (untouched) | cash, position, NAV, P&L, fees, fills, orders |
| Commercial | this lane | invoice, payment, refund, credit, platform fee, creator share |

Enforced structurally, not by convention:

1. `src/lib/business/**` has **zero** imports from `src/lib/trading/**` — it cannot reach a
   position or a NAV even by accident.
2. `CommercialLedgerEntry` has no position / quantity / price / NAV field. There is no column
   in which an investment quantity could be written.
3. `assertLedgerDomain()` refuses an entry whose `kind` is an investment concept.
4. The migration has no FK to, and shares no table with, the investment ledger.

### Money is never unsourced

Every entry carries `moneySource`:

- `PROVIDER_REPORTED` → `provider` must be non-null (DB CHECK)
- `OPERATOR_ADJUSTMENT` → an operator made an explicit adjustment
- `NONE` → **amount must be NULL**. A state record, not a financial record.

So an amount cannot be written without declaring where it came from. A `PAYMENT_UNKNOWN` or
`STATE_CHANGE` entry contributes **nothing** to any balance — tested by
`a state record never moves a balance`.

### Append-only + idempotent

No update, no delete, no correction-in-place; a correction is a new pair of entries.
`UNIQUE(causation_id)` means a replayed effect appends nothing. Balances are **derived**, so
they cannot drift from the entries.

`ledgerInvariantsHold()` detects the failure that actually costs money — a refund exceeding
what was received for the same reference — and reconciliation promotes it to P0.

---

## 4. REFUND POLICY (roadmap §05.8)

| Situation | Entitlement | Research ownership |
|---|---|---|
| refund **within** the paid period | `KEEP_ENTITLEMENT_UNTIL_PERIOD_END` | **retained** |
| refund **after** the period | `REVOKE_SUBSCRIPTION_ENTITLEMENT` | **retained** |
| marketplace purchase | `REVOKE_PURCHASED_LISTING_ACCESS` | **retained** |

The principled call: **a refund never destroys the user's research.** Removing someone's own
work to settle a billing dispute is not acceptable, and §05.8 says not to do it absent an
explicit policy. What a refund revokes is the *commercial* right to consume paid capabilities
going forward.

Inside the paid period the customer paid for that period, so revoking it would be a
retroactive charge; entitlement lapses at period end through the existing `CANCELLED → EXPIRED`
path with no special case.

The whole refund carries **one** `causationId`, so replaying it appends nothing.

---

## 5. RECONCILIATION (roadmap §05.7)

The three findings the roadmap names, plus four this implementation found necessary to avoid
the same class of silent lie:

| Code | Severity | Condition |
|---|---|---|
| `SUBSCRIPTION_ACTIVE_PAYMENT_UNKNOWN` | P0 | entitling subscription + unknown payment |
| `PAYMENT_SETTLED_ENTITLEMENT_MISSING` | P0 | settled payment, no subscription / still INCOMPLETE |
| `ENTITLEMENT_ACTIVE_SUBSCRIPTION_EXPIRED` | P0 | a capability was ALLOWED while not entitling |
| `PAYMENT_FAILED_SUBSCRIPTION_STILL_ENTITLING` | P0 | failed payment, no grace, still entitling |
| `REFUNDED_SUBSCRIPTION_STILL_ENTITLING` | P1 | refunded but still ACTIVE |
| `SUBSCRIPTION_STATUS_INVALID` | P0 | persisted status outside the machine |
| `LEDGER_INVARIANT_VIOLATION` | P0 | refund exceeds payment, or a domain violation |

Findings 4 and 5 are the ones that cost real money: a failed payment that never removes
entitlement, and a refunded customer who keeps access.

**This module never repairs.** It has no write path to a subscription, a payment or an
entitlement. It produces a report; the `overlay` it returns (`PAYMENT_UNKNOWN`,
`ENTITLEMENT_MISSING`, `ENTITLEMENT_ORPHANED`) feeds `EntitlementEngine`, which then returns
`REQUIRES_RECONCILIATION` instead of `ALLOWED` — closing the loop with §29.

Every finding carries a `requiredAction` naming what a human must decide. Tested by
`every finding states a required human action`.

Note the deliberate non-finding: a failed payment **inside an explicit grace period** is
*not* flagged. That is what a grace period is for.

---

## 6. DATA MODEL

| Table | Load-bearing constraint |
|---|---|
| `business_commercial_payments` | `UNIQUE(idempotency_key)` — no duplicate payment |
| `business_commercial_ledger` | `UNIQUE(causation_id)` — no duplicate effect; amount ⇔ money_source |
| `business_webhook_records` | `UNIQUE(event_id)` — no duplicate webhook processing; PROCESSED ⇒ effect named; FAILED ⇒ reason given |
| `business_reconciliation_findings` | unresolved P0 cannot be closed without `resolved_by` + note |

Three UNIQUE constraints, one per idempotency requirement in §05.4.

`business_webhook_records` stores a **payload digest**, never the body and never the
signature — a signature is a credential-shaped value and is not persisted (§28).

---

## 7. KNOWN LIMITATIONS

| # | Limitation | Severity |
|---|---|---|
| B-01 | `SandboxPaymentProvider.verifyWebhookSignature` is a deterministic stand-in, **not** a provider signing scheme (real ones are HMAC-SHA256 over a different canonical form) | P2 — swapping it is a one-method change; the pipeline around it is provider-agnostic |
| B-02 | No repository implementations for payments / ledger / webhooks; the domain guarantees are proven, the SQL adapters are not | P1 |
| B-03 | No reconciliation repository, and no operator repair workflow (by design — repair must be audited) | P2 |
| B-04 | Reconciliation runs on demand; there is no scheduler to run it periodically | P2 — INFRA phase |
| B-05 | No billing HTTP router | P2 |