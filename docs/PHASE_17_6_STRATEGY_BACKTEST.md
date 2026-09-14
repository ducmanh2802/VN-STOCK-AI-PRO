# PHASE 17.6 — STRATEGY BACKTEST & HISTORICAL VERIFICATION

**System**: VN STOCK AI PRO  
**Module**: Strategy Backtesting & Statistical Verification Subsystem  
**Status**: ACTIVE / VERIFIED  
**Version**: 17.6.0  

---

## 1. OBJECTIVE

Phase 17.6 establishes an independent, quantitative historical verification subsystem to evaluate whether the deterministic investment strategies developed in Phase 17 generate statistically sound trading signals when tested against **real historical market data** from Vietnamese equities.

### Core Quantitative Directives:
- **No Mock / Synthetic Data**: Historical series originate directly from real market data providers (`KBS`, `VPS`).
- **Zero Look-Ahead Bias**: Execution and indicator calculations strictly isolate past information up to step $T$.
- **Realistic Execution Friction**: Explicit modelling of Vietnamese brokerage commissions ($0.15\%$), selling tax ($0.10\%$), execution slippage ($0.10\%$), and board lot rules ($100$ shares).
- **Decoupled Architecture**: Read-only consumption of market data without mutating live ledgers, paper trading balances, or RiskGuard invariants.

---

## 2. ARCHITECTURE OVERVIEW

```text
       ┌────────────────────────────────────────────────────────┐
       │     Real Historical Market Data (KBS / VPS Feeds)      │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                 BacktestDataAdapter                    │
       │   - Fail-Closed OHLCV Validation                       │
       │   - Chronological Ordering & Deduplication             │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                   LookAheadGuard                       │
       │   - Slices candles strictly to [0...T]                 │
       │   - Freezes immutable context for strategy evaluation │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                 Strategy Evaluation                    │
       │   - Trend Following (MA20/50 + RSI)                    │
       │   - Breakout Confirmation (Resistance + Volume + RSI)  │
       │   - Mean Reversion (Bollinger Bands + RSI)             │
       │   => Signal generated at Candle T Close                │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                   TradeSimulator                       │
       │   - Order queued at T Close -> Executed at T+1 Open    │
       │   - Slippage + Commission (Buy/Sell) + VN Tax (Sell)   │
       │   - Board Lot (100 shares) & Cash Conservation         │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │            PerformanceMetricsCalculator                │
       │   - Total Return, Max Drawdown, Win Rate, Profit Factor│
       │   - Sharpe / Sortino Ratios, Holding Days, CAGR        │
       └────────────────────────────────────────────────────────┘
```

---

## 3. REAL DATA SOURCES & ADAPTERS

The subsystem consumes historical data through `BacktestDataAdapter`:
- **Provider**: KBS Historical OHLCV (`kbbuddywts.kbsec.com.vn data_day`) via `getHistoricalStockData()`.
- **Validation Rules**:
  1. Prices must be finite and $> 0$.
  2. Volume must be $\ge 0$.
  3. Geometric invariants: $High \ge \max(Open, Close)$ and $Low \le \min(Open, Close)$.
  4. Timestamps must be valid ISO dates and strictly chronologically sorted.
  5. Duplicate timestamps or unsorted series are rejected immediately (*fail closed*).

---

## 4. STRATEGY DEFINITIONS

### A. Trend Following Strategy (`TrendFollowingBacktestStrategy`)
- **Indicators**: SMA20, SMA50, RSI (14-period).
- **Min Lookback**: 50 bars.
- **Entry Rules (Candle T Close)**:
  - $Close_T > SMA20_T$
  - $SMA20_T > SMA50_T$
  - $RSI_T \ge 50$
- **Exit Rules**:
  - $Close_T < SMA20_T$ OR $SMA20_T < SMA50_T$.
- **Risk Parameters**: Initial Stop Loss at $4\%$ below SMA20; Take Profit at $+15\%$.

### B. Breakout Confirmation Strategy (`BreakoutConfirmationBacktestStrategy`)
- **Base Formation**: 20-session consolidation window.
- **Resistance Calculation**: Highest High of prior 20 sessions **strictly excluding** current candle ($i - 20 \dots i - 1$).
- **Entry Rules (Candle T Close)**:
  - Price Breakout: $Close_T > Resistance$.
  - Volume Expansion: $Volume_T \ge 1.3 \times \text{Average Prior Volume}$.
  - Trend Confirmation: $Close_T \ge SMA20_T$.
  - Momentum Confirmation: $RSI_T \ge 50$.
- **Exit Rules**:
  - $Close_T < SMA20_T$ or trailing stop breach.
- **Risk Parameters**: Stop loss anchored to prior resistance (now support).

### C. Mean Reversion Strategy (`MeanReversionBacktestStrategy`)
- **Indicators**: Bollinger Bands ($20$-period, $2.0$ std dev), RSI ($14$-period).
- **Entry Rules (Candle T Close)**:
  - Price at or below lower band ($Close_T \le LowerBand_T \times 1.01$ or $\%b \le 0.15$).
  - Oversold momentum: $RSI_T \le 35$.
