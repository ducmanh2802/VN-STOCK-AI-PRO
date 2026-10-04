# DECISION-01 — INVESTMENT DECISION CHAIN: ARCHITECTURE

**Version**: `v1.0.0-decision01` | **Date**: 2026-10-04 | **Lane**: Decision OS
**Status**: IMPLEMENTED — 8/8 tests in `Decision01.test.ts`

## Objective

Canonical decision pipeline producing a structured `DecisionObject`
(decisionId/instrumentId/asOfDate/type/status/evidence/thesis/valuation/
strategy/portfolio/risk/sizing/constraints/confidence/quality/provenance/
createdAt/version). ANALYSIS vs DECISION separated: a score never
auto-becomes an order; recommendation ≠ execution.

## Design

- `src/lib/decision/types.ts` — decision/those/risk/sizing/monitor/review types,
  fail codes (`DATA_UNAVAILABLE/ANALYSIS_INCOMPLETE/RISK_UNAVAILABLE/
  VALUATION_UNAVAILABLE/PORTFOLIO_CONTEXT_UNAVAILABLE`), statuses
  (`PENDING/ELIGIBLE/APPROVED/REJECTED/BLOCKED/EXECUTED/MONITORING/
  CLOSED/REVIEW_REQUIRED`), types (`BUY/ADD/HOLD/REDUCE/SELL/AVOID/WATCH/EXIT`).
- `DecisionChainBuilder.build` — 10 stages (data/validation/macro/industry/
  fundamentals/valuation/strategy/portfolio/risk/sizing). Critical stages
  (data/validation/strategy/risk) missing → `BLOCKED` + fail code; non-critical
  missing → note, stays `ELIGIBLE`. Any `blocker` → `BLOCKED` + constraint.
  HOLD/FLAT preservation enforced: LONG/SHORT upgrade from HOLD/FLAT is
  rewritten to HOLD (or AVOID for FLAT exit types) with a note — never silent.
  Pure: `createdAt` injected, no clock; deterministic (JSON-stable).
- No unstructured blobs: evidence is `EvidenceRef[]` (kind/ref/asOfDate/source);
  provenance carries all six versions (data/asOf/analysis/strategy/risk/sizing).
- Persistence: `decision_journal` append-only (`0004` + `DecisionJournalRepository.
  recordDecision`, conflict-do-nothing on `decision_id`).

## Fail-closed

Critical evidence unavailable → `BLOCKED` + typed fail code; no manufactured
decision. Invalid/conflicting/blocked inputs → `BLOCKED` with constraint list.

## Tests

Complete chain, missing critical (risk/data), missing non-critical (macro),
explicit blocker, HOLD preservation, FLAT→AVOID, determinism.

## Files

```text
src/lib/decision/types.ts
src/lib/decision/DecisionChainBuilder.ts
src/lib/decision/index.ts
src/services/decision/DecisionOSService.ts (buildDecision)
src/lib/db/decision/DecisionJournalRepository.ts
src/db/schema.ts (§31) + drizzle/0004_decision_journal.sql
src/lib/decision/__tests__/Decision01.test.ts
docs/DECISION_01_ARCHITECTURE.md + docs/DECISION_01_CERTIFICATION.md
```
