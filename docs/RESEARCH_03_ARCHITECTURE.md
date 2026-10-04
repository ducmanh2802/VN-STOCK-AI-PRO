# RESEARCH-03 — REALISTIC EXECUTION / COST MODEL: ARCHITECTURE

**Version**: `v1.0.0-research03` | **Date**: 2026-10-04 | **Status**: IMPLEMENTED — 5/5 tests

## Cost components (only those with valid domain assumptions)

Brokerage fee + tax + slippage implemented; spread implemented (`SPREAD`
slippage halves); market impact / financing / margin cost are **not** modelled
(no valid data) — explicit `impactModel:null/spreadModel:null` rather than
invented curves. Every model carries `costModelVersion` + fee schedule +
slippage/spread/impact model names.

## Configuration

`DEFAULT_RESEARCH_COST` reuses the canonical VN assumptions
(`buy 0.15% / sell 0.15% / sell tax 0.10% / slippage 0.10%`) via a versioned
record — same numbers the trading/paper stack uses, never forked.

## Slippage models

`FIXED` (multiplicative on price), `BPS` (default, multiplicative), `SPREAD`
(half-spread each side). `VOLUME_BASED` not implemented (no impact data).
Symmetric BUY up / SELL down.

## Liquidity constraints

`maxParticipationRate` caps order size at `barVolume × 10%` (default);
`roundLot` enforces lot 100 (0 quantity → no order). No infinite liquidity.

## Futures / ETF preserved

`FUTURES_MULTIPLIER_VND=100_000`, `FUTURES_TICK_POINTS=0.1`,
`EQUITY_BOARD_LOT=100` — explicit constants + `futuresNotional`/
`roundTick` helpers; Phase 29 semantics untouched.

## Tests

Fees+tax placement (buy vs sell), BPS/SPREAD symmetry, lot rounding, liquidity
cap, futures multiplier/tick, versioning invariants.

## Files

```text
src/lib/research/CostEngine.ts (+ __tests__/Research03.test.ts)
```