- **Exit Rules**:
  - Reversion to Mean: $Close_T \ge MiddleBand_T$ (SMA20) OR $RSI_T \ge 55$.
- **Risk Parameters**: Stop Loss $5\%$ below lower band.

---

## 5. ENTRY / EXIT TIMING & LOOK-AHEAD BIAS PROTECTION

### Strict Execution Timing:
1. **Signal Timestamp**: Generated at the **Close of Candle $T$** when all intra-day and closing values are finalized.
2. **Execution Timestamp**: Queued and executed at the **Open of Candle $T+1$**.
3. **Execution Price**:
   - Buy Execution: $Open_{T+1} \times (1 + \text{SlippageRate})$
   - Sell Execution: $Open_{T+1} \times (1 - \text{SlippageRate})$
4. **Intra-bar Stop/Target**: If $Low_{T+1} \le StopLoss$, filled at $\min(Open_{T+1}, StopLoss \times (1 - \text{SlippageRate}))$.

### LookAheadGuard Mechanism:
- Strategies receive an immutable `HistoricalContext` containing `candlesToDate` sliced strictly to $[0 \dots T]$.
- Future candles ($T+1 \dots N$) are completely inaccessible in memory.

---

## 6. COMMISSION, TAX, & SLIPPAGE ASSUMPTIONS

| Parameter | Default Value | Notes |
|---|---|---|
| **Initial Capital** | Configurable (e.g. 100,000,000 VND) | Enforces non-negative cash balances |
| **Buy Commission** | $0.15\%$ ($0.0015$) | Standard broker fee |
| **Sell Commission** | $0.15\%$ ($0.0015$) | Standard broker fee |
| **Sell Tax** | $0.10\%$ ($0.0010$) | Statutory Vietnamese securities transfer tax |
| **Slippage** | $0.10\%$ ($0.0010$) | Slippage added to buys and subtracted from sells |
| **Board Lot** | $100$ shares | Order sizes rounded down to integer multiples of 100 |

---

## 7. PERFORMANCE METRICS

Implemented deterministically in `PerformanceMetricsCalculator`:
- **Total Return %**: $\frac{\text{Final Capital} - \text{Initial Capital}}{\text{Initial Capital}} \times 100$
- **Win Rate %**: $\frac{\text{Winning Trades}}{\text{Total Trades}} \times 100$
- **Profit Factor**: $\frac{\text{Gross Profits}}{\text{Gross Losses}}$ (returns `null` when no losses exist)
- **Max Drawdown % & Amount**: Peak-to-trough drop evaluated across all bars in the equity curve.
- **Average Holding Period**: Mean sessions elapsed per trade.
- **Sharpe Ratio**: Annualized return over return standard deviation (returns `null` if $< 2$ trades or variance $= 0$).
- **Sortino Ratio**: Annualized return over downside semi-variance.
- **CAGR %**: Compound annual growth rate across trading duration.

---

## 8. HOW TO RUN TESTS & BACKTESTS

### Run Test Suite:
```bash
npx vitest run src/lib/analysis/backtest/__tests__/
```

### Run a Programmatic Backtest:
```typescript
import {
  BacktestEngine,
  BacktestDataAdapter,
  TrendFollowingBacktestStrategy,
  type BacktestConfig,
} from './src/lib/analysis/backtest';

// 1. Fetch real historical candles
const { valid, candles } = await BacktestDataAdapter.fetchRealCandles('HPG', '1Y');

if (valid) {
  // 2. Configure backtest
  const config: BacktestConfig = {
    symbol: 'HPG',
    initialCapital: 100_000_000, // 100M VND
    commissionRate: 0.0015,
    slippageRate: 0.0010,
    sellTaxRate: 0.0010,
    positionSizePct: 1.0,
    boardLot: 100,
  };

  // 3. Execute deterministic backtest
  const strategy = new TrendFollowingBacktestStrategy();
  const result = BacktestEngine.run(strategy, candles, config);

  console.log(`Total Return: ${result.metrics.totalReturnPct}%`);
  console.log(`Win Rate: ${result.metrics.winRatePct}% (${result.metrics.totalTrades} trades)`);
  console.log(`Max Drawdown: ${result.metrics.maxDrawdownPct}%`);
}
```

---

## 9. KNOWN LIMITATIONS & DISCLAIMERS

1. **Past Performance Disclaimer**: Backtested historical returns are strictly mathematical verifications of model behavior on past data and do not guarantee future performance in live markets.
2. **KBS History Horizon**: The KBS historical provider limits lookback windows to approximately 355 trading sessions (~1 year). Multi-year simulations require archival tick/daily bar datasets.
3. **Liquidity Assumptions**: Simulation assumes market fills at $T+1$ Open with standard slippage; extreme illiquid stocks or ceiling/floor locked sessions may face wider execution delays in real trading.
