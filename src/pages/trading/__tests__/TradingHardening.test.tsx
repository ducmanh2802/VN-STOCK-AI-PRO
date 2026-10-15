import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNAVAILABLE } from '../../portfolio/metrics';
import { PaperTradingPage } from '../../PaperTradingPage';
import type { Order } from '../../../lib/trading/types/trading';
import type { BrokerAccount, BrokerPosition } from '../../../lib/trading/execution/BrokerAdapter';

// Trading page state is driven by the market-queries hooks. Controlling them at
// the hook boundary lets each test render the REAL page branch (loading, data,
// empty, error, blocked) without a DOM environment or network. The mutations
// are mocked at the hook boundary too — the page must go through them (and the
// hook source must hit the canonical API), which the structural tests verify.
const hooksMock = vi.hoisted(() => ({
  portfolio: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: () => {},
  },
  positions: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: () => {},
  },
  orders: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: () => {},
  },
  status: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: () => {},
  },
  placeOrder: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  cancelOrder: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock('../../../hooks/useMarketQueries', () => ({
  useTradingPortfolio: () => hooksMock.portfolio,
  useTradingPositions: () => hooksMock.positions,
  useTradingOrders: () => hooksMock.orders,
  useTradingStatus: () => hooksMock.status,
  usePlaceTradingOrder: () => hooksMock.placeOrder,
  useCancelTradingOrder: () => hooksMock.cancelOrder,
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: () => ({
    openQuickView: vi.fn(),
    setCurrentView: vi.fn(),
  }),
}));

const renderPage = () => renderToStaticMarkup(<PaperTradingPage />);

const getPageSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, '../../PaperTradingPage.tsx'), 'utf-8');
};

const getHookSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, '../../../hooks/useMarketQueries.ts'), 'utf-8');
};

const resetAll = () => {
  for (const key of ['portfolio', 'positions', 'orders', 'status'] as const) {
    Object.assign(hooksMock[key], {
      data: undefined, isLoading: false, isError: false, error: null,
    });
  }
  hooksMock.placeOrder.isPending = false;
  hooksMock.cancelOrder.isPending = false;
};

// Server-shaped fixture matching the canonical Order contract (test data only).
const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ORD-001',
  symbol: 'FPT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 1000,
  limitPrice: 120000,
  status: 'SUBMITTED',
  createdAt: '2026-09-17T10:00:00.000Z',
  ...overrides,
});

const makeAccount = (overrides: Partial<BrokerAccount> = {}): BrokerAccount => ({
  accountId: 'paper-001',
  currency: 'VND',
  cash: 50_000_000,
  reservedCash: 0,
  availableCash: 50_000_000,
  marketValue: 0,
  equity: 50_000_000,
  realizedPnL: 0,
  unrealizedPnL: 0,
  positions: [],
  openOrders: [],
  updatedAt: '2026-09-17T10:00:00.000Z',
  ...overrides,
});

const makeStatus = (overrides: Record<string, unknown> = {}) => ({
  tradingEnabled: true,
  emergencyStop: false,
  brokerMode: 'PAPER',
  session: 'validated by TradingEngine & TradingDataValidator',
  ...overrides,
});

const makePosition = (overrides: Partial<BrokerPosition> = {}): BrokerPosition => ({
  symbol: 'FPT',
  quantity: 2000,
  reservedQuantity: 0,
  availableQuantity: 2000,
  averageCost: 100000,
  currentPrice: 110000,
  marketValue: 220000000,
  unrealizedPnL: 20000000,
  unrealizedPnLPercent: 10,
  updatedAt: '2026-09-17T10:00:00.000Z',
  ...overrides,
});

const loadTradingState = () => {
  hooksMock.portfolio.data = makeAccount();
  hooksMock.status.data = makeStatus();
  hooksMock.orders.data = [];
  hooksMock.positions.data = [];
};

/**
 * PHASE 19.5.7 — Trading UI / Order Hardening & Canonical Paper-Trading
 * Integration Test Suite. Covers the 24 required verifications.
 */
