# 01 — MARKET DATA INTEGRITY & PROVENANCE RULES

**System**: VN STOCK AI PRO  
**Scope**: Market Data Ingestion, Normalization, Validation, and Storage (Phases 17, 18, 19)  
**Status**: ENFORCED  

---

## 1. APPROVED MARKET DATA FLOW

Market data must flow through the canonical, validated pipeline:

```text
External Market Providers (KBS / VPS / VNDIRECT)
                  │
                  ▼
          Provider Adapter
                  │
                  ▼
       Data Normalization Layer
                  │
                  ▼
     Market Data Validator (OHLCV)
                  │
                  ▼
     Timestamp & Freshness Check
                  │
                  ▼
       Downstream Analysis Engine
                  │
                  ▼
     Recommendation & Risk Subsystem
```

---

## 2. APPROVED DATA PROVIDERS & ARCHITECTURE

The system relies on real Vietnamese market data providers. Agents MUST preserve and reuse:
- **KBS Provider** (`/src/services/market/providers/kbs/`): Real-time quotes, historical daily bars, intraday transactions.
- **VNDIRECT / VPS Providers** (`/src/services/market/providers/vps/`): Price board feeds, order book depth, sector indices.
- **RealMarketDataProvider & realMarketDataService.ts**: The unified aggregation and fallback orchestration facade.

> **RULE**: Never replace existing market data providers with unvetted third-party libraries or synthetic mock services.

---

## 3. STRICT DATA VALIDATION INVARIANTS (OHLCV)

Every candlestick and tick processed by the system MUST pass the following geometric and numerical validation checks:

| Metric | Invariant Constraint | Failure Action |
|---|---|---|
| `open` | Must be a finite number $> 0$ | Reject bar (*fail closed*) |
| `high` | Must be a finite number $> 0$ | Reject bar (*fail closed*) |
| `low` | Must be a finite number $> 0$ | Reject bar (*fail closed*) |
| `close` | Must be a finite number $> 0$ | Reject bar (*fail closed*) |
| `volume` | Must be a finite number $\ge 0$ | Reject bar (*fail closed*) |
| `high >= max(open, close)` | Must be true | Reject bar (*fail closed*) |
| `low <= min(open, close)` | Must be true | Reject bar (*fail closed*) |
| `high >= low` | Must be true | Reject bar (*fail closed*) |
| `timestamp` | Must be valid ISO 8601 string or numeric epoch | Reject bar (*fail closed*) |
| `ordering` | Strictly ascending chronological order ($t_{i} > t_{i-1}$) | Reject sequence or sort |
| `duplicates` | No identical timestamps for same symbol/timeframe | Deduplicate or reject |

### Numerical Sanity Rejections:
The validator MUST unconditionally reject:
- `NaN`
- `+Infinity` / `-Infinity`
- Negative prices or negative volumes
- Unsorted timestamps
- Geometric breaches ($Low > High$, $Close > High$, $Open < Low$)

---

## 4. DATA PROVENANCE & AUDIT TRAIL

Every derived metric, technical indicator, financial score, and recommendation MUST retain source provenance metadata:
```typescript
interface DataProvenance {
  readonly symbol: string;
  readonly provider: 'KBS' | 'VPS' | 'VNDIRECT' | 'SBV' | 'GSO' | 'FRED';
  readonly timestamp: string;         // Market event timestamp
  readonly retrievedAt: string;       // Ingestion epoch timestamp
  readonly dataFreshness: 'REALTIME' | 'DELAYED' | 'END_OF_DAY' | 'HISTORICAL';
  readonly timeframe: '1m' | '5m' | '15m' | '1H' | '1D' | '1W';
}
```

---

## 5. HISTORICAL DATA & LOOK-AHEAD PREVENTION

1. **Strict Temporal Isolation**:
   - Historical indicators calculated at bar index $i$ must only ingest candlestick points $[0 \dots i]$.
   - Slices must be frozen or cloned to prevent accidental look-ahead mutations.
2. **Resistance / Support Window Calculations**:
   - When evaluating breakout resistance over prior $N$ bars, the calculation window MUST span $[i - N \dots i - 1]$, strictly excluding the current bar $i$.

---

## 6. PROHIBITED DATA PATTERNS

Agents are **STRICTLY FORBIDDEN** from introducing:
- `MOCK_STOCKS_DATABASE` or static price lookup tables.
- Synthetic price generation (Brownian motion, Gaussian random walks, math formulas creating fake prices).
- Seeded random return arrays.
- Hardcoded fundamental figures (fake EPS, P/E, P/B, ROE, DCF cashflows).
- Placeholder simulated market environments in production paths.
