# Phase 19.5.7 — Trading UI / Order Hardening & Canonical Paper-Trading Integration

## Status: COMPLETED
- Phase: 19.5.7 (Trading UI / Order Hardening & Canonical Paper-Trading Integration)
- Target: Harden the Paper Trading page (order ticket, submission, order status/history, cancel) so every action flows through the canonical paper-trading chain: UI → `/api/trading/*` → TradingApiRouter → TradingEngine → TradingDataValidator → RiskGuard/RiskManager → TradeCapitalAllocation → PositionSizer → OrderManager → PaperBroker → OrderStateMachine. The UI remains presentation-only; no second trading engine, no server-control bypass, no live-broker path.

## Files Inspected
- `phase-status.md`, `task_on_progress.md`, `docs/metric-contracts.md`
- `src/pages/PaperTradingPage.tsx` (Trading UI: order ticket, submission, history, cancel)
- `src/hooks/useMarketQueries.ts` (`useTradingPortfolio/Positions/Orders/Status`, `usePlaceTradingOrder`, `useCancelTradingOrder`, `TRADING_KEYS`)
- `src/lib/trading/api/TradingApiRouter.ts` (POST `/order` full gate chain: idempotency → emergency stop → trading enabled → real quote → price band → short-selling/anti-pyramiding → OrderManager)
- `src/lib/trading/types/trading.ts` (canonical `Order`, `OrderStatus`, `OrderSide`, `OrderType`)
- `src/lib/trading/paper/PaperBroker.ts` (submission lifecycle NEW→VALIDATED→SUBMITTED→FILLED; cancel only from SUBMITTED)
- `src/lib/trading/execution/OrderManager.ts`, `BrokerAdapter.ts` (delegation + `BrokerAccount`/`BrokerPosition` contracts)
- Existing server-side tests: `TradingApiRouter.test.ts`, `PaperBroker.test.ts`, `OrderManager.test.ts` (not duplicated)

## Findings (defects fixed)
1. **Fabricated cash/equity**: `portfolio?.availableCash ?? 100000000` / `equity ?? 100000000` rendered a fake 100M VND when the account was unavailable (§17 violation).
2. **LIMIT orders were dead-wired**: `usePlaceTradingOrder` payload type lacked `limitPrice`, so the ticket's limit price never reached the canonical API and every LIMIT order was server-rejected `INVALID_PRICE`. Fixed by adding `limitPrice?: number` to the hook payload (server already validates price bands).
3. **Fail-open order book**: `ordersQuery.data || []` fabricated an empty book on API error; `(ord.quantity || ord.shares || 0)` and `(ord.price || 0)` fabricated zeros; `ord.orderType || ord.type` referenced a non-canonical field.
4. **Non-canonical status logic**: cancel affordance checked `'PENDING'` (not a canonical OrderStatus); status chip had no REJECTED/FAILED/EXPIRED styling.
5. **No submission gating**: submit button ignored `tradingEnabled`/`emergencyStop`/status-unavailable; header badge and cards hardcoded `status="LIVE"` regardless of errors.
6. `as any` on the order-type select and `err: any` catch blocks; no duplicate-submission handler guard.

## Changes (2 production files + 1 new test file)
- `src/pages/PaperTradingPage.tsx`
  1. Order ticket: submission blocked (button disabled + explicit note) on `emergencyStop`, `tradingEnabled === false`, or status unavailable/stale — server remains the authoritative gate (EMERGENCY_STOP/TRADING_DISABLED 409s preserved).
  2. UX-only validation preserved/added: symbol non-empty, `Number.isInteger(shares) && shares >= 100 && shares % 100 === 0` (server board-lot rule mirrored, never re-implemented as sizing), LIMIT requires finite positive price (no zero/market-data fallback).
  3. Duplicate-submission protection: `if (placeOrderMutation.isPending) return;` handler guard + disabled buttons for both mutations (§14 UX-only).
  4. Server-authoritative results: success message uses the returned order `id` + canonical `status` (never fabricates FILLED); rejections surface `data.error.message` verbatim via `err instanceof Error` (typed `unknown`, `as any`/`err: any` removed).
  5. SELL position context panel: canonical `BrokerPosition.quantity` for the entered symbol, fail-closed; explicit no-short-selling (INSUFFICIENT_POSITION) note when no position exists — display-only, no bypass.
  6. Account cards fail-closed: cash/equity render `—` when unavailable (fabricated 100M defaults removed); realistic LIVE/STALE/ERROR/DATA_UNAVAILABLE states on header badge and all four cards; RiskGuard card no longer claims specific policy numbers not present in any canonical contract.
  7. Order history: `orders === null` → explicit unavailable panel with retry (never empty-success); rows typed `Order`; `ord.type`, `formatAmount(ord.quantity)`, LIMIT `limitPrice` fail-closed (MARKET/no-fill → `—`, never 0); status chips cover all canonical statuses and render the server string verbatim; cancel affordance only for `status === 'SUBMITTED'` (canonical OrderStateMachine rule).
  8. Symbol identity: `canonicalSymbol = symbol.trim().toUpperCase()` (same normalization the server applies) used in the ticket, context panel, and submission — no new mapping layer.
