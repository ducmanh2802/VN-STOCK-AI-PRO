# RESEARCH / BACKTEST / VALIDATION — ARCHITECTURE

**Version**: `v1.0.0-research` | **Date**: 2026-10-04 | **Lane**: Research & Validation
**Status**: IMPLEMENTED → CERTIFIED (RESEARCH-01→05 verified)

## Final architecture

```text
DATA FOUNDATION (instruments/bars/CA/quality/provenance/PIT/bias)
        ↓
EXPERIMENT (RESEARCH-01: versioned dataset+strategy+params+seed, fingerprint EXP_…)
        ↓
EVENT ENGINE (RESEARCH-02: DATA→STRATEGY→SIGNAL→RISK→SIZE→ORDER→EXECUTION→FILL→PORTFOLIO→P&L)
        ↓
COST (RESEARCH-03: versioned model, fee schedule, BPS/SPREAD slippage, lot+liquidity caps)
        ↓
PORTFOLIO ACCOUNTING (cash/positions/MV/realized+unrealized/fees/slippage/turnover/exposure/leverage/drawdown; NAV invariant)
        ↓
VALIDATION (RESEARCH-04: TRAIN/VALIDATION/TEST non-overlapping + walk-forward + sensitivity + regime segmentation)
        ↓
AUDIT (RESEARCH-05: metrics w/ guards, 8 warnings, benchmark vintage, manifest, 8-condition certification, bias codes, snooping ledger, NAV check)
        ↓
DECISION OS (consumer of certified results via contracts — never rewrites research)
```

## Boundaries (verified)

- Point-in-time enforced architecturally (sliced context; `publicationDate<=asOf`; `FUTURE_PUBLICATION` rejected as violations).
- No future information in strategy or metrics; no silent current-universe leakage; no fabricated data/performance.
- Delisted instruments retained via `includeDelisted`; historical ≠ current universe regression test present.
- Corporate actions: explicit events in engine; Phase-23 formula available via `AdjustmentEngine` for series mode; raw prices never patched inside the engine.
- Accounting: NAV invariant + canonical cost constants + conservation; FinancialConservation semantics inherited (not forked).
- Randomness: seeded only, seed in manifest.
- AI: explains/hypothesises only — never patches, hides bias, alters results, or claims certification.
- Pure lib (no clock/I/O/random in core paths); service orchestrates; repos append-only; no new routes (transport deferred by design).
- No writes to protected engines: TradeSimulator/LookAheadGuard/PositionSizer/RiskGuard/TradingEngine/RiskManager/portfolio/multi-asset/strategy-factory/data-foundation/learning all consumed via contracts.

## Persistence

`research_experiments` (EXP fingerprint + seed + versioned params) and
`research_certifications` (verdict + manifest + warnings) append-only via
`0005_research.sql` (additive, idempotent). Existing migrations untouched.

## Integration

Zero diffs required in DATA-01→05 / DECISION-01→05 / Phase 24–29: contracts
were already stable (sliced candles, `publicationDate` PIT, explicit costs,
lot/multiplier constants). Smallest-compatible-change rule trivially
satisfied.
