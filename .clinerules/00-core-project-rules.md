# 00 — CORE PROJECT RULES & ENGINEERING GOVERNANCE

**System**: VN STOCK AI PRO  
**Scope**: Universal Global Rules (All Phases: 17, 18, 19, and Future Subsystems)  
**Target Audience**: AI Coding Agents (Cline / Kilo Code), Quant Engineers, Algorithmic Architects  

---

## 1. PROJECT IDENTITY & DOMAIN CONTEXT

- **Project Name**: `VN STOCK AI PRO`
- **Domain**: Vietnamese Stock Market Analysis, Quantitative Investment Research, Paper Trading, and Execution Safety.
- **Primary Exchanges**: HOSE (Ho Chi Minh Stock Exchange), HNX (Hanoi Stock Exchange), UPCOM (Unlisted Public Company Market).
- **Core Mission**: Deliver deterministic, mathematically sound, explainable, and fail-closed quantitative investment analysis and paper trading simulation powered by real market data.

---

## 2. CORE DEVELOPMENT PRINCIPLES

AI coding agents MUST adhere strictly to the following principles:

1. **Preserve Existing Architecture**:
   - MUST NOT refactor, rename, rewrite, or replace working subsystems without explicit instruction.
   - MUST preserve established module boundaries (`/src/lib/trading/`, `/src/lib/analysis/`, `/src/lib/macro/`, `/src/services/market/`).

2. **Targeted, Minimal Modifications**:
   - Prefer surgical, minimal additions over widespread file churn.
   - Avoid creating duplicate utilities, parallel frameworks, or alternative indicator calculation engines.

3. **Inspect Before Implementing**:
   - Inspect the repository and view target files before writing code.
   - Never assume missing interfaces or make up API endpoints.
   - Reuse existing TypeScript interfaces, contracts, and type definitions from barrel exports.

4. **Fail-Closed by Design**:
   - Any validation error, missing price, corrupted bar, or mathematical invariant violation MUST stop execution immediately and return an explicit error or `null`.
   - MUST NOT silently default invalid numerical metrics to `0`, `NaN`, `Infinity`, or placeholder estimates.

---

## 3. DATA INTEGRITY & ANTI-MOCK DIRECTIVES

1. **Strict Prohibition of Mock Data in Production**:
   - **MUST NOT** introduce random walk prices, synthetic candlesticks, seeded price arrays, fake EPS/PE/PB multiples, or placeholder financial tables.
   - All production analysis must consume real, validated market data originating from approved providers.

2. **Data Provenance & Auditability**:
   - Every analytical output, trading signal, and backtest result MUST preserve metadata: `symbol`, `provider/source`, `timestamp`, `timeframe`, and `dataFreshness`.

3. **Temporal Invariance**:
   - At timestamp $T$, no analytical function, technical indicator, or strategy model may access data with timestamp $> T$.

---

## 4. SAFETY & RISK MANAGEMENT LAWS

1. **Never Bypass RiskGuard or TradingDataValidator**:
   - The execution path `Recommendation -> TradingDataValidator -> RiskGuard -> PaperBroker / Ledger -> Audit` is immutable.
   - No feature, fast-path, or test script may route orders directly to execution without passing through `TradingDataValidator` and `RiskGuard`.

2. **No Direct AI Execution**:
   - LLM / AI outputs are strictly informational and advisory.
   - AI generated text MUST NEVER directly place, modify, or execute trades. All trades must be generated and validated by deterministic TypeScript engines.

3. **Financial Conservation Invariants**:
   - Paper trading and replay state transitions must strictly conserve cash, shares, fees, taxes, and realized PnL.
   - Cash balances cannot become negative. Short selling is disabled unless explicitly permitted by market regulation.

---

## 5. AGENT WORKFLOW & LIFECYCLE CHECKLIST

Every coding turn MUST follow this exact sequence:

```text
1. Inspect Architecture (view_file / list_dir)
   └── Identify existing contracts and dependencies
2. Formulate Minimal Implementation Plan
   └── Target only the requested scope
3. Implement Code / Documentation Changes
   └── Preserve existing providers and safety layers
4. Verification & Testing
   └── Run targeted Vitest suites (npm test / npx vitest run ...)
5. Typecheck & Build Validation
   └── Run linter and compiler (npx tsc --noEmit / npm run build)
6. Review Changes & Provide Factual Report
   └── Report exact test counts, file modifications, and limitations
```

---

## 6. FILE PROTECTION POLICIES

- **DO NOT** modify `.env` files or hardcode credentials.
- **DO NOT** delete files without explicit prompt instructions.
- **DO NOT** reset Git history or force-push destructive commands.
- **DO NOT** touch unrelated files when implementing targeted features.
