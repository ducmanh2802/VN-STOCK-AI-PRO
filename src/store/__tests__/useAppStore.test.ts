import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The store is a module-level singleton whose route parser reads `window` at import
 * time, so a minimal browser global is installed BEFORE the dynamic import below.
 * A `jsdom` environment is not configured for this repo (vitest runs in `node`), and
 * the store already guards every `window` access — which means these assertions also
 * cover the "no browser" branch implicitly.
 */
const location = { pathname: '/' };
const pushState = vi.fn((_state: unknown, _title: string, url?: string) => {
  if (url) location.pathname = url;
});

(globalThis as unknown as { window: unknown }).window = {
  location,
  history: { pushState },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};

const { useAppStore, resolveRouteFromPath } = await import('../useAppStore');

beforeEach(() => {
  location.pathname = '/';
  pushState.mockClear();
  useAppStore.setState({
    currentView: 'dashboard',
    selectedStockSymbol: null,
    quickViewModalOpen: false,
  });
});

describe('resolveRouteFromPath', () => {
  it('maps a known deep link to its view and strips trailing slashes', () => {
    expect(resolveRouteFromPath('/market').currentView).toBe('market');
    expect(resolveRouteFromPath('/portfolio/').currentView).toBe('portfolio');
  });

  it('maps /dashboard explicitly rather than via the fallback', () => {
    expect(resolveRouteFromPath('/dashboard').currentView).toBe('dashboard');
  });

  it('parses a stock detail path and upper-cases the symbol', () => {
    const route = resolveRouteFromPath('/stock/hpg');
    expect(route.currentView).toBe('stock-detail');
    expect(route.selectedStockSymbol).toBe('HPG');
  });

  it('falls back to the dashboard for an unknown path', () => {
    expect(resolveRouteFromPath('/this-view-does-not-exist').currentView).toBe('dashboard');
  });
});

describe('setCurrentView keeps the address bar in sync', () => {
  it('pushes the matching path and updates the active view', () => {
    useAppStore.getState().setCurrentView('market');
    expect(useAppStore.getState().currentView).toBe('market');
    expect(pushState).toHaveBeenCalledWith(null, '', '/market');
    expect(location.pathname).toBe('/market');
  });

  it('does not grow the history stack when re-selecting the active view', () => {
    useAppStore.getState().setCurrentView('market');
    pushState.mockClear();
    useAppStore.getState().setCurrentView('market');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('does not touch the URL for a view that has no standalone route', () => {
    useAppStore.getState().setCurrentView('stock-detail');
    expect(useAppStore.getState().currentView).toBe('stock-detail');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('round-trips every pushed view back through the path parser', () => {
    for (const view of ['market', 'watchlist', 'portfolio', 'backtest', 'settings']) {
      location.pathname = '/';
      useAppStore.getState().setCurrentView(view);
      expect(resolveRouteFromPath(location.pathname).currentView).toBe(view);
    }
  });
});

describe('navigateToStock and navigateToDashboard', () => {
  it('pushes /stock/:symbol and stores the upper-cased symbol', () => {
    useAppStore.getState().navigateToStock('fpt');
    expect(pushState).toHaveBeenCalledWith(null, '', '/stock/FPT');
    expect(useAppStore.getState().currentView).toBe('stock-detail');
    expect(useAppStore.getState().selectedStockSymbol).toBe('FPT');
  });

  it('does not duplicate the path for the same stock', () => {
    useAppStore.getState().navigateToStock('FPT');
    pushState.mockClear();
    useAppStore.getState().navigateToStock('FPT');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('navigateToDashboard clears the symbol and pushes /dashboard', () => {
    useAppStore.getState().navigateToStock('FPT');
    pushState.mockClear();
    useAppStore.getState().navigateToDashboard();
    expect(pushState).toHaveBeenCalledWith(null, '', '/dashboard');
    expect(useAppStore.getState().selectedStockSymbol).toBeNull();
    expect(useAppStore.getState().currentView).toBe('dashboard');
  });
});
