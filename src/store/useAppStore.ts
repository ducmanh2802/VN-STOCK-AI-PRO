import { create } from 'zustand';

export interface AppState {
  currentView: string;
  selectedStockSymbol: string | null;
  quickViewModalOpen: boolean;
  watchlistSymbols: string[];
  theme: 'dark' | 'light';

  // Actions
  setCurrentView: (view: string) => void;
  setSelectedStockSymbol: (symbol: string | null) => void;
  openQuickView: (symbol: string) => void;
  closeQuickView: () => void;
  toggleWatchlist: (symbol: string) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  isWatchlisted: (symbol: string) => boolean;
  navigateToStock: (symbol: string) => void;
  navigateToDashboard: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

const DEFAULT_WATCHLIST = ['HPG', 'VCB', 'FPT', 'MWG', 'VNM', 'SSI', 'TCB', 'MBB'];

function getInitialWatchlist(): string[] {
  try {
    const raw = localStorage.getItem('vnstock_watchlist_symbols');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_WATCHLIST;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  selectedStockSymbol: null,
  quickViewModalOpen: false,
  watchlistSymbols: getInitialWatchlist(),
  theme: 'dark',

  setCurrentView: (view: string) => set({ currentView: view }),

  setSelectedStockSymbol: (symbol: string | null) => set({ selectedStockSymbol: symbol }),

  openQuickView: (symbol: string) =>
    set({
      selectedStockSymbol: symbol.toUpperCase(),
      quickViewModalOpen: true,
    }),

  closeQuickView: () =>
    set({
      quickViewModalOpen: false,
    }),

  toggleWatchlist: (symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    const current = get().watchlistSymbols;
    const exists = current.includes(clean);
    const updated = exists ? current.filter((s) => s !== clean) : [...current, clean];
    try {
      localStorage.setItem('vnstock_watchlist_symbols', JSON.stringify(updated));
    } catch {
      // ignore
    }
    set({ watchlistSymbols: updated });
  },

  addToWatchlist: (symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    const current = get().watchlistSymbols;
    if (!current.includes(clean)) {
      const updated = [...current, clean];
      try {
        localStorage.setItem('vnstock_watchlist_symbols', JSON.stringify(updated));
      } catch {
        // ignore
      }
      set({ watchlistSymbols: updated });
    }
  },

  removeFromWatchlist: (symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    const current = get().watchlistSymbols;
    const updated = current.filter((s) => s !== clean);
    try {
      localStorage.setItem('vnstock_watchlist_symbols', JSON.stringify(updated));
    } catch {
      // ignore
    }
    set({ watchlistSymbols: updated });
  },

  isWatchlisted: (symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    return get().watchlistSymbols.includes(clean);
  },

  navigateToStock: (symbol: string) =>
    set({
      currentView: 'stock-detail',
      selectedStockSymbol: symbol.trim().toUpperCase(),
      quickViewModalOpen: false,
    }),

  navigateToDashboard: () =>
    set({
      currentView: 'dashboard',
      selectedStockSymbol: null,
      quickViewModalOpen: false,
    }),

  setTheme: (theme: 'dark' | 'light') => set({ theme }),
}));

export function resolveRouteFromPath(pathname: string): { currentView: string; selectedStockSymbol: string | null } {
  const clean = (pathname || '/').toLowerCase();
  if (clean.startsWith('/stocks/') || clean.startsWith('/stock/')) {
    const parts = pathname.split('/');
    const symbol = parts[2]?.toUpperCase() || 'HPG';
    return { currentView: 'stock-detail', selectedStockSymbol: symbol };
  }
  if (clean === '/market') return { currentView: 'market', selectedStockSymbol: null };
  if (clean === '/screener' || clean === '/stocks') return { currentView: 'screener', selectedStockSymbol: null };
  if (clean === '/watchlist') return { currentView: 'watchlist', selectedStockSymbol: null };
  if (clean === '/portfolio') return { currentView: 'portfolio', selectedStockSymbol: null };
  if (clean === '/trading' || clean === '/paper-trading') return { currentView: 'paper-trading', selectedStockSymbol: null };
  if (clean === '/risk' || clean === '/risk-center') return { currentView: 'risk-center', selectedStockSymbol: null };
  if (clean === '/recommendations') return { currentView: 'recommendations', selectedStockSymbol: null };
  if (clean === '/ai-analyst') return { currentView: 'ai-analyst', selectedStockSymbol: null };
  if (clean === '/journal') return { currentView: 'journal', selectedStockSymbol: null };
  if (clean === '/backtest') return { currentView: 'backtest', selectedStockSymbol: null };
  if (clean === '/strategy' || clean === '/strategy-lab') return { currentView: 'strategy-lab', selectedStockSymbol: null };
  if (clean === '/fundamentals') return { currentView: 'fundamentals', selectedStockSymbol: null };
  if (clean === '/news' || clean === '/news-macro') return { currentView: 'news-macro', selectedStockSymbol: null };
  if (clean === '/settings') return { currentView: 'settings', selectedStockSymbol: null };
  if (clean === '/learn') return { currentView: 'learn', selectedStockSymbol: null };
  return { currentView: 'dashboard', selectedStockSymbol: null };
}

