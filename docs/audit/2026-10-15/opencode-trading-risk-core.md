# trading-risk-core — OpenCode audit (2026-10-15)

## Map

### Purpose
Audit of the "trading-risk-core" area covering order pipeline integrity
(Recommendation -> TradingDataValidator -> RiskGuard -> PaperBroker/Ledger -> Audit),
the impact of commit a277613 (241 files deleted, 62 reverted), and which callers
now reference deleted exports/files/shapes.

### Entry points
- `src/services/trading/PaperOrderRiskBoundary.ts` — boundary that enforces
  simulation assertion, risk parameters, market data verification, RiskGuard
  evaluation, PositionSizer, then broker submission
- `src/lib/decision/RiskDecisionEngine.ts` — wraps RiskGuard logic for
  decision making (uses self-contained types, not deleted module)
- `src/lib/rebalancing-decision/TurnoverCostEngine.ts` — uses VietnamLotRule math
- `src/lib/analysis/backtest/QuantPropertyBasedHardening.test.ts` — uses PositionSizer

### Key files

| Path | Role |
|---|---|
| `src/services/trading/PaperOrderRiskBoundary.ts` | Order submission boundary: simulation check, RiskGuard evaluate, PositionSizer calculate, broker submit |
| `src/lib/trading/risk/RiskGuard.ts` | **GONE** (deleted in a277613) — core risk evaluation engine |
| `src/lib/trading/risk/PositionSizer.ts` | **GONE** (deleted in a277613) — risk-adjusted position sizing |
| `src/lib/trading/risk/RiskManager.ts` | **GONE** (deleted in a277613) — portfolio risk management |
| `src/lib/trading/risk/VietnamLotRule.ts` | **GONE** (deleted in a277613) — Vietnam board lot rule (100-share) |
| `src/lib/trading/validation/TradingDataValidator.ts` | **GONE** (deleted in a277613) — OHLCV/data validation |
| `src/lib/trading/execution/BrokerAdapter.ts` | **GONE** (deleted in a277613) — broker adapter interface |
| `src/lib/trading/execution/OrderManager.ts` | **GONE** (deleted in a277613) — order submission pipeline |
| `src/lib/trading/paper/PaperTradeLedger.ts` | **GONE** (deleted in a277613) — double-entry ledger |
| `src/lib/trading/replay/ReplayEngine.ts` | **GONE** (deleted in a277613) — deterministic replay engine |
| `src/lib/trading/snapshot/MarketSnapshot.ts` | **GONE** (deleted in a277613) — in-memory market snapshot |
| `src/lib/research/AuditEngine.ts` | BACK (reverted) — certification criteria checker |
| `src/lib/decision/RiskDecisionEngine.ts` | Wraps RiskGuard logic via self-contained input type; does NOT import deleted module |
| `src/lib/decision/PositionIntegrationEngine.ts` | Thin wrapper; takes SizerFn dependency, own SizerInput type |
| `src/lib/rebalancing-decision/TurnoverCostEngine.ts` | Uses VietnamLotRule.LOT_SIZE for cost computation; import from deleted path |
| `src/lib/rebalancing-decision/__tests__/TurnoverCost.test.ts` | Imports VietnamLotRule from deleted path |
| `src/lib/platform/observability/reachabilityRegistry.ts` | Documents required risk pipeline order |
| `src/services/market/realMarketDataService.ts` | Real-time quote provider used by PaperOrderRiskBoundary |

### Wiring
- `Recommendation` (AI signal) → `TradingDataValidator` (**GONE** — deleted) — no data validation exists before risk evaluation
- `RiskGuard` (**GONE** — deleted) — evaluates against policy: max 20% position, max 80% exposure, min RR 2.0, 100-share lots, cash buffer 10%, daily drawdown 15%
- `PositionSizer` (**GONE** — deleted) — computes approved quantity from equity, available cash, entry/stop/target
- `PaperBroker` (`src/lib/trading/paper/PaperBroker.ts`) — restored (BACK), in-memory paper broker with balance/positions
- `PaperOrderRiskBoundary` (`src/services/trading/PaperOrderRiskBoundary.ts`) — still references deleted `RiskGuard` and `PositionSizer` imports; will fail at typecheck/runtime
- `AuditEngine` (`src/lib/research/AuditEngine.ts`) — certifies PIT, no-lookahead, accounting validity
- `ReachabilityRegistry` (`src/lib/platform/observability/reachabilityRegistry.ts`) — documents that RiskGuard → RiskManager → PositionSizer must run before PaperBroker; no broker submission reachable without approved verdict

