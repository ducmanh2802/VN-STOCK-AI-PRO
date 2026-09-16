import React, { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StockSummary } from '../types/stock';
import { useAppStore } from '../store/useAppStore';
import { useWatchlistData, MARKET_KEYS } from '../hooks/useMarketQueries';
import { Card } from '../components/ui/Card';
import { DemoBadge } from '../components/common/DemoBadge';
import { LoadingState, TableSkeleton } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorBoundary';
import {
  SortColumn,
  SortDirection,
  ViewMode,
  CategoryGroupId,
  ExchangeFilter,
  SignalFilter,
  TrendFilter,
  WatchlistStats,
} from '../components/watchlist/types';
import { WatchlistStatsSummary } from '../components/watchlist/WatchlistStatsSummary';
import { WatchlistToolbar } from '../components/watchlist/WatchlistToolbar';
import { WatchlistTable } from '../components/watchlist/WatchlistTable';
import { WatchlistCardGrid } from '../components/watchlist/WatchlistCardGrid';
import { WatchlistEmptyState } from '../components/watchlist/WatchlistEmptyState';
import { AddStockModal } from '../components/watchlist/AddStockModal';
import { VIETNAM_STOCKS_UNIVERSE } from '../services/market/stockUniverse';
import { formatPercent, formatVND } from '../utils/formatters';
import { Bookmark, CheckCircle2, AlertCircle } from 'lucide-react';

export interface WatchlistPageProps {
  watchlist?: StockSummary[];
  onSelectStock?: (symbol: string) => void;
  onAddToWatchlist?: (symbol: string) => void;
  onRemoveFromWatchlist?: (symbol: string) => void;
}

