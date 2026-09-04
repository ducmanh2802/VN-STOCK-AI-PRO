import { IndexData } from '../../types/market';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Metric } from '../ui/Metric';
import { DemoBadge } from '../common/DemoBadge';
import { formatVolume, formatBillionVND } from '../../utils/formatters';

interface MarketOverviewProps {
  indices: IndexData[];
}

export function MarketOverview({ indices }: MarketOverviewProps) {
  return (
    <section id="section-market-overview" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-terminal-text-primary tracking-tight font-mono uppercase">
            Tổng quan Chỉ số (Market Overview)
          </h2>
          <DemoBadge size="sm" />
        </div>
        <span className="text-xs text-terminal-text-muted font-mono">
          Cập nhật liên tục · Sàn HOSE, HNX, UPCOM
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {indices.map((idx) => {
          const isUp = idx.change >= 0;
          const points = idx.sparkline || [];
          const statusBadge = idx.status === 'TRADING' ? 'Khớp lệnh' : 'Đóng cửa';

          return (
            <Card
              key={idx.symbol}
              id={`card-index-${idx.symbol}`}
              variant="default"
              density="compact"
              className="hover:border-terminal-border-bright transition-all group"
            >
              <CardContent className="p-3.5 space-y-2.5">
                {/* Header: Name & Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                      {idx.displayName}
                    </span>
                    <Badge variant="subtle" size="xs">
                      {statusBadge}
                    </Badge>
                  </div>
                  <Badge variant={isUp ? 'up' : 'down'} size="xs" withDot>
                    {isUp ? `+${idx.changePercent.toFixed(2)}%` : `${idx.changePercent.toFixed(2)}%`}
                  </Badge>
                </div>

                {/* Primary Metric with Sparkline */}
                <Metric
                  value={idx.value.toFixed(2)}
                  change={idx.change}
                  changePercent={idx.changePercent}
                  trend={isUp ? 'up' : 'down'}
                  sparklineData={points}
                />

                {/* Secondary Financial Stats */}
                <div className="pt-2 border-t border-terminal-border/80 flex items-center justify-between text-[11px] font-mono text-terminal-text-secondary">
                  <div>
                    Vol: <span className="text-terminal-text-primary font-semibold">{formatVolume(idx.totalVolume)}</span>
                  </div>
                  <div>
                    Giá trị: <span className="text-terminal-text-primary font-semibold">{formatBillionVND(idx.totalValue)}</span>
                  </div>
                </div>

                {/* Market Breadth */}
                <div className="flex items-center justify-between text-[10px] font-mono text-terminal-text-muted pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-terminal-up">▲ {idx.advances}</span>
                    <span className="text-terminal-ref">■ {idx.unchanged}</span>
                    <span className="text-terminal-down">▼ {idx.declines}</span>
                  </div>
                  <span className="text-[9px] text-terminal-ref/80">DEMO DATA</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
