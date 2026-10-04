# RESEARCH-04 — WALK-FORWARD / ROBUSTNESS / VALIDATION: ARCHITECTURE

**Version**: `v1.0.0-research04` | **Date**: 2026-10-04 | **Status**: IMPLEMENTED — 5/5 tests

## Train/validation/test

`ValidationEngine.split` — chronological, non-overlapping (60/20/20 default),
`OVERLAP_DETECTED` on violation. Never mixed: each segment is a distinct
array, and `WalkForwardWindow` carries explicit start/end pairs.

## Walk-forward

Rolling `trainBars/validationBars/testBars/step`; windows ordered
monotonically; `INSUFFICIENT_BARS` when the fold collapses. Each fold is an
independent evaluation subject (caller runs the engine on each segment;
`label` forces explicit `IN_SAMPLE/OUT_OF_SAMPLE/WALK_FORWARD` tagging).

## Parameter sensitivity

`sensitivity(values[])` returns min/max/spread% + stability gate (≤25%
spread considered stable, mirroring the existing `ParameterPerturbationResult`
threshold). No endless optimization: callers grid explicitly.

## Robustness dimensions

Stability covered: performance (caller feeds per-window metric), drawdown,
turnover, parameter spread, regime segmentation (below), asset sensitivity
(caller iterates assets with the same parameters — no per-asset tuning).

## Regime validation

`byRegime(labels, keys, value)` groups by caller-supplied regime labels
(from Phase 27 where available). Unknown dates group as `UNKNOWN` — regimes
never fabricated. Example use: bull/bear/sideways/high-low-vol/macro-regime.

## Out-of-sample labelling

`SampleKind` distinguishes IN_SAMPLE/OUT_OF_SAMPLE/WALK_FORWARD on every
result record; certification flags `insufficient out-of-sample` when
`oosBars < 60`.

## Determinism / randomness

`seededShuffle(items, seed)` — LCG with explicit seed (42) for any research
algorithm needing randomness; seed recorded in the manifest (§RESEARCH-05);
no uncontrolled randomness.

## Tests

Chronological split, non-overlap assert, walk-forward roll + fold ordering,
sensitivity stability both ways, regime segmentation with UNKNOWN,
explicit kind labels, seeded shuffle reproducibility.

## Files

```text
src/lib/research/ValidationEngine.ts (+ __tests__/Research04.test.ts)
```
