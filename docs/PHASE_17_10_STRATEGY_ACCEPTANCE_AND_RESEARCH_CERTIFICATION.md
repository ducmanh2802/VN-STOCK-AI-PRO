# PHASE 17.10 — STRATEGY ACCEPTANCE GATE & RESEARCH CERTIFICATION

## Executive Summary

Phase 17.10 establishes the final quantitative research-governance gate of **VN STOCK AI PRO Phase 17**.

Building upon the cumulative quantitative validation layers:
- **Phase 17.6**: Quant Governance Enforcement & Strategy Integrity Audit (**PASS**, 706/706 tests)
- **Phase 17.7**: Advanced Strategy Validation & Anti-Overfitting (**PASS**, 720/720 tests)
- **Phase 17.8**: Statistical Significance, Monte Carlo & Reality Check (**PASS**, 745/745 tests)
- **Phase 17.9**: Cross-Asset, Cross-Period & Cross-Regime Generalization (**PASS**, 770/770 tests)

Phase 17.10 resolves the capstone institutional question:
> **Does an already-tested strategy demonstrate sufficient empirical, statistical, anti-overfitting, and cross-regime evidence to become a legally frozen, reproducible CERTIFIED RESEARCH BASELINE that downstream Paper Trading and Risk systems may safely consume?**

The objective of Phase 17.10 is **explicitly not strategy optimization or parameter tuning**. Its mission is strict **acceptance governance**: synthesizing all prior verification tiers into a deterministic, fail-closed certification gate and issuing an immutable, cryptographically hashed **Strategy Baseline Fingerprint** (`FPR_<sha256>`).

---

## 1. Architectural Boundaries & Isolation

Phase 17.10 resides strictly inside the quantitative research and validation layer. It forms an impenetrable one-way governance membrane between research exploration and downstream execution.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE 17 RESEARCH LAYER                         │
│                                                                        │
│   Phase 17.6: Mandatory Governance Audit (Look-ahead, Friction, Det)   │
│   Phase 17.7: StrategyValidationEngine (IS/OOS, Walk-Forward, Drag)    │
│   Phase 17.8: StrategyStatisticalValidator (Monte Carlo, RealityCheck) │
│   Phase 17.9: CrossGeneralizationValidator (Asset/Period/Regime)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Evaluates Reports
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             PHASE 17.10 STRATEGY ACCEPTANCE GATE                       │
│    StrategyAcceptanceGate & Baseline Fingerprinting Engine             │
│    Status: [CERTIFIED | CONDITIONALLY_CERTIFIED | REJECTED | ...]      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Certified Baselines Only
                                    ║ IMMUTABLE GOVERNANCE MEMBRANE
                                    ▼ (No direct execution access)
