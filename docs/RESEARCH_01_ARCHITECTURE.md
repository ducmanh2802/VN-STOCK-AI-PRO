# RESEARCH-01 — DATASET & EXPERIMENT FOUNDATION: ARCHITECTURE

**Version**: `v1.0.0-research01` | **Date**: 2026-10-04 | **Lane**: Research & Validation
**Status**: IMPLEMENTED — 4/4 tests in `Research01.test.ts`

## Objective

Reproducible research experiments where dataset/strategy/params/execution/
risk/seed are explicit, hidden current-state universes are rejected, and
identical inputs yield identical fingerprints.

## Experiment fields (all required)

`experimentId/name/description/strategy/strategyVersion/universe/startDate/
endDate/asOfSemantics/dataVersion/strategyVersion/executionModelVersion/
riskModelVersion/parameters/createdAt/status` + `dataset` + `seed`.

## Dataset fields

`instruments/date range/dataSources/pointInTimeRules/corporateActionMode/
adjustmentMode/universeDefinition/universeAsOf`. No hidden current-state
universe: `universeAsOf===null` → `UNIVERSE_VINTAGE_MISSING` hard error.

## Parameters

Explicit record (lookback/rebalance/entry/exit/risk-budget/position-limit/
stop/costs/slippage) — no material-research default. `status` flows
DRAFT→RUNNING→COMPLETED/FAILED→CERTIFIED/NON_CERTIFIED.

## Reproducibility

`experimentFingerprint` = stable-stringified core (dataset+strategy+versions+
params+execution+risk+seed) → FNV-1a id `EXP_…`. Identical inputs → identical
fingerprint + identical downstream result (pure engine, seeded random where
used, zero wall-clock/Math.random in core paths).

## Validation rules

`EMPTY_UNIVERSE / INVALID_RANGE / INVERTED_RANGE / NO_SOURCES / NO_PIT_RULES /
UNIVERSE_UNDEFINED / UNIVERSE_VINTAGE_MISSING` all throw `INVALID_DATASET`.

## Tests

Creation with version capture, dataset validation ×6, deterministic
fingerprint (byte-equal), missing PIT vintage rejection.

## Files

```text
src/lib/research/types.ts, ExperimentEngine.ts, index.ts
src/lib/research/__tests__/Research01.test.ts
src/lib/db/research/ResearchRepository.ts (append-only experiments)
src/db/schema.ts (§33) + drizzle/0005_research.sql
docs/RESEARCH_01_ARCHITECTURE.md + RESEARCH_01_CERTIFICATION.md
```
