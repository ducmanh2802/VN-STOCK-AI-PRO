import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatNumber, formatPercent, formatVND, formatBillionVND, formatVolume } from '../../utils/formatters';

export interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  value: string | number;
  change?: number;
  changePercent?: number;
  trend?: 'up' | 'down' | 'ref' | 'neutral';
  format?: 'price' | 'percent' | 'volume' | 'currency' | 'billion' | 'ratio' | 'raw';
  size?: 'sm' | 'md' | 'lg';
  sublabel?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  sparkline?: number[];
  sparklineData?: number[];
}

export const Metric: React.FC<MetricProps> = ({
  label,
  value,
  change,
  changePercent,
  trend: explicitTrend,
  format = 'raw',
  size = 'md',
  sublabel,
  badge,
  icon,
  sparkline: sparklineProp,
  sparklineData,
  className,
  ...props
}) => {
  const sparkline = sparklineProp || sparklineData;
  // Infer trend if not explicitly passed
  let trend: 'up' | 'down' | 'ref' | 'neutral' = explicitTrend || 'neutral';
  if (!explicitTrend) {
    if (changePercent !== undefined) {
      if (changePercent > 0) trend = 'up';
      else if (changePercent < 0) trend = 'down';
      else trend = 'ref';
    } else if (change !== undefined) {
      if (change > 0) trend = 'up';
      else if (change < 0) trend = 'down';
      else trend = 'ref';
    }
  }

  // Format value
  const formattedValue = React.useMemo(() => {
    if (typeof value === 'string') return value;
    switch (format) {
      case 'price':
        return formatNumber(value);
      case 'currency':
        return formatVND(value);
      case 'billion':
        return formatBillionVND(value);
      case 'volume':
        return formatVolume(value);
      case 'percent':
        return `${value > 0 ? '+' : ''}${formatNumber(value, 2)}%`;
      case 'ratio':
        return `${formatNumber(value, 1)}x`;
      case 'raw':
      default:
        return typeof value === 'number' ? formatNumber(value) : value;
    }
  }, [value, format]);

  // Direction color
  const trendColorClass = {
    up: 'text-terminal-up',
    down: 'text-terminal-down',
    ref: 'text-terminal-ref',
    neutral: 'text-terminal-text-primary',
  }[trend];

  const trendBgClass = {
    up: 'bg-terminal-up/10 text-terminal-up border-terminal-up/25',
    down: 'bg-terminal-down/10 text-terminal-down border-terminal-down/25',
    ref: 'bg-terminal-ref/10 text-terminal-ref border-terminal-ref/25',
    neutral: 'bg-terminal-surface-hover text-terminal-text-muted border-terminal-border',
  }[trend];

  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-lg p-3 bg-terminal-surface border border-terminal-border transition-colors',
        className
      )}
      {...props}
    >
      {/* Label Row */}
      {(label || icon || badge) && (
        <div className="flex items-center justify-between gap-2 text-xs text-terminal-text-muted">
          <div className="flex items-center gap-1.5 truncate">
            {icon && <span className="shrink-0 text-terminal-text-secondary">{icon}</span>}
            {label && <span className="truncate font-sans font-medium">{label}</span>}
          </div>
          {badge}
        </div>
      )}

      {/* Main Quantitative Value */}
      <div className="flex items-baseline justify-between gap-2 mt-2">
        <div
          className={cn(
            'font-mono font-bold tracking-tight',
            size === 'sm' && 'text-sm sm:text-base',
            size === 'md' && 'text-lg sm:text-xl',
            size === 'lg' && 'text-2xl sm:text-3xl',
            trendColorClass
          )}
        >
          {formattedValue}
        </div>

        {/* Change Indicator Pill */}
        {(changePercent !== undefined || change !== undefined) && (
          <div
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold border',
              trendBgClass
            )}
          >
            {trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'ref' && <Minus className="w-3 h-3" />}
            <span>
              {change !== undefined ? `${change > 0 ? '+' : ''}${formatNumber(change, 2)}` : ''}
              {change !== undefined && changePercent !== undefined ? ' ' : ''}
              {changePercent !== undefined ? `(${formatPercent(changePercent)})` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Sublabel or Mini Sparkline */}
      {(sublabel || (sparkline && sparkline.length > 0)) && (
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-terminal-border-subtle text-[11px] text-terminal-text-muted">
          {sublabel && <span className="truncate">{sublabel}</span>}
          {sparkline && sparkline.length > 1 && (
            <div className="w-16 h-4 shrink-0">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 16">
                {(() => {
                  const min = Math.min(...sparkline);
                  const max = Math.max(...sparkline);
                  const range = max - min || 1;
                  const points = sparkline
                    .map((val, idx) => {
                      const x = (idx / (sparkline.length - 1)) * 64;
                      const y = 16 - ((val - min) / range) * 14 - 1;
                      return `${x},${y}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      fill="none"
                      stroke={trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#EAB308'}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />
                  );
                })()}
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
