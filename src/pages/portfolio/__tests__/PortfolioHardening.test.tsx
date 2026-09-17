import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UNAVAILABLE,
  formatAmount,
  formatMillionsVND,
  formatSignedMillionsVND,
  formatSignedPercent,
} from '../metrics';
import { PortfolioPage } from '../../PortfolioPage';
import type { BrokerPosition, BrokerAccount } from '../../../lib/trading/execution/BrokerAdapter';

// Portfolio/Positions page state is driven by the market-queries hooks.
// Controlling them at the hook boundary lets each test render the REAL page
// branch (loading, data, empty, error) without a DOM environment or network.
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
  status: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: () => {},
  },
}));

// Query invocation counters — used to prove there is no N+1 request pattern.
const hookCalls = vi.hoisted(() => ({ portfolio: 0, positions: 0, status: 0 }));

// Navigation spy — used to prove canonical ticker preservation.
const openQuickViewMock = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useMarketQueries', () => ({
  useTradingPortfolio: () => {
    hookCalls.portfolio += 1;
    return hooksMock.portfolio;
  },
  useTradingPositions: () => {
    hookCalls.positions += 1;
    return hooksMock.positions;
  },
  useTradingStatus: () => {
    hookCalls.status += 1;
    return hooksMock.status;
  },
}));

vi.mock('../../../store/useAppStore', () => ({
  useAppStore: () => ({
    openQuickView: openQuickViewMock,
    setCurrentView: vi.fn(),
  }),
}));

const renderPage = () => renderToStaticMarkup(<PortfolioPage />);

const resetAll = () => {
  Object.assign(hooksMock.portfolio, {
    data: undefined, isLoading: false, isError: false, error: null,
  });
  Object.assign(hooksMock.positions, {
    data: undefined, isLoading: false, isError: false, error: null,
  });
  Object.assign(hooksMock.status, {
    data: undefined, isLoading: false, isError: false, error: null,
  });
  hookCalls.portfolio = 0;
  hookCalls.positions = 0;
  hookCalls.status = 0;
  openQuickViewMock.mockClear();
};

// Server-shaped fixture matching the canonical BrokerPosition contract
// (structure mirrors the real contract; values are test data only).
const makePosition = (overrides: Partial<BrokerPosition> = {}): BrokerPosition => ({
  symbol: 'FPT',
  quantity: 1000,
  reservedQuantity: 0,
  availableQuantity: 1000,
  averageCost: 120000,
  currentPrice: 132000,
  marketValue: 132000000,
  unrealizedPnL: 12000000,
  unrealizedPnLPercent: 10,
  updatedAt: '2026-09-17T10:00:00.000Z',
  ...overrides,
});

const makeAccount = (overrides: Partial<BrokerAccount> = {}): BrokerAccount => ({
  accountId: 'paper-001',
  currency: 'VND',
  cash: 50_000_000,
  reservedCash: 0,
  availableCash: 50_000_000,
  marketValue: 132_000_000,
  equity: 182_000_000,
  realizedPnL: 0,
  unrealizedPnL: 12_000_000,
  positions: [],
  openOrders: [],
  updatedAt: '2026-09-17T10:00:00.000Z',
  ...overrides,
});

const makeStatus = () => ({
  tradingEnabled: true,
  emergencyStop: false,
  brokerMode: 'PAPER',
  session: 'validated',
});

const loadCanonicalState = () => {
  hooksMock.portfolio.data = makeAccount();
  hooksMock.positions.data = [makePosition()];
  hooksMock.status.data = makeStatus();
};

const getPageSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, '../../PortfolioPage.tsx'), 'utf-8');
};

// Regex fragments built without raw quote characters (kept parser-safe).
const QUOTE = String.fromCharCode(39, 34); // ' and "
const noEngineImport = new RegExp(`from [${QUOTE}][^${QUOTE}]*(PaperBroker|OrderManager|TradingEngine)[${QUOTE}]`);

