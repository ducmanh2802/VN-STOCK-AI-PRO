import React, { useState } from 'react';
import { MarketBreadth } from '../../types/market';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { CardSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatBillionVND } from '../../utils/formatters';
import { Scale, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface MarketBreadthWidgetProps {
  breadth?: MarketBreadth | null;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

type ExchangeTab = 'all' | 'hose' | 'vn30' | 'hnx' | 'upcom';

export const MarketBreadthWidget: React.FC<MarketBreadthWidgetProps> = ({
  breadth,
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  className = '',
}) => {
  const [activeExchange, setActiveExchange] = useState<ExchangeTab>('all');

  if (isLoading) {
    return (
      <Card id="market-breadth-loading" className={`space-y-3 ${className}`}>
        <CardHeader className="pb-2">
          <div className="h-5 w-48 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          <CardSkeleton lines={3} />
          <div className="h-16 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="market-breadth-error" className={className}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải dữ liệu độ rộng thị trường')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  if (!breadth) {
    return (
      <Card id="market-breadth-empty" className={className}>
        <CardContent className="p-4">
          <EmptyState
            title="Chưa có dữ liệu độ rộng"
            description="Đang cập nhật phân bố số mã tăng giảm toàn thị trường..."
            actionLabel="Tải lại"
            onAction={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  // Get current active exchange breakdown
  const stats =
    activeExchange === 'all'
      ? {
          advances: breadth.advances,
          ceilings: breadth.ceilings,
          declines: breadth.declines,
          floors: breadth.floors,
          unchanged: breadth.unchanged,
        }
      : breadth.exchangeBreakdown[activeExchange];

  const total = stats.advances + stats.declines + stats.unchanged || 1;
  const advancesPercent = ((stats.advances / total) * 100).toFixed(1);
  const declinesPercent = ((stats.declines / total) * 100).toFixed(1);
  const unchangedPercent = ((stats.unchanged / total) * 100).toFixed(1);

  return (
    <Card
      id="section-market-breadth"
      variant="default"
      density="compact"
      className={`space-y-3 ${className}`}
    >
      {/* Header & Exchange Filter */}
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-up">
            <Scale className="w-4 h-4" />
          </div>
          <CardTitle className="text-xs sm:text-sm font-bold tracking-tight uppercase font-mono">
            Độ Rộng Thị Trường (Market Breadth)
          </CardTitle>
          <DemoBadge size="sm" />
        </div>

        {/* Exchange Tabs */}
        <div className="flex items-center p-0.5 rounded bg-terminal-bg border border-terminal-border text-[11px] font-mono">
          {(['all', 'hose', 'vn30', 'hnx', 'upcom'] as ExchangeTab[]).map((tab) => (
            <button
              key={tab}
              id={`tab-breadth-${tab}`}
              onClick={() => setActiveExchange(tab)}
              className={`px-2 py-0.5 rounded uppercase font-semibold transition-all ${
                activeExchange === tab
                  ? 'bg-terminal-surface text-terminal-accent shadow-xs border border-terminal-border'
                  : 'text-terminal-text-muted hover:text-terminal-text-secondary'
              }`}
            >
              {tab === 'all' ? 'Toàn cảnh' : tab.toUpperCase()}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-0">
        {/* Breadth Numbers Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center font-mono">
          {/* Tăng */}
          <div className="p-2 rounded bg-terminal-surface-subtle border border-emerald-900/40">
            <span className="text-[10px] text-terminal-text-muted uppercase block flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3 text-terminal-up" /> Tăng giá
            </span>
            <span className="text-base sm:text-lg font-bold text-terminal-up block">
              {stats.advances}
            </span>
            <span className="text-[10px] text-terminal-text-muted">{advancesPercent}%</span>
          </div>

          {/* Trần */}
          <div className="p-2 rounded bg-terminal-surface-subtle border border-purple-900/40">
            <span className="text-[10px] text-terminal-text-muted uppercase block">
              Tím (Trần)
            </span>
            <span className="text-base sm:text-lg font-bold text-terminal-ceiling block">
              {stats.ceilings}
            </span>
            <span className="text-[10px] text-terminal-ceiling/80">Kịch trần</span>
          </div>

          {/* Tham chiếu */}
          <div className="p-2 rounded bg-terminal-surface-subtle border border-amber-900/40">
            <span className="text-[10px] text-terminal-text-muted uppercase block flex items-center justify-center gap-1">
              <Minus className="w-3 h-3 text-terminal-ref" /> Không đổi
            </span>
            <span className="text-base sm:text-lg font-bold text-terminal-ref block">
              {stats.unchanged}
            </span>
            <span className="text-[10px] text-terminal-text-muted">{unchangedPercent}%</span>
          </div>

          {/* Giảm */}
          <div className="p-2 rounded bg-terminal-surface-subtle border border-rose-900/40">
            <span className="text-[10px] text-terminal-text-muted uppercase block flex items-center justify-center gap-1">
              <TrendingDown className="w-3 h-3 text-terminal-down" /> Giảm giá
            </span>
            <span className="text-base sm:text-lg font-bold text-terminal-down block">
              {stats.declines}
            </span>
            <span className="text-[10px] text-terminal-text-muted">{declinesPercent}%</span>
          </div>

          {/* Sàn */}
          <div className="p-2 rounded bg-terminal-surface-subtle border border-cyan-900/40 col-span-2 sm:col-span-1">
            <span className="text-[10px] text-terminal-text-muted uppercase block">
              Xanh lơ (Sàn)
            </span>
            <span className="text-base sm:text-lg font-bold text-terminal-floor block">
              {stats.floors}
            </span>
            <span className="text-[10px] text-terminal-floor/80">Kịch sàn</span>
          </div>
        </div>

        {/* Visual Multi-Segment Breadth Bar (Count) */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-terminal-text-muted">
            <span>Tỷ lệ Mã tăng ({stats.advances})</span>
            <span className="font-semibold text-terminal-text-primary">
              ADR: {(stats.advances / Math.max(stats.declines, 1)).toFixed(2)}x ({breadth.breadthStatus})
            </span>
            <span>Tỷ lệ Mã giảm ({stats.declines})</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-terminal-bg border border-terminal-border overflow-hidden flex">
            <div
              style={{ width: `${advancesPercent}%` }}
              className="bg-emerald-500 transition-all duration-300"
              title={`Mã tăng: ${stats.advances} (${advancesPercent}%)`}
            />
            <div
              style={{ width: `${unchangedPercent}%` }}
              className="bg-amber-500 transition-all duration-300"
              title={`Tham chiếu: ${stats.unchanged} (${unchangedPercent}%)`}
            />
            <div
              style={{ width: `${declinesPercent}%` }}
              className="bg-rose-500 transition-all duration-300"
              title={`Mã giảm: ${stats.declines} (${declinesPercent}%)`}
            />
          </div>
        </div>

        {/* Volume Breadth (Dòng tiền mua vs bán) */}
        {breadth.volumeBreadth && (
          <div className="p-2.5 rounded bg-terminal-surface-subtle border border-terminal-border space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[11px] font-semibold text-terminal-text-secondary uppercase">
                Phân bố giá trị giao dịch (Cash-flow Breadth)
              </span>
              <span className="text-[10px] text-terminal-text-muted">
                Tổng: {formatBillionVND(breadth.volumeBreadth.totalValue)}
              </span>
            </div>

            {/* Visual Volume Bar */}
            <div className="h-2 w-full rounded-full bg-terminal-bg border border-terminal-border overflow-hidden flex">
              <div
                style={{ width: `${breadth.volumeBreadth.advancingPercent}%` }}
                className="bg-emerald-500/90"
                title={`Dòng tiền mua: ${breadth.volumeBreadth.advancingPercent}%`}
              />
              <div
                style={{ width: `${breadth.volumeBreadth.unchangedPercent}%` }}
                className="bg-amber-500/90"
                title={`Dòng tiền tham chiếu: ${breadth.volumeBreadth.unchangedPercent}%`}
              />
              <div
                style={{ width: `${breadth.volumeBreadth.decliningPercent}%` }}
                className="bg-rose-500/90"
                title={`Dòng tiền bán: ${breadth.volumeBreadth.decliningPercent}%`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-center">
              <div className="text-left">
                <span className="text-terminal-up font-bold">
                  {formatBillionVND(breadth.volumeBreadth.advancingValue)}
                </span>
                <span className="text-terminal-text-muted block">({breadth.volumeBreadth.advancingPercent}%) Mua</span>
              </div>
              <div>
                <span className="text-terminal-ref font-bold">
                  {formatBillionVND(breadth.volumeBreadth.unchangedValue)}
                </span>
                <span className="text-terminal-text-muted block">({breadth.volumeBreadth.unchangedPercent}%) Cân bằng</span>
              </div>
              <div className="text-right">
                <span className="text-terminal-down font-bold">
                  {formatBillionVND(breadth.volumeBreadth.decliningValue)}
                </span>
                <span className="text-terminal-text-muted block">({breadth.volumeBreadth.decliningPercent}%) Bán</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