### Tests
- `src/lib/trading/__tests__/` — **ALL GONE** (deleted in a277613): RiskGuard.test.ts, PositionSizer.test.ts, PaperBroker.test.ts, etc.
- `src/lib/analysis/backtest/QuantPropertyBasedHardening.test.ts` — imports PositionSizer from deleted path
- `src/lib/rebalancing-decision/__tests__/TurnoverCost.test.ts` — imports VietnamLotRule from deleted path
- No active test coverage for the risk pipeline after a277613

### Health
(works / partially broken / broken, with evidence: tsc error count for these paths, missing files)
- **Partially broken**: `PaperOrderRiskBoundary.ts` — logic is correct but 2 imports from deleted files (`RiskGuard`, `PositionSizer`) will cause compilation errors
- **Partially broken**: `TurnoverCostEngine.ts` — imports `VietnamLotRule` from deleted path; test `TurnoverCost.test.ts` also imports it
- **Partially broken**: `QuantPropertyBasedHardening.test.ts` — imports `PositionSizer` from deleted path
- **Broken**: All `src/lib/trading/__tests__/` test files — GONE, no test infrastructure remains
- **Broken**: `TradingDataValidator` entirely deleted — no OHLCV data validation occurs before risk checks
- tsc baseline: 563 errors (unchanged by this task; many caused by deleted-file imports)

### Gotchas
- 241 files deleted in a277613, including every core risk module; 62 files reverted to older versions
- `PaperOrderRiskBoundary.ts` has correct audit trail logic (simulation → risk params → quote → RiskGuard → PositionSizer → broker) but the two core dependencies it imports from no longer exist on disk
- `TradingDataValidator` deletion means no OHLCV invariants (high>=max(open,close), low<=min(open,close), volume>=0, strict timestamp ordering, no NaN/Infinity) are enforced before signals enter the risk pipeline
- Vietnam lot rule (100-share board lots) enforcement is missing — VietnamLotRule.ts is GONE
- No TradingDataValidator → signals with invalid OHLCV can flow straight into RiskGuard, which may produce unpredictable results
- The order pipeline `Recommendation -> TradingDataValidator -> RiskGuard -> PaperBroker/Ledger -> Audit` is broken at the first two steps
- TurnoverCostEngine and its test import VietnamLotRule from deleted path, but the decision engine types (RiskDecisionEngine) are self-contained and do NOT reference the deleted module

## Findings

| # | Severity | Category | Location | Title |
|---|---|---|---|---|
| F1 | critical | broken-import | `src/services/trading/PaperOrderRiskBoundary.ts:5` | RiskGuard imported from deleted file |
| F2 | critical | broken-import | `src/services/trading/PaperOrderRiskBoundary.ts:6` | PositionSizer imported from deleted file |
| F3 | critical | broken-import | `src/lib/rebalancing-decision/TurnoverCostEngine.ts:14` | VietnamLotRule imported from deleted file |
| F4 | critical | broken-import | `src/lib/rebalancing-decision/__tests__/TurnoverCost.test.ts:3` | VietnamLotRule imported from deleted file (test) |
| F5 | critical | broken-import | `src/lib/analysis/__tests__/QuantPropertyBasedHardening.test.ts:31` | PositionSizer imported from deleted file |

---

### F1 — critical / broken-import
**Location:** `src/services/trading/PaperOrderRiskBoundary.ts:5`
```ts
import { RiskGuard } from '../../lib/trading/risk/RiskGuard.ts';
```
**Evidence:** (line 5 as read from file)
```ts
import { RiskGuard } from '../../lib/trading/risk/RiskGuard.ts';
```
**Why it is a defect:** PaperOrderRiskBoundary is the core order submission boundary that enforces the risk pipeline, but its primary dependency (RiskGuard) no longer exists on disk (deleted in a277613). The file will fail to compile.
**Minimal fix:** Restore RiskGuard.ts or restructure PaperOrderRiskBoundary to use an inline risk evaluation. Protected path: `src/lib/trading/**`.

