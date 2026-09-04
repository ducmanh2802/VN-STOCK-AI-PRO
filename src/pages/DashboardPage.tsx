import React from 'react';
import { IndexData, MarketSentiment, MarketBreadth, AITopSignal, AIMarketSummary } from '../types/market';
import { StockSummary, TopMover, SectorHeatmapItem } from '../types/stock';
import {
  useMarketIndices,
  useMarketSentiment,
  useMarketBreadth,
  useTopMovers,
  useSectorHeatmap,
  useAITopSignals,
  useWatchlistData,
  useAIMarketSummary,
  useRefreshMarket,
} from '../hooks/useMarketQueries';
import { useAppStore } from '../store/useAppStore';
import { MarketIndexRibbon } from '../components/dashboard/MarketIndexRibbon';
import { MarketSentimentWidget } from '../components/dashboard/MarketSentimentWidget';
import { MarketBreadthWidget } from '../components/dashboard/MarketBreadthWidget';
import { TopMoversSection } from '../components/dashboard/TopMoversSection';
import { TopGainersWidget } from '../components/dashboard/TopGainersWidget';
import { TopLosersWidget } from '../components/dashboard/TopLosersWidget';
import { MostActiveWidget } from '../components/dashboard/MostActiveWidget';
import { SectorHeatmapWidget } from '../components/dashboard/SectorHeatmapWidget';
import { AITopSignalsWidget } from '../components/dashboard/AITopSignalsWidget';
import { WatchlistPreviewWidget } from '../components/dashboard/WatchlistPreviewWidget';
import { AIMarketSummaryCard } from '../components/dashboard/AIMarketSummaryCard';
import { DemoBadge } from '../components/common/DemoBadge';
import { RefreshCw, Monitor, Zap } from 'lucide-react';

