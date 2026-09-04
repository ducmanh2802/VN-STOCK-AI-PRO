import React from 'react';
import { IndicatorSnapshot } from '../../lib/indicators/types';
import { formatVND, formatVolume } from '../../utils/formatters';
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Zap,
} from 'lucide-react';

export interface StockTechnicalIndicatorsProps {
  snapshot: IndicatorSnapshot | null;
  currentPrice: number;
}

export const StockTechnicalIndicators: React.FC<StockTechnicalIndicatorsProps> = ({
  snapshot,
  currentPrice,
}) => {
  if (!snapshot) {
    return (
      <div className="p-4 rounded-xl bg-terminal-surface border border-terminal-border text-center text-xs text-terminal-text-muted font-mono">
        Đang đồng bộ dữ liệu chỉ báo kỹ thuật...
      </div>
    );
  }

  const { rsi, macd, sma20, sma50, sma200, bollinger, volume } = snapshot;

  return (
    <div
      id="stock-technical-indicators"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Hệ Thống Chỉ Báo Kỹ Thuật (Technical Indicators)
          </h3>
        </div>
        <span className="text-[11px] font-mono text-terminal-text-muted">
          Thuật toán định lượng tự động
        </span>
      </div>

      {/* Grid of indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 1. RSI (14) */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-amber-400">RSI(14)</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                rsi.status === 'OVERBOUGHT'
                  ? 'bg-terminal-down/15 text-terminal-down border border-terminal-down/30'
                  : rsi.status === 'OVERSOLD'
                  ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30'
                  : rsi.status === 'BULLISH'
                  ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30'
                  : 'bg-terminal-ref/15 text-terminal-ref border border-terminal-ref/30'
              }`}
            >
              {rsi.status}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-terminal-text-primary">
              {rsi.value}
            </span>
            <span className="text-xs text-terminal-text-muted font-mono">/ 100</span>
          </div>
          <div className="text-[11px] text-terminal-text-secondary leading-tight">
            {rsi.label}
          </div>
        </div>

        {/* 2. MACD (12, 26, 9) */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-sky-400">MACD (12, 26, 9)</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                macd.trend === 'BULLISH' || macd.trend === 'BULLISH_CROSS'
                  ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30'
                  : 'bg-terminal-down/15 text-terminal-down border border-terminal-down/30'
              }`}
            >
              {macd.trend === 'BULLISH_CROSS' ? 'CROSS UP' : macd.trend}
            </span>
          </div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-sm text-terminal-text-muted">Hist:</span>
            <span
              className={`text-lg font-bold ${
                macd.histogram >= 0 ? 'text-terminal-up' : 'text-terminal-down'
              }`}
            >
              {macd.histogram > 0 ? `+${macd.histogram}` : macd.histogram}
            </span>
            <span className="text-[11px] text-terminal-text-muted ml-auto">
              Line: {macd.macd}
            </span>
          </div>
          <div className="text-[11px] text-terminal-text-secondary leading-tight">
            {macd.label}
          </div>
        </div>

        {/* 3. Bollinger Bands */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-cyan-400">Bollinger Bands (20, 2)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
              {bollinger.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
            <div>
              <span className="text-terminal-text-muted block">Dưới:</span>
              <span className="text-terminal-text-secondary">{formatVND(bollinger.lower)}</span>
            </div>
            <div>
              <span className="text-terminal-text-muted block">Giữa:</span>
              <span className="text-cyan-400 font-semibold">{formatVND(bollinger.middle)}</span>
            </div>
            <div>
              <span className="text-terminal-text-muted block">Trên:</span>
              <span className="text-terminal-text-secondary">{formatVND(bollinger.upper)}</span>
            </div>
          </div>
          <div className="text-[11px] text-terminal-text-secondary leading-tight">
            {bollinger.label} (Độ rộng: {bollinger.bandwidth}%)
          </div>
        </div>

        {/* 4. MA20 (Ngắn hạn) */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-amber-400">MA20 (Ngắn hạn)</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                sma20.priceRelation === 'ABOVE'
                  ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30'
                  : 'bg-terminal-down/15 text-terminal-down border border-terminal-down/30'
              }`}
            >
              {sma20.priceRelation === 'ABOVE' ? 'TRÊN MA20' : 'DƯỚI MA20'}
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-lg font-bold text-terminal-text-primary">
              {formatVND(sma20.value)}
            </span>
            <span
              className={`text-xs font-semibold ${
                sma20.diffPercent >= 0 ? 'text-terminal-up' : 'text-terminal-down'
              }`}
            >
              {sma20.diffPercent >= 0 ? `+${sma20.diffPercent}%` : `${sma20.diffPercent}%`}
            </span>
          </div>
          <div className="text-[11px] text-terminal-text-secondary">
            {sma20.priceRelation === 'ABOVE'
              ? 'Thị giá nằm trên đường trung bình 20 ngày, xu hướng tăng ngắn hạn duy trì'
              : 'Thị giá nằm dưới MA20, kháng cự kỹ thuật ngắn hạn'}
          </div>
        </div>

        {/* 5. MA50 & MA200 (Trung & Dài hạn) */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-purple-400">MA50 & MA200</span>
            {sma200.goldenCross && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                GOLDEN CROSS
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-terminal-text-muted block text-[10px]">MA50 (Trung hạn):</span>
              <span className="font-bold text-blue-400">{formatVND(sma50.value)}</span>
              <span className="text-[10px] text-terminal-text-muted block">({sma50.diffPercent}%)</span>
            </div>
            <div>
              <span className="text-terminal-text-muted block text-[10px]">MA200 (Dài hạn):</span>
              <span className="font-bold text-purple-400">{formatVND(sma200.value)}</span>
              <span className="text-[10px] text-terminal-text-muted block">({sma200.diffPercent}%)</span>
            </div>
          </div>
          <div className="text-[11px] text-terminal-text-secondary">
            {sma200.goldenCross
              ? 'MA50 nằm trên MA200 - Trạng thái xu hướng Uptrend dài hạn lý tưởng'
              : 'Đang theo dõi kiểm định ngưỡng hỗ trợ dài hạn MA200'}
          </div>
        </div>

        {/* 6. Volume vs MA20 */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-emerald-400">Khối Lượng vs MA20</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                volume.trend === 'SURGE'
                  ? 'bg-terminal-up/15 text-terminal-up border border-terminal-up/30'
                  : volume.trend === 'DRY'
                  ? 'bg-terminal-down/15 text-terminal-down border border-terminal-down/30'
                  : 'bg-terminal-ref/15 text-terminal-ref border border-terminal-ref/30'
              }`}
            >
              {volume.trend === 'SURGE' ? 'BÙNG NỔ VOL' : volume.trend === 'DRY' ? 'CẠN KIỆT' : 'BÌNH THƯỜNG'}
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-lg font-bold text-terminal-text-primary">
              {volume.ratioToMA}x
            </span>
            <span className="text-xs text-terminal-text-muted">
              TB: {formatVolume(volume.ma20)}
            </span>
          </div>
          <div className="text-[11px] text-terminal-text-secondary">
            {volume.ratioToMA >= 1.3
              ? 'Thanh khoản bùng nổ vượt trội so với trung bình 20 phiên, dòng tiền tham gia quyết liệt'
              : 'Thanh khoản duy trì ở mức cân bằng tích lũy'}
          </div>
        </div>
      </div>
    </div>
  );
};
