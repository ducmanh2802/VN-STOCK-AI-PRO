import React from 'react';
import { StockSummary } from '../../types/stock';
import { Badge } from '../ui/Badge';
import { computeUpsidePercent, isFiniteNumber } from './metrics';
import {
  formatVND,
  formatPercent,
  formatVolume,
  formatBillionVND,
  getPriceChangeColor,
} from '../../utils/formatters';
import {
  Sparkles,
  ExternalLink,
  Trash2,
  Eye,
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Target,
} from 'lucide-react';

interface WatchlistCardGridProps {
  stocks: StockSummary[];
  onSelectStock: (symbol: string) => void;
  onNavigateToStock: (symbol: string) => void;
  onOpenTradeModal?: (symbol: string) => void;
  onRemoveStock: (symbol: string) => void;
}

export const WatchlistCardGrid: React.FC<WatchlistCardGridProps> = ({
  stocks,
  onSelectStock,
  onNavigateToStock,
  onOpenTradeModal,
  onRemoveStock,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {stocks.map((stock) => {
        const isUp = stock.change > 0;
        const isDown = stock.change < 0;
        const upside = computeUpsidePercent(stock.price, stock.fairValue);

        return (
          <div
            key={stock.symbol}
            id={`watchlist-card-${stock.symbol}`}
            onClick={() => onSelectStock(stock.symbol)}
            className="p-3.5 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-accent/50 hover:bg-terminal-surface-hover/60 transition-all cursor-pointer space-y-3 group shadow-xs"
          >
            {/* Top Row: Symbol, Exchange, Change Badge & Delete */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base text-terminal-text-primary group-hover:text-terminal-accent transition-colors font-mono">
                    {stock.symbol}
                  </span>
                  <Badge variant="subtle" size="xs">
                    {stock.exchange}
                  </Badge>
                  <span className="text-[10px] text-terminal-text-muted px-1.5 py-0.2 bg-terminal-bg rounded border border-terminal-border font-sans truncate max-w-[100px]">
                    {stock.sector}
                  </span>
                </div>
                <div className="text-xs text-terminal-text-muted font-sans truncate max-w-[190px] mt-0.5" title={stock.companyName}>
                  {stock.companyName}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Badge variant={isUp ? 'up' : isDown ? 'down' : 'ref'} size="sm">
                  {formatPercent(stock.changePercent)}
                </Badge>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveStock(stock.symbol);
                  }}
                  className="p-1 rounded text-terminal-text-muted hover:text-rose-400 hover:bg-terminal-bg transition-colors"
                  title="Xóa khỏi Watchlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Price & Sparkline Row */}
            <div className="flex items-baseline justify-between pt-1">
              <div>
                <div className={`text-xl font-bold font-mono ${getPriceChangeColor(stock.change)}`}>
                  {formatVND(stock.price)}
                </div>
                <div className={`text-[11px] font-mono ${getPriceChangeColor(stock.change)}`}>
                  {stock.change > 0 ? '+' : ''}
                  {formatVND(stock.change)}
                </div>
              </div>

              {/* Sparkline */}
              {stock.sparkline && stock.sparkline.length > 2 && (
                <div className="w-20 h-8 flex items-center justify-end">
                  <svg viewBox="0 0 60 20" className="w-full h-full overflow-visible">
                    <polyline
                      fill="none"
                      stroke={isUp ? '#10B981' : isDown ? '#F43F5E' : '#F59E0B'}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={stock.sparkline
                        .map((val, idx) => {
                          const min = Math.min(...stock.sparkline);
                          const max = Math.max(...stock.sparkline);
                          const span = Math.max(max - min, 1);
                          const x = (idx / (stock.sparkline.length - 1)) * 60;
                          const y = 20 - ((val - min) / span) * 16 - 2;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-3 gap-1.5 p-2 rounded bg-terminal-bg border border-terminal-border text-[11px] font-mono">
              <div>
                <span className="text-terminal-text-muted text-[10px] block">AI SCORE</span>
                <span className="font-bold text-indigo-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  {isFiniteNumber(stock.aiScore) ? stock.aiScore : '--'}
                </span>
              </div>
              <div>
                <span className="text-terminal-text-muted text-[10px] block">RSI (14)</span>
                {isFiniteNumber(stock.rsi) ? (
                  <span
                    className={
                      stock.rsi >= 70
                        ? 'text-rose-400 font-bold'
                        : stock.rsi <= 35
                        ? 'text-cyan-400 font-bold'
                        : 'text-terminal-text-secondary font-semibold'
                    }
                  >
                    {stock.rsi}
                  </span>
                ) : (
                  <span className="text-terminal-text-muted">--</span>
                )}
              </div>
              <div>
                <span className="text-terminal-text-muted text-[10px] block">P/E</span>
                <span className="text-terminal-text-secondary font-semibold">
                  {stock.pe && isFiniteNumber(stock.pe) ? `${stock.pe}x` : '-'}
                </span>
              </div>
            </div>

            {/* Fair Value & Upside Row */}
            <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-terminal-border/60">
              <div className="flex items-center gap-1 text-terminal-text-muted">
                <Target className="w-3.5 h-3.5 text-terminal-accent" />
                <span>Fair Value:</span>
                <span className="text-terminal-text-primary font-semibold">{formatVND(stock.fairValue)}</span>
              </div>
              {upside !== null ? (
                <span className={`font-bold ${upside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {upside >= 0 ? '+' : ''}
                  {upside.toFixed(1)}%
                </span>
              ) : (
                <span className="font-bold text-terminal-text-muted">--</span>
              )}
            </div>

            {/* Card Action Buttons */}
            <div
              className="flex items-center justify-between pt-1 gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onSelectStock(stock.symbol)}
                className="flex-1 py-1 px-2 rounded bg-terminal-bg hover:bg-terminal-surface-subtle border border-terminal-border text-[11px] font-mono text-terminal-text-secondary hover:text-terminal-text-primary flex items-center justify-center gap-1 transition-colors"
              >
                <Eye className="w-3 h-3" />
                <span>Xem nhanh</span>
              </button>
              <button
                onClick={() => onNavigateToStock(stock.symbol)}
                className="flex-1 py-1 px-2 rounded bg-terminal-bg hover:bg-terminal-surface-subtle border border-terminal-border text-[11px] font-mono text-terminal-text-secondary hover:text-terminal-accent flex items-center justify-center gap-1 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Chi tiết</span>
              </button>
              {onOpenTradeModal && (
                <button
                  onClick={() => onOpenTradeModal(stock.symbol)}
                  className="py-1 px-2 rounded bg-terminal-bg hover:bg-emerald-500/10 border border-terminal-border hover:border-emerald-500/40 text-[11px] font-mono text-emerald-400 flex items-center justify-center gap-1 transition-colors"
                  title="Đặt lệnh giao dịch"
                >
                  <ShoppingCart className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
