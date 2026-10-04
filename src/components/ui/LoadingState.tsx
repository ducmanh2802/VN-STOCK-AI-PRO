import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  className,
  ...props
}) => {
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2.5 text-terminal-text-muted', className)}
      {...props}
    >
      <RefreshCw className={cn('animate-spin text-blue-400', iconSizes[size])} />
      {label && <span className="font-mono text-xs text-terminal-text-secondary">{label}</span>}
    </div>
  );
};

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rectangular' | 'circular' | 'text';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  ...props
}) => {
  return (
    <div
      className={cn(
        'animate-pulse bg-terminal-surface-high/70',
        variant === 'rectangular' && 'rounded-md',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'h-3 rounded',
        className
      )}
      {...props}
    />
  );
};

export interface CardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number;
  lines?: number;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  className,
  ...props
}) => {
  // This primitive renders a SINGLE placeholder tile. Callers place it inside
  // their own grid; previously it rendered its own 4-column grid, so nesting
  // it in a grid cell produced oversized empty blocks.
  return (
    <div
      className={cn(
        'animate-pulse p-2.5 rounded-sm bg-terminal-surface border border-terminal-border',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-16 rounded-sm bg-terminal-surface-elevated" />
        <div className="h-3 w-8 rounded-sm bg-terminal-surface-elevated" />
      </div>
      <div className="mt-2 h-4 w-24 rounded-sm bg-terminal-surface-elevated" />
    </div>
  );
};

export interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  cols?: number;
  columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  cols = 6,
  columns,
  className,
  ...props
}) => {
  const actualCols = columns || cols || 6;
  return (
    <div
      className={cn('rounded-sm border border-terminal-border bg-terminal-surface overflow-hidden', className)}
      {...props}
    >
      <div className="p-2.5 border-b border-terminal-border bg-terminal-surface-subtle flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="p-3 space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 py-2 border-b border-terminal-border-subtle last:border-none animate-pulse">
            {Array.from({ length: actualCols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn('h-4', c === 0 ? 'w-24' : 'flex-1')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  variant?: 'default' | 'terminal' | 'skeleton';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Đang tải dữ liệu…',
  variant = 'default',
  className,
  ...props
}) => {
  return (
    <div
      className={cn('terminal-state w-full min-w-0', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      <span className="terminal-state-code">Loading</span>
      <p className="terminal-state-detail break-words">{message}</p>
    </div>
  );
};

