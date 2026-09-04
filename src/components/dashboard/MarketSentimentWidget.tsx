import React from 'react';
import { MarketSentiment } from '../../types/market';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { DemoBadge } from '../common/DemoBadge';
import { CardSkeleton } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorBoundary';
import {
  Gauge,
  TrendingUp,
  Activity,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export interface MarketSentimentWidgetProps {
  sentiment?: MarketSentiment | null;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

export const MarketSentimentWidget: React.FC<MarketSentimentWidgetProps> = ({
  sentiment,
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  className = '',
}) => {
  if (isLoading) {
    return (
      <Card id="market-sentiment-loading" className={`space-y-3 ${className}`}>
        <CardHeader className="pb-2">
          <div className="h-5 w-48 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          <CardSkeleton lines={3} />
          <div className="h-20 bg-terminal-surface-subtle animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card id="market-sentiment-error" className={className}>
        <CardContent className="p-4">
          <ErrorState
            error={error || new Error('Không thể tải dữ liệu tâm lý thị trường')}
            onRetry={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  if (!sentiment) {
    return (
      <Card id="market-sentiment-empty" className={className}>
        <CardContent className="p-4">
          <EmptyState
            title="Chưa có dữ liệu tâm lý"
            description="Hệ thống định lượng AI đang tính toán chỉ số tâm lý thị trường..."
            actionLabel="Cập nhật"
            onAction={onRetry}
            compact
          />
        </CardContent>
      </Card>
    );
  }

  // Determine sentiment badge styling and zone position
  const getScoreColor = (score: number) => {
    if (score >= 75) return { text: 'text-emerald-400', bg: 'bg-emerald-500', label: 'HƯNG PHẤN / THAM LAM' };
    if (score >= 55) return { text: 'text-emerald-300', bg: 'bg-emerald-600', label: 'LẠC QUAN' };
    if (score >= 45) return { text: 'text-terminal-ref', bg: 'bg-terminal-ref', label: 'TRUNG TÍNH' };
    if (score >= 25) return { text: 'text-rose-400', bg: 'bg-rose-500', label: 'BI QUAN' };
    return { text: 'text-rose-500', bg: 'bg-rose-600', label: 'CỰC KỲ BI QUAN' };
  };

  const sentimentStyle = getScoreColor(sentiment.score);

  return (
    <Card
      id="section-market-sentiment"
      variant="default"
      density="compact"
      className={`space-y-3 ${className}`}
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-terminal-surface-subtle border border-terminal-border text-terminal-accent">
            <Gauge className="w-4 h-4" />
          </div>
          <CardTitle className="text-xs sm:text-sm font-bold tracking-tight uppercase font-mono">
            Tâm Lý Thị Trường (Market Sentiment)
          </CardTitle>
          <DemoBadge size="sm" />
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-terminal-text-muted">
          <span>Cập nhật: {sentiment.updatedAt}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-0">
        {/* Top Sentiment Bar & Score */}
        <div className="p-3 rounded-lg bg-terminal-surface-subtle border border-terminal-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl sm:text-3xl font-bold font-mono ${sentimentStyle.text}`}>
                {sentiment.score}
              </span>
              <span className="text-xs text-terminal-text-muted font-mono">/ 100</span>
              <Badge variant="accent" size="xs">
                {sentiment.label}
              </Badge>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-terminal-text-muted uppercase font-mono block">
                Động lực (Momentum)
              </span>
              <span className="text-xs font-mono font-bold text-terminal-text-primary flex items-center gap-1 justify-end">
                <Zap className="w-3 h-3 text-terminal-accent" />
                {sentiment.momentum}
              </span>
            </div>
          </div>

          {/* Sentiment Meter Bar with 5 Segments */}
          <div className="space-y-1">
            <div className="relative h-2.5 w-full rounded-full bg-terminal-bg border border-terminal-border overflow-hidden flex">
              <div className="w-1/5 bg-rose-800/80 border-r border-terminal-bg" title="Cực kỳ bi quan (0-25)" />
              <div className="w-1/5 bg-rose-600/70 border-r border-terminal-bg" title="Bi quan (25-45)" />
              <div className="w-1/5 bg-amber-500/70 border-r border-terminal-bg" title="Trung tính (45-55)" />
              <div className="w-1/5 bg-emerald-600/70 border-r border-terminal-bg" title="Lạc quan (55-75)" />
              <div className="w-1/5 bg-emerald-400/80" title="Hưng phấn (75-100)" />
            </div>
            {/* Marker needle */}
            <div className="relative w-full h-2">
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${Math.min(Math.max(sentiment.score, 4), 96)}%` }}
              >
                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[5px] border-b-terminal-text-primary" />
              </div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-terminal-text-muted">
              <span>Sợ hãi cực độ (0)</span>
              <span>Trung tính (50)</span>
              <span>Tham lam cực độ (100)</span>
            </div>
          </div>

          <p className="text-xs text-terminal-text-secondary leading-relaxed pt-1 border-t border-terminal-border/60">
            {sentiment.description}
          </p>
        </div>

        {/* 3-Column Capital Flow Distribution */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
          {/* Foreign Flow */}
          <div className="p-2.5 rounded bg-terminal-surface-subtle border border-terminal-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] text-terminal-text-muted mb-1">
              <span>KHỐI NGOẠI</span>
              {sentiment.foreignFlow.netValue >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-terminal-up" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-terminal-down" />
              )}
            </div>
            <div
              className={`text-sm font-bold ${
                sentiment.foreignFlow.netValue >= 0 ? 'text-terminal-up' : 'text-terminal-down'
              }`}
            >
              {sentiment.foreignFlow.netValue >= 0 ? '+' : ''}
              {sentiment.foreignFlow.netValue.toFixed(1)} tỷ VND
            </div>
            <span className="text-[10px] text-terminal-text-muted truncate mt-0.5">
              {sentiment.foreignFlow.type === 'NET_BUY' ? 'Mua ròng' : 'Bán ròng'}
            </span>
          </div>

          {/* Proprietary Trading Flow */}
          <div className="p-2.5 rounded bg-terminal-surface-subtle border border-terminal-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] text-terminal-text-muted mb-1">
              <span>TỰ DOANH</span>
              {sentiment.proprietaryFlow.netValue >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-terminal-up" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-terminal-down" />
              )}
            </div>
            <div
              className={`text-sm font-bold ${
                sentiment.proprietaryFlow.netValue >= 0 ? 'text-terminal-up' : 'text-terminal-down'
              }`}
            >
              {sentiment.proprietaryFlow.netValue >= 0 ? '+' : ''}
              {sentiment.proprietaryFlow.netValue.toFixed(1)} tỷ VND
            </div>
            <span className="text-[10px] text-terminal-text-muted truncate mt-0.5">
              {sentiment.proprietaryFlow.type === 'NET_BUY' ? 'Mua ròng' : 'Bán ròng'}
            </span>
          </div>

          {/* Retail Investors Flow */}
          <div className="p-2.5 rounded bg-terminal-surface-subtle border border-terminal-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] text-terminal-text-muted mb-1">
              <span>CÁ NHÂN TRONG NƯỚC</span>
              {sentiment.retailFlow.netValue >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-terminal-up" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-terminal-down" />
              )}
            </div>
            <div
              className={`text-sm font-bold ${
                sentiment.retailFlow.netValue >= 0 ? 'text-terminal-up' : 'text-terminal-down'
              }`}
            >
              {sentiment.retailFlow.netValue >= 0 ? '+' : ''}
              {sentiment.retailFlow.netValue.toFixed(1)} tỷ VND
            </div>
            <span className="text-[10px] text-terminal-text-muted truncate mt-0.5">
              {sentiment.retailFlow.type === 'NET_BUY' ? 'Mua ròng' : 'Bán ròng / Chốt lời'}
            </span>
          </div>
        </div>

        {/* Key Drivers / Factors */}
        {sentiment.keyFactors && sentiment.keyFactors.length > 0 && (
          <div className="p-2.5 rounded bg-terminal-surface-subtle border border-terminal-border space-y-1.5">
            <span className="text-[10px] font-mono font-semibold text-terminal-text-muted uppercase tracking-wider block">
              Yếu tố chi phối chính
            </span>
            <ul className="space-y-1 text-xs text-terminal-text-secondary">
              {sentiment.keyFactors.map((factor, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-terminal-accent mt-0.5">▪</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
