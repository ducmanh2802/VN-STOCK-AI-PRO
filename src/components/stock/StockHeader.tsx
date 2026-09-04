import React from 'react';
import { MarketExchange } from '../../types/stock';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Share2,
  RefreshCw,
  ExternalLink,
  Check,
} from 'lucide-react';

export interface StockHeaderProps {
  symbol: string;
  companyName: string;
  exchange: MarketExchange;
  sector: string;
  isWatchlisted: boolean;
  onToggleWatchlist: () => void;
  onBack?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const StockHeader: React.FC<StockHeaderProps> = ({
  symbol,
  companyName,
  exchange,
  sector,
  isWatchlisted,
  onToggleWatchlist,
  onBack,
  onRefresh,
  isRefreshing = false,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyLink = () => {
    try {
      const url = `${window.location.origin}/stock/${symbol}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in restricted iframe
    }
  };

  return (
    <div
      id="stock-header"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      {/* Left: Back button + Symbol + Name + Badges */}
      <div className="flex items-start sm:items-center gap-3">
        {onBack && (
          <button
            id="btn-stock-back"
            onClick={onBack}
            className="p-2 rounded-lg bg-terminal-bg hover:bg-terminal-surface-hover border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary transition-colors shrink-0"
            title="Quay lại bàn làm việc thị trường"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-terminal-text-primary">
              {symbol}
            </h1>
            <Badge variant="subtle" size="sm" className="font-mono">
              {exchange}
            </Badge>
            <Badge variant="accent" size="sm">
              {sector}
            </Badge>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-terminal-up/10 text-terminal-up border border-terminal-up/25">
              <span className="w-1.5 h-1.5 rounded-full bg-terminal-up animate-pulse" />
              Đang giao dịch
            </span>
            <DemoBadge size="sm" />
          </div>

          <div className="text-xs sm:text-sm text-terminal-text-secondary font-medium">
            {companyName}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex flex-wrap items-center gap-2 self-end md:self-auto">
        {onRefresh && (
          <button
            id="btn-stock-refresh"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terminal-bg hover:bg-terminal-surface-hover border border-terminal-border text-xs font-mono text-terminal-text-secondary hover:text-terminal-text-primary transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu kỹ thuật & định giá"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        )}

        <button
          id={`btn-stock-watchlist-${symbol}`}
          onClick={onToggleWatchlist}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            isWatchlisted
              ? 'bg-terminal-ref/15 text-terminal-ref border-terminal-ref/35 hover:bg-terminal-ref/25 shadow-xs'
              : 'bg-terminal-bg hover:bg-terminal-surface-hover text-terminal-text-secondary hover:text-terminal-text-primary border-terminal-border'
          }`}
        >
          {isWatchlisted ? (
            <>
              <BookmarkCheck className="w-4 h-4 text-terminal-ref" />
              <span>Đã theo dõi</span>
            </>
          ) : (
            <>
              <Bookmark className="w-4 h-4 text-terminal-text-muted" />
              <span>Thêm vào Watchlist</span>
            </>
          )}
        </button>

        <button
          id="btn-stock-share"
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-terminal-bg hover:bg-terminal-surface-hover border border-terminal-border text-xs font-medium text-terminal-text-secondary hover:text-terminal-text-primary transition-colors"
          title="Sao chép liên kết mã cổ phiếu"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-terminal-up" />
              <span className="text-terminal-up">Đã sao chép!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-terminal-text-muted" />
              <span className="hidden sm:inline">Chia sẻ</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
