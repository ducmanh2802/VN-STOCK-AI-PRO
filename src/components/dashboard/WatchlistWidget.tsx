import { useState, FormEvent } from 'react';
import { StockSummary } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { formatVND, formatPercent } from '../../utils/formatters';
import { Bookmark, Plus, Trash2, Sparkles, ExternalLink } from 'lucide-react';

interface WatchlistWidgetProps {
  watchlist: StockSummary[];
  onSelectStock: (symbol: string) => void;
  onAddToWatchlist: (symbol: string) => void;
  onRemoveFromWatchlist: (symbol: string) => void;
}

export function WatchlistWidget({
  watchlist,
  onSelectStock,
  onAddToWatchlist,
  onRemoveFromWatchlist,
}: WatchlistWidgetProps) {
  const [newSymbol, setNewSymbol] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    const sym = newSymbol.trim().toUpperCase();
    onAddToWatchlist(sym);
    setNewSymbol('');
    setErrorMsg('');
  };

  const quickPicks = ['HPG', 'FPT', 'VCB', 'SSI', 'MWG', 'DGC', 'MBB', 'TCB'];

  return (
    <Card id="card-watchlist-widget" variant="default" density="compact" className="space-y-2">
      {/* Header */}
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-accent">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold tracking-tight uppercase">
                Danh Mục Theo Dõi (Watchlist)
              </CardTitle>
              <DemoBadge size="sm" />
            </div>
            <p className="text-[11px] text-terminal-text-muted">
              Quản lý danh mục cá nhân, theo dõi RSI, Xu hướng & Điểm AI Score
            </p>
          </div>
        </div>

        {/* Add Ticker Form */}
        <form onSubmit={handleAdd} className="flex items-center gap-1.5">
          <input
            id="input-watchlist-add"
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Thêm mã (VD: VCB)"
            className="w-32 sm:w-40 px-2.5 py-1 text-xs font-mono uppercase bg-terminal-bg border border-terminal-border rounded text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent"
          />
          <button
            type="submit"
            id="btn-watchlist-add-submit"
            className="px-2.5 py-1 bg-terminal-accent hover:bg-terminal-accent-hover text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </form>
      </CardHeader>

      {/* Quick Suggestion Chips */}
      <div className="flex items-center gap-1.5 text-xs text-terminal-text-muted overflow-x-auto pb-1 px-1">
        <span className="text-[10px] font-mono text-terminal-text-muted uppercase whitespace-nowrap">Gợi ý:</span>
        {quickPicks.map((pick) => {
          const isAdded = watchlist.some((item) => item.symbol === pick);
          return (
            <button
              key={pick}
              onClick={() => {
                if (!isAdded) onAddToWatchlist(pick);
              }}
              disabled={isAdded}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
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

      {errorMsg && <p className="text-xs text-terminal-down font-mono px-1">{errorMsg}</p>}

      {/* Table */}
      <CardContent className="p-0">
        {watchlist.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-terminal-border text-[11px] text-terminal-text-muted uppercase">
                  <th className="py-2 px-3">Mã</th>
                  <th className="py-2 px-3 text-right">Giá</th>
                  <th className="py-2 px-3 text-right">% Thay đổi</th>
                  <th className="py-2 px-3 text-center">RSI (14)</th>
                  <th className="py-2 px-3 text-center">Xu hướng</th>
                  <th className="py-2 px-3 text-center">AI Score</th>
                  <th className="py-2 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/60">
                {watchlist.map((stock) => {
                  const isUp = stock.change > 0;
                  const isDown = stock.change < 0;
                  const trendVariant =
                    stock.trend === 'UPTREND' ? 'up' : stock.trend === 'DOWNTREND' ? 'down' : 'ref';

                  return (
                    <tr
                      key={stock.symbol}
                      id={`row-watchlist-${stock.symbol}`}
                      className="hover:bg-terminal-surface-hover transition-colors group"
                    >
                      <td
                        onClick={() => onSelectStock(stock.symbol)}
                        className="py-2.5 px-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-terminal-text-primary group-hover:text-terminal-accent">
                            {stock.symbol}
                          </span>
                          <Badge variant="subtle" size="xs">
                            {stock.exchange}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-terminal-text-muted truncate max-w-[130px] font-sans">
                          {stock.companyName}
                        </div>
                      </td>

                      <td
                        onClick={() => onSelectStock(stock.symbol)}
                        className="py-2.5 px-3 text-right font-bold text-terminal-text-primary cursor-pointer"
                      >
                        {formatVND(stock.price)}
                      </td>

                      <td
                        onClick={() => onSelectStock(stock.symbol)}
                        className="py-2.5 px-3 text-right cursor-pointer"
                      >
                        <Badge variant={isUp ? 'up' : isDown ? 'down' : 'ref'} size="xs">
                          {formatPercent(stock.changePercent)}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-center font-semibold">
                        <span
                          className={
                            stock.rsi >= 70
                              ? 'text-terminal-ref'
                              : stock.rsi <= 35
                              ? 'text-terminal-floor'
                              : 'text-terminal-text-secondary'
                          }
                        >
                          {stock.rsi}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={trendVariant} size="xs" withDot>
                          {stock.trend}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="accent" size="xs">
                          <Sparkles className="w-3 h-3" />
                          {stock.aiScore}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            id={`btn-view-${stock.symbol}`}
                            onClick={() => onSelectStock(stock.symbol)}
                            className="p-1 rounded text-terminal-text-muted hover:text-terminal-accent hover:bg-terminal-surface transition-colors"
                            title="Xem thông tin chi tiết"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`btn-remove-${stock.symbol}`}
                            onClick={() => onRemoveFromWatchlist(stock.symbol)}
                            className="p-1 rounded text-terminal-text-muted hover:text-terminal-down hover:bg-terminal-surface transition-colors"
                            title="Xóa khỏi Watchlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-terminal-text-muted border border-dashed border-terminal-border rounded">
            Chưa có cổ phiếu nào trong danh mục theo dõi. Hãy nhập mã ở trên hoặc click gợi ý để thêm.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
