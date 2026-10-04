# DATA-04 — SURVIVORSHIP / LOOK-AHEAD / POINT-IN-TIME: ARCHITECTURE

**Version**: `v1.0.0-data04` | **Date**: 2026-10-04 | **Lane**: Data Foundation
**Status**: IMPLEMENTED — tests 6/6 in `Data04.test.ts` (part of 31/31)

## Objective

Historical research must never accidentally use information unavailable at the
time. Highest-priority capability: explicit `asOfDate`, `publicationTime<=T`
availability, reusable future-guards, survivorship-safe universes, queryable
delisted assets, `get*AsOf` APIs, explicit bias diagnostics.

## Design (mirrors + generalizes existing proven patterns)

Existing patterns preserved (never weakened): `LookAheadGuard` slice isolation
+ `validateLookbackSlice` + `verifyNoFutureLeakage` + `T close→T+1 open`;
macro/capital-cycle SQL PIT (`lte(publicationDate,asOfDate)`) + in-memory
`MacroNormalizer` reject+violation + `publicationCutoffDate==asOfDate`;
`StrategyContextAggregator` instant comparison; basis/iNAV 300s STALE.

- `PointInTimeGuard.isKnowable/filterKnowable`: `publicationDate<=asOf` (generic over earnings/fundamentals/CA/membership/metadata/macro/strategy inputs).
- `assertNoFutureInput(kind,publicationDate,asOf)`: null date → `FUTURE_PUBLICATION` (cannot prove availability); future → `LOOKAHEAD_DETECTED`; else null.
- `getInstrumentAsOf/getUniverseAsOf`: version resolution (`validFrom<=asOf`, no/after `validTo`); active-only default + `SURVIVORSHIP_RISK` diagnostic when non-actives excluded; `includeDelisted:true` for unbiased research. Delisted never auto-removed; queryable at valid time, null outside.
- `detectCurrentConstituentLeak(usedUniverseDate,researchAsOf)`: unknown vintage or newer-than-research → `CURRENT_CONSTITUENT_LEAK`.
- `futureMetadata`: `FUTURE_METADATA` on metadata-after-asOf.
- Codes: `LOOKAHEAD_DETECTED/SURVIVORSHIP_RISK/CURRENT_CONSTITUENT_LEAK/FUTURE_PUBLICATION/FUTURE_METADATA` (BiasDiagnostic with detail + offendingRef).
- `DataFoundationService.getInstrumentAsOf/getUniverseAsOf/getCorporateActionsAsOf`: canonical `get*AsOf` APIs over instrument registry + validated CA records (TIER_4 already excluded by DATA-02 validator).

## Acceptance

- [x] point-in-time queries exist (instrument/universe/CA/bars all asOf-capable)
- [x] publication time respected (`<=T` filter + tests)
- [x] future information rejected (LOOKAHEAD/FUTURE_PUBLICATION + tests)
- [x] delisted assets remain queryable (status-aware test)
- [x] historical universes supported (version resolution test)
- [x] historical metadata queryable (version + futureMetadata guard)
- [x] look-ahead tests exist (4 tests)
- [x] survivorship tests exist (universe + leak tests)
- [x] reproducibility demonstrated (pure functions; same inputs → same outputs; determinism covered in DATA-01/02)

## Files

```text
src/lib/data/PointInTimeGuard.ts
src/services/data/DataFoundationService.ts (AsOf APIs)
src/lib/data/__tests__/Data04.test.ts
docs/DATA_04_ARCHITECTURE.md (this file)
docs/DATA_04_CERTIFICATION.md
```