┌────────────────────────────────────────────────────────────────────────┐
│                    DOWNSTREAM EXECUTION PIPELINE                       │
│       Phase 18 Paper Execution Engine | RiskGuard | OrderManager       │
└────────────────────────────────────────────────────────────────────────┘
```

### Invariants:
1. **Zero Execution Mutation**: Phase 17.10 never alters `PaperBroker`, `RiskGuard`, `OrderManager`, `Ledger`, `TradingEngine`, or live broker adapters.
2. **Deterministic & Reproducible**: Evaluates identically configured strategy runs with identical inputs to bit-exact hashes and verdicts. Zero randomness (`Math.random()` strictly prohibited).
3. **No "Score Alone" Certification**: A high heuristic score or profitability percentage cannot override a failure in hard governance checks, look-ahead bias detection, friction inclusion, or out-of-sample breakdown.
4. **Advisory AI/LLM**: AI recommendations or sentiment metrics are strictly informational and can never promote a rejected strategy or override empirical failure.
5. **Fail-Closed Default**: In the absence of complete evidence or when encountering missing mandatory reports, the gate immediately defaults to `BLOCKED`, `REJECTED`, or `INSUFFICIENT_EVIDENCE`.

---

## 2. Certification States & Hierarchy

The gate evaluates incoming strategies across a strict 5-tier fail-closed hierarchy:

| Status | Definition | Eligible for Downstream Paper Trading? | Baseline Emitted? |
| :--- | :--- | :---: | :---: |
| **`BLOCKED`** | Violates mandatory quantitative governance (look-ahead detected, missing transaction friction, non-deterministic execution, or missing mandatory audit). | **NO** | `null` |
| **`REJECTED`** | Hard failure in statistical significance, severe out-of-sample collapse, profit concentration, or cross-market fragility. | **NO** | `null` |
| **`INSUFFICIENT_EVIDENCE`** | Inadequate statistical sample size ($N < 30$ trades), missing validation phases, or unvalidated multi-market data. | **NO** | `null` |
| **`CONDITIONALLY_CERTIFIED`** | Passes all hard gates, but carries documented empirical boundaries (e.g. low statistical power $30 \le N < 50$, single-regime dependence, or asset-specific performance). | **YES (Restricted)** | **YES** |
| **`CERTIFIED`** | Passes all governance, anti-overfitting, statistical significance, and multi-dimensional generalization gates without caveats. | **YES (Full)** | **YES** |

### Decision Priority Ladder:
1. **`BLOCKED` Evaluation**: Look-ahead detected $\to$ `BLOCKED`. Zero friction $\to$ `BLOCKED`. Non-deterministic $\to$ `BLOCKED`.
2. **`REJECTED` Evaluation**: Negative net profit $\to$ `REJECTED`. OOS degradation $\to$ `REJECTED`. Friction fragility $\to$ `REJECTED`. Edge collapse without top 3 trades $\to$ `REJECTED`. Inconclusive noise $\to$ `REJECTED`. Parameter fragility $\to$ `REJECTED`.
3. **`INSUFFICIENT_EVIDENCE` Evaluation**: $N < 30$ trades $\to$ `INSUFFICIENT_EVIDENCE`. Missing Phase 17.7 or 17.8 report $\to$ `INSUFFICIENT_EVIDENCE`.
4. **`CONDITIONALLY_CERTIFIED` Evaluation**: $30 \le N < 50$ trades, borderline reality check, bootstrap CI spans zero, or regime/asset dependence $\to$ `CONDITIONALLY_CERTIFIED`.
5. **`CERTIFIED` Evaluation**: Complete clean validation across all dimensions $\to$ `CERTIFIED`.

---

## 3. Comprehensive Certification Matrix

Every candidate strategy must pass the following multi-dimensional audit matrix:

| Verification Dimension | Metric / Target Requirement | Failure Consequence |
| :--- | :--- | :--- |
| **Governance & Integrity** | Zero look-ahead; strictly historical chronological order. | Immediate `BLOCKED` |
| **Friction Completeness** | Commission (0.15%), Tax (0.10%), Slippage (0.10%) enforced. | Immediate `BLOCKED` |
| **Execution Determinism** | Seeded deterministic PRNG; identical trades on repeated runs. | Immediate `BLOCKED` |
| **Trade Sample Size** | $N \ge 30$ trades minimum ($N \ge 50$ for full certification). | $N < 30 \to$ `INSUFFICIENT_EVIDENCE`; $30 \le N < 50 \to$ `CONDITIONALLY_CERTIFIED` |
| **Profitability & Expectancy** | Net profit $> 0$, mean expectancy $> 0$ net of all friction. | Immediate `REJECTED` |
| **OOS Performance Retention** | OOS return $> 0$; degradation ratio $\le 50\%$ from in-sample. | Immediate `REJECTED` |
| **Walk-Forward Stability** | Rolling window profitability $\ge 50\%$ of evaluated windows. | Immediate `REJECTED` |
| **Friction Resilience** | Survives $1.5\times$ base commission and slippage stress testing. | Immediate `REJECTED` |
| **Parameter Stability** | Stable across $\pm 10\text{--}20\%$ indicator parameter shifts. | Overfit parameter flag $\to$ `REJECTED` |
| **Profit Concentration** | Top 1 trade $< 50\%$ profit; Top 3 trades $< 80\%$ profit. | Severe concentration $\to$ `REJECTED` |
| **Outlier Resilience** | Strategy remains net profitable when top 3 trades excluded. | Edge collapse $\to$ `REJECTED` |
| **Reality Check / Null Test** | Bootstrap reality check $p$-value $\le 0.05$ (or $\le 0.20$ for conditional). | Inconclusive noise $\to$ `REJECTED` |
| **Cross-Regime Generalization**| Viable in bull and sideways regimes; not fragile in bear. | Regime-dependent $\to$ `CONDITIONALLY_CERTIFIED` |

---

## 4. Deterministic Baseline Fingerprint (`FPR_<sha256>`)

To prevent "phantom research" and configuration drift, Phase 17.10 implements bit-exact cryptographic baseline fingerprinting via `StrategyAcceptanceGate.computeBaselineFingerprint`:

```ts
FPR_<sha256(canonicalSerialize({
  strategyId,
  strategyVersion,
  parameters,
  universe,
  benchmark,
  frictionAssumptions: {
    makerFeeBps,
    takerFeeBps,
    slippageBps,
    taxBps,
    financingRateBps,
  },
  datasetIdentity: {
    symbol,
    timeframe,
    startDate,
    endDate,
    totalBars,
    datasetChecksum,
  },
  validationScope: {
    hasAntiOverfittingReport,
    hasStatisticalReport,
    hasGeneralizationReport,
  },
}))>
```

### Fingerprint Properties:
- **Canonical Serialization**: Object keys sorted recursively; floating point numbers formatted consistently; strings trimmed.
- **Sensitivity**: Any modification to a strategy indicator parameter, friction assumption, asset universe, date range, or dataset checksum immediately generates a completely different fingerprint, instantly invalidating the prior baseline.
- **Verification Utility**: Downstream engines invoke `StrategyAcceptanceGate.verifyBaselineIntegrity(baseline, currentInput)` to ensure zero drift before paper order routing.

---

## 5. Certified Research Baseline Contract

When a strategy achieves `CERTIFIED` or `CONDITIONALLY_CERTIFIED`, the gate generates a frozen, immutable `CertifiedStrategyBaseline`:

```ts
export interface CertifiedStrategyBaseline {
  readonly baselineId: string;                     // "BASE_TREND_FOLLOWING_V1_<hash8>"
  readonly baselineFingerprint: string;            // "FPR_<sha256>"
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly strategyName: string;
  readonly certificationStatus: 'CERTIFIED' | 'CONDITIONALLY_CERTIFIED';
  readonly certifiedAt: string;                    // ISO timestamp
  readonly gateVersion: string;                    // "17.10.0"
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly universe: readonly string[];
  readonly frictionAssumptions: BaselineFrictionAssumptions;
  readonly datasetIdentity: BaselineDatasetIdentity;
  readonly performanceBaseline: BaselinePerformanceMetrics;
  readonly operationalEnvelope: OperationalEnvelope;
  readonly allowedExecutionModes: readonly ('PAPER' | 'BACKTEST_REPLAY')[];
  readonly mandatoryPreconditions: readonly string[];
  readonly documentedLimitations: readonly string[];
}
```

### 5.1 Operational Envelope
The operational envelope defines hard guardrails that downstream execution engines must monitor in real-time:
- `maxDrawdownThresholdPct`: Baseline MDD $\times 1.35$ (hard paper circuit breaker)
- `maxConsecutiveLosses`: Worst observed loss streak $+ 2$
- `expectedWinRatePct` & `minAcceptableWinRatePct`: Realized win rate bound
- `expectedTradeCountPerYear`: Trade pacing benchmark
- `maxLeverage`: Vietnam regulations restrict cash/margin limits
- `prohibitedRegimes`: Regimes where the strategy is banned from opening positions (e.g. `['HIGH_VOLATILITY', 'BEAR_TREND']`)
- `requiredMarketConditions`: Minimum trading volume and liquidity prerequisites

---

## 6. Auditability & Drift Detection

Downstream systems (e.g. Phase 18 Paper Execution Engine) must never execute a strategy without verifying baseline integrity:

```ts
const integrity = StrategyAcceptanceGate.verifyBaselineIntegrity(certifiedBaseline, candidateInput);
if (!integrity.isValid) {
  // Halt execution immediately - configuration or market data drift detected
  logger.error(`Baseline Drift Detected: ${integrity.driftReasons.join('; ')}`);
}
```

### Detectable Drift Vectors:
1. **Parameter Drift**: Strategy hyperparameters adjusted after certification.
2. **Friction Erosion**: Transaction fees or taxes reduced below certified minimums.
3. **Dataset Invalidation**: Backtest time horizon truncated or altered.
4. **Fingerprint Mismatch**: Cryptographic SHA-256 mismatch against registered research baseline.

---

## 7. Verification & Test Coverage

The Strategy Acceptance Gate was comprehensively validated via Vitest in `StrategyAcceptanceGate.test.ts`:

```
Test Files  48 passed (48)
Tests       805 passed (805)
Duration    16.79s
```

### Test Suite Breakdown for Phase 17.10 (`StrategyAcceptanceGate.test.ts`):
- **Category 1: Mandatory Governance Audit**:
  - Blocks strategy if look-ahead bias is detected (`BLOCKED`).
  - Blocks strategy if transaction friction is zero or bypassed (`BLOCKED`).
  - Blocks strategy if execution is non-deterministic (`BLOCKED`).
  - Blocks strategy if governance audit report is missing (`BLOCKED`).
- **Category 2: Sample Size & Statistical Significance**:
  - Rejects with `INSUFFICIENT_EVIDENCE` if trade sample size $< 30$.
  - Rejects (`REJECTED`) if net profit $\le 0$.
  - Rejects (`REJECTED`) if edge collapses without top 3 trades.
  - Rejects (`REJECTED`) if reality check confirms performance is indistinguishable from random noise ($p > 0.20$).
  - Grants `CONDITIONALLY_CERTIFIED` if sample size is between 30 and 49 trades.
  - Grants `CONDITIONALLY_CERTIFIED` if bootstrap 95% confidence interval spans zero.
- **Category 3: Anti-Overfitting, OOS Stability & Friction Resilience**:
  - Rejects (`REJECTED`) if out-of-sample performance collapses (`isOosDegraded`).
  - Rejects (`REJECTED`) if walk-forward window stability fails ($< 50\%$ profitable windows).
  - Rejects (`REJECTED`) if strategy is fragile to friction stress ($1.5\times$ base cost).
  - Rejects (`REJECTED`) if indicator parameter sensitivity exhibits extreme fragility.
  - Rejects (`REJECTED`) if severe profit concentration is detected ($> 50\%$ in top 1 or $> 80\%$ in top 3).
- **Category 4: Multi-Dimensional Generalization**:
  - Grants `CONDITIONALLY_CERTIFIED` if strategy generalizes conditionally across assets or regimes.
  - Grants `CONDITIONALLY_CERTIFIED` with operational envelope constraints if strategy is regime-dependent.
  - Grants `CONDITIONALLY_CERTIFIED` if strategy is asset-dependent.
  - Rejects (`REJECTED`) if strategy fails generalization completely across all dimensions (`DOES_NOT_GENERALIZE`).
- **Category 5: Baseline Fingerprinting & Drift Detection**:
  - Generates deterministic SHA-256 fingerprint (`FPR_...`) for identical strategy inputs.
  - Changes fingerprint if any parameter is altered.
  - Changes fingerprint if transaction friction assumptions are altered.
  - Changes fingerprint if dataset identity or timeframe is altered.
  - Successfully verifies baseline integrity when candidate matches certified baseline.
  - Detects baseline drift and returns reasons when parameters differ.
  - Detects baseline drift when friction assumptions are relaxed.
- **Category 6: Full Certification & Downstream Isolation**:
  - Emits full `CERTIFIED` status and complete `CertifiedStrategyBaseline` for clean candidate.
  - Generates robust operational envelope with drawdown thresholds and circuit breakers.
  - Enforces fail-closed behavior on missing validation reports (`INSUFFICIENT_EVIDENCE`).
  - Strict research layer isolation: zero mutation of trading execution or live components.

---

## 8. Files Created and Modified

1. **`src/lib/analysis/backtest/validation/acceptanceTypes.ts`** *(NEW)*
   - Formal TypeScript definitions for `StrategyCertificationStatus`, `StrategyAcceptanceGateInput`, `StrategyCertification`, `CertifiedStrategyBaseline`, `OperationalEnvelope`, `BaselineFrictionAssumptions`, `BaselineDatasetIdentity`, `MandatoryGovernanceAudit`, and `BaselineIntegrityVerificationResult`.
2. **`src/lib/analysis/backtest/validation/StrategyAcceptanceGate.ts`** *(NEW)*
   - Core static class containing `evaluate(input)`, `computeBaselineFingerprint(input)`, and `verifyBaselineIntegrity(baseline, input)`.
   - Incorporates canonical object serialization and SHA-256 hashing via `snapshotHash.ts`.
3. **`src/lib/analysis/backtest/validation/index.ts`** *(UPDATED)*
   - Exports all types and utilities from `acceptanceTypes.ts` and `StrategyAcceptanceGate.ts`.
4. **`src/lib/analysis/backtest/__tests__/StrategyAcceptanceGate.test.ts`** *(NEW)*
   - 35 comprehensive, deterministic integration test cases validating every gate branch and fail-closed rule.
5. **`docs/PHASE_17_10_STRATEGY_ACCEPTANCE_AND_RESEARCH_CERTIFICATION.md`** *(NEW)*
   - Formal research-governance engineering report.

---

## 9. Next Steps / Phase 18 Connection

Phase 17 is now complete. The quantitative validation foundation guarantees that no uncertified, overfitted, or statistically suspect strategy can enter production simulation.

In **Phase 18 (Paper Trading & Execution Realism)**:
1. **Baseline Consumption**: The `PaperExecutionEngine` will accept *only* verified `CertifiedStrategyBaseline` instances possessing a valid `FPR_<sha256>` fingerprint.
2. **Operational Guardrails**: Real-time monitoring will enforce the baseline's `OperationalEnvelope` (`maxDrawdownThresholdPct`, `maxConsecutiveLosses`, `prohibitedRegimes`).
3. **Reconciliation**: Continuous comparison of paper execution fills against certified research baseline expectancy to detect execution slippage and alpha decay.
