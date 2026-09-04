import React, { useState, FormEvent } from 'react';
import { StockSummary } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { TableSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatVND, formatPercent } from '../../utils/formatters';
import { Bookmark, Plus, Trash2, ExternalLink, Sparkles, Star } from 'lucide-react';

export interface WatchlistPreviewWidgetProps {
  watchlist?: StockSummary[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectStock?: (symbol: string) => void;
  onAddToWatchlist?: (symbol: string) => void;
  onRemoveFromWatchlist?: (symbol: string) => void;
  onViewAllWatchlist?: () => void;
  className?: string;
  limit?: number;
}

const POPULAR_PICKS = ['HPG', 'FPT', 'SSI', 'MWG', 'MBB', 'TCB', 'DGC', 'VHM'];

export const WatchlistPreviewWidget: React.FC<WatchlistPreviewWidgetProps> = ({
  watchlist = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  onSelectStock,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onViewAllWatchlist,
  className = '',
  limit = 6,
}) => {
  const [newSymbol, setNewSymbol] = useState('');

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    const sym = newSymbol.trim().toUpperCase();
    if (onAddToWatchlist) {
      onAddToWatchlist(sym);
    }
    setNewSymbol('');
  };

  if (isLoading) {
    return (
      <Card id="watchlist-preview-loading" className={`space-y-3 ${className}`}>
        <CardHeader className="pb-2">
          <div className="h-5 w-48 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardHeader>
        <CardContent className="p-0">
          <TableSkeleton rows={4} columns={6} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="watchlist-preview-error" className={className}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải danh mục theo dõi')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  const displayedList = watchlist.slice(0, limit);

  return (
    <Card
      id="section-watchlist-preview"
      variant="default"
      density="compact"
      className={`space-y-3 ${className}`}
    >
      {/* Header */}
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-amber-400">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs sm:text-sm font-bold tracking-tight uppercase font-mono">
                Danh Mục Theo Dõi (Watchlist Preview)
              </CardTitle>
              <DemoBadge size="sm" />
            </div>
            <p className="text-[11px] text-terminal-text-muted">
              Giám sát cổ phiếu ưu tiên, điểm số AI Score và cảnh báo RSI
            </p>
          </div>
        </div>

        {/* Quick Add Form & View All Link */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleAdd} className="flex items-center gap-1.5">
            <input
              id="input-watchlist-preview-add"
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Thêm mã (VD: HPG)"
              className="w-28 sm:w-36 px-2.5 py-1 text-xs font-mono uppercase bg-terminal-bg border border-terminal-border rounded text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent"
            />
            <button
              type="submit"
              id="btn-watchlist-preview-add"
              className="px-2.5 py-1 bg-terminal-accent hover:bg-terminal-accent-hover text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm
            </button>
          </form>

          {onViewAllWatchlist && (
            <button
              onClick={onViewAllWatchlist}
              id="btn-watchlist-view-all"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded bg-terminal-surface border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary text-xs font-mono transition-colors"
            >
              Xem tất cả ({watchlist.length})
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </CardHeader>

      {/* Suggestion Chips */}
      <div className="flex items-center gap-1.5 text-xs text-terminal-text-muted overflow-x-auto pb-0.5 px-1 scrollbar-none">
        <span className="text-[10px] font-mono text-terminal-text-muted uppercase whitespace-nowrap">
          Gợi ý nhanh:
        </span>
        {POPULAR_PICKS.map((pick) => {
          const isAdded = watchlist.some((item) => item.symbol === pick);
          return (
            <button
              key={pick}
              onClick={() => {
                if (!isAdded && onAddToWatchlist) onAddToWatchlist(pick);
              }}
              disabled={isAdded}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors shrink-0 ${
                isAdded
                  ? 'bg-terminal-surface-subtle text-terminal-text-muted/60 cursor-default'
                  : 'bg-terminal-surface text-terminal-text-secondary hover:bg-terminal-surface-hover hover:text-terminal-text-primary border border-terminal-border'
              }`}
            >
              {pick} {isAdded ? '✓' : '+'}
            </button>
          );
        })}
      </div>

      {/* Content / Table or Empty State */}
      <CardContent className="p-0">
        {displayedList.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Danh mục đang trống"
              description="Bạn chưa lưu mã cổ phiếu nào vào danh mục theo dõi. Hãy thêm các mã dẫn dắt như HPG, FPT, SSI để theo dõi biến động."
              actionLabel="Thêm HPG vào danh mục"
              onAction={() => onAddToWatchlist && onAddToWatchlist('HPG')}
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-terminal-border text-[10px] text-terminal-text-muted uppercase">
                  <th className="py-2 px-3">Mã</th>
                  <th className="py-2 px-2 text-right">Giá</th>
                  <th className="py-2 px-2 text-right">% Thay đổi</th>
                  <th className="py-2 px-2 text-center">RSI (14)</th>
                  <th className="py-2 px-2 text-center">Xu hướng</th>
                  <th className="py-2 px-2 text-center">AI Score</th>
                  <th className="py-2 px-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/50">
                {displayedList.map((stock) => {
                  const isUp = stock.change > 0;
                  const isDown = stock.change < 0;
                  const trendVariant =
                    stock.trend === 'UPTREND' ? 'up' : stock.trend === 'DOWNTREND' ? 'down' : 'ref';

                  return (
                    <tr
                      key={stock.symbol}
                      id={`row-watchlist-preview-${stock.symbol}`}
                      className="hover:bg-terminal-surface-hover/80 transition-colors group"
                    >
                      <td
                        onClick={() => onSelectStock && onSelectStock(stock.symbol)}
                        className="py-2.5 px-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                            {stock.symbol}
                          </span>
                          <span className="text-[10px] text-terminal-text-muted hidden sm:inline">
                            {stock.exchange}
                          </span>
                          <span className="text-[11px] text-terminal-text-muted truncate max-w-[120px] hidden md:inline">
                            {stock.companyName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right font-semibold text-terminal-text-primary">
                        {formatVND(stock.price)}
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <Badge variant={isUp ? 'up' : isDown ? 'down' : 'ref'} size="xs" withDot>
                          {isUp ? `+${stock.changePercent.toFixed(2)}%` : `${stock.changePercent.toFixed(2)}%`}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-2 text-center font-mono">
                        <span
                          className={`font-semibold ${
                            stock.rsi > 70
                              ? 'text-terminal-down'
                              : stock.rsi < 30
                              ? 'text-terminal-up'
                              : 'text-terminal-text-secondary'
                          }`}
                        >
                          {stock.rsi.toFixed(1)}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <Badge variant={trendVariant} size="xs">
                          {stock.trend}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-terminal-accent/10 border border-terminal-accent/30 text-terminal-accent font-bold text-[11px]">
                          <Sparkles className="w-2.5 h-2.5" />
                          {stock.aiScore}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectStock && onSelectStock(stock.symbol)}
                            className="p-1 text-terminal-text-muted hover:text-terminal-accent transition-colors"
                            title="Xem chi tiết"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          {onRemoveFromWatchlist && (
                            <button
                              type="button"
                              onClick={() => onRemoveFromWatchlist(stock.symbol)}
                              className="p-1 text-terminal-text-muted hover:text-terminal-down transition-colors"
                              title="Xóa khỏi watchlist"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
