# DECISION-02 — INVESTMENT THESIS ENGINE: ARCHITECTURE

**Version**: `v1.0.0-decision02` | **Date**: 2026-10-04 | **Lane**: Decision OS
**Status**: IMPLEMENTED — 3/3 tests in `Decision02.test.ts`

## Objective

Convert analytical evidence into an explicit, evidence-linked investment
thesis with catalysts, risks, valuation/industry/macro context, expected
outcome, horizon, invalidation conditions, and Bull/Base/Bear scenarios.

## Design

- `ThesisEngine.create` — rejects empty thesis and evidence-free thesis
  (`"Company looks good."` without evidence is impossible by construction).
  Every `EvidenceRef` must carry ref+source+asOfDate (claim → metric/event/
  analysis → source → as-of). Invalidation filtered against the 8 supported
  criteria (earnings/margin/debt/valuation/industry/macro/technical/risk-limit);
  unsupported phrases dropped (only system-data criteria allowed). Scenarios
  carry assumptions/drivers/risks/valuation-implication; `probability` stays
  null unless caller justifies (validated 0..1 when present — never invented).
- Lifecycle `DRAFT→ACTIVE→CHALLENGED→INVALIDATED/CONFIRMED→CLOSED` via
  `transition` with allow-list (invalid jumps throw); `history[]` append-only —
  prior states remain auditable, never rewritten.
- Pure + deterministic; timestamps injected.

## Tests

Creation, evidence linking (reject unlinked), scenarios (reject invented
probability), invalidation filtering, lifecycle allow-list, immutability
(original object untouched by transition).

## Files

```text
src/lib/decision/ThesisEngine.ts (+ types.ts InvestmentThesis)
src/lib/decision/__tests__/Decision02.test.ts
docs/DECISION_02_ARCHITECTURE.md + docs/DECISION_02_CERTIFICATION.md
```
