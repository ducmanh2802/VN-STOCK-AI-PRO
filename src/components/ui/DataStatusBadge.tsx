import React from 'react';
import { Activity, Clock, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

export type DataFreshnessState =
  | 'LIVE'
  | 'STALE'
  | 'LOADING'
  | 'ERROR'
  | 'DATA_UNAVAILABLE'
  | 'UNAVAILABLE'
  | 'DEGRADED'
  | 'PARTIAL'
  | 'MOCK';

interface DataStatusBadgeProps {
  status: DataFreshnessState;
  source?: string;
  lastUpdated?: string | number | Date;
  onRefresh?: () => void;
  className?: string;
  compact?: boolean;
}

export const DataStatusBadge: React.FC<DataStatusBadgeProps> = ({
  status,
  source,
  lastUpdated,
  onRefresh,
  className = '',
  compact = false,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'LIVE':
        return {
          icon: Activity,
          text: 'LIVE',
          dotClass: 'bg-emerald-400 animate-pulse',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'STALE':
        return {
          icon: Clock,
          text: 'STALE',
          dotClass: 'bg-amber-400',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'DEGRADED':
      case 'PARTIAL':
        return {
          icon: Clock,
          text: status,
          dotClass: 'bg-amber-400 animate-pulse',
          badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'LOADING':
        return {
          icon: RefreshCw,
          text: 'SYNCING',
          dotClass: 'bg-indigo-400 animate-spin',
          badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        };
      case 'ERROR':
        return {
          icon: AlertTriangle,
          text: 'FEED ERROR',
          dotClass: 'bg-rose-400',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      case 'MOCK':
        return {
          icon: AlertTriangle,
          text: 'MOCK DATA',
          dotClass: 'bg-purple-400',
          badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        };
      case 'UNAVAILABLE':
      case 'DATA_UNAVAILABLE':
      default:
        return {
          icon: AlertCircle,
          text: 'UNAVAILABLE',
          dotClass: 'bg-slate-500',
          badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700/50',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const formattedTime = lastUpdated
    ? typeof lastUpdated === 'number'
      ? new Date(lastUpdated).toLocaleTimeString('vi-VN')
      : lastUpdated instanceof Date
      ? lastUpdated.toLocaleTimeString('vi-VN')
      : String(lastUpdated)
    : null;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium font-mono ${config.badgeClass} ${className}`}
        title={`${source ? `${source} • ` : ''}${config.text}${formattedTime ? ` • ${formattedTime}` : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
        <span>{config.text}</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-mono bg-[#111827] border-[#263244] text-slate-300 ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
        <span className="font-semibold text-slate-200">{config.text}</span>
      </div>

      {source && (
        <>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400 font-sans">{source}</span>
        </>
      )}

      {formattedTime && (
        <>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">{formattedTime}</span>
        </>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          className="ml-1 p-0.5 hover:text-indigo-400 transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
