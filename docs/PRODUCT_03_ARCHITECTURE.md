# PRODUCT-03 — RESEARCH WORKSPACE: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Purpose
Organize *research* (questions + evidence-linked notes) rather than conclusions. Integrates with the
existing product surface (`StockDetailPage`, `WatchlistPage`, `MarketIntelligenceSnapshotBuilder`) by
referencing them — no data duplication.

## Architecture
```text
ResearchService (persistence, learner-scoped key vnstock_product_research_v1:<version>)
  → ResearchWorkspaceEngine (pure rules; version stamped)
    → JournalStore (real existence check for JOURNAL_ENTRY evidence links)
```

## Model
- `ResearchWorkspace` { id, title, instrumentId?, questions[], notes[], createdAt, updatedAt }
- `ResearchQuestion` { id, text, instrumentId, status: OPEN|ANSWERED|ABANDONED } — **open is valid**
- `ResearchNote` { claim, provenance, confidence, evidenceLinks[], unsupported }
- `EvidenceLink` { kind: JOURNAL_ENTRY|DECISION|SCENARIO|DATA_REF|EXTERNAL_REF, refId, note }

## Honesty rules (tested)
1. A note with **zero** evidence links is retained and flagged `unsupported: true` — never counted as
   researched, never silently dropped.
2. `JOURNAL_ENTRY` links are validated against the actual journal (`JOURNAL_ENTRY_NOT_FOUND`).
3. Cross-workspace note attachment rejected (`NOTE_QUESTION_NOT_IN_WORKSPACE`) — no orphan notes.
4. Provenance is mandatory on every claim; confidence must be 0..1.
5. Questions may only be answered once; coverage never conflates "answered" with "well-supported"
   (`coverage()` reports `answered` and `unsupportedNotes` separately).
6. System limits are first-class provenance (`SYSTEM_LIMIT`, `UNKNOWN`) so gaps stay visible.