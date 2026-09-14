# 04 — TRADING RISK & FINANCIAL INTEGRITY RULES

**System**: VN STOCK AI PRO  
**Scope**: Paper Trading Engine, RiskGuard, Ledgers, Replay, State Invariants (Phases 18, 19)  
**Status**: ENFORCED & CRITICAL  

---

## 1. MANDATORY EXECUTION PIPELINE

Every order and trade in the simulated paper trading environment MUST strictly traverse the canonical execution sequence:

```text
       ┌────────────────────────────────────────────────────────┐
       │             Signal / User Recommendation               │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                 TradingDataValidator                   │
       │   - Validate price, quantity, symbol, and lot size     │
       │   - Verify timestamp freshness and non-negative values │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                      RiskGuard                         │
       │   - Max portfolio allocation per stock (e.g. 20%)      │
       │   - Minimum cash reserve constraint (e.g. 10%)         │
       │   - Daily drawdown limit breach check                  │
       │   - Maximum daily order frequency & volume limits      │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             Paper Trading Execution Engine             │
       │   - Order matching, execution price, slippage, fees    │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │           Financial Ledger & Reconciliation            │
       │   - Double-entry state updates, cash/position balances │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             Deterministic Replay & Audit               │
       │   - Event stream hash audit & conservation validation  │
       └────────────────────────────────────────────────────────┘
```

> **SAFETY LAW**: Under NO circumstances may any component bypass `TradingDataValidator` or `RiskGuard`.

---

## 2. FAIL-CLOSED EXECUTION POLICY

If any validation step, price check, or risk rule fails:
- **BLOCK** order execution immediately.
- **DO NOT** attempt silent self-healing by replacing invalid prices with `0`, previous close, or hypothetical averages.
- **DO NOT** execute partial or unvalidated orders.
- Emit an explicit, structured rejection with machine-readable error codes.

---

## 3. POSITION & PORTFOLIO RISK RULES

All order generation must respect deterministic risk thresholds:
1. **Single Stock Concentration**: Max position value $\le 20\%$ of total portfolio equity.
2. **Cash Buffer**: Minimum uncommitted cash balance $\ge 10\%$ of account equity.
3. **Board Lot Multiples**: Order sizes must be integer multiples of $100$ shares.
4. **Maximum Drawdown Circuit Breaker**: If total portfolio drawdown breaches $15\%$, freeze new buy orders until explicitly reset.
5. **No Unbacked Margin**: Short selling and overdrafts are strictly forbidden.

---

## 4. PAPER TRADING & BACKTEST STATE ISOLATION

- Strategy backtesting, analytical scoring, and historical verifiers MUST NEVER mutate or access the live Paper Trading ledger or database.
- Backtests must instantiate their own transient, in-memory `TradeSimulator` instances.
- State mutation in paper trading must be transactional and idempotent.

---

## 5. FINANCIAL CONSERVATION INVARIANTS

The financial state of an account is governed by strict conservation laws across all state transitions:

$$\text{Initial Cash} + \sum \text{Deposits} - \sum \text{Withdrawals} + \sum \text{Realized Gross PnL} - \sum \text{Commissions} - \sum \text{Taxes} = \text{Current Cash}$$

$$\text{Total Equity} = \text{Current Cash} + \sum_{i} \left( \text{Quantity}_i \times \text{Current Price}_i \right)$$

### Conservation Requirements:
1. **Share Balance Conservation**: $Shares_{t+1} = Shares_t + Bought - Sold$.
2. **Transaction Value Conservation**: Gross value of buys/sells must balance against deducted/credited cash plus fees.
3. **Replay Determinism**: Replaying an identical stream of order events must produce the exact same bitwise ledger state.

---

## 6. PROHIBITION OF DIRECT AI ORDER EXECUTION

- AI agents, LLM prompts, and automated chat responses are strictly classified as **Advisory / Intelligence**.
- AI models CANNOT place orders directly onto the Paper Trading engine or external brokers.
- Any trade execution must originate from explicit user action or verified deterministic quantitative rules passing through `RiskGuard`.