export interface DashboardPageProps {
  indices?: IndexData[];
  sectors?: SectorHeatmapItem[];
  gainers?: TopMover[];
  losers?: TopMover[];
  active?: TopMover[];
  watchlist?: StockSummary[];
  aiSummary?: AIMarketSummary;
  onSelectStock?: (symbol: string) => void;
  onAddToWatchlist?: (symbol: string) => void;
  onRemoveFromWatchlist?: (symbol: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  indices: propsIndices,
  sectors: propsSectors,
  gainers: propsGainers,
  losers: propsLosers,
  active: propsActive,
  watchlist: propsWatchlist,
  aiSummary: propsAiSummary,
  onSelectStock: propsOnSelectStock,
  onAddToWatchlist: propsOnAddToWatchlist,
  onRemoveFromWatchlist: propsOnRemoveFromWatchlist,
}) => {
  // Global Store & Actions
  const {
    openQuickView,
    addToWatchlist,
    removeFromWatchlist,
    isWatchlisted,
    watchlistSymbols,
    setCurrentView,
  } = useAppStore();

  const handleSelectStock = propsOnSelectStock || openQuickView;
  const handleAddToWatchlist = propsOnAddToWatchlist || addToWatchlist;
  const handleRemoveFromWatchlist = propsOnRemoveFromWatchlist || removeFromWatchlist;

  // Query Hooks with granular state management
  const indicesQuery = useMarketIndices();
  const sentimentQuery = useMarketSentiment();
  const breadthQuery = useMarketBreadth();
  const moversQuery = useTopMovers();
  const sectorsQuery = useSectorHeatmap();
  const aiSignalsQuery = useAITopSignals();
  const watchlistQuery = useWatchlistData(watchlistSymbols);
  const aiSummaryQuery = useAIMarketSummary();
  const refreshMarket = useRefreshMarket();

  // Resolved Data (prefer props if passed, otherwise fall back to query cache)
  const indices = propsIndices || indicesQuery.data || [];
  const sentiment = sentimentQuery.data || null;
  const breadth = breadthQuery.data || null;
  const movers = moversQuery.data || {
    gainers: propsGainers || [],
    losers: propsLosers || [],
    active: propsActive || [],
  };
  const gainers = propsGainers || movers.gainers || [];
  const losers = propsLosers || movers.losers || [];
  const active = propsActive || movers.active || [];
  const sectors = propsSectors || sectorsQuery.data || [];
  const signals = aiSignalsQuery.data || [];
  const watchlist = propsWatchlist || watchlistQuery.data || [];
  const aiSummary = propsAiSummary || aiSummaryQuery.data || null;

  return (
    <div id="page-dashboard" className="space-y-4 sm:space-y-5">
      {/* Top Banner / Dashboard Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-terminal-border/60">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
                VN STOCK AI · Bàn Làm Việc Thị Trường (Terminal Dashboard)
              </h1>
              <DemoBadge size="sm" />
            </div>
            <p className="text-[11px] text-terminal-text-muted">
              Hệ thống giám sát định lượng đa chiều: Chỉ số · Độ rộng · Dòng tiền · AI Tín hiệu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-refresh-dashboard"
            onClick={() => refreshMarket()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-terminal-surface hover:bg-terminal-surface-hover border border-terminal-border text-xs font-mono text-terminal-text-secondary hover:text-terminal-text-primary transition-colors"
            title="Đồng bộ toàn bộ dữ liệu bảng điều khiển"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Làm mới dữ liệu</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: Market Index Ribbon */}
      <MarketIndexRibbon
        indices={indices}
        isLoading={indicesQuery.isLoading}
        isError={indicesQuery.isError}
        error={indicesQuery.error}
        onRetry={() => indicesQuery.refetch()}
        onSelectIndex={(symbol) => {
          // Can filter or view index
        }}
      />

      {/* SECTION 2 & 3: Market Sentiment & Market Breadth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Section 2: Market Sentiment */}
        <MarketSentimentWidget
          sentiment={sentiment}
          isLoading={sentimentQuery.isLoading}
          isError={sentimentQuery.isError}
          error={sentimentQuery.error}
          onRetry={() => sentimentQuery.refetch()}
        />

        {/* Section 3: Market Breadth */}
        <MarketBreadthWidget
          breadth={breadth}
          isLoading={breadthQuery.isLoading}
          isError={breadthQuery.isError}
          error={breadthQuery.error}
          onRetry={() => breadthQuery.refetch()}
        />
      </div>

      {/* SECTIONS 4, 5, 6: Top Movers (Top Gainers, Top Losers, Most Active) */}
      {/* Supports both mobile tabbed interface and dense 3-column desktop terminal layout */}
      <TopMoversSection
        gainers={gainers}
        losers={losers}
        active={active}
        isLoading={moversQuery.isLoading}
        isError={moversQuery.isError}
        error={moversQuery.error}
        onRetry={() => moversQuery.refetch()}
        onSelectStock={handleSelectStock}
        onToggleWatchlist={(sym) => {
          if (isWatchlisted(sym)) {
            handleRemoveFromWatchlist(sym);
          } else {
            handleAddToWatchlist(sym);
          }
        }}
        isWatchlisted={isWatchlisted}
      />

      {/* SECTION 7: Sector Heatmap */}
      <SectorHeatmapWidget
        sectors={sectors}
        isLoading={sectorsQuery.isLoading}
        isError={sectorsQuery.isError}
        error={sectorsQuery.error}
        onRetry={() => sectorsQuery.refetch()}
        onSelectStock={handleSelectStock}
      />

      {/* SECTION 8: AI Top Signals */}
      <AITopSignalsWidget
        signals={signals}
        isLoading={aiSignalsQuery.isLoading}
        isError={aiSignalsQuery.isError}
        error={aiSignalsQuery.error}
        onRetry={() => aiSignalsQuery.refetch()}
        onSelectStock={handleSelectStock}
        onToggleWatchlist={(sym) => {
          if (isWatchlisted(sym)) {
            handleRemoveFromWatchlist(sym);
          } else {
            handleAddToWatchlist(sym);
          }
        }}
        isWatchlisted={isWatchlisted}
      />

      {/* SECTION 9: Watchlist Preview */}
      <WatchlistPreviewWidget
        watchlist={watchlist}
        isLoading={watchlistQuery.isLoading}
        isError={watchlistQuery.isError}
        error={watchlistQuery.error}
        onRetry={() => watchlistQuery.refetch()}
        onSelectStock={handleSelectStock}
        onAddToWatchlist={handleAddToWatchlist}
        onRemoveFromWatchlist={handleRemoveFromWatchlist}
        onViewAllWatchlist={() => setCurrentView('watchlist')}
      />

      {/* AI Market Summary & Macro Commentary */}
      {aiSummary && (
        <AIMarketSummaryCard summary={aiSummary} onSelectStock={handleSelectStock} />
      )}
    </div>
  );
};
