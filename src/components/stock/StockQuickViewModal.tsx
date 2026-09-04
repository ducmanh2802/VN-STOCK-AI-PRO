import { StockSummary } from '../../types/stock';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Metric } from '../ui/Metric';
import { Signal } from '../ui/Signal';
import { DemoBadge } from '../common/DemoBadge';
import { formatVND, formatVolume, formatBillionVND } from '../../utils/formatters';
import { X, BookmarkPlus, BookmarkCheck, ShieldCheck } from 'lucide-react';

interface StockQuickViewModalProps {
  stock: StockSummary | null;
  isOpen: boolean;
  onClose: () => void;
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onViewDetail?: (symbol: string) => void;
}

export function StockQuickViewModal({
  stock,
  isOpen,
  onClose,
  isWatchlisted,
  onToggleWatchlist,
  onViewDetail,
}: StockQuickViewModalProps) {
  if (!isOpen || !stock) return null;

  const isUp = stock.change > 0;
  const isDown = stock.change < 0;
  const trendBadgeVariant =
    stock.trend === 'UPTREND' ? 'up' : stock.trend === 'DOWNTREND' ? 'down' : 'ref';

  const signalType =
    stock.aiScore >= 75 ? 'BUY' : stock.aiScore <= 40 ? 'SELL' : 'HOLD';

  return (
    <div
      id="modal-stock-quickview-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-terminal-bg/85 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="modal-stock-quickview-content"
        className="w-full max-w-2xl bg-terminal-surface border border-terminal-border rounded-xl shadow-2xl overflow-hidden text-terminal-text-primary animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-terminal-border bg-terminal-bg">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight text-terminal-text-primary">
                {stock.symbol}
              </span>
              <Badge variant="subtle" size="xs">
                {stock.exchange}
              </Badge>
              <Badge variant="accent" size="xs">
                {stock.sector}
              </Badge>
            </div>
            <DemoBadge size="sm" />
          </div>

          <div className="flex items-center gap-2">
            <button
              id={`btn-modal-watchlist-${stock.symbol}`}
              onClick={() => onToggleWatchlist(stock.symbol)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors border ${
                isWatchlisted
                  ? 'bg-terminal-ref/15 text-terminal-ref border-terminal-ref/30 hover:bg-terminal-ref/25'
                  : 'bg-terminal-surface text-terminal-text-secondary border-terminal-border hover:bg-terminal-surface-hover'
              }`}
            >
              {isWatchlisted ? (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5 text-terminal-ref" />
                  Đã theo dõi
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5 text-terminal-text-muted" />
                  Thêm vào Watchlist
                </>
              )}
            </button>
            <button
              id="btn-close-stock-modal"
              onClick={onClose}
              className="p-1.5 rounded text-terminal-text-muted hover:text-terminal-text-primary hover:bg-terminal-surface-subtle transition-colors"
              aria-label="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Company Title */}
        <div className="px-5 pt-3.5 pb-2">
          <h3 className="text-sm font-medium text-terminal-text-secondary">{stock.companyName}</h3>
        </div>

        {/* Price & Primary Metrics */}
        <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-terminal-bg border-y border-terminal-border">
          <div>
            <Metric
              label="Giá hiện tại"
              value={formatVND(stock.price)}
              change={stock.change}
              changePercent={stock.changePercent}
              trend={isUp ? 'up' : isDown ? 'down' : 'ref'}
              size="sm"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs text-terminal-text-muted">Khối lượng (Vol)</div>
            <div className="text-lg font-bold font-mono text-terminal-text-primary">
              {formatVolume(stock.volume)}
            </div>
            <div className="text-xs text-terminal-text-muted">
              Giá trị: <span className="text-terminal-text-secondary font-mono">{formatBillionVND(stock.tradingValue)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-terminal-text-muted">Vốn hóa thị trường</div>
            <div className="text-lg font-bold font-mono text-terminal-text-primary">
              {formatBillionVND(stock.marketCap)}
            </div>
            <div className="text-xs text-terminal-text-muted font-mono">
              P/E: <span className="text-terminal-text-secondary">{stock.pe}x</span> | P/B:{' '}
              <span className="text-terminal-text-secondary">{stock.pb}x</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-terminal-text-muted">AI Score & Tín hiệu</div>
            <Signal
              type={signalType}
              score={stock.aiScore}
              label={`${stock.aiScore}/100`}
              size="sm"
            />
            <div className="text-xs text-terminal-text-muted font-mono">
              ROE: <span className="text-terminal-up font-medium">{stock.roe}%</span>
            </div>
          </div>
        </div>

        {/* Technical & Fundamental Quick Overview */}
        <div className="px-5 py-3.5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card variant="subtle" density="compact" className="space-y-2">
            <CardHeader className="flex items-center justify-between pb-1.5 border-b border-terminal-border/80">
              <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider">
                Tín hiệu Kỹ thuật (DEMO)
              </span>
              <Badge variant={trendBadgeVariant} size="xs" withDot>
                {stock.trend}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-1">
                <div className="p-2 rounded bg-terminal-bg border border-terminal-border">
                  <div className="text-terminal-text-muted mb-0.5">RSI (14)</div>
                  <div className="font-mono font-bold text-terminal-text-primary">{stock.rsi}</div>
                </div>
                <div className="p-2 rounded bg-terminal-bg border border-terminal-border">
                  <div className="text-terminal-text-muted mb-0.5">Giá tham chiếu</div>
                  <div className="font-mono font-bold text-terminal-ref">{formatVND(stock.refPrice)}</div>
                </div>
                <div className="p-2 rounded bg-terminal-bg border border-terminal-border">
                  <div className="text-terminal-text-muted mb-0.5">Biên độ ngày</div>
                  <div className="font-mono font-semibold text-terminal-text-secondary text-[10px]">
                    {formatVND(stock.low)} - {formatVND(stock.high)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="subtle" density="compact" className="space-y-2">
            <CardHeader className="flex items-center justify-between pb-1.5 border-b border-terminal-border/80">
              <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider">
                Định giá ước tính (DEMO)
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-terminal-accent">
                <ShieldCheck className="w-3.5 h-3.5" />
                Fair Value Model
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                <div className="p-2 rounded bg-terminal-bg border border-terminal-border">
                  <div className="text-terminal-text-muted mb-0.5">Giá trị hợp lý</div>
                  <div className="font-mono font-bold text-terminal-text-primary">{formatVND(stock.fairValue)}</div>
                </div>
                <div className="p-2 rounded bg-terminal-bg border border-terminal-border">
                  <div className="text-terminal-text-muted mb-0.5">Biên an toàn / Upside</div>
                  <div className="font-mono font-bold text-terminal-up">
                    +{(((stock.fairValue - stock.price) / stock.price) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-terminal-bg border-t border-terminal-border flex flex-wrap items-center justify-between gap-3 text-xs">
          {onViewDetail && (
            <button
              id={`btn-modal-view-detail-${stock.symbol}`}
              onClick={() => {
                onClose();
                onViewDetail(stock.symbol);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-terminal-accent hover:bg-terminal-accent/90 text-white font-mono font-bold transition-all shadow-xs"
            >
              <span>Xem Biểu Đồ Nến & Chi Tiết Toàn Diện</span>
              <span>→</span>
            </button>
          )}
          <button
            id="btn-modal-close-footer"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-terminal-surface hover:bg-terminal-surface-hover text-terminal-text-primary rounded-lg text-xs font-medium border border-terminal-border transition-colors ml-auto"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
