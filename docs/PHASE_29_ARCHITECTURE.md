# PHASE 29 — FULL MULTI-ASSET QUANT PLATFORM INTEGRATION: DISCOVERY + ARCHITECTURE

**Date**: 2026-10-04 | **Lane**: Core Backend | **Version**: `v1.0.0-phase29`

## 1. Discovery (verified, not inferred)

- Phase 25 strategy contracts (`src/lib/strategy/types.ts`): `AssetClass`
  EQUITY/DERIVATIVE/ETF/CROSS_ASSET, bounded conviction, fail-closed HOLD/FLAT,
  `asOfDate` + lineage on every signal. Reused read-only.
- Phase 21 derivatives (`src/lib/derivatives/*`): multiplier 100,000 VND/pt, tick 0.1,
  HNX cash settlement, 3rd-Thursday expiry, basis/OI/term-structure/regime,
  continuous-futures history when supplied. Semantics preserved verbatim.
- Phase 22 ETF (`src/lib/etf/*`): 10 HOSE ETFs, NAV vs iNAV separation, premium/discount
  regime, tracking error/beta/correlation, holdings concentration. Semantics preserved.
- Equity: lot 100 (`VietnamLotRule`), price limits, fees 0.15% + seller tax 0.10%
  (in backtest/trading config — referenced, not recomputed here).
- Phase 28 (this lane, just certified): pure portfolio engines + snapshot; Phase 29
  builds the multi-asset position/portfolio layer ON TOP, delegating equity-style
  analytics to Phase 28 where applicable and handling derivatives/cash differences
  explicitly.
- Historical availability: equity KBS (range-limited), ETF bars (optional), derivatives
  continuous futures (optional). Missing → `UNAVAILABLE`, never empty. Static universe →
  survivorship caveat carried forward.
- No multi-asset position/portfolio abstraction exists (glob confirmed). No migration
  needed (compute layer). No Learning contact. No protected-system edits planned.

## 2. Architecture

```text
src/lib/multi-asset/types.ts                      canonical multi-asset contracts
src/lib/multi-asset/MultiAssetPositionEngine.ts   per-position valuation (asset-specific)
src/lib/multi-asset/MultiAssetPortfolioEngine.ts  aggregate: notional/net/gross/leverage/margin/breakdown/rebalance
src/lib/multi-asset/QuantPlatformIntegrationEngine.ts  unified quant snapshot:
  multi-asset portfolio + Phase-28 analytics reference + strategy-signal summary + risk-limit checks
src/lib/multi-asset/index.ts
src/services/multi-asset/MultiAssetQuantService.ts   (owns orchestration; provider contract
  `MultiAssetDataProvider.getInputs` is declared in this file — no separate
  `MultiAssetDataProvider.ts` file exists)
src/lib/multi-asset/__tests__/MultiAssetEngines.test.ts
src/lib/multi-asset/__tests__/MultiAssetFailClosed.test.ts
```

### Asset-specific semantics (binding)

| Class | Qty unit | Market value | Return basis | Constraints preserved |
|---|---|---|---|---|
| EQUITY | shares (lot 100) | qty × price | simple price return | lot rule, price ≥ 0 |
| ETF | shares (lot 100) | qty × price (NAV tracked separately, never substituted) | simple price return; premium/discount informational | registry membership check informational |
| DERIVATIVE | contracts (signed; +long/−short) | notional = qty × futuresPrice × 100,000; equity contribution = margin + unrealized (supplied, never invented) | return on notional; tick 0.1 is a semantic constant (`FUTURES_TICK_SIZE_POINTS`, informational — not required by the valuation path) | multiplier/tick/expiry; **expiryDate required (missing/blank/malformed → `INVALID`, never estimated)**; expired contracts rejected (`INVALID`) |
| CASH | VND | face value | 0 | non-negative |

> Lot-100 note: equity/ETF lot 100 is enforced as lot-rounded **execution hints** in
> `MultiAssetPortfolioEngine.rebalance` plus integer-quantity validation in
> `MultiAssetPositionEngine` (fractional → `INVALID`); non-multiple-of-100 integer
> quantities pass valuation (odd-lot tolerant).

Cross-asset totals: net exposure = Σ signed notionals + equity market value + cash;
gross = Σ absolute; leverage = gross / netAssets (null when netAssets ≤ 0).
Margin: supplied per-contract requirement → total requirement vs cash coverage.
Rebalancing: target-weight deltas in value terms; lot/contract rounding reported as
separate execution hints, never baked into pure weights.

### Quant snapshot

`QuantPlatformSnapshot` = multi-asset portfolio + (Phase-28 snapshot reference for the
equity/ETF slice) + strategy-signal rollup (counts by direction, mean conviction, fail-closed
signal dominance preserved — this engine never upgrades a HOLD/FLAT) + limit checks
(leverage cap, derivative notional cap, cash floor) + lineage/warnings/limitations.
Pure, deterministic, explicit `asOfDate`.

## 3. Acceptance (binding)

- Per-position math matches hand fixtures for all four classes incl. short futures.
- **Futures expiry is required. Missing/blank/malformed expiryDate → `INVALID` (never
  estimated); expired derivative → `INVALID`;** missing price/margin → `UNAVAILABLE`, never zero-filled.
- Leverage/margin/rebalance verified; weights hint sums documented.
- Integration snapshot deterministic; strategy HOLD/FLAT never overridden.
- Tests + typecheck + build green; ownership clean (multi-asset lane only).