describe('Phase 19.5.7 — Trading UI Hardening', () => {
  beforeEach(() => resetAll());

  // ---- Test 1: canonical order submission ----
  it('submits orders exclusively through the canonical trading API hook', () => {
    const page = getPageSource();
    const hook = getHookSource();
    // Page submits via the mutation hook — never via raw fetch or direct engine
    expect(page).toContain('placeOrderMutation.mutateAsync(');
    expect(page).not.toMatch(/\bfetch\(/);
    // Hook hits the canonical endpoint with the canonical payload fields
    expect(hook).toContain("fetch('/api/trading/order'");
    expect(hook).toMatch(/symbol[\s\S]{0,80}side[\s\S]{0,80}quantity[\s\S]{0,80}orderType/);
    // Server response is authoritative — errors surface the canonical message
    expect(hook).toMatch(/data\.error\?\.(message|code)/);
  });

  // ---- Test 2: no direct broker execution ----
  it('does not call PaperBroker/OrderManager/TradingEngine directly from the UI', () => {
    const page = getPageSource();
    expect(page).not.toMatch(/from ['"][^'"]*(PaperBroker|OrderManager|TradingEngine|RiskManager|PositionSizer|TradeCapitalAllocation)['"]/);
    expect(page).not.toMatch(/submitOrder|processMarketData|setEmergencyStop|executeOrder/);
    // Only canonical read-only TYPE imports are used
    expect(page).toContain("import type { Order, OrderType } from '../lib/trading/types/trading'");
    expect(page).toContain("import type { BrokerPosition } from '../lib/trading/execution/BrokerAdapter'");
  });

  // ---- Test 3: BUY flow reaches the canonical API ----
  it('renders the BUY ticket wired to the canonical payload (BUY default)', () => {
    loadTradingState();
    const html = renderPage();
    expect(html).toContain('Gửi Lệnh Mua 100 HPG');
    const page = getPageSource();
    // Canonical payload fields only — no client-invented risk/sizing fields
    expect(page).toMatch(/mutateAsync\(\{\s*symbol: canonicalSymbol,\s*side,\s*quantity: shares,\s*orderType,/);
    expect(page).not.toMatch(/riskApprovedCapital|positionSizing|capitalAllocation/);
  });

  // ---- Test 4 + 5: SELL rules / no short selling ----
  it('surfaces canonical SELL position context without bypassing no-short rules', () => {
    const page = getPageSource();
    // Display-only canonical position context panel exists for SELL
    expect(page).toContain("side === 'SELL'");
    expect(page).toContain('INSUFFICIENT_POSITION');
    expect(page).toContain('Bán khống bị cấm');
    // The UI cannot alter server risk state or fabricate positions
    expect(page).not.toMatch(/setEmergencyStop|isTradingEnabled\s*=|positions\.push/);
    // Canonical position quantity is displayed fail-closed, not invented
    expect(page).toContain('formatAmount(positionForSymbol.quantity)');
  });

  // ---- Test 6: invalid quantity ----
  it('keeps server-aligned board-lot validation before submission (no silent rounding)', () => {
    const page = getPageSource();
    expect(page).toContain('shares % 100 !== 0');
    expect(page).toContain('Number.isInteger(shares)');
    // No client-side authoritative sizing formula (e.g. quantity = capital / price)
    expect(page).not.toMatch(/shares\s*=\s*\w+\s*\/\s*(price|limitPrice|lastPrice)/i);
    expect(page).not.toMatch(/Math\.(floor|round|ceil)\(\s*\w+\s*\/\s*(price|limitPrice)/);
  });

  // ---- Test 7: invalid price ----
  it('rejects invalid LIMIT price for UX and never fabricates a valid price', () => {
    const page = getPageSource();
    expect(page).toContain('!isFiniteNumber(limitPrice) || limitPrice <= 0');
    expect(page).toContain('Giá không hợp lệ sẽ không được tự động thay thế');
    // No market-data or zero fallback replaces the user price client-side
    expect(page).not.toMatch(/limitPrice\s*\|\|\s*\d/);
    // limitPrice reaches the canonical API for authoritative price-band validation
    expect(getHookSource()).toContain('limitPrice?: number');
  });

  // ---- Test 8: zero is valid data ----
  it('preserves contract-valid zero values (zero cash renders 0, order count 0 is valid empty)', () => {
    loadTradingState();
    hooksMock.portfolio.data = makeAccount({
      cash: 0, availableCash: 0, equity: 0, marketValue: 0,
    });
    const html = renderPage();
    expect(html).toContain('0.00 tr VND');
    expect(html).toContain('Chưa có lệnh nào');
    // No fabricated default cash (the removed ?? 100000000 fallback)
    expect(html).not.toContain('100 tr VND');
  });

  // ---- Test 9: null ----
  it('renders — for null account values (never a fabricated number)', () => {
    loadTradingState();
    hooksMock.portfolio.data = makeAccount({
      availableCash: null as unknown as number,
      equity: null as unknown as number,
    });
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain('tr VND');
  });

  // ---- Test 10: undefined ----
  it('blocks submission with an explicit unavailable state when engine status is undefined', () => {
    loadTradingState();
    hooksMock.status.data = undefined;
    const html = renderPage();
    // Submission is blocked and the explicit blocked state is rendered
    expect(html).toContain('Gửi lệnh bị chặn');
    expect(html).toContain('Trạng thái TradingEngine chưa sẵn sàng');
    expect(html).toMatch(/disabled/);
  });

  // ---- Test 11: NaN ----
  it('renders — for NaN values (never the string NaN in markup)', () => {
    loadTradingState();
    hooksMock.portfolio.data = makeAccount({
      availableCash: NaN,
      equity: NaN,
    });
    hooksMock.orders.data = [makeOrder({ quantity: NaN })];
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain('NaN');
  });

  // ---- Test 12: Infinity ----
  it('renders — for ±Infinity values (never the string Infinity in markup)', () => {
    loadTradingState();
    hooksMock.portfolio.data = makeAccount({
      availableCash: Infinity,
      equity: -Infinity,
    });
    hooksMock.orders.data = [makeOrder({ limitPrice: Infinity })];
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain('Infinity');
  });

  // ---- Test 13: risk rejection ----
  it('surfaces canonical risk rejections verbatim and styles REJECTED status distinctly', () => {
    const page = getPageSource();
    // Canonical rejection message flows from the server response to the banner
    expect(page).toMatch(/err instanceof Error\s*\?\s*err\.message/);
    expect(page).not.toMatch(/catch[^}]*setSuccessMessage/); // rejection ≠ success
    loadTradingState();
    hooksMock.orders.data = [makeOrder({ status: 'REJECTED', rejectedReason: 'RISK_REJECTED' })];
    const html = renderPage();
    expect(html).toContain('REJECTED');
  });

  // ---- Test 14: insufficient capital / canonical rejection path ----
  it('does not reinterpret rejection as success (canonical rejection path only)', () => {
    const page = getPageSource();
    // Success is set ONLY inside the try branch after the server accepts
    const tryIdx = page.indexOf('try {');
    const catchIdx = page.indexOf('catch (err: unknown)');
    const cancelIdx = page.indexOf('const handleCancelOrder');
    const successIdx = page.indexOf('đã được tiếp nhận'); // canonical acceptance message
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    expect(successIdx).toBeGreaterThan(tryIdx);
    expect(successIdx).toBeLessThan(catchIdx);
    // No fabricated success text in the place-order catch path
    expect(page.slice(catchIdx, cancelIdx)).not.toContain('setSuccessMessage');
  });

  // ---- Test 15: trading disabled ----
  it('blocks submission and shows HALTED when tradingEnabled is false', () => {
    loadTradingState();
    hooksMock.status.data = makeStatus({ tradingEnabled: false });
    const html = renderPage();
    expect(html).toContain('Gửi lệnh bị chặn');
    expect(html).toContain('Giao dịch đang bị TẮT trên TradingEngine');
    expect(html).toContain('HALTED');
    expect(html).toMatch(/disabled/); // submit button carries the disabled attribute
  });

  // ---- Test 16: emergency stop ----
  it('blocks submission and shows EMERGENCY STOP state from the canonical status', () => {
    loadTradingState();
    hooksMock.status.data = makeStatus({ emergencyStop: true });
    const html = renderPage();
    expect(html).toContain('KHẨN CẤP: Emergency Stop');
    expect(html).toContain('Gửi lệnh bị chặn');
    expect(html).toContain('EMERGENCY STOP');
    expect(html).toMatch(/disabled/);
  });

  // ---- Test 17: duplicate submission protection ----
  it('prevents duplicate submissions while the mutation is pending (UX-level)', () => {
    loadTradingState();
    hooksMock.placeOrder.isPending = true;
    const html = renderPage();
    expect(html).toContain('Đang gửi lệnh vào engine...');
    expect(html).toMatch(/disabled/);
    // Handler-level guard + server remains authoritative
    const page = getPageSource();
    expect(page).toContain('if (placeOrderMutation.isPending) return;');
    expect(page).toMatch(/UX only; the server remains authoritative/);
  });

  // ---- Test 18: API error is not a successful empty state ----
  it('renders an explicit unavailable panel when the order book fetch fails (not empty success)', () => {
    hooksMock.orders.data = undefined;
    hooksMock.orders.isError = true;
    const html = renderPage();
    expect(html).toContain('Không tải được sổ lệnh');
    expect(html).toContain('Thử lại');
    expect(html).not.toContain('Chưa có lệnh nào');
    expect(html).not.toContain('100 tr VND');
    // A stale order book (cached data + error) still displays canonical rows
    hooksMock.orders.data = [makeOrder({ id: 'O1', status: 'SUBMITTED' })];
    const staleHtml = renderPage();
    expect(staleHtml).toContain('SUBMITTED');
  });

  // ---- Test 19: canonical order status verbatim ----
  it('displays server-provided canonical order statuses verbatim', () => {
    loadTradingState();
    hooksMock.orders.data = [
      makeOrder({ id: 'O1', status: 'SUBMITTED' }),
      makeOrder({ id: 'O2', status: 'FILLED', type: 'MARKET', limitPrice: null }),
      makeOrder({ id: 'O3', status: 'PARTIALLY_FILLED' }),
      makeOrder({ id: 'O4', status: 'CANCELLED' }),
    ];
    const html = renderPage();
    for (const status of ['SUBMITTED', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED']) {
      expect(html).toContain(status);
    }
  });

  // ---- Test 20: cancel uses the canonical cancel API ----
  it('offers cancel only for SUBMITTED orders via the canonical cancel endpoint', () => {
    loadTradingState();
    hooksMock.orders.data = [
      makeOrder({ id: 'O1', status: 'SUBMITTED' }),
      makeOrder({ id: 'O2', status: 'FILLED' }),
    ];
    const html = renderPage();
    // Exactly one cancel affordance — only for the SUBMITTED order
    expect(html.match(/Hủy</g)?.length).toBe(1);
    const page = getPageSource();
    expect(page).toContain('cancelOrderMutation.mutateAsync(orderId)');
    expect(page).toContain("ord.status === 'SUBMITTED'");
    // Non-canonical 'PENDING' status must not be referenced
    expect(page).not.toContain("'PENDING'");
    expect(getHookSource()).toContain("fetch('/api/trading/cancel'");
  });

  // ---- Test 21: no fabricated fill ----
  it('never fabricates FILLED from a submission response (server status is displayed)', () => {
    loadTradingState();
    hooksMock.placeOrder.isPending = true;
    hooksMock.orders.data = [];
    const html = renderPage();
    // Pending submission shows pending state only — no fill claim
    expect(html).toContain('Đang gửi lệnh vào engine...');
    expect(html).not.toContain('FILLED');
    const page = getPageSource();
    // Success message uses the server-returned order status, never a literal
    expect(page).toMatch(/setSuccessMessage\([\s\S]*result\.status/);
    expect(page).not.toMatch(/setSuccessMessage\([^)]*'FILLED'/);
  });

  // ---- Test 22: query invalidation follows the existing strategy ----
  it('invalidates the canonical trading cache after order/cancel operations', () => {
    const hook = getHookSource();
    const matches = hook.match(/invalidateQueries\(\{ queryKey: TRADING_KEYS\.all \}\)/g);
    expect(matches?.length).toBe(2); // place + cancel mutations reuse the existing strategy
    expect(hook).not.toMatch(/queryClient\.setQueryData/); // no optimistic fabrication
  });

  // ---- Test 23: symbol identity ----
  it('preserves the canonical ticker (trim/uppercase only, verbatim rendering)', () => {
    loadTradingState();
    hooksMock.orders.data = [makeOrder({ symbol: 'FPT' })];
    const html = renderPage();
    expect(html).toContain('FPT');
    const page = getPageSource();
    // Same normalization the server applies — no alternative mapping layer
    expect(page).toContain('const canonicalSymbol = symbol.trim().toUpperCase();');
    expect(page).toContain('openQuickView(ord.symbol)');
    expect(page).not.toMatch(/symbolMap|aliasMap|symbolAliases/);
  });

  // ---- Test 24: no frontend financial formulas ----
  it('computes no risk, allocation, position size, buying power, P&L or exposure in React', () => {
    const page = getPageSource();
    expect(page).not.toMatch(/Math\.floor|Math\.round|Math\.ceil/);
    expect(page).not.toMatch(/buyingPower|exposure\s*=|riskApprovedCapital|positionSizing/);
    expect(page).not.toMatch(/quantity\s*\/\s*price|price\s*\*\s*quantity/);
    expect(page).not.toMatch(/\|\|\s*0|\?\?\s*0(?![.])/); // no fabricated financial zeros
    expect(page).not.toMatch(/as any/);
    expect(page).not.toMatch(/dangerouslySetInnerHTML/);
    // The only numeric presentation helpers are the shared fail-closed formatters
    expect(page).toContain("from './portfolio/metrics'");
  });
});

