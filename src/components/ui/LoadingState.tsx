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
        'animate-pulse bg-terminal-surface-hover',
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
  count = 4,
  lines,
  className,
  ...props
}) => {
  const actualCount = count || lines || 4;
  return (
    <div
      className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3', className)}
      {...props}
    >
      {Array.from({ length: actualCount }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-lg bg-terminal-surface border border-terminal-border space-y-3 animate-pulse"
        >
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-7 w-28" />
          <div className="flex justify-between pt-2 border-t border-terminal-border-subtle">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
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
      className={cn('rounded-lg border border-terminal-border bg-terminal-surface overflow-hidden', className)}
      {...props}
    >
      <div className="p-3 border-b border-terminal-border bg-terminal-surface-subtle flex justify-between">
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
  message = 'Đang tải dữ liệu...',
  variant = 'default',
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
      {...props}
    >
      <div className="w-10 h-10 rounded-lg bg-terminal-accent/15 border border-terminal-accent/30 flex items-center justify-center text-terminal-accent mb-3 shadow-sm">
        <RefreshCw className="w-5 h-5 animate-spin" />
      </div>
      <p className="font-mono text-xs text-terminal-text-secondary max-w-sm">{message}</p>
    </div>
  );
};

