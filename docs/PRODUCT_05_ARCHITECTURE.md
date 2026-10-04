# PRODUCT-05 — ALERTS & MONITORING: ARCHITECTURE
Status: IMPLEMENTED (lane-local) | Date: 2026-10-04

## Purpose
Turn monitoring signals into honest, non-noisy user alerts. An alert is an **assertion about a
supplied observation**, never a prediction and never a quote the system invented.

## Architecture
```text
User-authored AlertRule[]
  Observation { instrumentId, price, previousPrice, asOf, dataValid }   [caller-supplied]
  → AlertEngine.evaluateRules()      → Alert[] (priced rules)
  MonitoredState (Decision OS)
  → MonitoringEngine.detect() + falseTriggerGuard()   [certified, NOT reimplemented]
  → AlertEngine.fromTriggers()       → Alert[] (decision triggers, severity ranked)
```

## Rule kinds
`PRICE_ABOVE` (strict `>`), `PRICE_BELOW` (strict `<`), `PRICE_CHANGE_PCT` (`|move| ≥ |threshold|`,
requires a previous price), `DECISION_TRIGGER` (mapped from the certified engine).

## Honesty rules (tested)
1. **No polling, no network, no fabricated prices.** Observations are injected and stamped `asOf`.
2. Missing price ⇒ `INFO … not evaluated`, never a breach, never an imputed price.
3. Missing previous price ⇒ percentage rule reports `not evaluated`.
4. Thresholds equal to the observation are **not** breaches (strict comparison, documented).
5. `dataValid: false` suppresses breach alerts unless the rule opts in via `dataIndependent`;
   suppressed alerts keep the message plus `DATA_INVALID` reason and never count as critical.
6. `DATA_INVALID` suppresses downstream Decision OS triggers via the certified guard; the `DATA_INVALID`
   trigger itself is not surfaced as an actionable alert.
7. Malformed rules fail closed at creation (`ALERT_*` codes).

## Reuse
Trigger detection and the false-trigger guard belong to `MonitoringEngine`; `MonitorTrigger` is
derived via `ReturnType<typeof MonitoringEngine.detect>[number]` so the protected Decision OS lane
is never edited.

## Known limitations
No scheduler/push delivery (evaluation is caller-driven, by design); no persistence for rules;
no dedup/history across repeated observations.