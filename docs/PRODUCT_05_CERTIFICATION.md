# PRODUCT-05 — ALERTS & MONITORING: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Files
- `src/lib/product/alerts/AlertEngine.ts`
- `src/lib/product/alerts/__tests__/alertEngine.test.ts` (10 tests)

## Test evidence (44 product tests at this phase + 1 E2E, all pass)
| Requirement | Test |
| --- | --- |
| Rule hygiene | id/instrument normalization; disabled rules never fire; foreign instruments ignored |
| Fail-closed creation | missing id/instrument, null threshold, negative price threshold, zero pct threshold ⇒ `ALERT_*` |
| Boundary semantics | `PRICE_ABOVE` at exactly the threshold does **not** fire |
| Percentage moves | +5.42% fires, +4.58% does not, −5.42% fires; missing previous price ⇒ `not evaluated` |
| Unavailable price | `INFO`, message `not evaluated`, no fabricated breach |
| False-trigger guard | invalid data suppresses breach; `dataIndependent` rule still fires; suppressed alerts are not counted critical |
| Certified trigger reuse | thesis invalidated ⇒ `CRITICAL`, valuation changed ⇒ `WARNING` |
| Guard reuse under `DATA_INVALID` | thesis + valuation triggers suppressed; `criticalCount === 0` |
| Determinism | identical input ⇒ identical alerts |

## Bugs found by these tests and fixed
- `MonitorTrigger` was imported as a type from `MonitoringEngine` but not exported there → derived
  via `ReturnType<typeof MonitoringEngine.detect>[number]`, keeping the protected lane untouched.
- Two test-authoring errors corrected against real semantics: `PRICE_BELOW` threshold direction, and
  a float-boundary expectation (`+5.00%` fires by design, so the negative case moved to +4.58%).

## Gate (§43)
`npx vitest run src/lib/product` → 5 files / 44 tests pass. `tsc --noEmit` clean. Build success.
No scheduler, network, or provider dependency introduced.