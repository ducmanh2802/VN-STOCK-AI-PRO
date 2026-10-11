import { create } from 'zustand';

export interface AppState {
  currentView: string;
  selectedStockSymbol: string | null;
  quickViewModalOpen: boolean;
  searchQuery: string;
  sidebarCollapsed: boolean;
  watchlistSymbols: string[];

  // Actions
  setCurrentView: (view: string) => void;
  setSelectedStockSymbol: (symbol: string | null) => void;
  openQuickView: (symbol: string) => void;
  closeQuickView: () => void;
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleWatchlist: (symbol: string) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  isWatchlisted: (symbol: string) => boolean;
  navigateToStock: (symbol: string) => void;
  navigateToDashboard: () => void;
}

const STORAGE_KEY = 'vn_stock_ai_watchlist';

/**
 * Direct-path -> view id. The app renders views from this store rather than from a
 * router, so without this table a deep link, a bookmark, a shared URL or a browser
 * refresh lands on the dashboard no matter what was asked for: the server correctly
 * serves index.html for /portfolio, and the client then ignored it.
 *
 * `dashboard` is deliberately absent — `/`, `/dashboard` and anything unrecognised all
 * resolve to it, which is the pre-existing behaviour for an unknown path.
 */
const PATH_TO_VIEW: Readonly<Record<string, string>> = {
  '/dashboard': 'dashboard',
  '/market': 'market',
  '/sector-intelligence': 'sector-intelligence',
  '/watchlist': 'watchlist',
  '/screener': 'screener',
  '/stocks': 'stocks',
  '/portfolio': 'portfolio',
  '/risk-center': 'risk-center',
  '/paper-trading': 'paper-trading',
  '/data-status': 'data-status',
  '/recommendations': 'recommendations',
  '/ai-analyst': 'ai-analyst',
  '/learn': 'learn',
  '/learn-path': 'learn-path',
  '/learn-lesson': 'learn-lesson',
  '/practice-lab': 'practice-lab',
  '/journal': 'journal',
  '/strategy-lab': 'strategy-lab',
  '/backtest': 'backtest',
  '/fundamentals': 'fundamentals',
  '/news-macro': 'news-macro',
  '/settings': 'settings',
};

/**
 * Inverse of PATH_TO_VIEW. `setCurrentView` mirrors a view transition into the
 * address bar through this table so the browser back/forward buttons work for
 * in-app navigation, not only for the stock and dashboard deep links. Views with
 * no standalone route (e.g. `stock-detail`) are deliberately absent: they are
 * reached through `navigateToStock`, which owns the `/stock/:symbol` path.
 */
const VIEW_TO_PATH: Readonly<Record<string, string>> = {
  dashboard: '/dashboard',
  market: '/market',
  'sector-intelligence': '/sector-intelligence',
  watchlist: '/watchlist',
  screener: '/screener',
  stocks: '/stocks',
  portfolio: '/portfolio',
  'risk-center': '/risk-center',
  'paper-trading': '/paper-trading',
  'data-status': '/data-status',
  recommendations: '/recommendations',
  'ai-analyst': '/ai-analyst',
  learn: '/learn',
  'learn-path': '/learn-path',
  'learn-lesson': '/learn-lesson',
  'practice-lab': '/practice-lab',
  journal: '/journal',
  'strategy-lab': '/strategy-lab',
  backtest: '/backtest',
  fundamentals: '/fundamentals',
  'news-macro': '/news-macro',
  settings: '/settings',
};

/**
 * Pushes the path that names `view` unless the address bar already shows it.
 * The equality guard matters: without it, re-clicking the active sidebar tab
 * (or the mobile bar) would append a duplicate history entry every time, so a
 * single Browser Back would appear to do nothing.
 */
const syncViewToUrl = (view: string): void => {
  if (typeof window === 'undefined') return;
  const path = VIEW_TO_PATH[view];
  if (!path) return;
  if ((window.location.pathname.replace(/\/+$/, '') || '/') === path) return;
  window.history.pushState(null, '', path);
};

