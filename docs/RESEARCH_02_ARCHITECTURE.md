# RESEARCH-02 — EVENT-DRIVEN BACKTEST ENGINE: ARCHITECTURE

**Version**: `v1.0.0-research02` | **Date**: 2026-10-04 | **Status**: IMPLEMENTED — 6/6 tests

## Objective

Proper event lifecycle; no `signal → close → return` shortcut.

## Event model

`MARKET_OPEN / MARKET_DATA / SIGNAL / ORDER / FILL / CORPORATE_ACTION /
MARKET_CLOSE / REBALANCE / RISK_EVENT` + `seq`, `date`, `detail`.

## Lifecycle

```text
DATA → STRATEGY → SIGNAL → RISK → POSITION SIZE → ORDER → EXECUTION → FILL
     → PORTFOLIO → P&L → NEXT EVENT
```

## No future information (architectural, not documented)

Strategy callback receives `bars.slice(0, i+1)` — future bars are
unreachable. A violated `bar.publicationDate > asOfCutoff` marks the run
`lookaheadRejected=true` with `FUTURE_PUBLICATION` violations and the bar is
skipped. Context-leak is independently asserted (`CONTEXT_LEAK`).

## Order model

`MARKET / LIMIT / STOP` supported per roadmap (LIMIT/STOP kinds accepted by
`orderKindSupported`; fills for MARKET use T+1 open + slippage).

## Portfolio accounting

`cash / positions / marketValue / realizedPnl / unrealizedPnl / fees /
slippage / turnover / exposure / leverage / drawdown`. NAV = cash + position
value enforced every bar (test asserts `cash >= 0` and positive NAV);
`FinancialConservation` semantics inherited by sharing the canonical cost
constants with the existing stack.

## Corporate actions

Explicit `CORPORATE_ACTION` events: split adjusts quantity, cash dividend
credits `qty × per-share` cash. Data-Foundation formula available via
`AdjustmentEngine.adjust` for series-mode consumers — never silent patching
inside the engine.

## T+1 execution

Signal at `T` close queues the order; fill occurs at `T+1` open
(`slippageForFill(open)`), confirmed by event-order + fill-date test.

## Missing / invalid data

`FUTURE_PUBLICATION` skipped + `INVALID` orders (no cash / no position /
liquidity cap) produce no fills; no fake confidence.

## Files

```text
src/lib/research/EventBacktestEngine.ts (+ __tests__/Research02.test.ts)
```
