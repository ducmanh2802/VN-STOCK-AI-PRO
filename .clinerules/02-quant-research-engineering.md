# 02 — QUANTITATIVE RESEARCH & BACKTESTING ENGINEERING STANDARDS

**System**: VN STOCK AI PRO  
**Scope**: Strategy Verification, Backtesting Subsystems, Indicator Modeling (Phases 17, 18, 19)  
**Status**: ENFORCED  

---

## 1. MATHEMATICAL DETERMINISM

All quantitative strategies, indicator computations, scoring algorithms, and backtest simulators MUST be **100% deterministic**:
- $\text{Function}(\text{Data}, \text{Config}) \equiv \text{Identical Output}$ across repeated runs.
- **Forbidden**: `Math.random()`, seeded pseudo-random noise, asynchronous race conditions, or unseeded shuffling.
- **Clock Isolation**: Never query `Date.now()` or `new Date()` inside strategy evaluation; use the timestamp from the historical bar context.

---

## 2. STRICT LOOK-AHEAD BIAS PREVENTION

1. **Context Isolation**:
   - At bar $T$, strategy algorithms are strictly limited to the candlestick array $[0 \dots T]$.
   - Context objects must be frozen via `Object.freeze()` or sliced defensively using `LookAheadGuard`.
2. **Exclusion of Future Bars**:
   - Indicator series (e.g. SMA, RSI, MACD, Bollinger Bands) must be computed using only available data up to step $T$.
   - Never use center-aligned moving averages or future pivot points.

---

## 3. REALISTIC EXECUTION TIMING MECHANICS

Backtesting engines must model realistic market latency and order execution:

```text
Candle T (09:15 - 15:00) ──────► Candle T Close (15:00) ──────► Order Queued (Post-Close)
                                                                       │
                                                                       ▼
Candle T+1 (09:15 Open) ◄───────────────────────────────────── Order Executed at T+1 Open
```

### Execution Rules:
- **Signal Generation**: Occurs at the **Close of Candle $T$** (when closing prices and volumes are finalized).
- **Order Execution**: Queued for and filled at the **Open of Candle $T+1$**.
- **Execution Price**:
  - Long Entry: $Open_{T+1} \times (1 + \text{SlippageRate})$
  - Long Exit: $Open_{T+1} \times (1 - \text{SlippageRate})$
- **Prohibited Practice**: Never execute orders at the close of Candle $T$ if that candle's close was required to generate the signal.

---

## 4. REALISTIC FRICTION & TRANSACTION COST MODELING

Backtest engines MUST explicitly deduct real market friction:
1. **Brokerage Commission**: Deducted on both entry ($0.15\%$) and exit ($0.15\%$).
2. **Vietnamese Securities Transfer Tax**: Deducted from gross sell proceeds ($0.10\%$).
3. **Execution Slippage**: Added to entry price and deducted from exit price ($0.10\%$).
4. **Board Lot Constraints**: Order quantities MUST be rounded down to standard Vietnamese board lots ($100$ shares).
5. **Cash Solvency**: Cash balances must never become negative (no unbacked margin).

---

## 5. REQUIRED QUANTITATIVE PERFORMANCE METRICS

Backtest and strategy verification engines must compute the following metrics deterministically:

| Metric | Calculation / Definition | Edge Case Handling |
|---|---|---|
| **Total Return %** | $\frac{\text{Final Capital} - \text{Initial Capital}}{\text{Initial Capital}} \times 100$ | Exact floating point format |
| **Win Rate %** | $\frac{\text{Winning Trades}}{\text{Total Trades}} \times 100$ | $0\%$ if zero trades |
| **Profit Factor** | $\frac{\sum \text{Gross Profit}}{\sum \text{Gross Loss}}$ | Return `null` if $\sum \text{Loss} = 0$ |
| **Max Drawdown %** | $\max_{t} \left( \frac{\text{Peak}_t - \text{Equity}_t}{\text{Peak}_t} \right) \times 100$ | $0\%$ if monotonically increasing |
| **Max Drawdown Amount** | Peak-to-trough absolute currency loss | $0$ if monotonically increasing |
| **Sharpe Ratio** | Annualized $\frac{\text{Mean Return} - R_f}{\sigma_{\text{returns}}}$ | Return `null` if $< 2$ trades or $\sigma = 0$ |
| **Sortino Ratio** | Annualized $\frac{\text{Mean Return} - R_f}{\sigma_{\text{downside}}}$ | Return `null` if no downside variance |
| **Average Holding Days** | Mean market sessions elapsed per position | Return $0$ if zero trades |
| **CAGR %** | Compound Annual Growth Rate over test duration | Return `null` if duration $< 30$ days |

> **RULE**: Never output `NaN` or unhandled `Infinity` in JSON or UI representations. Use explicit `null` or structured error states.

---

## 6. OVERFITTING MITIGATION & ROBUSTNESS

- Encourage walk-forward validation and multi-stock universe testing (e.g. VN30 basket).
- Verify strategy behavior across bull, bear, and sideways regimes.
- Parameter sensitivity testing: Avoid brittle strategies that collapse if a moving average window changes from 20 to 21.
