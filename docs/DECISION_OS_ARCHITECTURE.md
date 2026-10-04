# DECISION OS — ARCHITECTURE

**Version**: `v1.0.0-decision-os` | **Date**: 2026-10-04 | **Lane**: Decision OS
**Status**: IMPLEMENTED → CERTIFIED (all 5 phases)

## Final architecture

```text
DATA FOUNDATION (DATA-01→05: instruments/bars/CA/quality/provenance/PIT/bias/multi-asset)
        ↓
MACRO (Phase 27 regime, UNKNOWN-safe, AI explains only)
        ↓
INDUSTRY (Phase 26 capital-cycle, evidence-tiered)
        ↓
FUNDAMENTALS (Phase 24 earnings, null-safe, TTM direct-or-4Q)
        ↓
VALUATION (deterministic engines)
        ↓
STRATEGY (Phase 25 factory; HOLD/FLAT fail-closed via UniversalSignalNormalizer)
        ↓
PORTFOLIO (Phase 28 snapshot: exposure/concentration/cov/beta/factor/allocation)
        ↓
RISK (RiskGuard verdict + DECISION-03 states ACCEPTABLE/CAUTION/HIGH_RISK/BLOCKED/UNKNOWN)
        ↓
POSITION SIZE (PositionSizer via DECISION-04 wrapper; FULL/ZERO/BLOCKED + 5 zero reasons)
        ↓
DECISION (DECISION-01 DecisionObject: ELIGIBLE/BLOCKED + fail codes + HOLD preservation)
        ↓
PAPER / EXECUTION (existing PaperBroker path; recommendation ≠ execution)
        ↓
MONITORING (DECISION-05 triggers incl. false-trigger guard)
        ↓
REVIEW (append-only decision_reviews)
        ↓
LEARNING (educational consumer only — never alters investment truth)
```

## Modules

```text
src/lib/decision/types.ts, DecisionChainBuilder.ts, ThesisEngine.ts,
  RiskDecisionEngine.ts, PositionIntegrationEngine.ts, MonitoringEngine.ts, index.ts
src/services/decision/DecisionOSService.ts (+ index.ts)
src/lib/db/decision/DecisionJournalRepository.ts
src/lib/decision/__tests__/Decision01..05.test.ts (25 tests)
src/db/schema.ts (§31 decision_journal, §32 decision_reviews)
drizzle/0004_decision_journal.sql
docs/DECISION_0{1..5}_{ARCHITECTURE,CERTIFICATION}.md (this set)
docs/DECISION_OS_ARCHITECTURE.md (this file)
docs/DECISION_OS_FULL_AUDIT.md
```

## Boundaries (all verified)

- ANALYSIS ≠ DECISION; score ≠ order; recommendation ≠ execution.
- HOLD/FLAT never upgraded (chain + sizer both enforce; sizer not even called).
- SAFETY > SIZE > DECISION > SCORE; AI summarizes/explains/challenges/suggests/
  teaches — never overrides risk, invents data, changes size, executes, or
  rewrites history.
- Pure lib (no clock/I/O/random; timestamps injected) vs orchestration service
  vs append-only repos vs transport (no new routes in this slice).
- Thesis evidence-linked (no evidence-free claims; no invented probabilities;
  invalidation from supported data only; lifecycle append-only).
- Provenance on every decision (6 versions + asOfDate); explainability
  WHAT/WHY/WHEN/EVIDENCE/RISK/SIZE/INVALIDATION answerable without source.
- Fail-closed codes end-to-end (chain fail codes + risk UNKNOWN + sizing zero
  taxonomy + monitor false-trigger guard + DATA fail codes upstream).
- Futures/ETF/lot semantics preserved by contract (100_000/0.1/100).
- No UI financial math; no new UI in this slice (exposure via service contracts).
- No secrets in provenance; no credential fields anywhere.

## Performance / security

Per-decision cost O(stages) + O(1) sizing + O(triggers); no N×N work in this
lane (portfolio covariance stays in Phase 28). No new packages. Repos use
parameterized Drizzle (no dynamic SQL). Journal rows append-only with unique
ids; no cross-user reads in this slice (service has no auth bypass — it adds
no routes).

## Integration

Read-only consumption of DATA-01→05, Phase 24–29 via stable contracts;
smallest-compatible-change rule applied (zero changes needed — all contracts
already stable). Phase 28/29/strategy/macro/data-foundation/learning:
untouched.
