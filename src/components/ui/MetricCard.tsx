import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { DataFreshnessState } from './DataStatusBadge';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number; // percentage
  changeValue?: string | number; // absolute change
  subValue?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: 'neutral' | 'success' | 'danger' | 'warning' | 'indigo';
  formatAsCurrency?: boolean;
  className?: string;
  status?: DataFreshnessState;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  change,
  changeValue,
  subValue,
  icon: Icon,
  badge,
  badgeVariant = 'indigo',
  className = '',
  status,
}) => {
  const isPositive = typeof change === 'number' && change > 0;
  const isNegative = typeof change === 'number' && change < 0;
  const isZero = typeof change === 'number' && change === 0;

  const badgeColors = {
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  };

  return (
    <div
      className={`relative bg-[#111827] hover:bg-[#151E2E] border border-[#263244] hover:border-[#334155] rounded-xl p-4 transition-all duration-200 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-slate-400 truncate tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {status && (
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status === 'LIVE'
                  ? 'bg-emerald-400 animate-pulse'
                  : status === 'STALE'
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
              }`}
            />
          )}
          {badge && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-medium border rounded ${badgeColors[badgeVariant]}`}
            >
              {badge}
            </span>
          )}
          {Icon && <Icon className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100 tracking-tight">
          {value}
        </span>

        {typeof change === 'number' && (
          <div
            className={`flex items-center gap-1 text-xs font-semibold font-mono ${
              isPositive
                ? 'text-emerald-400'
                : isNegative
                ? 'text-rose-400'
                : 'text-slate-400'
            }`}
          >
            {isPositive && <TrendingUp className="w-3.5 h-3.5" />}
            {isNegative && <TrendingDown className="w-3.5 h-3.5" />}
            {isZero && <Minus className="w-3.5 h-3.5" />}
            <span>
              {isPositive ? '+' : ''}
              {change.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {(subValue || changeValue) && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          {changeValue && (
            <span className="font-mono">
              {typeof changeValue === 'number' && changeValue > 0 ? '+' : ''}
              {changeValue}
            </span>
          )}
          {subValue && <span>{subValue}</span>}
        </div>
      )}
    </div>
  );
};