export function WatchlistPage({
  watchlist: propsWatchlist,
  onSelectStock: propsOnSelectStock,
  onAddToWatchlist: propsOnAddToWatchlist,
  onRemoveFromWatchlist: propsOnRemoveFromWatchlist,
}: WatchlistPageProps) {
  const queryClient = useQueryClient();

  // Store bindings
  const {
    watchlistSymbols,
    addToWatchlist,
    removeFromWatchlist,
    openQuickView,
    navigateToStock,
    setCurrentView,
  } = useAppStore();

  // Local UI State
  const [refreshInterval, setRefreshInterval] = useState<number>(30000); // 30s auto-refresh by default
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroupId>('all');
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('ALL');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
  const [trendFilter, setTrendFilter] = useState<TrendFilter>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortColumn, setSortColumn] = useState<SortColumn>('changePercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Show Toast Helper
  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Fetch Watchlist with TanStack Query
  const watchlistQuery = useWatchlistData(watchlistSymbols, {
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  });

  const rawWatchlist = propsWatchlist || watchlistQuery.data || [];
  const isLoading = watchlistQuery.isLoading && rawWatchlist.length === 0;
  const isFetching = watchlistQuery.isFetching;
  const isError = watchlistQuery.isError && rawWatchlist.length === 0;
  const error = watchlistQuery.error;
  const lastUpdated = watchlistQuery.dataUpdatedAt ? new Date(watchlistQuery.dataUpdatedAt) : null;

  // Handlers
  const handleSelectStock = propsOnSelectStock || openQuickView;

  const handleAddStock = useCallback(
    (symbol: string) => {
      const clean = symbol.trim().toUpperCase();
      if (!clean) return;
      if (propsOnAddToWatchlist) {
        propsOnAddToWatchlist(clean);
      } else {
        addToWatchlist(clean);
      }
      queryClient.invalidateQueries({ queryKey: ['market', 'watchlist'] });
      showToast(`Đã thêm mã ${clean} vào Watchlist`, 'success');
    },
    [propsOnAddToWatchlist, addToWatchlist, queryClient, showToast]
  );

  const handleAddMultipleStocks = useCallback(
    (symbols: string[]) => {
      symbols.forEach((sym) => {
        const clean = sym.trim().toUpperCase();
        if (propsOnAddToWatchlist) propsOnAddToWatchlist(clean);
        else addToWatchlist(clean);
      });
      queryClient.invalidateQueries({ queryKey: ['market', 'watchlist'] });
      showToast(`Đã thêm ${symbols.length} mã vào danh mục theo dõi`, 'success');
    },
    [propsOnAddToWatchlist, addToWatchlist, queryClient, showToast]
  );

  const handleRemoveStock = useCallback(
    (symbol: string) => {
      const clean = symbol.trim().toUpperCase();
      if (propsOnRemoveFromWatchlist) {
        propsOnRemoveFromWatchlist(clean);
      } else {
        removeFromWatchlist(clean);
      }
      queryClient.invalidateQueries({ queryKey: ['market', 'watchlist'] });
      showToast(`Đã xóa mã ${clean} khỏi Watchlist`, 'info');
    },
    [propsOnRemoveFromWatchlist, removeFromWatchlist, queryClient, showToast]
  );

  const handleRefresh = useCallback(() => {
    watchlistQuery.refetch();
    showToast('Đang cập nhật bảng giá realtime mới nhất...', 'info');
  }, [watchlistQuery, showToast]);

  const handleOpenTrade = useCallback(
    (symbol: string) => {
      // Direct navigation to Paper Trading with selected symbol
      useAppStore.setState({ selectedStockSymbol: symbol });
      setCurrentView('paper-trading');
    },
    [setCurrentView]
  );

  // Sorting Handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') setSortDirection('none');
      else setSortDirection('asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // 1. Compute Key Statistics
  const stats: WatchlistStats = useMemo(() => {
    if (rawWatchlist.length === 0) {
      return {
        totalCount: 0,
        advances: 0,
        declines: 0,
        unchanged: 0,
        ceilings: 0,
        floors: 0,
        avgChangePercent: 0,
        avgAiScore: 0,
        avgUpsidePercent: 0,
        totalTradingValue: 0,
        totalVolume: 0,
        topGainer: null,
        topLoser: null,
      };
    }

    let advances = 0;
    let declines = 0;
    let unchanged = 0;
    let ceilings = 0;
    let floors = 0;
    let sumChange = 0;
    let sumAi = 0;
    let sumUpside = 0;
    let totalVal = 0;
    let totalVol = 0;

    let topGainer: StockSummary | null = null;
    let topLoser: StockSummary | null = null;

    rawWatchlist.forEach((s) => {
      if (s.change > 0) advances++;
      else if (s.change < 0) declines++;
      else unchanged++;

      if (s.ceilingPrice > 0 && s.price >= s.ceilingPrice) ceilings++;
      if (s.floorPrice > 0 && s.price <= s.floorPrice) floors++;

      sumChange += s.changePercent;
      sumAi += s.aiScore;

      const upside = s.price > 0 ? ((s.fairValue - s.price) / s.price) * 100 : 0;
      sumUpside += upside;

      totalVal += s.tradingValue;
      totalVol += s.volume;

      if (!topGainer || s.changePercent > topGainer.changePercent) topGainer = s;
      if (!topLoser || s.changePercent < topLoser.changePercent) topLoser = s;
    });

    return {
      totalCount: rawWatchlist.length,
      advances,
      declines,
      unchanged,
      ceilings,
      floors,
      avgChangePercent: Number((sumChange / rawWatchlist.length).toFixed(2)),
      avgAiScore: Number((sumAi / rawWatchlist.length).toFixed(1)),
      avgUpsidePercent: Number((sumUpside / rawWatchlist.length).toFixed(1)),
      totalTradingValue: Number(totalVal.toFixed(1)),
      totalVolume: totalVol,
      topGainer,
      topLoser,
    };
  }, [rawWatchlist]);

  // 2. Filter & Search Logic
  const filteredStocks = useMemo(() => {
    return rawWatchlist.filter((stock) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          stock.symbol.toLowerCase().includes(q) ||
          stock.companyName.toLowerCase().includes(q) ||
          stock.sector.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Group / Sector Category
      if (selectedGroup !== 'all') {
        const meta = VIETNAM_STOCKS_UNIVERSE.find((m) => m.symbol === stock.symbol);
        if (selectedGroup === 'vn30') {
          if (!meta?.isVN30) return false;
        } else {
          if (meta?.sectorId !== selectedGroup) return false;
        }
      }

      // Exchange Filter
      if (exchangeFilter !== 'ALL' && stock.exchange !== exchangeFilter) {
        return false;
      }

      // AI Signal Filter
      if (signalFilter !== 'ALL') {
        const ai = stock.aiScore;
        const isUp = stock.trend === 'UPTREND';
        if (signalFilter === 'BULLISH' && !(ai >= 60 || isUp)) return false;
        if (signalFilter === 'BEARISH' && !(ai <= 40 || stock.trend === 'DOWNTREND')) return false;
        if (signalFilter === 'NEUTRAL' && (ai >= 60 || ai <= 40)) return false;
      }

      // Trend Filter
      if (trendFilter !== 'ALL' && stock.trend !== trendFilter) {
        return false;
      }

      return true;
    });
  }, [rawWatchlist, searchQuery, selectedGroup, exchangeFilter, signalFilter, trendFilter]);

  // 3. Sorting Comparator
  const sortedStocks = useMemo(() => {
    if (sortDirection === 'none') return filteredStocks;

    return [...filteredStocks].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortColumn) {
        case 'symbol':
          valA = a.symbol;
          valB = b.symbol;
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'price':
          valA = a.price;
          valB = b.price;
          break;
        case 'changePercent':
          valA = a.changePercent;
          valB = b.changePercent;
          break;
        case 'volume':
          valA = a.volume;
          valB = b.volume;
          break;
        case 'tradingValue':
          valA = a.tradingValue;
          valB = b.tradingValue;
          break;
        case 'rsi':
          valA = a.rsi;
          valB = b.rsi;
          break;
        case 'pe':
          valA = a.pe || 0;
          valB = b.pe || 0;
          break;
        case 'roe':
          valA = a.roe || 0;
          valB = b.roe || 0;
          break;
        case 'fairValue':
          valA = a.fairValue;
          valB = b.fairValue;
          break;
        case 'upside':
          valA = a.price > 0 ? ((a.fairValue - a.price) / a.price) * 100 : 0;
          valB = b.price > 0 ? ((b.fairValue - b.price) / b.price) * 100 : 0;
          break;
        case 'aiScore':
          valA = a.aiScore;
          valB = b.aiScore;
          break;
        case 'trend':
          valA = a.trend === 'UPTREND' ? 3 : a.trend === 'SIDEWAY' ? 2 : 1;
          valB = b.trend === 'UPTREND' ? 3 : b.trend === 'SIDEWAY' ? 2 : 1;
          break;
        case 'signal':
          valA = a.aiScore;
          valB = b.aiScore;
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredStocks, sortColumn, sortDirection]);

  // Export CSV
  const handleExportCSV = () => {
    if (sortedStocks.length === 0) {
      showToast('Danh mục không có dữ liệu để xuất file', 'error');
      return;
    }

    const headers = [
      'Mã CP',
      'Công ty',
      'Sàn',
      'Ngành',
      'Giá Khớp (VND)',
      'Thay đổi (VND)',
      '% Thay đổi',
      'Khối lượng',
      'Giá trị GD (Tỷ)',
      'RSI (14)',
      'P/E',
      'ROE (%)',
      'Fair Value (VND)',
      'Upside (%)',
      'AI Score',
      'Xu hướng',
    ];

    const rows = sortedStocks.map((s) => [
      s.symbol,
      `"${s.companyName.replace(/"/g, '""')}"`,
      s.exchange,
      `"${s.sector.replace(/"/g, '""')}"`,
      s.price,
      s.change,
      s.changePercent,
      s.volume,
      s.tradingValue,
      s.rsi,
      s.pe || '',
      s.roe || '',
      s.fairValue,
      s.price > 0 ? (((s.fairValue - s.price) / s.price) * 100).toFixed(2) : 0,
      s.aiScore,
      s.trend,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VN_STOCK_WATCHLIST_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã tải xuống file CSV thành công', 'success');
  };

  // Export JSON
  const handleExportJSON = () => {
    if (sortedStocks.length === 0) {
      showToast('Danh mục không có dữ liệu để xuất file', 'error');
      return;
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sortedStocks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `VN_STOCK_WATCHLIST_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Đã tải xuống file JSON thành công', 'success');
  };

  // Copy Summary Report
  const handleCopySummary = () => {
    if (sortedStocks.length === 0) return;
    const summaryText = `📊 VN STOCK AI PRO — TÓM TẮT WATCHLIST (${new Date().toLocaleDateString('vi-VN')})
--------------------------------------------------
• Tổng số mã theo dõi: ${stats.totalCount} mã (Tăng: ${stats.advances} | Giảm: ${stats.declines} | TC: ${stats.unchanged})
• Hiệu suất TB: ${formatPercent(stats.avgChangePercent)}
• AI Quant Score TB: ${stats.avgAiScore}/100
• Upside tiềm năng TB: +${stats.avgUpsidePercent}%
• Tổng thanh khoản: ${stats.totalTradingValue} tỷ VND (${(stats.totalVolume / 1e6).toFixed(2)}M cổ phiếu)
--------------------------------------------------
Top cổ phiếu nổi bật:
${sortedStocks
  .slice(0, 10)
  .map(
    (s) =>
      `• ${s.symbol.padEnd(4)}: ${formatVND(s.price).padStart(7)} VND (${formatPercent(s.changePercent).padStart(7)}) | AI Score: ${s.aiScore} | FV: ${formatVND(s.fairValue)}`
  )
  .join('\n')}
--------------------------------------------------
Nền tảng phân tích định lượng chứng khoán VN STOCK AI PRO`;

    navigator.clipboard.writeText(summaryText);
    setIsCopied(true);
    showToast('Đã sao chép tóm tắt Watchlist vào clipboard!', 'success');
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div id="page-watchlist-full" className="space-y-4 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg border shadow-xl flex items-center gap-2 text-xs font-mono transition-all animate-in fade-in slide-in-from-bottom-3 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-terminal-surface border-terminal-border text-terminal-text-primary'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : (
            <Bookmark className="w-4 h-4 text-terminal-accent" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-terminal-text-primary font-mono uppercase tracking-tight">
              Danh Mục Theo Dõi Định Lượng (Quant Watchlist)
            </h1>
            <DemoBadge size="sm" />
          </div>
          <p className="text-xs text-terminal-text-muted mt-0.5">
            Bảng theo dõi thời gian thực kết hợp mô hình AI Score, Fair Value, RSI và Tín hiệu dòng tiền
          </p>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 py-6">
          <LoadingState
            variant="terminal"
            message="Đang đồng bộ dữ liệu realtime từ hệ thống khớp lệnh VPS/KBS..."
          />
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <Card className="p-6">
          <ErrorState
            error={error || new Error('Không thể tải dữ liệu danh mục')}
            onRetry={handleRefresh}
          />
        </Card>
      )}

      {/* Main Content Area */}
      {!isLoading && !isError && (
        <>
          {/* 1. Watchlist KPI Summary Banner */}
          <WatchlistStatsSummary
            watchlist={rawWatchlist}
            stats={stats}
            isFetching={isFetching}
            onRefresh={handleRefresh}
            lastUpdated={lastUpdated}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
          />

          {/* 2. Controls & Filter Toolbar */}
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
            onAddStock={handleAddStock}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onExportCSV={handleExportCSV}
            onExportJSON={handleExportJSON}
            onCopySummary={handleCopySummary}
            isCopied={isCopied}
            watchlistSymbols={watchlistSymbols}
            totalStocksCount={rawWatchlist.length}
            filteredCount={sortedStocks.length}
          />

          {/* 3. Main Display: Table View or Card Grid View */}
          {rawWatchlist.length > 0 ? (
            sortedStocks.length > 0 ? (
              viewMode === 'table' ? (
                <WatchlistTable
                  stocks={sortedStocks}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onSelectStock={handleSelectStock}
                  onNavigateToStock={navigateToStock}
                  onOpenTradeModal={handleOpenTrade}
                  onRemoveStock={handleRemoveStock}
                />
              ) : (
                <WatchlistCardGrid
                  stocks={sortedStocks}
                  onSelectStock={handleSelectStock}
                  onNavigateToStock={navigateToStock}
                  onOpenTradeModal={handleOpenTrade}
                  onRemoveStock={handleRemoveStock}
                />
              )
            ) : (
              <Card className="p-8 text-center space-y-2">
                <p className="text-xs text-terminal-text-muted font-mono">
                  Không tìm thấy cổ phiếu nào phù hợp với bộ lọc hiện tại.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedGroup('all');
                    setExchangeFilter('ALL');
                    setSignalFilter('ALL');
                    setTrendFilter('ALL');
                  }}
                  className="px-3 py-1.5 bg-terminal-accent text-white rounded text-xs font-mono"
                >
                  Xóa tất cả bộ lọc
                </button>
              </Card>
            )
          ) : (
            <WatchlistEmptyState
              onAddStock={handleAddStock}
              onAddMultipleStocks={handleAddMultipleStocks}
            />
          )}
        </>
      )}

      {/* Add Stock Modal */}
      <AddStockModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        watchlistSymbols={watchlistSymbols}
        onAddStock={handleAddStock}
        onRemoveStock={handleRemoveStock}
      />
    </div>
  );
}
