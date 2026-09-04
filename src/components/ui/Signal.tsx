import React from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from './Badge';

export type SignalType =
  | 'BUY'
  | 'SELL'
  | 'HOLD'
  | 'UPTREND'
  | 'DOWNTREND'
  | 'SIDEWAY'
  | 'NEUTRAL';

export interface SignalProps extends React.HTMLAttributes<HTMLDivElement> {
  type: SignalType;
  score?: number; // 0 - 100
  confidence?: number | 'high' | 'medium' | 'low'; // 0 - 100 or rating
  label?: string;
  title?: string;
  description?: string;
  reasons?: string[];
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Signal: React.FC<SignalProps> = ({
  type,
  score,
  confidence: confidenceProp,
  label,
  title,
  description,
  reasons,
  compact = false,
  size = 'md',
  className,
  ...props
}) => {
  const confidence = typeof confidenceProp === 'string'
    ? confidenceProp === 'high' ? 88 : confidenceProp === 'medium' ? 65 : 40
    : confidenceProp;
  const signalConfig = React.useMemo(() => {
    switch (type) {
      case 'BUY':
      case 'UPTREND':
        return {
          label: type === 'BUY' ? 'MUA' : 'TÍCH CỰC (UPTREND)',
          badgeVariant: 'up' as const,
          icon: <ArrowUpRight className="w-4 h-4" />,
          colorClass: 'text-terminal-up',
          barColor: 'bg-terminal-up',
          borderColor: 'border-terminal-up/30',
          bgSubtle: 'bg-terminal-up/10',
        };
      case 'SELL':
      case 'DOWNTREND':
        return {
          label: type === 'SELL' ? 'BÁN' : 'TIÊU CỰC (DOWNTREND)',
          badgeVariant: 'down' as const,
          icon: <ArrowDownRight className="w-4 h-4" />,
          colorClass: 'text-terminal-down',
          barColor: 'bg-terminal-down',
          borderColor: 'border-terminal-down/30',
          bgSubtle: 'bg-terminal-down/10',
        };
      case 'HOLD':
      case 'SIDEWAY':
      case 'NEUTRAL':
      default:
        return {
          label: type === 'HOLD' ? 'NẮM GIỮ' : type === 'SIDEWAY' ? 'ĐI NGANG (SIDEWAY)' : 'TRUNG LẬP',
          badgeVariant: 'ref' as const,
          icon: <Activity className="w-4 h-4" />,
          colorClass: 'text-terminal-ref',
          barColor: 'bg-terminal-ref',
          borderColor: 'border-terminal-ref/30',
          bgSubtle: 'bg-terminal-ref/10',
        };
    }
  }, [type]);

  const displayLabel = label || signalConfig.label;

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-terminal-surface border border-terminal-border font-mono text-xs',
          className
        )}
        {...props}
      >
        <Badge variant={signalConfig.badgeVariant} size="xs" dot>
          {displayLabel}
        </Badge>
        {score !== undefined && (
          <span className="font-bold text-terminal-text-primary">
            {score}<span className="text-terminal-text-muted font-normal text-[10px]">/100</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg p-4 bg-terminal-surface border border-terminal-border space-y-3',
        className
      )}
      {...props}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'p-1.5 rounded-md border flex items-center justify-center shrink-0',
              signalConfig.bgSubtle,
              signalConfig.borderColor,
              signalConfig.colorClass
            )}
          >
            {signalConfig.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-terminal-text-primary">
                {title || 'Tín Hiệu Định Lượng'}
              </span>
              <Badge variant={signalConfig.badgeVariant} size="xs" dot>
                {displayLabel}
              </Badge>
            </div>
            {description && (
              <p className="text-[11px] text-terminal-text-muted mt-0.5">{description}</p>
            )}
          </div>
        </div>

        {/* Score Display */}
        {score !== undefined && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase font-mono text-terminal-text-muted">Trend Score</div>
            <div className={cn('text-lg font-mono font-bold', signalConfig.colorClass)}>
              {score}
              <span className="text-xs text-terminal-text-muted font-normal">/100</span>
            </div>
          </div>
        )}
      </div>

      {/* Progress / Strength Bar */}
      {score !== undefined && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-terminal-text-muted">
            <span>Sức Mạnh Tín Hiệu</span>
            <span>{score >= 70 ? 'Mạnh' : score >= 45 ? 'Trung bình' : 'Yếu'}</span>
          </div>
          <div className="h-1.5 w-full bg-terminal-surface-subtle rounded-full overflow-hidden border border-terminal-border-subtle">
            <div
              className={cn('h-full transition-all duration-500 rounded-full', signalConfig.barColor)}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>
      )}

      {/* Confidence Pill */}
      {confidence !== undefined && (
        <div className="flex items-center gap-1.5 text-xs text-terminal-text-secondary pt-1 border-t border-terminal-border-subtle">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px]">Độ tin cậy mô hình:</span>
          <span className="font-mono font-semibold text-terminal-text-primary">{confidence}%</span>
        </div>
      )}

      {/* Reasons breakdown */}
      {reasons && reasons.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-terminal-border-subtle">
          <div className="text-[10px] font-mono uppercase text-terminal-text-muted">
            Căn cứ định lượng:
          </div>
          <ul className="space-y-1 text-xs text-terminal-text-secondary">
            {reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                <span className="text-terminal-text-muted shrink-0">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
