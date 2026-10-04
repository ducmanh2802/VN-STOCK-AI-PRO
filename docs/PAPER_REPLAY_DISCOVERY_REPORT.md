# PAPER REPLAY — DISCOVERY REPORT

**Date**: 2026-10-04 | **Lane**: Paper Replay / Live-Simulation Validation
**Scope**: read-only audit of the existing execution architecture + integration plan

## 1. Repository baseline

- Branch `main`, HEAD `c00dced`, worktree dirty with 5 parallel lanes (223 entries).
- This lane owns `src/lib/replay/**`, `src/services/replay/**`, `src/lib/db/replay/**`,
  `docs/PAPER_REPLAY_*.md`, `docs/LIVE_SIMULATION_ARCHITECTURE.md`,
  `src/db/schema.ts` §35 (additive), `drizzle/0006_paper_replay.sql`.

## 2. Existing PaperBroker audit (actual implementation, not assumed)

| Component | Verdict | Evidence |
|---|---|---|
| `PaperBroker` | IMPLEMENTED (strong) | `implements BrokerAdapter`, `name='PaperBroker'`, `isSimulation=true` (literal). `submitOrderSync` full lifecycle with immediate fill; cash/position reservation (anti-double-spend); VWAP average cost; `fee=gross·rate`, `tax=gross·taxRate` (SELL), slippage; `seedCash/seedPosition/reset`; `setEmergencyStop` cancels SUBMITTED orders; 15 rejection codes (`INSUFFICIENT_CASH`, `INSUFFICIENT_POSITION`, `INVALID_LOT_SIZE`, `PRICE_LIMIT_VIOLATION`, `MARKET_CLOSED`, `DUPLICATE_ORDER`, …) |
| `PaperExecutionEngine` | IMPLEMENTED | pipeline Integrity→Validator→RiskGuard(`AUTHORIZED_FOR_PAPER_TRADING` required)→Lot→cash/position→broker→ledger; `PaperExecutionResult` with `success/orderId/status/code/executedPrice/executedQuantity/fee/tax/slippage/auditEntry/accountBefore/accountAfter` |
| `PaperTradeLedger` | IMPLEMENTED | `PaperAuditEntry` 24 fields incl. cashBefore/After, positionBefore/After, validatorStatus, riskGuardStatus, riskGuardAuthorization, integrityValid, fees/tax/slippage, `marketDataSnapshotId/recommendationId/strategyVersion/riskPolicyVersion` (this is the provenance backbone) |
| `PaperReconciliationEngine` | IMPLEMENTED | `RECONCILED/MISMATCH/INVALID_INPUT`; cash/position/order/PnL/cost comparisons; mismatch categories CASH/POSITION/ORDER/PNL/COST/INTEGRITY; money tolerance 1.0 VND |
| `ReplayEngine`/`ReplayValidator`/`OrderStateMachine` | IMPLEMENTED | single-order deterministic replay, 12-state machine with terminal immutability, 27 mismatch codes, canonical event sequence `NEW→VALIDATED→AUTHORIZED→SUBMITTED→FILLED→SETTLED`, dual-run determinism check |
| `FinancialConservationValidator` | IMPLEMENTED | 11 conservation laws, `VIETNAM_BOARD_LOT=100`, fee 0.0015/tax 0.001 defaults, `DOUBLE_COUNT_DETECTED`, event-sequence validation |
| `PaperPnL` | IMPLEMENTED | position/portfolio/realized PnL; `equity = cash + reservedCash + totalMarketValue`; exposure rate |
| `PositionSizer` / `RiskGuard` / `RiskManager` | IMPLEMENTED | authoritative risk + sizing (20% position / 80% exposure / 1% risk / 3% daily loss / lot 100 / RR≥2) |
| Multi-asset futures | IMPLEMENTED | multiplier 100,000; tick 0.1; expiry required; margin required (Phase 29) |
| DATA-01→05 / DECISION-01→05 / RESEARCH-01→05 | IMPLEMENTED | 31 + 25 + 27 lane tests green |
| **Whole-period multi-session replay** | **MISSING** | `ReplayEngine` replays a *single order* against a snapshot. No dataset-driven, multi-day, multi-order replay with decision→risk→size→fill→ledger→portfolio→monitor→review |
| **Replay manifest + fingerprint** | **MISSING** | no replay-level manifest, no dataset/strategy/decision/risk/sizing/execution/cost versions in one immutable record |
| **Replay state machine (lifecycle)** | **MISSING** | order-level state machine exists; replay-run lifecycle (CREATED…COMPLETED + failure states) does not |
| **Backtest vs replay comparison + divergence** | **MISSING** | research metrics and paper results are never compared |
| **Replay API (`/replay/*`)** | **MISSING** | only `/api/trading/*` and `/api/macro/*` routers exist |

## 3. Critical safety finding

`PaperBroker.isSimulation === true` is a **literal type**, and the only adapter
registered in the repo is the paper broker. There is no production broker
adapter in `src/lib/trading/execution/`. Therefore a paper-only boundary is
architecturally enforceable: the replay layer must assert
`executionPort.isSimulation === true` before creating any order (implemented,
tested).

## 4. What this lane builds (only the gaps)

1. `ReplayManifest` (immutable, 20 fields + fingerprint) — reproducibility.
2. `ReplayStateMachine` (lifecycle + failure states; incomplete ≠ success).
3. `ReplayEventLog` (17 event types, deterministic ordering, idempotent).
4. `PaperReplayEngine` — decision → risk → sizing → paper order → fill → ledger →
   portfolio → monitoring, with **injected ports only** (no protected imports).
5. Accounting invariant + checkpoints + reconciliation + result fingerprint.
6. Backtest-vs-replay comparison with 12 divergence kinds + explanations.

Nothing existing is duplicated: risk, sizing, execution, ledger,
conservation and reconciliation remain authoritative and are consumed via
ports.