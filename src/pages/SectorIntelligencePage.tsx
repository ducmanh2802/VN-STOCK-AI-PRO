import React from 'react';
import type { SectorHeatmapItem, StockSummary } from '../types/stock';
import type { MarketIntelligenceSnapshot } from '../lib/analysis/market/types';
import { SectorHeatmapWidget } from '../components/dashboard/SectorHeatmapWidget';
import { DemoBadge } from '../components/common/DemoBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorBoundary';
import { PieChart } from 'lucide-react';

export interface SectorIntelligencePageProps {
  sectors: SectorHeatmapItem[];
  stocks?: StockSummary[];
  intelligence?: MarketIntelligenceSnapshot;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectStock: (symbol: string) => void;
}

export const SectorIntelligencePage: React.FC<SectorIntelligencePageProps> = ({
  sectors,
  intelligence,
  isLoading,
  error,
  onRetry,
  onSelectStock,
}) => {
  if (isLoading) {
    return <LoadingState message="Đang tải dữ liệu phân tích nhóm ngành..." />;
  }

  if (error) {
    return <ErrorState message={error.message || 'Lỗi tải dữ liệu ngành'} onRetry={onRetry} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Sector Intelligence & Capital Flow</h1>
              <DemoBadge size="sm" />
            </div>
            <p className="text-xs text-terminal-text-muted">
              Xoay vòng dòng tiền, sức mạnh tương đối và xếp hạng các ngành trọng điểm
            </p>
          </div>
        </div>
      </div>

      <SectorHeatmapWidget sectors={sectors} onSelectSector={() => {}} onSelectStock={onSelectStock} />

      {sectors.length > 0 && (
        <div className="bg-terminal-surface border border-terminal-border rounded p-4 space-y-4">
          <h2 className="section-eyebrow">Xếp hạng sức mạnh ngành (Sector Performance)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectors.map((s) => (
              <div
                key={s.id}
                className="bg-terminal-bg border border-terminal-border rounded p-3 space-y-2 cursor-pointer hover:border-terminal-accent"
                onClick={() => onSelectStock(s.topStock)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-terminal-text">{s.name}</span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      s.changePercent >= 0 ? 'text-terminal-up' : 'text-terminal-down'
                    }`}
                  >
                    {s.changePercent >= 0 ? '+' : ''}
                    {s.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs text-terminal-text-muted flex justify-between">
                  <span>Cổ phiếu dẫn dắt:</span>
                  <span className="font-mono text-terminal-accent font-bold">{s.topStock}</span>
                </div>
                <div className="text-xs text-terminal-text-muted flex justify-between">
                  <span>Giá trị GD:</span>
                  <span className="font-mono text-terminal-text">
                    {(s.totalValue / 1_000_000_000).toFixed(1)} tỷ ₫
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
