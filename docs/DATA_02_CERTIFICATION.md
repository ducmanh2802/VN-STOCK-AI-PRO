# DATA-02 — CERTIFICATION

**Phase**: DATA-02 Corporate Actions & Historical Adjustment | **Date**: 2026-10-04
**Status**: CERTIFIED | **Version**: `v1.0.0-data02`

## Files Changed (data lane only)

```text
src/lib/data/CorporateActionsEngine.ts
src/lib/db/data/DataFoundationRepository.ts (append-only repo)
src/services/data/DataFoundationService.ts
src/db/schema.ts (§30 additive)
drizzle/0003_data_foundation.sql
src/lib/data/__tests__/Data02.test.ts
docs/DATA_02_ARCHITECTURE.md
docs/DATA_02_CERTIFICATION.md (this file)
```

Phase 23 engines untouched (formula reused by reference, not forked). No raw-data migration. No protected edits.

## Tests

- Lane: 7/7 DATA-02 (valid dividend, 5 invalid classes, TIER_4 rejection, chain conflict, RAW immutability, split K-factor, cash factor, OTM suppression, cancelled-null). Full data suite 31/31. `tsc` clean.

## Acceptance Verification

All 8 DATA-02 criteria verified. Adjustment: split 2:1 on 20000 → 10000 pre-ex, volume doubled, post-ex untouched; cash 1000 on 20000 → k=0.95; OTM rights → k=1.

## Limitations

No live VSDC feed (records from registry/caller + persisted events only); missing `prevClose` → event skipped with documented gap (never interpolated); TOTAL_RETURN/PRICE_RETURN modes reserved.

## Next

DATA-03 (quality/provenance) — wraps adjustment outputs with lineage; no blocker.
