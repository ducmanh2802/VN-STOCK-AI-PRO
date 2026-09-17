import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  useMarketIndices,
  useMarketStatus,
  useMarketHeatmap,
  useTopMovers,
  useStocksList,
  useAIMarketSummary,
  useWatchlistData,
  useStockDetail,
  useRefreshMarket,
  useMarketIntelligence,
} from './hooks/useMarketQueries';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { Footer } from './components/common/Footer';
import { CommandPalette } from './components/layout/CommandPalette';
import { AICopilot } from './components/ai/AICopilot';
import { StockQuickViewModal } from './components/stock/StockQuickViewModal';
import { DashboardPage } from './pages/DashboardPage';
import { MarketPage } from './pages/MarketPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { StockScreenerPage } from './pages/StockScreenerPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { RiskCenterPage } from './pages/RiskCenterPage';
import { PaperTradingPage } from './pages/PaperTradingPage';
import { DataStatusPage } from './pages/DataStatusPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { AIAnalystPage } from './pages/AIAnalystPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { PhasePlaceholderPage } from './pages/PhasePlaceholderPage';
import { LoadingState } from './components/ui/LoadingState';
import { ErrorState } from './components/ui/ErrorBoundary';
import { marketService } from './services/market';
import { LayoutDashboard, TrendingUp, SlidersHorizontal, Bookmark, Briefcase } from 'lucide-react';

export default function App() {
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Global keyboard shortcuts (Ctrl+K or Cmd+K) and shell escape handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        setIsSidebarMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
  const intelligenceQuery = useMarketIntelligence();
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
    <div className="min-h-screen bg-background text-slate-100 flex flex-col font-sans">
      {/* 1. Header with Tickers & Search */}
      <Header
        indices={indices}
        marketStatus={marketStatus}
        onSelectStock={handleSelectStock}
        onSearchQuery={handleSearchQuery}
        onToggleSidebar={() => setIsSidebarMobileOpen((prev) => !prev)}
        isSidebarOpen={isSidebarMobileOpen}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenCopilot={() => setIsCopilotOpen(true)}
      />

      {/* 2. Main Content Layout with Sidebar */}
      <div className="flex-1 flex min-w-0">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={currentView}
          onTabChange={(tabId) => {
            setCurrentView(tabId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          isOpen={isSidebarMobileOpen}
          onClose={() => setIsSidebarMobileOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onOpenCopilot={() => setIsCopilotOpen(true)}
        />

        {/* Dynamic Page Container */}
        <main
          className={`flex-1 min-w-0 flex flex-col transition-all duration-200 ${
            isSidebarCollapsed ? 'lg:pl-0' : 'lg:pl-0'
          }`}
        >
          <div className="flex-1 p-4 sm:p-5 lg:p-7 max-w-[1480px] w-full mx-auto">
            {/* Loading State */}
            {isLoading && (
              <div className="py-16">
                <LoadingState
                  variant="terminal"
                  message="Đang đồng bộ dữ liệu thị trường và mô hình định lượng..."
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
                    intelligence={intelligenceQuery.data}
                    intelligenceLoading={intelligenceQuery.isLoading}
                    intelligenceError={intelligenceQuery.error}
                    onRetryIntelligence={() => intelligenceQuery.refetch()}
                    onSelectStock={handleSelectStock}
                  />
                )}

                {(currentView === 'screener' || currentView === 'stocks') && (
                  <StockScreenerPage />
                )}

                {currentView === 'watchlist' && (
                  <WatchlistPage
                    watchlist={watchlistStocks}
                    onSelectStock={handleSelectStock}
                    onAddToWatchlist={addToWatchlist}
                    onRemoveFromWatchlist={removeFromWatchlist}
                  />
                )}

                {currentView === 'portfolio' && (
                  <PortfolioPage />
                )}

                {currentView === 'risk-center' && (
                  <RiskCenterPage />
                )}

                {currentView === 'paper-trading' && (
                  <PaperTradingPage />
                )}

                {currentView === 'data-status' && (
                  <DataStatusPage />
                )}

                {currentView === 'recommendations' && (
                  <RecommendationsPage onSelectStock={handleSelectStock} />
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

                {['strategy-lab', 'backtest', 'fundamentals', 'news-macro', 'journal', 'settings'].includes(currentView) && (
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

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tabId) => setCurrentView(tabId)}
        onSelectStock={handleSelectStock}
        onSearchQuery={handleSearchQuery}
      />

      {/* Context-aware AI Copilot Drawer */}
      <AICopilot
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        currentSymbol={selectedStockSymbol || undefined}
        activeTab={currentView}
        onSelectStock={handleSelectStock}
      />

      {/* Mobile Bottom Quick Navigation Bar */}
      <nav
        id="mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0E1522]/95 border-t border-[#263244] backdrop-blur-md px-2 py-1.5 flex items-center justify-around text-[10px] font-mono text-slate-400"
      >
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors ${
            currentView === 'dashboard' ? 'text-indigo-400 font-bold' : 'hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
        <button
          onClick={() => setCurrentView('screener')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors ${
            currentView === 'screener' ? 'text-indigo-400 font-bold' : 'hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Screener</span>
        </button>
        <button
          onClick={() => setCurrentView('portfolio')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors ${
            currentView === 'portfolio' ? 'text-indigo-400 font-bold' : 'hover:text-slate-200'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Portfolio</span>
        </button>
        <button
          onClick={() => setCurrentView('watchlist')}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded relative transition-colors ${
            currentView === 'watchlist' ? 'text-indigo-400 font-bold' : 'hover:text-slate-200'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Watchlist</span>
          {watchlistSymbols.length > 0 && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-indigo-500" />
          )}
        </button>
      </nav>

      {/* Interactive Stock Quick View Modal */}
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
