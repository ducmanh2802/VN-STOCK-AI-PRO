import React, { useState } from 'react';
import { SectorHeatmapItem } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { CardSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatPercent, formatBillionVND, formatVolume } from '../../utils/formatters';
import { Layers, ArrowUpRight, ArrowDownRight, Filter, ChevronRight } from 'lucide-react';

export interface SectorHeatmapWidgetProps {
  sectors?: SectorHeatmapItem[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectSector?: (sectorId: string) => void;
  onSelectStock?: (symbol: string) => void;
  className?: string;
}

type SortField = 'change' | 'marketCap' | 'volume';

export const SectorHeatmapWidget: React.FC<SectorHeatmapWidgetProps> = ({
  sectors = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  onSelectSector,
  onSelectStock,
  className = '',
}) => {
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('change');

  if (isLoading) {
    return (
      <Card id="sector-heatmap-loading" className={`space-y-3 ${className}`}>
        <CardHeader className="pb-2">
          <div className="h-5 w-48 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} className="p-3" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="sector-heatmap-error" className={className}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải dữ liệu bản đồ ngành')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  if (!sectors || sectors.length === 0) {
    return (
      <Card id="sector-heatmap-empty" className={className}>
        <CardContent className="p-4">
          <EmptyState
            title="Chưa có dữ liệu ngành"
            description="Đang tổng hợp thông tin ngành từ hệ thống phân tích thị trường..."
            actionLabel="Tải lại"
            onAction={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  // Sort sectors
  const sortedSectors = [...sectors].sort((a, b) => {
    if (sortBy === 'change') return b.changePercent - a.changePercent;
    if (sortBy === 'marketCap') return b.marketCap - a.marketCap;
    if (sortBy === 'volume') return b.volume - a.volume;
    return 0;
  });

  const getHeatmapColor = (change: number) => {
    if (change >= 2.5) return 'bg-emerald-600/85 text-white border-emerald-500/70 hover:bg-emerald-600';
    if (change >= 1.2) return 'bg-emerald-700/70 text-emerald-100 border-emerald-600/60 hover:bg-emerald-700/80';
    if (change > 0) return 'bg-emerald-950/70 text-emerald-200 border-emerald-800/60 hover:bg-emerald-900/60';
    if (change === 0) return 'bg-terminal-surface-subtle text-terminal-ref border-terminal-border hover:bg-terminal-surface-hover';
    if (change > -1.2) return 'bg-rose-950/70 text-rose-200 border-rose-900/60 hover:bg-rose-950/90';
    return 'bg-rose-700/85 text-white border-rose-600/70 hover:bg-rose-700';
  };

  return (
    <Card
      id="section-sector-heatmap"
      variant="default"
      density="compact"
      className={`space-y-3 ${className}`}
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-accent">
            <Layers className="w-4 h-4" />
          </div>
          <CardTitle className="text-xs sm:text-sm font-bold tracking-tight uppercase font-mono">
            Bản Đồ Nhiệt Ngành (Sector Heatmap)
          </CardTitle>
          <DemoBadge size="sm" />
        </div>

        {/* Sort and Legend Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 rounded bg-terminal-bg border border-terminal-border text-[10px] font-mono">
            <button
              onClick={() => setSortBy('change')}
              className={`px-1.5 py-0.5 rounded ${
                sortBy === 'change'
                  ? 'bg-terminal-surface text-terminal-accent font-semibold border border-terminal-border'
                  : 'text-terminal-text-muted hover:text-terminal-text-secondary'
              }`}
            >
              % Thay đổi
            </button>
            <button
              onClick={() => setSortBy('marketCap')}
              className={`px-1.5 py-0.5 rounded ${
                sortBy === 'marketCap'
                  ? 'bg-terminal-surface text-terminal-accent font-semibold border border-terminal-border'
                  : 'text-terminal-text-muted hover:text-terminal-text-secondary'
              }`}
            >
              Vốn hóa
            </button>
            <button
              onClick={() => setSortBy('volume')}
              className={`px-1.5 py-0.5 rounded ${
                sortBy === 'volume'
                  ? 'bg-terminal-surface text-terminal-accent font-semibold border border-terminal-border'
                  : 'text-terminal-text-muted hover:text-terminal-text-secondary'
              }`}
            >
              Khối lượng
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-3">
        {/* Heatmap Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {sortedSectors.map((sector) => {
            const isSelected = selectedSectorId === sector.id;
            const colorClass = getHeatmapColor(sector.changePercent);
            const isUp = sector.changePercent >= 0;

            return (
              <div
                key={sector.id}
                id={`sector-card-${sector.id}`}
                onClick={() => {
                  setSelectedSectorId(sector.id);
                  if (onSelectSector) onSelectSector(sector.id);
                }}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between select-none ${colorClass} ${
                  isSelected ? 'ring-2 ring-terminal-accent shadow-md scale-[1.02]' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-semibold text-xs tracking-tight truncate">
                      {sector.name}
                    </span>
                    {isUp ? (
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    )}
                  </div>
                  <div className="text-base font-bold font-mono tracking-tight">
                    {isUp ? `+${sector.changePercent.toFixed(2)}%` : `${sector.changePercent.toFixed(2)}%`}
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono opacity-90">
                  <span
                    onClick={(e) => {
                      if (onSelectStock) {
                        e.stopPropagation();
                        onSelectStock(sector.leaderSymbol);
                      }
                    }}
                    className="hover:underline hover:text-white font-bold bg-black/25 px-1 py-0.5 rounded"
                    title={`Mã dẫn dắt ngành: ${sector.leaderSymbol}`}
                  >
                    ★ {sector.leaderSymbol}
                  </span>
                  <span>{sector.stocksCount} mã</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-terminal-text-muted px-1 pt-1 border-t border-terminal-border/60">
          <div className="flex items-center gap-1.5">
            <span className="text-terminal-down font-medium">Giảm &lt;-1.5%</span>
            <div className="w-2.5 h-2.5 rounded bg-rose-700" />
            <div className="w-2.5 h-2.5 rounded bg-rose-950" />
            <div className="w-2.5 h-2.5 rounded bg-terminal-surface-subtle border border-terminal-border" />
            <div className="w-2.5 h-2.5 rounded bg-emerald-950" />
            <div className="w-2.5 h-2.5 rounded bg-emerald-600" />
            <span className="text-terminal-up font-medium">Tăng &gt;+2.5%</span>
          </div>
          <span className="text-[9px] text-terminal-text-muted">Nhấp vào ô ngành để lọc</span>
        </div>
      </CardContent>
    </Card>
  );
};
