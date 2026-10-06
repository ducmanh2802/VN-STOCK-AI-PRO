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

const getInitialWatchlist = (): string[] => {
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

  setCurrentView: (view: string) => set({ currentView: view }),

  setSelectedStockSymbol: (symbol: string | null) => set({ selectedStockSymbol: symbol }),

  navigateToStock: (symbol: string) => {
    const upper = symbol.toUpperCase();
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/stock/${upper}`);
    }
    set({
      currentView: 'stock-detail',
      selectedStockSymbol: upper,
      quickViewModalOpen: false,
    });
  },

  navigateToDashboard: () => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/dashboard');
    }
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
