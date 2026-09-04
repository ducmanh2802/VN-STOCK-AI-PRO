import React from 'react';
import { IndexData } from '../../types/market';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { CardSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatVolume, formatBillionVND } from '../../utils/formatters';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

export interface MarketIndexRibbonProps {
  indices?: IndexData[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectIndex?: (symbol: string) => void;
  className?: string;
}

export const MarketIndexRibbon: React.FC<MarketIndexRibbonProps> = ({
  indices = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  onSelectIndex,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div id="market-index-ribbon-loading" className="w-full space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-36 bg-terminal-surface-subtle animate-pulse rounded" />
          <div className="h-4 w-24 bg-terminal-surface-subtle animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} className="p-3" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div id="market-index-ribbon-error" className="w-full">
        <ErrorState
          error={error || new Error('Không thể tải dữ liệu chỉ số thị trường')}
          onRetry={onRetry}
          compact
        />
      </div>
    );
  }

  if (!indices || indices.length === 0) {
    return (
      <div id="market-index-ribbon-empty" className="w-full">
        <EmptyState
          title="Không có dữ liệu chỉ số"
          description="Hiện chưa có dữ liệu giao dịch cho các chỉ số thị trường."
          actionLabel="Tải lại"
          onAction={onRetry}
          compact
        />
      </div>
    );
  }

  return (
    <section id="section-market-index-ribbon" className={`space-y-2 ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-terminal-text-primary uppercase tracking-wider text-[11px]">
            Chỉ số thị trường (Market Indices)
          </span>
          <DemoBadge size="sm" />
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-terminal-text-muted">
          <span className="hidden sm:inline">Thời gian thực · Sàn HOSE, HNX, UPCOM</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1 rounded hover:bg-terminal-surface-subtle text-terminal-text-muted hover:text-terminal-text-primary transition-colors"
              title="Làm mới chỉ số"
              id="btn-refresh-indices"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Dense Ribbon: Horizontal Scroll on Mobile, 4-Column Grid on Desktop */}
      <div
        id="ribbon-ticker-track"
        className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 overflow-x-auto pb-1 scrollbar-none"
      >
        {indices.map((idx) => {
          const isUp = idx.change > 0;
          const isDown = idx.change < 0;
          const isRef = idx.change === 0;
          const trendColor = isUp
            ? 'text-terminal-up'
            : isDown
            ? 'text-terminal-down'
            : 'text-terminal-ref';
          const badgeVariant = isUp ? 'up' : isDown ? 'down' : 'ref';

          return (
            <div
              key={idx.symbol}
              id={`ribbon-index-${idx.symbol}`}
              onClick={() => onSelectIndex && onSelectIndex(idx.symbol)}
              className="p-2.5 sm:p-3 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-border-bright transition-all cursor-pointer group flex flex-col justify-between"
            >
              {/* Top Row: Symbol, Status & Change Badge */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-xs text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                    {idx.displayName}
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-terminal-surface-subtle text-terminal-text-muted border border-terminal-border-subtle font-mono">
                    {idx.status === 'TRADING' ? 'Khớp lệnh' : 'Đóng cửa'}
                  </span>
                </div>
                <Badge variant={badgeVariant} size="xs" withDot>
                  {isUp ? `+${idx.changePercent.toFixed(2)}%` : `${idx.changePercent.toFixed(2)}%`}
                </Badge>
              </div>

              {/* Middle Row: Big Index Value & Point Change */}
              <div className="flex items-baseline justify-between gap-1 my-1">
                <div className={`font-mono font-bold text-sm sm:text-base tracking-tight ${trendColor}`}>
                  {idx.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={`font-mono text-xs font-semibold flex items-center gap-0.5 ${trendColor}`}>
                  {isUp && <TrendingUp className="w-3 h-3 shrink-0" />}
                  {isDown && <TrendingDown className="w-3 h-3 shrink-0" />}
                  <span>
                    {isUp ? `+${idx.change.toFixed(2)}` : idx.change.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Bottom Row: Volume, Value and Mini Breadth */}
              <div className="pt-1.5 border-t border-terminal-border/60 flex items-center justify-between text-[10px] font-mono text-terminal-text-muted">
                <div className="truncate">
                  Vol: <span className="text-terminal-text-secondary font-medium">{formatVolume(idx.totalVolume)}</span>
                </div>
                <div className="truncate">
                  GT: <span className="text-terminal-text-secondary font-medium">{formatBillionVND(idx.totalValue)}</span>
                </div>
              </div>

              {/* Mini Advance / Decline Bar */}
              <div className="mt-1 flex items-center justify-between text-[9px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-terminal-up">▲ {idx.advances}</span>
                  <span className="text-terminal-ref">■ {idx.unchanged}</span>
                  <span className="text-terminal-down">▼ {idx.declines}</span>
                </div>
                {idx.ceilings > 0 && (
                  <span className="text-terminal-ceiling font-medium">Trần: {idx.ceilings}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
