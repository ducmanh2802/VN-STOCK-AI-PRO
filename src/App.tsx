import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore, resolveRouteFromPath } from './store/useAppStore';
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
import { SectorIntelligencePage } from './pages/SectorIntelligencePage';
import { WatchlistPage } from './pages/WatchlistPage';
import { StockScreenerPage } from './pages/StockScreenerPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { RiskCenterPage } from './pages/RiskCenterPage';
import { PaperTradingPage } from './pages/PaperTradingPage';
import { DataStatusPage } from './pages/DataStatusPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { AIAnalystPage } from './pages/AIAnalystPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { LearningDashboardPage } from './pages/LearningDashboardPage';
import { LearningPathPage } from './pages/LearningPathPage';
import { LearningLessonPage } from './pages/LearningLessonPage';
import { PracticeLabPage } from './pages/PracticeLabPage';
import { JournalPage } from './pages/JournalPage';
import { BacktestPage } from './pages/BacktestPage';
import { StrategyLabPage } from './pages/StrategyLabPage';
import { FundamentalsPage } from './pages/FundamentalsPage';
import { MacroNewsPage } from './pages/MacroNewsPage';
import { SettingsPage } from './pages/SettingsPage';
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

  // Sync browser back/forward history buttons with app state.
  // Uses the store's own route parser so a direct load, a pushState navigation and a
  // back/forward step all resolve a path the same way. Previously this handler
  // understood only three shapes, so a back step to any other deep link left the
  // previous view on screen instead of the one the URL named.
  useEffect(() => {
    const handlePopState = () => {
      useAppStore.setState(resolveRouteFromPath(window.location.pathname));
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

  const isMarketView = ['dashboard', 'market', 'sector-intelligence'].includes(currentView);
  const isLoading =
    isMarketView &&
    (indicesQuery.isLoading ||
      statusQuery.isLoading ||
      sectorsQuery.isLoading ||
      moversQuery.isLoading);

  const error = isMarketView
    ? indicesQuery.error || statusQuery.error || sectorsQuery.error || moversQuery.error
    : null;

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
    <div className="min-h-screen bg-background text-terminal-text-secondary flex flex-col font-sans pb-11 lg:pb-0">
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
          className="flex-1 min-w-0 flex flex-col"
        >
          <div className="flex-1 p-3 lg:p-4 w-full">
            {/* Loading State */}
            {isLoading && (
              <div className="w-full">
                <LoadingState
                  variant="terminal"
                  message="Đang đồng bộ dữ liệu thị trường và mô hình định giá…"
                />
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="w-full">
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

                {currentView === 'sector-intelligence' && (
                  <SectorIntelligencePage
                    sectors={sectors}
                    stocks={allStocks}
                    intelligence={intelligenceQuery.data}
                    isLoading={intelligenceQuery.isLoading}
                    error={intelligenceQuery.error}
                    onRetry={() => intelligenceQuery.refetch()}
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

                {currentView === 'learn' && <LearningDashboardPage />}

                {currentView === 'learn-path' && <LearningPathPage />}

                {currentView === 'learn-lesson' && <LearningLessonPage />}

                {currentView === 'practice-lab' && <PracticeLabPage />}

                {currentView === 'journal' && <JournalPage />}

                {currentView === 'strategy-lab' && <StrategyLabPage />}
                {currentView === 'backtest' && <BacktestPage />}
                {currentView === 'fundamentals' && <FundamentalsPage />}
                {currentView === 'news-macro' && <MacroNewsPage />}
                {currentView === 'settings' && <SettingsPage />}
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
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-11 bg-terminal-surface border-t border-terminal-border px-2 flex items-center justify-around text-[10px] font-mono text-terminal-text-muted"
      >
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`flex flex-col items-center gap-0.5 p-1 rounded-sm ${
            currentView === 'dashboard' ? 'text-terminal-accent' : ''
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>
        <button
          onClick={() => setCurrentView('screener')}
          className={`flex flex-col items-center gap-0.5 p-1 rounded-sm ${
            currentView === 'screener' ? 'text-terminal-accent' : ''
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Screener</span>
        </button>
        <button
          onClick={() => setCurrentView('portfolio')}
          className={`flex flex-col items-center gap-0.5 p-1 rounded-sm ${
            currentView === 'portfolio' ? 'text-terminal-accent' : ''
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Portfolio</span>
        </button>
        <button
          onClick={() => setCurrentView('watchlist')}
          className={`flex flex-col items-center gap-0.5 p-1 rounded-sm relative ${
            currentView === 'watchlist' ? 'text-terminal-accent' : ''
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Watchlist</span>
          {watchlistSymbols.length > 0 && (
            <span className="absolute top-0.5 right-1.5 w-1.5 h-1.5 rounded-full bg-terminal-accent" />
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
