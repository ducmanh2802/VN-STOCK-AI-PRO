import React, { useState } from 'react';
import { AITopSignal } from '../../types/market';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { CardSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import { formatVND, formatPercent } from '../../utils/formatters';
import {
  Sparkles,
  Target,
  ShieldAlert,
  ArrowUpRight,
  Clock,
  TrendingUp,
  Bookmark,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';

export interface AITopSignalsWidgetProps {
  signals?: AITopSignal[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onSelectStock?: (symbol: string) => void;
  onToggleWatchlist?: (symbol: string) => void;
  isWatchlisted?: (symbol: string) => boolean;
  className?: string;
  limit?: number;
}

type SignalFilter = 'ALL' | 'BUY' | 'ACCUMULATE' | 'WATCH';

export const AITopSignalsWidget: React.FC<AITopSignalsWidgetProps> = ({
  signals = [],
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  onSelectStock,
  onToggleWatchlist,
  isWatchlisted,
  className = '',
  limit = 4,
}) => {
  const [activeFilter, setActiveFilter] = useState<SignalFilter>('ALL');

  if (isLoading) {
    return (
      <Card id="ai-top-signals-loading" className={`space-y-3 ${className}`}>
        <CardHeader className="pb-2">
          <div className="h-5 w-48 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={3} className="p-3.5" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="ai-top-signals-error" className={className}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải danh sách tín hiệu định lượng AI')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  if (!signals || signals.length === 0) {
    return (
      <Card id="ai-top-signals-empty" className={className}>
        <CardContent className="p-4">
          <EmptyState
            title="Chưa có tín hiệu mới"
            description="Mô hình phân tích định lượng AI đang quét các mẫu hình kỹ thuật và định giá cơ bản..."
            actionLabel="Quét lại"
            onAction={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  // Filter signals
  const filtered = signals.filter((sig) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'BUY') return sig.signalType === 'BUY' || sig.signalType === 'STRONG_BUY';
    if (activeFilter === 'ACCUMULATE') return sig.signalType === 'ACCUMULATE';
    if (activeFilter === 'WATCH') return sig.signalType === 'WATCH' || sig.signalType === 'HOLD';
    return true;
  });

  const displayedList = filtered.slice(0, limit);

  const getSignalBadge = (type: AITopSignal['signalType'], label: string) => {
    switch (type) {
      case 'STRONG_BUY':
        return (
          <Badge variant="up" size="xs" withDot className="font-bold bg-emerald-600/25 border-emerald-500/60">
            {label || 'MUA MẠNH'}
          </Badge>
        );
      case 'BUY':
        return (
          <Badge variant="up" size="xs" withDot className="font-bold">
            {label || 'MUA'}
          </Badge>
        );
      case 'ACCUMULATE':
        return (
          <Badge variant="accent" size="xs" withDot className="font-bold">
            {label || 'TÍCH LŨY'}
          </Badge>
        );
      case 'WATCH':
        return (
          <Badge variant="ref" size="xs" withDot className="font-bold">
            {label || 'THEO DÕI'}
          </Badge>
        );
      default:
        return (
          <Badge variant="subtle" size="xs">
            {label || type}
          </Badge>
        );
    }
  };

  return (
    <Card
      id="section-ai-top-signals"
      variant="default"
      density="compact"
      className={`space-y-3 ${className}`}
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs sm:text-sm font-bold tracking-tight uppercase font-mono">
                Tín Hiệu Định Lượng AI (AI Top Signals)
              </CardTitle>
              <DemoBadge size="sm" />
            </div>
            <p className="text-[11px] text-terminal-text-muted">
              Định giá cơ bản, điểm mua kỹ thuật và xác suất thành công từ mô hình AI
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center p-0.5 rounded bg-terminal-bg border border-terminal-border text-[10px] font-mono">
          {(['ALL', 'BUY', 'ACCUMULATE', 'WATCH'] as SignalFilter[]).map((filter) => (
            <button
              key={filter}
              id={`tab-signal-filter-${filter}`}
              onClick={() => setActiveFilter(filter)}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                activeFilter === filter
                  ? 'bg-terminal-surface text-terminal-accent shadow-xs border border-terminal-border font-semibold'
                  : 'text-terminal-text-muted hover:text-terminal-text-secondary'
              }`}
            >
              {filter === 'ALL'
                ? 'Tất cả'
                : filter === 'BUY'
                ? 'Mua'
                : filter === 'ACCUMULATE'
                ? 'Tích lũy'
                : 'Theo dõi'}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0 space-y-3">
        {/* Signal Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayedList.map((sig) => {
            const isSaved = isWatchlisted ? isWatchlisted(sig.symbol) : false;

            return (
              <div
                key={sig.id}
                id={`card-ai-signal-${sig.symbol}`}
                onClick={() => onSelectStock && onSelectStock(sig.symbol)}
                className="p-3.5 rounded-lg bg-terminal-surface-subtle border border-terminal-border hover:border-terminal-accent/50 transition-all cursor-pointer group flex flex-col justify-between space-y-2.5"
              >
                {/* Header Row: Symbol, Sector, Signal Badge & AI Score */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm sm:text-base text-terminal-text-primary group-hover:text-terminal-accent transition-colors">
                        {sig.symbol}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-terminal-bg border border-terminal-border font-mono text-terminal-text-muted">
                        {sig.exchange}
                      </span>
                      <span className="text-[11px] text-terminal-text-muted hidden sm:inline">
                        {sig.sector}
                      </span>
                    </div>
                    <p className="text-[11px] text-terminal-text-secondary line-clamp-1">
                      {sig.companyName}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {getSignalBadge(sig.signalType, sig.signalLabel)}
                    <div className="flex items-center gap-1 text-[10px] font-mono text-terminal-text-muted">
                      <span>Độ tin cậy:</span>
                      <span className="text-terminal-accent font-bold">{sig.confidence}%</span>
                    </div>
                  </div>
                </div>

                {/* Price Matrix: Current, Target, Upside, StopLoss */}
                <div className="grid grid-cols-3 gap-1.5 p-2 rounded bg-terminal-bg border border-terminal-border/80 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-terminal-text-muted block">Giá hiện tại</span>
                    <span className="font-bold text-terminal-text-primary">
                      {formatVND(sig.currentPrice)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-terminal-text-muted block">Mục tiêu (TP)</span>
                    <span className="font-bold text-terminal-up">
                      {formatVND(sig.targetPrice)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-terminal-text-muted block">Kỳ vọng</span>
                    <span className="font-bold text-terminal-up">
                      +{sig.upsidePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Technical / Fundamental Catalysts */}
                <div className="space-y-1 text-xs">
                  <p className="text-[11px] text-terminal-text-secondary font-sans leading-relaxed line-clamp-2">
                    {sig.technicalSummary}
                  </p>
                  {sig.catalysts && sig.catalysts.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-terminal-accent font-mono">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      <span className="truncate">{sig.catalysts[0]}</span>
                    </div>
                  )}
                </div>

                {/* Footer: Timeframe, R:R and Action buttons */}
                <div className="pt-2 border-t border-terminal-border/60 flex items-center justify-between text-[10px] font-mono text-terminal-text-muted">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {sig.timeframe}
                    </span>
                    <span>R:R: <strong className="text-terminal-text-secondary">{sig.riskRewardRatio}</strong></span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onToggleWatchlist && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWatchlist(sig.symbol);
                        }}
                        className={`p-1 rounded hover:bg-terminal-surface border border-terminal-border transition-colors ${
                          isSaved ? 'text-amber-400 border-amber-500/40' : 'text-terminal-text-muted hover:text-terminal-text-primary'
                        }`}
                        title={isSaved ? 'Đã lưu trong watchlist' : 'Thêm vào watchlist'}
                      >
                        <Bookmark className={`w-3 h-3 ${isSaved ? 'fill-amber-400' : ''}`} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectStock) onSelectStock(sig.symbol);
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-terminal-surface hover:bg-terminal-surface-hover border border-terminal-border text-terminal-accent font-medium transition-colors"
                    >
                      Chi tiết <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
