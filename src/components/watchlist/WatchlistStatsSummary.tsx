import React from 'react';
import { StockSummary } from '../../types/stock';
import { WatchlistStats } from './types';
import { formatNumber, formatPercent, formatBillionVND, formatVolume } from '../../utils/formatters';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Target,
  BarChart3,
  RefreshCw,
  Clock,
  Radio,
  Layers,
} from 'lucide-react';

interface WatchlistStatsSummaryProps {
  watchlist: StockSummary[];
  stats: WatchlistStats;
  isFetching?: boolean;
  onRefresh?: () => void;
  lastUpdated?: Date | null;
  refreshInterval: number;
  onRefreshIntervalChange: (intervalMs: number) => void;
}

export const WatchlistStatsSummary: React.FC<WatchlistStatsSummaryProps> = ({
  watchlist,
  stats,
  isFetching = false,
  onRefresh,
  lastUpdated,
  refreshInterval,
  onRefreshIntervalChange,
}) => {
  if (watchlist.length === 0) return null;

  // Unavailable averages (no valid samples) render '--' with neutral styling —
  // never as 0 / "NaN" and never as a positive or negative signal.
  const avgChange = stats.avgChangePercent;
  const avgAi = stats.avgAiScore;
  const avgUpside = stats.avgUpsidePercent;
  const isAvgPositive = avgChange != null && avgChange > 0;
  const isAvgNegative = avgChange != null && avgChange < 0;

  return (
    <div className="space-y-3">
      {/* Top Meta Bar with Live Feed Status and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-terminal-surface border border-terminal-border rounded-lg text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-bold tracking-wide uppercase text-[11px]">Live Market Feed (VPS / KBS)</span>
          </div>
          <span className="text-terminal-border">|</span>
          <div className="flex items-center gap-1.5 text-terminal-text-muted">
            <Clock className="w-3.5 h-3.5" />
            <span>Cập nhật:</span>
            <span className="text-terminal-text-primary font-semibold">
              {lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN') : 'Đang đồng bộ...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-refresh interval dropdown */}
          <div className="flex items-center gap-1.5 text-terminal-text-muted">
            <span className="text-[11px]">Tự động tải lại:</span>
            <select
              value={refreshInterval}
              onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
              className="bg-terminal-bg border border-terminal-border rounded px-2 py-0.5 text-xs text-terminal-text-primary focus:outline-none focus:border-terminal-accent cursor-pointer"
            >
              <option value={10000}>10 giây</option>
              <option value={30000}>30 giây</option>
              <option value={60000}>60 giây</option>
              <option value={0}>Tắt</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isFetching}
              className="px-2.5 py-1 rounded bg-terminal-surface-subtle hover:bg-terminal-surface-hover border border-terminal-border text-terminal-text-primary flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Làm mới dữ liệu realtime ngay lập tức"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-terminal-accent' : ''}`} />
              <span className="text-[11px] font-medium">{isFetching ? 'Đang cập nhật' : 'Làm mới'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* 1. Total Stocks & Market Breadth */}
        <div className="p-3 rounded-lg bg-terminal-surface border border-terminal-border space-y-1">
          <div className="flex items-center justify-between text-terminal-text-muted text-[11px] font-mono">
            <span>QUY MÔ THEO DÕI</span>
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-terminal-text-primary">{stats.totalCount}</span>
            <span className="text-xs text-terminal-text-muted font-mono">mã</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono pt-1">
            <span className="text-emerald-400 font-bold">{stats.advances}▲</span>
            <span className="text-terminal-text-muted">/</span>
            <span className="text-amber-400 font-bold">{stats.unchanged}■</span>
            <span className="text-terminal-text-muted">/</span>
            <span className="text-rose-400 font-bold">{stats.declines}▼</span>
            {stats.ceilings > 0 && <span className="text-purple-400 font-bold ml-1">({stats.ceilings} trần)</span>}
          </div>
        </div>

        {/* 2. Average Change % */}
        <div className="p-3 rounded-lg bg-terminal-surface border border-terminal-border space-y-1">
          <div className="flex items-center justify-between text-terminal-text-muted text-[11px] font-mono">
            <span>HIỆU SUẤT TRUNG BÌNH</span>
            {isAvgPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : isAvgNegative ? (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold font-mono ${
                isAvgPositive ? 'text-emerald-400' : isAvgNegative ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              {avgChange != null ? formatPercent(avgChange) : '--'}
            </span>
          </div>
          <div className="text-[10px] text-terminal-text-muted font-mono truncate">
            {stats.topGainer ? `Dẫn đầu: ${stats.topGainer.symbol} (${formatPercent(stats.topGainer.changePercent)})` : 'Đang phân tích'}
          </div>
        </div>

        {/* 3. Average AI Quant Score */}
        <div className="p-3 rounded-lg bg-terminal-surface border border-terminal-border space-y-1">
          <div className="flex items-center justify-between text-terminal-text-muted text-[11px] font-mono">
            <span>AI SCORE TRUNG BÌNH</span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-indigo-300">
              {avgAi != null ? avgAi.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-terminal-text-muted font-mono">/100</span>
          </div>
          <div className="text-[10px] font-mono">
            {avgAi != null ? (
              avgAi >= 70 ? (
                <span className="text-emerald-400 font-semibold">Tín hiệu Tích Cực</span>
              ) : avgAi >= 50 ? (
                <span className="text-amber-400 font-semibold">Tín hiệu Trung Tính</span>
              ) : (
                <span className="text-rose-400 font-semibold">Thận trọng rủi ro</span>
              )
            ) : (
              <span className="text-terminal-text-muted">Đang phân tích</span>
            )}
          </div>
        </div>

        {/* 4. Average Upside to Fair Value */}
        <div className="p-3 rounded-lg bg-terminal-surface border border-terminal-border space-y-1">
          <div className="flex items-center justify-between text-terminal-text-muted text-[11px] font-mono">
            <span>UPSIDE TIỀM NĂNG TB</span>
            <Target className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold font-mono ${
                avgUpside != null && avgUpside >= 0 ? 'text-emerald-400' : avgUpside != null ? 'text-rose-400' : 'text-terminal-text-muted'
              }`}
            >
              {avgUpside != null ? `${avgUpside >= 0 ? '+' : ''}${avgUpside.toFixed(1)}%` : '--'}
            </span>
          </div>
          <div className="text-[10px] text-terminal-text-muted font-mono">
            So với Định giá Fair Value
          </div>
        </div>

        {/* 5. Total Turnover Value */}
        <div className="p-3 rounded-lg bg-terminal-surface border border-terminal-border space-y-1">
          <div className="flex items-center justify-between text-terminal-text-muted text-[11px] font-mono">
            <span>TỔNG GIÁ TRỊ GD</span>
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-amber-300">
              {formatBillionVND(stats.totalTradingValue)}
            </span>
          </div>
          <div className="text-[10px] text-terminal-text-muted font-mono">
            Khối lượng: {formatVolume(stats.totalVolume)} CP
          </div>
        </div>

        {/* 6. Top Movers Insight */}
        <div className="p-3 rounded-lg bg-terminal-surface border border-terminal-border space-y-1">
          <div className="flex items-center justify-between text-terminal-text-muted text-[11px] font-mono">
            <span>MÃ BIẾN ĐỘNG MẠNH</span>
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xs font-mono space-y-0.5 pt-0.5">
            {stats.topGainer && (
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-bold">{stats.topGainer.symbol}</span>
                <span className="text-emerald-400 text-[11px]">{formatPercent(stats.topGainer.changePercent)}</span>
              </div>
            )}
            {stats.topLoser && (
              <div className="flex items-center justify-between">
                <span className="text-rose-400 font-bold">{stats.topLoser.symbol}</span>
                <span className="text-rose-400 text-[11px]">{formatPercent(stats.topLoser.changePercent)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
