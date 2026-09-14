# 05 — PORTFOLIO INTELLIGENCE & CAPITAL ALLOCATION RULES

**System**: VN STOCK AI PRO  
**Scope**: Portfolio Modeling, Multi-Asset Intelligence, Risk Attribution (Phase 19 and Subsequent Subsystems)  
**Status**: ENFORCED  

---

## 1. CORE PORTFOLIO ANALYSIS DOMAINS

Future Phase 19 modules and extensions must address:
- **Capital Allocation**: Mathematical determination of asset weights across cash, large-cap, mid-cap, and defensive sectors.
- **Position Sizing**: Volatility-adjusted and risk-capped sizing.
- **Sector & Thematic Exposure**: Aggregate risk breakdown across Banking, Real Estate, Securities, Materials, and Technology.
- **Asset Correlation Matrix**: Detection of high co-movement across holdings to prevent false diversification.
- **Drawdown Monitoring & Stress Testing**: Scenario analysis under market regime shocks (e.g. SBV rate hikes, global contagion).
- **Performance Attribution**: Disentangling alpha (strategy skill) from beta (broad VN-Index market returns).

---

## 2. QUANTITATIVE ALLOCATION METHODS

When implementing portfolio optimizers, prioritize robust, defensive models:

1. **Equal Weight / Core-Satellite**: High robustness baseline.
2. **Risk Parity**: Equalizing risk contribution based on realized asset volatility.
3. **Volatility Targeting**: Dynamically scaling cash reserves when portfolio volatility breaches targeted ceilings.
4. **Correlation-Aware Diversification**: Penalizing highly correlated asset pairs.
5. **Fractional Kelly Criterion**: Apply strictly with conservative safety dampeners ($0.25\times$ or $0.5\times$ Half-Kelly) and only after statistical validation.

> **RULE**: Never optimize purely for maximum theoretical return. Every objective function must penalize variance, correlation, and tail risk.

---

## 3. VIETNAMESE MARKET CONSTRAINTS & MICROSTRUCTURE

Portfolio models and execution engines MUST respect Vietnam-specific exchange microstructure:

| Microstructure Factor | Rule / Constraint in Vietnamese Markets |
|---|---|
| **Exchange Price Limits** | **HOSE**: $\pm 7.0\%$ daily band<br>**HNX**: $\pm 10.0\%$ daily band<br>**UPCOM**: $\pm 15.0\%$ daily band |
| **Trading Lot Size** | Strict $100$-share board lot multiples on HOSE/HNX (odd-lot trades separate) |
| **Settlement Cycle** | $T+2.5$ settlement (shares purchased at day $T$ are available for trading on afternoon of day $T+2$) |
| **Short Selling Constraints** | Naked short selling is prohibited under standard Vietnamese retail regulations |
| **Foreign Ownership Limits (FOL)**| Certain blue chips (e.g. FPT, MWG, MBB) frequently hit $100\%$ foreign room |
| **Liquidity Asymmetry** | Ceiling-locked stocks have no sell liquidity; floor-locked stocks have no buy liquidity |

> **RULE**: Do NOT assume US/European market mechanics (instant margin shorting, fractional shares, continuous 24-hour trading) apply to Vietnamese equities.

---

## 4. PORTFOLIO SAFETY & CONCENTRATION LIMITS

- **Sector Concentration Cap**: No single industry sector may exceed $40\%$ of total portfolio allocation.
- **Top 3 Concentration**: Top 3 holdings combined must not exceed $60\%$ of total equity.
- **Turnover & Transaction Cost Penalty**: Portfolio rebalancing models must incorporate transaction costs ($0.30\%$ round-trip friction + tax) to avoid excessive turnover churn.
