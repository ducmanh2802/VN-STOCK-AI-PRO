import React from 'react';
import { StockSummary } from '../../types/stock';
import { SortColumn, SortDirection } from './types';
import { computeUpsidePercent, isFiniteNumber } from './metrics';
import { Badge } from '../ui/Badge';
import {
  formatVND,
  formatPercent,
  formatVolume,
  formatBillionVND,
  getPriceChangeColor,
} from '../../utils/formatters';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ExternalLink,
  Trash2,
  TrendingUp,
  Eye,
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface WatchlistTableProps {
  stocks: StockSummary[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onSelectStock: (symbol: string) => void;
  onNavigateToStock: (symbol: string) => void;
  onOpenTradeModal?: (symbol: string) => void;
  onRemoveStock: (symbol: string) => void;
}

export const WatchlistTable: React.FC<WatchlistTableProps> = ({
  stocks,
  sortColumn,
  sortDirection,
  onSort,
  onSelectStock,
  onNavigateToStock,
  onOpenTradeModal,
  onRemoveStock,
}) => {
  const renderSortHeader = (
    column: SortColumn,
    label: string,
    align: 'left' | 'center' | 'right' = 'left',
    className = ''
  ) => {
    const isSorted = sortColumn === column;
    return (
      <th
        onClick={() => onSort(column)}
        className={`py-3 px-3 cursor-pointer select-none hover:text-terminal-text-primary transition-colors text-${align} ${className}`}
      >
        <div
          className={`inline-flex items-center gap-1 font-mono uppercase text-[11px] font-semibold ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
          } ${isSorted ? 'text-terminal-accent' : 'text-terminal-text-muted'}`}
        >
          <span>{label}</span>
          {isSorted ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-terminal-accent shrink-0" />
            ) : sortDirection === 'desc' ? (
              <ArrowDown className="w-3 h-3 text-terminal-accent shrink-0" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100 transition-opacity shrink-0" />
          )}
        </div>
      </th>
    );
  };

  const getPriceStyle = (stock: StockSummary) => {
    // A non-positive/non-finite price (e.g. the upstream missing-quote mapping
    // price=0) must never read as "at ceiling/floor" — those are trading signals.
    if (!isFiniteNumber(stock.price) || stock.price <= 0) {
      return 'text-terminal-text-primary font-bold';
    }
    if (stock.price >= stock.ceilingPrice && stock.ceilingPrice > 0) {
      return 'text-purple-400 font-bold'; // Ceiling
    }
    if (stock.price <= stock.floorPrice && stock.floorPrice > 0) {
      return 'text-cyan-400 font-bold'; // Floor
    }
    if (stock.change > 0) return 'text-emerald-400 font-bold';
    if (stock.change < 0) return 'text-rose-400 font-bold';
    return 'text-amber-400 font-bold';
  };

  const getSignalBadge = (stock: StockSummary) => {
    const ai = stock.aiScore;
    const isUptrend = stock.trend === 'UPTREND';
    const isDowntrend = stock.trend === 'DOWNTREND';
    const rsi = stock.rsi;

    if (ai >= 75 && isUptrend && rsi < 70) {
      return {
        label: 'MUA MẠNH',
        variant: 'up' as const,
        icon: <ArrowUpRight className="w-3 h-3" />,
      };
    }
    if (ai >= 60 || (isUptrend && rsi < 65)) {
      return {
        label: 'MUA',
        variant: 'up' as const,
        icon: <ArrowUpRight className="w-3 h-3" />,
      };
    }
    if (ai <= 35 || isDowntrend || rsi >= 75) {
      return {
        label: 'BÁN / GIẢM',
        variant: 'down' as const,
        icon: <ArrowDownRight className="w-3 h-3" />,
      };
    }
    return {
      label: 'NẮM GIỮ',
      variant: 'ref' as const,
      icon: <Activity className="w-3 h-3" />,
    };
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-terminal-border bg-terminal-bg shadow-sm">
      <table className="w-full text-left text-xs font-mono border-collapse">
        {/* Table Header */}
        <thead>
          <tr className="border-b border-terminal-border bg-terminal-surface/90 text-terminal-text-muted backdrop-blur-xs sticky top-0 z-10">
            {renderSortHeader('symbol', 'Mã CP / Doanh Nghiệp', 'left', 'min-w-[170px] sticky left-0 bg-terminal-surface z-20 shadow-r')}
            {renderSortHeader('price', 'Giá Khớp (VND)', 'right', 'min-w-[110px]')}
            {renderSortHeader('changePercent', '+/- Điểm & %', 'right', 'min-w-[115px]')}
            {renderSortHeader('volume', 'Khối Lượng / GTGD', 'right', 'min-w-[130px]')}
            <th className="py-3 px-3 text-center min-w-[100px] text-terminal-text-muted uppercase text-[11px] font-semibold">
              Biên Độ Phiên
            </th>
            {renderSortHeader('trend', 'Xu Hướng', 'center', 'min-w-[95px]')}
            {renderSortHeader('rsi', 'RSI (14)', 'center', 'min-w-[80px]')}
            {renderSortHeader('pe', 'P/E', 'center', 'min-w-[65px]')}
            {renderSortHeader('roe', 'ROE', 'center', 'min-w-[65px]')}
            {renderSortHeader('fairValue', 'Fair Value', 'right', 'min-w-[110px]')}
            {renderSortHeader('upside', 'Upside %', 'right', 'min-w-[90px]')}
            {renderSortHeader('aiScore', 'AI Score', 'center', 'min-w-[90px]')}
            {renderSortHeader('signal', 'Tín Hiệu', 'center', 'min-w-[100px]')}
            <th className="py-3 px-3 text-center min-w-[90px] text-terminal-text-muted uppercase text-[11px] font-semibold">
              Sparkline
            </th>
            <th className="py-3 px-3 text-center min-w-[110px] text-terminal-text-muted uppercase text-[11px] font-semibold">
              Thao Tác
            </th>
          </tr>
        </thead>

        {/* Table Body */}
        <tbody className="divide-y divide-terminal-border/60">
          {stocks.map((stock) => {
            const isUp = stock.change > 0;
            const isDown = stock.change < 0;
            const upside = computeUpsidePercent(stock.price, stock.fairValue);
            const signal = getSignalBadge(stock);

            // Day range calculation (relative to low and high); unavailable inputs → 0 width
            const currentPct =
              isFiniteNumber(stock.price) && isFiniteNumber(stock.high) && isFiniteNumber(stock.low)
                ? Math.min(100, Math.max(0, ((stock.price - stock.low) / Math.max(stock.high - stock.low, 1)) * 100))
                : 0;

            return (
              <tr
                key={stock.symbol}
                id={`watchlist-row-${stock.symbol}`}
                className="hover:bg-terminal-surface-hover/80 transition-colors group cursor-pointer"
                onClick={() => onSelectStock(stock.symbol)}
              >
                {/* 1. Symbol & Metadata (Sticky Left Column) */}
                <td className="py-2.5 px-3 sticky left-0 bg-terminal-bg group-hover:bg-terminal-surface-hover/80 transition-colors z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-terminal-text-primary group-hover:text-terminal-accent transition-colors font-mono">
                      {stock.symbol}
                    </span>
                    <Badge variant="subtle" size="xs">
                      {stock.exchange}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-terminal-text-muted font-sans truncate max-w-[160px] mt-0.5" title={stock.companyName}>
                    {stock.companyName}
                  </div>
                </td>

                {/* 2. Realtime Price */}
                <td className={`py-2.5 px-3 text-right font-mono text-sm ${getPriceStyle(stock)}`}>
                  {formatVND(stock.price)}
                </td>

                {/* 3. +/- Change & Percent */}
                <td className="py-2.5 px-3 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <Badge variant={isUp ? 'up' : isDown ? 'down' : 'ref'} size="xs">
                      {formatPercent(stock.changePercent)}
                    </Badge>
                    <span className={`text-[10px] font-mono ${getPriceChangeColor(stock.change)}`}>
                      {stock.change > 0 ? '+' : ''}
                      {formatVND(stock.change)}
                    </span>
                  </div>
                </td>

                {/* 4. Volume & Turnover Value */}
                <td className="py-2.5 px-3 text-right">
                  <div className="font-semibold text-terminal-text-primary">
                    {formatVolume(stock.volume)}
                  </div>
                  <div className="text-[10px] text-terminal-text-muted">
                    {formatBillionVND(stock.tradingValue)}
                  </div>
                </td>

                {/* 5. Day Range Bar */}
                <td className="py-2.5 px-3 text-center">
                  <div className="w-20 mx-auto space-y-1">
                    <div className="flex justify-between text-[9px] text-terminal-text-muted font-mono">
                      <span>{formatVND(stock.low / 1000)}</span>
                      <span>{formatVND(stock.high / 1000)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-terminal-surface-subtle rounded-full relative overflow-hidden border border-terminal-border/60">
                      <div
                        className="h-full bg-terminal-accent rounded-full transition-all duration-300"
                        style={{ width: `${currentPct}%` }}
                      />
                    </div>
                  </div>
                </td>

                {/* 6. Trend */}
                <td className="py-2.5 px-3 text-center">
                  <Badge
                    variant={stock.trend === 'UPTREND' ? 'up' : stock.trend === 'DOWNTREND' ? 'down' : 'ref'}
                    size="xs"
                    withDot
                  >
                    {stock.trend === 'UPTREND' ? 'UP' : stock.trend === 'DOWNTREND' ? 'DOWN' : 'SIDE'}
                  </Badge>
                </td>

                {/* 7. RSI */}
                <td className="py-2.5 px-3 text-center font-bold">
                  {isFiniteNumber(stock.rsi) ? (
                    <span
                      className={
                        stock.rsi >= 70
                          ? 'text-rose-400 font-bold'
                          : stock.rsi <= 35
                          ? 'text-cyan-400 font-bold'
                          : 'text-terminal-text-secondary'
                      }
                    >
                      {stock.rsi}
                    </span>
                  ) : (
                    <span className="text-terminal-text-muted">--</span>
                  )}
                </td>

                {/* 8. P/E */}
                <td className="py-2.5 px-3 text-center text-terminal-text-secondary">
                  {stock.pe && isFiniteNumber(stock.pe) ? `${stock.pe.toFixed(1)}x` : '-'}
                </td>

                {/* 9. ROE */}
                <td className="py-2.5 px-3 text-center font-semibold text-emerald-400">
                  {stock.roe && isFiniteNumber(stock.roe) ? `${stock.roe.toFixed(1)}%` : '-'}
                </td>

                {/* 10. Fair Value */}
                <td className="py-2.5 px-3 text-right">
                  <div className="text-terminal-accent font-bold">
                    {formatVND(stock.fairValue)}
                  </div>
                  <div className="text-[10px] text-terminal-text-muted">
                    DCF / Multiples
                  </div>
                </td>

                {/* 11. Upside % */}
                <td className="py-2.5 px-3 text-right font-bold">
                  {upside !== null ? (
                    <span className={`text-xs ${upside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {upside >= 0 ? '+' : ''}
                      {upside.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-terminal-text-muted">--</span>
                  )}
                </td>

                {/* 12. AI Score */}
                <td className="py-2.5 px-3 text-center">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-terminal-surface border border-terminal-border">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span className="font-bold text-terminal-text-primary text-xs">
                      {isFiniteNumber(stock.aiScore) ? stock.aiScore : '--'}
                    </span>
                  </div>
                </td>

                {/* 13. AI Quant Signal */}
                <td className="py-2.5 px-3 text-center">
                  <Badge variant={signal.variant} size="xs" className="inline-flex items-center gap-1">
                    {signal.icon}
                    <span>{signal.label}</span>
                  </Badge>
                </td>

                {/* 14. Mini Sparkline */}
                <td className="py-2.5 px-3 text-center">
                  {stock.sparkline && stock.sparkline.length > 2 ? (
                    <div className="w-16 h-6 mx-auto flex items-center justify-center">
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
                  ) : (
                    <span className="text-terminal-text-muted text-[10px]">-</span>
                  )}
                </td>

                {/* 15. Actions */}
                <td
                  className="py-2.5 px-3 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center gap-1">
                    {/* Quick View Button */}
                    <button
                      onClick={() => onSelectStock(stock.symbol)}
                      className="p-1 rounded text-terminal-text-muted hover:text-terminal-accent hover:bg-terminal-surface transition-colors"
                      title="Xem nhanh (Quick View Modal)"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Full Detail Navigate */}
                    <button
                      onClick={() => onNavigateToStock(stock.symbol)}
                      className="p-1 rounded text-terminal-text-muted hover:text-terminal-accent hover:bg-terminal-surface transition-colors"
                      title="Mở phân tích chi tiết & Đồ thị kỹ thuật"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Trade Button */}
                    {onOpenTradeModal && (
                      <button
                        onClick={() => onOpenTradeModal(stock.symbol)}
                        className="p-1 rounded text-terminal-text-muted hover:text-emerald-400 hover:bg-terminal-surface transition-colors"
                        title="Đặt lệnh giao dịch mô phỏng (Paper Trading)"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Remove from Watchlist */}
                    <button
                      onClick={() => onRemoveStock(stock.symbol)}
                      className="p-1 rounded text-terminal-text-muted hover:text-rose-400 hover:bg-terminal-surface transition-colors"
                      title="Xóa khỏi danh mục theo dõi"
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
  );
};
