# LIVE SIMULATION — ARCHITECTURE

> # PAPER ONLY
> # NO REAL EXECUTION
> # NO REAL BROKER / EXCHANGE / MONEY

**Version**: `v1.0.0-paper-replay` | **Date**: 2026-10-04

## Scope

Forward paper simulation (`ReplayMode.FORWARD_PAPER_SIMULATION`) is the same
engine and the same ports as historical replay: current/near-current market
data flows through the identical decision → risk → sizing → paper order → fill →
ledger → portfolio path. The only difference is the bar source and the
`dataQuality` gate, which is **stricter** for live-simulation safety.

## Live-simulation safety rules (enforced in code)

| Rule | Behaviour |
|---|---|
| Stale / unavailable / invalid market data | `NO_ACTION_DATA_UNAVAILABLE` — **no decision, no order, no fill** (tested) |
| Freshness | caller supplies `dataQuality` per bar from DATA-03 freshness mapping (`CURRENT→VALID`, `STALE`, `UNAVAILABLE`, `INVALID`) |
| Session/calendar | caller supplies calendar-filtered bars (DATA-05 `MarketCalendar`); sessions are never invented |
| Execution target | `PaperBroker` (`isSimulation = true` literal). Non-simulation port ⇒ `EXECUTION_BLOCKED` |
| Risk | unchanged authoritative path (RiskGuard/RiskManager via port) |
| Position sizing | unchanged authoritative `PositionSizer` via port |
| Accounting | NAV invariant + reconciliation after every fill; violation ⇒ `FAILED` |
| Cadence | never hard-coded; driven by caller freshness (no universal timer) |
| Automation | none. No scheduler, no cron, no broker credentials, no exchange adapter |
| AI | none in the execution path (explanation only, outside this subsystem) |

## Modes

- `HISTORICAL_REPLAY` — point-in-time dataset replay.
- `FORWARD_PAPER_SIMULATION` — near-current data, same pipeline, paper-only.
- `DETERMINISTIC_REPLAY` — mandatory for certification: same manifest ⇒ same
  fingerprint.

## Prohibited (architecturally absent)

```text
real broker adapter      (none exists in repo; none created)
real exchange endpoint   (none)
broker credentials       (none)
scheduled/auto execution (none)
paper→real order convert (none)
```

## UI wording contract

If a console is added, controls must read `SIMULATE / PAPER ORDER / REPLAY /
PAPER FILL` and display `PAPER ONLY — NO REAL ORDERS — SIMULATION`. Words such
as `BUY NOW`, `EXECUTE`, `SEND ORDER` are prohibited for replay controls.
No UI was created in this lane (backend contracts only).

## API boundary

Reserved namespace `/replay/*` (and `/paper/*`); never to be mounted into real
execution routers. Ownership must be enforced on every read/write when
transport is added; dependency documented here, no auth bypass introduced.