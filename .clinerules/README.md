# QUANTITATIVE ENGINEERING RULES & GOVERNANCE SYSTEM

**System**: VN STOCK AI PRO  
**Module**: AI Coding Agent Rules & Engineering Skills (.clinerules)  
**Target Environment**: Kilo Code / Cline / Antigravity Agent  
**Version**: 1.0.0  

---

## 1. PURPOSE OF THE SKILL SYSTEM

The `.clinerules` directory establishes a centralized, binding governance framework for all AI coding agents working on **VN STOCK AI PRO**.

Its purpose is to guarantee that all future engineering on:
- **Phase 17**: Strategy Engine, Technical Analysis, Recommendations, Backtesting.
- **Phase 18**: Paper Trading, Order Management, RiskGuard, State Replay, Financial Conservation.
- **Phase 19**: Macro Intelligence, Portfolio Intelligence, Multi-Asset Allocation.
- **Subsequent Phases**: Live integration, Risk monitoring, Advanced Analytics.

consistently adheres to mathematical rigor, fail-closed data validation, real market data sourcing, and zero-compromise trading safety.

---

## 2. RULES MAPPING & PHASE APPLICABILITY

| Rule Document | Core Focus | Applicable Phases |
|---|---|---|
| [`00-core-project-rules.md`](./00-core-project-rules.md) | Universal development, safety, anti-mock, and agent workflow principles | **All Phases** |
| [`01-market-data-integrity.md`](./01-market-data-integrity.md) | Real data sourcing (KBS/VPS/VNDIRECT), OHLCV validation invariants, data provenance | **Phases 17, 18, 19** |
| [`02-quant-research-engineering.md`](./02-quant-research-engineering.md) | Determinism, look-ahead bias prevention, execution timing ($T+1$ Open), metrics | **Phases 17, 18, 19** |
| [`03-strategy-engine-architecture.md`](./03-strategy-engine-architecture.md) | Strategy modularity, standard signal contract, multi-horizon rules, breakout confirmation | **Phase 17** |
| [`04-trading-risk-integrity.md`](./04-trading-risk-integrity.md) | Mandatory pipeline, fail-closed RiskGuard, ledger conservation, replay determinism | **Phases 18, 19** |
| [`05-portfolio-intelligence.md`](./05-portfolio-intelligence.md) | Allocation models, Vietnam market constraints ($\pm 7\%/10\%/15\%$, $T+2.5$, board lots) | **Phase 19+** |

---

## 3. HOW AI AGENTS (CLINE / KILO CODE) MUST USE THESE RULES

When an AI agent receives a task prompt:

1. **Rule Ingestion**:
   - Consult `00-core-project-rules.md` as the baseline.
   - Inspect the phase-specific rules corresponding to the active task (e.g. `03` for recommendations, `04` for paper trading).
2. **Pre-Implementation Inspection**:
   - Verify existing types, services, and tests before creating new code.
   - Never duplicate existing indicator math or data providers.
3. **Execution Guardrails**:
   - Strictly prohibit mock/synthetic data in production code paths.
   - Never bypass `TradingDataValidator` or `RiskGuard`.
   - Never execute signals at the same candle close that generated them.
4. **Post-Implementation Verification**:
   - Run typechecking (`tsc --noEmit`) and all unit test suites (`npm test`).
   - Confirm 100% green status and report results transparently.

---

## 4. WHY DETERMINISTIC QUANTITATIVE ENGINEERING IS MANDATORY

Financial and quantitative trading systems cannot tolerate non-deterministic or unvalidated software behavior. In VN STOCK AI PRO:
- **Capital Safety**: Buggy calculations or bypassed risk checks can lead to catastrophic losses in live environments.
- **Statistical Validity**: Strategies verified with look-ahead bias or synthetic data provide illusory performance that collapses in real markets.
- **Auditability**: Regulators, quants, and investors require explainable, reproducible signal histories and mathematically conserved ledgers.
