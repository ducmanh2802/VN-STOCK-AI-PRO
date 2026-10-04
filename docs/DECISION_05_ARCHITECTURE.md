# DECISION-05 — MONITORING & DECISION REVIEW: ARCHITECTURE

**Version**: `v1.0.0-decision05` | **Date**: 2026-10-04 | **Lane**: Decision OS
**Status**: IMPLEMENTED — 4/4 tests in `Decision05.test.ts`

## Objective

A decision is not complete when made. Track the 10 monitored dimensions,
fire the 10 trigger conditions, build structured reviews, and journal both
append-only. Cadence follows domain freshness (no universal timer).

## Design

- `MonitoringEngine.detect` — pure mapping from `MonitoredState` booleans
  (decision/thesis/risk/portfolio/market/fundamentals/macro/industry/
  valuation/strategy observed upstream) to triggers (`THESIS_INVALIDATED/
  RISK_LIMIT_BREACHED/TARGET_REACHED/STOP_TRIGGERED/VALUATION_CHANGED/
  FUNDAMENTAL_CHANGED/MACRO_CHANGED/INDUSTRY_CHANGED/DATA_INVALID/
  POSITION_CHANGED`). `falseTriggerGuard`: when `dataInvalid`, all non-data
  triggers suppressed (only `DATA_INVALID` survives) — prevents acting on
  corrupt inputs.
- `ReviewEngine.create` — review carries original decision + original evidence
  + actual outcome + what-changed/correct/wrong + lessons + new decision +
  reviewedAt. Identity required. Originals preserved verbatim (never rewritten).
- Persistence: `decision_reviews` append-only (`0004` + `recordReview`,
  conflict-do-nothing on `review_id`); journal + reviews give the full
  decision→monitoring→review trail. Learning may consume this history as
  educational material only — it cannot alter investment truth.

## Tests

Per-trigger detection, empty-quiet, false-trigger suppression, review creation
with originals preserved, identity requirement.

## Files

```text
src/lib/decision/MonitoringEngine.ts
src/services/decision/DecisionOSService.ts (detectTriggers/createReview)
src/lib/db/decision/DecisionJournalRepository.ts (recordReview)
src/db/schema.ts (§32) + drizzle/0004_decision_journal.sql
src/lib/decision/__tests__/Decision05.test.ts
docs/DECISION_05_ARCHITECTURE.md + docs/DECISION_05_CERTIFICATION.md
```