/**
 * PHASE 19.5.6 — Portfolio / Positions UI Hardening & Canonical Trading-State
 * Integration Test Suite. Covers the 18 required verifications.
 */
describe('Phase 19.5.6 — Portfolio/Positions Hardening', () => {
  beforeEach(() => resetAll());

  // ---- Test 1: canonical values ----
  it('displays canonical backend values verbatim (presentation-only formatting)', () => {
    loadCanonicalState();
    const html = renderPage();
    // Account values from BrokerAccount — formatted but never recomputed
    expect(html).toContain('182.00 tr');   // equity
    expect(html).toContain('+12.00 tr');   // unrealizedPnL (signed)
    expect(html).toContain('132.00 tr');   // marketValue
    expect(html).toContain('50.00 tr');    // availableCash / cash
    // Position values from BrokerPosition
    expect(html).toContain('1.000');       // quantity (vi-VN grouping)
    expect(html).toContain('120.000');     // averageCost
    expect(html).toContain('132.000');     // currentPrice
    expect(html).toContain('+10.00%');     // unrealizedPnLPercent (signed)
    expect(html).toContain('FPT');
  });

  // ---- Test 2: no frontend calculations ----
  it('does not independently compute market value, P&L, return, exposure, or position size', () => {
    // Deliberately inconsistent values (impossible to derive from one another):
    // if the UI computed anything, output would differ from these figures.
    hooksMock.portfolio.data = makeAccount({
      cash: 77_777_777,
      availableCash: 66_666_666,
      marketValue: 55_555_555,
      equity: 44_444_444,
      unrealizedPnL: 33_333_333,
      realizedPnL: 22_222_222,
    });
    hooksMock.positions.data = [makePosition({
      quantity: 777,
      averageCost: 111_111,
      currentPrice: 222_222,
      marketValue: 999_999_999,
      unrealizedPnL: -12_345_678,
      unrealizedPnLPercent: -45.678,
    })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    // Canonical values render exactly as provided…
    expect(html).toContain('77.78 tr');    // cash
    expect(html).toContain('66.67 tr');    // availableCash
    expect(html).toContain('55.56 tr');    // marketValue
    expect(html).toContain('44.44 tr');    // equity
    expect(html).toContain('-12.35 tr');   // position unrealizedPnL
    expect(html).toContain('-45.68%');     // position unrealizedPnLPercent
    expect(html).toContain('1000.00 tr');  // position marketValue 999999999/1e6
    // …and no derived value appears anywhere in markup
    expect(html).not.toContain('172.71');  // 777 × 222.222 computed market value
    expect(html).not.toContain('86.33');   // 777 × 111.111 computed cost value
  });

  // ---- Test 3: zero is valid ----
  it('preserves valid zero values as zero (never — or N/A)', () => {
    hooksMock.portfolio.data = makeAccount({
      cash: 0, availableCash: 0, marketValue: 0, equity: 0,
      unrealizedPnL: 0, realizedPnL: 0,
    });
    hooksMock.positions.data = [];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain('0.00 tr');
    expect(html).toContain('ALL CASH');
    expect(html).not.toContain(UNAVAILABLE);
  });

  // ---- Test 4: null ----
  it('renders — for null financial values', () => {
    hooksMock.portfolio.data = makeAccount({
      cash: null as unknown as number,
      availableCash: null as unknown as number,
      equity: null as unknown as number,
      marketValue: null as unknown as number,
      unrealizedPnL: null as unknown as number,
      realizedPnL: null as unknown as number,
    });
    hooksMock.positions.data = [makePosition({
      marketValue: null,
      unrealizedPnL: null,
      unrealizedPnLPercent: null,
    })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain('0.00 tr');
  });

  // ---- Test 5: undefined ----
  it('renders — for undefined financial values', () => {
    hooksMock.portfolio.data = makeAccount({
      cash: undefined as unknown as number,
      unrealizedPnL: undefined as unknown as number,
    });
    hooksMock.positions.data = [makePosition({
      currentPrice: undefined,
      unrealizedPnL: undefined,
    })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).toContain('Tiền mặt KH dụng: — / —');
  });

  // ---- Test 6: NaN ----
  it('renders — for NaN financial values (never the string NaN)', () => {
    hooksMock.portfolio.data = makeAccount({
      equity: NaN, marketValue: NaN, unrealizedPnL: NaN,
    });
    hooksMock.positions.data = [makePosition({
      marketValue: NaN, unrealizedPnL: NaN, unrealizedPnLPercent: NaN,
    })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain('NaN');
  });

  // ---- Test 7: Infinity ----
  it('renders — for ±Infinity financial values', () => {
    hooksMock.portfolio.data = makeAccount({
      equity: Infinity, unrealizedPnL: -Infinity,
    });
    hooksMock.positions.data = [makePosition({
      unrealizedPnLPercent: Infinity,
      marketValue: -Infinity,
    })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain('Infinity');
  });

  // ---- Test 8: loading ----
  it('shows no fabricated financial values while loading', () => {
    hooksMock.portfolio.isLoading = true;
    hooksMock.positions.isLoading = true;
    const html = renderPage();
    expect(html).toContain('Đang đồng bộ');
    expect(html).not.toContain('0.00');
    expect(html).not.toContain(UNAVAILABLE);
    expect(html).not.toContain('GIÁ TRỊ DANH MỤC');
  });

  // ---- Test 9: valid empty portfolio distinct from error ----
  it('renders a valid empty portfolio as a distinct ALL CASH state (not error)', () => {
    hooksMock.portfolio.data = makeAccount();
    hooksMock.positions.data = [];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain('ALL CASH');
    expect(html).toContain('chưa có vị thế mở');
    expect(html).not.toContain('Không tải được');
    expect(html).not.toContain('ERROR');
  });

  // ---- Test 10: error does not become zero-valued portfolio ----
  it('does not render a zero-valued portfolio after an API error', () => {
    hooksMock.portfolio.isError = true;
    hooksMock.positions.isError = true;
    const html = renderPage();
    expect(html).toContain('ERROR');
    expect(html).toContain('Không tải được trạng thái vị thế');
    expect(html).not.toContain('0.00 tr');
    expect(html).toContain(UNAVAILABLE);
  });

  // ---- Test 11: DATA_UNAVAILABLE ----
  it('renders explicit DATA_UNAVAILABLE state when the server returns no data without error', () => {
    const html = renderPage();
    expect(html).toContain('DATA_UNAVAILABLE');
    // No fabricated zero portfolio on an unavailable feed
    expect(html).not.toContain('0.00 tr');
    expect(html).toContain(UNAVAILABLE);
  });

  // ---- Test 12: stale ----
  it('marks state as STALE when cached data exists alongside an error (existing contract)', () => {
    hooksMock.portfolio.data = makeAccount();
    hooksMock.portfolio.isError = true;
    hooksMock.positions.data = [makePosition()];
    hooksMock.positions.isError = true;
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain('STALE');
    // Stale canonical data is still displayed (with STALE status), never zeroed out
    expect(html).toContain('182.00 tr');
  });

  // ---- Test 13: provenance ----
  it('preserves server provenance (source, updatedAt) without frontend timestamps', () => {
    hooksMock.portfolio.data = makeAccount({ updatedAt: '2026-09-17T10:00:00.000Z' });
    hooksMock.positions.data = [makePosition()];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain('PaperBroker (Server-Authoritative)');
    expect(html).toContain('2026-09-17T10:00:00.000Z');
  });

  // ---- Test 14: symbol navigation identity ----
  it('preserves the canonical ticker into navigation (no remapping)', () => {
    hooksMock.portfolio.data = makeAccount();
    hooksMock.positions.data = [makePosition({ symbol: 'FPT' })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    // Canonical ticker rendered verbatim
    expect(html).toContain('FPT');
    // The row hands the exact canonical position symbol to navigation —
    // no normalization/mapping layer in between (structural proof).
    expect(getPageSource()).toContain('openQuickView(pos.symbol)');
  });

  // ---- Test 15: trading safety — no execution chain bypass in UI ----
  it('provides no order placement or execution path in the Portfolio UI', () => {
    hooksMock.portfolio.data = makeAccount();
    hooksMock.positions.data = [makePosition()];
    hooksMock.status.data = makeStatus();
    const src = getPageSource();
    // No mutation hooks / direct order submission anywhere in the page module
    expect(src).not.toMatch(/usePlaceTradingOrder|useCancelTradingOrder|useMutation/);
    expect(src).not.toMatch(/\bfetch\(/);
    // UI only navigates to the dedicated PaperTrading surface (header action);
    // the empty-state CTA (Test 9) is the only other navigation affordance.
    const html = renderPage();
    expect(html).toContain('Đặt lệnh mới');
  });

  // ---- Test 16: no live broker ----
  it('does not introduce live broker execution', () => {
    const src = getPageSource();
    // No engine/broker module imports at all; the ONLY canonical import is the
    // read-only BrokerPosition TYPE from the contract.
    expect(src).not.toMatch(noEngineImport);
    expect(src).toContain(`import type { BrokerPosition } from '../lib/trading/execution/BrokerAdapter'`);
    expect(src).not.toMatch(/submitOrder|cancelOrder|placeOrder|executeOrder/);
  });

  // ---- Test 17: query efficiency (no N+1) ----
  it('issues exactly 3 canonical queries — no per-position fetch loop (N+1)', () => {
    hooksMock.portfolio.data = makeAccount();
    hooksMock.positions.data = [
      makePosition(),
      makePosition({ symbol: 'VNM' }),
      makePosition({ symbol: 'HPG' }),
    ];
    hooksMock.status.data = makeStatus();
    renderPage();
    // One invocation per canonical hook regardless of position count
    expect(hookCalls.portfolio).toBe(1);
    expect(hookCalls.positions).toBe(1);
    expect(hookCalls.status).toBe(1);
  });

  // ---- Test 18: canonical position state ----
  it('sources positions from the authoritative BrokerPosition contract (not order arrays)', () => {
    hooksMock.portfolio.data = makeAccount();
    hooksMock.positions.data = [makePosition({ symbol: 'HPG', quantity: 500 })];
    hooksMock.status.data = makeStatus();
    const html = renderPage();
    expect(html).toContain('HPG');
    expect(html).toContain('500');
    expect(html).toContain('Danh mục vị thế nắm giữ (1)');
    // The page does not consume the orders endpoint to reconstruct positions
    expect(getPageSource()).not.toContain('useTradingOrders');
  });

  // ---- Fail-closed formatter unit checks ----
  it('fail-closed formatters: null/undefined/NaN/Infinity → —, zero preserved', () => {
    expect(formatAmount(null)).toBe(UNAVAILABLE);
    expect(formatAmount(undefined)).toBe(UNAVAILABLE);
    expect(formatAmount(NaN)).toBe(UNAVAILABLE);
    expect(formatAmount(Infinity)).toBe(UNAVAILABLE);
    expect(formatAmount(-Infinity)).toBe(UNAVAILABLE);
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(1000)).toBe('1.000');
    expect(formatMillionsVND(0)).toBe('0.00 tr');
    expect(formatMillionsVND(null)).toBe(UNAVAILABLE);
    expect(formatSignedMillionsVND(0)).toBe('0.00 tr');
    expect(formatSignedMillionsVND(-5_000_000)).toBe('-5.00 tr');
    expect(formatSignedMillionsVND(NaN)).toBe(UNAVAILABLE);
    expect(formatSignedPercent(0)).toBe('0.00%');
    expect(formatSignedPercent(9.656)).toBe('+9.66%');
    expect(formatSignedPercent(Infinity)).toBe(UNAVAILABLE);
  });
});

