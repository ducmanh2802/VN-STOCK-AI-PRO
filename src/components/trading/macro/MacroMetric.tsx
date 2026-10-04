import React from 'react';
import type { MacroMetricRecord } from '../../../lib/analysis/macro/types.ts';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export interface MacroMetricProps {
  metric: MacroMetricRecord;
  onClick?: () => void;
  isSelected?: boolean;
}

export const MacroMetric: React.FC<MacroMetricProps> = ({
  metric,
  onClick,
  isSelected = false,
}) => {
  const { code, nameVi, value, change, changePercent, unit, source, freshness } = metric;

  const isPositive = change !== null && change > 0;
  const isNegative = change !== null && change < 0;
  const isZero = change === 0;

  const valueDisplay = value !== null ? (
    unit === 'VND'
      ? Number(value).toLocaleString('vi-VN')
      : unit === 'Points' || unit === 'Index Points' || unit === 'Thousands'
      ? Number(value).toFixed(1)
      : unit === '%' || unit === '% YoY' || unit === '% YTD'
      ? `${Number(value).toFixed(2)}%`
      : Number(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  ) : '--';

  const changeDisplay = change !== null && changePercent !== null ? (
    `${isPositive ? '+' : ''}${Number(changePercent).toFixed(2)}%`
  ) : null;

  const changeColor = isPositive
    ? 'text-emerald-400'
    : isNegative
    ? 'text-rose-400'
    : 'text-slate-400';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative flex flex-col justify-between p-2.5 rounded border transition-all duration-150 ${
        isSelected
          ? 'bg-slate-800/90 border-cyan-500/70 shadow-sm'
          : 'bg-slate-900/80 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700'
      } ${onClick ? 'cursor-pointer' : ''}`}
      title={`${metric.name} (${code}) | Nguồn: ${source}`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[11px] font-medium text-slate-300 truncate max-w-[120px]" title={nameVi}>
          {nameVi}
        </span>
        <span className="text-[9px] font-mono uppercase text-slate-500 shrink-0">
          {code.replace('MACRO_', '')}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm sm:text-base font-semibold font-mono tracking-tight text-white tabular-nums">
          {valueDisplay}
          {unit === 'USD/bbl' ? <span className="text-[10px] font-normal text-slate-400 ml-1">USD</span> : null}
          {unit === 'USD/oz' ? <span className="text-[10px] font-normal text-slate-400 ml-1">USD</span> : null}
        </span>

        {changeDisplay && (
          <span className={`inline-flex items-center text-[11px] font-mono font-medium ${changeColor} tabular-nums`}>
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3 mr-0.5 shrink-0" />
            ) : isNegative ? (
              <ArrowDownRight className="w-3 h-3 mr-0.5 shrink-0" />
            ) : (
              <Minus className="w-3 h-3 mr-0.5 shrink-0" />
            )}
            {changeDisplay}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-slate-500">
        <span className="truncate max-w-[90px]">{source}</span>
        <span className={freshness === 'CURRENT' ? 'text-emerald-500/80' : 'text-amber-500/80'}>
          ● {freshness === 'CURRENT' ? 'LIVE' : 'STALE'}
        </span>
      </div>
    </div>
  );
};
