import React from 'react';
import type { MarketIndex, SectorPerformance, StockMover, StockQuote, AIMarketSummary } from '../types/stock.ts';
import { MarketIndexRibbon } from '../components/dashboard/MarketIndexRibbon.tsx';
import { AIMarketSummaryCard } from '../components/dashboard/AIMarketSummaryCard.tsx';
import { AITopSignalsWidget } from '../components/dashboard/AITopSignalsWidget.tsx';
import { TopMoversSection } from '../components/dashboard/TopMoversSection.tsx';
import { SectorHeatmapWidget } from '../components/dashboard/SectorHeatmapWidget.tsx';
import { WatchlistPreviewWidget } from '../components/dashboard/WatchlistPreviewWidget.tsx';

export interface DashboardPageProps {
  indices: MarketIndex[];
  sectors: SectorPerformance[];
  gainers: StockMover[];
  losers: StockMover[];
  active: StockMover[];
  watchlist: StockQuote[];
  aiSummary?: AIMarketSummary;
  onSelectStock: (symbol: string) => void;
  onAddToWatchlist: (symbol: string) => void;
  onRemoveFromWatchlist: (symbol: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  indices,
  sectors,
  gainers,
  losers,
  active,
  watchlist,
  aiSummary,
  onSelectStock,
  onRemoveFromWatchlist,
}) => {
  return (
    <div className="space-y-6">
      <MarketIndexRibbon indices={indices} onSelectStock={onSelectStock} />
      {aiSummary && <AIMarketSummaryCard summary={aiSummary} />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TopMoversSection
            gainers={gainers}
            losers={losers}
            active={active}
            onSelectStock={onSelectStock}
          />
          <SectorHeatmapWidget sectors={sectors} />
        </div>
        <div className="space-y-6">
          <AITopSignalsWidget onSelectStock={onSelectStock} />
          <WatchlistPreviewWidget
            watchlist={watchlist}
            onSelectStock={onSelectStock}
            onRemove={onRemoveFromWatchlist}
          />
        </div>
      </div>
    </div>
  );
};
