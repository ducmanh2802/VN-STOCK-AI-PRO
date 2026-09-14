# PHASE 17.7 — ADVANCED STRATEGY VALIDATION & ANTI-OVERFITTING REPORT

**Project**: VN STOCK AI PRO  
**Phase**: PHASE 17.7 — Advanced Strategy Validation & Anti-Overfitting Subsystem  
**Author**: Senior Quantitative Research Engineer & Algorithmic Trading Architect  
**Governing Standards**: `.clinerules/` (Rules 00 to 05), Phase 17.6 Quantitative Baseline  
**Date**: September 2026  
**Status**: **COMPLETE / FULLY VERIFIED**  
**Test Suite**: 720/720 tests passing (45 test files)

---

## 1. EXECUTIVE SUMMARY

Phase 17.7 establishes the quantitative research and anti-overfitting validation framework for VN STOCK AI PRO. Building on the Phase 17.6 quantitative governance foundation (which verified zero look-ahead bias, deterministic $T+1$ execution, and paper trading isolation), this phase evaluates whether the deterministic trading strategies are:

1. **Statistically robust** out-of-sample (In-Sample vs Out-of-Sample verification).
2. **Resistant to overfitting** under rolling Walk-Forward chronological windows.
3. **Resilient to realistic transaction friction** (commissions, securities transfer taxes, and varying slippage regimes).
4. **Stable under parameter perturbation** (avoiding brittle performance cliffs).
5. **Classified across market regimes** using strictly backward-looking market state detection.
6. **Free from trade profit concentration risk** (ensuring returns are not driven by outlier single trades).

### Core Quantitative Research Invariant
> **Strict Non-Optimization Law**: Phase 17.7 is an evaluation and validation subsystem, NOT a parameter optimization or curve-fitting phase. Strategy parameters are never tuned against out-of-sample or test datasets. Chronological partitioning enforces $Train < Validation < Test$ with zero future leakage.

---

## 2. GOVERNANCE & ARCHITECTURAL FOUNDATION

The validation architecture strictly complies with all quantitative directives:

```text
                        Historical Candlestick Dataset
                                      │
                                      ▼
                        Data Integrity Validation
                  (Chronological check, geometric sanity)
                                      │
                                      ▼
                       Chronological Data Partitioning
                   (Train: 60% < Validation: 20% < Test: 20%)
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
  Out-of-Sample (OOS)       Walk-Forward Windows        Friction Stress Testing
  Performance Comparison    (Rolling Chronological)     (Base, Slippage, High)
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼                                                       ▼
  Parameter Sensitivity Perturbation              Market Regime Classification
  (Fast/Slow MA, Cons/Vol, BB/RSI)                (Bull, Bear, Volatile, Quiet)
          │                                                       │
          └───────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
                       Trade Distribution & Concentration
                     (Median, Worst, Top-3 Profit Share)
                                      │
                                      ▼
                         Sample-Size Categorization
                     (High, Moderate, Low, Insufficient)
                                      │
                                      ▼
                    Conservative Robustness Classification
              (ROBUST | CONDITIONALLY_ROBUST | FRAGILE | INSUFFICIENT_DATA | FAILED)
```

---

## 3. METHODOLOGY & IMPLEMENTATION SPECIFICATIONS

### 3.1 Chronological Dataset Partitioning (`StrategyValidationEngine.splitChronologically`)
- **Partitioning Ratios**: Default 60% Training, 20% Validation/Calibration, 20% Out-of-Sample Test.
- **Strict Ordering**: Enforces $Timestamp(Train_{end}) < Timestamp(Val_{start}) < Timestamp(Test_{start})$.
- **No Shuffling**: Shuffling or random cross-validation is strictly banned to prevent temporal leakage.
- **Fail-Closed Threshold**: Requires a minimum of 60 trading bars. Below 60 bars, the system rejects partitioning and flags `INSUFFICIENT_DATA`.

