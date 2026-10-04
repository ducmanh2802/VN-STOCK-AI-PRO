# DATA-01 — HISTORICAL DATA FOUNDATION: ARCHITECTURE

**Version**: `v1.0.0-data01` | **Date**: 2026-10-04 | **Lane**: Data Foundation (OpenCode)
**Status**: IMPLEMENTED — tests 8/8 in `Data01.test.ts` (part of 31/31 data suite)

## Objective

Coherent historical data foundation for downstream analytics: canonical
instrument identity + canonical DAILY bars (extensible) + coverage diagnostics
+ deterministic historical queries. No fabricated coverage.

## Inventory (verified, not assumed)

| Dataset | Source | Granularity / coverage | Identity / timestamps | Adjustment | Quality |
|---|---|---|---|---|---|
| Equities OHLCV | KBS `KbsHistoricalProvider` (`data_day`, `sdate/edate DD-MM-YYYY`) | DAILY; effective ≤355d (`KBS_MAX_LOOKBACK_DAYS`, vendor `4000014` beyond); `HISTORY_TTL 60s` | symbol key; `t:"2026-08-28 07:00"→date`; raw preserved | none on vendor | `validateRawBar` skips bad rows; empty = `DATA_UNAVAILABLE` |
| Quote + fundamentals | VPS `VpsProvider` (`getliststockdata/baseinfo`) | quote 15s, fundamentals 5min | kVND×1000→VND (except `closePrice` = ref), lots×10→shares; `fetchedAt` vs `sourceTimestamp` distinct | none | `VpsApiError`; new provider `null`-fills |
| Indices/benchmark | KBS + `realMarketDataService` cross-check | 45d window | explicit series input | never synthesized | ±10% cross-check advisory only |
| Futures | VPS derivatives (`VPS_DERIVATIVES`, points NOT ×1000) | 15s cache if CURRENT; **no historical futures-bars provider** | contracts, lots=contracts | continuous-futures needs caller `contractBars` | OI often null |
| Macro | `macro_observations` persisted only | vintage triple-date | `publicationDate<=asOfDate` enforced (SQL + in-memory) | n/a | TIER_4 excluded |
| Fundamentals/earnings | VPS slots + `financial_facts_v2` / `AuthoritativeDocumentPipeline` | 4 periods / filing vintages | `publicationDate<=asOfDate`; TTM direct-or-4Q | EPS via CA bridge | unparseable skipped |
| Industry | `policy_events/strategic_projects/...` + `financial_facts_v2` bridge | event-driven | `lte(publicationDate,asOfDate)` | n/a | read-only repo |
| Corporate actions | in-memory registry + `CorporateAction*Engine` | event list, no table before DATA-02 | ex/record/payment/effective distinguished | exact `P_ex` formula | needs caller actions |

## Design

- `src/lib/data/types.ts` — canonical `InstrumentIdentity` (`instrumentId/symbol/exchange/assetClass/currency/country/sector/industry/status/validFrom/validTo`), `CanonicalBar` (DAILY + extensible), `CoverageReport`, time model (observation/publication/effective/ingestion never collapsed), `DataKind` (RAW/DERIVED/ADJUSTED/AGGREGATED/NORMALIZED/SIMULATED).
- `InstrumentIdentityEngine.ts` — `register` (validates symbol `^[A-Z0-9_.]{1,20}$`, validity range), `applySymbolChange` (new version `validFrom=effectiveDate`, previous-symbols chain), `isActiveAt`/`isQueryableAt`, `getInstrumentAsOf`, `getUniverseAsOf` (active-only default; `includeDelisted` for unbiased research). Ticker never the permanent id.
- `HistoricalBarsEngine.ts` — `validateBar` (OHLC>0, high/low body containment, volume/value≥0), `normalize` (sort, dedupe `instrumentId|date`, split clean/duplicates/invalid), `query` (deterministic instrument+range slice). Mirrors `MarketDataIntegrityGuard`/`BacktestDataAdapter` semantics.
- `CoverageEngine.ts` — first/last/barCount/missing (weekday-walk)/duplicates/gaps/invalid-OHLC/zero-negative/volume anomalies (mean×multiple, default 10×).
- Persistence: `instruments` table (`drizzle/0003_data_foundation.sql` + `src/db/schema.ts` §29, unique `instrument_id`, indexes symbol/status/validFrom). Historical bars reuse `stock_daily`/`stock_intraday` (documented; no duplicate time-series table). Repos: `InstrumentRepository.upsert` (conflict-do-nothing) + `getAsOf`.
- Service: `DataFoundationService.getBars` (deterministic query over injected loader).

## Acceptance

- [x] canonical instrument identity exists (with symbol-change/delist/listing/merger/rename/migration handling)
- [x] historical data model coherent (DAILY canonical, extensible enum)
- [x] date/timestamp semantics explicit (4-time model in types)
- [x] duplicate detection exists (`normalize` + test)
- [x] gap detection exists (`CoverageEngine` + test)
- [x] invalid OHLC detection exists (`validateBar` + test)
- [x] source preserved (`source: KBS|VPS|DB` on every bar)
- [x] historical queries deterministic (sorted slice + determinism test)
- [x] existing provider semantics intact (no provider modified; additive only)
- [x] tests pass (8/8 DATA-01; 31/31 data suite; `tsc` clean)

## Files

```text
src/lib/data/types.ts
src/lib/data/InstrumentIdentityEngine.ts
src/lib/data/HistoricalBarsEngine.ts
src/lib/data/index.ts
src/lib/db/data/DataFoundationRepository.ts (InstrumentRepository)
src/services/data/DataFoundationService.ts (getBars)
src/db/schema.ts (§29 instruments)
drizzle/0003_data_foundation.sql (instruments)
src/lib/data/__tests__/Data01.test.ts
docs/DATA_01_ARCHITECTURE.md (this file)
docs/DATA_01_CERTIFICATION.md
```
