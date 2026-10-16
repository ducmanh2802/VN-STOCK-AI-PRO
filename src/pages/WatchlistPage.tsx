import React, { useState, useMemo } from 'react';
import type { StockSummary } from '../types/stock';
import { WatchlistTable } from '../components/watchlist/WatchlistTable';
import { WatchlistCardGrid } from '../components/watchlist/WatchlistCardGrid';
import { WatchlistStatsSummary } from '../components/watchlist/WatchlistStatsSummary';
import { WatchlistToolbar } from '../components/watchlist/WatchlistToolbar';
import { WatchlistEmptyState } from '../components/watchlist/WatchlistEmptyState';
import { AddStockModal } from '../components/watchlist/AddStockModal';
import { computeWatchlistStats } from '../components/watchlist/metrics';
import { Bookmark, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAppStore } from '../store/useAppStore';
import type {
  SortColumn,
  SortDirection,
  ViewMode,
  CategoryGroupId,
  ExchangeFilter,
  SignalFilter,
  TrendFilter,
} from '../components/watchlist/types';

export interface WatchlistPageProps {
  watchlist: StockSummary[];
  onSelectStock: (symbol: string) => void;
  onAddToWatchlist: (symbol: string) => void;
  onRemoveFromWatchlist: (symbol: string) => void;
}

export const WatchlistPage: React.FC<WatchlistPageProps> = ({
  watchlist,
  onSelectStock,
  onAddToWatchlist,
  onRemoveFromWatchlist,
}) => {
  const { navigateToStock } = useAppStore();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortColumn, setSortColumn] = useState<SortColumn>('changePercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroupId>('all');
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('ALL');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
  const [trendFilter, setTrendFilter] = useState<TrendFilter>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30000);

  const stats = useMemo(() => computeWatchlistStats(watchlist), [watchlist]);

  const filteredStocks = useMemo(() => {
    return watchlist.filter((stock) => {
      if (searchQuery) {
        const q = searchQuery.toUpperCase();
        if (!stock.symbol.includes(q) && !stock.companyName.toUpperCase().includes(q)) {
          return false;
        }
      }
      if (exchangeFilter !== 'ALL' && stock.exchange !== exchangeFilter) {
        return false;
      }
      if (signalFilter !== 'ALL') {
        const mapped = stock.signal === 'BUY' ? 'BULLISH' : stock.signal === 'SELL' ? 'BEARISH' : 'NEUTRAL';
        if (mapped !== signalFilter) return false;
      }
      if (trendFilter !== 'ALL' && stock.trend !== trendFilter) {
        return false;
      }
      return true;
    });
  }, [watchlist, searchQuery, exchangeFilter, signalFilter, trendFilter]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const handleAddMultiple = (symbols: string[]) => {
    for (const sym of symbols) {
      onAddToWatchlist(sym);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <h1 className="page-title">Watchlist Theo Dõi Cá Nhân</h1>
            <p className="text-xs text-terminal-text-muted">
              Quản lý danh mục theo dõi, cảnh báo tín hiệu và phân tích độ biến động
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Thêm mã cổ phiếu
        </Button>
      </div>

      <WatchlistStatsSummary
        watchlist={watchlist}
        stats={stats}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={setRefreshInterval}
      />

      <WatchlistToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedGroup={selectedGroup}
        onGroupChange={setSelectedGroup}
        exchangeFilter={exchangeFilter}
        onExchangeFilterChange={setExchangeFilter}
        signalFilter={signalFilter}
        onSignalFilterChange={setSignalFilter}
        trendFilter={trendFilter}
        onTrendFilterChange={setTrendFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddStock={onAddToWatchlist}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onExportCSV={() => {}}
        onExportJSON={() => {}}
        onCopySummary={() => {}}
        isCopied={false}
        watchlistSymbols={watchlist.map((s) => s.symbol)}
        totalStocksCount={watchlist.length}
        filteredCount={filteredStocks.length}
      />


      {filteredStocks.length === 0 ? (
        <WatchlistEmptyState
          onAddStock={() => setIsAddModalOpen(true)}
          onAddMultipleStocks={handleAddMultiple}
        />
      ) : viewMode === 'table' ? (
        <WatchlistTable
          stocks={filteredStocks}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onSelectStock={onSelectStock}
          onNavigateToStock={navigateToStock}
          onRemoveStock={onRemoveFromWatchlist}
        />
      ) : (
        <WatchlistCardGrid
          stocks={filteredStocks}
          onSelectStock={onSelectStock}
          onNavigateToStock={navigateToStock}
          onRemoveStock={onRemoveFromWatchlist}
        />
      )}

      <AddStockModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        watchlistSymbols={watchlist.map((s) => s.symbol)}
        onAddStock={onAddToWatchlist}
        onRemoveStock={onRemoveFromWatchlist}
      />
    </div>
  );
};
