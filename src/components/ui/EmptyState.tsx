import React from 'react';
import { Inbox, Search, Bookmark } from 'lucide-react';
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
  title = 'Không có dữ liệu',
  description,
  icon,
  type,
  actionLabel,
  onAction,
  compact = false,
  className,
  ...props
}) => {
  const resolvedIcon =
    icon ||
    (type === 'search' ? (
      <Search className="w-5 h-5 text-terminal-text-muted" />
    ) : type === 'watchlist' ? (
      <Bookmark className="w-5 h-5 text-terminal-text-muted" />
    ) : (
      <Inbox className="w-5 h-5" />
    ));
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center select-none',
        compact ? 'py-6 px-4' : 'py-12 px-6',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-terminal-surface-subtle border border-terminal-border text-terminal-text-muted mb-3">
        {resolvedIcon}
      </div>
      <h4 className="text-xs font-semibold text-terminal-text-primary mb-1">{title}</h4>
      {description && (
        <p className="text-[11px] text-terminal-text-muted max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terminal-accent hover:bg-terminal-accent-hover text-white text-xs font-mono font-medium transition-colors cursor-pointer shadow-xs"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
