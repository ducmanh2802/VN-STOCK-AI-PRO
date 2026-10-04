import React from 'react';
import { cn } from '../../lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  type?: 'search' | 'watchlist' | 'generic' | string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data',
  description,
  icon: _icon,
  type: _type,
  actionLabel,
  onAction,
  compact = false,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center select-none w-full min-w-0',
        compact ? 'py-4 px-3' : 'py-8 px-5',
        className
      )}
      {...props}
    >
      <span className="terminal-state-code mb-1.5">
        {title}
      </span>
      {description && (
        <p className="terminal-state-detail">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-terminal-accent hover:bg-terminal-accent-hover text-white text-[11px] font-mono font-medium transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
