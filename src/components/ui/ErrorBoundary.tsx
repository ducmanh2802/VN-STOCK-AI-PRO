import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message?: string;
  error?: Error | null;
  onRetry?: () => void;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Đã xảy ra sự cố kỹ thuật',
  message = 'Hệ thống không thể tải hoặc xử lý dữ liệu. Vui lòng thử lại.',
  error,
  onRetry,
  compact = false,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-lg border border-terminal-down/30 bg-terminal-down/10 text-terminal-text-primary',
        compact ? 'p-3 flex items-center justify-between gap-3' : 'p-6 sm:p-8 flex flex-col items-center text-center',
        className
      )}
      {...props}
    >
      <div className={cn('flex items-center gap-3', !compact && 'flex-col')}>
        <div className="w-10 h-10 rounded-lg bg-terminal-down/20 border border-terminal-down/40 flex items-center justify-center text-terminal-down shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-terminal-down mb-1">{title}</h4>
          <p className="text-[11px] text-terminal-text-muted leading-relaxed max-w-md">{message}</p>
          {error && (
            <div className="mt-2 p-2 rounded bg-terminal-surface border border-terminal-border text-left font-mono text-[10px] text-terminal-down overflow-x-auto">
              <code>{error.message || String(error)}</code>
            </div>
          )}
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terminal-surface hover:bg-terminal-surface-hover border border-terminal-border text-xs font-mono font-medium text-terminal-text-primary transition-colors cursor-pointer shrink-0',
            !compact && 'mt-4'
          )}
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          <span>Thử lại</span>
        </button>
      )}
    </div>
  );
};

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VN STOCK AI Global Error Boundary Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };


  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-terminal-bg text-terminal-text-primary flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-terminal-border bg-terminal-surface p-6 sm:p-8 space-y-5 shadow-lg">
            <div className="flex items-center gap-3 pb-4 border-b border-terminal-border">
              <div className="w-10 h-10 rounded-lg bg-terminal-down/15 border border-terminal-down/30 flex items-center justify-center text-terminal-down">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono tracking-tight text-white">
                  VN STOCK AI · ERROR RECOVERY
                </h2>
                <p className="text-xs text-terminal-text-muted mt-0.5">
                  Đã phát hiện ngoại lệ chưa xử lý tại giao diện
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-terminal-surface-subtle border border-terminal-border font-mono text-xs space-y-2">
              <div className="text-terminal-down font-bold">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown render exception'}
              </div>
              {this.state.error?.stack && (
                <pre className="text-[10px] text-terminal-text-muted max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded-md bg-terminal-surface-hover border border-terminal-border text-xs font-mono text-terminal-text-secondary hover:text-white transition-colors cursor-pointer"
              >
                Tải lại trang (F5)
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-terminal-accent hover:bg-terminal-accent-hover text-white text-xs font-mono font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Khôi phục phiên làm việc</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