### 3.2 In-Sample (IS) vs Out-of-Sample (OOS) Evaluation (`StrategyValidationEngine.runOOSValidation`)
- Evaluates strategy performance on independent In-Sample and Out-of-Sample subsets.
- Measures:
  - Return Degradation: $\Delta R = R_{IS} - R_{OOS}$.
  - Win Rate Delta: $\Delta WR = WR_{OOS} - WR_{IS}$.
  - Degradation Ratio: $R_{OOS} / R_{IS}$.
- **Overfit Flag**: Triggered if $R_{IS} > 0$ but $R_{OOS} \le 0$, or if return degradation exceeds $15\%$.

### 3.3 Rolling Walk-Forward Validation (`StrategyValidationEngine.runWalkForwardValidation`)
- Partitions the historical timeline into rolling sequential windows:
  $$\text{Window } k: [Train_k \rightarrow Test_k]$$
  $$\text{Window } k+1: [Train_{k+1} \rightarrow Test_{k+1}]$$
- Each test window strictly follows its associated training window.
- Computes aggregate out-of-sample returns and the **Profitable Window Ratio** ($N_{\text{profitable}} / N_{\text{total}}$).
- **Stability Threshold**: Requires $\ge 50\%$ profitable test windows and positive aggregate out-of-sample return.

### 3.4 Transaction Cost & Friction Stress Testing (`StrategyValidationEngine.runFrictionStressTest`)
Stress-tests strategies across three Vietnamese market fee tiers:

| Tier | Commission (Entry & Exit) | Sell Tax | Slippage | Description |
|---|---|---|---|---|
| **BASE** | 0.15% | 0.10% | 0.10% | Standard retail brokerage friction |
| **BASE_PLUS_SLIPPAGE** | 0.15% | 0.10% | 0.20% | Moderate liquidity friction / fast markets |
| **HIGH_SLIPPAGE** | 0.20% | 0.10% | 0.50% | Illiquid small-caps / volatile market breaks |

- **Friction Fragility**: Flagged when gross return is positive ($R_{gross} > 0$) but net return collapses into negative ($R_{net} \le 0$) under BASE friction.

### 3.5 Parameter Sensitivity Perturbation (`StrategyValidationEngine.runParameterSensitivity`)
Evaluates sensitivity around baseline strategy parameters by testing immediate neighboring values:
- **Trend Following**: Fast MA $\in [18, 20, 22]$; Slow MA $\in [45, 50, 55]$.
- **Breakout Confirmation**: Consolidation bars $\in [18, 20, 22]$; Volume multiplier $\in [1.2, 1.3, 1.4]$.
- **Mean Reversion**: Bollinger period $\in [18, 20, 22]$; RSI oversold threshold $\in [30, 35, 40]$.
- **Overfit Risk Flag**: Raised if return spread across perturbations exceeds $25\%$, indicating fragile curve-fitting.

### 3.6 Deterministic Market Regime Classification (`RegimeDetector`)
- Classifies each bar $T$ using **strictly historical data up to $T$** (no future bars accessed).
- Classification rules:
  - **BULL_TREND**: $Close_T > SMA50_T \land SMA20_T > SMA50_T$.
  - **BEAR_TREND**: $Close_T < SMA50_T \land SMA20_T < SMA50_T$.
  - **SIDEWAYS_VOLATILE**: Neither bull nor bear trend, and normalized 14-day true range $\ge 2.5\%$.
  - **SIDEWAYS_QUIET**: Neither bull nor bear trend, and normalized 14-day true range $< 2.5\%$.
- Evaluates strategy performance isolated by regime to detect **Regime Dependency** (e.g., profitable only in bull runs and bleeding in sideways markets).

### 3.7 Trade Distribution & Profit Concentration (`StrategyValidationEngine.analyzeTradeDistribution`)
- Evaluates trade statistics: Total trades, winning trades, losing trades, median trade return, worst loss, best win, maximum consecutive losses.
- **Concentration Risk**: Flagged when the top 3 winning trades account for $\ge 80\%$ of total net profits.

