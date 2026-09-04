import { useState } from 'react';
import { TopMover } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { formatVND, formatPercent, formatVolume, formatBillionVND } from '../../utils/formatters';
import { ArrowUpRight, ArrowDownRight, Flame, BarChart2 } from 'lucide-react';

interface TopMoversProps {
  gainers: TopMover[];
  losers: TopMover[];
  active: TopMover[];
  onSelectStock: (symbol: string) => void;
}

type TabType = 'gainers' | 'losers' | 'active';

export function TopMovers({ gainers, losers, active, onSelectStock }: TopMoversProps) {
  const [activeTab, setActiveTab] = useState<TabType>('gainers');

  const currentList =
    activeTab === 'gainers' ? gainers : activeTab === 'losers' ? losers : active;

  return (
    <Card id="card-top-movers" variant="default" density="compact" className="space-y-2">
      {/* Header & Tabs */}
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-ref">
            <Flame className="w-4 h-4" />
          </div>
          <CardTitle className="text-sm font-bold tracking-tight uppercase">
            Biến Động Nổi Bật (Top Movers)
          </CardTitle>
          <DemoBadge size="sm" />
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center p-0.5 rounded bg-terminal-bg border border-terminal-border">
          <button
            id="tab-movers-gainers"
            onClick={() => setActiveTab('gainers')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
              activeTab === 'gainers'
                ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30 shadow-xs font-semibold'
                : 'text-terminal-text-muted hover:text-terminal-text-secondary'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Top Tăng
          </button>
          <button
            id="tab-movers-losers"
            onClick={() => setActiveTab('losers')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
              activeTab === 'losers'
                ? 'bg-terminal-down/15 text-terminal-down border border-terminal-down/30 shadow-xs font-semibold'
                : 'text-terminal-text-muted hover:text-terminal-text-secondary'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            Top Giảm
          </button>
          <button
            id="tab-movers-active"
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded transition-all ${
              activeTab === 'active'
                ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 shadow-xs font-semibold'
                : 'text-terminal-text-muted hover:text-terminal-text-secondary'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Top Thanh Khoản
          </button>
        </div>
      </CardHeader>

      {/* Table */}
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-terminal-border text-[11px] text-terminal-text-muted uppercase">
                <th className="py-2 px-3">Mã CK</th>
                <th className="py-2 px-3 text-right">Giá</th>
                <th className="py-2 px-3 text-right">% Thay đổi</th>
                {activeTab === 'active' ? (
                  <th className="py-2 px-3 text-right">Giá trị GD</th>
                ) : null}
                <th className="py-2 px-3 text-right">Khối lượng (Vol)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/60">
              {currentList.map((stock) => {
                const isUp = stock.change > 0;
                const isDown = stock.change < 0;
                const badgeVariant = isUp ? 'up' : isDown ? 'down' : 'ref';

                return (
                  <tr
                    key={stock.symbol}
                    id={`row-mover-${stock.symbol}`}
                    onClick={() => onSelectStock(stock.symbol)}
                    className="hover:bg-terminal-surface-hover cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                          {stock.symbol}
                        </span>
                        <Badge variant="subtle" size="xs">
                          {stock.exchange}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-terminal-text-muted truncate max-w-[140px] font-sans">
                        {stock.companyName}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-bold text-terminal-text-primary">
                      {formatVND(stock.price)}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <Badge variant={badgeVariant} size="xs">
                        {formatPercent(stock.changePercent)}
                      </Badge>
                    </td>

                    {activeTab === 'active' && (
                      <td className="py-2.5 px-3 text-right text-terminal-text-secondary font-medium">
                        {formatBillionVND(stock.tradingValue)}
                      </td>
                    )}

                    <td className="py-2.5 px-3 text-right text-terminal-text-muted">
                      {formatVolume(stock.volume)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
