# 03 — STRATEGY ENGINE & RECOMMENDATION ARCHITECTURE

**System**: VN STOCK AI PRO  
**Scope**: Strategy Evaluation, Scoring, Multi-Horizon Recommendation (Phase 17 Subsystems)  
**Status**: ENFORCED  

---

## 1. END-TO-END STRATEGY PIPELINE

The recommendation and strategy engine follows a strict multi-tier pipeline:

```text
               Real Market Data (KBS / VPS)
                             │
                             ▼
                 Technical Indicators Engine
           (SMA, EMA, RSI, MACD, Bollinger, ATR)
                             │
                             ▼
             Independent Strategy Signal Modules
   (Trend Following, Breakout, Mean Reversion, Valuation)
                             │
                             ▼
                   Strategy Validation Layer
        (Lookback check, Sanity check, Volatility)
                             │
                             ▼
                    Strategy Scorer Engine
           (Weighted multi-factor score: 0 to 100)
                             │
                             ▼
               Multi-Horizon Classification Layer
                    (SHORT / MEDIUM / LONG)
                             │
                             ▼
             Recommendation Synthesis Engine
               (BUY / ACCUMULATE / HOLD / SELL)
                             │
                             ▼
                 Risk Validation / RiskGuard
```

---

## 2. MODULAR STRATEGY SEPARATION

Each investment strategy MUST be implemented in an isolated, independently testable class or pure function:

1. **Trend Following (`STRATEGY_TREND_FOLLOWING`)**:
   - Focus: Directional persistence, moving average alignment (MA20 > MA50 > MA200), positive momentum.
2. **Breakout Confirmation (`STRATEGY_BREAKOUT_CONFIRMATION`)**:
   - Focus: Prior consolidation base, resistance breakout, volume expansion ($\ge 1.3\times$), trend and RSI confirmation.
3. **Mean Reversion (`STRATEGY_MEAN_REVERSION`)**:
   - Focus: Oversold extremes, Bollinger Band touches ($\%b \le 0.15$), RSI pullback with reversion target at SMA20.
4. **Fundamental Valuation (`STRATEGY_FUNDAMENTAL_VALUATION`)**:
   - Focus: P/E, P/B vs historical industry norms, ROE, FCF yield, enterprise valuation multiples.

> **RULE**: Do not merge distinct strategies into a single monolithic script. Use composable strategy interfaces.

---

## 3. UNIFIED STRATEGY CONTRACT

Every strategy signal emitted MUST satisfy the standard contract:

```typescript
export interface StandardStrategySignal {
  readonly strategyId: string;
  readonly symbol: string;
  readonly horizon: 'SHORT' | 'MEDIUM' | 'LONG';
  readonly action: 'BUY' | 'SELL' | 'HOLD';
  readonly confidence: number;         // Range: 0.0 to 1.0
  readonly score: number;              // Range: 0 to 100
  readonly entryPrice: number;
  readonly stopLoss: number | null;
  readonly targetPrice: number | null;
  readonly generatedTimestamp: string;
  readonly marketDataTimestamp: string;
  readonly reasons: readonly string[]; // Human and machine-readable explainability
  readonly metadata: Readonly<Record<string, unknown>>;
}
```

---

## 4. MULTI-HORIZON ALLOCATION RULES

| Horizon | Primary Focus & Models | Invalidation Criteria |
|---|---|---|
| **SHORT** (1-10 days) | Momentum, Breakout Confirmation, Volume spikes, Intra-week Support/Resistance | Violation of 5-day low or immediate volume dry-up |
| **MEDIUM** (2-12 weeks) | Trend Following (MA20/MA50), Intermediate Chart Patterns, Momentum + Sector strength | Close below SMA50 or sector money flow reversal |
| **LONG** (3-12 months) | Fundamental quality, DCF Valuation, ROE stability, FCF yield, Earnings growth | Structural deterioration in earnings or debt coverage |

> **RULE**: Scoring logic must vary by horizon. A short-term strategy must not rely solely on multi-year DCF; a long-term model must not exit on a single 1-day candlestick pullback.

---

## 5. BREAKOUT & BOTTOM REVERSAL LOGIC

When detecting bottom reversals or breakouts, agents MUST enforce confirmation sequencing:

```text
Consolidation Base (N sessions)
              │
              ▼
   Resistance Breakout (Close > High of Prior N bars)
              │
              ▼
 Volume Confirmation (Volume >= 1.3x 20-day Volume MA)
              │
              ▼
    Trend Confirmation (Close >= SMA20)
              │
              ▼
  Momentum Confirmation (RSI >= 50)
              │
              ▼
        VALIDATED SIGNAL
```

> **WARNING**: "Bottom fishing" does NOT mean buying a plummeting stock blindly. A valid bottom reversal requires base consolidation and confirmed volume reversal.

---

## 6. EXPLAINABILITY & TRANSPARENCY

All recommendation scores MUST provide machine-readable reasons and contributing factor weights:
- Avoid opaque or unweighted "black box" numbers.
- Provide clear textual summaries explaining *why* the strategy triggered (e.g. `Close (54000) broke 20-day resistance (52000) with 2.5x volume expansion`).