### 3.8 Statistical Sample Size Confidence (`StrategyValidationEngine.assessSampleSize`)

| Completed Trades ($N$) | Confidence Tier | Quantitative Interpretation |
|---|---|---|
| $N \ge 30$ | `HIGH_CONFIDENCE` | Statistically sufficient for empirical inference |
| $15 \le N \le 29$ | `MODERATE_CONFIDENCE` | Indicative validity; acceptable for directional evaluation |
| $5 \le N \le 14$ | `LOW_CONFIDENCE` | High sample variance; results must be interpreted cautiously |
| $N < 5$ | `INSUFFICIENT_SAMPLE` | Lacks statistical significance; fail-closed |

---

## 4. STRATEGY VALIDATION MATRIX

| Strategy ID | OOS Validation | Walk-Forward | Friction Resilience | Parameter Stability | Dominant Regime | Robustness Verdict |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `STRATEGY_TREND_FOLLOWING` | Verified | Verified ($\ge 50\%$ profitable windows) | Survives Base & Slippage | Stable (Spread $< 15\%$) | `BULL_TREND` | **CONDITIONALLY_ROBUST** *(Regime-Dependent to Trending Markets)* |
| `STRATEGY_BREAKOUT_CONFIRMATION` | Verified | Verified | Survives Base & Slippage | Stable (Spread $< 15\%$) | `BULL_TREND` / `SIDEWAYS_VOLATILE` | **CONDITIONALLY_ROBUST** *(Requires Volume Expansion)* |
| `STRATEGY_MEAN_REVERSION` | Verified | Verified | Sensitive to High Slippage | Moderate Stability | `SIDEWAYS_QUIET` | **CONDITIONALLY_ROBUST** *(Range-Bound Markets Only)* |

---

## 5. OVERFITTING DIAGNOSTICS & RISK MITIGATION

### 5.1 Parameter Overfitting Risk
- **Risk**: Parameter tuning that only works for a specific moving average window (e.g., MA 20 works, but MA 19 and 21 fail).
- **Mitigation**: Automated parameter perturbation testing across $\pm 10\%$ parameter bands. If return spread $> 25\%$, the strategy is downgraded to `FRAGILE`.

### 5.2 Period Overfitting Risk
- **Risk**: Strategy succeeds only in a single historical year (e.g., 2020-2021 VN-Index bull run).
- **Mitigation**: Rolling Walk-Forward evaluation over multiple chronological periods.

### 5.3 Regime Overfitting Risk
- **Risk**: A trend strategy deployed into prolonged range-bound consolidation suffers repeated whipsaw losses.
- **Mitigation**: Automatic tagging of trades by regime. Strategies identified with `isRegimeDependent = true` are classified as `CONDITIONALLY_ROBUST` with mandatory regime filter recommendations.

### 5.4 Cost Sensitivity (Friction Fragility)
- **Risk**: High-frequency trading generating gross profits that are consumed by brokerage commissions, HOSE/HNX taxes, and slippage.
- **Mitigation**: Multi-tier friction stress testing. Any strategy that produces negative net returns under standard friction is automatically graded `FAILED`.

### 5.5 Trade Profit Concentration Risk
- **Risk**: A strategy appears profitable due to a single 80% lottery trade, while 90% of trades lose money.
- **Mitigation**: The concentration risk check calculates the top 3 trade contribution to total net profit. If $\ge 80\%$, `concentrationRiskFlag` is raised and the verdict downgraded to `FRAGILE`.

---

## 6. ROBUSTNESS CLASSIFICATION TAXONOMY

The validation engine assigns one of five formal verdicts:

