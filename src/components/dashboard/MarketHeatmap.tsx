import { useState } from 'react';
import { SectorHeatmapItem } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { formatPercent, formatBillionVND } from '../../utils/formatters';
import { Layers, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';

interface MarketHeatmapProps {
  sectors: SectorHeatmapItem[];
  onSelectStock: (symbol: string) => void;
}

export function MarketHeatmap({ sectors, onSelectStock }: MarketHeatmapProps) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const getHeatmapColor = (change: number) => {
    if (change >= 2.5) return 'bg-emerald-600/85 text-white border-emerald-500/70 hover:bg-emerald-600';
    if (change >= 1.5) return 'bg-emerald-700/75 text-white border-emerald-600/60 hover:bg-emerald-700';
    if (change > 0) return 'bg-emerald-950/70 text-emerald-200 border-emerald-800/60 hover:bg-emerald-900/60';
    if (change === 0) return 'bg-terminal-surface-subtle text-terminal-ref border-terminal-border hover:bg-terminal-surface-hover';
    if (change > -1.5) return 'bg-rose-950/70 text-rose-200 border-rose-900/60 hover:bg-rose-950/90';
    return 'bg-rose-700/85 text-white border-rose-600/70 hover:bg-rose-700';
  };

  return (
    <Card id="section-market-heatmap" variant="default" density="compact" className="space-y-3">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-accent">
            <Layers className="w-4 h-4" />
          </div>
          <CardTitle className="text-sm font-bold tracking-tight uppercase">
            Bản Đồ Nhiệt Ngành (Market Heatmap)
          </CardTitle>
          <DemoBadge size="sm" />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-terminal-text-muted">
          <span className="text-terminal-down">Giảm &lt;-1.5%</span>
          <div className="w-3 h-3 rounded bg-rose-700" />
          <div className="w-3 h-3 rounded bg-rose-950" />
          <div className="w-3 h-3 rounded bg-terminal-surface-subtle border border-terminal-border" />
          <div className="w-3 h-3 rounded bg-emerald-950" />
          <div className="w-3 h-3 rounded bg-emerald-600" />
          <span className="text-terminal-up">Tăng &gt;+2.5%</span>
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {sectors.map((sector) => {
            const isSelected = selectedSector === sector.id;
            const colorClass = getHeatmapColor(sector.changePercent);
            const isUp = sector.changePercent >= 0;

            return (
              <div
                key={sector.id}
                id={`heatmap-cell-${sector.id}`}
                onClick={() => setSelectedSector(isSelected ? null : sector.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all duration-150 flex flex-col justify-between min-h-[90px] ${colorClass} ${
                  isSelected ? 'ring-2 ring-terminal-accent scale-[1.02]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-semibold text-xs leading-tight drop-shadow-xs">
                    {sector.name}
                  </span>
                  <span className="flex items-center text-xs font-mono font-bold">
                    {isUp ? (
                      <ArrowUpRight className="w-3.5 h-3.5 inline text-emerald-300" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5 inline text-rose-300" />
                    )}
                    {formatPercent(sector.changePercent)}
                  </span>
                </div>

                <div className="pt-2 mt-1 border-t border-white/10 flex items-center justify-between text-[11px] font-mono">
                  <span className="opacity-80">{sector.stocksCount} mã</span>
                  <button
                    id={`btn-sector-leader-${sector.leaderSymbol}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStock(sector.leaderSymbol);
                    }}
                    className="px-1.5 py-0.5 rounded bg-black/40 hover:bg-black/70 text-[10px] font-bold tracking-wider text-white border border-white/20 transition-colors"
                    title={`Xem cổ phiếu dẫn dắt ${sector.leaderSymbol}`}
                  >
                    {sector.leaderSymbol}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {selectedSector && (
          <div className="p-3 rounded-lg bg-terminal-surface-subtle border border-terminal-border text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-terminal-text-secondary">
              <Info className="w-4 h-4 text-terminal-accent shrink-0" />
              <span>
                Ngành <strong>{sectors.find((s) => s.id === selectedSector)?.name}</strong>: Vốn hóa{' '}
                {formatBillionVND(sectors.find((s) => s.id === selectedSector)?.marketCap || 0)}, dẫn dắt bởi mã{' '}
                <strong className="text-terminal-accent font-mono">
                  {sectors.find((s) => s.id === selectedSector)?.leaderSymbol}
                </strong>.
              </span>
            </div>
            <button
              onClick={() => setSelectedSector(null)}
              className="text-terminal-text-muted hover:text-terminal-text-primary text-xs px-2.5 py-1 rounded bg-terminal-surface border border-terminal-border"
            >
              Đóng
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
