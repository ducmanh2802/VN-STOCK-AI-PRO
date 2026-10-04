# PRODUCT-01 — INVESTMENT JOURNAL: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Discovery (actual repo, not assumed)
- Decision OS IMPLEMENTED: `src/lib/decision/` (Thesis/Chain/Monitoring+Review/Risk/Position engines,
  canonical types, HOLD/FLAT preservation) + `src/services/decision/DecisionOSService.ts` + `drizzle/0004`
  (`decision_journal`, `decision_reviews`) + schema tables. Reused, not forked.
- Journal UI was a placeholder (`journal` → PhasePlaceholderPage). Sidebar item already existed.
- No product/journal namespaces existed. No duplicate journal model found.

## Architecture (orchestration, not duplication)
```text
JournalPage (product UI)
  → JournalService (application orchestration)
    → JournalEngine (product rules: lifecycle, snapshot freeze, review append, quality matrix)
    → Decision OS engines (ThesisEngine.create, DecisionChainBuilder.build, ReviewEngine.create)
    → JournalStore (IJournalStore; local single-learner now, 0004-shaped for later)
```
- Decision snapshots are deep-frozen copies of certified DecisionObjects; history can never be
  recomputed with today's data (acceptance requirement, tested).
- Chain input assembly defaults non-critical stages to unavailable — the certified chain (not the
  product layer) decides ELIGIBLE vs BLOCKED.
- Persistence mapping documented in JournalStore header (entry.id ↔ decision_id; reviews[] ↔ rows).

## Acceptance mapping
select instrument → inspect evidence (thesis evidence refs) → create thesis (ThesisEngine, evidence-required)
→ create decision (chain-built, fail-closed) → save snapshot (frozen) → review later (review-due + append-only
review) → compare thesis vs outcome (explicit summary + quality matrix) → record lessons (review.lessons).

## Ownership
Owned: `src/lib/product/journal/*`, `src/services/product/*`, `src/pages/JournalPage.tsx`.
Shared (minimal, documented): `src/App.tsx` (route `journal` → JournalPage instead of placeholder).
Protected/foreign: untouched (Decision OS imported read-only; 0004 tables referenced, not migrated).