### F2 — critical / broken-import
**Location:** `src/services/trading/PaperOrderRiskBoundary.ts:6`
```ts
import { PositionSizer } from '../../lib/trading/risk/PositionSizer.ts';
```
**Evidence:** (line 6 as read from file)
```ts
import { PositionSizer } from '../../lib/trading/risk/PositionSizer.ts';
```
**Why it is a defect:** PaperOrderRiskBoundary depends on PositionSizer for risk-adjusted quantity calculation, but the source file is deleted (a277613). The code cannot compile or execute.
**Minimal fix:** Restore PositionSizer.ts or inline the position sizing logic. Protected path: `src/lib/trading/risk/**`.

### F3 — critical / broken-import
**Location:** `src/lib/rebalancing-decision/TurnoverCostEngine.ts:14`
```ts
import { VietnamLotRule } from '../trading/risk/VietnamLotRule.ts';
```
**Evidence:** (line 14 as read from file)
```ts
import { VietnamLotRule } from '../trading/risk/VietnamLotRule.ts';
```
**Why it is a defect:** TurnoverCostEngine uses VietnamLotRule.LOT_SIZE for lot-rounded execution steps in Vietnam market (100-share board lots). The module was deleted in a277613, so the import resolves to a non-existent file.
**Minimal fix:** Restore VietnamLotRule.ts or duplicate LOT_SIZE constant and lot-rounding logic. Protected path: `src/lib/rebalancing-decision/**`.

### F4 — critical / broken-import
**Location:** `src/lib/rebalancing-decision/__tests__/TurnoverCost.test.ts:3`
```ts
import { VietnamLotRule } from "../../trading/risk/VietnamLotRule.ts";
```
**Evidence:** (line 3 as read from file)
```ts
import { VietnamLotRule } from "../../trading/risk/VietnamLotRule.ts";
```
**Why it is a defect:** Test file `TurnoverCost.test.ts` depends on the deleted VietnamLotRule module, making the test unrunnable. Part of the a277613 cleanup.
**Minimal fix:** Restore VietnamLotRule.ts or remove/update the test import. Protected path: `src/lib/rebalancing-decision/__tests__/`.

### F5 — critical / broken-import
**Location:** `src/lib/analysis/__tests__/QuantPropertyBasedHardening.test.ts:31`
```ts
import { PositionSizer } from '../../trading/risk/PositionSizer.ts';
```
**Evidence:** (line 31 as read from file)
```ts
import { PositionSizer } from '../../trading/risk/PositionSizer.ts';
```
**Why it is a defect:** Test file `QuantPropertyBasedHardening.test.ts` depends on the deleted PositionSizer module, making the test unrunnable. Part of the 28 test files deleted in a277613.
**Minimal fix:** Restore PositionSizer.ts or remove/update the test import. Protected path: `src/lib/analysis/__tests__/`.

## Not checked / unsure
- Exact state of `src/lib/trading/validation/TradingDataValidator.ts` — file is GONE (deleted in a277613); cannot provide valid `path:line` location, but the deletion means no OHLCV invariants are enforced before risk evaluation
- Exact state of `src/lib/trading/risk/RiskGuard.ts` — file is GONE; core risk evaluation engine missing from the order pipeline
- Exact state of `src/lib/trading/risk/PositionSizer.ts` — file is GONE; position sizing (100-share lots, risk caps) cannot be computed
- Exact state of `src/lib/trading/risk/RiskManager.ts` — file is GONE; no portfolio exposure/daily loss limit enforcement
- Exact state of `src/lib/trading/risk/VietnamLotRule.ts` — file is GONE; no 100-share board lot enforcement
- Financial conservation invariants (cash + realized PnL - commissions - taxes = current equity) cannot be validated — replay infrastructure (18 files) is GONE
- Market snapshot infrastructure (6 files GONE) limits look-ahead prevention capability
- Whether any runtime workarounds or mock substitutes for the deleted risk modules exist that are not apparent from source code alone
- Full verification of tsc 563-error breakdown beyond the broken-import findings documented above