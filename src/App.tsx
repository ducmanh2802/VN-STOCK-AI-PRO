import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  useMarketIndices,
  useMarketStatus,
  useMarketHeatmap,
  useSectorHeatmap,
  useTopMovers,
  useStocksList,
  useAIMarketSummary,
  useWatchlistData,
  useStockDetail,
  useRefreshMarket,
} from './hooks/useMarketQueries';
import { Header } from './components/common/Header';
import { Sidebar, ActiveNavView } from './components/common/Sidebar';
import { Footer } from './components/common/Footer';
import { StockQuickViewModal } from './components/stock/StockQuickViewModal';
import { DashboardPage } from './pages/DashboardPage';
import { MarketPage } from './pages/MarketPage';
import { StocksPage } from './pages/StocksPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { AIAnalystPage } from './pages/AIAnalystPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { PhasePlaceholderPage } from './pages/PhasePlaceholderPage';
import { LoadingState } from './components/ui/LoadingState';
import { ErrorState } from './components/ui/ErrorBoundary';
import { marketService } from './services/market';
import { LayoutDashboard, TrendingUp, BarChart3, Bookmark } from 'lucide-react';

export default function App() {
  // Zustand centralized application state
  const {
    currentView,
    setCurrentView,
    selectedStockSymbol,
    quickViewModalOpen,
    openQuickView,
    closeQuickView,
    watchlistSymbols,
    toggleWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    isWatchlisted,
    navigateToStock,
    navigateToDashboard,
  } = useAppStore();

  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);

  // Sync browser back/forward history buttons with app state
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const stockMatch = path.match(/^\/stock\/([a-zA-Z0-9_-]+)/i);
      if (stockMatch) {
        useAppStore.setState({
          currentView: 'stock-detail',
          selectedStockSymbol: stockMatch[1].toUpperCase(),
          quickViewModalOpen: false,
        });
      } else if (path.startsWith('/dashboard') || path === '/') {
        useAppStore.setState({
          currentView: 'dashboard',
          selectedStockSymbol: null,
          quickViewModalOpen: false,
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // TanStack Query Hooks for Asynchronous State Management
  const indicesQuery = useMarketIndices();
  const statusQuery = useMarketStatus();
  const sectorsQuery = useMarketHeatmap();
  const moversQuery = useTopMovers();
  const allStocksQuery = useStocksList();
  const aiSummaryQuery = useAIMarketSummary();
  const watchlistQuery = useWatchlistData(watchlistSymbols);
  const stockDetailQuery = useStockDetail(selectedStockSymbol);
  const refreshMarket = useRefreshMarket();

  const isLoading =
    indicesQuery.isLoading ||
    statusQuery.isLoading ||
    sectorsQuery.isLoading ||
    moversQuery.isLoading;

  const error =
    indicesQuery.error ||
    statusQuery.error ||
    sectorsQuery.error ||
    moversQuery.error;

  const handleSelectStock = useCallback(
    (symbol: string) => {
      openQuickView(symbol);
    },
    [openQuickView]
  );

  const handleSearchQuery = useCallback(async (query: string) => {
    return marketService.searchStocks(query);
  }, []);

  const indices = indicesQuery.data || [];
  const marketStatus = statusQuery.data || {
    state: 'TRADING' as const,
    stateLabel: 'ĐANG GIAO DỊCH' as const,
    sessionName: 'Khớp lệnh liên tục' as const,
    timestamp: new Date().toLocaleTimeString('vi-VN'),
    isDemo: true as const,
  };
  const sectors = sectorsQuery.data || [];
  const movers = moversQuery.data || { gainers: [], losers: [], active: [] };
  const allStocks = allStocksQuery.data || [];
  const aiSummary = aiSummaryQuery.data || null;
  const watchlistStocks = watchlistQuery.data || [];

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text-primary flex flex-col selection:bg-terminal-accent/30 selection:text-blue-200">
      {/* 1. Header with Tickers & Search */}
      <Header
        indices={indices}
        marketStatus={marketStatus}
        onSelectStock={handleSelectStock}
        onSearchQuery={handleSearchQuery}
        onToggleSidebar={() => setIsSidebarMobileOpen((prev) => !prev)}
        isSidebarOpen={isSidebarMobileOpen}
      />

      {/* 2. Main Content Layout with Sidebar */}
      <div className="flex-1 flex">
        {/* Navigation Sidebar */}
        <Sidebar
          currentView={currentView as ActiveNavView}
          onSelectView={(view) => {
            setCurrentView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          isOpenMobile={isSidebarMobileOpen}
          onCloseMobile={() => setIsSidebarMobileOpen(false)}
          watchlistCount={watchlistSymbols.length}
        />

        {/* Dynamic Page Container */}
        <main className="flex-1 min-w-0 lg:pl-64 flex flex-col">
          <div className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
            {/* Loading State */}
            {isLoading && (
              <div className="py-12">
                <LoadingState
                  variant="terminal"
                  message="Đang đồng bộ dữ liệu thị trường từ MarketDataProvider..."
                />
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="py-12">
                <ErrorState
                  error={error}
                  onRetry={() => refreshMarket()}
                />
              </div>
            )}

            {/* View Router */}
            {!isLoading && !error && (
              <>
                {currentView === 'dashboard' && (
                  <DashboardPage
                    indices={indices}
                    sectors={sectors}
                    gainers={movers.gainers}
                    losers={movers.losers}
                    active={movers.active}
                    watchlist={watchlistStocks}
                    aiSummary={aiSummary || undefined}
                    onSelectStock={handleSelectStock}
                    onAddToWatchlist={addToWatchlist}
                    onRemoveFromWatchlist={removeFromWatchlist}
                  />
                )}

                {currentView === 'market' && (
                  <MarketPage
                    indices={indices}
                    sectors={sectors}
                    gainers={movers.gainers}
                    losers={movers.losers}
                    active={movers.active}
                    onSelectStock={handleSelectStock}
                  />
                )}

                {currentView === 'stocks' && (
                  <StocksPage
                    allStocks={allStocks}
                    watchlistSymbols={watchlistSymbols}
                    onSelectStock={handleSelectStock}
                    onToggleWatchlist={toggleWatchlist}
                  />
                )}

                {currentView === 'watchlist' && (
                  <WatchlistPage
                    watchlist={watchlistStocks}
                    onSelectStock={handleSelectStock}
                    onAddToWatchlist={addToWatchlist}
                    onRemoveFromWatchlist={removeFromWatchlist}
                  />
                )}

                {currentView === 'ai-analyst' && aiSummary && (
                  <AIAnalystPage aiSummary={aiSummary} />
                )}

                {currentView === 'stock-detail' && (
                  <StockDetailPage
                    symbol={selectedStockSymbol || 'HPG'}
                    isWatchlisted={selectedStockSymbol ? isWatchlisted(selectedStockSymbol) : false}
                    onToggleWatchlist={toggleWatchlist}
                    onBackToDashboard={navigateToDashboard}
                  />
                )}

                {['technical', 'fundamentals', 'valuation', 'compare'].includes(currentView) && (
                  <PhasePlaceholderPage
                    view={currentView as any}
                    onBackToDashboard={() => setCurrentView('dashboard')}
                  />
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <Footer />
        </main>
      </div>

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav
        id="mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-terminal-bg/95 border-t border-terminal-border backdrop-blur-md px-2 py-1.5 flex items-center justify-around text-[10px] font-mono text-terminal-text-muted"
      >
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors ${
            currentView === 'dashboard' ? 'text-terminal-accent font-bold' : 'hover:text-terminal-text-primary'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Tổng quan</span>
        </button>
        <button
          onClick={() => setCurrentView('market')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors ${
            currentView === 'market' ? 'text-terminal-accent font-bold' : 'hover:text-terminal-text-primary'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Thị trường</span>
        </button>
        <button
          onClick={() => setCurrentView('stocks')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors ${
            currentView === 'stocks' ? 'text-terminal-accent font-bold' : 'hover:text-terminal-text-primary'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Cổ phiếu</span>
        </button>
        <button
          onClick={() => setCurrentView('watchlist')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded relative transition-colors ${
            currentView === 'watchlist' ? 'text-terminal-accent font-bold' : 'hover:text-terminal-text-primary'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Watchlist</span>
          {watchlistSymbols.length > 0 && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-terminal-accent" />
          )}
        </button>
      </nav>

      {/* 3. Interactive Stock Quick View Modal */}
      <StockQuickViewModal
        stock={stockDetailQuery.data || null}
        isOpen={quickViewModalOpen}
        onClose={closeQuickView}
        isWatchlisted={selectedStockSymbol ? isWatchlisted(selectedStockSymbol) : false}
        onToggleWatchlist={toggleWatchlist}
        onViewDetail={navigateToStock}
      />
    </div>
  );
}