const parseInitialRoute = (): { view: string; symbol: string | null } => {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const stockMatch = path.match(/^\/stock\/([a-zA-Z0-9_-]+)/i);
    if (stockMatch) {
      return { view: 'stock-detail', symbol: stockMatch[1].toUpperCase() };
    }
    const mapped = PATH_TO_VIEW[path.toLowerCase()];
    if (mapped) {
      return { view: mapped, symbol: null };
    }
  }
  return { view: 'dashboard', symbol: null };
};

/**
 * Resolves a pathname to the store slice it describes. Exported so the popstate
 * listener in App.tsx and the initial load cannot drift apart into two different
 * route tables.
 */
export function resolveRouteFromPath(pathname: string): {
  currentView: string;
  selectedStockSymbol: string | null;
  quickViewModalOpen: false;
} {
  const path = pathname.replace(/\/+$/, '') || '/';
  const stockMatch = path.match(/^\/stock\/([a-zA-Z0-9_-]+)/i);
  if (stockMatch) {
    return {
      currentView: 'stock-detail',
      selectedStockSymbol: stockMatch[1].toUpperCase(),
      quickViewModalOpen: false,
    };
  }
  return {
    currentView: PATH_TO_VIEW[path.toLowerCase()] ?? 'dashboard',
    selectedStockSymbol: null,
    quickViewModalOpen: false,
  };
}

const initialRoute = parseInitialRoute();

const hasLocalStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getInitialWatchlist = (): string[] => {
  // Guarded: this module is evaluated at import time, and importing it in a
  // Node/SSR context (tests, prerender) must not throw ReferenceError.
  if (!hasLocalStorage()) return ['HPG', 'FPT', 'SSI', 'MWG', 'TCB', 'VNM'];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Could not read watchlist from localStorage:', e);
  }
  return ['HPG', 'FPT', 'SSI', 'MWG', 'TCB', 'VNM'];
};

const saveWatchlist = (list: string[]) => {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Could not persist watchlist to localStorage:', e);
  }
};

export const useAppStore = create<AppState>((set, get) => ({
  currentView: initialRoute.view,
  selectedStockSymbol: initialRoute.symbol,
  quickViewModalOpen: false,
  searchQuery: '',
  sidebarCollapsed: false,
  watchlistSymbols: getInitialWatchlist(),

  setCurrentView: (view: string) => {
    syncViewToUrl(view);
    set({ currentView: view });
  },

  setSelectedStockSymbol: (symbol: string | null) => set({ selectedStockSymbol: symbol }),

  navigateToStock: (symbol: string) => {
    const upper = symbol.toUpperCase();
    const path = `/stock/${upper}`;
    if (typeof window !== 'undefined' && (window.location.pathname.replace(/\/+$/, '') || '/') !== path) {
      window.history.pushState(null, '', path);
    }
    set({
      currentView: 'stock-detail',
      selectedStockSymbol: upper,
      quickViewModalOpen: false,
    });
  },

  navigateToDashboard: () => {
    syncViewToUrl('dashboard');
    set({
      currentView: 'dashboard',
      selectedStockSymbol: null,
      quickViewModalOpen: false,
    });
  },

  openQuickView: (symbol: string) =>
    set({
      selectedStockSymbol: symbol,
      quickViewModalOpen: true,
    }),

  closeQuickView: () =>
    set({
      selectedStockSymbol: null,
      quickViewModalOpen: false,
    }),

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),

  toggleWatchlist: (symbol: string) => {
    const upper = symbol.toUpperCase();
    const current = get().watchlistSymbols;
    const exists = current.includes(upper);
    const updated = exists ? current.filter((s) => s !== upper) : [...current, upper];
    saveWatchlist(updated);
    set({ watchlistSymbols: updated });
  },

  addToWatchlist: (symbol: string) => {
    const upper = symbol.toUpperCase();
    const current = get().watchlistSymbols;
    if (!current.includes(upper)) {
      const updated = [...current, upper];
      saveWatchlist(updated);
      set({ watchlistSymbols: updated });
    }
  },

  removeFromWatchlist: (symbol: string) => {
    const upper = symbol.toUpperCase();
    const current = get().watchlistSymbols;
    const updated = current.filter((s) => s !== upper);
    saveWatchlist(updated);
    set({ watchlistSymbols: updated });
  },

  isWatchlisted: (symbol: string) => {
    return get().watchlistSymbols.includes(symbol.toUpperCase());
  },
}));
