# DATA-03 — DATA QUALITY, PROVENANCE & LINEAGE: ARCHITECTURE

**Version**: `v1.0.0-data03` | **Date**: 2026-10-04 | **Lane**: Data Foundation
**Status**: IMPLEMENTED — tests 5/5 in `Data03.test.ts` (part of 31/31)

## Objective

Every important dataset auditable: explicit quality, full provenance, answerable lineage, detectable cross-source disagreement.

## Design

- Quality states: `VALID|WARNING|STALE|INVALID|UNAVAILABLE`. Integration mapping (not duplication): `CURRENT→VALID, STALE→STALE, UNAVAILABLE→UNAVAILABLE, INVALID→INVALID` (`freshnessToQuality`). Existing `DataFreshnessStatus`/`MacroDataStatus`/`MarketDataStatus` vocabularies preserved.
- `QualityEngine.assessBars`: completeness (non-empty), correctness (OHLC body containment), uniqueness (no dup keys), range validity (volume/value≥0), consistency (chronological). Result: `UNAVAILABLE` (empty) / `INVALID` (correctness/range fail) / `WARNING` (dup/chrono fail) / `VALID`. Plus `qualityReport` (coverage/missingness/staleness/invalidShare + aggregate state) for coverage/missingness/staleness/disagreement/invalid/lineage-completeness diagnostics.
- `ProvenanceEngine.build`: source/provider/endpoint-or-query/retrieval/observation/publication/ingestion/version(s)/transformation/adjustment/quality. No secrets (no credential fields exist by construction). `chainToLineage` builds Decision→calculation→price→adjusted→CA→source→provider chains (price + fundamentals variants per roadmap); `lineageComplete` requires non-empty chain with source/observation/publication on every node.
- `CrossSourceValidator.compare`: compares only when same instrument+timestamp+unit (else `comparable:false, NOT_SEMANTICALLY_COMPARABLE`); missing side → `UNVERIFIED`; else deviation vs tolerance (default 10%, mirroring `QUOTE_CROSSCHECK_TOLERANCE_PERCENT`) → `OK|MISMATCH` + basis-points discrepancy. Never silently picks a winner — records verdict.
- TTLs/freshness preserved: history 60s / quote 15s / fundamentals 300s; trading staleness 120s; basis/iNAV 300s STALE rules — all documented, none redefined.

## Acceptance

- [x] quality states explicit (5-state + mapping)
- [x] provenance available (10-field builder)
- [x] lineage available (chain + completeness check)
- [x] source preserved (every bar/record carries source; provenance requires it)
- [x] transformation traceable (transformation/adjustment/version fields)
- [x] provider discrepancies detectable (comparable-gated OK/MISMATCH/UNVERIFIED + bps)
- [x] invalid data fails closed (INVALID/UNAVAILABLE paths, no zero-fill)
- [x] audit output reproducible (pure builders; determinism via stable field order)

## Files

```text
src/lib/data/QualityProvenanceEngine.ts
src/lib/data/__tests__/Data03.test.ts
docs/DATA_03_ARCHITECTURE.md (this file)
docs/DATA_03_CERTIFICATION.md
```
