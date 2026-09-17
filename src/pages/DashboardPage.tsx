import React from 'react';
import { IndexData, MarketSentiment, MarketBreadth, AITopSignal, AIMarketSummary } from '../types/market';
import { StockSummary, TopMover, SectorHeatmapItem } from '../types/stock';
import {
  useMarketIndices,
  useMarketIntelligence,
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
import { MarketIntelligenceWidget } from '../components/dashboard/MarketIntelligenceWidget';
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
  const intelligenceQuery = useMarketIntelligence();
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
    <div id="page-dashboard" className="space-y-6 sm:space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-terminal-border/70 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-md border border-terminal-accent/30 bg-terminal-accent/10 p-2 text-terminal-accent">
            <Monitor className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-terminal-accent">Market command center</p>
              <DemoBadge size="sm" />
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-terminal-text-primary sm:text-xl">
              Bàn làm việc thị trường
            </h1>
            <p className="mt-1 text-xs text-terminal-text-muted">
              Market state · breadth · rotation · opportunities
            </p>
          </div>
        </div>
        <button
          id="btn-refresh-dashboard"
          onClick={() => refreshMarket()}
          className="flex items-center gap-1.5 rounded-md border border-terminal-border bg-terminal-surface px-3 py-2 text-xs font-mono text-terminal-text-secondary transition-colors hover:border-terminal-border-bright hover:bg-terminal-surface-hover hover:text-terminal-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"
          title="Đồng bộ toàn bộ dữ liệu bảng điều khiển"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Làm mới dữ liệu</span>
        </button>
      </header>

      <section aria-labelledby="dashboard-regime-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-terminal-accent" aria-hidden="true" />
            <h2 id="dashboard-regime-heading" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-terminal-text-muted">
              01 · Market state
            </h2>
          </div>
          <span className="hidden text-[10px] font-mono uppercase tracking-wider text-terminal-text-disabled sm:inline">Authoritative market data</span>
        </div>
        <MarketIndexRibbon
          indices={indices}
          isLoading={indicesQuery.isLoading}
          isError={indicesQuery.isError}
          error={indicesQuery.error}
          onRetry={() => indicesQuery.refetch()}
          onSelectIndex={() => undefined}
        />
        <MarketIntelligenceWidget
          intelligence={intelligenceQuery.data}
          indices={indices}
          isLoading={intelligenceQuery.isLoading}
          isError={intelligenceQuery.isError}
          error={intelligenceQuery.error}
          onRetry={() => {
            intelligenceQuery.refetch();
            indicesQuery.refetch();
          }}
        />
      </section>

      <section aria-labelledby="dashboard-breadth-heading" className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-terminal-accent" aria-hidden="true" />
          <h2 id="dashboard-breadth-heading" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-terminal-text-muted">
            02 · Breadth &amp; sentiment
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <MarketSentimentWidget
            sentiment={sentiment}
            isLoading={sentimentQuery.isLoading}
            isError={sentimentQuery.isError}
            error={sentimentQuery.error}
            onRetry={() => sentimentQuery.refetch()}
          />
          <MarketBreadthWidget
            breadth={breadth}
            isLoading={breadthQuery.isLoading}
            isError={breadthQuery.isError}
            error={breadthQuery.error}
            onRetry={() => breadthQuery.refetch()}
          />
        </div>
      </section>

      <section aria-labelledby="dashboard-opportunity-heading" className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-terminal-accent" aria-hidden="true" />
          <h2 id="dashboard-opportunity-heading" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-terminal-text-muted">
            03 · Opportunities &amp; rotation
          </h2>
        </div>

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
      </section>
    </div>
  );
};