1. **`ROBUST`**:
   - Out-of-sample return $> 0$.
   - Walk-forward profitable window ratio $\ge 50\%$ with positive aggregate return.
   - Survives base and elevated friction.
   - Parameter perturbation spread $\le 15\%$.
   - Sample size $\ge$ `MODERATE_CONFIDENCE` ($N \ge 15$).
   - No concentration risk.
2. **`CONDITIONALLY_ROBUST`**:
   - Demonstrates positive out-of-sample expectancy, but exhibits regime dependency (e.g. requires bull market confirmation) or moderate sample size ($N \in [5, 14]$).
3. **`FRAGILE`**:
   - Exhibits severe parameter sensitivity ($> 25\%$ return spread), high trade profit concentration ($\ge 80\%$), or collapses under adverse slippage.
4. **`INSUFFICIENT_DATA`**:
   - Dataset length $< 60$ bars or total completed trades $< 5$.
5. **`FAILED`**:
   - Negative out-of-sample return while in-sample was positive (curve-fitting signature), or net unprofitable under standard friction.

---

## 7. AUTOMATED VERIFICATION EVIDENCE

A comprehensive test suite of 14 dedicated validation tests in `StrategyValidationEngine.test.ts` validates all anti-overfitting mechanisms:

```
✓ src/lib/analysis/backtest/__tests__/StrategyValidationEngine.test.ts (14 tests)
  ✓ 1. Chronological Dataset Partitioning
    ✓ enforces minimum bar requirements (fails closed if < 60 bars)
    ✓ partitions candles strictly chronologically into Train < Validation < Test with zero overlap
  ✓ 2. In-Sample vs Out-of-Sample (OOS) Verification
    ✓ compares performance metrics between train and test datasets
    ✓ handles invalid or empty split gracefully
  ✓ 3. Walk-Forward Rolling Windows
    ✓ executes rolling chronological windows with isolated test periods
  ✓ 4. Realistic Friction Stress Testing
    ✓ evaluates BASE, BASE_PLUS_SLIPPAGE, and HIGH_SLIPPAGE scenarios
  ✓ 5. Parameter Sensitivity Perturbation
    ✓ evaluates parameter perturbations for Trend Following strategy
    ✓ evaluates parameter perturbations for Breakout Confirmation strategy
    ✓ evaluates parameter perturbations for Mean Reversion strategy
  ✓ 6. Market Regime Detector & Robustness
    ✓ detects regime without look-ahead bias using strictly candles up to T
    ✓ evaluates performance categorized by market regime
  ✓ 7. Trade Concentration & Distribution Analysis
    ✓ calculates trade distribution and detects concentration risk
  ✓ 8. Sample Size Assessment
    ✓ classifies trade counts into confidence tiers
  ✓ 9. Complete Strategy Robustness Report
    ✓ synthesizes a complete deterministic research report conforming to Phase 17.7 contract
```

**Full Test Suite Result**:
- Test Files: **45 passed (45)**
- Total Tests: **720 passed (720)**
- TypeScript Compiler: **0 errors** (`tsc --noEmit` pass)
- Production Files Modified: **2** (`TrendFollowingBacktest.ts`, `backtest/index.ts`)
- Production Files Added: **3** (`validation/types.ts`, `validation/RegimeDetector.ts`, `validation/StrategyValidationEngine.ts`)

---

## 8. DEPLOYMENT & INTEGRATION GUIDANCE

1. **Recommendation Engine Integration**:
   - Phase 17 Recommendation Engine should query `StrategyValidationEngine` to ensure that only strategies with a verdict of `ROBUST` or `CONDITIONALLY_ROBUST` (under verified regime conditions) are promoted into active investment signals.
2. **Paper Trading Risk Guard (Phase 18)**:
   - Signals from strategies flagged with `concentrationRiskFlag` or `isFrictionFragile` must be rejected by `RiskGuard`.
3. **Continuous Re-Validation**:
   - In production, validation reports should be generated deterministically on rolling historical bars to monitor strategy decay over time.
