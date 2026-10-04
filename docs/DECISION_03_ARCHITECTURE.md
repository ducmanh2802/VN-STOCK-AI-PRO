# DECISION-03 — RISK DECISION ENGINE: ARCHITECTURE

**Version**: `v1.0.0-decision03` | **Date**: 2026-10-04 | **Lane**: Decision OS
**Status**: IMPLEMENTED — 6/6 tests in `Decision03.test.ts`

## Objective

Answer "is this acceptable given the risk?" — not "is it attractive?".
Wraps existing RiskGuard/Portfolio/Multi-Asset outputs; duplicates none of
their logic. Hard constraints authoritative; hierarchy
SAFETY > SIZE > DECISION > SCORE; AI can never override RiskGuard.

## Design

- `RiskDecisionEngine.evaluate` consumes: RiskGuard `status/authorization`
  (literal `VALID/BLOCKED/INVALID`, `AUTHORIZED_FOR_PAPER_TRADING`),
  hard breaches, soft warnings, policy version, portfolio flags
  (concentration/sector/leverage/margin/drawdown → derived hard breaches).
- States: `ACCEPTABLE` (clean + authorized), `CAUTION` (soft warnings only),
  `HIGH_RISK` (valid but unauthorized), `BLOCKED` (guard blocked / any hard
  breach), `UNKNOWN` (invalid/missing risk — fail-closed, never assumed safe).
- Risk dimensions covered via inputs: market/vol/drawdown/concentration/sector/
  correlation/beta/liquidity/valuation/fundamental/macro/industry/strategy/
  portfolio-interaction flow in as breach/warning strings from authoritative
  producers; this engine orders and states them, it does not recompute them.
- Uses existing configured policies (versions threaded, never hard-coded rules).

## Tests

Pass, soft-warn, guard-blocked, hard-breach, derived-flag breaches,
missing/invalid → UNKNOWN, valid-but-unauthorized → HIGH_RISK, fail-closed.

## Files

```text
src/lib/decision/RiskDecisionEngine.ts
src/lib/decision/__tests__/Decision03.test.ts
docs/DECISION_03_ARCHITECTURE.md + docs/DECISION_03_CERTIFICATION.md
```
