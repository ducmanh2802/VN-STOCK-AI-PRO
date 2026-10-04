# DECISION-04 — POSITION SIZING & DECISION INTEGRATION: ARCHITECTURE

**Version**: `v1.0.0-decision04` | **Date**: 2026-10-04 | **Lane**: Decision OS
**Status**: IMPLEMENTED — 4/4 tests in `Decision04.test.ts`

## Objective

Connect decision quality to position sizing with no bypass path for UI/AI:
the only sizing route is the injected `PositionSizer`-compatible callable.
This engine is never a second implementation of sizing math.

## Design

- `PositionIntegrationEngine.integrate(input, sizer)` — inputs: NAV/current
  position/entry/stop/risk-budget/volatility/correlation/exposure/liquidity/
  asset-class/lot/multiplier (the `SizerInput` mirrors `PositionSizingInput`
  1:1 so the real `PositionSizer.calculate` plugs in directly).
- Order of checks (hierarchy): HOLD/FLAT → `ZERO_BY_NO_SIGNAL` (sizer never
  called — HOLD/FLAT preservation); data-unavailable → BLOCKED/
  `ZERO_BY_DATA_UNAVAILABLE`; risk-blocked → BLOCKED/`ZERO_BY_RISK`;
  portfolio-limit → ZERO/`ZERO_BY_PORTFOLIO_LIMIT`; else delegate to sizer and
  map its `code` to the zero taxonomy (`INSUFFICIENT_CASH/EXCESSIVE_EXPOSURE→
  PORTFOLIO_LIMIT`, `INVALID_*→CONSTRAINT/DATA`, `EXCESSIVE_RISK→RISK`).
  Zero is never generic: all five `ZeroReason`s distinct.
- States `FULL/REDUCED/MINIMUM/ZERO/BLOCKED` (current slice emits FULL vs
  ZERO/BLOCKED; REDUCED/MINIMUM reserved for risk-scaled sizing follow-up).
- Lot/multiplier: lot-rounded flag verified (`quantity % lotSize === 0`);
  futures 100_000/tick 0.1 and lot 100 preserved inside the injected sizer —
  asserted by contract, not re-derived here.

## Tests

Full sizing, HOLD/FLAT no-call preservation, code→reason taxonomy (3 codes),
risk/data/limit branches.

## Files

```text
src/lib/decision/PositionIntegrationEngine.ts
src/lib/decision/__tests__/Decision04.test.ts
docs/DECISION_04_ARCHITECTURE.md + docs/DECISION_04_CERTIFICATION.md
```
