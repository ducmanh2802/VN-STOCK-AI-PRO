# PRODUCT-02 — SCENARIO / WHAT-IF: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Files
- `src/lib/product/scenario/ScenarioEngine.ts` (pure engine, versioned, provenance-tagged)
- `src/lib/product/scenario/__tests__/scenarioEngine.test.ts` (8 tests)

## Test evidence (16 product tests total, all pass)
| Requirement | Test |
| --- | --- |
| Deterministic | same input → `toEqual` identical result |
| Baseline immutability | real portfolio JSON identical after run |
| Correct math | 75.0M baseline → 70.0M shocked, impact −5.0M / −6.667%, worst shock −15.0M |
| Honest unavailability | missing mark price → `NOT_AVAILABLE`, null impact, no imputation |
| Fail-closed | fractional qty, negative qty → `SCENARIO_*` throws |
| Lot size | 1050 shares → warning, value preserved unchanged |
| No invented causality | macro note → warning, totals untouched |
| Silent-drop prevention | unknown symbol → explicit warning |

## Gate (§43)
`npx vitest run src/lib/product` → 2 files / 16 tests pass. `npx tsc --noEmit` → clean for product scope.
`npm run build` → success. No protected-system modification (portfolio engines imported read-only).