- `src/hooks/useMarketQueries.ts`
  1. `usePlaceTradingOrder` payload type: added `limitPrice?: number` (canonical API field, server-validated) — fixes dead-wired LIMIT orders.
  2. `useTradingOrders`: typed `Order[] | null` and returns `json.data` (fail-closed; sole consumer is PaperTradingPage).
  3. Existing invalidation strategy untouched: both mutations already invalidate `TRADING_KEYS.all` on success.
- `src/pages/trading/__tests__/TradingHardening.test.tsx` — NEW: 23 tests covering the 24 required verifications (SELL + no-short combined). Fixtures mirror canonical `Order`/`BrokerAccount`/`BrokerPosition` contracts (test-only).

## Tests (23 new, all passing)
1. Canonical order submission (hook → POST /api/trading/order; page never calls fetch directly)
2. No direct broker/engine execution (no PaperBroker/OrderManager/TradingEngine imports; read-only types only)
3. BUY ticket wired to canonical payload fields (no client risk/sizing fields)
4.+5. SELL canonical position context + no-short-selling surfaced, no bypass possible
6. Board-lot quantity validation preserved; no client-side sizing formula
7. Invalid LIMIT price rejected in UX; never fabricated; `limitPrice` reaches the API
8. Zero is valid (zero cash `0.00 tr VND`; zero orders = valid empty; no fabricated 100M default)
9. null → `—`
10. undefined status → submission blocked with explicit state + disabled button
11. NaN → `—` (no `NaN` in markup)
12. ±Infinity → `—` (no `Infinity` in markup)
13. Canonical risk rejection displayed verbatim; REJECTED chip styled; rejection ≠ success
14. Insufficient-capital/canonical rejection path: success set only after server accept
15. Trading disabled → blocked + HALTED card
16. Emergency stop → blocked + EMERGENCY STOP state
17. Duplicate submission protection (pending label, disabled, handler guard, server authoritative)
18. Order-book API error → explicit unavailable panel (not empty success); stale book still shows rows
19. Canonical order statuses render verbatim (SUBMITTED/FILLED/PARTIALLY_FILLED/CANCELLED)
20. Cancel only for SUBMITTED via canonical /api/trading/cancel; non-canonical 'PENDING' removed
21. No fabricated FILLED from submission; success message shows server status
22. Query invalidation reuses existing TRADING_KEYS.all strategy (×2 mutations); no optimistic setQueryData
23. Canonical ticker preserved (trim/uppercase only; no alias maps)
24. No frontend financial formulas (no sizing/risk/allocation/buying-power math, no `|| 0`/`?? 0`, no `as any`, no dangerouslySetInnerHTML)

## Verification
- [x] Focused Trading UI tests: 23/23 passed
- [x] `npx tsc --noEmit`: 0 errors
- [x] Full test suite (`npm test`): 72 files, 1,143 tests passed
- [x] Production build (`npm run build`): passed
- [x] `git diff --check`: clean
- [x] `git status`/`git diff` inspected: only in-scope files (PaperTradingPage.tsx, useMarketQueries.ts, new trading test dir) + pre-existing uncommitted 19.5.4/19.5.5/19.5.6 files from earlier sessions

## Known Limitations
- LIMIT-order price-band validation (ceiling/floor) is enforced server-side against realtime quotes; the ticket does not pre-fetch the quote band for display (would add a per-symbol market-data request; not required by the canonical contract).
- Cancel remains allowed only for `status === 'SUBMITTED'`; MARKET orders that fill immediately within the submission cycle legitimately offer no cancel window.
- `useTradingPositions` still types its payload as `any[]` (shared with RiskCenterPage / PortfolioPage 19.5.6); narrowing touches shared files beyond minimal-diff scope.
- Order-ticket price/quantity inputs use basic number parsing (`Number(e.target.value)`); invalid input is caught by submit-time validation and server validation, never silently corrected.
- Pre-existing untracked `nul` file in repo root (Windows artifact from an earlier session) — left untouched per file-protection policy.

## Next
- STOP — Phase 19.5.8 must not be started automatically.

