# DATA-02 — CORPORATE ACTIONS & HISTORICAL ADJUSTMENT: ARCHITECTURE

**Version**: `v1.0.0-data02` | **Date**: 2026-10-04 | **Lane**: Data Foundation
**Status**: IMPLEMENTED — tests 7/7 in `Data02.test.ts` (part of 31/31 data suite)

## Objective

Historical prices + corporate events mathematically and temporally coherent.
Only actions supported by actual data are implemented; unsupported semantics
(TOTAL_RETURN/PRICE_RETURN as distinct modes) are reserved, NOT invented.

## Model

- `CorporateActionRecord` (`types.ts`): kind (`DIVIDEND/CASH_DIVIDEND/STOCK_DIVIDEND/STOCK_SPLIT/REVERSE_SPLIT/RIGHTS_ISSUE/BONUS/MERGER/DEMERGER/SYMBOL_CHANGE`), status (ANNOUNCED/CONFIRMED/EX_DATE_PASSED/COMPLETED/CANCELLED/AMENDED), dates (announcement/record/ex/payment/effective — never interchangeable), ratios, cash/issue prices, symbol-change from/to, source (`VSDC/HOSE/HNX/ISSUER`) + tier (TIER_4 excluded), `dataVersion`.
- `CorporateActionValidator`: duplicate events, impossible dates (announcement>ex, ex≥record), missing required dates/values, invalid split ratios (≤0), negative dividends, overlapping same-kind same-exDate, conflicting symbol-change chains, TIER_4 exclusion. Fail-closed: `valid[] + issues[]` (codes, never silent drop).
- `AdjustmentEngine`: pure, deterministic, date-aware (`exDate`), version-aware (`dataVersion` carried on records), testable. Formula = Phase 23 canonical (reused, never rewritten): `P_ex=(P_prev-C+I·P_issue)/(1+S+B+I)`; split `P_prev·old/new`; OTM rights (`P_issue≥P_prev` → I=0); `k=P_ex/P_prev`; `K_tau=Π_{t>tau}k`; `P_adj=P_raw·K`; `V_adj=round(V_raw/K)`. Cancelled → null (no factor). Missing `prevClose` → event skipped (never guessed). Modes: `RAW` (immutable return) | `ADJUSTED` (new objects; raw never mutated; distinguishable).
- Persistence: `corporate_action_events` (`0003` + `schema.ts` §30, unique `event_id`, indexes instrument/exDate/kind). Repo: `CorporateActionEventRepository.append` (conflict-do-nothing, never overwrite). Raw bars in `stock_daily` never updated by adjustment.
- Service: `getAdjustedBars({mode})` + `getCorporateActionsAsOf` (PIT-filtered: `announcementDate ?? exDate ?? effectiveDate <= asOf`).

## Acceptance

- [x] raw data immutable (RAW returns copy; ADJUSTED returns new objects; test asserts source unchanged)
- [x] corporate actions independently represented (record type + table + registry reuse)
- [x] adjustment mode explicit (RAW|ADJUSTED param; reserved modes documented as not-implemented)
- [x] adjustment calculations deterministic (sorted factors, pure math, byte-identical re-run)
- [x] ex-date/effective-date semantics correct (T+2 validation, ex>bar comparison, OTM suppression)
- [x] historical queries can request raw or adjusted (`getAdjustedBars` + test)
- [x] tests cover splits/dividends/symbol changes (7 tests)
- [x] invalid events fail closed (validator issues + null factors + skipped events)

## Files

```text
src/lib/data/CorporateActionsEngine.ts
src/lib/db/data/DataFoundationRepository.ts (CorporateActionEventRepository)
src/services/data/DataFoundationService.ts (getAdjustedBars/getCorporateActionsAsOf)
src/db/schema.ts (§30 corporate_action_events)
drizzle/0003_data_foundation.sql (corporate_action_events)
src/lib/data/__tests__/Data02.test.ts
docs/DATA_02_ARCHITECTURE.md (this file)
docs/DATA_02_CERTIFICATION.md
```
