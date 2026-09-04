import React from 'react';
import { TopMover } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { TableSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatVND, formatVolume } from '../../utils/formatters';
import { ArrowDownRight, Star } from 'lucide-react';

export interface TopLosersWidgetProps {
  losers?: TopMover[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectStock?: (symbol: string) => void;
  onToggleWatchlist?: (symbol: string) => void;
  isWatchlisted?: (symbol: string) => boolean;
  className?: string;
  limit?: number;
}

export const TopLosersWidget: React.FC<TopLosersWidgetProps> = ({
  losers = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  onSelectStock,
  onToggleWatchlist,
  isWatchlisted,
  className = '',
  limit = 5,
}) => {
  if (isLoading) {
    return (
      <Card id="top-losers-loading" className={className}>
        <CardHeader className="pb-2">
          <div className="h-4 w-32 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardHeader>
        <CardContent className="p-0">
          <TableSkeleton rows={4} columns={4} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="top-losers-error" className={className}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải danh sách Top Giảm')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  const displayedList = losers.slice(0, limit);

  if (displayedList.length === 0) {
    return (
      <Card id="top-losers-empty" className={className}>
        <CardContent className="p-4">
          <EmptyState
            title="Không có mã giảm"
            description="Thị trường hiện không ghi nhận mã giảm giá đáng kể."
            compact
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      id="section-top-losers"
      variant="default"
      density="compact"
      className={`space-y-2 ${className}`}
    >
      <CardHeader className="flex items-center justify-between gap-2 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-rose-950/60 border border-rose-800/60 text-terminal-down">
            <ArrowDownRight className="w-3.5 h-3.5" />
          </div>
          <CardTitle className="text-xs font-bold tracking-tight uppercase font-mono text-terminal-down">
            Top Cổ Phiếu Giảm (Losers)
          </CardTitle>
          <DemoBadge size="sm" />
        </div>
        <span className="text-[10px] font-mono text-terminal-text-muted">Top {limit}</span>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-terminal-border text-[10px] text-terminal-text-muted uppercase">
                <th className="py-2 px-2.5">Mã</th>
                <th className="py-2 px-2 text-right">Giá</th>
                <th className="py-2 px-2 text-right">% Giảm</th>
                <th className="py-2 px-2.5 text-right hidden sm:table-cell">Khối lượng</th>
                {onToggleWatchlist && <th className="py-2 px-1 text-center w-6" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/50">
              {displayedList.map((stock) => {
                const isSaved = isWatchlisted ? isWatchlisted(stock.symbol) : false;
                const isFloor = stock.changePercent <= -6.8;

                return (
                  <tr
                    key={stock.symbol}
                    id={`row-loser-${stock.symbol}`}
                    onClick={() => onSelectStock && onSelectStock(stock.symbol)}
                    className="hover:bg-terminal-surface-hover/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                          {stock.symbol}
                        </span>
                        <span className="text-[9px] text-terminal-text-muted hidden md:inline">
                          {stock.exchange}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-terminal-down">
                      {formatVND(stock.price)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Badge variant={isFloor ? 'floor' : 'down'} size="xs" withDot>
                        {stock.changePercent.toFixed(2)}%
                      </Badge>
                    </td>
                    <td className="py-2 px-2.5 text-right text-terminal-text-muted hidden sm:table-cell">
                      {formatVolume(stock.volume)}
                    </td>
                    {onToggleWatchlist && (
                      <td
                        className="py-2 px-1 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(stock.symbol);
                        }}
                      >
                        <button
                          type="button"
                          className="p-1 text-terminal-text-muted hover:text-amber-400 transition-colors"
                          title={isSaved ? 'Xóa khỏi watchlist' : 'Thêm vào watchlist'}
                        >
                          <Star className={`w-3 h-3 ${isSaved ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
