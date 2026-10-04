import React from 'react';
import type { DataFreshnessStatus } from '../../../types/stock.ts';

export interface MacroSourceBadgeProps {
  source: string;
  timestamp?: string;
  freshness?: DataFreshnessStatus;
  className?: string;
}

export const MacroSourceBadge: React.FC<MacroSourceBadgeProps> = ({
  source,
  timestamp,
  freshness = 'CURRENT',
  className = '',
}) => {
  const isCurrent = freshness === 'CURRENT';
  const isStale = freshness === 'STALE';
  const isUnavailable = freshness === 'UNAVAILABLE' || freshness === 'INVALID';

  const dotColor = isCurrent
    ? 'bg-emerald-400'
    : isStale
    ? 'bg-amber-400'
    : 'bg-slate-500';

  const statusLabel = isCurrent
    ? 'LIVE'
    : isStale
    ? 'STALE'
    : 'N/A';

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-400 ${className}`}
      title={`Nguồn: ${source}${timestamp ? ` | Cập nhật: ${timestamp}` : ''}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shrink-0`} aria-hidden="true" />
      <span className="font-semibold text-slate-300">{statusLabel}</span>
      <span className="text-slate-600">·</span>
      <span className="truncate max-w-[140px] text-slate-400">{source}</span>
    </div>
  );
};
