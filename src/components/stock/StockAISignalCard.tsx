import React from 'react';
import { StockAISignalData } from '../../types/stockDetail';
import { formatVND } from '../../utils/formatters';
import { Sparkles, TrendingUp, ShieldAlert, Target, AlertOctagon, CheckCircle2, Clock } from 'lucide-react';

export interface StockAISignalCardProps {
  signal: StockAISignalData;
  currentPrice: number;
}

export const StockAISignalCard: React.FC<StockAISignalCardProps> = ({ signal, currentPrice }) => {
  const isBuy = signal.signalType === 'BUY' || signal.signalType === 'ACCUMULATE';
  const isSell = signal.signalType === 'SELL';

  const badgeColorClass =
    signal.signalType === 'BUY'
      ? 'bg-terminal-up/15 text-terminal-up border-terminal-up/30'
      : signal.signalType === 'ACCUMULATE'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : signal.signalType === 'SELL'
      ? 'bg-terminal-down/15 text-terminal-down border-terminal-down/30'
      : 'bg-terminal-ref/15 text-terminal-ref border-terminal-ref/30';

  return (
    <div
      id="stock-ai-signal-card"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-accent/30 shadow-md relative overflow-hidden"
    >
      {/* Decorative ambient subtle glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-terminal-accent/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-terminal-border/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
                AI Khuyến Nghị Định Lượng
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-terminal-surface-subtle text-terminal-text-muted border border-terminal-border">
                {signal.updatedAt}
              </span>
            </div>
            <div className="text-[11px] text-terminal-text-muted flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Khung thời gian khuyến nghị: <strong className="text-terminal-text-secondary">{signal.timeframe}</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase border ${badgeColorClass}`}>
            {signal.signalLabel}
          </div>
        </div>
      </div>

      {/* Main Signal Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3">
        {/* 1. AI Score */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border">
          <div className="text-[11px] text-terminal-text-muted mb-1">AI Score Tổng hợp</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-terminal-accent">
              {signal.aiScore}
            </span>
            <span className="text-xs text-terminal-text-muted">/100</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-terminal-surface-subtle mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-terminal-accent transition-all duration-500"
              style={{ width: `${signal.aiScore}%` }}
            />
          </div>
        </div>

        {/* 2. Model Confidence */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border">
          <div className="text-[11px] text-terminal-text-muted mb-1">Độ tin cậy mô hình</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-terminal-up">
              {signal.confidence}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-terminal-surface-subtle mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-terminal-up transition-all duration-500"
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
        </div>

        {/* 3. Target Price & Upside */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border">
          <div className="text-[11px] text-terminal-text-muted mb-1">Giá mục tiêu (TP)</div>
          <div className="text-lg font-bold font-mono text-terminal-up">
            {formatVND(signal.targetPrice)}
          </div>
          <div className="text-xs font-mono font-medium text-terminal-up mt-0.5">
            +{signal.upsidePercent.toFixed(1)}% Upside
          </div>
        </div>

        {/* 4. Stop Loss & R:R */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border">
          <div className="text-[11px] text-terminal-text-muted mb-1">Ngưỡng cắt lỗ (SL)</div>
          <div className="text-lg font-bold font-mono text-terminal-down">
            {formatVND(signal.stopLossPrice)}
          </div>
          <div className="text-xs font-mono font-medium text-terminal-text-secondary mt-0.5">
            Tỷ lệ R:R: <strong className="text-terminal-accent">{signal.riskRewardRatio}</strong>
          </div>
        </div>
      </div>

      {/* Catalysts & Risk Warnings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        {/* Catalysts */}
        <div className="p-3 rounded-lg bg-terminal-bg/80 border border-terminal-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-terminal-up uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Động lực tăng giá (Key Catalysts)
          </div>
          <ul className="space-y-1.5 text-xs text-terminal-text-secondary">
            {signal.catalysts.map((cat, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-terminal-up shrink-0 mt-0.5">•</span>
                <span>{cat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Risk Warnings */}
        <div className="p-3 rounded-lg bg-terminal-bg/80 border border-terminal-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <ShieldAlert className="w-3.5 h-3.5" />
            Cảnh báo rủi ro (Risk Factors)
          </div>
          <ul className="space-y-1.5 text-xs text-terminal-text-secondary">
            {signal.riskWarnings.map((risk, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
