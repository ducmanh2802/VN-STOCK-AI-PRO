# PAPER REPLAY / LIVE-SIMULATION — ARCHITECTURE

**Version**: `v1.0.0-paper-replay` | **Date**: 2026-10-04 | **Status**: IMPLEMENTED → CERTIFIED (PAPER ONLY)

## 0. PAPER ONLY — NO REAL EXECUTION

```text
PAPER ONLY
NO REAL ORDERS
NO REAL EXCHANGE
NO REAL BROKER
NO REAL MONEY
NO AUTO-EXECUTION
```

The only execution port is a simulation adapter asserted
`isSimulation === true`; a non-simulation port yields `EXECUTION_BLOCKED`
before any order is created (tested with a port whose `submit` throws).

## 1. Flow

```text
CERTIFIED RESEARCH → STRATEGY VERSION → REPLAY DATASET → DECISION OS
   → RISK (port) → POSITION SIZING (port) → PAPER ORDER → PAPER FILL (port)
   → LEDGER → PORTFOLIO/NAV → MONITORING (port) → DECISION REVIEW
```

Every port is injected; the lane imports **nothing** from `trading/`.

## 2. Modules

| File | Responsibility |
|---|---|
| `src/lib/replay/types.ts` | manifest/events/orders/fills/portfolio/checkpoints/divergence/result contracts; `REPLAY_VERSION` |
| `src/lib/replay/ReplayManifest.ts` | immutable manifest creation + FNV-1a `MF_…` fingerprint + reproducibility check |
| `src/lib/replay/ReplayStateMachine.ts` | run lifecycle + terminal failure states; `ReplayEventLog` (append-only, ordered, idempotent) |
| `src/lib/replay/ReplayAccounting.ts` | NAV invariant (`nav = cash + positions + other`), checkpoints, reconciliation (orphan orders/fills/ledger, unexplained cash/position deltas) |
| `src/lib/replay/ReplayComparison.ts` | backtest vs replay metrics + 12 divergence kinds with explanations |
| `src/lib/replay/PaperReplayEngine.ts` | pure orchestrator over injected ports |
| `src/services/replay/PaperReplayService.ts` | orchestration + `assertPaperOnly` |
| `src/lib/db/replay/ReplayRepository.ts` | append-only `replay_runs` journal |
| `src/db/schema.ts` §35 + `drizzle/0006_paper_replay.sql` | additive, idempotent migration |

## 3. Manifest (20 fields + provenance)

`replayId/createdAt/datasetId/datasetVersion/strategyId/strategyVersion/
decisionVersion/riskModelVersion/positionSizingVersion/executionModelVersion/
costModelVersion/universe/startDate/endDate/initialCapital/currency/seed/mode/
configuration` + `codeVersion/schemaVersion/provider/dataQuality/
corporateActionPolicy/pointInTimePolicy`. Fingerprint `MF_<fnv1a>` — same input
⇒ same fingerprint (tested); any version change ⇒ different fingerprint.

## 4. State machine

`CREATED→VALIDATING→READY→RUNNING⇄PAUSED→COMPLETED`; failures
`INVALID/DATA_UNAVAILABLE/DATA_INVALID/RISK_BLOCKED/EXECUTION_BLOCKED/FAILED/
CANCELLED` are terminal — an incomplete replay is never reported completed
(tested).

## 5. Event model

17 event types (`SESSION_START … REPLAY_COMPLETE`), each with
`eventId/replayId/sequence/effectiveDate/eventType/payload/provenance`;
sequence strictly increasing; duplicate `eventId` rejected ⇒ **one financial
effect** (tested).

## 6. Point-in-time & survivorship

Replay consumes only bars whose `publicationDate <= bar.date` and
`dataQuality === 'VALID'`; otherwise `NO_ACTION_DATA_UNAVAILABLE` /
`FUTURE_PUBLICATION` warnings and **no trade**. The manifest carries
`pointInTimePolicy`; universe vintage must be supplied by the caller from
DATA-04 `getUniverseAsOf(includeDelisted)`. Survivorship limitation is always
listed in `limitations`.

## 7. Order lifecycle & fill model

`SIGNAL→DECISION→RISK_CHECK→ORDER_CREATED→ORDER_ACCEPTED|ORDER_REJECTED→
FILL/FEE/SLIPPAGE→POSITION_UPDATE`. Distinct outcomes:
`FILLED / PARTIALLY_FILLED / RISK_REJECTED / EXECUTION_REJECTED / ZERO_FILL`
with causes `ZERO_BY_STRATEGY|ZERO_BY_RISK|ZERO_BY_SIZING|ZERO_BY_LIQUIDITY|
ZERO_BY_DATA`. Lot-100 enforced before order creation (cash-affordability clamp
in lot steps), ticks/multiplier remain in the Phase 29 engines.

## 8. Accounting, reconciliation, checkpoints

NAV invariant verified after every fill via `ReplayAccounting.verify` +
authoritative conservation port → violation ⇒ `FAILED`. Reconciliation compares
account-derived deltas against an independent ledger recomputation
(`ReplayReconciliation`) plus the authoritative reconciliation port; any
finding ⇒ `MISMATCH` (certification blocker). Checkpoints record
sequence/timestamp/cash/positions/NAV/riskState/openOrders/manifestFingerprint.

## 9. Comparison & divergence

`ReplayComparison.compare` emits paired metrics (return/maxDD/turnover/fees/
tax/slippage/tradeCount/exposure) and classified divergences — RISK, EXECUTION,
SLIPPAGE, FEES, TAX, LIQUIDITY, POSITION SIZING, CORPORATE ACTION, TIMING,
STRATEGY, ACCOUNTING — each with a WHY explanation. Backtest ≠ replay is stated
explicitly; replay results are never presented as backtest performance.

## 10. Safety, AI, performance

- No real-execution path; AI has no role in replay (may only explain results).
- Per-bar pure computation, O(bars) memory, checkpoints bound state; no duplicate
  fills/ledger writes by construction (idempotent log + reconciliation).
- No new packages; no routes added (transport deferred, `/replay/*` namespace
  reserved and documented).

## 11. Acceptance

1. Paper-only enforced (non-simulation ⇒ `EXECUTION_BLOCKED`). ✔
2. Manifest immutable + reproducible fingerprint. ✔
3. Lifecycle forbids skipping; failures terminal. ✔
4. Events ordered + idempotent (one financial effect). ✔
5. PIT enforced (future publication rejected); stale/invalid ⇒ no trade. ✔
6. Risk/execution rejection distinguished, strategy result unmutated. ✔
7. Zero-fill causes explicit (5 kinds). ✔
8. Accounting invariant enforced ⇒ failure fails the replay. ✔
9. Reconciliation detects orphans/deltas. ✔
10. Divergence classified with explanations. ✔
11. E2E chain + monitoring + decision review. ✔
12. Zero protected-file modifications. ✔