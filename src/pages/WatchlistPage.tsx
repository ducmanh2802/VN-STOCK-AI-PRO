import { useState, FormEvent } from 'react';
import { StockSummary } from '../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { DemoBadge } from '../components/common/DemoBadge';
import { formatVND, formatPercent, getPriceChangeColor } from '../utils/formatters';
import { Plus, Trash2, Sparkles, ExternalLink } from 'lucide-react';

interface WatchlistPageProps {
  watchlist: StockSummary[];
  onSelectStock: (symbol: string) => void;
  onAddToWatchlist: (symbol: string) => void;
  onRemoveFromWatchlist: (symbol: string) => void;
}

export function WatchlistPage({
  watchlist,
  onSelectStock,
  onAddToWatchlist,
  onRemoveFromWatchlist,
}: WatchlistPageProps) {
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

  const quickPicks = ['HPG', 'FPT', 'VCB', 'SSI', 'MBB', 'MWG', 'DGC', 'GAS', 'PLX', 'TCB'];

  return (
    <div id="page-watchlist-full" className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-terminal-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-terminal-text-primary font-mono uppercase tracking-tight">
              Danh Mục Theo Dõi Cá Nhân (Watchlist)
            </h1>
            <DemoBadge size="sm" />
          </div>
          <p className="text-xs text-terminal-text-muted">
            Theo dõi chi tiết giá, xu hướng, RSI, P/E, ROE, Định giá Fair Value và AI Score
          </p>
        </div>

        {/* Add Ticker Form */}
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            id="input-watchlist-page-add"
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Nhập mã (VD: VCB, HPG)"
            className="w-44 px-3 py-1.5 text-xs font-mono uppercase bg-terminal-bg border border-terminal-border rounded text-terminal-text-primary placeholder-terminal-text-muted focus:outline-none focus:border-terminal-accent"
          />
          <button
            type="submit"
            id="btn-watchlist-page-add"
            className="px-3 py-1.5 bg-terminal-accent hover:bg-terminal-accent-hover text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Thêm vào danh mục
          </button>
        </form>
      </div>

      {/* Quick Picks */}
      <div className="flex items-center gap-2 text-xs text-terminal-text-muted overflow-x-auto pb-1">
        <span className="text-[11px] font-mono text-terminal-text-muted uppercase whitespace-nowrap">Thêm nhanh:</span>
        {quickPicks.map((pick) => {
          const isAdded = watchlist.some((item) => item.symbol === pick);
          return (
            <button
              key={pick}
              onClick={() => {
                if (!isAdded) onAddToWatchlist(pick);
              }}
              disabled={isAdded}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
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

      {errorMsg && <p className="text-xs text-terminal-down font-mono">{errorMsg}</p>}

      {/* Watchlist Full Table */}
      <Card variant="default" className="p-0 overflow-hidden shadow-sm">
        {watchlist.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-terminal-border bg-terminal-bg text-terminal-text-muted uppercase text-[11px]">
                  <th className="py-3 px-3">Ticker</th>
                  <th className="py-3 px-3 text-right">Giá</th>
                  <th className="py-3 px-3 text-right">% Thay đổi</th>
                  <th className="py-3 px-3 text-center">Xu hướng (Trend)</th>
                  <th className="py-3 px-3 text-center">RSI (14)</th>
                  <th className="py-3 px-3 text-center">P/E</th>
                  <th className="py-3 px-3 text-center">ROE</th>
                  <th className="py-3 px-3 text-right">Fair Value</th>
                  <th className="py-3 px-3 text-center">AI Score</th>
                  <th className="py-3 px-3 text-center">Thao tác</th>
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
                      id={`watchlist-page-row-${stock.symbol}`}
                      className="hover:bg-terminal-surface-hover transition-colors group cursor-pointer"
                      onClick={() => onSelectStock(stock.symbol)}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                            {stock.symbol}
                          </span>
                          <Badge variant="subtle" size="xs">
                            {stock.exchange}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-terminal-text-muted font-sans truncate max-w-[150px]">
                          {stock.companyName}
                        </div>
                      </td>

                      <td className={`py-3 px-3 text-right font-bold text-sm ${getPriceChangeColor(stock.change)}`}>
                        {formatVND(stock.price)}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <Badge variant={isUp ? 'up' : isDown ? 'down' : 'ref'} size="xs">
                          {formatPercent(stock.changePercent)}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Badge variant={trendVariant} size="xs" withDot>
                          {stock.trend}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-terminal-text-primary">
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

                      <td className="py-3 px-3 text-center text-terminal-text-secondary">{stock.pe}x</td>

                      <td className="py-3 px-3 text-center text-terminal-up font-bold">
                        {stock.roe}%
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="text-terminal-accent font-bold">{formatVND(stock.fairValue)}</div>
                        <div className="text-[10px] text-terminal-up">
                          +{(((stock.fairValue - stock.price) / stock.price) * 100).toFixed(1)}%
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <Badge variant="accent" size="xs">
                          <Sparkles className="w-3.5 h-3.5" />
                          {stock.aiScore}
                        </Badge>
                      </td>

                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onSelectStock(stock.symbol)}
                            className="p-1.5 rounded text-terminal-text-muted hover:text-terminal-accent hover:bg-terminal-surface transition-colors"
                            title="Xem chi tiết"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            id={`btn-page-remove-${stock.symbol}`}
                            onClick={() => onRemoveFromWatchlist(stock.symbol)}
                            className="p-1.5 rounded text-terminal-text-muted hover:text-terminal-down hover:bg-terminal-surface transition-colors"
                            title="Xóa khỏi Watchlist"
                          >
                            <Trash2 className="w-4 h-4" />
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
          <EmptyState
            type="watchlist"
            title="Chưa có mã trong danh mục"
            description="Chưa có mã cổ phiếu nào trong danh mục theo dõi của bạn. Hãy nhập mã ở trên hoặc click gợi ý để bắt đầu theo dõi."
          />
        )}
      </Card>
    </div>
  );
}
