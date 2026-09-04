import React from 'react';
import { SupportResistanceLevels } from '../../types/stockDetail';
import { formatVND } from '../../utils/formatters';
import { Target, Shield, ArrowUp, ArrowDown, Activity } from 'lucide-react';

export interface StockSupportResistanceProps {
  levels: SupportResistanceLevels;
  currentPrice: number;
}

export const StockSupportResistance: React.FC<StockSupportResistanceProps> = ({
  levels,
  currentPrice,
}) => {
  return (
    <div
      id="stock-support-resistance"
      className="p-4 rounded-xl bg-terminal-surface border border-terminal-border shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-terminal-border/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-terminal-accent/15 border border-terminal-accent/30 text-terminal-accent">
            <Target className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase font-mono tracking-wider text-terminal-text-primary">
            Ngưỡng Hỗ Trợ & Kháng Cự (Support & Resistance)
          </h3>
        </div>
        <span className="text-[11px] font-mono text-terminal-text-muted">
          Điểm Pivot & Cản Động MA
        </span>
      </div>

      {/* Nearest Thresholds Callout */}
      <div className="grid grid-cols-2 gap-3">
        {/* Nearest Support */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-up/30 space-y-1">
          <div className="text-[11px] text-terminal-text-muted flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-terminal-up" />
            Hỗ trợ gần nhất (S1)
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-lg font-bold text-terminal-up">
              {formatVND(levels.nearestSupport)}
            </span>
            <span className="text-xs text-terminal-text-muted">
              Cách: -{levels.supportDistancePercent}%
            </span>
          </div>
        </div>

        {/* Nearest Resistance */}
        <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-down/30 space-y-1">
          <div className="text-[11px] text-terminal-text-muted flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-terminal-down" />
            Kháng cự gần nhất (R1)
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-lg font-bold text-terminal-down">
              {formatVND(levels.nearestResistance)}
            </span>
            <span className="text-xs text-terminal-text-muted">
              Cách: +{levels.resistanceDistancePercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Vertical Price Ladder */}
      <div className="p-3 rounded-lg bg-terminal-bg border border-terminal-border/80 space-y-2 text-xs font-mono">
        <div className="text-[11px] text-terminal-text-muted pb-1 border-b border-terminal-border/50">
          Thang đo mức giá kỹ thuật then chốt (Price Ladder):
        </div>

        {/* Resistance Levels */}
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-down/5 text-terminal-down">
          <span>Kháng cự R3 (Mục tiêu cực đại):</span>
          <strong className="font-bold">{formatVND(levels.r3)}</strong>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-down/5 text-terminal-down">
          <span>Kháng cự R2 (Cản mạnh):</span>
          <strong className="font-bold">{formatVND(levels.r2)}</strong>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-down/10 text-terminal-down border-l-2 border-terminal-down">
          <span>Kháng cự R1 (Ngắn hạn):</span>
          <strong className="font-bold">{formatVND(levels.r1)}</strong>
        </div>

        {/* CURRENT PRICE HIGHLIGHT */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-terminal-accent/15 border border-terminal-accent text-terminal-text-primary my-1 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-terminal-accent animate-ping" />
            <span className="font-bold uppercase tracking-wider text-terminal-accent text-[11px]">
              THỊ GIÁ HIỆN TẠI
            </span>
          </div>
          <strong className="text-base font-extrabold text-terminal-text-primary">
            {formatVND(currentPrice)}
          </strong>
        </div>

        {/* Pivot Point */}
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-ref/10 text-terminal-ref border-l-2 border-terminal-ref">
          <span>Điểm xoay Pivot (P):</span>
          <strong className="font-bold">{formatVND(levels.pivot)}</strong>
        </div>

        {/* Support Levels */}
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-up/10 text-terminal-up border-l-2 border-terminal-up">
          <span>Hỗ trợ S1 (Ngắn hạn):</span>
          <strong className="font-bold">{formatVND(levels.s1)}</strong>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-up/5 text-terminal-up">
          <span>Hỗ trợ S2 (Mạnh):</span>
          <strong className="font-bold">{formatVND(levels.s2)}</strong>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-terminal-up/5 text-terminal-up">
          <span>Hỗ trợ S3 (Cực đại):</span>
          <strong className="font-bold">{formatVND(levels.s3)}</strong>
        </div>
      </div>

      {/* Dynamic Moving Average Support/Resistance */}
      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80 text-center">
          <div className="text-[10px] text-terminal-text-muted">Cản động MA20</div>
          <div className="font-bold text-amber-400 mt-0.5">{formatVND(levels.ma20Level)}</div>
        </div>
        <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80 text-center">
          <div className="text-[10px] text-terminal-text-muted">Hỗ trợ MA50</div>
          <div className="font-bold text-blue-400 mt-0.5">{formatVND(levels.ma50Level)}</div>
        </div>
        <div className="p-2 rounded bg-terminal-bg border border-terminal-border/80 text-center">
          <div className="text-[10px] text-terminal-text-muted">Hỗ trợ MA200</div>
          <div className="font-bold text-purple-400 mt-0.5">{formatVND(levels.ma200Level)}</div>
        </div>
      </div>
    </div>
  );
};
