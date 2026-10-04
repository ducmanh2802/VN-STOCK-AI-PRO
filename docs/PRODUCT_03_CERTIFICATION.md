# PRODUCT-03 — RESEARCH WORKSPACE: CERTIFICATION
Status: CERTIFIED (lane-local) | Date: 2026-10-04

## Files
- `src/lib/product/research/ResearchWorkspaceEngine.ts` (pure rules)
- `src/lib/product/research/__tests__/researchWorkspaceEngine.test.ts` (7 tests)
- `src/services/product/ResearchService.ts` (persistence + journal existence checks)

## Test evidence (23 product tests at this phase, all pass)
| Requirement | Test |
| --- | --- |
| ID/instrument normalization | `HPG` from `hpg`; empty id/title throw |
| Open questions are valid | coverage = `{total:1, answered:0, …}` |
| Unsupported notes flagged | zero evidence links ⇒ `unsupported:true`, counted |
| Cross-workspace orphan prevention | `NOTE_QUESTION_NOT_IN_WORKSPACE`, `QUESTION_DUPLICATE` |
| Claim integrity | blank claim, confidence 1.4 ⇒ throws |
| Link validation is real | bad journal id ⇒ `JOURNAL_ENTRY_NOT_FOUND`; linking clears `unsupported` |
| Single close per question | `QUESTION_ALREADY_CLOSED` |

## Gate (§43)
`npx vitest run src/lib/product` → 3 files / 23 tests pass. `tsc --noEmit` clean (product scope).
`npm run build` success. No protected-system modification.

## Known limitations
No persistence beyond localStorage (no server yet); no text search across notes; no import from
existing `StockDetailPage`/`WatchlistPage` artifacts yet (links are by reference id only).